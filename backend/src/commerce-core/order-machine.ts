import { safeText } from './text';
/**
 * 订单状态机：店主的订单管理页与小程序 C 端共用同一份状态定义与按钮口径。
 *
 * 两个业务（自营品牌店、商户入驻市场）的差别只在「谁能动」和「动完写哪张表」，
 * 流转本身完全一致，所以这里只描述流转，不碰任何仓储；
 * 业务侧把库里的行映射成 `OrderSnapshot` 再调用，写库时用带条件的 update 靠影响行数判并发。
 */

export const ORDER_STATUS = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PAID: 'PAID',
  SHIPPED: 'SHIPPED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];
export const ORDER_STATUSES = Object.values(ORDER_STATUS);

export const ORDER_ACTION = {
  PAY: 'PAY',
  SELF_CANCEL: 'SELF_CANCEL',
  CLOSE: 'CLOSE',
  SHIP: 'SHIP',
  CONFIRM_RECEIPT: 'CONFIRM_RECEIPT',
  COMPLETE: 'COMPLETE',
  APPLY_AFTERSALE: 'APPLY_AFTERSALE',
} as const;
export type OrderAction = (typeof ORDER_ACTION)[keyof typeof ORDER_ACTION];
export const ORDER_ACTION_LABELS: Record<OrderAction, string> = {
  PAY: '立即付款',
  SELF_CANCEL: '取消订单',
  CLOSE: '关闭订单',
  SHIP: '发货',
  CONFIRM_RECEIPT: '确认收货',
  COMPLETE: '标记完成',
  APPLY_AFTERSALE: '申请售后',
};

export type OrderActor = 'BUYER' | 'SELLER' | 'SYSTEM';

export interface OrderSnapshot {
  status: string;
  /** 本单是否含需要配送的商品：决定 SHIPPED 这一段是否存在。 */
  requiresShipping: boolean;
  /** 未付款自动取消剩余分钟数，负数表示不限。 */
  minutesToAutoCancel?: number;
}

/** 状态之外的放行条件，来自店铺交易参数与售后时限判定。 */
export interface OrderGate {
  /** 允许顾客自助取消未付款订单。 */
  selfCancelEnabled?: boolean;
  /** 允许顾客申请售后（含售后时限已过的排除）。 */
  aftersaleAllowed?: boolean;
}

const KNOWN_STATUS: Record<string, OrderStatus> = {
  PENDING_PAYMENT: ORDER_STATUS.PENDING_PAYMENT,
  PAID: ORDER_STATUS.PAID,
  SHIPPED: ORDER_STATUS.SHIPPED,
  COMPLETED: ORDER_STATUS.COMPLETED,
  CANCELLED: ORDER_STATUS.CANCELLED,
};

export function orderStatusOf(value: unknown): OrderStatus {
  return KNOWN_STATUS[safeText(value)] ?? ORDER_STATUS.PENDING_PAYMENT;
}

/** 付款成功后的落点：虚拟单直接完成，实物单进入待发货。 */
export function statusAfterPaid(requiresShipping: boolean): OrderStatus {
  return requiresShipping ? ORDER_STATUS.PAID : ORDER_STATUS.COMPLETED;
}

export interface TransitionResult {
  ok: boolean;
  status: OrderStatus;
  action: OrderAction;
  /** 拒绝原因，同时用于界面上的禁用提示。 */
  reason: string;
}

/**
 * 唯一流转判定入口：`ok=false` 时 `status` 保持原值，`reason` 可直接贴给顾客或店主。
 *
 * 售后走 `APPLY_AFTERSALE`：订单主状态不流转（售后态另列），所以成功时原样返回。
 */
export function transition(
  snapshot: OrderSnapshot,
  action: OrderAction,
  actor: OrderActor,
  gate: OrderGate = {},
): TransitionResult {
  const status = orderStatusOf(snapshot.status);
  const same = (reason = ''): TransitionResult => ({
    ok: reason === '',
    status,
    action,
    reason,
  });

  switch (action) {
    case ORDER_ACTION.PAY:
      if (actor === 'SELLER') return same('商家不能代顾客付款');
      if (status === ORDER_STATUS.PAID || status === ORDER_STATUS.COMPLETED) {
        return same('订单已支付');
      }
      if (status !== ORDER_STATUS.PENDING_PAYMENT) return same('订单已关闭');
      return {
        ok: true,
        status: statusAfterPaid(snapshot.requiresShipping),
        action,
        reason: '',
      };
    case ORDER_ACTION.SELF_CANCEL:
      if (actor === 'SELLER') return same('商家请用关闭订单');
      if (status !== ORDER_STATUS.PENDING_PAYMENT) {
        return same('只有待付款订单可以取消；已付款请申请售后退款');
      }
      if (gate.selfCancelEnabled === false) {
        return same('本商城未开放自助取消，请联系商家');
      }
      return { ok: true, status: ORDER_STATUS.CANCELLED, action, reason: '' };
    case ORDER_ACTION.CLOSE:
      if (actor === 'BUYER') return same('顾客请用取消订单');
      if (status !== ORDER_STATUS.PENDING_PAYMENT) {
        return same('只有待付款订单可以直接关闭；已付款请在售后里退款');
      }
      return { ok: true, status: ORDER_STATUS.CANCELLED, action, reason: '' };
    case ORDER_ACTION.SHIP:
      if (actor === 'BUYER') return same('发货由商家操作');
      if (!snapshot.requiresShipping) return same('虚拟商品无需发货');
      if (status !== ORDER_STATUS.PAID) {
        return same(
          status === ORDER_STATUS.PENDING_PAYMENT
            ? '订单尚未付款'
            : '订单已发货或已终态',
        );
      }
      return { ok: true, status: ORDER_STATUS.SHIPPED, action, reason: '' };
    case ORDER_ACTION.CONFIRM_RECEIPT:
      if (actor === 'SELLER') return same('确认收货由顾客操作');
      if (status !== ORDER_STATUS.SHIPPED) return same('订单尚未发货');
      return { ok: true, status: ORDER_STATUS.COMPLETED, action, reason: '' };
    case ORDER_ACTION.COMPLETE:
      if (actor === 'BUYER') return same('顾客请用确认收货');
      if (status === ORDER_STATUS.COMPLETED) return same('订单已完成');
      if (status !== ORDER_STATUS.SHIPPED && status !== ORDER_STATUS.PAID) {
        return same('当前状态不能标记完成');
      }
      return { ok: true, status: ORDER_STATUS.COMPLETED, action, reason: '' };
    case ORDER_ACTION.APPLY_AFTERSALE:
      if (actor === 'SELLER') return same('售后由顾客发起');
      if (status === ORDER_STATUS.PENDING_PAYMENT) {
        return same('未付款订单不需要售后');
      }
      if (status === ORDER_STATUS.CANCELLED) return same('订单已关闭');
      if (gate.aftersaleAllowed === false) return same('已超过售后时限');
      return same();
    default:
      return same('不支持的操作');
  }
}

/** 当前可执行的动作集合，按角色过滤；界面据此渲染按钮。 */
export function allowedActions(
  snapshot: OrderSnapshot,
  actor: OrderActor,
  gate: OrderGate = {},
): OrderAction[] {
  const candidates: OrderAction[] =
    actor === 'SELLER'
      ? [ORDER_ACTION.CLOSE, ORDER_ACTION.SHIP, ORDER_ACTION.COMPLETE]
      : [
          ORDER_ACTION.PAY,
          ORDER_ACTION.SELF_CANCEL,
          ORDER_ACTION.CONFIRM_RECEIPT,
          ORDER_ACTION.APPLY_AFTERSALE,
        ];
  if (actor === 'SYSTEM') {
    return [ORDER_ACTION.PAY, ORDER_ACTION.SHIP, ORDER_ACTION.CONFIRM_RECEIPT];
  }
  return candidates.filter(
    (action) => transition(snapshot, action, actor, gate).ok,
  );
}

/** 列表筛选项的展示文案：同一个 PAID 在实物单是待发货、在虚拟单不会出现。 */
export function orderStatusLabel(
  status: string,
  requiresShipping = true,
): string {
  switch (orderStatusOf(status)) {
    case ORDER_STATUS.PENDING_PAYMENT:
      return '待付款';
    case ORDER_STATUS.PAID:
      return requiresShipping ? '待发货' : '待完成';
    case ORDER_STATUS.SHIPPED:
      return '待收货';
    case ORDER_STATUS.COMPLETED:
      return '已完成';
    default:
      return '已关闭';
  }
}

export interface OrderProgress {
  steps: string[];
  /** 尚未完成的步骤下标；终态时等于最后一步。 */
  current: number;
  done: boolean;
}

/** C 端订单详情的进度条：虚拟单没有「商家发货」这一步。 */
export function orderProgress(
  status: string,
  requiresShipping: boolean,
): OrderProgress {
  const resolved = orderStatusOf(status);
  if (resolved === ORDER_STATUS.CANCELLED) {
    return { steps: ['提交订单', '订单关闭'], current: 1, done: true };
  }
  const steps = requiresShipping
    ? ['提交订单', '买家付款', '商家发货', '确认收货']
    : ['提交订单', '买家付款', '交易完成'];
  const index =
    resolved === ORDER_STATUS.PENDING_PAYMENT
      ? 1
      : resolved === ORDER_STATUS.PAID
        ? requiresShipping
          ? 2
          : steps.length - 1
        : resolved === ORDER_STATUS.SHIPPED
          ? steps.length - 1
          : steps.length - 1;
  return {
    steps,
    current: Math.min(index, steps.length - 1),
    done: resolved === ORDER_STATUS.COMPLETED,
  };
}

/** 未付款自动取消的到期时间戳；分钟数非法或为 0 表示不自动取消。 */
export function autoCancelDeadline(
  createdAt: Date,
  minutes: number,
  now: Date = new Date(),
): number {
  void now;
  if (!(minutes > 0)) return Number.NaN;
  return createdAt.getTime() + Math.round(minutes) * 60_000;
}

export function isAutoCancellable(
  status: string,
  createdAt: Date,
  minutes: number,
  now: Date = new Date(),
): boolean {
  if (orderStatusOf(status) !== ORDER_STATUS.PENDING_PAYMENT) return false;
  const deadline = autoCancelDeadline(createdAt, minutes, now);
  return Number.isFinite(deadline) && now.getTime() >= deadline;
}
