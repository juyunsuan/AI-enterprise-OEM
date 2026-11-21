import {
  HEALTH_ORDER_BIZ_TYPE_LABELS,
  type HealthOrderStatus,
  type HealthOrderBizType,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';

/** 店主侧对订单的显式动作（与契约 `healthOrderActionBodySchema.action` 一一对应）。 */
export type HealthOrderAction =
  | 'ACCEPT'
  | 'ASSIGN'
  | 'REJECT'
  | 'START'
  | 'COMPLETE'
  | 'SHIP'
  | 'VERIFY'
  | 'REMARK'
  | 'REFUND_APPROVE'
  | 'REFUND_REJECT'
  | 'CANCEL';

export const HEALTH_ORDER_ACTION_LABELS: Record<HealthOrderAction, string> = {
  ACCEPT: '接单',
  ASSIGN: '派单',
  REJECT: '拒单',
  START: '开始服务',
  COMPLETE: '完成',
  SHIP: '发货',
  VERIFY: '核销',
  REMARK: '备注',
  REFUND_APPROVE: '同意退款',
  REFUND_REJECT: '驳回退款',
  CANCEL: '取消订单',
};

/**
 * 状态转换表：唯一实现点。
 *
 * 路径口径（与设计方案 §五 一致）：
 * `PENDING_PAYMENT → PAID →(履约分支)→ SERVING/DELIVERED → COMPLETED → REVIEWED`，
 * 旁路 `CANCELLED/EXPIRED/REFUND_PENDING/REFUNDED/AFTER_SALE_PENDING/AFTER_SALE_DONE`。
 * `REVIEWED` 由评价域推进，不开放为店主动作。
 */
const TRANSITIONS: Record<
  HealthOrderAction,
  Partial<Record<HealthOrderStatus, HealthOrderStatus>>
> = {
  ACCEPT: { PAID: 'ACCEPTED' },
  ASSIGN: { PAID: 'ASSIGNED', ACCEPTED: 'ASSIGNED' },
  REJECT: {
    PAID: 'REFUND_PENDING',
    ACCEPTED: 'REFUND_PENDING',
    ASSIGNED: 'REFUND_PENDING',
  },
  START: { ACCEPTED: 'SERVING', ASSIGNED: 'SERVING' },
  SHIP: { PAID: 'DELIVERED', ACCEPTED: 'DELIVERED' },
  VERIFY: {
    PAID: 'VERIFIED',
    ACCEPTED: 'VERIFIED',
    ASSIGNED: 'VERIFIED',
    SERVING: 'VERIFIED',
  },
  COMPLETE: {
    ACCEPTED: 'COMPLETED',
    SERVING: 'COMPLETED',
    DELIVERED: 'COMPLETED',
    VERIFIED: 'COMPLETED',
  },
  REFUND_APPROVE: {
    REFUND_PENDING: 'REFUNDED',
    AFTER_SALE_PENDING: 'REFUNDED',
  },
  REFUND_REJECT: {
    REFUND_PENDING: 'PAID',
    AFTER_SALE_PENDING: 'DELIVERED',
  },
  CANCEL: { PENDING_PAYMENT: 'CANCELLED', PAID: 'REFUND_PENDING' },
  REMARK: {},
};

/** 必须核销才能完成的业务（到店/权益类）。商品走收货，不走核销。 */
export const VERIFY_REQUIRED_BIZ: ReadonlySet<string> = new Set([
  'REGISTER',
  'EXAM',
  'SIGN_PKG',
  'YEAR_CARD',
  'MEMBER_CARD',
  'GREEN',
]);

/** 只有实物订单能发货。 */
export const SHIPPABLE_BIZ: ReadonlySet<string> = new Set(['GOODS']);

const labelOf = (bizType: string): string =>
  HEALTH_ORDER_BIZ_TYPE_LABELS[bizType as HealthOrderBizType] ?? bizType;

/**
 * 解析动作后的目标状态；非法转换抛业务异常（不静默吞掉）。
 *
 * `REMARK` 不改状态，返回当前状态，由调用方只写备注。
 */
export function resolveTransition(
  action: HealthOrderAction,
  from: HealthOrderStatus,
  bizType: string,
): HealthOrderStatus {
  if (action === 'SHIP' && !SHIPPABLE_BIZ.has(bizType)) {
    throw new BusinessException(
      ErrorCode.CONFLICT,
      `${labelOf(bizType)}订单不走发货流程`,
    );
  }
  if (action === 'VERIFY' && !VERIFY_REQUIRED_BIZ.has(bizType)) {
    throw new BusinessException(
      ErrorCode.CONFLICT,
      `${labelOf(bizType)}订单不需要核销`,
    );
  }
  if (action === 'REMARK') return from;
  const target = TRANSITIONS[action][from];
  if (!target) {
    throw new BusinessException(
      ErrorCode.CONFLICT,
      `当前状态不允许「${HEALTH_ORDER_ACTION_LABELS[action]}」：${labelOf(bizType)}`,
    );
  }
  return target;
}

/** 支付成功后是否直接进入履约（商品待发货，其余待接单）。 */
export function statusAfterPaid(bizType: string): HealthOrderStatus {
  void bizType;
  return 'PAID';
}

/** 可提现时间：完成 + `canTxHours`（0 表示完成即可提）。 */
export function settleableAtOf(finishedAt: Date, canTxHours: number): Date {
  return new Date(finishedAt.getTime() + Math.max(0, canTxHours) * 3600_000);
}

/** 退款是否要回补号源/库存：按交易参数 `refundReleaseSlot` 决定。 */
export function shouldReleaseSlot(releaseSlot: boolean): boolean {
  return releaseSlot;
}
