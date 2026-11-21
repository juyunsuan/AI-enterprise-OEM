import { safeText } from './text';
import { clampCents, fromCents } from './money';
import { ORDER_STATUS, orderStatusOf } from './order-machine';

/**
 * 售后域：可申请判定、退款金额口径、退款副作用的幂等协议。
 *
 * 副作用幂等是这套中台的关键：退款打款成功后还要回补库存、退券、扣回赠分，
 * 每一步都可能失败重跑，所以每步完成态都写进同一行 JSON，重跑只补没做完的那几步，
 * 已经做完的步骤绝不二次执行。
 */

export const AFTERSALE_TYPES = ['REFUND_ONLY', 'RETURN_REFUND'] as const;
export type AftersaleType = (typeof AFTERSALE_TYPES)[number];
export const AFTERSALE_TYPE_LABELS: Record<AftersaleType, string> = {
  REFUND_ONLY: '仅退款',
  RETURN_REFUND: '退货退款',
};

/** 售后单自身的流转态；订单上的汇总态另列。 */
export const AFTERSALE_STATUS = {
  PENDING: 'PENDING',
  AGREED: 'AGREED',
  REJECTED: 'REJECTED',
  REFUNDED: 'REFUNDED',
  CANCELLED: 'CANCELLED',
} as const;
export type AftersaleStatus =
  (typeof AFTERSALE_STATUS)[keyof typeof AFTERSALE_STATUS];
export const AFTERSALE_STATUS_LABELS: Record<AftersaleStatus, string> = {
  PENDING: '待处理',
  AGREED: '待买家退货',
  REJECTED: '售后驳回',
  REFUNDED: '已退款',
  CANCELLED: '已取消',
};

/** 业务侧追加的前置规则：返回空串表示放行，否则作为阻断原因。 */
export type AftersaleExtraRule = (
  input: AftersaleAdmissionInput,
) => string | undefined;

export interface AftersaleAdmissionInput {
  orderStatus: string;
  type: AftersaleType;
  /** 店铺交易参数：是否允许顾客申请售后。 */
  refundEnabled: boolean;
  /** 确认收货后 N 天内可申请，0 = 不限。 */
  daysLimit: number;
  completedAt?: Date | null;
  requiresShipping: boolean;
  /** 该行是否已在售后流程中（含进行中与已退过款但未终态）。 */
  alreadyInAftersale?: boolean;
  now?: Date;
}

export interface AftersaleAdmission {
  ok: boolean;
  reason: string;
  /** 命中的规则键，日志与埋点用它统计各规则的拦截量。 */
  rule: string;
}

/** 规则按顺序短路：先判开关，再判订单状态，最后判时限。 */
export function checkAftersaleAdmission(
  input: AftersaleAdmissionInput,
  extraRules: AftersaleExtraRule[] = [],
): AftersaleAdmission {
  const reject = (rule: string, reason: string): AftersaleAdmission => ({
    ok: false,
    rule,
    reason,
  });
  const pass = (rule = 'PASS'): AftersaleAdmission => ({
    ok: true,
    rule,
    reason: '',
  });

  if (!input.refundEnabled) {
    return reject('DISABLED', '该商城未开启售后，请联系商家');
  }
  const status = orderStatusOf(input.orderStatus);
  if (
    status !== ORDER_STATUS.PAID &&
    status !== ORDER_STATUS.SHIPPED &&
    status !== ORDER_STATUS.COMPLETED
  ) {
    return reject('STATUS', '该订单当前不能申请售后');
  }
  if (input.alreadyInAftersale) {
    return reject('IN_PROGRESS', '该商品已在售后流程中');
  }
  if (input.type === 'RETURN_REFUND' && !input.requiresShipping) {
    return reject('VIRTUAL_NO_RETURN', '虚拟商品不涉及退货，请选择仅退款');
  }
  const daysLimit = Math.max(0, Math.round(input.daysLimit || 0));
  if (daysLimit > 0 && input.completedAt) {
    const now = input.now ?? new Date();
    if (now.getTime() - input.completedAt.getTime() > daysLimit * 86_400_000) {
      return reject('WINDOW', `确认收货超过 ${daysLimit} 天，已超出售后时限`);
    }
  }
  for (const rule of extraRules) {
    const reason = rule(input);
    if (reason) return reject('CUSTOM', reason);
  }
  return pass();
}

/** 一行的剩余可退金额（分）。 */
export function refundableCents(
  totalCents: number,
  refundedCents: number,
): number {
  return Math.max(0, clampCents(totalCents) - clampCents(refundedCents));
}

export interface RefundAmountResult {
  ok: boolean;
  cents: number;
  reason: string;
}

/**
 * 申请金额口径：必须落在 (0, 剩余可退] 区间。
 * 与实现保持一致——不允许 0 元售后，避免用「零元退款」代替关闭售后单。
 */
export function resolveRefundAmount(
  requestCents: number,
  leftCents: number,
): RefundAmountResult {
  const left = clampCents(leftCents);
  const cents = clampCents(requestCents);
  if (cents <= 0 || cents > left) {
    return {
      ok: false,
      cents: 0,
      reason: `退款金额需在 0 到 ${fromCents(left)} 元之间`,
    };
  }
  return { ok: true, cents, reason: '' };
}

// ---------------------------------------------------------------- 副作用幂等

export const REFUND_EFFECT_KEYS = [
  'RESTORE_STOCK',
  'RELEASE_COUPON',
  'REVOKE_POINTS',
  'RETURN_POINTS',
  'REVOKE_COMMISSION',
] as const;
export type RefundEffectKey = (typeof REFUND_EFFECT_KEYS)[number];

export interface RefundEffectStep {
  key: string;
  done: boolean;
  /** ISO 字符串：JSON 列两侧都能稳定回读。 */
  at: string;
  error: string;
}

/** 把库里的 JSON 列（数组 / 字符串 / null）归一化成步骤数组。 */
export function normalizeRefundEffects(value: unknown): RefundEffectStep[] {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === 'object',
    )
    .map((item) => ({
      key: safeText(item.key),
      done: item.done === true,
      at: safeText(item.at),
      error: safeText(item.error),
    }))
    .filter((step) => step.key !== '');
}

/** 记一步完成（或失败）：同键覆盖，重跑不会累积重复步骤。 */
export function markRefundEffect(
  steps: RefundEffectStep[],
  key: string,
  options: { done: boolean; at?: Date; error?: string } = { done: true },
): RefundEffectStep[] {
  const at = (options.at ?? new Date()).toISOString();
  const next = steps.filter((step) => step.key !== key);
  next.push({
    key,
    done: options.done,
    at,
    error: safeText(options.error).slice(0, 200),
  });
  return next;
}

/** 还差哪些步骤：已完成的会被跳过，这就是重跑的安全边界。 */
export function pendingRefundEffects(
  steps: RefundEffectStep[],
  required: readonly string[],
): string[] {
  const done = new Set(
    steps.filter((step) => step.done).map((step) => step.key),
  );
  return required.filter((key) => !done.has(key));
}

export function refundEffectsComplete(
  steps: RefundEffectStep[],
  required: readonly string[],
): boolean {
  return pendingRefundEffects(steps, required).length === 0;
}

/** 副作用整体状态，供售后单详情展示「退款成功，回补库存失败」这类部分完成。 */
export function refundEffectStatus(
  steps: RefundEffectStep[],
  required: readonly string[],
): 'NONE' | 'RUNNING' | 'DONE' | 'PARTIAL_FAILED' {
  if (required.length === 0) return 'NONE';
  const done = pendingRefundEffects(steps, required);
  if (done.length === 0) return 'DONE';
  const failed = steps.some((step) => !step.done && step.error !== '');
  if (steps.some((step) => step.done))
    return failed ? 'PARTIAL_FAILED' : 'RUNNING';
  return failed ? 'PARTIAL_FAILED' : 'NONE';
}
