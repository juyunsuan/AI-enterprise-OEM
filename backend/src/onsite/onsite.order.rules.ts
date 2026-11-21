/**
 * 订单算价与状态机（纯函数，不碰数据库）。
 *
 * 两条硬口径：
 * 1. **金额全程用「分」**。参考源码在 PHP 里用浮点累加（MyISAM 还没事务），
 *    退款与分账时容易差一分对不平；这里所有中间量都是整数分，只有写库那一步转 Decimal。
 * 2. **状态迁移表只有一份**。谁改状态都走 `transit()`，非法迁移直接抛业务码，
 *    避免出现「技师端偷偷把已退款单改成已完成」这类靠人肉约束的漏洞。
 */
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';

export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: '待付款',
  PAID: '待接单',
  ACCEPTED: '已接单',
  EN_ROUTE: '服务出发',
  ON_SITE: '已到达',
  SERVING: '服务中',
  COMPLETED: '已完成',
  SIGNED: '已签收',
  REVIEWED: '已评价',
  CANCELLED: '已取消',
  EXPIRED: '超时关闭',
  REJECTED: '技师拒单',
  REFUND_PENDING: '退款中',
  REFUNDED: '已退款',
};

/** 会占住档期的状态（与排期服务同一口径，避免两处写歪）。 */
export const OCCUPYING_STATUSES = [
  'PENDING_PAYMENT',
  'PAID',
  'ACCEPTED',
  'EN_ROUTE',
  'ON_SITE',
  'SERVING',
  'COMPLETED',
  'SIGNED',
  'REVIEWED',
  'REFUND_PENDING',
];

/** 终态：不再参与排期占用，也不能再往前推。 */
export const CLOSED_STATUSES = ['CANCELLED', 'EXPIRED', 'REJECTED', 'REFUNDED'];

export type OrderAction =
  | 'pay'
  | 'accept'
  | 'reject'
  | 'changeStaff'
  | 'depart'
  | 'arrive'
  | 'start'
  | 'complete'
  | 'sign'
  | 'review'
  | 'cancel'
  | 'expire'
  | 'refundApply'
  | 'refundAgree'
  | 'refundReject';

type Rule = { from: string[]; to: string };

const RULES: Record<OrderAction, Rule> = {
  pay: { from: ['PENDING_PAYMENT'], to: 'PAID' },
  accept: { from: ['PAID'], to: 'ACCEPTED' },
  reject: { from: ['PAID', 'ACCEPTED'], to: 'REJECTED' },
  // 改派后订单回到「已接单」，等新人确认；退款中的单不允许改派
  changeStaff: { from: ['PAID', 'ACCEPTED'], to: 'ACCEPTED' },
  depart: { from: ['ACCEPTED'], to: 'EN_ROUTE' },
  arrive: { from: ['EN_ROUTE'], to: 'ON_SITE' },
  start: { from: ['ON_SITE'], to: 'SERVING' },
  // 完成允许店主代操作（顾客不签、技师忘点的情况很多）
  complete: {
    from: ['ACCEPTED', 'EN_ROUTE', 'ON_SITE', 'SERVING'],
    to: 'COMPLETED',
  },
  sign: { from: ['COMPLETED'], to: 'SIGNED' },
  review: { from: ['COMPLETED', 'SIGNED'], to: 'REVIEWED' },
  cancel: { from: ['PENDING_PAYMENT'], to: 'CANCELLED' },
  expire: { from: ['PENDING_PAYMENT'], to: 'EXPIRED' },
  refundApply: {
    from: [
      'PAID',
      'ACCEPTED',
      'EN_ROUTE',
      'ON_SITE',
      'SERVING',
      'COMPLETED',
      'SIGNED',
    ],
    to: 'REFUND_PENDING',
  },
  refundAgree: { from: ['REFUND_PENDING'], to: 'REFUNDED' },
  // 驳回退款：回到申请前的状态（由调用方把 from 传进来）
  refundReject: { from: ['REFUND_PENDING'], to: 'REFUND_PENDING' },
};

/** 每个动作允许的发起角色。C 端能做的只有 pay/cancel/refundApply/sign/review。 */
const ACTOR_RULES: Record<OrderAction, string[]> = {
  pay: ['CUSTOMER', 'OWNER', 'SYSTEM'],
  accept: ['STAFF', 'OWNER', 'PLATFORM_ADMIN'],
  reject: ['STAFF', 'OWNER', 'PLATFORM_ADMIN'],
  changeStaff: ['OWNER', 'PLATFORM_ADMIN'],
  depart: ['STAFF', 'OWNER', 'PLATFORM_ADMIN'],
  arrive: ['STAFF', 'OWNER', 'PLATFORM_ADMIN'],
  start: ['STAFF', 'OWNER', 'PLATFORM_ADMIN'],
  complete: ['STAFF', 'OWNER', 'PLATFORM_ADMIN'],
  sign: ['CUSTOMER', 'STAFF', 'OWNER'],
  review: ['CUSTOMER', 'SYSTEM'],
  cancel: ['CUSTOMER', 'OWNER', 'SYSTEM'],
  expire: ['SYSTEM'],
  refundApply: ['CUSTOMER', 'OWNER', 'STAFF'],
  refundAgree: ['OWNER', 'PLATFORM_ADMIN'],
  refundReject: ['OWNER', 'PLATFORM_ADMIN'],
};

export function assertActor(action: OrderAction, role: string) {
  const allowed = ACTOR_RULES[action] ?? [];
  if (!allowed.includes(role)) {
    throw new BusinessException(
      ErrorCode.FORBIDDEN,
      `当前身份不能执行「${action}」这一步（仅限 ${allowed.join('/')}）`,
    );
  }
}

export type TransitResult = {
  status: string;
  payStatus: string;
  refundStatus: string;
  /** 时间轴上要落库的列名与时间（调用方直接 spread 进 update data） */
  stamp?: { column: string; at: Date };
};

/**
 * 状态迁移。`refundReject` 的 `to` 由调用方给（回到申请前状态），
 * 其余动作的目标状态完全由规则表决定，不接受外部传入。
 */
export function transit(input: {
  action: OrderAction;
  status: string;
  payStatus: string;
  refundStatus: string;
  role: string;
  /** 驳回退款时要回到的原状态 */
  restoreTo?: string;
  at?: Date;
}): TransitResult {
  assertActor(input.action, input.role);
  const rule = RULES[input.action];
  if (!rule.from.includes(input.status)) {
    throw new BusinessException(
      ErrorCode.CONFLICT,
      `订单当前是「${ORDER_STATUS_LABELS[input.status] ?? input.status}」，不能执行这一步${
        input.status === 'REFUND_PENDING'
          ? '（有退款正在处理中，请先处理退款）'
          : ''
      }`,
    );
  }
  const at = input.at ?? new Date();
  const next: TransitResult = {
    status: rule.to,
    payStatus: input.payStatus,
    refundStatus: input.refundStatus,
  };
  switch (input.action) {
    case 'pay':
      next.payStatus = 'PAID';
      next.stamp = { column: 'paidAt', at };
      break;
    case 'accept':
      next.stamp = { column: 'acceptedAt', at };
      break;
    case 'reject':
      next.stamp = { column: 'rejectedAt', at };
      break;
    case 'depart':
      next.stamp = { column: 'departedAt', at };
      break;
    case 'arrive':
      next.stamp = { column: 'arrivedAt', at };
      break;
    case 'start':
      next.stamp = { column: 'serviceStartedAt', at };
      break;
    case 'complete':
      next.status = 'COMPLETED';
      next.stamp = { column: 'completedAt', at };
      break;
    case 'sign':
      next.stamp = { column: 'signedAt', at };
      break;
    case 'cancel':
    case 'expire':
      next.stamp = { column: 'updatedAt', at };
      break;
    case 'refundApply':
      next.refundStatus = 'PENDING';
      break;
    case 'refundAgree':
      next.payStatus = 'REFUNDED';
      next.refundStatus = 'DONE';
      break;
    case 'refundReject':
      next.status = input.restoreTo || 'COMPLETED';
      next.refundStatus = 'REJECTED';
      break;
    default:
      break;
  }
  return next;
}

// ---------- 算价 ----------

export type PriceItem = {
  serviceId: number;
  /** 下单快照：明细行要存的标题与封面，算价函数原样带出 */
  title?: string;
  coverImage?: string;
  /** 单价（分），已含技师差异价 */
  unitPriceCents: number;
  quantity: number;
  durationMinutes: number;
  /** 物料费按份数计（参考源码 material_fee 随数量走） */
  materialFeeCents: number;
};

export type PriceResult = {
  items: (PriceItem & {
    payAmountCents: number;
    couponDiscountCents: number;
  })[];
  serviceFeeCents: number;
  materialFeeCents: number;
  travelFeeCents: number;
  discountCents: number;
  payAmountCents: number;
  durationMinutes: number;
};

/**
 * 订单算价。
 *
 * 优惠券分摊按「金额占比 + 末行兜底」：前 n-1 行按占比取整，最后一行吃掉差额，
 * 保证 Σ行优惠 = 券优惠，不会出现分摊后差一分导致退款上限与实付不符。
 */
export function priceOrder(input: {
  items: PriceItem[];
  travelFeeCents: number;
  discountCents: number;
}): PriceResult {
  const items = input.items.map((item) => ({
    ...item,
    quantity: Math.max(1, Math.round(item.quantity) || 1),
  }));
  if (!items.length) {
    throw new BusinessException(ErrorCode.BAD_REQUEST, '请至少选择一个服务');
  }
  const serviceFeeCents = items.reduce(
    (sum, item) => sum + item.unitPriceCents * item.quantity,
    0,
  );
  const materialFeeCents = items.reduce(
    (sum, item) => sum + item.materialFeeCents * item.quantity,
    0,
  );
  const travelFeeCents = Math.max(0, Math.round(input.travelFeeCents) || 0);
  // 券只能抵服务与物料，不抵车费：车费是给技师的路途补偿，抵掉后分账要平台垫
  const base = serviceFeeCents + materialFeeCents;
  const discountCents = Math.min(
    Math.max(0, Math.round(input.discountCents) || 0),
    base,
  );
  let allocated = 0;
  const priced = items.map((item, index) => {
    const lineAmount = item.unitPriceCents * item.quantity;
    const material = item.materialFeeCents * item.quantity;
    const lineBase = lineAmount + material;
    let share = 0;
    if (index === items.length - 1) {
      share = discountCents - allocated;
    } else if (base > 0) {
      share = Math.round((discountCents * lineBase) / base);
    }
    share = Math.max(0, Math.min(share, lineBase));
    allocated += share;
    return {
      ...item,
      couponDiscountCents: share,
      payAmountCents: Math.max(0, lineBase - share),
    };
  });
  const payAmountCents = priced.reduce(
    (sum, item) => sum + item.payAmountCents,
    0,
  );
  const durationMinutes = priced.reduce(
    (sum, item) => sum + item.durationMinutes * item.quantity,
    0,
  );
  return {
    items: priced,
    serviceFeeCents,
    materialFeeCents,
    travelFeeCents,
    discountCents,
    payAmountCents: payAmountCents + travelFeeCents,
    durationMinutes,
  };
}

/** 退款上限：可退 = 收款台账剩余可退之和（含加钟单），不是订单原价。 */
export function refundableCents(flows: { refundableAmountCents: number }[]) {
  return flows.reduce(
    (sum, flow) => sum + Math.max(0, Math.round(flow.refundableAmountCents)),
    0,
  );
}

/** 加钟金额：单位时长 × 数量 × 服务单价 × 加钟费率（费率 100 = 原价）。 */
export function addonAmountCents(input: {
  unitPriceCents: number;
  quantity: number;
  addonRate: number;
}) {
  const rate = Number.isFinite(input.addonRate) ? input.addonRate : 100;
  return Math.round(
    (input.unitPriceCents * Math.max(1, input.quantity) * rate) / 100,
  );
}
