import {
  CART_LIMITS,
  cartAmounts,
  cartCounters,
  cartRowKey,
  checkoutItems,
  mergeCartRow,
  normalizeQuantity,
  selectedRows,
  toggleSelected,
  type CartRow,
} from './cart';

const row = (overrides: Partial<CartRow> = {}): CartRow => ({
  productId: 1,
  skuId: 0,
  quantity: 1,
  selected: true,
  ...overrides,
});

describe('commerce-core/cart 行合并', () => {
  it('同商品同规格累加数量，不同规格各成一行', () => {
    expect(cartRowKey(row({ productId: 3, skuId: 5 }))).toBe('3:5');
    const first = mergeCartRow([row({ quantity: 2 })], row({ quantity: 3 }));
    expect(first.rows[0].quantity).toBe(5);
    expect(first.added).toBe(false);
    const second = mergeCartRow(first.rows, row({ skuId: 9 }));
    expect(second.rows).toHaveLength(2);
    expect(second.added).toBe(true);
  });

  it('累加超过单件上限时夹住并提示', () => {
    const merged = mergeCartRow(
      [row({ quantity: CART_LIMITS.maxQuantity })],
      row({ quantity: 5 }),
    );
    expect(merged.rows[0].quantity).toBe(CART_LIMITS.maxQuantity);
    expect(merged.message).toContain('最多购买');
  });

  it('行数到上限后拒绝新增，原行不受影响', () => {
    const full = Array.from({ length: CART_LIMITS.maxRows }, (_unused, index) =>
      row({ productId: index + 1 }),
    );
    const result = mergeCartRow(full, row({ productId: 999 }));
    expect(result.rows).toHaveLength(CART_LIMITS.maxRows);
    expect(result.added).toBe(false);
    expect(result.message).toContain('请先清理');
  });

  it('数量归一到 1..999', () => {
    expect(normalizeQuantity(0)).toBe(1);
    expect(normalizeQuantity('12')).toBe(12);
    expect(normalizeQuantity(Number.NaN)).toBe(1);
    expect(normalizeQuantity(9_999)).toBe(CART_LIMITS.maxQuantity);
  });
});

describe('commerce-core/cart 勾选与计数', () => {
  const rows = [
    row({ productId: 1, quantity: 2 }),
    row({ productId: 2, skuId: 3, quantity: 5, selected: false }),
  ];

  it('全选 / 全不选与按行勾选互不干扰', () => {
    expect(selectedRows(toggleSelected(rows, true))).toHaveLength(2);
    expect(selectedRows(toggleSelected(rows, false))).toHaveLength(0);
    const onlyFirst = toggleSelected(rows, true, ['1:0']);
    expect(selectedRows(onlyFirst).map((item) => item.productId)).toEqual([1]);
    // 原数组不被改写
    expect(rows[1].selected).toBe(false);
  });

  it('计数区分总数与勾选数', () => {
    expect(cartCounters(rows)).toEqual({
      rowCount: 2,
      quantity: 7,
      selectedRowCount: 1,
      selectedQuantity: 2,
    });
  });

  it('货款只累加勾选且有效的行，失效行计数但不计价', () => {
    const amounts = cartAmounts(
      [
        row({ productId: 1, quantity: 2 }),
        row({ productId: 2, selected: false }),
        row({ productId: 3 }),
      ],
      (item) =>
        item.productId === 3
          ? {
              unitCents: 100,
              totalCents: 100,
              valid: false,
              invalidReason: '已下架',
            }
          : {
              unitCents: 990,
              totalCents: 990 * item.quantity,
              valid: true,
              invalidReason: '',
            },
    );
    expect(amounts.goodsCents).toBe(1_980);
    expect(amounts.invalidCount).toBe(1);
    expect(amounts.rows).toHaveLength(3);
  });

  it('结算项取勾选行并夹到行数上限', () => {
    const items = checkoutItems([
      ...Array.from({ length: 60 }, (_unused, index) =>
        row({ productId: index + 1 }),
      ),
      row({ productId: 999, selected: false }),
    ]);
    expect(items).toHaveLength(CART_LIMITS.maxRows);
    expect(items[0]).toEqual({ productId: 1, skuId: 0, quantity: 1 });
  });
});
