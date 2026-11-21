import { quoteOrder } from './health.order.pricing';
import { resolveTransition, settleableAtOf } from './health.order.rules';
import {
  pickRule,
  reverseShareCents,
  splitShares,
} from './health.commission.engine';

describe('健康订单状态机', () => {
  it('受理 → 开始 → 完成', () => {
    expect(resolveTransition('ACCEPT', 'PAID', 'CONSULT_TEXT')).toBe(
      'ACCEPTED',
    );
    expect(resolveTransition('START', 'ACCEPTED', 'CONSULT_TEXT')).toBe(
      'SERVING',
    );
    expect(resolveTransition('COMPLETE', 'SERVING', 'CONSULT_TEXT')).toBe(
      'COMPLETED',
    );
  });

  it('商品只走发货与收货，不走核销', () => {
    expect(resolveTransition('SHIP', 'PAID', 'GOODS')).toBe('DELIVERED');
    expect(resolveTransition('COMPLETE', 'DELIVERED', 'GOODS')).toBe(
      'COMPLETED',
    );
    expect(() => resolveTransition('VERIFY', 'PAID', 'GOODS')).toThrow();
    expect(() => resolveTransition('SHIP', 'PAID', 'EXAM')).toThrow();
  });

  it('挂号必须核销后才能完成', () => {
    expect(resolveTransition('VERIFY', 'PAID', 'REGISTER')).toBe('VERIFIED');
    expect(resolveTransition('COMPLETE', 'VERIFIED', 'REGISTER')).toBe(
      'COMPLETED',
    );
  });

  it('退款审批与驳回', () => {
    expect(resolveTransition('REFUND_APPROVE', 'REFUND_PENDING', 'GOODS')).toBe(
      'REFUNDED',
    );
    expect(resolveTransition('REFUND_REJECT', 'REFUND_PENDING', 'GOODS')).toBe(
      'PAID',
    );
  });

  it('非法转换被拒绝', () => {
    expect(() =>
      resolveTransition('ACCEPT', 'PENDING_PAYMENT', 'EXAM'),
    ).toThrow();
    expect(resolveTransition('CANCEL', 'PENDING_PAYMENT', 'EXAM')).toBe(
      'CANCELLED',
    );
  });

  it('可提现时间 = 完成时间 + canTxHours', () => {
    const finished = new Date('2026-11-01T00:00:00.000Z');
    expect(settleableAtOf(finished, 24).toISOString()).toBe(
      '2026-11-02T00:00:00.000Z',
    );
    expect(settleableAtOf(finished, 0).toISOString()).toBe(
      finished.toISOString(),
    );
  });
});

describe('健康订单算价', () => {
  const lines = [
    { refId: 1, priceCents: 10_000, quantity: 2 },
    { refId: 2, priceCents: 5_000, quantity: 1 },
  ];

  it('明细 → 会员折扣 → 券 → 积分 → 运费 → 实付', () => {
    const quote = quoteOrder({
      bizType: 'GOODS',
      lines,
      memberDiscountPercent: 90,
      coupon: {
        kind: 'FULL_REDUCE',
        valueCents: 2_000,
        discountPercent: 100,
        minAmountCents: 10_000,
        goodsIds: [],
        bizTypes: [],
      },
      points: {
        enabled: true,
        usePoints: 500,
        availablePoints: 5_000,
        centsPerPoint: 1,
        maxPercent: 50,
      },
      shipping: { feeCents: 800, freeOverCents: 30_000 },
    });
    expect(quote.goodsCents).toBe(25_000);
    expect(quote.memberDiscountCents).toBe(2_500);
    expect(quote.couponCents).toBe(2_000);
    expect(quote.pointDeductCents).toBe(500);
    expect(quote.pointsUsed).toBe(500);
    expect(quote.shippingCents).toBe(800);
    expect(quote.payCents).toBe(20_800);
    expect(quote.flows.map((flow) => flow.step)).toEqual([
      'GOODS',
      'MEMBER',
      'COUPON',
      'POINT',
      'SHIPPING',
      'PAY',
    ]);
  });

  it('包邮门槛按券后金额判断', () => {
    const quote = quoteOrder({
      bizType: 'GOODS',
      lines: [{ refId: 1, priceCents: 30_000, quantity: 1 }],
      memberDiscountPercent: 100,
      shipping: { feeCents: 800, freeOverCents: 30_000 },
    });
    expect(quote.shippingCents).toBe(0);
    expect(quote.payCents).toBe(30_000);
  });

  it('券只作用于指定商品', () => {
    const quote = quoteOrder({
      bizType: 'GOODS',
      lines,
      memberDiscountPercent: 100,
      coupon: {
        kind: 'FULL_REDUCE',
        valueCents: 5_000,
        discountPercent: 100,
        minAmountCents: 0,
        goodsIds: [1],
        bizTypes: ['GOODS'],
      },
    });
    // 命中商品金额 20000，券 5000 全额抵扣，但不能等于全部订单金额
    expect(quote.couponCents).toBe(5_000);
    expect(quote.payCents).toBe(20_000);
  });

  it('业务类型不匹配的券不生效', () => {
    const quote = quoteOrder({
      bizType: 'EXAM',
      lines,
      memberDiscountPercent: 100,
      coupon: {
        kind: 'CASH',
        valueCents: 1_000,
        discountPercent: 100,
        minAmountCents: 0,
        goodsIds: [],
        bizTypes: ['GOODS'],
      },
    });
    expect(quote.couponCents).toBe(0);
  });

  it('积分抵扣受比例与余额双重限制', () => {
    const quote = quoteOrder({
      bizType: 'EXAM',
      lines: [{ refId: 1, priceCents: 10_000, quantity: 1 }],
      memberDiscountPercent: 100,
      points: {
        enabled: false,
        usePoints: 9_999,
        availablePoints: 9_999,
        centsPerPoint: 1,
        maxPercent: 100,
      },
    });
    expect(quote.pointDeductCents).toBe(0);

    const capped = quoteOrder({
      bizType: 'EXAM',
      lines: [{ refId: 1, priceCents: 10_000, quantity: 1 }],
      memberDiscountPercent: 100,
      points: {
        enabled: true,
        usePoints: 9_999,
        availablePoints: 9_999,
        centsPerPoint: 1,
        maxPercent: 30,
      },
    });
    expect(capped.pointDeductCents).toBe(3_000);
    expect(capped.pointsUsed).toBe(3_000);
    expect(capped.payCents).toBe(7_000);
  });
});

describe('分账引擎', () => {
  const rule = {
    scope: 'DEFAULT',
    scopeId: 0,
    bizTypes: [],
    organPercent: 10,
    practitionerPercent: 30,
    promoterPercent: 5,
    teamPercent: 5,
    shopPercent: 50,
  };

  it('按比例分账且店铺吸收舍入误差', () => {
    const drafts = splitShares({
      baseCents: 10_001,
      rule,
      organId: 3,
      practitionerId: 7,
      promoterId: 9,
      teamId: 0,
    });
    const total = drafts.reduce((sum, draft) => sum + draft.shareCents, 0);
    expect(total).toBe(10_001);
    expect(
      drafts.find((draft) => draft.earnerKind === 'PRACTITIONER')?.ratePercent,
    ).toBe(30);
    expect(drafts.find((draft) => draft.earnerKind === 'TEAM')).toBeUndefined();
  });

  it('比例合计超过 100 拒绝', () => {
    expect(() =>
      splitShares({
        baseCents: 100,
        rule: { ...rule, organPercent: 60, practitionerPercent: 60 },
        organId: 1,
        practitionerId: 2,
        promoterId: 0,
        teamId: 0,
      }),
    ).toThrow();
  });

  it('作用域优先级：SERVICE > PRACTITIONER > DEFAULT', () => {
    const picked = pickRule(
      [
        { ...rule, scope: 'DEFAULT', scopeId: 0 },
        { ...rule, scope: 'PRACTITIONER', scopeId: 7 },
      ],
      { SERVICE: 0, PRACTITIONER: 7, ORGAN: 0, TEAM: 0 },
    );
    expect(picked?.scope).toBe('PRACTITIONER');
  });

  it('部分退款按比例冲销', () => {
    expect(reverseShareCents(3_000, 5_000, 10_000)).toBe(1_500);
    expect(reverseShareCents(3_000, 20_000, 10_000)).toBe(3_000);
  });
});
