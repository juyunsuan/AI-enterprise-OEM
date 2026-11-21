import {
  AFTERSALE_TYPES,
  checkAftersaleAdmission,
  markRefundEffect,
  normalizeRefundEffects,
  pendingRefundEffects,
  refundEffectStatus,
  refundEffectsComplete,
  refundableCents,
  resolveRefundAmount,
} from './aftersale';
import { ORDER_STATUS } from './order-machine';

const base = {
  orderStatus: ORDER_STATUS.PAID,
  type: 'REFUND_ONLY' as (typeof AFTERSALE_TYPES)[number],
  refundEnabled: true,
  daysLimit: 7,
  completedAt: null,
  requiresShipping: true,
};
const DAY = 86_400_000;

describe('commerce-core/aftersale 可申请判定', () => {
  it('规则按开关 → 状态 → 进行中 → 形态 → 时限短路', () => {
    expect(
      checkAftersaleAdmission({ ...base, refundEnabled: false }),
    ).toMatchObject({
      ok: false,
      rule: 'DISABLED',
      reason: '该商城未开启售后，请联系商家',
    });
    expect(
      checkAftersaleAdmission({
        ...base,
        orderStatus: ORDER_STATUS.PENDING_PAYMENT,
      }).rule,
    ).toBe('STATUS');
    expect(
      checkAftersaleAdmission({ ...base, alreadyInAftersale: true }).rule,
    ).toBe('IN_PROGRESS');
    expect(
      checkAftersaleAdmission({
        ...base,
        type: 'RETURN_REFUND',
        requiresShipping: false,
      }).reason,
    ).toBe('虚拟商品不涉及退货，请选择仅退款');
    expect(
      checkAftersaleAdmission({
        ...base,
        orderStatus: ORDER_STATUS.COMPLETED,
        completedAt: new Date(Date.now() - 8 * DAY),
      }),
    ).toMatchObject({
      rule: 'WINDOW',
      reason: '确认收货超过 7 天，已超出售后时限',
    });
  });

  it('时限为 0 表示不限；刚好卡在期限内仍放行', () => {
    expect(
      checkAftersaleAdmission({
        ...base,
        daysLimit: 0,
        orderStatus: ORDER_STATUS.COMPLETED,
        completedAt: new Date(Date.now() - 400 * DAY),
      }).ok,
    ).toBe(true);
    expect(
      checkAftersaleAdmission({
        ...base,
        orderStatus: ORDER_STATUS.COMPLETED,
        completedAt: new Date(Date.now() - 7 * DAY + 60_000),
      }).ok,
    ).toBe(true);
  });

  it('业务追加的规则命中时标记为 CUSTOM', () => {
    const result = checkAftersaleAdmission(
      { ...base, orderStatus: ORDER_STATUS.SHIPPED },
      [
        (input) =>
          input.orderStatus === ORDER_STATUS.SHIPPED
            ? '本单需先收货再退货'
            : '',
      ],
    );
    expect(result).toMatchObject({
      ok: false,
      rule: 'CUSTOM',
      reason: '本单需先收货再退货',
    });
  });
});

describe('commerce-core/aftersale 退款金额', () => {
  it('剩余可退 = 行金额 − 已退，且不为负', () => {
    expect(refundableCents(10_000, 3_001)).toBe(6_999);
    expect(refundableCents(10_000, 12_000)).toBe(0);
  });

  it('0 元与超额都拒绝，并把可用区间回显', () => {
    expect(resolveRefundAmount(0, 6_999).reason).toBe(
      '退款金额需在 0 到 69.99 元之间',
    );
    expect(resolveRefundAmount(7_000, 6_999).ok).toBe(false);
    expect(resolveRefundAmount(6_999, 6_999)).toMatchObject({
      ok: true,
      cents: 6_999,
    });
  });
});

describe('commerce-core/aftersale 副作用幂等', () => {
  const required = ['RESTORE_STOCK', 'RELEASE_COUPON', 'REVOKE_POINTS'];

  it('JSON 列三种取回形状都能归一化', () => {
    expect(normalizeRefundEffects(null)).toEqual([]);
    expect(normalizeRefundEffects('[]')).toEqual([]);
    expect(
      normalizeRefundEffects([{ key: 'RESTORE_STOCK', done: true }]),
    ).toEqual([{ key: 'RESTORE_STOCK', done: true, at: '', error: '' }]);
  });

  it('重跑只补没做完的步骤，已完成的不二次执行', () => {
    let steps = normalizeRefundEffects([]);
    steps = markRefundEffect(steps, 'RESTORE_STOCK', {
      done: true,
      at: new Date(0),
    });
    steps = markRefundEffect(steps, 'RESTORE_STOCK', {
      done: true,
      at: new Date(0),
    });
    expect(steps).toHaveLength(1);
    expect(pendingRefundEffects(steps, required)).toEqual([
      'RELEASE_COUPON',
      'REVOKE_POINTS',
    ]);
    steps = markRefundEffect(steps, 'RELEASE_COUPON', { done: true });
    expect(refundEffectsComplete(steps, required)).toBe(false);
    steps = markRefundEffect(steps, 'REVOKE_POINTS', {
      done: false,
      error: '积分服务超时',
    });
    expect(refundEffectStatus(steps, required)).toBe('PARTIAL_FAILED');
    expect(pendingRefundEffects(steps, required)).toEqual(['REVOKE_POINTS']);
    steps = markRefundEffect(steps, 'REVOKE_POINTS', { done: true });
    expect(refundEffectStatus(steps, required)).toBe('DONE');
  });

  it('没有副作用的售后单返回 NONE，界面不显示进度', () => {
    expect(refundEffectStatus([], [])).toBe('NONE');
    expect(refundEffectStatus([], required)).toBe('NONE');
    expect(
      refundEffectStatus(
        [{ key: 'RESTORE_STOCK', done: true, at: '', error: '' }],
        required,
      ),
    ).toBe('RUNNING');
  });
});
