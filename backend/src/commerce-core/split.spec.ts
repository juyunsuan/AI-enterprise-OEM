import {
  allocateGroups,
  checkAllocationConservation,
  splitLines,
  type SplitGroup,
} from './split';
import type { CommerceLine } from './types';

function line(overrides: Partial<CommerceLine> = {}): CommerceLine {
  return {
    productId: 1,
    skuId: 0,
    quantity: 1,
    title: '商品',
    skuName: '',
    image: '',
    unitCents: 10_000,
    stock: 9,
    productType: 'NORMAL',
    categoryId: 3,
    requiresShipping: true,
    splitKey: 'M1',
    valid: true,
    invalidReason: '',
    ...overrides,
  };
}

describe('commerce-core/split 拆单分组', () => {
  it('B2C 单一 splitKey 时不拆', () => {
    const groups = splitLines([line(), line({ productId: 2, splitKey: '' })]);
    // 空串与同一个非空键各自成组，业务侧必须给全部行填同一个值
    expect(groups).toHaveLength(2);
    expect(splitLines([line(), line({ productId: 2 })])).toHaveLength(1);
  });

  it('按商户分组并汇总货款、件数与是否需要配送', () => {
    const groups = splitLines([
      line({ splitKey: 'M1', unitCents: 1_001, quantity: 3 }),
      line({
        splitKey: 'M2',
        unitCents: 500,
        quantity: 1,
        requiresShipping: false,
      }),
      line({ splitKey: 'M1', productId: 9, unitCents: 2_000, quantity: 1 }),
    ]);
    expect(groups.map((group) => group.key)).toEqual(['M1', 'M2']);
    expect(groups[0].goodsCents).toBe(5_003);
    expect(groups[0].quantity).toBe(4);
    expect(groups[1].requiresShipping).toBe(false);
  });
});

describe('commerce-core/split 优惠与运费分摊', () => {
  const groups: SplitGroup[] = [
    {
      key: 'M1',
      lines: [],
      goodsCents: 3_001,
      requiresShipping: true,
      quantity: 1,
    },
    {
      key: 'M2',
      lines: [],
      goodsCents: 3_000,
      requiresShipping: true,
      quantity: 1,
    },
    {
      key: 'M3',
      lines: [],
      goodsCents: 4_000,
      requiresShipping: false,
      quantity: 1,
    },
  ];

  it('分摊后每一列的合计都等于整单金额', () => {
    const allocations = allocateGroups({
      groups,
      couponDiscountCents: 1_000,
      freightCents: 700,
      pointsDiscountCents: 333,
    });
    const totals = {
      couponDiscountCents: 1_000,
      freightCents: 700,
      pointsDiscountCents: 333,
      payCents: allocations.reduce((sum, item) => sum + item.payCents, 0),
    };
    expect(checkAllocationConservation(allocations, totals)).toBe('');
    expect(allocations.reduce((sum, item) => sum + item.freightCents, 0)).toBe(
      700,
    );
  });

  it('运费只落在需要配送的组，虚拟组不背运费', () => {
    const allocations = allocateGroups({ groups, freightCents: 900 });
    expect(allocations.find((item) => item.key === 'M3')?.freightCents).toBe(0);
    expect(
      allocations.find((item) => item.key === 'M1')?.freightCents,
    ).toBeGreaterThan(0);
  });

  it('子单实付不会因超额优惠变成负数', () => {
    const allocations = allocateGroups({
      groups,
      couponDiscountCents: 10_001,
      freightCents: 0,
    });
    expect(allocations.every((item) => item.payCents >= 0)).toBe(true);
  });

  it('对账函数能发现被人改过的分组合计', () => {
    const allocations = allocateGroups({ groups, couponDiscountCents: 500 });
    expect(
      checkAllocationConservation(allocations, {
        couponDiscountCents: 501,
        freightCents: 0,
        pointsDiscountCents: 0,
        payCents: 0,
      }),
    ).toContain('券抵扣');
  });
});
