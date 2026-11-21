/**
 * 启动计费口径的**唯一纯函数层**：平台管理员在价目表上配的口径，
 * 由这里同时产出「启动页文案」与「日批出账金额」，两处共用一份算法——
 * 页面说多少钱，就只会扣多少钱，杜绝两套口径各说各话。
 *
 * 周期口径按「启动时刻锚定的滚动账期」推进（每 cycleDays 天一期），
 * 不用自然月：自然月的首末残缺天数需要折算说明，用户算不清、客服也讲不明白。
 */

export const BILLING_CYCLES = [
  'FREE',
  'DAY',
  'DAY30',
  'YEAR',
  'USAGE_PV',
  'USAGE_BYTES',
  'USAGE_VIEW',
] as const;

export type BillingCycle = (typeof BILLING_CYCLES)[number];

/** 周期口径的账期天数；按量与免费口径不参与周期出账。 */
export const CYCLE_DAYS: Partial<Record<BillingCycle, number>> = {
  DAY: 1,
  DAY30: 30,
  YEAR: 365,
};

const CYCLE_LABEL: Record<BillingCycle, string> = {
  FREE: '免费',
  DAY: '按日',
  DAY30: '按 30 天',
  YEAR: '按年',
  USAGE_PV: '按访问',
  USAGE_BYTES: '按流量',
  USAGE_VIEW: '按浏览量',
};

const UNIT_LABEL: Record<BillingCycle, string> = {
  FREE: '',
  DAY: '天',
  DAY30: '30 天',
  YEAR: '年',
  USAGE_PV: '次访问',
  USAGE_BYTES: '字节',
  USAGE_VIEW: '次浏览',
};

/** `module_pricing` 行（数值已转 number）＋平台策略，构成定价输入。 */
export type PricingInput = {
  mode: string;
  unit: string;
  unitPriceAmount: number;
  freeQuotaAmount: number;
  minChargeAmount: number;
  enabled: boolean;
  billingCycle: string;
  usageUnitSize: number;
  launchEnabled: boolean;
  /** 按量口径是否真正出账（默认 false＝只计量）；建站工具可按价目行单独开启。 */
  usageBilled?: boolean;
};

export type PolicyInput = {
  /** 欠费后停服宽限小时数。 */
  graceHours: number;
  /** 存量账号的免费过渡天数。 */
  transitionDays: number;
};

export type LaunchPlan = {
  cycle: BillingCycle;
  cycleLabel: string;
  /** 账期天数：按日 1 / 按 30 天 30 / 按年 365；按量与免费为 0。 */
  cycleDays: number;
  unitLabel: string;
  /** 每期（或每个计量粒度）单价，积分。 */
  unitPrice: number;
  /** 周期口径：启动后前 N 期免费（价目表 free_quota_amount 的语义）。 */
  freePeriods: number;
  /** 按量口径：每期免费量（单位同 unitLabel）。 */
  freeQuantity: number;
  /** 按量口径的计量粒度（每 1000 次访问＝1000）。 */
  usageUnitSize: number;
  minCharge: number;
  /** 是否真的会扣积分：价目启用 + METERED + 单价>0 + 周期口径。 */
  billingEnabled: boolean;
  /** 平台是否允许用户自助启动。 */
  launchAllowed: boolean;
  /** 按量口径本期是否出账（本期恒 false，只计量）。 */
  usageBilled: boolean;
  graceHours: number;
  transitionDays: number;
  /** 一句话口径：启动确认弹层、账单备注、平台台账三处共用。 */
  note: string;
};

const round4 = (value: number) => Math.round(value * 10000) / 10000;

const num = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function normalizeCycle(value: unknown): BillingCycle {
  const raw = (typeof value === 'string' ? value : '').trim().toUpperCase();
  return (BILLING_CYCLES as readonly string[]).includes(raw)
    ? (raw as BillingCycle)
    : 'FREE';
}

/** 字节粒度的人话显示：够整 GB 就说 GB，否则 MB / 字节。 */
export function bytesLabel(bytes: number): string {
  const value = num(bytes);
  if (value >= 1073741824 && value % 1073741824 === 0)
    return `${value / 1073741824} GB`;
  if (value >= 1048576 && value % 1048576 === 0) return `${value / 1048576} MB`;
  return `${value} 字节`;
}

function usageLabel(cycle: BillingCycle) {
  if (cycle === 'USAGE_VIEW') return '浏览';
  if (cycle === 'USAGE_BYTES') return '流量';
  return '访问';
}

function usageQuantityLabel(cycle: BillingCycle, value: number) {
  if (cycle === 'USAGE_BYTES') return bytesLabel(value);
  return `${value} 次${usageLabel(cycle)}`;
}

function buildNote(plan: Omit<LaunchPlan, 'note'>): string {
  const grace = `余额不足先进入欠费，宽限 ${plan.graceHours} 小时后停服，充值后自动补扣并恢复`;
  if (
    plan.cycle === 'USAGE_PV' ||
    plan.cycle === 'USAGE_BYTES' ||
    plan.cycle === 'USAGE_VIEW'
  ) {
    const label = usageLabel(plan.cycle);
    const granularity =
      plan.cycle === 'USAGE_BYTES'
        ? bytesLabel(plan.usageUnitSize)
        : `${plan.usageUnitSize} 次${label}`;
    const free =
      plan.freeQuantity > 0
        ? `；每期前 ${plan.cycle === 'USAGE_BYTES' ? bytesLabel(plan.freeQuantity) : `${plan.freeQuantity} 次${label}`} 免费`
        : '';
    if (!plan.usageBilled) {
      return `按${label}计费：${plan.unitPrice} 积分/${granularity}${free}。当前只计量、暂未出账，正式扣积分前会在本页公示。`;
    }
    return `按${label}计费：${plan.unitPrice} 积分/${granularity}${free}；每期结束后按实际用量出账，${grace}。`;
  }
  const cycleDays = CYCLE_DAYS[plan.cycle];
  if (!cycleDays || !plan.billingEnabled) {
    return plan.cycle === 'FREE'
      ? '当前免费：启动不扣积分，可随时停止，数据始终保留。'
      : `${plan.cycleLabel}计价，但平台尚未启用扣费（未配单价或计费被关闭）：启动不扣积分。`;
  }
  const renewal =
    plan.cycle === 'DAY'
      ? '之后每天到期自动续扣'
      : plan.cycle === 'YEAR'
        ? '之后每年到期自动续扣'
        : '之后每 30 天到期自动续扣';
  const free =
    plan.freePeriods > 0 ? `；启动后前 ${plan.freePeriods} 期免费` : '';
  const minCharge =
    plan.minCharge > 0 ? `；单笔账单不低于 ${plan.minCharge} 积分` : '';
  return `${plan.cycleLabel}计费：${plan.unitPrice} 积分/${plan.unitLabel}。启动即扣首期，${renewal}${free}${minCharge}；${grace}。停止后不再产生新账单，数据保留。`;
}

/** 价目行 + 平台策略 → 生效口径。缺行按「免费且允许启动」处理，绝不因为没配价就把功能锁死。 */
export function resolvePlan(
  row: PricingInput | null,
  policy: PolicyInput,
): LaunchPlan {
  const cycle = normalizeCycle(row?.billingCycle);
  const cycleDays = CYCLE_DAYS[cycle] ?? 0;
  const unitPrice = round4(Math.max(0, num(row?.unitPriceAmount)));
  const quota = round4(Math.max(0, num(row?.freeQuotaAmount)));
  const base = {
    cycle,
    cycleLabel: CYCLE_LABEL[cycle],
    cycleDays,
    unitLabel: row?.unit?.trim() || UNIT_LABEL[cycle],
    unitPrice,
    freePeriods: cycleDays ? Math.floor(quota) : 0,
    freeQuantity: cycleDays ? 0 : quota,
    usageUnitSize: Math.max(1, Math.floor(num(row?.usageUnitSize, 1))),
    minCharge: round4(Math.max(0, num(row?.minChargeAmount))),
    // 与既有 METERED 语义同判：价目启用 + 计量模式 + 单价>0，且必须是周期口径
    billingEnabled:
      cycleDays > 0 &&
      !!row &&
      row.enabled &&
      row.mode === 'METERED' &&
      unitPrice > 0,
    launchAllowed: row ? row.launchEnabled : true,
    usageBilled: Boolean(
      row &&
      row.enabled &&
      row.mode === 'METERED' &&
      unitPrice > 0 &&
      row.usageBilled,
    ),
    graceHours: Math.max(0, Math.floor(num(policy.graceHours, 72))),
    transitionDays: Math.max(0, Math.floor(num(policy.transitionDays, 15))),
  };
  return { ...base, note: buildNote(base) };
}

/**
 * 自带账单的工具（国际独立站按站点月账）的口径说明：定价只有一份真源，
 * 这里只是把它翻成人话；管理页与用户启动页共用，免得两处各写一套数字。
 */
export function ownBillingNote(
  ownBilling: boolean | undefined,
  row: { unitPriceAmount?: unknown; freeQuotaAmount?: unknown } | null,
): string {
  if (!ownBilling) return '';
  const price = Number(row?.unitPriceAmount ?? 0);
  const free = Number(row?.freeQuotaAmount ?? 0);
  if (!price) return '积分按站点数每月出账；当前单价未配置，等于不扣积分';
  return `积分按站点数每月出账：${price} 积分/站·月${
    free > 0 ? `，每个账号前 ${free} 个站点免费` : ''
  }；不在这条链上叠加周期账单`;
}

/** 账期锚点 → 本期起止（幂等键不在这里：见 `periodKeyOf`，键必须由「已持久化的期次」推导，不能带请求时刻）。 */
export function periodOf(
  start: Date,
  cycleDays: number,
): { periodStart: Date; periodEnd: Date } {
  const days = Math.max(1, Math.floor(cycleDays));
  const periodStart = new Date(start.getTime());
  const periodEnd = new Date(periodStart.getTime() + days * 86400_000);
  return { periodStart, periodEnd };
}

/**
 * 出账幂等键＝第几期，而不是起点时间。
 *
 * 用时间当键会漏掉两类重复：同一期被两个并发「启动」请求各算出一个键（双击即双扣），
 * 以及日批跑挂后第二天重跑算出新键（同一期再扣一次）。期次是库里的持久计数，
 * 两个竞争者必然算出同一个值，唯一索引这才真正兜住「一期只收一次钱」。
 */
export function periodKeyOf(periodNo: number): string {
  return `P${Math.max(1, Math.floor(periodNo))}`;
}

export type PeriodCharge = {
  amount: number;
  waived: boolean;
  /** 免单原因，写进账单备注，别让用户猜。 */
  reason: string;
};

/**
 * 第 periodIndex 期（从 0 起）应扣多少：未启用扣费、按量口径、前 N 期免费都落 WAIVED，
 * 金额为 0 但账单照记，台账上能看出「这一期为什么没扣」。
 */
export function chargeForPeriod(
  plan: LaunchPlan,
  periodIndex: number,
): PeriodCharge {
  if (
    plan.cycle === 'USAGE_PV' ||
    plan.cycle === 'USAGE_BYTES' ||
    plan.cycle === 'USAGE_VIEW'
  ) {
    return {
      amount: 0,
      waived: true,
      reason: '按量口径本期只计量、期末按实际用量出账',
    };
  }
  if (!plan.billingEnabled || plan.unitPrice <= 0) {
    return { amount: 0, waived: true, reason: '平台未启用扣费' };
  }
  if (periodIndex < plan.freePeriods) {
    return { amount: 0, waived: true, reason: `前 ${plan.freePeriods} 期免费` };
  }
  const amount = round4(
    plan.unitPrice < plan.minCharge ? plan.minCharge : plan.unitPrice,
  );
  return { amount, waived: false, reason: plan.note };
}

/**
 * 按量口径的期末结算金额：先扣每期免费量，再按 `usageUnitSize` 向上取整，
 * 最后乘单价；有可计费量但金额低于起扣额时按起扣额收。纯函数，账单页与后台预览共用。
 */
export function chargeForUsage(
  plan: LaunchPlan,
  quantity: number,
): PeriodCharge & { billableQuantity: number; units: number } {
  if (!plan.usageBilled || plan.unitPrice <= 0) {
    return {
      amount: 0,
      waived: true,
      billableQuantity: 0,
      units: 0,
      reason: '平台未启用按量扣费',
    };
  }
  const used = Math.max(0, Number(quantity) || 0);
  const billableQuantity = Math.max(0, used - plan.freeQuantity);
  if (billableQuantity <= 0) {
    return {
      amount: 0,
      waived: true,
      billableQuantity: 0,
      units: 0,
      reason: `本期用量 ${usageQuantityLabel(plan.cycle, used)} 未超过免费额`,
    };
  }
  const units = Math.ceil(billableQuantity / plan.usageUnitSize);
  const raw = round4(units * plan.unitPrice);
  const amount = round4(Math.max(raw, plan.minCharge));
  return {
    amount,
    waived: false,
    billableQuantity,
    units,
    reason: `${usageQuantityLabel(plan.cycle, used)}，超出免费额 ${usageQuantityLabel(plan.cycle, billableQuantity)}，按 ${units} 个计费单位结算`,
  };
}
