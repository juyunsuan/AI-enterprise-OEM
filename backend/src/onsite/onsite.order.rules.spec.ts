import { BusinessException } from '../common/business.exception';
import {
  addonAmountCents,
  type OrderAction,
  assertActor,
  OCCUPYING_STATUSES,
  priceOrder,
  refundableCents,
  transit,
} from './onsite.order.rules';

const message = (run: () => unknown) => {
  try {
    run();
    return '';
  } catch (error) {
    return error instanceof BusinessException ? error.message : '未知错误';
  }
};

describe('onsite/订单算价', () => {
  it('多行服务的优惠券按金额占比分摊，末行兜底，合计严格等于券额', () => {
    const result = priceOrder({
      items: [
        {
          serviceId: 1,
          unitPriceCents: 19900,
          quantity: 1,
          durationMinutes: 60,
          materialFeeCents: 0,
        },
        {
          serviceId: 2,
          unitPriceCents: 9900,
          quantity: 1,
          durationMinutes: 30,
          materialFeeCents: 0,
        },
        {
          serviceId: 3,
          unitPriceCents: 3300,
          quantity: 1,
          durationMinutes: 15,
          materialFeeCents: 0,
        },
      ],
      travelFeeCents: 1500,
      discountCents: 5000,
    });
    expect(result.serviceFeeCents).toBe(33100);
    expect(result.discountCents).toBe(5000);
    expect(
      result.items.reduce((sum, item) => sum + item.couponDiscountCents, 0),
    ).toBe(5000);
    // 实付 = 服务 33100 + 车费 1500 − 券 5000
    expect(result.payAmountCents).toBe(29600);
    expect(result.durationMinutes).toBe(105);
  });

  it('券不允许抵车费，也不允许把订单抵成负数', () => {
    const result = priceOrder({
      items: [
        {
          serviceId: 1,
          unitPriceCents: 2000,
          quantity: 1,
          durationMinutes: 30,
          materialFeeCents: 500,
        },
      ],
      travelFeeCents: 1200,
      discountCents: 99999,
    });
    expect(result.discountCents).toBe(2500);
    expect(result.payAmountCents).toBe(1200);
    expect(result.items[0].payAmountCents).toBe(0);
  });

  it('物料费按份数计，可退上限只看收款台账剩余', () => {
    const result = priceOrder({
      items: [
        {
          serviceId: 1,
          unitPriceCents: 10000,
          quantity: 3,
          durationMinutes: 60,
          materialFeeCents: 800,
        },
      ],
      travelFeeCents: 0,
      discountCents: 0,
    });
    expect(result.serviceFeeCents).toBe(30000);
    expect(result.materialFeeCents).toBe(2400);
    expect(
      refundableCents([
        { refundableAmountCents: 32400 },
        { refundableAmountCents: 9000 },
        { refundableAmountCents: -5 },
      ]),
    ).toBe(41400);
  });

  it('空明细与加钟费率（120% 加价）按参考源码口径计算', () => {
    expect(
      message(() =>
        priceOrder({ items: [], travelFeeCents: 0, discountCents: 0 }),
      ),
    ).toContain('至少选择一个服务');
    expect(
      addonAmountCents({ unitPriceCents: 10000, quantity: 2, addonRate: 120 }),
    ).toBe(24000);
    expect(
      addonAmountCents({
        unitPriceCents: 10000,
        quantity: 1,
        addonRate: Number.NaN,
      }),
    ).toBe(10000);
  });
});

describe('onsite/订单状态机', () => {
  const fresh = {
    status: 'PENDING_PAYMENT',
    payStatus: 'UNPAID',
    refundStatus: 'NONE',
  };

  it('正常链路一路推进，每步盖对应时间戳', () => {
    let order = { ...fresh };
    // 每一步都由该步的合法发起角色推进（角色闸门与状态闸门是同一条链上的两道锁）
    const chain: [OrderAction, string, string][] = [
      ['pay', 'CUSTOMER', 'PAID'],
      ['accept', 'STAFF', 'ACCEPTED'],
      ['depart', 'STAFF', 'EN_ROUTE'],
      ['arrive', 'STAFF', 'ON_SITE'],
      ['start', 'STAFF', 'SERVING'],
      ['complete', 'STAFF', 'COMPLETED'],
      ['sign', 'CUSTOMER', 'SIGNED'],
      ['review', 'CUSTOMER', 'REVIEWED'],
    ];
    for (const [action, role, expected] of chain) {
      order = transit({
        ...order,
        action,
        role,
        at: new Date('2026-11-20T10:00:00Z'),
      });
      expect(order.status).toBe(expected);
    }
    expect(order.payStatus).toBe('PAID');
  });

  it('跳步直接拒绝，并把当前状态说成人话', () => {
    const text = message(() =>
      transit({
        ...fresh,
        status: 'PAID',
        payStatus: 'PAID',
        action: 'depart',
        role: 'STAFF',
      }),
    );
    expect(text).toContain('待接单');
    expect(text).toContain('不能执行这一步');
  });

  it('角色越权单独拦：顾客不能点完成，系统才能超时关闭', () => {
    expect(() => assertActor('complete', 'CUSTOMER')).toThrow(
      BusinessException,
    );
    expect(() => assertActor('expire', 'SYSTEM')).not.toThrow();
    expect(() => assertActor('accept', 'STAFF')).not.toThrow();
  });

  it('退款链路：申请进入退款中，同意后置已退款，驳回回到申请前状态', () => {
    const applied = transit({
      status: 'COMPLETED',
      payStatus: 'PAID',
      refundStatus: 'NONE',
      action: 'refundApply',
      role: 'CUSTOMER',
    });
    expect(applied).toMatchObject({
      status: 'REFUND_PENDING',
      refundStatus: 'PENDING',
    });
    const agreed = transit({
      ...applied,
      action: 'refundAgree',
      role: 'OWNER',
    });
    expect(agreed).toMatchObject({
      status: 'REFUNDED',
      payStatus: 'REFUNDED',
      refundStatus: 'DONE',
    });
    const rejected = transit({
      ...applied,
      action: 'refundReject',
      role: 'OWNER',
      restoreTo: 'SERVING',
    });
    expect(rejected).toMatchObject({
      status: 'SERVING',
      refundStatus: 'REJECTED',
    });
  });

  it('退款中的订单不能继续往前推（防止绕过售后直接完成）', () => {
    expect(
      message(() =>
        transit({
          status: 'REFUND_PENDING',
          payStatus: 'PAID',
          refundStatus: 'PENDING',
          action: 'complete',
          role: 'OWNER',
        }),
      ),
    ).toContain('请先处理退款');
  });

  it('占用档期的状态集合与终态互斥（排期与算档共用一份定义）', () => {
    expect(OCCUPYING_STATUSES).toContain('PENDING_PAYMENT');
    expect(OCCUPYING_STATUSES).not.toContain('REFUNDED');
    expect(OCCUPYING_STATUSES).not.toContain('CANCELLED');
  });
});
