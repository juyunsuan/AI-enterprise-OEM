import {
  type MiniTemplateInfo,
  type OnsiteAdminShopRow,
  type OnsitePlatformSettings,
  type OnsitePlatformSettingsInput,
} from '@enterprise/contracts';
import { pageOf, pageParam, text } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { IdentityService } from '../identity/identity.service';
import type { PrismaService } from '../prisma/prisma.service';
import {
  readTemplateMeta,
  templateDirFrom,
} from '../private-mini/package-builder';
import { DEFAULT_TRADE, ONSITE_SCENE, shopStatus } from './onsite.shop.service';

const SETTINGS_KEY = 'onsite_platform_settings';
const TEMPLATE_CACHE_MS = 60_000;
const TEMPLATE_DIR_ENV = 'MINIPROGRAM_ONSITE_DIR';
const TEMPLATE_DIR_FALLBACK = 'miniprogram-onsite';

type StoredSettings = {
  enabled: boolean;
  allowOnlinePay: boolean;
  defaultTrade: typeof DEFAULT_TRADE;
  updatedBy: string;
  updatedAt: string;
};

const baseSettings = (): StoredSettings => ({
  enabled: true,
  allowOnlinePay: true,
  defaultTrade: { ...DEFAULT_TRADE },
  updatedBy: '',
  updatedAt: '',
});

/**
 * 平台侧参数与台账：板块开关、是否允许在线收款、新店铺默认交易参数。
 *
 * 上门服务是一账号一店铺（多开不开放），所以这里没有「每账号店铺数」这类参数；
 * 「是否允许收款」是资金合规闸门：关掉后用户即使填了商户号也不下发支付通道，
 * 下单落 offline 标记，避免平台在未取得支付业务许可的情况下被动参与资金流。
 */
export class OnsitePlatformService {
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
    try {
      const parsed = JSON.parse(row.value) as Partial<StoredSettings>;
      return {
        ...baseSettings(),
        enabled: parsed.enabled !== false,
        allowOnlinePay: parsed.allowOnlinePay !== false,
        defaultTrade: { ...DEFAULT_TRADE, ...(parsed.defaultTrade || {}) },
        updatedBy: String(parsed.updatedBy || ''),
        updatedAt: String(parsed.updatedAt || ''),
      };
    } catch {
      return baseSettings();
    }
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
      // 模板目录缺失只影响「内置模板」展示，不阻断店铺与出包以外的读写
    }
    const value: MiniTemplateInfo = {
      scene: ONSITE_SCENE,
      templateDir: dir,
      injectedKeys: ['apiBase', 'shopCode', 'appId'],
      ...meta,
    };
    this.templateCache = { value, at: Date.now() };
    return value;
  }

  /** 平台侧读参数：只有平台管理员能看到配额与模板信息（店主侧走 overview，不经这里）。 */
  async settingsFor(user: CurrentUser): Promise<OnsitePlatformSettings> {
    this.identity.requireAdmin(user);
    return this.settings();
  }

  async settings(): Promise<OnsitePlatformSettings> {
    const [stored, template, shopCount] = await Promise.all([
      this.read(),
      this.template(),
      this.prisma.onsiteShop.count({ where: { status: { not: 'CLOSED' } } }),
    ]);
    return {
      enabled: stored.enabled,
      allowOnlinePay: stored.allowOnlinePay,
      defaultTrade: stored.defaultTrade,
      template,
      shopCount,
      updatedAt: stored.updatedAt,
    };
  }

  async saveSettings(
    user: CurrentUser,
    body: OnsitePlatformSettingsInput,
  ): Promise<OnsitePlatformSettings> {
    this.identity.requireAdmin(user);
    const current = await this.read();
    const next: StoredSettings = {
      ...current,
      enabled: body.enabled === true,
      allowOnlinePay: body.allowOnlinePay === true,
      defaultTrade: { ...current.defaultTrade, ...(body.defaultTrade || {}) },
      updatedBy: user.userId,
      updatedAt: new Date().toISOString(),
    };
    const value = JSON.stringify(next);
    await this.prisma.systemSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, value },
      update: { value },
    });
    await this.prisma.auditLog
      .create({
        data: {
          userId: user.userId,
          action: 'onsite.admin.settings',
          detail: `开启=${next.enabled} 收款=${next.allowOnlinePay}`,
        },
      })
      .catch(() => undefined);
    return this.settings();
  }

  /** 全平台店铺台账：账号名与主体凭据一次批量补齐，不在循环里查库。 */
  async adminShops(user: CurrentUser, query: Record<string, unknown>) {
    this.identity.requireAdmin(user);
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
      20,
    );
    const keyword = text(query.keyword).trim().slice(0, 40);
    const status = text(query.status, 'all').trim();
    const where = {
      ...(status && status !== 'all'
        ? { status }
        : { status: { not: 'CLOSED' } }),
      ...(keyword
        ? {
            OR: [
              { name: { contains: keyword } },
              { shopCode: { contains: keyword.toUpperCase() } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.onsiteShop.count({ where }),
      this.prisma.onsiteShop.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const shopIds = rows.map((row) => row.id);
    const [accounts, apps] = await Promise.all([
      this.prisma.account.findMany({
        where: {
          id: {
            in: rows
              .map((row) => Number(row.ownerUserId))
              .filter((id) => Number.isInteger(id) && id > 0),
          },
        },
        select: { id: true, username: true },
      }),
      this.prisma.miniProgramApp.findMany({
        where: { scene: ONSITE_SCENE, shopId: { in: shopIds } },
        select: { shopId: true, appId: true, payEnabled: true },
      }),
    ]);
    const nameOf = new Map(
      accounts.map((row) => [String(row.id), row.username]),
    );
    const appOf = new Map(apps.map((row) => [row.shopId, row]));
    const list: OnsiteAdminShopRow[] = rows.map((row) => ({
      id: row.id,
      ownerUserId: row.ownerUserId,
      ownerUsername: nameOf.get(row.ownerUserId) || row.ownerUserId,
      name: row.name,
      shopCode: row.shopCode,
      status: shopStatus(row.status),
      appId: appOf.get(row.id)?.appId || '',
      payEnabled: Number(appOf.get(row.id)?.payEnabled || 0) === 1,
      offBy: row.offBy,
      offReason: row.offReason,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
    return pageOf(list, total, page, pageSize);
  }

  /** 平台停服：只动状态与留痕，店铺数据与凭据都保留，恢复即回原样。 */
  async suspendShop(user: CurrentUser, id: string, reason: string) {
    this.identity.requireAdmin(user);
    const shopId = Number(id);
    const row = await this.prisma.onsiteShop.findUnique({
      where: { id: shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '店铺不存在');
    const updated = await this.prisma.onsiteShop.update({
      where: { id: shopId },
      data: {
        status: 'SUSPENDED',
        offBy: user.userId,
        offReason: text(reason, '平台停服').slice(0, 500),
      },
    });
    await this.audit(user.userId, 'onsite.admin.suspend', updated.name);
    return this.adminRow(updated.id);
  }

  async resumeShop(user: CurrentUser, id: string) {
    this.identity.requireAdmin(user);
    const shopId = Number(id);
    const row = await this.prisma.onsiteShop.findUnique({
      where: { id: shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '店铺不存在');
    const updated = await this.prisma.onsiteShop.update({
      where: { id: shopId },
      data: { status: 'ONLINE', offBy: '', offReason: '' },
    });
    await this.audit(user.userId, 'onsite.admin.resume', updated.name);
    return this.adminRow(updated.id);
  }

  private async adminRow(shopId: number): Promise<OnsiteAdminShopRow> {
    const row = await this.prisma.onsiteShop.findUnique({
      where: { id: shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '店铺不存在');
    const [account, app] = await Promise.all([
      this.prisma.account.findUnique({
        where: { id: Number(row.ownerUserId) || 0 },
        select: { username: true },
      }),
      this.prisma.miniProgramApp.findFirst({
        where: { scene: ONSITE_SCENE, shopId: row.id },
        select: { appId: true, payEnabled: true },
      }),
    ]);
    return {
      id: row.id,
      ownerUserId: row.ownerUserId,
      ownerUsername: account?.username || row.ownerUserId,
      name: row.name,
      shopCode: row.shopCode,
      status: shopStatus(row.status),
      appId: app?.appId || '',
      payEnabled: Number(app?.payEnabled || 0) === 1,
      offBy: row.offBy,
      offReason: row.offReason,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async audit(userId: string, action: string, detail: string) {
    await this.prisma.auditLog
      .create({
        data: { userId, action, detail: detail.slice(0, 500) },
      })
      .catch(() => undefined);
  }
}
