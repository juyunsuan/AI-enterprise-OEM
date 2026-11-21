import {
  allowedActions,
  isAutoCancellable,
  ORDER_ACTION,
  ORDER_STATUS,
  orderProgress,
  orderStatusLabel,
  orderStatusOf,
  statusAfterPaid,
  transition,
} from './order-machine';

const shipping = {
  status: ORDER_STATUS.PENDING_PAYMENT,
  requiresShipping: true,
};

describe('commerce-core/order-machine 状态流转', () => {
  it('付款落点按是否需要配送分叉', () => {
    expect(statusAfterPaid(true)).toBe(ORDER_STATUS.PAID);
    expect(statusAfterPaid(false)).toBe(ORDER_STATUS.COMPLETED);
    expect(transition(shipping, ORDER_ACTION.PAY, 'BUYER').status).toBe(
      ORDER_STATUS.PAID,
    );
    expect(
      transition(
        { status: ORDER_STATUS.PENDING_PAYMENT, requiresShipping: false },
        ORDER_ACTION.PAY,
        'SYSTEM',
      ).ok,
    ).toBe(true);
  });

  it('发货与收货各有唯一入口，越界给出可读原因', () => {
    const paid = { status: ORDER_STATUS.PAID, requiresShipping: true };
    expect(transition(paid, ORDER_ACTION.SHIP, 'BUYER').reason).toBe(
      '发货由商家操作',
    );
    expect(transition(paid, ORDER_ACTION.SHIP, 'SELLER').status).toBe(
      ORDER_STATUS.SHIPPED,
    );
    expect(
      transition(
        { status: ORDER_STATUS.PAID, requiresShipping: false },
        ORDER_ACTION.SHIP,
        'SELLER',
      ).reason,
    ).toBe('虚拟商品无需发货');
    const shipped = { status: ORDER_STATUS.SHIPPED, requiresShipping: true };
    expect(
      transition(shipped, ORDER_ACTION.CONFIRM_RECEIPT, 'SELLER').reason,
    ).toBe('确认收货由顾客操作');
    expect(
      transition(shipped, ORDER_ACTION.CONFIRM_RECEIPT, 'SYSTEM').status,
    ).toBe(ORDER_STATUS.COMPLETED);
    expect(
      transition(
        { status: ORDER_STATUS.PAID, requiresShipping: true },
        ORDER_ACTION.CONFIRM_RECEIPT,
        'BUYER',
      ).reason,
    ).toBe('订单尚未发货');
  });

  it('取消与关闭分角色，已付款一律走售后', () => {
    const closed = transition(shipping, ORDER_ACTION.CLOSE, 'SELLER');
    expect(closed.status).toBe(ORDER_STATUS.CANCELLED);
    expect(transition(shipping, ORDER_ACTION.CLOSE, 'BUYER').ok).toBe(false);
    expect(
      transition(
        { status: ORDER_STATUS.PAID, requiresShipping: true },
        ORDER_ACTION.SELF_CANCEL,
        'BUYER',
      ).reason,
    ).toBe('只有待付款订单可以取消；已付款请申请售后退款');
    expect(
      transition(shipping, ORDER_ACTION.SELF_CANCEL, 'BUYER', {
        selfCancelEnabled: false,
      }).reason,
    ).toBe('本商城未开放自助取消，请联系商家');
  });

  it('售后不改订单主状态，时限过期由 gate 拦截', () => {
    const paid = { status: ORDER_STATUS.PAID, requiresShipping: true };
    const result = transition(paid, ORDER_ACTION.APPLY_AFTERSALE, 'BUYER');
    expect(result.ok).toBe(true);
    expect(result.status).toBe(ORDER_STATUS.PAID);
    expect(
      transition(paid, ORDER_ACTION.APPLY_AFTERSALE, 'BUYER', {
        aftersaleAllowed: false,
      }).reason,
    ).toBe('已超过售后时限');
    expect(
      transition(
        { status: ORDER_STATUS.COMPLETED, requiresShipping: true },
        ORDER_ACTION.APPLY_AFTERSALE,
        'SELLER',
      ).reason,
    ).toBe('售后由顾客发起');
  });

  it('未知状态串一律按待付款兜底，不会渲染出空按钮', () => {
    expect(orderStatusOf('WHATEVER')).toBe(ORDER_STATUS.PENDING_PAYMENT);
    expect(orderStatusOf(null)).toBe(ORDER_STATUS.PENDING_PAYMENT);
  });
});

describe('commerce-core/order-machine 按钮与进度', () => {
  it('买家侧按钮集合随状态收敛', () => {
    expect(allowedActions(shipping, 'BUYER')).toEqual([
      ORDER_ACTION.PAY,
      ORDER_ACTION.SELF_CANCEL,
    ]);
    expect(
      allowedActions(shipping, 'BUYER', { selfCancelEnabled: false }),
    ).toEqual([ORDER_ACTION.PAY]);
    expect(
      allowedActions(
        { status: ORDER_STATUS.SHIPPED, requiresShipping: true },
        'BUYER',
      ),
    ).toEqual([ORDER_ACTION.CONFIRM_RECEIPT, ORDER_ACTION.APPLY_AFTERSALE]);
    expect(
      allowedActions(
        { status: ORDER_STATUS.SHIPPED, requiresShipping: true },
        'BUYER',
        { aftersaleAllowed: false },
      ),
    ).toEqual([ORDER_ACTION.CONFIRM_RECEIPT]);
  });

  it('卖家侧不提供付款与收货', () => {
    const actions = allowedActions(
      { status: ORDER_STATUS.SHIPPED, requiresShipping: true },
      'SELLER',
    );
    expect(actions).toEqual([ORDER_ACTION.COMPLETE]);
    expect(allowedActions(shipping, 'SELLER')).toEqual([ORDER_ACTION.CLOSE]);
  });

  it('文案区分实物与虚拟的待发货段', () => {
    expect(orderStatusLabel(ORDER_STATUS.PAID, true)).toBe('待发货');
    expect(orderStatusLabel(ORDER_STATUS.PAID, false)).toBe('待完成');
    expect(orderStatusLabel('CANCELLED')).toBe('已关闭');
  });

  it('进度条在虚拟单上少一步发货', () => {
    expect(orderProgress(ORDER_STATUS.PENDING_PAYMENT, true)).toEqual({
      steps: ['提交订单', '买家付款', '商家发货', '确认收货'],
      current: 1,
      done: false,
    });
    expect(orderProgress(ORDER_STATUS.SHIPPED, true).current).toBe(3);
    expect(orderProgress(ORDER_STATUS.COMPLETED, false)).toEqual({
      steps: ['提交订单', '买家付款', '交易完成'],
      current: 2,
      done: true,
    });
    expect(orderProgress(ORDER_STATUS.CANCELLED, true).steps).toEqual([
      '提交订单',
      '订单关闭',
    ]);
  });
});

describe('commerce-core/order-machine 自动取消', () => {
  it('只在待付款且已过期限时命中', () => {
    const createdAt = new Date('2026-11-18T10:00:00.000Z');
    expect(
      isAutoCancellable(
        ORDER_STATUS.PENDING_PAYMENT,
        createdAt,
        30,
        new Date('2026-11-18T10:31:00.000Z'),
      ),
    ).toBe(true);
    expect(
      isAutoCancellable(
        ORDER_STATUS.PENDING_PAYMENT,
        createdAt,
        30,
        new Date('2026-11-18T10:29:00.000Z'),
      ),
    ).toBe(false);
    expect(
      isAutoCancellable(
        ORDER_STATUS.PAID,
        createdAt,
        30,
        new Date('2026-11-18T11:00:00.000Z'),
      ),
    ).toBe(false);
    expect(isAutoCancellable(ORDER_STATUS.PENDING_PAYMENT, createdAt, 0)).toBe(
      false,
    );
  });
});
