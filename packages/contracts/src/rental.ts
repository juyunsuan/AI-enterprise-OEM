import { z } from "zod";
import { pageQuerySchema, pageSchema } from "./pagination";
import {
  miniAppInputSchema,
  miniAppTestResultSchema,
  miniAppViewSchema,
} from "./private-mini";

const envelope = <T extends z.ZodType>(data: T) =>
  z.object({ code: z.number(), message: z.string(), data: data.nullable() });
const emptyQuery = z.object({});

/**
 * 租赁管理小程序：通用租赁（车辆/设备/场地）租品、租单、交接与还回验车、客户与统计。
 *
 * 顾客端与员工端走 `/api/public/rental/*` 免登录通道（独立顾客令牌 / 员工令牌，
 * 与站内 User 物理隔离），不进 JSON 契约与 OpenAPI。
 * 后台管理走 `Rental_` 前缀，身份、权限、门店归属全部复用站内账号体系。
 * 在线客服绑定 service-desk 的 siteKey、私域 SCRM 绑定 wecom-scrm 活码，
 * 本域只存引用，不建会话表与 AI 实体。
 */

export const RENTAL_SCENE = "RENTAL" as const;

export const RENTAL_SHOP_STATUSES = ["DRAFT", "ONLINE", "SUSPENDED", "CLOSED"] as const;
export type RentalShopStatus = (typeof RENTAL_SHOP_STATUSES)[number];
export const RENTAL_SHOP_STATUS_LABELS: Record<string, string> = {
  DRAFT: "未上线",
  ONLINE: "营业中",
  SUSPENDED: "平台停服",
  CLOSED: "已关闭",
};

export const RENTAL_ITEM_STATUSES = ["ONLINE", "OFFLINE"] as const;
export type RentalItemStatus = (typeof RENTAL_ITEM_STATUSES)[number];
export const RENTAL_ITEM_STATUS_LABELS: Record<string, string> = {
  ONLINE: "在租",
  OFFLINE: "下架",
};

export const RENTAL_ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "PAID",
  "PICKED_UP",
  "RETURNED",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
] as const;
export type RentalOrderStatus = (typeof RENTAL_ORDER_STATUSES)[number];
export const RENTAL_ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "待付款",
  PAID: "待取车",
  PICKED_UP: "租用中",
  RETURNED: "待结算",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  EXPIRED: "超时关闭",
};

export const RENTAL_PAY_STATUSES = [
  "UNPAID",
  "PAID",
  "REFUNDING",
  "REFUNDED",
] as const;
export type RentalPayStatus = (typeof RENTAL_PAY_STATUSES)[number];
export const RENTAL_PAY_STATUS_LABELS: Record<string, string> = {
  UNPAID: "未支付",
  PAID: "已支付",
  REFUNDING: "退款中",
  REFUNDED: "已退款",
};

export const RENTAL_INSPECTION_KINDS = ["HANDOVER", "RETURN"] as const;
export type RentalInspectionKind = (typeof RENTAL_INSPECTION_KINDS)[number];
export const RENTAL_INSPECTION_KIND_LABELS: Record<string, string> = {
  HANDOVER: "取车验车",
  RETURN: "还回验车",
};

export const RENTAL_ORDER_ACTIONS = [
  "pickup",
  "return",
  "complete",
  "refundDeposit",
  "cancel",
  "expire",
] as const;
export type RentalOrderAction = (typeof RENTAL_ORDER_ACTIONS)[number];
export const RENTAL_ORDER_ACTION_LABELS: Record<string, string> = {
  pickup: "确认取车",
  return: "确认还回",
  complete: "结算完成",
  refundDeposit: "退还押金",
  cancel: "取消订单",
  expire: "超时关闭",
};

export const RENTAL_STAFF_ROLES = ["OWNER", "CLERK", "INSPECTOR"] as const;
export type RentalStaffRole = (typeof RENTAL_STAFF_ROLES)[number];
export const RENTAL_STAFF_ROLE_LABELS: Record<string, string> = {
  OWNER: "店长",
  CLERK: "店员",
  INSPECTOR: "验车员",
};

export const RENTAL_STAFF_STATUSES = ["ACTIVE", "SUSPENDED"] as const;
export type RentalStaffStatus = (typeof RENTAL_STAFF_STATUSES)[number];
export const RENTAL_STAFF_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "在岗",
  SUSPENDED: "停用",
};

// ---------------------------------------------------------------- 门店

export const rentalShopInputSchema = z.object({
  id: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(120),
  logo: z.string().trim().max(500).default(""),
  servicePhone: z.string().trim().max(32).default(""),
  address: z.string().trim().max(200).default(""),
  themeColor: z.string().trim().max(20).default("#3370ff"),
  navigationTitle: z.string().trim().max(40).default("租赁管理"),
});
export type RentalShopInput = z.infer<typeof rentalShopInputSchema>;

/** 交易参数：押金退还、自动关单、最多可租天数；客服/SCRM 只存外部对象的引用。 */
export const rentalTradeSchema = z.object({
  autoCancelMinutes: z.number().int().min(1).max(240).default(30),
  maxRentDays: z.number().int().min(1).max(365).default(30),
  depositRefundHours: z.number().int().min(0).max(720).default(24),
  depositRefundAuto: z.boolean().default(false),
  deskSiteKey: z.string().trim().max(48).default(""),
  scrmCodeId: z.number().int().min(0).default(0),
  /** 门店公告：小程序首页展示的一句话通知。 */
  notice: z.string().trim().max(500).default(""),
});
export type RentalTrade = z.infer<typeof rentalTradeSchema>;

export const rentalShopRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  shopCode: z.string(),
  logo: z.string(),
  servicePhone: z.string(),
  address: z.string(),
  status: z.string(),
  statusLabel: z.string(),
  themeColor: z.string(),
  navigationTitle: z.string(),
  trade: rentalTradeSchema,
  wechatConfigured: z.boolean(),
  payEnabled: z.boolean(),
  itemCount: z.number(),
  orderCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RentalShopRow = z.infer<typeof rentalShopRowSchema>;

export const rentalStatusInputSchema = z.object({
  status: z.enum(RENTAL_SHOP_STATUSES),
});

// ---------------------------------------------------------------- 租品

export const rentalItemInputSchema = z.object({
  id: z.number().int().min(0).default(0),
  category: z.string().trim().max(60).default(""),
  name: z.string().trim().min(1).max(120),
  cover: z.string().trim().max(500).default(""),
  images: z.array(z.string().trim().max(500)).max(9).default([]),
  description: z.string().trim().max(4000).default(""),
  /** 通用属性：车牌/座位/变速箱、设备型号/功率、场地面积等，由租品自己定义键值。 */
  attributes: z.record(z.string(), z.string()).default({}),
  dailyRate: z.number().min(0).max(10000000).default(0),
  deposit: z.number().min(0).max(10000000).default(0),
  stock: z.number().int().min(0).max(9999).default(1),
  status: z.enum(RENTAL_ITEM_STATUSES).default("ONLINE"),
  sortOrder: z.number().int().min(0).max(99999).default(0),
});
export type RentalItemInput = z.infer<typeof rentalItemInputSchema>;

export const rentalItemRowSchema = z.object({
  id: z.number(),
  shopId: z.number(),
  category: z.string(),
  name: z.string(),
  cover: z.string(),
  images: z.array(z.string()),
  description: z.string(),
  attributes: z.record(z.string(), z.string()),
  dailyRate: z.number(),
  deposit: z.number(),
  stock: z.number(),
  status: z.string(),
  statusLabel: z.string(),
  sortOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RentalItemRow = z.infer<typeof rentalItemRowSchema>;

export const rentalItemRemoveSchema = z.object({
  id: z.number().int().positive(),
});

// ---------------------------------------------------------------- 租单

export const rentalOrderCreateSchema = z.object({
  customerId: z.number().int().min(0).default(0),
  customerName: z.string().trim().max(60).default(""),
  customerPhone: z.string().trim().max(32).default(""),
  itemId: z.number().int().positive(),
  startAt: z.string().trim().min(1).max(40),
  endAt: z.string().trim().min(1).max(40),
  discount: z.number().min(0).max(10000000).default(0),
  remark: z.string().trim().max(500).default(""),
  /** 线下开单时记录经办员工（可选），用于业绩统计。 */
  salesStaffId: z.number().int().min(0).default(0),
});
export type RentalOrderCreateInput = z.infer<typeof rentalOrderCreateSchema>;

/** 租单修改：待付款可改租期与优惠并重算；已支付只允许改备注。 */
export const rentalOrderUpdateSchema = z.object({
  startAt: z.string().trim().max(40).default(""),
  endAt: z.string().trim().max(40).default(""),
  discount: z.number().min(0).max(10000000).default(0),
  remark: z.string().trim().max(500).default(""),
});
export type RentalOrderUpdateInput = z.infer<typeof rentalOrderUpdateSchema>;

export const rentalOrderActionSchema = z.object({
  action: z.enum(RENTAL_ORDER_ACTIONS),
  note: z.string().trim().max(500).default(""),
});
export type RentalOrderActionInput = z.infer<typeof rentalOrderActionSchema>;

export const rentalInspectionRowSchema = z.object({
  id: z.number(),
  orderId: z.number(),
  kind: z.string(),
  kindLabel: z.string(),
  mileage: z.number(),
  fuelPercent: z.number(),
  damage: z.string(),
  damageFee: z.number(),
  images: z.array(z.string()),
  note: z.string(),
  operatorName: z.string(),
  createdAt: z.string(),
});
export type RentalInspectionRow = z.infer<typeof rentalInspectionRowSchema>;

export const rentalInspectionInputSchema = z.object({
  kind: z.enum(RENTAL_INSPECTION_KINDS),
  mileage: z.number().int().min(0).max(10000000).default(0),
  fuelPercent: z.number().int().min(0).max(100).default(100),
  damage: z.string().trim().max(2000).default(""),
  damageFee: z.number().min(0).max(10000000).default(0),
  images: z.array(z.string().trim().max(500)).max(9).default([]),
  note: z.string().trim().max(1000).default(""),
});
export type RentalInspectionInput = z.infer<typeof rentalInspectionInputSchema>;

export const rentalOrderRowSchema = z.object({
  id: z.number(),
  orderNo: z.string(),
  shopId: z.number(),
  customerId: z.number(),
  customerName: z.string(),
  customerPhone: z.string(),
  itemId: z.number(),
  itemName: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  days: z.number(),
  dailyRate: z.number(),
  rentAmount: z.number(),
  depositAmount: z.number(),
  discount: z.number(),
  payAmount: z.number(),
  damageFee: z.number(),
  refundAmount: z.number(),
  salesStaffId: z.number(),
  salesStaffName: z.string(),
  pickupStaffName: z.string(),
  returnStaffName: z.string(),
  status: z.string(),
  statusLabel: z.string(),
  payStatus: z.string(),
  payStatusLabel: z.string(),
  paidAt: z.string(),
  pickupAt: z.string(),
  returnAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RentalOrderRow = z.infer<typeof rentalOrderRowSchema>;

export const rentalOrderDetailSchema = rentalOrderRowSchema.extend({
  itemSnapshot: z.record(z.string(), z.unknown()),
  remark: z.string(),
  staffNote: z.string(),
  customer: z.object({
    id: z.number(),
    nickname: z.string(),
    phone: z.string(),
    status: z.string(),
  }),
  inspections: z.array(rentalInspectionRowSchema),
});
export type RentalOrderDetail = z.infer<typeof rentalOrderDetailSchema>;

// ---------------------------------------------------------------- 客户与员工

export const rentalCustomerRowSchema = z.object({
  id: z.number(),
  openid: z.string(),
  nickname: z.string(),
  avatar: z.string(),
  phone: z.string(),
  /** MINIPROGRAM 小程序顾客 | ADMIN 后台手工建档 */
  source: z.string(),
  gender: z.number(),
  city: z.string(),
  remark: z.string(),
  status: z.string(),
  orderCount: z.number(),
  totalSpend: z.number(),
  lastOrderAt: z.string(),
  lastLoginAt: z.string(),
  createdAt: z.string(),
});
export type RentalCustomerRow = z.infer<typeof rentalCustomerRowSchema>;

/** 后台手工建档 / 编辑顾客：手机号是唯一的业务识别键。 */
export const rentalCustomerInputSchema = z.object({
  id: z.number().int().min(0).default(0),
  nickname: z.string().trim().min(1).max(60),
  phone: z.string().trim().min(3).max(32),
  gender: z.number().int().min(0).max(2).default(0),
  city: z.string().trim().max(60).default(""),
  remark: z.string().trim().max(500).default(""),
  status: z.enum(["ACTIVE", "BLOCKED"]).default("ACTIVE"),
});
export type RentalCustomerInput = z.infer<typeof rentalCustomerInputSchema>;

export const rentalCustomerStatusSchema = z.object({
  status: z.enum(["ACTIVE", "BLOCKED"]),
});

export const rentalStaffInputSchema = z.object({
  id: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(60),
  phone: z.string().trim().min(3).max(32),
  staffCode: z.string().trim().min(1).max(32),
  role: z.enum(RENTAL_STAFF_ROLES).default("CLERK"),
  status: z.enum(RENTAL_STAFF_STATUSES).default("ACTIVE"),
});
export type RentalStaffInput = z.infer<typeof rentalStaffInputSchema>;

export const rentalStaffRowSchema = z.object({
  id: z.number(),
  shopId: z.number(),
  name: z.string(),
  phone: z.string(),
  staffCode: z.string(),
  role: z.string(),
  roleLabel: z.string(),
  status: z.string(),
  statusLabel: z.string(),
  createdAt: z.string(),
});
export type RentalStaffRow = z.infer<typeof rentalStaffRowSchema>;

// ---------------------------------------------------------------- 看板与统计

export const rentalOverviewSchema = z.object({
  shops: z.number(),
  itemsOnline: z.number(),
  activeRentals: z.number(),
  pendingPickup: z.number(),
  pendingReturn: z.number(),
  todayOrders: z.number(),
  todayRevenue: z.number(),
  depositHeld: z.number(),
  totalCustomers: z.number(),
});
export type RentalOverview = z.infer<typeof rentalOverviewSchema>;

export const rentalStatsSchema = z.object({
  trend: z.array(
    z.object({
      date: z.string(),
      orders: z.number(),
      revenue: z.number(),
    }),
  ),
  statusCounts: z.record(z.string(), z.number()),
  topItems: z.array(
    z.object({
      itemId: z.number(),
      itemName: z.string(),
      orders: z.number(),
      revenue: z.number(),
    }),
  ),
  categoryRevenue: z.array(
    z.object({
      category: z.string(),
      revenue: z.number(),
    }),
  ),
  staffPerformance: z.array(
    z.object({
      staffName: z.string(),
      orders: z.number(),
      revenue: z.number(),
    }),
  ),
  customerGender: z.array(
    z.object({
      key: z.string(),
      count: z.number(),
    }),
  ),
  customerCities: z.array(
    z.object({
      city: z.string(),
      count: z.number(),
    }),
  ),
});
export type RentalStats = z.infer<typeof rentalStatsSchema>;

export const rentalPackageResultSchema = z.object({
  url: z.string(),
  fileName: z.string(),
  fileSize: z.number(),
  sha256: z.string(),
});
export type RentalPackageResult = z.infer<typeof rentalPackageResultSchema>;

// ---------------------------------------------------------------- 端点

const shopQuery = pageQuerySchema.extend({
  keyword: z.string().default(""),
  status: z.string().default("all"),
});
const orderQuery = pageQuerySchema.extend({
  keyword: z.string().default(""),
  status: z.string().default("all"),
  payStatus: z.string().default("all"),
  itemId: z.coerce.number().int().min(0).default(0),
});
const customerQuery = pageQuerySchema.extend({
  keyword: z.string().default(""),
  status: z.string().default("all"),
});
const staffQuery = pageQuerySchema.extend({
  keyword: z.string().default(""),
  status: z.string().default("all"),
});
const inspectionQuery = pageQuerySchema.extend({
  kind: z.string().default("all"),
  orderNo: z.string().default(""),
});

export const rentalEndpoints = {
  Rental_overview: {
    method: "get" as const,
    path: "/enterprise/rental/overview",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(rentalOverviewSchema),
  },
  Rental_shops: {
    method: "get" as const,
    path: "/enterprise/rental/shops",
    params: z.object({}),
    query: shopQuery,
    body: z.undefined(),
    response: envelope(pageSchema(rentalShopRowSchema)),
  },
  Rental_createShop: {
    method: "post" as const,
    path: "/enterprise/rental/shops",
    params: z.object({}),
    query: emptyQuery,
    body: rentalShopInputSchema,
    response: envelope(rentalShopRowSchema),
  },
  Rental_shopDetail: {
    method: "get" as const,
    path: "/enterprise/rental/shops/:id",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(rentalShopRowSchema),
  },
  Rental_updateShop: {
    method: "put" as const,
    path: "/enterprise/rental/shops/:id",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: rentalShopInputSchema,
    response: envelope(rentalShopRowSchema),
  },
  Rental_saveTrade: {
    method: "put" as const,
    path: "/enterprise/rental/shops/:id/trade",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: rentalTradeSchema,
    response: envelope(rentalShopRowSchema),
  },
  Rental_setStatus: {
    method: "post" as const,
    path: "/enterprise/rental/shops/:id/status",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: rentalStatusInputSchema,
    response: envelope(rentalShopRowSchema),
  },
  Rental_wechat: {
    method: "get" as const,
    path: "/enterprise/rental/shops/:id/wechat",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(miniAppViewSchema),
  },
  Rental_saveWechat: {
    method: "put" as const,
    path: "/enterprise/rental/shops/:id/wechat",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: miniAppInputSchema,
    response: envelope(miniAppViewSchema),
  },
  Rental_testWechat: {
    method: "post" as const,
    path: "/enterprise/rental/shops/:id/wechat/test",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.object({}),
    response: envelope(miniAppTestResultSchema),
  },
  Rental_package: {
    method: "get" as const,
    path: "/enterprise/rental/shops/:id/package",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(rentalPackageResultSchema),
  },
  Rental_items: {
    method: "get" as const,
    path: "/enterprise/rental/shops/:id/items",
    params: z.object({ id: z.string() }),
    query: pageQuerySchema.extend({
      keyword: z.string().default(""),
      status: z.string().default("all"),
      category: z.string().default(""),
    }),
    body: z.undefined(),
    response: envelope(pageSchema(rentalItemRowSchema)),
  },
  Rental_saveItem: {
    method: "put" as const,
    path: "/enterprise/rental/shops/:id/items",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: rentalItemInputSchema,
    response: envelope(rentalItemRowSchema),
  },
  Rental_removeItem: {
    method: "post" as const,
    path: "/enterprise/rental/shops/:id/items/remove",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: rentalItemRemoveSchema,
    response: envelope(z.object({ removed: z.boolean() })),
  },
  Rental_orders: {
    method: "get" as const,
    path: "/enterprise/rental/shops/:id/orders",
    params: z.object({ id: z.string() }),
    query: orderQuery,
    body: z.undefined(),
    response: envelope(pageSchema(rentalOrderRowSchema)),
  },
  Rental_createOrder: {
    method: "post" as const,
    path: "/enterprise/rental/shops/:id/orders",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: rentalOrderCreateSchema,
    response: envelope(rentalOrderRowSchema),
  },
  Rental_updateOrder: {
    method: "put" as const,
    path: "/enterprise/rental/shops/:id/orders/:orderId",
    params: z.object({ id: z.string(), orderId: z.string() }),
    query: emptyQuery,
    body: rentalOrderUpdateSchema,
    response: envelope(rentalOrderRowSchema),
  },
  Rental_orderDetail: {
    method: "get" as const,
    path: "/enterprise/rental/shops/:id/orders/:orderId",
    params: z.object({ id: z.string(), orderId: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(rentalOrderDetailSchema),
  },
  Rental_orderAction: {
    method: "post" as const,
    path: "/enterprise/rental/shops/:id/orders/:orderId/action",
    params: z.object({ id: z.string(), orderId: z.string() }),
    query: emptyQuery,
    body: rentalOrderActionSchema,
    response: envelope(rentalOrderDetailSchema),
  },
  Rental_saveInspection: {
    method: "put" as const,
    path: "/enterprise/rental/shops/:id/orders/:orderId/inspection",
    params: z.object({ id: z.string(), orderId: z.string() }),
    query: emptyQuery,
    body: rentalInspectionInputSchema,
    response: envelope(rentalInspectionRowSchema),
  },
  Rental_inspections: {
    method: "get" as const,
    path: "/enterprise/rental/shops/:id/inspections",
    params: z.object({ id: z.string() }),
    query: inspectionQuery,
    body: z.undefined(),
    response: envelope(pageSchema(rentalInspectionRowSchema)),
  },
  Rental_customers: {
    method: "get" as const,
    path: "/enterprise/rental/shops/:id/customers",
    params: z.object({ id: z.string() }),
    query: customerQuery,
    body: z.undefined(),
    response: envelope(pageSchema(rentalCustomerRowSchema)),
  },
  Rental_saveCustomer: {
    method: "put" as const,
    path: "/enterprise/rental/shops/:id/customers",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: rentalCustomerInputSchema,
    response: envelope(rentalCustomerRowSchema),
  },
  Rental_removeCustomer: {
    method: "post" as const,
    path: "/enterprise/rental/shops/:id/customers/remove",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: rentalItemRemoveSchema,
    response: envelope(z.object({ removed: z.boolean(), blocked: z.boolean() })),
  },
  Rental_customerStatus: {
    method: "post" as const,
    path: "/enterprise/rental/shops/:id/customers/:customerId/status",
    params: z.object({ id: z.string(), customerId: z.string() }),
    query: emptyQuery,
    body: rentalCustomerStatusSchema,
    response: envelope(rentalCustomerRowSchema),
  },
  Rental_staffs: {
    method: "get" as const,
    path: "/enterprise/rental/shops/:id/staffs",
    params: z.object({ id: z.string() }),
    query: staffQuery,
    body: z.undefined(),
    response: envelope(pageSchema(rentalStaffRowSchema)),
  },
  Rental_saveStaff: {
    method: "put" as const,
    path: "/enterprise/rental/shops/:id/staffs",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: rentalStaffInputSchema,
    response: envelope(rentalStaffRowSchema),
  },
  Rental_removeStaff: {
    method: "post" as const,
    path: "/enterprise/rental/shops/:id/staffs/remove",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: rentalItemRemoveSchema,
    response: envelope(z.object({ removed: z.boolean() })),
  },
  Rental_stats: {
    method: "get" as const,
    path: "/enterprise/rental/shops/:id/stats",
    params: z.object({ id: z.string() }),
    query: z.object({ days: z.coerce.number().int().min(7).max(90).default(30) }),
    body: z.undefined(),
    response: envelope(rentalStatsSchema),
  },
} as const;

export const RENTAL_ENDPOINT_IDS = Object.keys(rentalEndpoints);