import {
  DH_CHANNEL_CAPABILITIES,
  DH_TOGGLE_KEYS,
  type DhOverview,
  type DhSettingsInput,
  type DhSettingsView,
  type MiniTemplateInfo,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { toJsonInput } from '../common/json-input';
import {
  readTemplateMeta,
  templateDirFrom,
} from '../private-mini/package-builder';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { DhChannelService } from './dh.channel.service';
import { DH_SCENE, dhSiteCode, diyPageOf, siteConfigOf } from './dh.shared';

const TEMPLATE_CACHE_MS = 60_000;
const TEMPLATE_DIR_ENV = 'MINIPROGRAM_DH_DIR';
const TEMPLATE_DIR_FALLBACK = 'miniprogram-dh';

type SiteRow = NonNullable<
  Awaited<ReturnType<PrismaService['digitalHumanSite']['findUnique']>>
>;

/**
 * 数字人站点服务：懒创建（一个平台账号一套）、品牌/开关/计价/分销参数读写、
 * 首页统计。站点公开码 siteCode 是小程序端唯一寻址，创建后不再变更。
 *
 * 状态机：DRAFT 未上线 → ONLINE 营业中；平台停服 SUSPENDED / 关闭 CLOSED 只由
 * 平台侧流转，店主保存设置不会把停了服的站点拉回营业。
 */
export class DhSiteService {
  private templateCache: { value: MiniTemplateInfo; at: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly miniApp: MiniAppService,
    private readonly channel: DhChannelService,
  ) {}

  templateDir() {
    return templateDirFrom(TEMPLATE_DIR_ENV, TEMPLATE_DIR_FALLBACK);
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
      // 模板目录缺失只影响「内置模板」展示，不阻断配置读写
    }
    const value: MiniTemplateInfo = {
      scene: DH_SCENE,
      templateDir: dir,
      injectedKeys: ['apiBase', 'siteCode', 'appId'],
      ...meta,
    };
    this.templateCache = { value, at: Date.now() };
    return value;
  }

  async ensureSite(userId: string): Promise<SiteRow> {
    const existing = await this.prisma.digitalHumanSite.findUnique({
      where: { userId },
    });
    if (existing) return existing;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await this.prisma.digitalHumanSite.create({
          data: {
            userId,
            siteCode: dhSiteCode(),
            siteName: '',
            status: 'DRAFT',
          },
        });
      } catch (error) {
        // siteCode 撞码重试；其他错误（如 userId 并发建站撞唯一键）回读一次
        const again = await this.prisma.digitalHumanSite.findUnique({
          where: { userId },
        });
        if (again) return again;
        if (attempt === 4) throw error;
      }
    }
    throw new BusinessException(
      ErrorCode.SERVICE_UNAVAILABLE,
      '站点编码生成失败，请稍后重试',
    );
  }

  /** 回调入口按站点 id 取行（支付回调 URL 里只有 siteId）。 */
  async findByAnyId(siteId: number): Promise<SiteRow | null> {
    if (!Number.isInteger(siteId) || siteId <= 0) return null;
    return this.prisma.digitalHumanSite.findUnique({ where: { id: siteId } });
  }

  subjectOf(site: SiteRow) {
    return {
      ownerUserId: site.userId,
      scene: DH_SCENE,
      shopId: site.id,
      shopName: site.siteName || `数字人小程序 ${site.siteCode}`,
    };
  }

  settingsView(site: SiteRow): DhSettingsView {
    const config = siteConfigOf(site);
    return {
      siteCode: site.siteCode,
      siteName: site.siteName,
      slogan: site.slogan,
      logo: site.logo,
      themeColor: site.themeColor,
      servicePhone: site.servicePhone,
      status: site.status,
      brand: config.brand,
      toggles: config.toggles,
      pricing: config.pricing,
      gift: config.gift,
      login: config.login,
      clone: config.clone,
      commission: config.commission,
      serviceDeskSiteKey: site.serviceDeskSiteKey,
      diyPage: diyPageOf(site.diyPage),
      updatedAt: site.updatedAt.toISOString(),
    };
  }

  async saveSettings(
    user: CurrentUser,
    body: DhSettingsInput,
  ): Promise<DhSettingsView> {
    const site = await this.ensureSite(user.userId);
    if (site.status === 'CLOSED') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '站点已关闭，不能修改设置',
      );
    }
    const current = siteConfigOf(site);
    const toggles: Record<string, boolean> = {};
    for (const key of DH_TOGGLE_KEYS) {
      const value = body.toggles[key];
      toggles[key] =
        typeof value === 'boolean' ? value : current.toggles[key] !== false;
    }
    const commission = { ...current.commission, ...body.commission };
    if (commission.level1Rate + commission.level2Rate > 100) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '两级分销比例合计不能超过 100%',
      );
    }
    if (commission.joinType === 'pay' && commission.payPackageId > 0) {
      const pkg = await this.prisma.digitalHumanPackage.findFirst({
        where: { id: commission.payPackageId, siteId: site.id },
        select: { id: true },
      });
      if (!pkg) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '「付费开通推广员」指定的套餐不存在，请先到套餐管理创建',
        );
      }
    }
    // 平台停服中的站点只允许改配置，不随保存动作恢复营业
    const nextStatus =
      site.status === 'SUSPENDED'
        ? 'SUSPENDED'
        : body.enabled
          ? 'ONLINE'
          : 'DRAFT';
    const updated = await this.prisma.digitalHumanSite.update({
      where: { id: site.id },
      data: {
        siteName: body.siteName,
        slogan: body.slogan,
        logo: body.logo,
        themeColor: body.themeColor,
        servicePhone: body.servicePhone,
        brand: toJsonInput({ ...current.brand, ...body.brand }),
        toggles: toJsonInput(toggles),
        pricing: toJsonInput({ ...current.pricing, ...body.pricing }),
        gift: toJsonInput({ ...current.gift, ...body.gift }),
        login: toJsonInput({ ...current.login, ...body.login }),
        clone: toJsonInput({ ...current.clone, ...body.clone }),
        commission: toJsonInput(commission),
        serviceDeskSiteKey: body.serviceDeskSiteKey,
        diyPage: toJsonInput(body.diyPage),
        status: nextStatus,
      },
    });
    await this.audit(
      user.userId,
      'dh.settings.save',
      `${updated.siteCode} status=${nextStatus}`,
    );
    return this.settingsView(updated);
  }

  async overview(user: CurrentUser): Promise<DhOverview> {
    const site = await this.ensureSite(user.userId);
    const subject = this.subjectOf(site);
    const now = new Date();
    const dayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
    );
    const [
      memberCount,
      vipCount,
      workCount,
      taskRunning,
      orderCount,
      todayOrderCount,
      paid,
      pointSpent,
      cardUnused,
      pendingWithdraws,
      pendingApplies,
      pendingFeedbacks,
      payEnabled,
    ] = await Promise.all([
      this.prisma.digitalHumanMember.count({
        where: { siteId: site.id, status: 'ACTIVE' },
      }),
      this.prisma.digitalHumanMember.count({
        where: {
          siteId: site.id,
          status: 'ACTIVE',
          vipExpireAt: { gt: now },
        },
      }),
      this.prisma.digitalHumanWork.count({ where: { siteId: site.id } }),
      this.prisma.digitalHumanTask.count({
        where: { siteId: site.id, status: 1 },
      }),
      this.prisma.digitalHumanOrder.count({ where: { siteId: site.id } }),
      this.prisma.digitalHumanOrder.count({
        where: { siteId: site.id, status: 1, paidAt: { gte: dayStart } },
      }),
      this.prisma.digitalHumanOrder.aggregate({
        where: { siteId: site.id, status: 1 },
        _sum: { amountCents: true },
      }),
      this.prisma.digitalHumanBalanceLog.aggregate({
        where: {
          siteId: site.id,
          account: 'point',
          bizType: { in: ['work', 'tts'] },
          isRefund: false,
        },
        _sum: { delta: true },
      }),
      this.prisma.digitalHumanCard.count({
        where: { siteId: site.id, status: 'unused' },
      }),
      this.prisma.digitalHumanWithdraw.count({
        where: { siteId: site.id, status: 0 },
      }),
      this.prisma.digitalHumanPromoterApply.count({
        where: { siteId: site.id, status: 0 },
      }),
      this.prisma.digitalHumanFeedback.count({
        where: { siteId: site.id, status: 'pending' },
      }),
      this.miniApp.payEnabled(subject),
    ]);
    const channelsReady: Record<string, boolean> = {};
    for (const capability of DH_CHANNEL_CAPABILITIES) {
      channelsReady[capability] = Boolean(
        await this.channel.peekRuntime(user.userId, capability),
      );
    }
    return {
      siteCode: site.siteCode,
      status: site.status,
      memberCount,
      vipCount,
      workCount,
      taskRunning,
      orderCount,
      todayOrderCount,
      paidAmountCents: paid._sum.amountCents || 0,
      pointConsumed: Math.abs(pointSpent._sum.delta || 0),
      cardUnused,
      pendingWithdraws,
      pendingApplies,
      pendingFeedbacks,
      channelsReady,
      payEnabled,
    };
  }

  private async audit(userId: string, action: string, detail: string) {
    await this.prisma.auditLog
      .create({ data: { userId, action, detail: detail.slice(0, 500) } })
      .catch(() => undefined);
  }
}
