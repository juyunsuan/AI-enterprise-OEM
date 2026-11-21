import {
  coordinatesUsable,
  riderIncomeOf,
  straightKilometers,
} from './errand.shared';

describe('跑腿骑手收入与距离口径', () => {
  it('分成只作用于超距/超重/夜间，小费全额归骑手', () => {
    const order = { distanceFee: 6, weightFee: 2, timeFee: 3, tip: 5 };
    expect(riderIncomeOf(order, 1)).toBe(16);
    expect(riderIncomeOf(order, 0.8)).toBe(13.8);
    expect(riderIncomeOf(order, 0)).toBe(5);
  });

  it('坐标缺失或 (0,0) 不可用于算距', () => {
    expect(coordinatesUsable(0, 0, 120.1, 30.2)).toBe(false);
    expect(coordinatesUsable(120.1, 30.2, 0, 0)).toBe(false);
    expect(coordinatesUsable(120.1, 30.2, 120.2, 30.3)).toBe(true);
  });

  it('直线距离在合理范围且保留两位小数', () => {
    const km = straightKilometers(120.1, 30.2, 120.2, 30.3);
    expect(km).toBeGreaterThan(10);
    expect(km).toBeLessThan(20);
    expect(Math.round(km * 100)).toBe(km * 100);
  });
});
