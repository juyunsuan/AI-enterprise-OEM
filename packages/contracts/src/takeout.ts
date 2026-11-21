import { z } from "zod";
import {
  miniAppInputSchema,
  miniAppTestResultSchema,
  miniAppViewSchema,
} from "./private-mini";

/**
 * 外卖点餐小程序契约（独立数据域）。
 *
 * 与品牌商城物理隔离：这里的店铺、菜单、顾客、订单、券都对应 `takeout_*` 表，
 * 不引用 brand-mall 的任何 schema。复用的只是公共服务（登录令牌、微信支付、
 * SCRM 桥、commerce-core 算价/状态机）。
 */

export const TAKEOUT_SHOP_STATUSES = [
  "DRAFT",
  "ONLINE",
  "SUSPENDED",
  "CLOSED",
] as const;
export type TakeoutShopStatus = (typeof TAKEOUT_SHOP_STATUSES)[number];
export const TAKEOUT_SHOP_STATUS_LABELS: Record<string, string> = {
  DRAFT: "未上线",
  ONLINE: "营业中",
  SUSPENDED: "平台停服",
  CLOSED: "已关闭",
};

export const TAKEOUT_PRODUCT_STATUSES = ["DRAFT", "OFFLINE", "ONLINE"] as const;
export const TAKEOUT_PRODUCT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  OFFLINE: "已下架",
  ONLINE: "上架中",
};

export const TAKEOUT_ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "PAID",
  "SHIPPED",
  "COMPLETED",
  "CANCELLED",
] as const;
export type TakeoutOrderStatus = (typeof TAKEOUT_ORDER_STATUSES)[number];
export type TakeoutPayStatus = (typeof TAKEOUT_PAY_STATUSES)[number];
export type TakeoutPayType = (typeof TAKEOUT_PAY_TYPES)[number];
export type TakeoutProductStatus = (typeof TAKEOUT_PRODUCT_STATUSES)[number];
export const TAKEOUT_ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "待支付",
  PAID: "备餐中",
  SHIPPED: "待取餐/配送中",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

export const TAKEOUT_PAY_STATUSES = [
  "UNPAID",
  "PAID",
  "REFUNDING",
  "REFUNDED",
] as const;
export const TAKEOUT_PAY_STATUS_LABELS: Record<string, string> = {
  UNPAID: "未支付",
  PAID: "已支付",
  REFUNDING: "退款中",
  REFUNDED: "已退款",
};

export const TAKEOUT_ORDER_MODES = ["DELIVERY", "PICKUP", "DINEIN"] as const;
export type TakeoutOrderMode = (typeof TAKEOUT_ORDER_MODES)[number];
export const TAKEOUT_ORDER_MODE_LABELS: Record<string, string> = {
  DELIVERY: "外卖配送",
  PICKUP: "到店自取",
  DINEIN: "堂食",
};

export const TAKEOUT_PAY_TYPES = ["WECHAT", "OFFLINE"] as const;
export const TAKEOUT_PAY_TYPE_LABELS: Record<string, string> = {
  WECHAT: "微信支付",
  OFFLINE: "到店支付",
};

export const TAKEOUT_COUPON_TYPES = ["FULL_REDUCE", "DISCOUNT"] as const;
export const TAKEOUT_COUPON_TYPE_LABELS: Record<string, string> = {
  FULL_REDUCE: "满减券",
  DISCOUNT: "折扣券",
};
export const TAKEOUT_COUPON_STATUSES = ["ONLINE", "OFFLINE", "ENDED"] as const;
export const TAKEOUT_COUPON_STATUS_LABELS: Record<string, string> = {
  ONLINE: "发放中",
  OFFLINE: "已停发",
  ENDED: "已结束",
};

const money = z.number().min(0).max(99_999_999);

export const takeoutTradeSchema = z.object({
  autoCancelMinutes: z.number().int().min(5).max(10080).default(30),
  deliveryFee: money.default(0),
  freeDeliveryAmount: money.default(0),
  minOrderAmount: money.default(0),
  buyerMessageEnabled: z.boolean().default(true),
  selfCancelEnabled: z.boolean().default(true),
  pointsEnabled: z.boolean().default(false),
  pointsReturnRate: z.number().min(0).max(1000).default(1),
  pointsPerYuan: z.number().int().min(0).max(100000).default(0),
  pointsDeductMaxPercent: z.number().int().min(0).max(100).default(0),
});
export type TakeoutTrade = z.infer<typeof takeoutTradeSchema>;

export const TAKEOUT_DEFAULT_TRADE: TakeoutTrade = {
  autoCancelMinutes: 30,
  deliveryFee: 0,
  freeDeliveryAmount: 0,
  minOrderAmount: 0,
  buyerMessageEnabled: true,
  selfCancelEnabled: true,
  pointsEnabled: false,
  pointsReturnRate: 1,
  pointsPerYuan: 0,
  pointsDeductMaxPercent: 0,
};

export const takeoutConfigSchema = z.object({
  businessHours: z.string().max(40).default("10:00-22:00"),
  estimatedMinutes: z.number().int().min(5).max(180).default(30),
  deliveryEnabled: z.boolean().default(true),
  pickupEnabled: z.boolean().default(true),
  dineInEnabled: z.boolean().default(true),
  announcement: z.string().max(120).default(""),
});
export type TakeoutConfig = z.infer<typeof takeoutConfigSchema>;

export const TAKEOUT_DEFAULT_CONFIG: TakeoutConfig = {
  businessHours: "10:00-22:00",
  estimatedMinutes: 30,
  deliveryEnabled: true,
  pickupEnabled: true,
  dineInEnabled: true,
  announcement: "",
};

export const takeoutShopSchema = z.object({
  id: z.number(),
  ownerUserId: z.string(),
  name: z.string(),
  shopCode: z.string(),
  logo: z.string(),
  slogan: z.string(),
  servicePhone: z.string(),
  themeColor: z.string(),
  status: z.enum(TAKEOUT_SHOP_STATUSES),
  trade: takeoutTradeSchema,
  takeout: takeoutConfigSchema,
  scrmEnabled: z.boolean(),
  offReason: z.string(),
  createdAt: z.string(),
});
export type TakeoutShop = z.infer<typeof takeoutShopSchema>;

export const takeoutShopCreateBodySchema = z.object({
  name: z.string().trim().min(2).max(30),
  shopCode: z
    .string()
    .trim()
    .min(4)
    .max(16)
    .regex(/^[A-Za-z0-9]+$/, "店铺码只能是字母或数字"),
});
export type TakeoutShopCreateBody = z.infer<typeof takeoutShopCreateBodySchema>;

export const takeoutShopUpdateBodySchema = z.object({
  shopId: z.number().int().positive(),
  name: z.string().trim().min(2).max(30),
  logo: z.string().max(500).default(""),
  slogan: z.string().max(60).default(""),
  servicePhone: z.string().max(32).default(""),
  themeColor: z.string().max(16).default("#E64340"),
});
export type TakeoutShopUpdateBody = z.infer<typeof takeoutShopUpdateBodySchema>;

export const takeoutShopTradeBodySchema = z.object({
  shopId: z.number().int().positive(),
  trade: takeoutTradeSchema,
  takeout: takeoutConfigSchema,
});
export type TakeoutShopTradeBody = z.infer<typeof takeoutShopTradeBodySchema>;

export const takeoutShopStatusBodySchema = z.object({
  shopId: z.number().int().positive(),
  status: z.enum(["ONLINE", "OFFLINE"]),
});
export type TakeoutShopStatusBody = z.infer<typeof takeoutShopStatusBodySchema>;

export const takeoutCategorySchema = z.object({
  id: z.number(),
  name: z.string(),
  icon: z.string(),
  sortOrder: z.number(),
  enabled: z.boolean(),
  productCount: z.number().default(0),
});
export type TakeoutCategory = z.infer<typeof takeoutCategorySchema>;

export const takeoutCategorySaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(30),
  icon: z.string().max(500).default(""),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  enabled: z.boolean().default(true),
});
export type TakeoutCategorySaveBody = z.infer<
  typeof takeoutCategorySaveBodySchema
>;

export const takeoutSpecSchema = z.object({
  name: z.string().max(30),
  values: z.array(z.string().max(30)).max(30),
});

export const takeoutProductSkuSchema = z.object({
  id: z.number(),
  skuName: z.string(),
  image: z.string(),
  uniqueId: z.string(),
  specValues: z.record(z.string(), z.string()),
  price: money,
  marketPrice: money,
  stock: z.number(),
  sales: z.number(),
  enabled: z.boolean(),
});
export type TakeoutProductSku = z.infer<typeof takeoutProductSkuSchema>;

export const takeoutProductRowSchema = z.object({
  id: z.number(),
  categoryId: z.number(),
  title: z.string(),
  subtitle: z.string(),
  coverImage: z.string(),
  price: money,
  marketPrice: money,
  stock: z.number(),
  sales: z.number(),
  unit: z.string(),
  specs: z.array(takeoutSpecSchema),
  status: z.enum(TAKEOUT_PRODUCT_STATUSES),
  isHot: z.boolean(),
  isNew: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.string(),
});
export type TakeoutProductRow = z.infer<typeof takeoutProductRowSchema>;

export const takeoutProductDetailSchema = takeoutProductRowSchema.extend({
  images: z.array(z.string()),
  detail: z.string(),
  skus: z.array(takeoutProductSkuSchema),
});
export type TakeoutProductDetail = z.infer<typeof takeoutProductDetailSchema>;

export const takeoutProductSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().positive().optional(),
  categoryId: z.number().int().min(0).default(0),
  title: z.string().trim().min(1).max(120),
  subtitle: z.string().max(200).default(""),
  coverImage: z.string().max(500).default(""),
  images: z.array(z.string().max(500)).max(20).default([]),
  detail: z.string().max(200000).default(""),
  price: money,
  marketPrice: money.default(0),
  stock: z.number().int().min(0).max(9_999_999).default(0),
  unit: z.string().max(20).default("份"),
  specs: z.array(takeoutSpecSchema).max(5).default([]),
  status: z.enum(TAKEOUT_PRODUCT_STATUSES).default("DRAFT"),
  isHot: z.boolean().default(false),
  isNew: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  skus: z
    .array(
      z.object({
        id: z.number().int().min(0).default(0),
        skuName: z.string().max(200).default(""),
        image: z.string().max(500).default(""),
        uniqueId: z.string().max(191).default(""),
        specValues: z.record(z.string(), z.string()).default({}),
        price: money,
        marketPrice: money.default(0),
        stock: z.number().int().min(0).max(9_999_999).default(0),
        enabled: z.boolean().default(true),
      }),
    )
    .max(200)
    .default([]),
});
export type TakeoutProductSaveBody = z.infer<
  typeof takeoutProductSaveBodySchema
>;

export const takeoutCustomerSchema = z.object({
  id: z.number(),
  nickname: z.string(),
  avatar: z.string(),
  phone: z.string(),
  points: z.number(),
  status: z.string(),
  lastLoginAt: z.string(),
  createdAt: z.string(),
});
export type TakeoutCustomer = z.infer<typeof takeoutCustomerSchema>;

export const takeoutAddressSchema = z.object({
  id: z.number(),
  realName: z.string(),
  phone: z.string(),
  province: z.string(),
  city: z.string(),
  district: z.string(),
  detail: z.string(),
  isDefault: z.boolean(),
  tag: z.string(),
});
export type TakeoutAddress = z.infer<typeof takeoutAddressSchema>;

export const takeoutAddressBodySchema = z.object({
  id: z.number().int().positive().optional(),
  realName: z.string().trim().min(1).max(30),
  phone: z.string().trim().min(5).max(20),
  province: z.string().max(40).default(""),
  city: z.string().max(40).default(""),
  district: z.string().max(40).default(""),
  detail: z.string().trim().min(1).max(200),
  isDefault: z.boolean().default(false),
  tag: z.string().max(10).default(""),
});
export type TakeoutAddressBody = z.infer<typeof takeoutAddressBodySchema>;

export const takeoutCartItemSchema = z.object({
  id: z.number(),
  productId: z.number(),
  skuId: z.number(),
  title: z.string(),
  skuName: z.string(),
  image: z.string(),
  price: money,
  quantity: z.number(),
  stock: z.number(),
  selected: z.boolean(),
  valid: z.boolean(),
});
export type TakeoutCartItem = z.infer<typeof takeoutCartItemSchema>;

export const takeoutCouponSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.enum(TAKEOUT_COUPON_TYPES),
  value: money,
  threshold: money,
  totalCount: z.number(),
  receivedCount: z.number(),
  usedCount: z.number(),
  perLimit: z.number(),
  validType: z.enum(["FIXED", "DAYS"]),
  startAt: z.string(),
  endAt: z.string(),
  validDays: z.number(),
  scope: z.enum(["ALL", "CATEGORY", "PRODUCT"]),
  scopeIds: z.array(z.number()),
  status: z.enum(TAKEOUT_COUPON_STATUSES),
  createdAt: z.string(),
});
export type TakeoutCoupon = z.infer<typeof takeoutCouponSchema>;

export const takeoutCouponSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(40),
  type: z.enum(TAKEOUT_COUPON_TYPES),
  value: z.number().min(0.01).max(999999),
  threshold: money.default(0),
  totalCount: z.number().int().min(1).max(9_999_999).default(100),
  perLimit: z.number().int().min(1).max(99).default(1),
  validType: z.enum(["FIXED", "DAYS"]).default("FIXED"),
  startAt: z.string().max(32).default(""),
  endAt: z.string().max(32).default(""),
  validDays: z.number().int().min(1).max(3650).default(7),
  scope: z.enum(["ALL", "CATEGORY", "PRODUCT"]).default("ALL"),
  scopeIds: z.array(z.number().int().positive()).max(500).default([]),
  status: z.enum(TAKEOUT_COUPON_STATUSES).default("ONLINE"),
});
export type TakeoutCouponSaveBody = z.infer<
  typeof takeoutCouponSaveBodySchema
>;

export const takeoutOrderItemSchema = z.object({
  id: z.number(),
  productId: z.number(),
  skuId: z.number(),
  title: z.string(),
  skuName: z.string(),
  image: z.string(),
  price: money,
  quantity: z.number(),
  totalPrice: money,
});
export type TakeoutOrderItem = z.infer<typeof takeoutOrderItemSchema>;

export const takeoutOrderRowSchema = z.object({
  id: z.number(),
  orderNo: z.string(),
  customerId: z.number(),
  nickname: z.string(),
  avatar: z.string(),
  customerPhone: z.string(),
  status: z.enum(TAKEOUT_ORDER_STATUSES),
  payStatus: z.enum(TAKEOUT_PAY_STATUSES),
  orderMode: z.enum(TAKEOUT_ORDER_MODES),
  payType: z.enum(TAKEOUT_PAY_TYPES),
  tableNo: z.string(),
  pickupCode: z.string(),
  expectedAt: z.string(),
  goodsAmount: money,
  deliveryFee: money,
  discountAmount: money,
  payAmount: money,
  pointsDeduct: z.number(),
  couponName: z.string(),
  buyerRemark: z.string(),
  sellerRemark: z.string(),
  itemCount: z.number(),
  itemSummary: z.string(),
  coverImage: z.string(),
  createdAt: z.string(),
  paidAt: z.string(),
  shippedAt: z.string(),
  completedAt: z.string(),
  cancelledAt: z.string(),
  expireAt: z.string(),
});
export type TakeoutOrderRow = z.infer<typeof takeoutOrderRowSchema>;

export const takeoutOrderDetailSchema = takeoutOrderRowSchema.extend({
  items: z.array(takeoutOrderItemSchema),
  logs: z.array(
    z.object({
      id: z.number(),
      operatorType: z.string(),
      operatorId: z.string(),
      action: z.string(),
      content: z.string(),
      createdAt: z.string(),
    }),
  ),
  receiver: z.object({
    name: z.string(),
    phone: z.string(),
    province: z.string(),
    city: z.string(),
    district: z.string(),
    detail: z.string(),
  }),
  transactionId: z.string(),
});
export type TakeoutOrderDetail = z.infer<typeof takeoutOrderDetailSchema>;

export const takeoutOrderListQuerySchema = z.object({
  shopId: z.coerce.number().int().positive(),
  status: z.enum(TAKEOUT_ORDER_STATUSES).optional(),
  orderMode: z.enum(TAKEOUT_ORDER_MODES).optional(),
  keyword: z.string().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const takeoutPreviewBodySchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        skuId: z.number().int().min(0).default(0),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1)
    .max(50),
  fromCart: z.boolean().default(false),
  addressId: z.number().int().min(0).default(0),
  couponTicketId: z.number().int().min(0).default(0),
  usePoints: z.number().int().min(0).default(0),
  orderMode: z.enum(TAKEOUT_ORDER_MODES).default("DELIVERY"),
  tableNo: z.string().trim().max(20).default(""),
  expectedAt: z.string().trim().max(40).default(""),
});
export type TakeoutPreviewBody = z.infer<typeof takeoutPreviewBodySchema>;

export const takeoutOrderCreateBodySchema = z.object({
  items: takeoutPreviewBodySchema.shape.items,
  fromCart: z.boolean().default(false),
  addressId: z.number().int().min(0).default(0),
  couponTicketId: z.number().int().min(0).default(0),
  usePoints: z.number().int().min(0).default(0),
  buyerRemark: z.string().max(200).default(""),
  payType: z.enum(TAKEOUT_PAY_TYPES).default("WECHAT"),
  orderMode: z.enum(TAKEOUT_ORDER_MODES).default("DELIVERY"),
  tableNo: z.string().trim().max(20).default(""),
  expectedAt: z.string().trim().max(40).default(""),
});
export type TakeoutOrderCreateBody = z.infer<
  typeof takeoutOrderCreateBodySchema
>;

export const takeoutOrderAdvanceBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().positive(),
  action: z.enum(["READY"]),
});
export type TakeoutOrderAdvanceBody = z.infer<
  typeof takeoutOrderAdvanceBodySchema
>;

export const takeoutLoginBodySchema = z.object({
  shopCode: z.string().trim().max(16).default(""),
  shopId: z.number().int().positive().optional(),
  code: z.string().trim().min(1).max(128),
  nickname: z.string().max(60).default(""),
  avatar: z.string().max(500).default(""),
});
export type TakeoutLoginBody = z.infer<typeof takeoutLoginBodySchema>;

/** 外卖小程序主体：复用私域底座凭据结构，scene 固定 TAKEOUT。 */
export const takeoutAppSaveBodySchema = miniAppInputSchema.extend({
  shopId: z.number().int().positive(),
});
export type TakeoutAppSaveBody = z.infer<typeof takeoutAppSaveBodySchema>;

export const takeoutAppTestResultSchema = miniAppTestResultSchema.extend({
  nextAction: z.string().default(""),
  nextPath: z.string().default(""),
  serverIp: z.string().default(""),
});

const emptyQuery = z.object({});
const get = <Q extends z.ZodType, R extends z.ZodType>(
  path: string,
  query: Q,
  response: R,
) => ({
  method: "get" as const,
  path,
  params: z.object({}),
  query,
  body: z.undefined(),
  response: envelope(response),
});
const post = <B extends z.ZodType, R extends z.ZodType>(
  path: string,
  body: B,
  response: R,
) => ({
  method: "post" as const,
  path,
  params: z.object({}),
  query: emptyQuery,
  body,
  response: envelope(response),
});
function envelope<T extends z.ZodType>(response: T) {
  return z.object({ code: z.number(), message: z.string(), data: response });
}

const shopQuery = z.object({ shopId: z.coerce.number().int().positive() });
const idQuery = shopQuery.extend({ id: z.coerce.number().int().positive() });
const okResult = z.object({ ok: z.boolean(), message: z.string() });
const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({
    list: z.array(item),
    total: z.number(),
    page: z.number(),
    pageSize: z.number(),
  });

export const takeoutEndpoints = {
  Takeout_shopList: get(
    "/enterprise/takeout/shop/list",
    emptyQuery,
    z.array(takeoutShopSchema),
  ),
  Takeout_shopCreate: post(
    "/enterprise/takeout/shop/create",
    takeoutShopCreateBodySchema,
    takeoutShopSchema,
  ),
  Takeout_shopDetail: get(
    "/enterprise/takeout/shop/detail",
    shopQuery,
    takeoutShopSchema,
  ),
  Takeout_shopUpdate: post(
    "/enterprise/takeout/shop/update",
    takeoutShopUpdateBodySchema,
    takeoutShopSchema,
  ),
  Takeout_shopTrade: post(
    "/enterprise/takeout/shop/trade",
    takeoutShopTradeBodySchema,
    takeoutShopSchema,
  ),
  Takeout_shopStatus: post(
    "/enterprise/takeout/shop/status",
    takeoutShopStatusBodySchema,
    takeoutShopSchema,
  ),

  Takeout_appDetail: get(
    "/enterprise/takeout/app/detail",
    shopQuery,
    miniAppViewSchema,
  ),
  Takeout_appSave: post(
    "/enterprise/takeout/app/save",
    takeoutAppSaveBodySchema,
    miniAppViewSchema,
  ),
  Takeout_appTest: post(
    "/enterprise/takeout/app/test",
    shopQuery,
    takeoutAppTestResultSchema,
  ),

  Takeout_scrmState: get(
    "/enterprise/takeout/scrm/state",
    shopQuery,
    z.object({
      enabled: z.boolean(),
      pending: z.number(),
      sent: z.number(),
      skipped: z.number(),
      failed: z.number(),
    }),
  ),
  Takeout_scrmToggle: post(
    "/enterprise/takeout/scrm/toggle",
    z.object({ shopId: z.number().int().positive(), enabled: z.boolean() }),
    okResult,
  ),

  Takeout_categoryList: get(
    "/enterprise/takeout/category/list",
    shopQuery,
    z.array(takeoutCategorySchema),
  ),
  Takeout_categorySave: post(
    "/enterprise/takeout/category/save",
    takeoutCategorySaveBodySchema,
    takeoutCategorySchema,
  ),
  Takeout_categoryRemove: post(
    "/enterprise/takeout/category/remove",
    idQuery,
    okResult,
  ),

  Takeout_productList: get(
    "/enterprise/takeout/product/list",
    shopQuery.extend({
      keyword: z.string().max(60).optional(),
      categoryId: z.coerce.number().int().min(0).optional(),
      status: z.enum(TAKEOUT_PRODUCT_STATUSES).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    }),
    pageOf(takeoutProductRowSchema),
  ),
  Takeout_productDetail: get(
    "/enterprise/takeout/product/detail",
    idQuery,
    takeoutProductDetailSchema,
  ),
  Takeout_productSave: post(
    "/enterprise/takeout/product/save",
    takeoutProductSaveBodySchema,
    takeoutProductDetailSchema,
  ),
  Takeout_productRemove: post(
    "/enterprise/takeout/product/remove",
    idQuery,
    okResult,
  ),

  Takeout_orderList: get(
    "/enterprise/takeout/order/list",
    takeoutOrderListQuerySchema,
    pageOf(takeoutOrderRowSchema),
  ),
  Takeout_orderDetail: get(
    "/enterprise/takeout/order/detail",
    idQuery,
    takeoutOrderDetailSchema,
  ),
  Takeout_orderRemark: post(
    "/enterprise/takeout/order/remark",
    idQuery.extend({ sellerRemark: z.string().max(500).default("") }),
    takeoutOrderDetailSchema,
  ),
  Takeout_orderAdvance: post(
    "/enterprise/takeout/order/advance",
    takeoutOrderAdvanceBodySchema,
    takeoutOrderDetailSchema,
  ),
  Takeout_orderFinish: post(
    "/enterprise/takeout/order/finish",
    idQuery,
    takeoutOrderDetailSchema,
  ),
  Takeout_orderMarkPaid: post(
    "/enterprise/takeout/order/mark-paid",
    idQuery,
    takeoutOrderDetailSchema,
  ),

  Takeout_couponList: get(
    "/enterprise/takeout/coupon/list",
    shopQuery.extend({
      keyword: z.string().max(40).optional(),
      status: z.enum(TAKEOUT_COUPON_STATUSES).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    }),
    pageOf(takeoutCouponSchema),
  ),
  Takeout_couponSave: post(
    "/enterprise/takeout/coupon/save",
    takeoutCouponSaveBodySchema,
    takeoutCouponSchema,
  ),
  Takeout_couponStatus: post(
    "/enterprise/takeout/coupon/status",
    idQuery.extend({ status: z.enum(TAKEOUT_COUPON_STATUSES) }),
    takeoutCouponSchema,
  ),
} as const;

export type TakeoutEndpoints = typeof takeoutEndpoints;