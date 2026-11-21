import {
  amount,
  fromCents,
  jsonInput,
  brandOrderNo,
  mergeJson,
  skuUniqueId,
  toCents,
} from './brand.shared';

describe('brand.shared 金额换算', () => {
  it('元 ↔ 分 全程整数，不出现浮点残差', () => {
    expect(toCents(19.99)).toBe(1999);
    expect(toCents('0.1')).toBe(10);
    expect(fromCents(toCents(0.1 + 0.2))).toBe(0.3);
    // 三件 19.99 逐笔转分相加，必须等于合计 59.97
    const sum = [19.99, 19.99, 19.99].reduce((acc, v) => acc + toCents(v), 0);
    expect(fromCents(sum)).toBe(59.97);
  });

  it('Prisma 的 Decimal 对象也认（toString 是唯一稳定出口）', () => {
    expect(amount({ toString: () => '12.34' })).toBe(12.34);
    expect(amount(null)).toBe(0);
    expect(amount(Number.NaN)).toBe(0);
  });
});

describe('brand.shared 规格唯一键', () => {
  it('录入顺序不同也落到同一个 uniqueId', () => {
    const a = skuUniqueId({ 颜色: '红', 尺码: 'L' });
    const b = skuUniqueId({ 尺码: 'L', 颜色: '红' });
    expect(a).toBe(b);
    expect(a).toBe('尺码:L|颜色:红');
  });

  it('空值键被丢掉，避免「有规格」与「无规格」误配成同一 SKU', () => {
    expect(skuUniqueId({ 颜色: '', 尺码: 'L' })).toBe('尺码:L');
    expect(skuUniqueId({})).toBe('');
  });
});

describe('brand.shared 单号与 JSON', () => {
  it('单号 = 前缀 + 14 位时间 + 6 位数字', () => {
    expect(brandOrderNo('MD')).toMatch(/^MD\d{20}$/);
    expect(brandOrderNo('RF')).toMatch(/^RF\d{20}$/);
  });

  it('JSON 列在 PG 侧给回字符串时仍能合并默认值', () => {
    expect(mergeJson('{"b":2}', { a: 1, b: 0 })).toEqual({ a: 1, b: 2 });
    expect(mergeJson('not-json', { a: 1 })).toEqual({ a: 1 });
    expect(mergeJson(null, { a: 1 })).toEqual({ a: 1 });
  });

  it('jsonInput 不把 null 写进 JSON 列（库里 JSON 列不允许 NULL 默认）', () => {
    expect(jsonInput(null)).toEqual({});
    expect(jsonInput([1])).toEqual([1]);
  });
});
