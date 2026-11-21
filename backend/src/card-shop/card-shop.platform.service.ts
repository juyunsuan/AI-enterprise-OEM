import {
  type CardShopAdminSettings,
  type CardShopAdminSettingsBody,
  type MiniTemplateInfo,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { IdentityService } from '../identity/identity.service';
import type { PrismaService } from '../prisma/prisma.service';
import {
  readTemplateMeta,
  templateDirFrom,
} from '../private-mini/package-builder';
import { clip, intIn, jsonList, mergeJson } from './card-shop.shared';

const SETTINGS_KEY = 'card_shop_platform_settings';
const TEMPLATE_CACHE_MS = 60_000;
const TEMPLATE_DIR_ENV = 'MINIPROGRAM_CARD_SHOP_DIR';
const TEMPLATE_DIR_FALLBACK = 'card-shop-miniprogram';

type StoredSettings = {
  enabled: boolean;
  goodsQuota: number;
  cardQuota: number;
  importMaxLines: number;
  importMaxBytes: number;
  payAllowed: boolean;
  keywordFilter: string[];
  updatedBy: string;
  updatedAt: string;
};

const baseSettings = (): StoredSettings => ({
  enabled: true,
  goodsQuota: 2000,
  cardQuota: 200_000,
  importMaxLines: 50_000,
  importMaxBytes: 2 * 1024 * 1024,
  payAllowed: true,
  keywordFilter: [],
  updatedBy: '',
  updatedAt: '',
});

/**
 * 平台侧参数：板块开关、站点/商品/卡密配额、单次导入上限、是否允许在线收款、商品名敏感词。
 *
 * 两条与资金和内容有关的闸门：
 * 1. `payAllowed` 关掉后即使店主填了商户号也不下发支付通道（平台未取得支付业务许可时
 *    不能被动参与资金流）；
 * 2. `cardQuota` / `importMaxLines` 是防刷护栏——卡密是纯文本资产，没有上限时一次误操作
 *    就能塞进几百万行，把站点库存查询彻底拖死。
 */
export class CardShopPlatformService {
  private templateCache: { value: MiniTemplateInfo; at: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
  ) {}

  templateDir() {
    return templateDirFrom(TEMPLATE_DIR_ENV, TEMPLATE_DIR_FALLBACK);
  }

  private async read(): Promise<StoredSettings> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: SETTINGS_KEY },
    });
    if (!row?.value) return baseSettings();
    const stored = mergeJson<Partial<StoredSettings>>(row.value, {});
    return {
      enabled: stored.enabled !== false,
      goodsQuota: intIn(stored.goodsQuota, 10, 100_000, 2000),
      cardQuota: intIn(stored.cardQuota, 100, 2_000_000, 200_000),
      importMaxLines: intIn(stored.importMaxLines, 100, 200_000, 50_000),
      importMaxBytes: intIn(
        stored.importMaxBytes,
        1024,
        52_428_800,
        2 * 1024 * 1024,
      ),
      payAllowed: stored.payAllowed !== false,
      keywordFilter: normalizeKeywords(stored.keywordFilter),
      updatedBy: clip(stored.updatedBy, 64),
      updatedAt: clip(stored.updatedAt, 32),
    };
  }

  async template(): Promise<MiniTemplateInfo> {
    if (
      this.templateCache &&
      Date.now() - this.templateCache.at < TEMPLATE_CACHE_MS
    ) {
      return this.templateCache.value;
    }
    const dir = this.templateDir();
    let meta = {
      available: false,
      version: '0.0.0',
      entryCount: 0,
      sizeBytes: 0,
    };
    try {
      meta = await readTemplateMeta(dir);
    } catch {
      // 模板目录缺失只影响「内置模板」展示，不阻断站点与卡密读写
    }
    const value: MiniTemplateInfo = {
      scene: 'CARD_SHOP',
      templateDir: dir,
      injectedKeys: [
        'apiBase',
        'siteCode',
        'appId',
        'appName',
        'themeColor',
        'deskSiteKey',
      ],
      ...meta,
    };
    this.templateCache = { value, at: Date.now() };
    return value;
  }

  async settings(): Promise<CardShopAdminSettings> {
    const stored = await this.read();
    const [siteTotal, onlineSiteTotal, orderAgg] = await Promise.all([
      this.prisma.cardShopSite.count({ where: { status: { not: 'CLOSED' } } }),
      this.prisma.cardShopSite.count({ where: { status: 'ONLINE' } }),
      this.prisma.cardShopOrder.aggregate({
        _count: { _all: true },
        _sum: { totalAmount: true },
        where: { payState: 'PAID' },
      }),
    ]);
    return {
      enabled: stored.enabled,
      goodsQuota: stored.goodsQuota,
      cardQuota: stored.cardQuota,
      importMaxLines: stored.importMaxLines,
      importMaxBytes: stored.importMaxBytes,
      payAllowed: stored.payAllowed,
      keywordFilter: stored.keywordFilter,
      siteTotal,
      onlineSiteTotal,
      orderTotal: orderAgg._count._all,
      orderAmountTotal: Number(orderAgg._sum.totalAmount ?? 0),
      updatedAt: stored.updatedAt,
    };
  }

  /** 店主侧只关心配额与闸门，不给看平台留痕字段。 */
  async limits() {
    const stored = await this.read();
    return {
      enabled: stored.enabled,
      goodsQuota: stored.goodsQuota,
      cardQuota: stored.cardQuota,
      importMaxLines: stored.importMaxLines,
      importMaxBytes: stored.importMaxBytes,
      payAllowed: stored.payAllowed,
      keywordFilter: stored.keywordFilter,
    };
  }

  async saveSettings(
    user: CurrentUser,
    body: CardShopAdminSettingsBody,
  ): Promise<CardShopAdminSettings> {
    this.identity.requireAdmin(user);
    const current = await this.read();
    const next: StoredSettings = {
      enabled: body.enabled !== false,
      goodsQuota: intIn(body.goodsQuota, 10, 100_000, current.goodsQuota),
      cardQuota: intIn(body.cardQuota, 100, 2_000_000, current.cardQuota),
      importMaxLines: intIn(
        body.importMaxLines,
        100,
        200_000,
        current.importMaxLines,
      ),
      importMaxBytes: intIn(
        body.importMaxBytes,
        1024,
        52_428_800,
        current.importMaxBytes,
      ),
      payAllowed: body.payAllowed !== false,
      keywordFilter: normalizeKeywords(
        body.keywordFilter ?? current.keywordFilter,
      ),
      updatedBy: String(user.userId),
      updatedAt: new Date().toISOString(),
    };
    await this.prisma.systemSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, value: JSON.stringify(next) },
      update: { value: JSON.stringify(next) },
    });
    return this.settings();
  }

  async requireEnabled() {
    const limits = await this.limits();
    if (!limits.enabled) {
      throw new BusinessException(
        ErrorCode.FEATURE_CLOSED,
        '卡密商城小程序工具已由平台关闭，请联系平台管理员开启',
      );
    }
    return limits;
  }
}

/** 敏感词：去空、去重、限长，最多 500 条（匹配是逐条 includes，不能让它无限膨胀）。 */
function normalizeKeywords(value: unknown): string[] {
  const list = jsonList<string>(value).map((word) =>
    clip(String(word ?? '').trim(), 40),
  );
  const out: string[] = [];
  for (const word of list) {
    if (!word) continue;
    if (out.includes(word)) continue;
    out.push(word);
    if (out.length >= 500) break;
  }
  return out;
}
