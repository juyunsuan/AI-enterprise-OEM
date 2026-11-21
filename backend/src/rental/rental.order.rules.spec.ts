import { BusinessException } from '../common/business.exception';
import { transitRentalOrder } from './rental.order.rules';

describe('rental order state machine', () => {
  it('allows the normal flow from payment to completion', () => {
    expect(transitRentalOrder('pickup', 'PAID')).toBe('PICKED_UP');
    expect(transitRentalOrder('return', 'PICKED_UP')).toBe('RETURNED');
    expect(transitRentalOrder('complete', 'RETURNED')).toBe('COMPLETED');
  });

  it('rejects pickup before payment', () => {
    expect(() => transitRentalOrder('pickup', 'PENDING_PAYMENT')).toThrow(
      BusinessException,
    );
  });

  it('rejects completing an order that is still in use', () => {
    expect(() => transitRentalOrder('complete', 'PICKED_UP')).toThrow(
      BusinessException,
    );
  });

  it('only expires unpaid orders', () => {
    expect(transitRentalOrder('expire', 'PENDING_PAYMENT')).toBe('EXPIRED');
    expect(() => transitRentalOrder('expire', 'PAID')).toThrow(
      BusinessException,
    );
  });

  it('allows a manual deposit refund only after completion', () => {
    expect(transitRentalOrder('refundDeposit', 'COMPLETED')).toBe('COMPLETED');
    expect(() => transitRentalOrder('refundDeposit', 'RETURNED')).toThrow(
      BusinessException,
    );
  });
});
