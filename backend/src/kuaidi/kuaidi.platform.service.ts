import {
  type KuaidiAdminSettings,
  type KuaidiAdminSettingsBody,
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
import { KUAIDI_SCENE, amount, clip, iso, mergeJson } from './kuaidi.shared';

const SETTINGS_KEY = 'kuaidi_platform_settings';
const TEMPLATE_CACHE_MS = 60_000;
const TEMPLATE_DIR_ENV = 'MINIPROGRAM_KUAIDI_DIR';
const TEMPLATE_DIR_FALLBACK = 'kuaidi-miniprogram';

type StoredSettings = {
  enabled: boolean;
  payAllowed: boolean;
  updatedBy: string;
  updatedAt: string;
};

const baseSettings = (): StoredSettings => ({
  enabled: true,
  payAllowed: true,
  updatedBy: '',
  updatedAt: '',
});

/**
 * 平台侧参数：板块开关、是否允许在线收款。
 *
 * 站点数量已完全放开、平台也不再参与站点审核与停服，这里只剩两道总闸：
 * `enabled` 关掉整块业务冻结；`payAllowed` 关掉后即使店主配了商户号也不下发支付通道
 * （平台未取得支付业务许可时不能被动参与资金流）。款项始终直进店主的微信商户号。
 */
export class KuaidiPlatformService {
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
      payAllowed: stored.payAllowed !== false,
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
      // 模板目录缺失只影响「内置模板」展示，不阻断站点与订单读写
    }
    const value: MiniTemplateInfo = {
      scene: KUAIDI_SCENE,
      templateDir: dir,
      injectedKeys: ['apiBase', 'appId', 'appName', 'themeColor'],
      ...meta,
    };
    this.templateCache = { value, at: Date.now() };
    return value;
  }

  async limits() {
    const stored = await this.read();
    return {
      enabled: stored.enabled,
      payAllowed: stored.payAllowed,
    };
  }

  /** 板块关掉时，店主侧除概览/账单外一律拒绝新建与出包。 */
  async requireEnabled() {
    const limits = await this.limits();
    if (!limits.enabled) {
      throw new BusinessException(
        ErrorCode.FEATURE_CLOSED,
        '快递寄件小程序工具已由平台关闭，暂不能新建或出包；已有站点数据不受影响',
      );
    }
    return limits;
  }

  async settings(): Promise<KuaidiAdminSettings> {
    const [stored, siteTotal, onlineSiteTotal, orderTotal, paidAgg] =
      await Promise.all([
        this.read(),
        this.prisma.kuaidiSite.count({ where: { status: { not: 'CLOSED' } } }),
        this.prisma.kuaidiSite.count({ where: { status: 'ONLINE' } }),
        this.prisma.kuaidiOrder.count(),
        this.prisma.kuaidiOrder.aggregate({
          where: { payState: 'PAID' },
          _count: { _all: true },
          _sum: { totalAmount: true },
        }),
      ]);
    return {
      enabled: stored.enabled,
      payAllowed: stored.payAllowed,
      siteTotal,
      onlineSiteTotal,
      orderTotal,
      revenueTotal: amount(paidAgg._sum.totalAmount),
      updatedAt: stored.updatedAt,
    };
  }

  async saveSettings(
    user: CurrentUser,
    body: KuaidiAdminSettingsBody,
  ): Promise<KuaidiAdminSettings> {
    this.identity.requireAdmin(user);
    const stored: StoredSettings = {
      enabled: body.enabled !== false,
      payAllowed: body.payAllowed !== false,
      updatedBy: String(user.userId),
      updatedAt: iso(new Date()),
    };
    await this.prisma.systemSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, value: JSON.stringify(stored) },
      update: { value: JSON.stringify(stored) },
    });
    return this.settings();
  }
}
