import {
  type ErrandAdminSettings,
  type ErrandAdminSettingsBody,
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
import { ERRAND_SCENE, amount, clip, iso, mergeJson } from './errand.shared';

const SETTINGS_KEY = 'errand_platform_settings';
const TEMPLATE_CACHE_MS = 60_000;
const TEMPLATE_DIR_ENV = 'MINIPROGRAM_ERRAND_DIR';
const TEMPLATE_DIR_FALLBACK = 'errand-miniprogram';

type StoredSettings = {
  enabled: boolean;
  payAllowed: boolean;
  aiAllowed: boolean;
  updatedBy: string;
  updatedAt: string;
};

const baseSettings = (): StoredSettings => ({
  enabled: true,
  payAllowed: true,
  aiAllowed: true,
  updatedBy: '',
  updatedAt: '',
});

/**
 * 跑腿平台侧参数：板块开关、是否允许在线收款、是否允许 AI 调度。
 *
 * 平台不参与单个跑腿站点的经营与资金：款项直进店主的微信商户号；
 * 这三道闸只决定「整块业务能不能用」与「AI 能力能不能被主动调用」。
 */
export class ErrandPlatformService {
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
      aiAllowed: stored.aiAllowed !== false,
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
      scene: ERRAND_SCENE,
      templateDir: dir,
      injectedKeys: ['apiBase', 'siteCode', 'appName', 'themeColor'],
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
      aiAllowed: stored.aiAllowed,
    };
  }

  async requireEnabled() {
    const limits = await this.limits();
    if (!limits.enabled) {
      throw new BusinessException(
        ErrorCode.FEATURE_CLOSED,
        '跑腿小程序工具已由平台关闭，暂不能新建或出包；已有站点数据不受影响',
      );
    }
    return limits;
  }

  async requireAi() {
    const limits = await this.limits();
    if (!limits.aiAllowed) {
      throw new BusinessException(
        ErrorCode.FEATURE_CLOSED,
        '平台已关闭跑腿工具的 AI 辅助能力，暂不能发起 AI 调度建议',
      );
    }
    return limits;
  }

  async settings(): Promise<ErrandAdminSettings> {
    const [
      stored,
      siteTotal,
      onlineSiteTotal,
      orderTotal,
      paidAgg,
      riderTotal,
    ] = await Promise.all([
      this.read(),
      this.prisma.errandSite.count(),
      this.prisma.errandSite.count({ where: { status: 'ONLINE' } }),
      this.prisma.errandOrder.count(),
      this.prisma.errandOrder.aggregate({
        where: { payState: 'PAID' },
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
      this.prisma.errandRider.count(),
    ]);
    return {
      enabled: stored.enabled,
      payAllowed: stored.payAllowed,
      aiAllowed: stored.aiAllowed,
      siteTotal,
      onlineSiteTotal,
      orderTotal,
      gmvTotal: amount(paidAgg._sum.totalAmount),
      riderTotal,
      updatedAt: stored.updatedAt,
    };
  }

  async saveSettings(
    user: CurrentUser,
    body: ErrandAdminSettingsBody,
  ): Promise<ErrandAdminSettings> {
    this.identity.requireAdmin(user);
    const stored: StoredSettings = {
      enabled: body.enabled !== false,
      payAllowed: body.payAllowed !== false,
      aiAllowed: body.aiAllowed !== false,
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
