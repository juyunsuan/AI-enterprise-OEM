import {
  computeTravelFee,
  coordinatesUsable,
  straightKilometers,
  type FeeRule,
} from './onsite.fee.engine';

const rule: FeeRule = {
  freeKilometers: 0,
  startFeeCents: 900,
  startKilometers: 9,
  pricePerKilometerCents: 190,
  virtualExtraKilometers: 0,
  minFeeCents: 0,
};

describe('onsite/车费引擎', () => {
  it('参考源码种子口径：9 元起步含 9 公里，超出每公里 1.9 元', () => {
    // 8.33 公里在起步里程内 → 只收起步价
    expect(computeTravelFee(8.33, rule).feeCents).toBe(900);
    // 12 公里 → 9 元 + 3 × 1.9 = 14.7 元
    expect(computeTravelFee(12, rule)).toMatchObject({
      feeCents: 1470,
      billedKilometers: 3,
    });
  });

  it('免费里程内直接不收钱，不是收 0 元起步价', () => {
    const withFree = { ...rule, freeKilometers: 3 };
    expect(computeTravelFee(2.4, withFree)).toMatchObject({
      feeCents: 0,
      billedKilometers: 0,
    });
    // 3.4 公里：先扣 3 公里免费，再扣 9 公里起步内含 → 仍只收起步价
    expect(computeTravelFee(3.4, withFree).feeCents).toBe(900);
  });

  it('虚拟里程加成把里程抬高（参考源码 invented_distance）', () => {
    const withVirtual = { ...rule, virtualExtraKilometers: 5 };
    expect(computeTravelFee(10, withVirtual).feeCents).toBe(
      computeTravelFee(15, rule).feeCents,
    );
  });

  it('最低车费兜住低价服务，脏输入不产生负数', () => {
    const withMin = { ...rule, startFeeCents: 200, minFeeCents: 800 };
    expect(computeTravelFee(1, withMin).feeCents).toBe(800);
    expect(
      computeTravelFee(Number.NaN, { ...rule, startFeeCents: -50 }).feeCents,
    ).toBe(0);
  });

  it('直线距离按经纬度算，缺坐标时判定为不可用（不静默返回 0 公里）', () => {
    const km = straightKilometers(121.47, 31.23, 121.52, 31.25);
    expect(km).toBeGreaterThan(4);
    expect(km).toBeLessThan(7);
    expect(coordinatesUsable(0, 0, 121.5, 31.2)).toBe(false);
    expect(coordinatesUsable(121.47, 31.23, 121.52, 31.25)).toBe(true);
  });

  it('公式随结果一起返回，客服核对时能直接说明为什么是这个价', () => {
    const result = computeTravelFee(12, rule);
    expect(result.formula).toContain('起步');
    expect(result.formula).toContain('计费 3km');
    expect(result.formula).toContain('190 分/km');
  });
});
