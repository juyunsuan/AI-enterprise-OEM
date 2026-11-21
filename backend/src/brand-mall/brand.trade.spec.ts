import { BRAND_DEFAULT_TRADE } from '@enterprise/contracts';
import { normalizeTrade } from './brand.shop.service';

/**
 * 交易参数是下单算价的输入源，库里又是 JSON 自由列，
 * 所以收敛函数必须自己扛住脏值与误配——这里钉住几条真正会影响金额的规则。
 */
describe('normalizeTrade', () => {
  it('库里缺字段时逐项回落默认值', () => {
    const trade = normalizeTrade({});
    expect(trade.autoCancelMinutes).toBe(BRAND_DEFAULT_TRADE.autoCancelMinutes);
    expect(trade.freightAmount).toBe(0);
    expect(trade.refundEnabled).toBe(true);
  });

  it('PG 侧给回 JSON 字符串也能解析', () => {
    const trade = normalizeTrade('{"freightAmount":8.5,"pointsEnabled":true}');
    expect(trade.freightAmount).toBe(8.5);
    expect(trade.pointsEnabled).toBe(true);
  });

  it('脏值一律夹进合法区间，不写出界金额', () => {
    const trade = normalizeTrade({
      autoCancelMinutes: 999_999,
      freightAmount: -50,
      refundDaysLimit: 'abc',
      pointsReturnRate: 1e9,
    });
    expect(trade.autoCancelMinutes).toBe(10_080);
    expect(trade.freightAmount).toBe(0);
    expect(trade.refundDaysLimit).toBe(BRAND_DEFAULT_TRADE.refundDaysLimit);
    expect(trade.pointsReturnRate).toBeLessThanOrEqual(1000);
  });

  it('没设「多少积分抵 1 元」就不允许抵扣：上限压回 0，避免算出负应付', () => {
    expect(
      normalizeTrade({
        pointsEnabled: true,
        pointsPerYuan: 0,
        pointsDeductMaxPercent: 80,
      }).pointsDeductMaxPercent,
    ).toBe(0);
    expect(
      normalizeTrade({
        pointsEnabled: true,
        pointsPerYuan: 100,
        pointsDeductMaxPercent: 80,
      }).pointsDeductMaxPercent,
    ).toBe(80);
  });

  it('金额保留两位小数，不出现浮点尾巴', () => {
    expect(normalizeTrade({ freightAmount: 9.999 }).freightAmount).toBe(10);
    expect(
      normalizeTrade({ freeFreightAmount: 0.1 + 0.2 }).freeFreightAmount,
    ).toBe(0.3);
  });
});
