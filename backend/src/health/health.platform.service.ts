import {
  HEALTH_ALERT_RULE_TYPE_LABELS,
  HEALTH_AFTERSALE_KIND_LABELS,
  HEALTH_AUDIT_STATUS_LABELS,
  HEALTH_ORDER_BIZ_TYPE_LABELS,
  HEALTH_CONSULT_STATUS_LABELS,
  HEALTH_CROWD_KIND_LABELS,
  HEALTH_DIY_BLOCK_LABELS,
  HEALTH_EARNER_KIND_LABELS,
  HEALTH_FOLLOWUP_WAY_LABELS,
  HEALTH_MINI_SCENE,
  HEALTH_ORDER_STATUS_LABELS,
  HEALTH_PRESCRIPTION_STATUS_LABELS,
  HEALTH_PRACTITIONER_ROLE_LABELS,
  HEALTH_RECORD_ITEM_TYPE_LABELS,
  HEALTH_SERVICE_ENTRY_LABELS,
  HEALTH_SHOP_STATUS_LABELS,
  HEALTH_STAFF_ROLE_LABELS,
  HEALTH_WITHDRAWAL_STATUS_LABELS,
  HEALTH_CONTENT_KIND_LABELS,
  type HealthMeta,
  type HealthPlatformSettings,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { IdentityService } from '../identity/identity.service';
import type { PrismaService } from '../prisma/prisma.service';
import { clip, normalizeTrade, toIso } from './health.shared';

const SETTINGS_KEY = 'health_platform_settings';

type StoredSettings = {
  enabled: boolean;
  allowOnlinePay: boolean;
  defaultTrade: unknown;
  updatedBy: string;
  updatedAt: string;
};

const baseSettings = (): StoredSettings => ({
  enabled: true,
  allowOnlinePay: true,
  defaultTrade: {},
  updatedBy: '',
  updatedAt: '',
});

/**
 * 健康管理小程序工具·平台侧参数。
 *
 * 平台只保留板块级开关，不介入具体店铺的经营、审核与处置：
 * - `enabled` 关掉后店主侧写操作全部拒绝（读与已出包的小程序不受影响）；
 * - `allowOnlinePay` 是资金总闸，关闭后即使店主配了商户号也不下发起支付参数。
 * 店铺、机构、医护由店主在工作台内自行管理与审核，一个账号只开一家店。
 */
export class HealthPlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
  ) {}

  private async read(): Promise<StoredSettings> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: SETTINGS_KEY },
    });
    if (!row?.value) return baseSettings();
    let stored: Partial<StoredSettings> = {};
    try {
      const parsed = JSON.parse(row.value) as unknown;
      if (parsed && typeof parsed === 'object') {
        stored = parsed;
      }
    } catch {
      return baseSettings();
    }
    return {
      enabled: stored.enabled !== false,
      allowOnlinePay: stored.allowOnlinePay !== false,
      defaultTrade: stored.defaultTrade ?? {},
      updatedBy: clip(stored.updatedBy, 64),
      updatedAt: clip(stored.updatedAt, 32),
    };
  }

  async settings(): Promise<HealthPlatformSettings> {
    const stored = await this.read();
    return {
      enabled: stored.enabled,
      allowOnlinePay: stored.allowOnlinePay,
      defaultTrade: normalizeTrade(stored.defaultTrade),
      updatedBy: stored.updatedBy,
      updatedAt: stored.updatedAt,
    };
  }

  async saveSettings(
    user: CurrentUser,
    body: {
      enabled: boolean;
      allowOnlinePay: boolean;
      defaultTrade: unknown;
    },
  ): Promise<HealthPlatformSettings> {
    this.identity.requireAdmin(user);
    const next: StoredSettings = {
      enabled: body.enabled !== false,
      allowOnlinePay: body.allowOnlinePay !== false,
      defaultTrade: normalizeTrade(body.defaultTrade),
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

  /** 店主侧写操作前的总闸；读接口不调它，平台关闭后店主仍能看自己的数据。 */
  async requireEnabled(): Promise<HealthPlatformSettings> {
    const settings = await this.settings();
    if (!settings.enabled) {
      throw new BusinessException(
        ErrorCode.FEATURE_CLOSED,
        '健康管理小程序工具已由平台关闭，请联系平台管理员开启',
      );
    }
    return settings;
  }

  meta(): HealthMeta {
    return {
      scene: HEALTH_MINI_SCENE,
      shopStatuses: HEALTH_SHOP_STATUS_LABELS,
      staffRoles: HEALTH_STAFF_ROLE_LABELS,
      practitionerRoles: HEALTH_PRACTITIONER_ROLE_LABELS,
      auditStatuses: HEALTH_AUDIT_STATUS_LABELS,
      bizTypes: HEALTH_ORDER_BIZ_TYPE_LABELS,
      orderStatuses: HEALTH_ORDER_STATUS_LABELS,
      consultStatuses: HEALTH_CONSULT_STATUS_LABELS,
      followupWays: HEALTH_FOLLOWUP_WAY_LABELS,
      alertRuleTypes: HEALTH_ALERT_RULE_TYPE_LABELS,
      prescriptionStatuses: HEALTH_PRESCRIPTION_STATUS_LABELS,
      aftersaleKinds: HEALTH_AFTERSALE_KIND_LABELS,
      withdrawalStatuses: HEALTH_WITHDRAWAL_STATUS_LABELS,
      earnerKinds: HEALTH_EARNER_KIND_LABELS,
      crowdKinds: HEALTH_CROWD_KIND_LABELS,
      recordItemTypes: HEALTH_RECORD_ITEM_TYPE_LABELS,
      contentKinds: HEALTH_CONTENT_KIND_LABELS,
      diyBlocks: HEALTH_DIY_BLOCK_LABELS,
      serviceEntries: HEALTH_SERVICE_ENTRY_LABELS,
      timeUnits: [5, 10, 15, 20, 30, 45, 60, 90, 120],
    };
  }

  // ---------- 订单只读台账 ----------

  async adminOrders(user: CurrentUser, query: Record<string, unknown>) {
    this.identity.requireAdmin(user);
    return this.orderQuery(query);
  }

  /** 平台订单视图：跨店查询，只读，不做任何状态迁移（处置在店铺侧）。 */
  private async orderQuery(query: Record<string, unknown>) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(
      50,
      Math.max(1, Number(query.pageSize ?? 20) || 20),
    );
    const shopId = Number(query.shopId ?? 0) || 0;
    const bizType = clip(query.bizType, 24) || 'all';
    const orderStatus = clip(query.orderStatus, 24) || 'all';
    const from = clip(query.from, 20);
    const to = clip(query.to, 20);
    const where = {
      ...(shopId > 0 ? { shopId } : {}),
      ...(bizType !== 'all' ? { orderType: bizType } : {}),
      ...(orderStatus !== 'all' ? { status: orderStatus } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}),
              ...(to ? { lte: new Date(`${to}T23:59:59Z`) } : {}),
            },
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.healthOrder.count({ where }),
      this.prisma.healthOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const names = await this.customerNames(rows.map((row) => row.customerId));
    return {
      list: rows.map((row) => ({
        id: row.id,
        orderNo: row.orderNo,
        shopId: row.shopId,
        orderType: row.orderType,
        customerId: row.customerId,
        customerName: names.get(row.customerId) || '',
        payAmountCents: row.payAmountCents,
        refundAmountCents: row.refundAmountCents,
        payStatus: row.payStatus,
        status: row.status,
        createdAt: toIso(row.createdAt),
        paidAt: toIso(row.paidAt),
      })),
      total,
      page,
      pageSize,
    };
  }

  private async customerNames(ids: number[]): Promise<Map<number, string>> {
    const unique = [...new Set(ids.filter((id) => id > 0))];
    if (!unique.length) return new Map();
    const rows = await this.prisma.healthCustomer.findMany({
      where: { id: { in: unique } },
      select: { id: true, nickname: true, phone: true },
    });
    return new Map(
      rows.map((row) => [
        row.id,
        row.nickname || row.phone || `顾客#${row.id}`,
      ]),
    );
  }
}
