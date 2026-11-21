import {
  allocateCents,
  amountOut,
  clampCents,
  fromCents,
  sumCents,
  toCents,
} from './money';

describe('commerce-core/money 金额换算', () => {
  it('元 ↔ 分 全程整数，逐笔相加不丢分', () => {
    expect(toCents(19.99)).toBe(1999);
    expect(toCents('0.1')).toBe(10);
    const sum = [19.99, 19.99, 19.99].reduce(
      (acc, value) => acc + toCents(value),
      0,
    );
    expect(fromCents(sum)).toBe(59.97);
  });

  it('Decimal 对象 / null / 非法串一律收敛为 0 元', () => {
    expect(amountOut({ toString: () => '12.34' })).toBe(12.34);
    expect(amountOut(null)).toBe(0);
    expect(amountOut(Number.NaN)).toBe(0);
    expect(clampCents(-5)).toBe(0);
    expect(sumCents(1, 2, 3)).toBe(6);
  });
});

describe('commerce-core/money 分摊', () => {
  it('按权重分摊后合计恒等于总额，余数补给小数部分最大的行', () => {
    const shares = allocateCents(1000, [1, 1, 1]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(shares).toEqual([334, 333, 333]);
  });

  it('权重悬殊时小额行不被抹零（券额全落在命中行）', () => {
    const shares = allocateCents(500, [999_999, 1]);
    expect(sumCents(...shares)).toBe(500);
    expect(shares[1]).toBeGreaterThanOrEqual(0);
  });

  it('权重全为 0 时按行序平分，仍满足合计不变量', () => {
    const shares = allocateCents(10, [0, 0, 0]);
    expect(shares).toEqual([4, 3, 3]);
    expect(sumCents(...shares)).toBe(10);
  });

  it('空权重与负总额都收敛为空或 0', () => {
    expect(allocateCents(100, [])).toEqual([]);
    expect(allocateCents(-50, [1, 1])).toEqual([0, 0]);
  });
});
