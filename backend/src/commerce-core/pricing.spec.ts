import {
  couponScopeCents,
  evaluateCoupon,
  freightFromZone,
  matchShippingZone,
  maxUsablePoints,
  pointsEarned,
  pointsToCents,
  priceOrder,
  resolveFreight,
  type CouponSpec,
  type ShippingZone,
} from './pricing';
import { commerceTradeRules, type CommerceLine } from './types';

function line(overrides: Partial<CommerceLine> = {}): CommerceLine {
  return {
    productId: 1,
    skuId: 0,
    quantity: 1,
    title: '商品',
    skuName: '',
    image: '',
    unitCents: 10_000,
    stock: 99,
    productType: 'NORMAL',
    categoryId: 7,
    requiresShipping: true,
    splitKey: '',
    valid: true,
    invalidReason: '',
    ...overrides,
  };
}

const coupon: CouponSpec = {
  name: '满 100 减 20',
  type: 'FULL_REDUCE',
  value: 2_000,
  thresholdCents: 10_000,
  scope: 'ALL',
  scopeIds: [],
};

describe('commerce-core/pricing 券判定', () => {
  it('未达门槛给出可读原因，抵扣为 0', () => {
    const result = evaluateCoupon(coupon, [
      { productId: 1, categoryId: 7, totalCents: 9_999 },
    ]);
    expect(result.discountCents).toBe(0);
    expect(result.reason).toBe('满 100 元可用');
  });

  it('指定分类券不蹭别的商品，只按命中范围金额抵扣', () => {
    const scoped: CouponSpec = { ...coupon, scope: 'CATEGORY', scopeIds: [7] };
    const lines = [
      { productId: 1, categoryId: 7, totalCents: 6_000 },
      { productId: 2, categoryId: 9, totalCents: 8_000 },
    ];
    expect(couponScopeCents(scoped, lines)).toBe(6_000);
    expect(
      evaluateCoupon({ ...scoped, value: 5_000 }, lines).discountCents,
    ).toBe(5_000);
    expect(
      evaluateCoupon(scoped, [
        { productId: 3, categoryId: 9, totalCents: 20_000 },
      ]).reason,
    ).toBe('本单没有可用这张券的商品');
  });

  it('折扣券 88 表示 8.8 折，抵扣按百分位向下取整', () => {
    const discount: CouponSpec = {
      name: '8.8 折',
      type: 'DISCOUNT',
      value: 88,
      thresholdCents: 0,
      scope: 'ALL',
      scopeIds: [],
    };
    const result = evaluateCoupon(discount, [
      { productId: 1, categoryId: 7, totalCents: 3_333 },
    ]);
    expect(result.discountCents).toBe(399);
  });
});

describe('commerce-core/pricing 运费优先级', () => {
  const rules = commerceTradeRules({
    freightCents: 800,
    freeFreightCents: 20_000,
  });

  it('全虚拟免运费', () => {
    const result = resolveFreight({
      lines: [line({ requiresShipping: false })],
      rules,
    });
    expect(result.cents).toBe(0);
    expect(result.reason).toContain('免运费');
  });

  it('满额包邮优先于统一运费', () => {
    expect(
      resolveFreight({ lines: [line({ unitCents: 20_000 })], rules }).cents,
    ).toBe(0);
    expect(
      resolveFreight({ lines: [line({ unitCents: 19_999 })], rules }).cents,
    ).toBe(800);
  });

  it('模板优先于统一运费：首件 + 续件，满件包邮', () => {
    const zones: ShippingZone[] = [
      {
        id: 11,
        templateId: 3,
        name: '江浙沪',
        regions: ['杭州'],
        firstPiece: 1,
        firstFeeCents: 1_200,
        additionalPiece: 2,
        additionalFeeCents: 300,
        freePiece: 0,
      },
      {
        id: 12,
        templateId: 3,
        name: '全国',
        regions: [],
        firstPiece: 1,
        firstFeeCents: 1_500,
        additionalPiece: 1,
        additionalFeeCents: 500,
        freePiece: 0,
      },
    ];
    expect(
      matchShippingZone(zones, { province: '浙江', city: '杭州', district: '' })
        ?.id,
    ).toBe(11);
    expect(
      matchShippingZone(zones, { province: '广东', city: '深圳', district: '' })
        ?.id,
    ).toBe(12);
    expect(freightFromZone(zones[0], 1)).toBe(1_200);
    expect(freightFromZone(zones[0], 5)).toBe(1_200 + 2 * 300);
    expect(freightFromZone({ ...zones[0], freePiece: 3 }, 5)).toBe(0);
    const result = resolveFreight({
      lines: [line({ unitCents: 1_000, quantity: 5 })],
      rules,
      zones,
      region: { province: '浙江', city: '杭州', district: '' },
    });
    expect(result).toEqual({
      cents: 1_800,
      reason: '按运费模板（江浙沪）计算',
      zoneId: 11,
    });
  });
});

describe('commerce-core/pricing 积分', () => {
  it('受余额与抵扣上限百分比双重约束', () => {
    // 1 元 100 积分：上限 30% = 30 元 = 3000 积分，余额 500 时以余额为准
    expect(maxUsablePoints(500, 10_000, 100, 30)).toBe(500);
    expect(maxUsablePoints(9_999, 10_000, 100, 30)).toBe(3_000);
    expect(maxUsablePoints(100, 10_000, 100, 30)).toBe(100);
    expect(maxUsablePoints(9_999, 10_000, 0, 30)).toBe(0);
    expect(pointsToCents(300, 100)).toBe(300);
    expect(pointsEarned(19_999, 1)).toBe(199);
  });
});

describe('commerce-core/pricing 唯一算价入口', () => {
  it('券 + 积分 + 运费合成实付，积分被抵扣上限百分比夹住', () => {
    const rules = commerceTradeRules({
      freightCents: 800,
      freeFreightCents: 0,
      pointsEnabled: true,
      pointsPerYuan: 100,
      pointsDeductMaxPercent: 50,
      pointsReturnRate: 1,
    });
    const result = priceOrder({
      lines: [line({ unitCents: 9_900, quantity: 2 })],
      rules,
      coupon,
      pointsOwned: 99_999,
      pointsRequested: 99_999,
      addressSelected: true,
    });
    expect(result.goodsCents).toBe(19_800);
    expect(result.couponDiscountCents).toBe(2_000);
    // 应付 18_600 分，上限 50% = 9_300 分 → 1 元 100 积分 → 最多 9_300 积分
    expect(result.maxUsablePoints).toBe(9_300);
    expect(result.pointsDeduct).toBe(9_300);
    expect(result.pointsDiscountCents).toBe(9_300);
    expect(result.payCents).toBe(19_800 - 2_000 - 9_300 + 800);
    expect(result.discountCents).toBe(11_300);
    expect(result.pointsReturn).toBe(93);
    expect(result.blockReason).toBe('');
  });

  it('余额不足时按余额抵扣，返分按实付计算', () => {
    const result = priceOrder({
      lines: [line({ unitCents: 9_900, quantity: 2 })],
      rules: commerceTradeRules({
        pointsEnabled: true,
        pointsPerYuan: 100,
        pointsDeductMaxPercent: 50,
        pointsReturnRate: 2,
      }),
      pointsOwned: 500,
      pointsRequested: 9_999,
      addressSelected: true,
    });
    expect(result.maxUsablePoints).toBe(500);
    expect(result.pointsDiscountCents).toBe(500);
    expect(result.payCents).toBe(19_300);
    expect(result.pointsReturn).toBe(386);
  });

  it('失效行阻断并逐行列出原因', () => {
    const result = priceOrder({
      lines: [
        line({ title: 'A', valid: false, invalidReason: '商品已下架' }),
        line({ title: 'B', valid: false, invalidReason: '库存不足' }),
      ],
      rules: commerceTradeRules(),
      addressSelected: true,
    });
    expect(result.invalidLines).toHaveLength(2);
    expect(result.blockReason).toBe('无法结算：A（商品已下架）；B（库存不足）');
  });

  it('最低下单金额与未选地址分别给出阻断文案', () => {
    const rules = commerceTradeRules({ minOrderCents: 30_000 });
    expect(
      priceOrder({
        lines: [line({ unitCents: 29_999 })],
        rules,
        addressSelected: true,
      }).blockReason,
    ).toBe('不满最低下单金额 300 元');
    expect(
      priceOrder({
        lines: [line()],
        rules: commerceTradeRules(),
        addressSelected: false,
      }).blockReason,
    ).toBe('请先选择收货地址');
    expect(
      priceOrder({
        lines: [line({ requiresShipping: false })],
        rules: commerceTradeRules(),
        addressSelected: false,
      }).blockReason,
    ).toBe('');
  });

  it('券不可用时按整单口径拒绝下单', () => {
    const result = priceOrder({
      lines: [line({ unitCents: 5_000 })],
      rules: commerceTradeRules(),
      coupon,
      addressSelected: true,
    });
    expect(result.couponReason).toBe('满 100 元可用');
    expect(result.blockReason).toBe('优惠券不可用：满 100 元可用');
  });
});
