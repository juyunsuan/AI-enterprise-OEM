import type { ToolLaunchPricingSaveBody } from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import type { Prisma } from '../../generated/prisma';
import { BusinessException } from '../common/business.exception';
import { Logger } from '../common/logger';
import { ErrorCode } from '../common/error-code';
import type { UserLookupService } from '../directory/user-lookup.service';
import type { PrismaService } from '../prisma/prisma.service';
import { TOOL_LAUNCH_CATALOG, type ToolCode } from './tool-launch.catalog';
import {
  ownBillingNote,
  resolvePlan,
  type PricingInput,
} from './tool-launch.pricing';
import type { ToolLaunchSettingsService } from './tool-launch.settings.service';
import type { ToolLaunchService } from './tool-launch.service';

/**
 * 平台管理侧：启动台账总览、计费口径维护与强制停服。
 *
 * 计费口径继续落在 `module_pricing`（与「价目与用量」同一张表、同一处入口），
 * 不另建一套价格配置——否则用户启动页说的价和管理员改的价迟早分叉。
 */

export class ToolLaunchAdminService {
  private readonly logger = new Logger(ToolLaunchAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly launch: ToolLaunchService,
    private readonly settings: ToolLaunchSettingsService,
    private readonly users: UserLookupService,
  ) {}

  async overview() {
    const [policy, rows, statusRows, perToolRows, unpaidBills, charged] =
      await Promise.all([
        this.settings.view(),
        this.prisma.modulePricing.findMany({
          where: {
            code: { in: TOOL_LAUNCH_CATALOG.map((i) => i.pricingCode) },
          },
        }),
        this.prisma.toolSubscription.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        this.prisma.toolSubscription.groupBy({
          by: ['toolCode', 'status'],
          _count: { _all: true },
        }),
        this.prisma.toolSubscriptionBill.count({
          where: { status: 'ARREARS' },
        }),
        this.prisma.toolSubscriptionBill.aggregate({
          where: {
            status: 'CHARGED',
            createdAt: { gte: new Date(Date.now() - 30 * 86400_000) },
          },
          _sum: { pointsAmount: true },
        }),
      ]);
    const byCode = new Map(rows.map((row) => [row.code, row]));
    const counts = new Map(
      statusRows.map((row) => [row.status, row._count._all]),
    );
    return {
      tools: TOOL_LAUNCH_CATALOG.map((descriptor) => {
        const row = byCode.get(descriptor.pricingCode) || null;
        const plan = resolvePlan(pricingOf(row), policy);
        return {
          toolCode: descriptor.code,
          pricingCode: descriptor.pricingCode,
          name: descriptor.name,
          configured: !!row,
          mode: row?.mode || 'FREE',
          billingCycle: row?.billingCycle || 'FREE',
          unitPriceAmount: Number(row?.unitPriceAmount ?? 0),
          freeQuotaAmount: Number(row?.freeQuotaAmount ?? 0),
          minChargeAmount: Number(row?.minChargeAmount ?? 0.01),
          usageUnitSize: row?.usageUnitSize ?? 1,
          launchEnabled: row ? row.launchEnabled === 1 : true,
          usageBilled: row ? row.usageBilled === 1 : false,
          enabled: row ? row.enabled === 1 : false,
          ownBilling: !!descriptor.ownBilling,
          note: ownBillingNote(descriptor.ownBilling, row) || plan.note,
          stats: statsOf(perToolRows, descriptor.code),
        };
      }),
      policy: {
        graceHours: policy.graceHours,
        transitionDays: policy.transitionDays,
        suspendOnArrears: policy.suspendOnArrears,
        legacyAnchor: policy.legacyAnchor,
      },
      counters: {
        active: counts.get('ACTIVE') || 0,
        trial: counts.get('TRIAL') || 0,
        arrears: counts.get('ARREARS') || 0,
        stopped: counts.get('STOPPED') || 0,
        unpaidBills,
        pointsCharged30d: Number(charged._sum.pointsAmount ?? 0),
      },
    };
  }

  async savePricing(body: ToolLaunchPricingSaveBody, operator: string) {
    const descriptor = TOOL_LAUNCH_CATALOG.find(
      (item) => item.code === body.tool,
    );
    if (!descriptor)
      throw new BusinessException(ErrorCode.NOT_FOUND, '未知的建站工具');
    if (descriptor.ownBilling) {
      // 这一行的单价同时是独立站月账价：只允许在「价目与用量」维护，别处改会把两套口径带偏
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `「${descriptor.name}」的积分按站点数每月出账，请在「价目与用量」维护 ${descriptor.pricingCode} 价目；本页只管它的启动闸`,
      );
    }
    const existing = await this.prisma.modulePricing.findUnique({
      where: { code: descriptor.pricingCode },
    });
    const nonNeg = (value: number | undefined, fallback: number) =>
      Number(Math.max(0, value ?? fallback).toFixed(4));
    const cycle = body.billingCycle;
    const data = {
      code: descriptor.pricingCode,
      // 周期与按量口径都要 METERED 才会真正出账；FREE 明确写 FREE，避免残留旧值
      mode: cycle === 'FREE' ? 'FREE' : (body.mode ?? 'METERED'),
      unit: existing?.unit || unitOf(cycle),
      unitPriceAmount: nonNeg(body.unitPriceAmount, 0),
      freeQuotaAmount: nonNeg(body.freeQuotaAmount, 0),
      minChargeAmount: nonNeg(body.minChargeAmount, 0.01),
      enabled: body.enabled ? 1 : 0,
      billingCycle: cycle,
      usageUnitSize: Math.max(1, Math.floor(body.usageUnitSize || 1)),
      launchEnabled: body.launchEnabled ? 1 : 0,
      usageBilled:
        body.usageBilled === undefined
          ? (existing?.usageBilled ?? 0)
          : body.usageBilled
            ? 1
            : 0,
    };
    await this.prisma.modulePricing.upsert({
      where: { code: descriptor.pricingCode },
      create: data,
      update: {
        mode: data.mode,
        unitPriceAmount: data.unitPriceAmount,
        freeQuotaAmount: data.freeQuotaAmount,
        minChargeAmount: data.minChargeAmount,
        enabled: data.enabled,
        billingCycle: data.billingCycle,
        usageUnitSize: data.usageUnitSize,
        launchEnabled: data.launchEnabled,
        usageBilled: data.usageBilled,
      },
    });
    // 口径一变就清闸门缓存：否则用户最长要等 30 秒才看到新价，页面与账单会短暂两张嘴
    if (cycle !== existing?.billingCycle) this.launch.invalidateGate();
    this.logger.log(
      `平台管理员 ${operator} 调整「${descriptor.name}」启动计费口径为 ${cycle}`,
    );
    return this.pricingRow(descriptor.code);
  }

  /** 改过渡天数要同步仍在过渡期的台账，否则参数对存量账号是空承诺。 */
  async savePolicy(user: CurrentUser, body: Record<string, unknown>) {
    const policy = await this.settings.save(user, body);
    await this.launch.syncTrialWindows(policy);
    return policy;
  }

  async pricingRow(toolCode: ToolCode) {
    const descriptor = TOOL_LAUNCH_CATALOG.find(
      (item) => item.code === toolCode,
    )!;
    const [row, policy] = await Promise.all([
      this.prisma.modulePricing
        .findUnique({ where: { code: descriptor.pricingCode } })
        .catch(() => null),
      this.settings.view(),
    ]);
    const plan = resolvePlan(pricingOf(row), policy);
    return {
      toolCode: descriptor.code,
      pricingCode: descriptor.pricingCode,
      name: descriptor.name,
      configured: !!row,
      mode: row?.mode || 'FREE',
      billingCycle: row?.billingCycle || 'FREE',
      unitPriceAmount: Number(row?.unitPriceAmount ?? 0),
      freeQuotaAmount: Number(row?.freeQuotaAmount ?? 0),
      minChargeAmount: Number(row?.minChargeAmount ?? 0.01),
      usageUnitSize: row?.usageUnitSize ?? 1,
      launchEnabled: row ? row.launchEnabled === 1 : true,
      enabled: row ? row.enabled === 1 : false,
      ownBilling: !!descriptor.ownBilling,
      note: ownBillingNote(descriptor.ownBilling, row) || plan.note,
      // 契约要求 tools 行必带 stats；漏字段会被统一信封的响应校验打回 500
      stats: statsOf(
        await this.prisma.toolSubscription
          .groupBy({
            by: ['toolCode', 'status'],
            where: { toolCode: descriptor.code },
            _count: { _all: true },
          })
          .catch(() => []),
        descriptor.code,
      ),
    };
  }

  async subscriptions(query: {
    tool?: string;
    status?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize || 20));
    const where: Prisma.ToolSubscriptionWhereInput = {
      ...(query.tool ? { toolCode: query.tool } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword ? { userId: { contains: query.keyword } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.toolSubscription.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.toolSubscription.count({ where }),
    ]);
    const names = await this.users.displayNames(rows.map((row) => row.userId));
    return {
      total,
      rows: rows.map((row) => {
        const descriptor = TOOL_LAUNCH_CATALOG.find(
          (item) => item.code === row.toolCode,
        );
        return {
          id: row.id,
          userId: row.userId,
          username: names.get(row.userId) || row.userId,
          toolCode: row.toolCode,
          toolName: descriptor?.name || row.toolCode,
          status: row.status,
          stopReason: row.stopReason,
          cycleDays: row.cycleDays,
          unitPriceAmount: Number(row.unitPriceAmount),
          billedPeriods: row.billedPeriods,
          periodStart: iso(row.periodStart),
          periodEnd: iso(row.periodEnd),
          trialEndsAt: iso(row.trialEndsAt),
          arrearsSince: iso(row.arrearsSince),
          offReason: row.offReason,
        };
      }),
    };
  }

  /** 强制停用 / 人工恢复：按 userId 或用户名定位账号。 */
  async resolveTargetUser(key: string): Promise<string> {
    const raw = key.trim();
    if (!raw)
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请填写账号 ID 或用户名',
      );
    const byId = await this.prisma.userDirectory
      .findUnique({ where: { userId: raw }, select: { userId: true } })
      .catch(() => null);
    if (byId) return byId.userId;
    const byName = await this.prisma.userDirectory
      .findFirst({ where: { username: raw }, select: { userId: true } })
      .catch(() => null);
    if (byName) return byName.userId;
    throw new BusinessException(
      ErrorCode.NOT_FOUND,
      `找不到账号「${raw}」：请填写站内账号 ID 或用户名`,
    );
  }
}

type PricingRow = Prisma.ModulePricingGetPayload<Record<string, never>>;

function pricingOf(row: PricingRow | null): PricingInput | null {
  if (!row) return null;
  return {
    mode: row.mode,
    unit: row.unit,
    unitPriceAmount: Number(row.unitPriceAmount),
    freeQuotaAmount: Number(row.freeQuotaAmount),
    minChargeAmount: Number(row.minChargeAmount),
    enabled: row.enabled === 1,
    billingCycle: row.billingCycle,
    usageUnitSize: row.usageUnitSize,
    launchEnabled: row.launchEnabled === 1,
  };
}

/** 自带账单的工具在管理页只解释不编辑：文案与独立站月账口径保持一致，避免两处定价。 */
function unitOf(cycle: string): string {
  if (cycle === 'DAY') return '天';
  if (cycle === 'DAY30') return '30 天';
  if (cycle === 'YEAR') return '年';
  if (cycle === 'USAGE_PV') return '次访问';
  if (cycle === 'USAGE_BYTES') return '字节';
  return '';
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

/** 分工具的运行台数：管理页据此知道「多少人因为这个口径在扣费」。 */
function statsOf(
  rows: { toolCode: string; status: string; _count: { _all: number } }[],
  toolCode: string,
) {
  const blank = { active: 0, trial: 0, arrears: 0, stopped: 0 };
  for (const row of rows) {
    if (row.toolCode !== toolCode) continue;
    const key =
      row.status === 'ACTIVE'
        ? 'active'
        : row.status === 'TRIAL'
          ? 'trial'
          : row.status === 'ARREARS'
            ? 'arrears'
            : 'stopped';
    blank[key] += row._count._all;
  }
  return blank;
}
