import type { RentalOrderAction } from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';

export const RENTAL_SCENE = 'RENTAL' as const;

/** 会占住租品档期的状态：待付款也占，避免并发下单撞车。 */
export const RENTAL_OCCUPYING_STATUSES = [
  'PENDING_PAYMENT',
  'PAID',
  'PICKED_UP',
  'RETURNED',
] as const;

export const RENTAL_CLOSED_STATUSES = [
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
] as const;

const RULES: Record<RentalOrderAction, { from: string[]; to: string }> = {
  pickup: { from: ['PAID'], to: 'PICKED_UP' },
  return: { from: ['PICKED_UP'], to: 'RETURNED' },
  complete: { from: ['RETURNED'], to: 'COMPLETED' },
  refundDeposit: { from: ['COMPLETED'], to: 'COMPLETED' },
  cancel: { from: ['PENDING_PAYMENT', 'PAID'], to: 'CANCELLED' },
  expire: { from: ['PENDING_PAYMENT'], to: 'EXPIRED' },
};

/** 唯一状态迁移表：任何入口改租单状态都走这里。 */
export function transitRentalOrder(action: RentalOrderAction, status: string) {
  const rule = RULES[action];
  if (!rule) {
    throw new BusinessException(
      ErrorCode.BAD_REQUEST,
      `未知的租单动作：${action}`,
    );
  }
  if (!rule.from.includes(status)) {
    throw new BusinessException(
      ErrorCode.ORDER_STATE,
      `当前订单状态不允许「${action}」，请刷新后再试`,
    );
  }
  return rule.to;
}

export function isRentalClosed(status: string) {
  return (RENTAL_CLOSED_STATUSES as readonly string[]).includes(status);
}
