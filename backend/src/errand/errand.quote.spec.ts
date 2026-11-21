import {
  couponDiscountOf,
  isNightAt,
  quoteOrder,
  type ErrandRuleValues,
} from './errand.shared';

const RULE: ErrandRuleValues = {
  baseFee: 5,
  baseDistanceKm: 3,
  perKmFee: 2,
  baseWeightKg: 5,
  perKgFee: 1,
  nightStart: '22:00',
  nightEnd: '06:00',
  nightFee: 3,
  buyServiceRate: 0.1,
  minOrderAmount: 0,
  maxDistanceKm: 30,
  maxWeightKg: 30,
  tipPresets: [0, 2, 5],
  couponEnabled: true,
  acceptRadiusKm: 5,
  autoDispatch: false,
  riderShareRate: 0.8,
  pointsEarnRate: 1,
  pointsDeductRate: 100,
  maxPointsDiscountRate: 0.2,
};

const at = (hour: number) => {
  const date = new Date(2026, 10, 19, hour, 0, 0);
  return date.toISOString();
};

describe('跑腿计价引擎', () => {
  it('起步价 + 超距 + 超重 + 小费：全部按分计算', () => {
    const quote = quoteOrder(RULE, {
      serviceType: 'SEND',
      distanceKm: 6,
      weightKg: 7,
      goodsAmount: 0,
      tip: 5,
      at: at(12),
    });
    expect(quote.baseFee).toBe(5);
    expect(quote.distanceFee).toBe(6);
    expect(quote.weightFee).toBe(2);
    expect(quote.timeFee).toBe(0);
    expect(quote.tip).toBe(5);
    expect(quote.totalAmount).toBe(18);
    expect(quote.night).toBe(false);
  });

  it('帮买按商品金额收服务费，且夜间跨零点能正确加价', () => {
    const quote = quoteOrder(RULE, {
      serviceType: 'BUY',
      distanceKm: 1,
      weightKg: 1,
      goodsAmount: 100,
      tip: 0,
      at: at(23),
    });
    expect(quote.goodsFee).toBe(10);
    expect(quote.timeFee).toBe(3);
    expect(quote.totalAmount).toBe(18);
    expect(isNightAt(RULE, new Date(2026, 10, 19, 5, 30))).toBe(true);
    expect(isNightAt(RULE, new Date(2026, 10, 19, 12, 0))).toBe(false);
  });

  it('优惠券受门槛约束，且不超过可优惠服务费；小费不参与折扣', () => {
    expect(
      couponDiscountOf(
        { type: 'FIXED', discountValue: 8, minAmount: 20 },
        2500,
      ),
    ).toBe(800);
    expect(
      couponDiscountOf(
        { type: 'FIXED', discountValue: 8, minAmount: 20 },
        1000,
      ),
    ).toBe(0);
    expect(
      couponDiscountOf(
        { type: 'PERCENT', discountValue: 10, minAmount: 0 },
        1000,
      ),
    ).toBe(100);
    const quote = quoteOrder(RULE, {
      serviceType: 'SEND',
      distanceKm: 1,
      weightKg: 1,
      goodsAmount: 0,
      tip: 6,
      at: at(12),
      coupon: { type: 'FIXED', discountValue: 3, minAmount: 0 },
    });
    expect(quote.couponDiscount).toBe(3);
    expect(quote.totalAmount).toBe(8);
  });

  it('积分抵扣受可用积分与服务费上限约束', () => {
    const half = quoteOrder(RULE, {
      serviceType: 'SEND',
      distanceKm: 0,
      weightKg: 0,
      goodsAmount: 0,
      tip: 0,
      at: at(12),
      pointsUsed: 50,
    });
    expect(half.pointsUsed).toBe(50);
    expect(half.pointsDiscount).toBe(0.5);
    expect(half.totalAmount).toBe(4.5);

    const capped = quoteOrder(RULE, {
      serviceType: 'SEND',
      distanceKm: 0,
      weightKg: 0,
      goodsAmount: 0,
      tip: 0,
      at: at(12),
      pointsUsed: 1000,
    });
    expect(capped.pointsDiscount).toBe(1);
    expect(capped.pointsUsed).toBe(100);
    expect(capped.totalAmount).toBe(4);
  });

  it('最低服务费只抬升服务费小计，不吞掉小费', () => {
    const quote = quoteOrder(
      { ...RULE, minOrderAmount: 12 },
      {
        serviceType: 'SEND',
        distanceKm: 0,
        weightKg: 0,
        goodsAmount: 0,
        tip: 2,
        at: at(12),
      },
    );
    expect(quote.minOrderAdjusted).toBe(true);
    expect(quote.totalAmount).toBe(14);
  });
});
