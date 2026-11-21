import {
  chargeForUsage,
  resolvePlan,
} from '../tool-launch/tool-launch.pricing';

const policy = { graceHours: 72, transitionDays: 15 };

function planOf(overrides: Record<string, unknown>) {
  return resolvePlan(
    {
      mode: 'METERED',
      unit: 'view',
      unitPriceAmount: 10,
      freeQuotaAmount: 500,
      minChargeAmount: 1,
      enabled: true,
      billingCycle: 'USAGE_VIEW',
      usageUnitSize: 1000,
      launchEnabled: true,
      usageBilled: true,
      ...overrides,
    },
    policy,
  );
}

describe('圈子社区按浏览量计费', () => {
  it('先扣免费量，再按计费粒度向上取整', () => {
    const charge = chargeForUsage(planOf({}), 3000);
    expect(charge.billableQuantity).toBe(2500);
    expect(charge.units).toBe(3);
    expect(charge.amount).toBe(30);
    expect(charge.waived).toBe(false);
  });

  it('未超过免费量不出账', () => {
    const charge = chargeForUsage(planOf({}), 400);
    expect(charge.amount).toBe(0);
    expect(charge.waived).toBe(true);
  });

  it('平台关闭按量出账时只计量不扣分', () => {
    const charge = chargeForUsage(planOf({ usageBilled: false }), 3000);
    expect(charge.amount).toBe(0);
    expect(charge.waived).toBe(true);
  });

  it('单价与起扣额共同兜底，最小账单不低于起扣额', () => {
    const charge = chargeForUsage(
      planOf({ unitPriceAmount: 0.1, minChargeAmount: 5 }),
      1500,
    );
    expect(charge.units).toBe(1);
    expect(charge.amount).toBe(5);
  });
});
