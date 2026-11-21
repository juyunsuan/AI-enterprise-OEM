import {
  BASE_PRODUCT_TYPES,
  blockZeroStockOnline,
  createProductTypeRegistry,
  generateSkuMatrix,
  normalizeProductIds,
  PRODUCT_BATCH_LIMIT,
  resolveUnitCents,
  rollupSkus,
} from './product';

describe('commerce-core/product 形态注册', () => {
  const cardKey = createProductTypeRegistry([
    {
      key: 'CARD',
      label: '卡密',
      requiresShipping: false,
      stockManaged: false,
    },
  ]);

  it('基础形态可被业务扩展，未登记类型保守按实物处理', () => {
    expect(BASE_PRODUCT_TYPES).toHaveLength(2);
    expect(cardKey.requiresShipping('CARD')).toBe(false);
    expect(cardKey.stockManaged('CARD')).toBe(false);
    expect(cardKey.requiresShipping('MYSTERY')).toBe(true);
    expect(cardKey.list().map((item) => item.key)).toEqual([
      'NORMAL',
      'VIRTUAL',
      'CARD',
    ]);
  });

  it('超卖拦截只作用于占用库存的形态', () => {
    const guard = blockZeroStockOnline(
      [
        { id: 1, type: 'NORMAL', stock: 0 },
        { id: 2, type: 'VIRTUAL', stock: 0 },
        { id: 3, type: 'CARD', stock: 0 },
      ],
      cardKey,
    );
    expect(guard.ids).toEqual([1]);
    expect(guard.reason).toBe(
      '1 个商品库存为 0，上架后顾客拍下会超卖，请先补库存',
    );
    expect(
      blockZeroStockOnline([{ id: 1, type: 'NORMAL', stock: 2 }], cardKey).ok,
    ).toBe(true);
  });
});

describe('commerce-core/product 规格展开', () => {
  it('笛卡尔积按录入顺序稳定展开，顺序无关的 uniqueId 由 ident 负责', () => {
    const matrix = generateSkuMatrix([
      { name: '颜色', values: ['红', '蓝'] },
      { name: '尺码', values: ['S', 'M', 'L'] },
    ]);
    expect(matrix.combinations).toHaveLength(6);
    expect(matrix.combinations[0]).toEqual({ 颜色: '红', 尺码: 'S' });
    expect(matrix.combinations[5]).toEqual({ 颜色: '蓝', 尺码: 'L' });
    expect(matrix.reason).toBe('');
  });

  it('重复与空规格值合并，无名规格组忽略', () => {
    const matrix = generateSkuMatrix([
      { name: '颜色', values: ['红', '红', ' ', '蓝'] },
      { name: ' ', values: ['S'] },
    ]);
    expect(matrix.combinations).toHaveLength(2);
    expect(generateSkuMatrix([]).combinations).toEqual([]);
  });

  it('超出上限截断并给出可执行的提示', () => {
    const matrix = generateSkuMatrix(
      [
        { name: 'A', values: ['1', '2', '3'] },
        { name: 'B', values: ['1', '2', '3'] },
      ],
      8,
    );
    expect(matrix.combinations).toHaveLength(8);
    expect(matrix.reason).toContain('共 9 个');
  });
});

describe('commerce-core/product 价格与库存回写', () => {
  it('只统计启用的 SKU', () => {
    expect(
      rollupSkus([
        { priceCents: 1_000, stock: 3, enabled: false },
        { priceCents: 500, stock: 2, enabled: true },
        { priceCents: 800, stock: 5, enabled: true },
      ]),
    ).toEqual({ minPriceCents: 500, totalStock: 7, enabledCount: 2 });
    expect(rollupSkus([{ priceCents: 100, stock: 1, enabled: false }])).toEqual(
      {
        minPriceCents: 0,
        totalStock: 0,
        enabledCount: 0,
      },
    );
  });

  it('成交价：SKU 优先，缺省回落商品价', () => {
    expect(resolveUnitCents(1_234, 9_999)).toBe(1_234);
    expect(resolveUnitCents(null, 9_999)).toBe(9_999);
    expect(resolveUnitCents(0, 9_999)).toBe(0);
  });

  it('批量入参去重、去非正数并夹到上限', () => {
    expect(normalizeProductIds(['3', 3, 0, -1, 'abc', 7])).toEqual([3, 7]);
    expect(
      normalizeProductIds(Array.from({ length: 300 }, (_u, i) => i + 1)),
    ).toHaveLength(PRODUCT_BATCH_LIMIT);
    // 复制商品一次只建 50 件，比批量改状态更严，上限由调用方给
    expect(
      normalizeProductIds(
        Array.from({ length: 80 }, (_u, i) => i + 1),
        50,
      ),
    ).toHaveLength(50);
  });
});
