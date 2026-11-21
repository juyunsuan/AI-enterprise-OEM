import type { Prisma } from '../../generated/prisma';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { Logger } from '../common/logger';
import { markToolHit } from '../common/request-context';
import { settleUsageOnStop } from './tool-launch.billing.holder';
import type { PointsService } from '../points/points.service';
import type { PrismaService } from '../prisma/prisma.service';
import {
  TOOL_LAUNCH_CATALOG,
  launchPathOf,
  toolDescriptor,
  type ToolCode,
  type ToolDescriptor,
} from './tool-launch.catalog';
import {
  chargeForPeriod,
  ownBillingNote,
  periodKeyOf,
  periodOf,
  resolvePlan,
  type LaunchPlan,
  type PricingInput,
} from './tool-launch.pricing';
import {
  ToolLaunchSettingsService,
  type ToolLaunchSettings,
} from './tool-launch.settings.service';
import { resumeArrearsBill, settlePeriod } from './tool-launch.settle';

/**
 * 建站工具「启动设置」的服务层：状态机 + 启动预付 + 闸门读取。
 *
 * 状态机（`tool_subscriptions.status`）：
 *   STOPPED ──start──▶ ACTIVE ──到期扣费失败──▶ ARREARS ──超宽限──▶ STOPPED(ARREARS)
 *      ▲                  │                        │                      │
 *      └──────stop────────┘                        └──充值补扣（日批）──────┘
 *   存量已上线账号上线即落 TRIAL（免费过渡期），到期由日批转 ACTIVE 并出首期。
 *
 * 铁律：**未启动不产生任何账单**。周期推进、补扣、停服全部只在 status 为
 * ACTIVE / ARREARS / TRIAL 的行上发生；STOPPED 行永远不出账，用户停止即止扣。
 */

export type SubscriptionStatus = 'STOPPED' | 'TRIAL' | 'ACTIVE' | 'ARREARS';
export type StopReason = '' | 'NOT_STARTED' | 'USER' | 'ARREARS' | 'PLATFORM';

const OPEN_STATUSES: SubscriptionStatus[] = ['TRIAL', 'ACTIVE', 'ARREARS'];

/** 闸门读取的缓存时长：C 端每个请求都可能问一次，30 秒足够让停服即时可见。 */
const GATE_CACHE_MS = 30_000;
/** 闸门缓存条数上限：超了先清过期项，再退化成丢最旧的一半。 */
const GATE_CACHE_MAX = 20_000;

export type ToolLaunchState = {
  toolCode: ToolCode;
  name: string;
  path: string;
  launchPath: string;
  summary: string;
  /** 已有独立账单体系（国际独立站）：启动只是功能闸，本模块不再出周期账。 */
  ownBilling: boolean;
  status: SubscriptionStatus;
  stopReason: StopReason;
  startedAt: Date | null;
  stoppedAt: Date | null;
  trialEndsAt: Date | null;
  cycleDays: number;
  unitPrice: number;
  periodStart: Date | null;
  periodEnd: Date | null;
  billedPeriods: number;
  arrearsSince: Date | null;
  offBy: string;
  offReason: string;
  plan: LaunchPlan;
  /** 本期是否可用（闸门口径的单一答案）。 */
  open: boolean;
  /** 下一次扣费时点：ACTIVE＝账期末，TRIAL＝过渡期止，其余为 null。 */
  nextChargeAt: Date | null;
  nextChargeAmount: number;
};

type Row = Prisma.ToolSubscriptionGetPayload<object>;

function statusOf(row: string | Row | null | undefined): SubscriptionStatus {
  const value = String(
    typeof row === 'string' ? row : row?.status || 'STOPPED',
  );
  return (OPEN_STATUSES.concat('STOPPED') as string[]).includes(value)
    ? (value as SubscriptionStatus)
    : 'STOPPED';
}

type PricingRow = Prisma.ModulePricingGetPayload<Record<string, never>>;
type DailyRow = { pv: number; views: number; bytes: bigint; orders: number };

function pricingInputOf(row: PricingRow | null): PricingInput | null {
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
    usageBilled: row.usageBilled === 1,
  };
}

/**
 * 价目行 → 启动口径：自带账单的工具（国际独立站按站点月账）在这里就把文案换成月账口径，
 * 用户启动页与管理页因此共用同一份说明，不会再出现「按 30 天预付」这种与真实扣费不符的说法。
 */
function planOf(
  descriptor: ToolDescriptor,
  row: PricingRow | null,
  policy: ToolLaunchSettings,
): LaunchPlan {
  const plan = resolvePlan(pricingInputOf(row), policy);
  return descriptor.ownBilling
    ? { ...plan, note: ownBillingNote(true, row) || plan.note }
    : plan;
}

export class ToolLaunchService {
  private readonly logger = new Logger(ToolLaunchService.name);
  private readonly gateCache = new Map<string, { at: number; open: boolean }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly points: PointsService,
    private readonly settings: ToolLaunchSettingsService,
  ) {}

  // ---------------------------------------------------------------- 读取

  async planFor(code: ToolCode): Promise<LaunchPlan> {
    const descriptor = toolDescriptor(code);
    if (!descriptor)
      throw new BusinessException(ErrorCode.NOT_FOUND, '未知的建站工具');
    const [row, policy] = await Promise.all([
      this.prisma.modulePricing
        .findUnique({ where: { code: descriptor.pricingCode } })
        .catch(() => null),
      this.settings.view(),
    ]);
    return planOf(descriptor, row, policy);
  }

  /** 9 个工具一次批量取价目行：卡片页与状态页共用，避免每工具两条查询。 */
  private async planMap(): Promise<Map<ToolCode, LaunchPlan>> {
    const [rows, policy] = await Promise.all([
      this.prisma.modulePricing
        .findMany({
          where: {
            code: { in: TOOL_LAUNCH_CATALOG.map((i) => i.pricingCode) },
          },
        })
        .catch(() => []),
      this.settings.view(),
    ]);
    const byCode = new Map(rows.map((row) => [row.code, row]));
    return new Map(
      TOOL_LAUNCH_CATALOG.map((item) => [
        item.code,
        planOf(item, byCode.get(item.pricingCode) || null, policy),
      ]),
    );
  }

  /** 卡片页与横幅：一次取回 9 个工具的启动状态（缺行的存量账号在这里补建过渡期台账）。 */
  async states(userId: string): Promise<ToolLaunchState[]> {
    const [rows, policy, plans] = await Promise.all([
      this.prisma.toolSubscription.findMany({ where: { userId } }),
      this.settings.view(),
      this.planMap(),
    ]);
    const byCode = new Map(rows.map((row) => [row.toolCode, row]));
    const out: ToolLaunchState[] = [];
    for (const descriptor of TOOL_LAUNCH_CATALOG) {
      const plan = plans.get(descriptor.code)!;
      let row = byCode.get(descriptor.code) || null;
      if (!row)
        row = await this.ensureRow(
          userId,
          descriptor,
          policy,
          new Date(),
          plan,
        );
      out.push(this.view(descriptor, row, plan, policy));
    }
    return out;
  }

  async state(userId: string, code: ToolCode): Promise<ToolLaunchState> {
    const descriptor = toolDescriptor(code);
    if (!descriptor)
      throw new BusinessException(ErrorCode.NOT_FOUND, '未知的建站工具');
    const [plan, policy] = await Promise.all([
      this.planFor(code),
      this.settings.view(),
    ]);
    const stored = await this.prisma.toolSubscription
      .findUnique({ where: { userId_toolCode: { userId, toolCode: code } } })
      .catch(() => null);
    const row =
      stored ||
      (await this.ensureRow(userId, descriptor, policy, new Date(), plan));
    return this.view(descriptor, row, plan, policy);
  }

  /** 启动设置页：状态 + 最近账单 + 本账期计量。 */
  async detail(userId: string, code: ToolCode) {
    const [state, bills, balance] = await Promise.all([
      this.state(userId, code),
      this.prisma.toolSubscriptionBill
        .findMany({
          where: { userId, toolCode: code },
          orderBy: { periodStart: 'desc' },
          take: 12,
        })
        .catch(() => []),
      this.points.ensureAccount(userId),
    ]);
    const usage = await this.usageOf(
      userId,
      code,
      state.periodStart || state.startedAt || new Date(),
    );
    return {
      state,
      balanceAmount: Number(balance.balanceAmount),
      bills: bills.map((bill) => ({
        id: bill.id,
        periodKey: bill.periodKey,
        periodStart: bill.periodStart,
        periodEnd: bill.periodEnd,
        days: bill.days,
        billingMode: bill.billingMode,
        pointsAmount: Number(bill.pointsAmount),
        status: bill.status,
        remark: bill.remark,
      })),
      usage,
    };
  }

  /** 本账期累计的访问 / 流量（本期只计量，不出账）。 */
  async usageOf(userId: string, code: ToolCode, since: Date) {
    // day 列是自然日：比较前先归到 UTC 零点，否则账期首日的计量会被 gte 漏掉
    const from = new Date(
      Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate()),
    );
    const rows: DailyRow[] = await this.prisma.toolUsageDaily
      .findMany({
        where: { userId, toolCode: code, day: { gte: from } },
        orderBy: { day: 'asc' },
        take: 400,
      })
      .catch(() => []);
    return rows.reduce(
      (acc, row) => ({
        pv: acc.pv + row.pv,
        views: acc.views + Number(row.views || 0),
        bytes: acc.bytes + Number(row.bytes),
        orders: acc.orders + row.orders,
        days: acc.days + 1,
      }),
      { pv: 0, views: 0, bytes: 0, orders: 0, days: 0 },
    );
  }

  // ---------------------------------------------------------------- 闸门

  /** 闸门唯一读入口：带 30 秒缓存，C 端与管理端中间件共用同一答案。 */
  async isOpen(code: ToolCode, userId: string): Promise<boolean> {
    if (!toolDescriptor(code)) return true;
    const key = `${code}:${userId}`;
    const hit = this.gateCache.get(key);
    if (hit && Date.now() - hit.at < GATE_CACHE_MS) return hit.open;
    const row = await this.prisma.toolSubscription
      .findUnique({
        where: { userId_toolCode: { userId, toolCode: code } },
        select: { status: true },
      })
      .catch(() => null);
    // 没有台账行＝从没打开过该工具（存量账号的过渡期行由页面读取时补建），
    // 但公开通道不能因为「用户还没进过启动页」就把正在营业的店挡掉，
    // 所以缺行时先跑一次过渡期判定：有存量数据即视为可用。
    const open = row
      ? OPEN_STATUSES.includes(statusOf(row.status))
      : await this.legacyOpen(code, userId);
    this.rememberGate(key, open);
    return open;
  }

  /**
   * 未启动 / 欠费停服 / 平台停用：一律抛出带跳转地址的业务异常。
   * 放行时顺手把「哪个工具、哪个站主」记进请求上下文，公开通道的计量中间件据此落 PV 与流量。
   */
  async blockIfStopped(code: ToolCode, userId: string): Promise<void> {
    if (await this.isOpen(code, userId)) {
      markToolHit({ code, userId });
      return;
    }
    const descriptor = toolDescriptor(code)!;
    const row = await this.prisma.toolSubscription
      .findUnique({ where: { userId_toolCode: { userId, toolCode: code } } })
      .catch(() => null);
    const reason = String(row?.stopReason || 'NOT_STARTED');
    const head =
      reason === 'ARREARS'
        ? `「${descriptor.name}」因积分欠费已停服：小程序端不可访问、站内配置只读`
        : reason === 'PLATFORM'
          ? `「${descriptor.name}」已由平台暂停：${row?.offReason || '请联系平台客服'}`
          : `「${descriptor.name}」尚未启动：小程序端不可访问、站内配置只读`;
    throw new BusinessException(
      ErrorCode.TOOL_NOT_STARTED,
      `${head}。未启动期间不扣积分，启动后自动恢复。请前往「启动设置」查看计费规则并启动：${launchPathOf(code)}`,
      {
        toolCode: code,
        toolName: descriptor.name,
        reason,
        startUrl: launchPathOf(code),
      },
    );
  }

  async requireStarted(code: ToolCode, userId: string): Promise<void> {
    return this.blockIfStopped(code, userId);
  }

  /**
   * C 端闸门：只回答「可不可用」，绝不抛错。
   * 各条公开通道都有自己的停服响应形状（小程序端已按那个形状做了降级页），
   * 在这里抛 403 会让 9 个端各自弹出一句没人看得懂的英文错误。
   */
  async availableForPublic(code: ToolCode, userId: string): Promise<boolean> {
    const open = await this.isOpen(code, userId);
    if (open) markToolHit({ code, userId });
    return open;
  }

  /**
   * 闸门缓存带上限：`code:userId` 的键空间是「9 个工具 × 访问过启动页的账号」，
   * 不加约束就是一个只增不减的 Map。写满时顺手清掉过期项，长期进程不会靠内存堆着旧判定。
   */
  private rememberGate(key: string, open: boolean) {
    const now = Date.now();
    this.gateCache.set(key, { at: now, open });
    if (this.gateCache.size <= GATE_CACHE_MAX) return;
    for (const [cacheKey, value] of this.gateCache) {
      if (now - value.at >= GATE_CACHE_MS) this.gateCache.delete(cacheKey);
    }
    // 全是新鲜条目（瞬时高并发）时宁可丢掉最旧的一半，也不让容量继续涨
    if (this.gateCache.size > GATE_CACHE_MAX) {
      const cutoff = Math.floor(this.gateCache.size / 2);
      let index = 0;
      for (const cacheKey of this.gateCache.keys()) {
        if (index++ >= cutoff) break;
        this.gateCache.delete(cacheKey);
      }
    }
  }

  invalidateGate(code?: ToolCode, userId?: string) {
    if (code && userId) this.gateCache.delete(`${code}:${userId}`);
    else this.gateCache.clear();
  }

  // ---------------------------------------------------------------- 启停

  /**
   * 启动：先按当期口径预付首期，扣成功才把台账翻成 ACTIVE。
   * 余额不足当场报错并给出充值入口，绝不留下「已启动但没扣到钱」的中间态。
   */
  async start(userId: string, code: ToolCode, operator = '') {
    const descriptor = toolDescriptor(code);
    if (!descriptor)
      throw new BusinessException(ErrorCode.NOT_FOUND, '未知的建站工具');
    const [plan, policy] = await Promise.all([
      this.planFor(code),
      this.settings.view(),
    ]);
    if (!plan.launchAllowed) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        `平台已关闭「${descriptor.name}」的自助启动，请联系平台客服开通`,
      );
    }
    const now = new Date();
    let row = await this.ensureRow(userId, descriptor, policy, now, plan);
    // 平台停用只能由平台解除：用户点「启动」不能把它翻回 ACTIVE，更不能扣钱。
    if (row.offBy) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        `「${descriptor.name}」已被平台停用${row.offReason ? `（原因：${row.offReason}）` : ''}，请联系平台客服恢复后再启动`,
        {
          toolCode: code,
          toolName: descriptor.name,
          startUrl: launchPathOf(code),
        },
      );
    }
    if (statusOf(row) === 'ACTIVE' && row.periodEnd && row.periodEnd > now) {
      return this.view(descriptor, row, plan, policy);
    }
    // 有未补的欠费账单时**先补欠恢复**，不再另起一期：
    // 否则宽限期里点一次"启动"就会为同一段时间付两次钱（新预付 + 旧欠费补扣）。
    const arrears = await this.prisma.toolSubscriptionBill
      .findMany({
        where: { subscriptionId: row.id, status: 'ARREARS' },
        orderBy: { periodEnd: 'asc' },
      })
      .catch(() => []);
    if (arrears.length) {
      for (const bill of arrears) {
        const outcome = await resumeArrearsBill({
          prisma: this.prisma,
          points: this.points,
          row,
          bill,
          plan,
          now,
          interactive: true,
        });
        if (outcome !== 'RESUMED') continue;
        this.invalidateGate(code, userId);
        row = await this.prisma.toolSubscription.findUniqueOrThrow({
          where: { id: row.id },
        });
        return this.view(descriptor, row, plan, policy);
      }
      // 走到这里说明有欠费但没能恢复（还有别的欠费单，或被平台停用）：
      // 绝不能继续往下"另起一期"，否则就是在欠费未清的情况下再收一笔。
      this.invalidateGate(code, userId);
      return this.view(descriptor, row, plan, policy);
    }
    // 「这一段服务已经付过钱、或还在免费过渡期里」的重启：只把功能闸再打开一次，绝不再收一期。
    // 停止 → 再启动 是用户随时做得出的动作，若这里照当期口径再预付一次，
    // 同一段时间就被付了两次（上一期账期还剩很久），违背「只有启动才扣积分」本意。
    const paidWindowOpen = !!row.periodEnd && row.periodEnd > now;
    const trialWindowOpen = !!row.trialEndsAt && row.trialEndsAt > now;
    if (paidWindowOpen || trialWindowOpen) {
      const next = await this.prisma.toolSubscription.update({
        where: { id: row.id },
        data: {
          status: paidWindowOpen ? 'ACTIVE' : 'TRIAL',
          stopReason: '',
          startedAt: row.startedAt || now,
          stoppedAt: null,
          arrearsSince: null,
          cycleDays: plan.cycleDays || row.cycleDays || 30,
          unitPriceAmount: plan.unitPrice,
        },
      });
      this.invalidateGate(code, userId);
      return this.view(descriptor, next, plan, policy);
    }
    const cycleDays = plan.cycleDays || row.cycleDays || 30;
    const period = periodOf(now, cycleDays);
    // 已有独立账单体系的工具（国际独立站按站点月账）：启动只是功能闸，这里绝不出第二套周期账
    const charge = descriptor.ownBilling
      ? { amount: 0, waived: true, reason: '独立账单体系' }
      : chargeForPeriod(plan, row.billedPeriods);
    if (!descriptor.ownBilling && charge.amount > 0) {
      const account = await this.points.ensureAccount(userId);
      const balance = Number(account.balanceAmount);
      if (balance < charge.amount) {
        throw new BusinessException(
          ErrorCode.POINTS_INSUFFICIENT,
          `启动「${descriptor.name}」首期需 ${charge.amount} 积分，当前余额 ${balance}。请先充值再启动：/points`,
          {
            toolCode: code,
            amount: charge.amount,
            balance,
            rechargeUrl: '/points',
            startUrl: launchPathOf(code),
          },
        );
      }
    }
    let billedPeriods = row.billedPeriods;
    const usageCycle =
      plan.cycle === 'USAGE_PV' ||
      plan.cycle === 'USAGE_BYTES' ||
      plan.cycle === 'USAGE_VIEW';
    // 按量口径不预付：启动只开账期，期末由日批按实际用量出账。
    if (!descriptor.ownBilling && !usageCycle) {
      const result = await settlePeriod({
        prisma: this.prisma,
        points: this.points,
        subscriptionId: row.id,
        userId,
        toolCode: code,
        plan,
        periodKey: periodKeyOf(row.billedPeriods + 1),
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        amount: charge.amount,
        periodNo: row.billedPeriods + 1,
        now,
        onInsufficient: 'throw',
      });
      if (result !== 'EXISTS') billedPeriods = row.billedPeriods + 1;
    }
    const next = await this.prisma.toolSubscription.update({
      where: { id: row.id },
      data: {
        status: 'ACTIVE',
        stopReason: '',
        startedAt: row.startedAt || now,
        stoppedAt: null,
        trialEndsAt: null,
        arrearsSince: null,
        cycleDays,
        unitPriceAmount: plan.unitPrice,
        periodStart: descriptor.ownBilling ? null : period.periodStart,
        periodEnd: descriptor.ownBilling ? null : period.periodEnd,
        billedPeriods,
      },
    });
    this.invalidateGate(code, userId);
    if (operator) {
      this.logger.log(
        `${operator} 启动 ${code}（userId=${userId}，首期 ${charge.amount} 积分${
          descriptor.ownBilling ? '，独立账单体系不在此出账' : ''
        }）`,
      );
    }
    return this.view(descriptor, next, plan, policy);
  }

  /** 停止：只翻状态与留痕，数据一律不删；停服后立即起算「不再产生新账单」。 */
  async stop(userId: string, code: ToolCode, reason: StopReason = 'USER') {
    const descriptor = toolDescriptor(code);
    if (!descriptor)
      throw new BusinessException(ErrorCode.NOT_FOUND, '未知的建站工具');
    const [plan, policy] = await Promise.all([
      this.planFor(code),
      this.settings.view(),
    ]);
    const row = await this.prisma.toolSubscription
      .findUnique({ where: { userId_toolCode: { userId, toolCode: code } } })
      .catch(() => null);
    if (!row) return this.view(descriptor, null, plan, policy);
    // 按量口径：停止前把本期已产生的用量结清，避免「停一下就免掉整期用量」
    await settleUsageOnStop(userId, code);
    const next = await this.prisma.toolSubscription.update({
      where: { id: row.id },
      data: {
        status: 'STOPPED',
        stopReason: reason,
        stoppedAt: new Date(),
        arrearsSince: null,
      },
    });
    this.invalidateGate(code, userId);
    return this.view(descriptor, next, plan, policy);
  }

  /** 平台强制停用 / 恢复（欠费自动复活不覆盖人工处置，与独立站同口径）。 */
  async platformToggle(
    userId: string,
    code: ToolCode,
    off: boolean,
    operator: string,
    reason = '',
  ) {
    const descriptor = toolDescriptor(code);
    if (!descriptor)
      throw new BusinessException(ErrorCode.NOT_FOUND, '未知的建站工具');
    const [plan, policy] = await Promise.all([
      this.planFor(code),
      this.settings.view(),
    ]);
    const now = new Date();
    const stored = await this.prisma.toolSubscription
      .findUnique({ where: { userId_toolCode: { userId, toolCode: code } } })
      .catch(() => null);
    const row =
      stored || (await this.ensureRow(userId, descriptor, policy, now, plan));
    const next = await this.prisma.toolSubscription.update({
      where: { id: row.id },
      data: off
        ? {
            status: 'STOPPED',
            stopReason: 'PLATFORM',
            stoppedAt: now,
            offBy: operator,
            offReason: reason.slice(0, 200),
          }
        : {
            status: 'ACTIVE',
            stopReason: '',
            offBy: '',
            offReason: '',
            startedAt: row.startedAt || now,
            periodStart: row.periodStart || now,
            periodEnd:
              row.periodEnd && row.periodEnd > now
                ? row.periodEnd
                : new Date(
                    now.getTime() +
                      (row.cycleDays || plan.cycleDays || 30) * 86400_000,
                  ),
          },
    });
    this.invalidateGate(code, userId);
    return this.view(descriptor, next, plan, policy);
  }

  /** 管理员调整过渡天数：把仍在过渡期的台账一起续期，避免改了参数却对存量不生效。 */
  async syncTrialWindows(policy: ToolLaunchSettings) {
    const res = await this.prisma.toolSubscription.updateMany({
      where: { status: 'TRIAL' },
      data: { trialEndsAt: ToolLaunchSettingsService.trialEndsAt(policy) },
    });
    this.invalidateGate();
    return res.count;
  }

  // ---------------------------------------------------------------- 内部

  /**
   * 缺行补建：有存量站点/店铺 → TRIAL（默认已启动 + 免费过渡期，上线当天不打扰营业）；
   * 全新账号 → STOPPED，必须由用户在启动页亲手启动。
   */
  private async ensureRow(
    userId: string,
    descriptor: ToolDescriptor,
    policy: ToolLaunchSettings,
    now: Date,
    plan: LaunchPlan,
  ): Promise<Row> {
    const existing = await this.prisma.toolSubscription
      .findUnique({
        where: { userId_toolCode: { userId, toolCode: descriptor.code } },
      })
      .catch(() => null);
    if (existing) return existing;
    const legacy = await descriptor
      .countLegacy(this.prisma, userId)
      .catch(() => 0);
    const cycleDays = plan.cycleDays || 30;
    // 自带账单的工具不走过渡期台账：它的扣费本来就跟着站点月账走
    const status =
      legacy > 0 ? (descriptor.ownBilling ? 'ACTIVE' : 'TRIAL') : 'STOPPED';
    const data = {
      userId,
      toolCode: descriptor.code,
      status,
      stopReason: legacy > 0 ? '' : 'NOT_STARTED',
      startedAt: legacy > 0 ? now : null,
      trialEndsAt:
        legacy > 0 && !descriptor.ownBilling
          ? ToolLaunchSettingsService.trialEndsAt(policy, now)
          : null,
      cycleDays,
      unitPriceAmount: plan.unitPrice,
      createdAt: now,
      updatedAt: now,
    };
    try {
      return await this.prisma.toolSubscription.create({ data });
    } catch (error) {
      // 并发首读：另一路已建行，取回对方那行即可
      const row = await this.prisma.toolSubscription
        .findUnique({
          where: { userId_toolCode: { userId, toolCode: descriptor.code } },
        })
        .catch(() => null);
      if (row) return row;
      throw error;
    }
  }

  /** 缺行时是否算「可用」：只在确实有存量数据时放行，避免上线当场打断营业。 */
  private async legacyOpen(code: ToolCode, userId: string): Promise<boolean> {
    const descriptor = toolDescriptor(code);
    if (!descriptor) return true;
    const legacy = await descriptor
      .countLegacy(this.prisma, userId)
      .catch(() => 0);
    return legacy > 0;
  }

  private view(
    descriptor: ToolDescriptor,
    row: Row | null,
    plan: LaunchPlan,
    policy: ToolLaunchSettings,
  ): ToolLaunchState {
    const status = statusOf(row);
    const now = new Date();
    const nextChargeAt =
      status === 'ACTIVE'
        ? row?.periodEnd || null
        : status === 'TRIAL'
          ? row?.trialEndsAt ||
            ToolLaunchSettingsService.trialEndsAt(policy, now)
          : null;
    const charge = chargeForPeriod(plan, row?.billedPeriods ?? 0);
    return {
      toolCode: descriptor.code,
      name: descriptor.name,
      path: descriptor.path,
      launchPath: launchPathOf(descriptor.code),
      summary: descriptor.summary,
      ownBilling: !!descriptor.ownBilling,
      status,
      stopReason: (String(row?.stopReason || '') ||
        (status === 'STOPPED' ? 'NOT_STARTED' : '')) as StopReason,
      startedAt: row?.startedAt || null,
      stoppedAt: row?.stoppedAt || null,
      trialEndsAt: row?.trialEndsAt || null,
      cycleDays: row?.cycleDays || plan.cycleDays || 0,
      unitPrice: Number(row?.unitPriceAmount ?? plan.unitPrice),
      periodStart: row?.periodStart || null,
      periodEnd: row?.periodEnd || null,
      billedPeriods: row?.billedPeriods || 0,
      arrearsSince: row?.arrearsSince || null,
      offBy: row?.offBy || '',
      offReason: row?.offReason || '',
      plan,
      open: status === 'STOPPED' ? false : OPEN_STATUSES.includes(status),
      nextChargeAt,
      // 「下一期扣多少」必须与本次真正会扣的金额同源：未启动时 nextChargeAt 是 null，
      // 但点「启动」当场就要预付首期——若这里回 0，启动确认弹窗会永远显示「余额足够」，
      // 用户只在按下按钮之后才知道钱不够。独立账单体系的工具不在这条链上，保持 0。
      nextChargeAmount: descriptor.ownBilling ? 0 : charge.amount,
    };
  }
}
