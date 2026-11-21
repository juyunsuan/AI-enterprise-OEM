import type {
  BrandOrderDetail,
  BrandOrderItem,
  BrandOrderLog,
  BrandOrderReceiver,
  BrandOrderRow,
  BrandRefund,
  BrandPublicOrderRow,
} from '@enterprise/contracts';
import { amount, clip, iso, jsonList, shopStatus } from './brand.shared';

type OrderLike = {
  id: number;
  shopId: number;
  orderNo: string;
  customerId: number;
  status: string;
  payStatus: string;
  refundStatus: string;
  payType: string;
  goodsAmount: unknown;
  freightAmount: unknown;
  discountAmount: unknown;
  pointsDeduct: number;
  payAmount: unknown;
  couponName: string;
  buyerRemark: string;
  sellerRemark: string;
  expressCompany: string;
  expressNo: string;
  transactionId: string;
  receiverName: string;
  receiverPhone: string;
  receiverProvince: string;
  receiverCity: string;
  receiverDistrict: string;
  receiverDetail: string;
  createdAt: Date;
  paidAt: Date | null;
  shippedAt: Date | null;
  receivedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  expireAt: Date | null;
};

const ENUM = <T extends string>(
  value: string,
  allowed: readonly T[],
  fallback: T,
): T =>
  (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

const ORDER_STATUS = [
  'PENDING_PAYMENT',
  'PAID',
  'SHIPPED',
  'COMPLETED',
  'CANCELLED',
] as const;
const PAY_STATUS = ['UNPAID', 'PAID', 'REFUNDING', 'REFUNDED'] as const;
const REFUND_STATUS = [
  'NONE',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'DONE',
] as const;
const PAY_TYPE = ['WECHAT', 'BALANCE', 'OFFLINE'] as const;

/**
 * 订单行 → 契约行。`itemSummary` / `coverImage` / `nickname` 这几列库里没有，
 * 由调用方把已经批量查好的关联数据传进来，避免每行一次查询。
 */
export function orderRow(
  row: OrderLike,
  extra?: {
    nickname?: string;
    avatar?: string;
    customerPhone?: string;
    itemCount?: number;
    itemSummary?: string;
    coverImage?: string;
  },
): BrandOrderRow {
  return {
    id: row.id,
    shopId: row.shopId,
    orderNo: row.orderNo,
    customerId: row.customerId,
    nickname: clip(extra?.nickname || '', 60) || '微信用户',
    avatar: extra?.avatar || '',
    customerPhone: extra?.customerPhone || '',
    status: ENUM(row.status, ORDER_STATUS, 'PENDING_PAYMENT'),
    payStatus: ENUM(row.payStatus, PAY_STATUS, 'UNPAID'),
    refundStatus: ENUM(row.refundStatus, REFUND_STATUS, 'NONE'),
    payType: ENUM(row.payType, PAY_TYPE, 'WECHAT'),
    goodsAmount: amount(row.goodsAmount),
    freightAmount: amount(row.freightAmount),
    discountAmount: amount(row.discountAmount),
    pointsDeduct: row.pointsDeduct,
    payAmount: amount(row.payAmount),
    itemCount: extra?.itemCount || 0,
    itemSummary: extra?.itemSummary || '',
    coverImage: extra?.coverImage || '',
    couponName: row.couponName,
    buyerRemark: row.buyerRemark,
    sellerRemark: row.sellerRemark,
    expressCompany: row.expressCompany,
    expressNo: row.expressNo,
    createdAt: iso(row.createdAt),
    paidAt: iso(row.paidAt),
    shippedAt: iso(row.shippedAt),
    receivedAt: iso(row.receivedAt),
    completedAt: iso(row.completedAt),
    cancelledAt: iso(row.cancelledAt),
    expireAt: iso(row.expireAt),
  };
}

export function publicOrderRow(row: OrderLike): BrandPublicOrderRow {
  return {
    id: row.id,
    orderNo: row.orderNo,
    status: ENUM(row.status, ORDER_STATUS, 'PENDING_PAYMENT'),
    payStatus: ENUM(row.payStatus, PAY_STATUS, 'UNPAID'),
    refundStatus: ENUM(row.refundStatus, REFUND_STATUS, 'NONE'),
    payAmount: amount(row.payAmount),
    goodsAmount: amount(row.goodsAmount),
    freightAmount: amount(row.freightAmount),
    discountAmount: amount(row.discountAmount),
    itemCount: 0,
    coverImage: '',
    expressCompany: row.expressCompany,
    expressNo: row.expressNo,
    createdAt: iso(row.createdAt),
    paidAt: iso(row.paidAt),
    expireAt: iso(row.expireAt),
  };
}

export function ordersOf(rows: OrderLike[]): BrandOrderRow[] {
  return rows.map((row) => orderRow(row));
}

export function receiverOf(row: OrderLike): BrandOrderReceiver {
  return {
    name: row.receiverName,
    phone: row.receiverPhone,
    province: row.receiverProvince,
    city: row.receiverCity,
    district: row.receiverDistrict,
    detail: row.receiverDetail,
  };
}

type ItemLike = {
  id: number;
  productId: number;
  skuId: number;
  title: string;
  skuName: string;
  image: string;
  price: unknown;
  quantity: number;
  totalPrice: unknown;
  refundStatus: string;
  refundedAmount: unknown;
  reviewed: boolean;
};

export function orderItem(row: ItemLike): BrandOrderItem {
  return {
    id: row.id,
    productId: row.productId,
    skuId: row.skuId,
    title: row.title,
    skuName: row.skuName,
    image: row.image,
    price: amount(row.price),
    quantity: row.quantity,
    totalPrice: amount(row.totalPrice),
    refundStatus: ENUM(row.refundStatus, REFUND_STATUS, 'NONE'),
    refundedAmount: amount(row.refundedAmount),
    reviewed: row.reviewed,
  };
}

export function orderLog(row: {
  id: number;
  operatorType: string;
  operatorId: string;
  action: string;
  content: string;
  createdAt: Date;
}): BrandOrderLog {
  return {
    id: row.id,
    operatorType: ENUM(
      row.operatorType,
      ['SYSTEM', 'CUSTOMER', 'OWNER'] as const,
      'SYSTEM',
    ),
    operatorId: row.operatorId,
    action: row.action,
    content: row.content,
    createdAt: iso(row.createdAt),
  };
}

type RefundLike = {
  id: number;
  shopId: number;
  refundNo: string;
  orderId: number;
  orderItemId: number;
  customerId: number;
  productId: number;
  type: string;
  reason: string;
  description: string;
  images: unknown;
  amount: unknown;
  status: string;
  adminRemark: string;
  rejectReason: string;
  returnExpress: string;
  refundedAt: Date | null;
  createdAt: Date;
};

export function refundRow(
  row: RefundLike,
  extra?: {
    orderNo?: string;
    title?: string;
    skuName?: string;
    image?: string;
    quantity?: number;
    nickname?: string;
    customerPhone?: string;
    orderPayAmount?: number;
  },
): BrandRefund {
  return {
    id: row.id,
    shopId: row.shopId,
    refundNo: row.refundNo,
    orderId: row.orderId,
    orderNo: extra?.orderNo || '',
    orderItemId: row.orderItemId,
    productId: row.productId,
    title: extra?.title || '',
    skuName: extra?.skuName || '',
    image: extra?.image || '',
    quantity: extra?.quantity || 0,
    customerId: row.customerId,
    nickname: extra?.nickname || '微信用户',
    customerPhone: extra?.customerPhone || '',
    type: ENUM(
      row.type,
      ['REFUND_ONLY', 'RETURN_REFUND'] as const,
      'REFUND_ONLY',
    ),
    reason: row.reason,
    desc: row.description,
    images: jsonList<string>(row.images),
    amount: amount(row.amount),
    orderPayAmount: extra?.orderPayAmount || 0,
    status: ENUM(
      row.status,
      ['PENDING', 'AGREED', 'REJECTED', 'REFUNDED', 'CANCELLED'] as const,
      'PENDING',
    ),
    adminRemark: row.adminRemark,
    rejectReason: row.rejectReason,
    returnExpress: row.returnExpress,
    refundedAt: iso(row.refundedAt),
    createdAt: iso(row.createdAt),
  };
}

export function orderDetail(
  row: OrderLike,
  items: ItemLike[],
  logs: Array<{
    id: number;
    operatorType: string;
    operatorId: string;
    action: string;
    content: string;
    createdAt: Date;
  }>,
  refunds: RefundLike[],
  customer?: { nickname: string; avatar: string; phone: string },
): BrandOrderDetail {
  const first = items[0];
  return {
    ...orderRow(row, {
      nickname: customer?.nickname,
      avatar: customer?.avatar,
      customerPhone: customer?.phone,
      itemCount: items.length,
      itemSummary: items
        .map(
          (item) =>
            `${item.title}${item.skuName ? ` / ${item.skuName}` : ''} ×${item.quantity}`,
        )
        .join('；'),
      coverImage: first?.image || '',
    }),
    items: items.map((item) => orderItem(item)),
    logs: logs.map((log) => orderLog(log)),
    receiver: receiverOf(row),
    transactionId: row.transactionId,
    refunds: refunds.map((refund) =>
      refundRow(refund, {
        orderNo: row.orderNo,
        orderPayAmount: amount(row.payAmount),
        nickname: customer?.nickname,
        customerPhone: customer?.phone,
      }),
    ),
  };
}

export { shopStatus };
