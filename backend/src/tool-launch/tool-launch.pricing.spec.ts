import {
  bytesLabel,
  chargeForPeriod,
  normalizeCycle,
  periodKeyOf,
  periodOf,
  resolvePlan,
  type PricingInput,
} from './tool-launch.pricing';

/**
 * 启动计费口径的纯函数用例：这一层同时产出「启动页文案」与「日批出账金额」，
 * 所以文案里的数字必须和 chargeForPeriod 算出来的一字不差（需求口径：与平台管理员设置匹配）。
 */

const POLICY = { graceHours: 72, transitionDays: 15 };

function row(part: Partial<PricingInput> = {}): PricingInput {
  return {
    mode: 'METERED',
    unit: '',
    unitPriceAmount: 300,
    freeQuotaAmount: 0,
    minChargeAmount: 0.01,
    enabled: true,
    billingCycle: 'DAY30',
    usageUnitSize: 1,
    launchEnabled: true,
    ...part,
  };
}

describe('resolvePlan：价目行 → 生效口径', () => {
  it('缺价目行按免费且允许启动，绝不因为没配价把功能锁死', () => {
    const plan = resolvePlan(null, POLICY);
    expect(plan.cycle).toBe('FREE');
    expect(plan.billingEnabled).toBe(false);
    expect(plan.launchAllowed).toBe(true);
    expect(plan.note).toContain('当前免费');
  });

  it('三种周期各自的天数与单位标签', () => {
    expect(resolvePlan(row({ billingCycle: 'DAY' }), POLICY).cycleDays).toBe(1);
    expect(resolvePlan(row({ billingCycle: 'DAY30' }), POLICY).cycleDays).toBe(
      30,
    );
    expect(resolvePlan(row({ billingCycle: 'YEAR' }), POLICY).cycleDays).toBe(
      365,
    );
  });

  it('未知口径回落免费（管理员写错值不能变成乱扣费）', () => {
    expect(normalizeCycle('WEEKLY')).toBe('FREE');
    expect(
      resolvePlan(row({ billingCycle: 'WEEKLY' }), POLICY).billingEnabled,
    ).toBe(false);
  });

  it('enabled=false 或非 METERED 都不出账', () => {
    expect(resolvePlan(row({ enabled: false }), POLICY).billingEnabled).toBe(
      false,
    );
    expect(resolvePlan(row({ mode: 'FREE' }), POLICY).billingEnabled).toBe(
      false,
    );
  });

  it('按访问 / 按流量本期只计量：文案讲明暂不扣积分，billingEnabled 恒 false', () => {
    const pv = resolvePlan(
      row({ billingCycle: 'USAGE_PV', usageUnitSize: 1000 }),
      POLICY,
    );
    expect(pv.usageBilled).toBe(false);
    expect(pv.billingEnabled).toBe(false);
    expect(pv.note).toContain('300 积分/1000 次访问');
    expect(pv.note).toContain('暂未出账');
    const bytes = resolvePlan(
      row({ billingCycle: 'USAGE_BYTES', usageUnitSize: 1073741824 }),
      POLICY,
    );
    expect(bytes.note).toContain('300 积分/1 GB');
  });

  it('宽限小时与免费期数都来自配置，并原样出现在文案里', () => {
    const plan = resolvePlan(row({ billingCycle: 'DAY', freeQuotaAmount: 3 }), {
      graceHours: 24,
      transitionDays: 7,
    });
    expect(plan.freePeriods).toBe(3);
    expect(plan.graceHours).toBe(24);
    expect(plan.transitionDays).toBe(7);
    expect(plan.note).toContain('前 3 期免费');
    expect(plan.note).toContain('宽限 24 小时');
  });
});

describe('chargeForPeriod：第 N 期扣多少', () => {
  it('正常期按单价扣，首期在免费期内记 0 但保留账单口径', () => {
    const plan = resolvePlan(row({ freeQuotaAmount: 1 }), POLICY);
    expect(chargeForPeriod(plan, 0)).toMatchObject({ amount: 0, waived: true });
    expect(chargeForPeriod(plan, 1).amount).toBe(300);
  });

  it('低于起扣额按起扣额（防微账单噪声）', () => {
    const plan = resolvePlan(
      row({ unitPriceAmount: 0.001, minChargeAmount: 5 }),
      POLICY,
    );
    expect(chargeForPeriod(plan, 0).amount).toBe(5);
  });

  it('按量口径永不出账', () => {
    const plan = resolvePlan(row({ billingCycle: 'USAGE_PV' }), POLICY);
    expect(chargeForPeriod(plan, 0)).toMatchObject({ amount: 0, waived: true });
  });

  it('文案里的单价与实际出账金额一致（一张嘴原则）', () => {
    const plan = resolvePlan(
      row({ billingCycle: 'YEAR', unitPriceAmount: 1200 }),
      POLICY,
    );
    expect(plan.note).toContain('1200 积分/年');
    expect(chargeForPeriod(plan, 0).amount).toBe(1200);
  });
});

describe('账期推进', () => {
  it('按 30 天滚动：首尾相接', () => {
    const start = new Date('2026-11-18T10:00:00.000Z');
    const first = periodOf(start, 30);
    const second = periodOf(first.periodEnd, 30);
    expect(first.periodEnd.toISOString()).toBe('2026-12-18T10:00:00.000Z');
    expect(second.periodStart.toISOString()).toBe(
      first.periodEnd.toISOString(),
    );
  });

  it('幂等键按「第几期」推导：同一期不管几点跑都是同一个键', () => {
    expect(periodKeyOf(1)).toBe('P1');
    expect(periodKeyOf(2)).not.toBe(periodKeyOf(1));
    // 并发双击、日批隔天重跑，算出的键都一样，唯一索引才拦得住重复扣
    expect(periodKeyOf(periodOf(new Date(), 30) ? 3 : 0)).toBe('P3');
  });

  it('cycleDays 非法时按 1 天兜底，不会算出零长度账期', () => {
    const period = periodOf(new Date('2026-01-01T00:00:00.000Z'), 0);
    expect(period.periodEnd.getTime() - period.periodStart.getTime()).toBe(
      86400_000,
    );
  });

  it('periodKeyOf 与时间无关：只有 0/负数按第 1 期兜底', () => {
    expect(periodKeyOf(0)).toBe('P1');
    expect(periodKeyOf(-3)).toBe('P1');
    expect(periodKeyOf(2.7)).toBe('P2');
  });
});

describe('bytesLabel', () => {
  it('整 GB / 整 MB 说人话，其余按字节', () => {
    expect(bytesLabel(1073741824)).toBe('1 GB');
    expect(bytesLabel(5242880)).toBe('5 MB');
    expect(bytesLabel(123)).toBe('123 字节');
  });
});
