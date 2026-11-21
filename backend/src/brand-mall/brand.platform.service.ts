import {
  BRAND_DEFAULT_TRADE,
  type BrandAdminSettings,
  type BrandAdminSettingsBody,
  type BrandExpress,
  type BrandTradeConfig,
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
import { clip, intIn, mergeJson } from './brand.shared';

const SETTINGS_KEY = 'brand_mall_platform_settings';
const TEMPLATE_CACHE_MS = 60_000;
const TEMPLATE_DIR_ENV = 'MINIPROGRAM_BRAND_MALL_DIR';
const TEMPLATE_DIR_FALLBACK = 'brand-mall-miniprogram';

type StoredSettings = {
  enabled: boolean;
  shopQuota: number;
  productQuota: number;
  payAllowed: boolean;
  defaultTrade: BrandTradeConfig;
  updatedBy: string;
  updatedAt: string;
};

const baseSettings = (): StoredSettings => ({
  enabled: true,
  shopQuota: 3,
  productQuota: 2000,
  payAllowed: true,
  defaultTrade: { ...BRAND_DEFAULT_TRADE },
  updatedBy: '',
  updatedAt: '',
});

/** 首次使用时铺一批常用快递，省得每个店主自己录；平台后台可停用的。 */
const PRESET_EXPRESS: Array<[string, string]> = [
  ['顺丰速运', 'SF'],
  ['中通快递', 'ZTO'],
  ['圆通速递', 'YTO'],
  ['申通快递', 'STO'],
  ['韵达快递', 'YD'],
  ['极兔速递', 'JTSD'],
  ['京东物流', 'JD'],
  ['邮政EMS', 'EMS'],
  ['百世快递', 'HTKY'],
  ['德邦快递', 'DBL'],
];

/**
 * 平台侧参数与预置数据：板块开关、店铺/商品配额、是否允许在线收款、新店铺默认交易参数。
 *
 * 「是否允许收款」是资金合规闸门：关掉后用户即使填了商户号也不下发支付通道，
 * 下单落线下标记，避免平台在未取得支付业务许可的情况下被动参与资金流。
 */
export class BrandPlatformService {
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
    const parsed = mergeJson<Partial<StoredSettings>>(row.value, {});
    const trade = mergeJson<BrandTradeConfig>(
      parsed.defaultTrade,
      BRAND_DEFAULT_TRADE,
    );
    return {
      enabled: parsed.enabled !== false,
      shopQuota: intIn(parsed.shopQuota, 1, 100, 3),
      productQuota: intIn(parsed.productQuota, 10, 100_000, 2000),
      payAllowed: parsed.payAllowed !== false,
      defaultTrade: normalizeDefaultTrade(trade),
      updatedBy: clip(parsed.updatedBy, 64),
      updatedAt: clip(parsed.updatedAt, 32),
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
      // 模板目录缺失只影响「内置模板」展示，不阻断店铺与商品读写
    }
    const value: MiniTemplateInfo = {
      scene: 'BRAND',
      templateDir: dir,
      injectedKeys: ['apiBase', 'shopCode', 'appId', 'appName', 'themeColor'],
      ...meta,
    };
    this.templateCache = { value, at: Date.now() };
    return value;
  }

  async settings(): Promise<BrandAdminSettings> {
    const stored = await this.read();
    const [shopTotal, onlineShopTotal, orderTotal] = await Promise.all([
      this.prisma.brandShop.count({ where: { status: { not: 'CLOSED' } } }),
      this.prisma.brandShop.count({ where: { status: 'ONLINE' } }),
      this.prisma.brandOrder.count(),
    ]);
    return {
      enabled: stored.enabled,
      shopQuota: stored.shopQuota,
      productQuota: stored.productQuota,
      payAllowed: stored.payAllowed,
      defaultTrade: stored.defaultTrade,
      shopTotal,
      onlineShopTotal,
      orderTotal,
      updatedAt: stored.updatedAt,
    };
  }

  /** 店主侧只关心配额与闸门，不给看平台留痕字段。 */
  async limits() {
    const stored = await this.read();
    return {
      enabled: stored.enabled,
      shopQuota: stored.shopQuota,
      productQuota: stored.productQuota,
      payAllowed: stored.payAllowed,
      defaultTrade: stored.defaultTrade,
    };
  }

  async saveSettings(
    user: CurrentUser,
    body: BrandAdminSettingsBody,
  ): Promise<BrandAdminSettings> {
    this.identity.requireAdmin(user);
    const current = await this.read();
    const next: StoredSettings = {
      enabled: body.enabled !== false,
      shopQuota: intIn(body.shopQuota, 1, 100, current.shopQuota),
      productQuota: intIn(body.productQuota, 10, 100_000, current.productQuota),
      payAllowed: body.payAllowed !== false,
      defaultTrade: normalizeDefaultTrade(
        mergeJson<BrandTradeConfig>(body.defaultTrade, current.defaultTrade),
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
        '电商小程序工具已由平台关闭，请联系平台管理员开启',
      );
    }
    return limits;
  }

  /** 平台预置快递公司（shopId=0）；表空时铺一次默认清单。 */
  async ensureExpressPresets(): Promise<BrandExpress[]> {
    const total = await this.prisma.brandExpressCompany.count({
      where: { shopId: 0 },
    });
    if (total === 0) {
      await this.prisma.brandExpressCompany.createMany({
        data: PRESET_EXPRESS.map(([name, code], index) => ({
          shopId: 0,
          name,
          code,
          sortOrder: (index + 1) * 10,
          enabled: true,
        })),
      });
    }
    const rows = await this.prisma.brandExpressCompany.findMany({
      where: { shopId: 0 },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      take: 200,
    });
    return rows.map((row) => ({
      id: row.id,
      shopId: row.shopId,
      name: row.name,
      code: row.code,
      phone: row.phone,
      enabled: row.enabled,
      sortOrder: row.sortOrder,
    }));
  }
}

/** 交易参数缺界收敛：平台默认值也要过一遍，否则库里脏值会一路带到下单算价。 */
export function normalizeDefaultTrade(
  value: BrandTradeConfig,
): BrandTradeConfig {
  return {
    autoCancelMinutes: intIn(value.autoCancelMinutes, 5, 10080, 30),
    freightAmount: round2(value.freightAmount),
    freeFreightAmount: round2(value.freeFreightAmount),
    minOrderAmount: round2(value.minOrderAmount),
    refundEnabled: value.refundEnabled !== false,
    refundDaysLimit: intIn(value.refundDaysLimit, 0, 365, 7),
    buyerMessageEnabled: value.buyerMessageEnabled !== false,
    pointsEnabled: value.pointsEnabled === true,
    pointsReturnRate: round2(value.pointsReturnRate),
    pointsPerYuan: intIn(value.pointsPerYuan, 0, 100000, 0),
    pointsDeductMaxPercent: intIn(value.pointsDeductMaxPercent, 0, 100, 0),
    selfCancelEnabled: value.selfCancelEnabled !== false,
  };
}

function round2(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100) / 100;
}
