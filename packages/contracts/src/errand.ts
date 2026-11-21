import { z } from "zod";
import { pageSchema } from "./pagination";
import {
  miniAppInputSchema,
  miniAppTestResultSchema,
  miniAppViewSchema,
} from "./private-mini";

const envelope = <T extends z.ZodType>(data: T) =>
  z.object({ code: z.number(), message: z.string(), data: data.nullable() });
const emptyQuery = z.object({});
const okResult = z.object({ ok: z.boolean(), message: z.string() });
const money = z.number().min(0).max(9_999_999_999);
const text = (max: number) => z.string().trim().max(max);

/**
 * 工作台 · 建站管理 · 跑腿小程序工具（参考开源叮点跑腿的业务口径，按本站架构重写）。
 *
 * 三条硬口径：
 * 1. 一个账号＝一部小程序＝一个跑腿站点，账号负责人就是小程序管理员；
 *    顾客与骑手都是小程序内的微信身份，不进本站账号体系。
 * 2. 金额只由后端计价引擎算（起步价 + 距离 + 重量 + 时段 + 帮买服务费 + 小费 - 优惠券），
 *    端上传的金额一律不采信；收款直接进店主自己的微信商户号，平台不经手资金。
 * 3. 客服复用平台 AI 客服（service-desk）只存绑定 siteKey；AI 调度建议走平台模型网关，
 *    图片/二维码等字节统一登记进平台数字资产。
 *
 * 顾客端与骑手端都走 `/api/public/errand/**` 免登录公开通道，路由在
 * `backend/src/errand/errand.public.ts` 手写注册；本文件只声明结构，并登记店主侧契约端点。
 */

// ---------------------------------------------------------------- 枚举与文案

export const ERRAND_SITE_STATUSES = ["DRAFT", "ONLINE", "CLOSED"] as const;
export type ErrandSiteStatus = (typeof ERRAND_SITE_STATUSES)[number];
export const ERRAND_SITE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "未上线",
  ONLINE: "营业中",
  CLOSED: "已关闭",
};

export const ERRAND_CITY_STATUSES = ["ENABLED", "DISABLED"] as const;
export type ErrandCityStatus = (typeof ERRAND_CITY_STATUSES)[number];
export const ERRAND_CITY_STATUS_LABELS: Record<string, string> = {
  ENABLED: "开通",
  DISABLED: "停用",
};

export const ERRAND_SERVICE_TYPES = ["SEND", "BUY"] as const;
export type ErrandServiceType = (typeof ERRAND_SERVICE_TYPES)[number];
export const ERRAND_SERVICE_TYPE_LABELS: Record<string, string> = {
  SEND: "帮我送",
  BUY: "帮我买",
};

export const ERRAND_ORDER_STATES = [
  "PENDING_PAY",
  "PENDING_ACCEPT",
  "ACCEPTED",
  "PICKED_UP",
  "DELIVERING",
  "ARRIVED",
  "COMPLETED",
  "CANCELLED",
  "EXCEPTION",
] as const;
export type ErrandOrderState = (typeof ERRAND_ORDER_STATES)[number];
export const ERRAND_ORDER_STATE_LABELS: Record<string, string> = {
  PENDING_PAY: "待支付",
  PENDING_ACCEPT: "待接单",
  ACCEPTED: "已接单",
  PICKED_UP: "已取件",
  DELIVERING: "配送中",
  ARRIVED: "已送达",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  EXCEPTION: "异常",
};

export const ERRAND_PAY_STATES = ["PENDING", "PAID", "REFUNDED", "CLOSED"] as const;
export type ErrandPayState = (typeof ERRAND_PAY_STATES)[number];
export const ERRAND_PAY_STATE_LABELS: Record<string, string> = {
  PENDING: "待支付",
  PAID: "已支付",
  REFUNDED: "已退款",
  CLOSED: "已关闭",
};

export const ERRAND_PAY_MODES = ["ONLINE", "OFFLINE"] as const;
export type ErrandPayMode = (typeof ERRAND_PAY_MODES)[number];
export const ERRAND_PAY_MODE_LABELS: Record<string, string> = {
  ONLINE: "微信在线支付",
  OFFLINE: "线下结算",
};

export const ERRAND_RIDER_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "SUSPENDED",
] as const;
export type ErrandRiderStatus = (typeof ERRAND_RIDER_STATUSES)[number];
export const ERRAND_RIDER_STATUS_LABELS: Record<string, string> = {
  PENDING: "待审核",
  APPROVED: "已通过",
  REJECTED: "已拒绝",
  SUSPENDED: "已停用",
};

export const ERRAND_VEHICLE_TYPES = ["EBIKE", "MOTO", "CAR", "WALK"] as const;
export type ErrandVehicleType = (typeof ERRAND_VEHICLE_TYPES)[number];
export const ERRAND_VEHICLE_TYPE_LABELS: Record<string, string> = {
  EBIKE: "电动车",
  MOTO: "摩托车",
  CAR: "汽车",
  WALK: "步行",
};

export const ERRAND_RIDER_APPLY_STATUSES = ["NONE", "PENDING", "APPROVED", "REJECTED", "SUSPENDED"] as const;

/** 店主推进履约的动作；金额与状态转换都由服务端裁决。 */
export const ERRAND_ORDER_ACTIONS = [
  "MARK_PAID",
  "ASSIGN",
  "ACCEPT",
  "PICKUP",
  "DELIVER",
  "ARRIVE",
  "COMPLETE",
  "EXCEPTION",
  "CANCEL",
  "REFUND",
  "SETTLE_BUY",
] as const;
export type ErrandOrderAction = (typeof ERRAND_ORDER_ACTIONS)[number];
export const ERRAND_ORDER_ACTION_LABELS: Record<string, string> = {
  MARK_PAID: "登记已收款",
  ASSIGN: "指派骑手",
  ACCEPT: "骑手接单",
  PICKUP: "已取件",
  DELIVER: "开始配送",
  ARRIVE: "已送达",
  COMPLETE: "完成订单",
  EXCEPTION: "标记异常",
  CANCEL: "取消订单",
  REFUND: "登记退款",
  SETTLE_BUY: "登记帮买实付",
};

export const ERRAND_COUPON_TYPES = ["FIXED", "PERCENT"] as const;
export type ErrandCouponType = (typeof ERRAND_COUPON_TYPES)[number];
export const ERRAND_COUPON_TYPE_LABELS: Record<string, string> = {
  FIXED: "满减券",
  PERCENT: "折扣券",
};

export const ERRAND_WITHDRAWAL_STATUSES = ["PENDING", "PAID", "REJECTED"] as const;
export type ErrandWithdrawalStatus = (typeof ERRAND_WITHDRAWAL_STATUSES)[number];
export const ERRAND_WITHDRAWAL_STATUS_LABELS: Record<string, string> = {
  PENDING: "待打款",
  PAID: "已打款",
  REJECTED: "已驳回",
};

/** 小程序端可见的栏目开关：平台与店主只改这些布尔值，不改端上代码。 */
export const ERRAND_TOGGLES = [
  "indexNotice",
  "deskChat",
  "contact",
  "addressBook",
  "myOrders",
  "protocol",
  "coupon",
  "tip",
  "buyService",
  "riderApply",
] as const;
export type ErrandToggle = (typeof ERRAND_TOGGLES)[number];
/** 兼容既有工具的命名：开关键清单与值枚举同源。 */
export const ERRAND_TOGGLE_KEYS = ERRAND_TOGGLES;
export const ERRAND_DEFAULT_TOGGLES: Record<ErrandToggle, boolean> = {
  indexNotice: true,
  deskChat: true,
  contact: true,
  addressBook: true,
  myOrders: true,
  protocol: true,
  coupon: true,
  tip: true,
  buyService: true,
  riderApply: true,
};
export const ERRAND_TOGGLE_LABELS: Record<string, string> = {
  indexNotice: "首页公告",
  deskChat: "在线客服",
  contact: "联系电话",
  addressBook: "地址簿",
  myOrders: "我的订单",
  protocol: "下单协议",
  coupon: "优惠券",
  tip: "小费",
  buyService: "帮我买",
  riderApply: "骑手报名",
};

// ---------------------------------------------------------------- 契约形状

export const errandPartySchema = z.object({
  name: text(40).default(""),
  mobile: text(20).default(""),
  province: text(40).default(""),
  city: text(40).default(""),
  district: text(40).default(""),
  address: text(200).default(""),
  lng: z.number().min(-180).max(180).default(0),
  lat: z.number().min(-90).max(90).default(0),
});
export type ErrandParty = z.infer<typeof errandPartySchema>;

export const errandContactSchema = z.object({
  phone: text(32).default(""),
  wechat: text(64).default(""),
  email: text(120).default(""),
});
export type ErrandContact = z.infer<typeof errandContactSchema>;

export const errandRuleSchema = z.object({
  baseFee: money,
  baseDistanceKm: z.number().min(0).max(200),
  perKmFee: money,
  baseWeightKg: z.number().min(0).max(1000),
  perKgFee: money,
  /** 夜间时段 "22:00-06:00"，留空表示不设夜间加价。 */
  nightStart: text(5),
  nightEnd: text(5),
  nightFee: money,
  /** 帮买服务费比例：0.1 = 商品金额的 10%。 */
  buyServiceRate: z.number().min(0).max(1),
  minOrderAmount: money,
  maxDistanceKm: z.number().min(0.1).max(500),
  maxWeightKg: z.number().min(0.1).max(1000),
  tipPresets: z.array(money).max(10),
  couponEnabled: z.boolean(),
  /** 抢单/自动派单半径（公里）；0 = 不限。 */
  acceptRadiusKm: z.number().min(0).max(100),
  /** 支付成功后自动派给最近的在线骑手。 */
  autoDispatch: z.boolean(),
  /** 骑手劳务分成比例：0.8 = 超距/超重/夜间服务费的 80% 归骑手，小费全额归骑手。 */
  riderShareRate: z.number().min(0).max(1),
  /** 每名骑手同时在途单上限。 */
  maxActiveOrders: z.number().int().min(1).max(20),
  /** 每消费 1 元返多少积分。 */
  pointsEarnRate: z.number().min(0).max(100),
  /** 多少积分抵 1 元。 */
  pointsDeductRate: z.number().min(1).max(10000),
  /** 单笔最多用服务费的多大比例抵扣。 */
  maxPointsDiscountRate: z.number().min(0).max(1),
  updatedAt: text(40),
});
export type ErrandRule = z.infer<typeof errandRuleSchema>;

export const errandCitySchema = z.object({
  id: z.number(),
  name: text(60),
  province: text(40),
  city: text(40),
  district: text(40),
  addressLine: text(200),
  lng: z.number(),
  lat: z.number(),
  status: z.enum(ERRAND_CITY_STATUSES),
  sort: z.number(),
  rule: errandRuleSchema,
  riderCount: z.number(),
  orderCount: z.number(),
  createdAt: text(40),
  updatedAt: text(40),
});
export type ErrandCity = z.infer<typeof errandCitySchema>;

export const errandSiteSchema = z.object({
  id: z.number(),
  siteCode: text(16),
  name: text(120),
  logo: text(500),
  banner: text(500),
  slogan: text(200),
  themeColor: text(16),
  notice: text(500),
  province: text(40),
  city: text(40),
  district: text(40),
  addressLine: text(200),
  lng: z.number(),
  lat: z.number(),
  businessHours: text(80),
  phone: text(32),
  contact: errandContactSchema,
  /** 绑定的 AI 客服服务站 siteKey（只存引用，不建会话表）。 */
  deskSiteKey: text(64),
  deskSiteName: text(80),
  toggles: z.record(z.string(), z.boolean()),
  protocolText: text(4000),
  status: z.enum(ERRAND_SITE_STATUSES),
  siteUrl: text(200),
  rule: errandRuleSchema,
  defaultCityId: z.number(),
  cities: z.array(errandCitySchema),
  orderTotal: z.number(),
  riderTotal: z.number(),
  customerTotal: z.number(),
  createdAt: text(40),
  updatedAt: text(40),
});
export type ErrandSite = z.infer<typeof errandSiteSchema>;

export const errandSiteSaveBodySchema = z.object({
  name: text(120).min(1),
  logo: text(500).default(""),
  banner: text(500).default(""),
  slogan: text(200).default(""),
  themeColor: text(16).default("#3370FF"),
  notice: text(500).default(""),
  province: text(40).default(""),
  city: text(40).default(""),
  district: text(40).default(""),
  addressLine: text(200).default(""),
  lng: z.number().min(-180).max(180).default(0),
  lat: z.number().min(-90).max(90).default(0),
  businessHours: text(80).default(""),
  phone: text(32).default(""),
  contact: errandContactSchema.default({ phone: "", wechat: "", email: "" }),
  deskSiteKey: text(64).default(""),
  toggles: z.record(z.string(), z.boolean()).default({}),
  protocolText: text(4000).default(""),
});
export type ErrandSiteSaveBody = z.infer<typeof errandSiteSaveBodySchema>;

export const errandRuleSaveBodySchema = errandRuleSchema
  .omit({ updatedAt: true })
  .partial()
  .extend({
    baseFee: money.default(5),
    baseDistanceKm: z.number().min(0).max(200).default(3),
    perKmFee: money.default(2),
    baseWeightKg: z.number().min(0).max(1000).default(5),
    perKgFee: money.default(1),
    nightStart: text(5).default("22:00"),
    nightEnd: text(5).default("06:00"),
    nightFee: money.default(3),
    buyServiceRate: z.number().min(0).max(1).default(0.1),
    minOrderAmount: money.default(0),
    maxDistanceKm: z.number().min(0.1).max(500).default(30),
    maxWeightKg: z.number().min(0.1).max(1000).default(30),
    tipPresets: z.array(money).max(10).default([0, 2, 5, 10]),
    couponEnabled: z.boolean().default(true),
    acceptRadiusKm: z.number().min(0).max(100).default(5),
    autoDispatch: z.boolean().default(false),
    riderShareRate: z.number().min(0).max(1).default(1),
    maxActiveOrders: z.number().int().min(1).max(20).default(3),
    pointsEarnRate: z.number().min(0).max(100).default(1),
    pointsDeductRate: z.number().min(1).max(10000).default(100),
    maxPointsDiscountRate: z.number().min(0).max(1).default(0.2),
  });
export const errandRuleUpdateBodySchema = errandRuleSaveBodySchema.extend({
  cityId: z.number().int().nonnegative().default(0),
});
export type ErrandRuleSaveBody = z.infer<typeof errandRuleSaveBodySchema>;
export type ErrandRuleUpdateBody = z.infer<typeof errandRuleUpdateBodySchema>;

export const errandCitySaveBodySchema = z.object({
  id: z.number().int().nonnegative().default(0),
  name: text(60).min(1),
  province: text(40).default(""),
  city: text(40).default(""),
  district: text(40).default(""),
  addressLine: text(200).default(""),
  lng: z.number().min(-180).max(180).default(0),
  lat: z.number().min(-90).max(90).default(0),
  status: z.enum(ERRAND_CITY_STATUSES).default("ENABLED"),
  sort: z.number().int().min(0).max(9999).default(0),
  rule: errandRuleSaveBodySchema,
});
export type ErrandCitySaveBody = z.infer<typeof errandCitySaveBodySchema>;


export const errandMetaSchema = z.object({
  scene: z.literal("ERRAND"),
  siteStatusLabels: z.record(z.string(), z.string()),
  cityStatusLabels: z.record(z.string(), z.string()),
  orderStateLabels: z.record(z.string(), z.string()),
  payStateLabels: z.record(z.string(), z.string()),
  payModeLabels: z.record(z.string(), z.string()),
  riderStatusLabels: z.record(z.string(), z.string()),
  vehicleLabels: z.record(z.string(), z.string()),
  serviceTypeLabels: z.record(z.string(), z.string()),
  actionLabels: z.record(z.string(), z.string()),
  couponTypeLabels: z.record(z.string(), z.string()),
  withdrawalStatusLabels: z.record(z.string(), z.string()),
  toggleLabels: z.record(z.string(), z.string()),
  toggleKeys: z.array(z.string()),
  limits: z.object({
    enabled: z.boolean(),
    payAllowed: z.boolean(),
    aiAllowed: z.boolean(),
  }),
});
export type ErrandMeta = z.infer<typeof errandMetaSchema>;

export const errandOverviewSchema = z.object({
  todayOrders: z.number(),
  todayGmv: money,
  pendingPay: z.number(),
  pendingAccept: z.number(),
  inProgress: z.number(),
  completedToday: z.number(),
  onlineRiders: z.number(),
  pendingRiders: z.number(),
  totalOrders: z.number(),
  totalGmv: money,
  /** 近 7 天已支付订单金额（从早到晚）。 */
  trend: z.array(z.object({ day: text(10), orders: z.number(), amount: money })),
  cityStats: z.array(
    z.object({
      cityId: z.number(),
      cityName: text(60),
      todayOrders: z.number(),
      todayGmv: money,
      pending: z.number(),
      inProgress: z.number(),
      onlineRiders: z.number(),
    }),
  ),
});
export type ErrandOverview = z.infer<typeof errandOverviewSchema>;

export const errandOrderEventSchema = z.object({
  id: z.number(),
  status: text(24),
  note: text(300),
  operator: text(64),
  createdAt: text(40),
});
export type ErrandOrderEvent = z.infer<typeof errandOrderEventSchema>;

export const errandOrderSchema = z.object({
  id: z.number(),
  orderNo: text(40),
  cityId: z.number(),
  cityName: text(60),
  serviceType: z.enum(ERRAND_SERVICE_TYPES),
  status: z.enum(ERRAND_ORDER_STATES),
  payState: z.enum(ERRAND_PAY_STATES),
  payMode: z.enum(ERRAND_PAY_MODES),
  fromParty: errandPartySchema,
  toParty: errandPartySchema,
  goodsDesc: text(300),
  goodsAmount: money,
  weightKg: z.number(),
  distanceKm: z.number(),
  baseFee: money,
  distanceFee: money,
  weightFee: money,
  timeFee: money,
  goodsFee: money,
  tip: money,
  couponId: z.number(),
  couponDiscount: money,
  pointsUsed: z.number(),
  pointsDiscount: money,
  pointsEarned: z.number(),
  totalAmount: money,
  /** 订单完成时快照的骑手劳务收入（退款冲正也用它）。 */
  riderIncomeAmount: money,
  /** 订单完成时快照的代理分佣（退款冲正也用它）。 */
  agentId: z.number(),
  agentIncomeAmount: money,
  /** 帮买实际采购金额、小票与差额（正数=应退顾客）。 */
  purchaseAmount: money,
  purchaseReceipt: text(500),
  purchaseNote: text(300),
  changeAmount: money,
  extraAmount: money,
  extraPaidAt: text(40),
  /** 顾客对骑手的评价（1-5，0=未评）。 */
  rating: z.number(),
  ratingComment: text(300),
  ratedAt: text(40),
  riderId: z.number(),
  riderNo: text(16),
  riderName: text(40),
  customerId: z.number(),
  contactName: text(40),
  contactMobile: text(20),
  remark: text(300),
  photos: z.array(text(500)),
  cancelReason: text(300),
  expireAt: text(40),
  paidAt: text(40),
  acceptedAt: text(40),
  pickedAt: text(40),
  deliveredAt: text(40),
  completedAt: text(40),
  createdAt: text(40),
  updatedAt: text(40),
});
export type ErrandOrder = z.infer<typeof errandOrderSchema>;

export const errandOrderDetailSchema = errandOrderSchema.extend({
  events: z.array(errandOrderEventSchema),
});
export type ErrandOrderDetail = z.infer<typeof errandOrderDetailSchema>;

export const errandOrderListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
  status: z.string().trim().max(24).default(""),
  payState: z.string().trim().max(16).default(""),
  serviceType: z.string().trim().max(16).default(""),
  riderId: z.coerce.number().int().nonnegative().default(0),
  cityId: z.coerce.number().int().nonnegative().default(0),
  keyword: z.string().trim().max(60).default(""),
  from: z.string().trim().max(10).default(""),
  to: z.string().trim().max(10).default(""),
});
export type ErrandOrderListQuery = z.infer<typeof errandOrderListQuerySchema>;

export const errandOrderActionBodySchema = z.object({
  id: z.number().int().positive(),
  action: z.enum(ERRAND_ORDER_ACTIONS),
  riderId: z.number().int().nonnegative().default(0),
  note: text(300).default(""),
  /** SETTLE_BUY 专用：实际采购金额、小票图片与备注。 */
  purchaseAmount: money.default(0),
  purchaseReceipt: text(500).default(""),
  purchaseNote: text(300).default(""),
});
export type ErrandOrderActionBody = z.infer<typeof errandOrderActionBodySchema>;

export const errandOrderPageSchema = pageSchema(errandOrderSchema);

export const errandRiderSchema = z.object({
  id: z.number(),
  riderNo: text(16),
  cityId: z.number(),
  cityName: text(60),
  name: text(40),
  mobile: text(20),
  /** 身份证号掩码：只回前 3 后 2，避免台账越权泄露。 */
  idCardMasked: text(32),
  vehicleType: z.enum(ERRAND_VEHICLE_TYPES),
  status: z.enum(ERRAND_RIDER_STATUSES),
  online: z.boolean(),
  serviceTypes: z.array(z.enum(ERRAND_SERVICE_TYPES)),
  rating: z.number(),
  orderCount: z.number(),
  incomeTotal: money,
  balance: money,
  frozen: money,
  rejectReason: text(300),
  idCardFront: text(500),
  idCardBack: text(500),
  vehiclePhoto: text(500),
  lastActiveAt: text(40),
  createdAt: text(40),
  updatedAt: text(40),
});
export type ErrandRider = z.infer<typeof errandRiderSchema>;

export const errandRiderPageSchema = pageSchema(errandRiderSchema);

export const errandRiderRosterSchema = z.object({
  id: z.number(),
  riderNo: text(16),
  cityId: z.number(),
  cityName: text(60),
  name: text(40),
  mobile: text(20),
  vehicleType: z.enum(ERRAND_VEHICLE_TYPES),
  status: z.enum(ERRAND_RIDER_STATUSES),
  online: z.boolean(),
  serviceTypes: z.array(z.enum(ERRAND_SERVICE_TYPES)),
  rating: z.number(),
  orderCount: z.number(),
  balance: money,
  updatedAt: text(40),
});
export type ErrandRiderRoster = z.infer<typeof errandRiderRosterSchema>;

export const errandRiderStatusBodySchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(ERRAND_RIDER_STATUSES),
  reason: text(300).default(""),
});
export type ErrandRiderStatusBody = z.infer<typeof errandRiderStatusBodySchema>;

export const errandRiderSaveBodySchema = z.object({
  id: z.number().int().positive(),
  cityId: z.number().int().nonnegative().default(0),
  name: text(40).min(1),
  mobile: text(20).default(""),
  vehicleType: z.enum(ERRAND_VEHICLE_TYPES).default("EBIKE"),
  serviceTypes: z.array(z.enum(ERRAND_SERVICE_TYPES)).default(["SEND", "BUY"]),
  status: z.enum(ERRAND_RIDER_STATUSES).default("APPROVED"),
  note: text(300).default(""),
});
export type ErrandRiderSaveBody = z.infer<typeof errandRiderSaveBodySchema>;

export const errandCustomerSchema = z.object({
  id: z.number(),
  openid: text(64),
  nickname: text(60),
  avatar: text(500),
  orderCount: z.number(),
  paidOrderCount: z.number(),
  totalAmount: money,
  points: z.number().int(),
  lastOrderAt: text(40),
  status: z.boolean(),
  createdAt: text(40),
});
export type ErrandCustomer = z.infer<typeof errandCustomerSchema>;

export const errandCustomerPageSchema = pageSchema(errandCustomerSchema);

export const errandCouponSchema = z.object({
  id: z.number(),
  name: text(60),
  type: z.enum(ERRAND_COUPON_TYPES),
  discountValue: z.number().min(0),
  minAmount: money,
  total: z.number(),
  claimed: z.number(),
  used: z.number(),
  startAt: text(40),
  endAt: text(40),
  enabled: z.boolean(),
  /** 适用城市；0=全站通用。 */
  cityId: z.number(),
  /** 适用服务类型：空数组=全部。 */
  serviceTypes: z.array(z.enum(ERRAND_SERVICE_TYPES)),
  /** 仅限首单顾客使用。 */
  firstOrderOnly: z.boolean(),
  /** 顾客首次登录自动发一张。 */
  autoIssue: z.boolean(),
  createdAt: text(40),
  updatedAt: text(40),
});
export type ErrandCoupon = z.infer<typeof errandCouponSchema>;

export const errandCouponSaveBodySchema = z.object({
  id: z.number().int().nonnegative().default(0),
  name: text(60).min(1),
  type: z.enum(ERRAND_COUPON_TYPES).default("FIXED"),
  discountValue: z.number().min(0).max(10000),
  minAmount: money.default(0),
  total: z.number().int().min(0).max(1_000_000).default(0),
  startAt: text(40).default(""),
  endAt: text(40).default(""),
  enabled: z.boolean().default(true),
  cityId: z.number().int().nonnegative().default(0),
  serviceTypes: z.array(z.enum(ERRAND_SERVICE_TYPES)).max(2).default([]),
  firstOrderOnly: z.boolean().default(false),
  autoIssue: z.boolean().default(false),
});
export type ErrandCouponSaveBody = z.infer<typeof errandCouponSaveBodySchema>;

export const errandWalletSummarySchema = z.object({
  riders: z.number(),
  totalIncome: money,
  totalBalance: money,
  totalWithdrawPaid: money,
  totalWithdrawPending: money,
  recent: z.array(
    z.object({
      id: z.number(),
      riderId: z.number(),
      riderName: text(40),
      type: text(16),
      amount: money,
      orderNo: text(40),
      remark: text(200),
      createdAt: text(40),
    }),
  ),
});
export type ErrandWalletSummary = z.infer<typeof errandWalletSummarySchema>;

export const errandWithdrawalSchema = z.object({
  id: z.number(),
  riderId: z.number(),
  riderName: text(40),
  riderNo: text(16),
  amount: money,
  status: z.enum(ERRAND_WITHDRAWAL_STATUSES),
  reason: text(300),
  bankInfo: text(200),
  handledNote: text(300),
  handledAt: text(40),
  /** MANUAL 手工打款 | WECHAT 商家转账 */
  method: z.enum(["MANUAL", "WECHAT"]),
  transferBatchId: text(64),
  transferState: text(24),
  transferredAt: text(40),
  createdAt: text(40),
});
export type ErrandWithdrawal = z.infer<typeof errandWithdrawalSchema>;

export const errandWithdrawalPageSchema = pageSchema(errandWithdrawalSchema);

export const errandWithdrawalActionBodySchema = z.object({
  id: z.number().int().positive(),
  action: z.enum(["PAID", "REJECTED"]),
  note: text(300).default(""),
  /** PAID 时可选择微信商家转账；失败会保留待打款，可改手工。 */
  method: z.enum(["MANUAL", "WECHAT"]).default("MANUAL"),
});
export type ErrandWithdrawalActionBody = z.infer<typeof errandWithdrawalActionBodySchema>;

export const errandAssetSchema = z.object({
  id: z.number(),
  name: text(200),
  url: text(500),
  type: text(32),
  sizeBytes: z.number(),
  createdAt: text(40),
});
export type ErrandAsset = z.infer<typeof errandAssetSchema>;

export const errandAiDispatchBodySchema = z.object({
  orderId: z.number().int().positive(),
});
export type ErrandAiDispatchBody = z.infer<typeof errandAiDispatchBodySchema>;

export const errandAiDispatchResultSchema = z.object({
  orderNo: text(40),
  candidates: z.array(
    z.object({
      riderId: z.number(),
      riderNo: text(16),
      name: text(40),
      score: z.number(),
      reason: text(300),
    }),
  ),
  advice: text(1000),
  model: text(128),
  /** true = 平台模型网关真实产出；false = 未配模型时的规则式兜底。 */
  aiGenerated: z.boolean(),
});
export type ErrandAiDispatchResult = z.infer<typeof errandAiDispatchResultSchema>;

export const errandAiOpsResultSchema = z.object({
  summary: text(2000),
  suggestions: z.array(text(300)),
  model: text(128),
  aiGenerated: z.boolean(),
});
export type ErrandAiOpsResult = z.infer<typeof errandAiOpsResultSchema>;

export const errandAiOpsBodySchema = z.object({
  days: z.number().int().min(1).max(30).default(7),
});
export type ErrandAiOpsBody = z.infer<typeof errandAiOpsBodySchema>;

export const ERRAND_AGENT_STATUSES = ["ACTIVE", "DISABLED"] as const;
export type ErrandAgentStatus = (typeof ERRAND_AGENT_STATUSES)[number];
export const ERRAND_AGENT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "启用",
  DISABLED: "停用",
};

export const errandAgentSchema = z.object({
  id: z.number(),
  name: text(60),
  mobile: text(20),
  status: z.enum(ERRAND_AGENT_STATUSES),
  commissionRate: z.number(),
  cityIds: z.array(z.number()),
  balance: money,
  frozen: money,
  totalIncome: money,
  createdAt: text(40),
  updatedAt: text(40),
});
export type ErrandAgent = z.infer<typeof errandAgentSchema>;

export const errandAgentSaveBodySchema = z.object({
  id: z.number().int().nonnegative().default(0),
  name: text(60).min(1),
  mobile: text(20).min(5),
  password: text(64).default(""),
  status: z.enum(ERRAND_AGENT_STATUSES).default("ACTIVE"),
  commissionRate: z.number().min(0).max(1).default(0.1),
  cityIds: z.array(z.number().int().positive()).max(50).default([]),
});
export type ErrandAgentSaveBody = z.infer<typeof errandAgentSaveBodySchema>;

export const errandAgentWithdrawalSchema = z.object({
  id: z.number(),
  agentId: z.number(),
  agentName: text(60),
  amount: money,
  status: z.enum(ERRAND_WITHDRAWAL_STATUSES),
  bankInfo: text(200),
  handledNote: text(300),
  handledAt: text(40),
  createdAt: text(40),
});
export type ErrandAgentWithdrawal = z.infer<typeof errandAgentWithdrawalSchema>;

export const errandAgentWithdrawalPageSchema = pageSchema(errandAgentWithdrawalSchema);
export const errandAgentWithdrawalActionBodySchema = z.object({
  id: z.number().int().positive(),
  action: z.enum(["PAID", "REJECTED"]),
  note: text(300).default(""),
});
export type ErrandAgentWithdrawalActionBody = z.infer<typeof errandAgentWithdrawalActionBodySchema>;

export const errandAgentMeSchema = z.object({
  agent: errandAgentSchema,
  cities: z.array(z.object({ id: z.number(), name: text(60) })),
  ordersToday: z.number(),
  gmvToday: money,
  commissionToday: money,
});
export type ErrandAgentMe = z.infer<typeof errandAgentMeSchema>;

export const errandAppSaveBodySchema = miniAppInputSchema;
export type ErrandAppSaveBody = z.infer<typeof errandAppSaveBodySchema>;

export const errandAppTestResultSchema = miniAppTestResultSchema.extend({
  serverIp: text(64),
  nextAction: text(300),
  nextPath: text(200),
});
export type ErrandAppTestResult = z.infer<typeof errandAppTestResultSchema>;

export const errandAdminSettingsSchema = z.object({
  enabled: z.boolean(),
  payAllowed: z.boolean(),
  aiAllowed: z.boolean(),
  siteTotal: z.number(),
  onlineSiteTotal: z.number(),
  orderTotal: z.number(),
  gmvTotal: money,
  riderTotal: z.number(),
  updatedAt: text(40),
});
export type ErrandAdminSettings = z.infer<typeof errandAdminSettingsSchema>;

export const errandAdminSettingsBodySchema = z.object({
  enabled: z.boolean().default(true),
  payAllowed: z.boolean().default(true),
  aiAllowed: z.boolean().default(true),
});
export type ErrandAdminSettingsBody = z.infer<typeof errandAdminSettingsBodySchema>;

// ---------------------------------------------------------------- 公开通道形状

export const errandPublicSiteSchema = z.object({
  siteId: z.number(),
  siteCode: text(16),
  cityId: z.number(),
  cityName: text(60),
  cities: z.array(
    z.object({
      id: z.number(),
      name: text(60),
      province: text(40),
      city: text(40),
      district: text(40),
      addressLine: text(200),
      lng: z.number(),
      lat: z.number(),
    }),
  ),
  name: text(120),
  logo: text(500),
  banner: text(500),
  slogan: text(200),
  themeColor: text(16),
  notice: text(500),
  province: text(40),
  city: text(40),
  district: text(40),
  addressLine: text(200),
  lng: z.number(),
  lat: z.number(),
  businessHours: text(80),
  phone: text(32),
  contact: errandContactSchema,
  toggles: z.record(z.string(), z.boolean()),
  protocolText: text(4000),
  rule: errandRuleSchema,
  deskEmbedUrl: text(500),
  /** 店主配置的订阅消息模板 ID（顾客下单/接单/送达/取消用）。 */
  templates: z.record(z.string(), z.string()),
  coupons: z.array(
    z.object({
      id: z.number(),
      name: text(60),
      type: z.enum(ERRAND_COUPON_TYPES),
      discountValue: z.number(),
      minAmount: money,
    }),
  ),
});
export type ErrandPublicSite = z.infer<typeof errandPublicSiteSchema>;

export const errandPublicSiteListItemSchema = z.object({
  siteCode: text(16),
  cityId: z.number(),
  cityName: text(60),
  cities: z.array(
    z.object({
      id: z.number(),
      name: text(60),
      province: text(40),
      city: text(40),
      district: text(40),
      addressLine: text(200),
      lng: z.number(),
      lat: z.number(),
    }),
  ),
  name: text(120),
  logo: text(500),
  province: text(40),
  city: text(40),
  district: text(40),
  addressLine: text(200),
  lng: z.number(),
  lat: z.number(),
});
export type ErrandPublicSiteListItem = z.infer<typeof errandPublicSiteListItemSchema>;

export const errandQuoteInputSchema = z.object({
  site: text(16).default(""),
  cityId: z.number().int().nonnegative().default(0),
  serviceType: z.enum(ERRAND_SERVICE_TYPES).default("SEND"),
  distanceKm: z.number().min(0).max(500).default(0),
  weightKg: z.number().min(0).max(1000).default(0),
  goodsAmount: money.default(0),
  tip: money.default(0),
  at: text(40).default(""),
  couponId: z.number().int().nonnegative().default(0),
  pointsUsed: z.number().int().nonnegative().default(0),
  /** 起终点坐标：配了腾讯地图 Key 时服务端算驾车距离，否则回落到 distanceKm。 */
  fromLng: z.number().min(-180).max(180).default(0),
  fromLat: z.number().min(-90).max(90).default(0),
  toLng: z.number().min(-180).max(180).default(0),
  toLat: z.number().min(-90).max(90).default(0),
});
export type ErrandQuoteInput = z.infer<typeof errandQuoteInputSchema>;

export const errandQuoteResultSchema = z.object({
  serviceType: z.enum(ERRAND_SERVICE_TYPES),
  distanceKm: z.number(),
  weightKg: z.number(),
  baseFee: money,
  distanceFee: money,
  weightFee: money,
  timeFee: money,
  goodsFee: money,
  tip: money,
  couponDiscount: money,
  pointsUsed: z.number(),
  pointsDiscount: money,
  totalAmount: money,
  night: z.boolean(),
  minOrderAdjusted: z.boolean(),
  /** DRIVING=腾讯地图驾车距离；STRAIGHT=直线降级；INPUT=端上填写。 */
  distanceSource: z.enum(["DRIVING", "STRAIGHT", "INPUT"]),
});
export type ErrandQuoteResult = z.infer<typeof errandQuoteResultSchema>;

export const errandPublicLoginBodySchema = z.object({
  site: text(16).default(""),
  code: text(128).min(1),
});
export type ErrandPublicLoginBody = z.infer<typeof errandPublicLoginBodySchema>;

export const errandPublicProfileSaveBodySchema = z.object({
  nickname: text(60).default(""),
  avatar: text(500).default(""),
});
export type ErrandPublicProfileSaveBody = z.infer<typeof errandPublicProfileSaveBodySchema>;

export const errandPublicLoginResultSchema = z.object({
  token: text(200),
  customerId: z.number(),
  nickname: text(60),
  avatar: text(500),
  points: z.number().int(),
});
export type ErrandPublicLoginResult = z.infer<typeof errandPublicLoginResultSchema>;

export const errandPublicOrderCreateBodySchema = z.object({
  site: text(16).default(""),
  cityId: z.number().int().nonnegative().default(0),
  serviceType: z.enum(ERRAND_SERVICE_TYPES).default("SEND"),
  fromParty: errandPartySchema,
  toParty: errandPartySchema,
  goodsDesc: text(300).default(""),
  goodsAmount: money.default(0),
  weightKg: z.number().min(0).max(1000).default(0),
  distanceKm: z.number().min(0).max(500).default(0),
  tip: money.default(0),
  couponId: z.number().int().nonnegative().default(0),
  pointsUsed: z.number().int().nonnegative().default(0),
  contactName: text(40).default(""),
  contactMobile: text(20).default(""),
  remark: text(300).default(""),
  photos: z.array(text(500)).max(6).default([]),
  protocolAccepted: z.boolean().default(false),
});
export type ErrandPublicOrderCreateBody = z.infer<typeof errandPublicOrderCreateBodySchema>;

export const errandPublicOrderCreatedSchema = z.object({
  orderNo: text(40),
  totalAmount: money,
  payState: z.enum(ERRAND_PAY_STATES),
  expireAt: text(40),
  payParams: z
    .object({
      timeStamp: z.string(),
      nonceStr: z.string(),
      package: z.string(),
      signType: z.enum(["RSA"]),
      paySign: z.string(),
    })
    .nullable(),
  message: text(300),
});
export type ErrandPublicOrderCreated = z.infer<typeof errandPublicOrderCreatedSchema>;

export const errandPublicRepayBodySchema = z.object({
  site: text(16).default(""),
  orderNo: text(40).min(1),
  mobile: text(20).default(""),
});
export type ErrandPublicRepayBody = z.infer<typeof errandPublicRepayBodySchema>;

export const errandPublicExtraPayBodySchema = z.object({
  site: text(16).default(""),
  orderNo: text(40).min(1),
});
export type ErrandPublicExtraPayBody = z.infer<typeof errandPublicExtraPayBodySchema>;

export const errandPublicOrderQuerySchema = z.object({
  site: text(16).default(""),
  orderNo: text(40).min(1),
  mobile: text(20).default(""),
});
export type ErrandPublicOrderQuery = z.infer<typeof errandPublicOrderQuerySchema>;

export const errandPublicOrderSchema = errandOrderSchema.extend({
  events: z.array(errandOrderEventSchema),
});
export type ErrandPublicOrder = z.infer<typeof errandPublicOrderSchema>;

export const errandPublicCancelBodySchema = z.object({
  site: text(16).default(""),
  orderNo: text(40).min(1),
  mobile: text(20).default(""),
  reason: text(300).default(""),
  token: text(200).default(""),
});
export type ErrandPublicCancelBody = z.infer<typeof errandPublicCancelBodySchema>;

export const errandAddressSchema = z.object({
  id: z.number(),
  type: z.enum(["FROM", "TO"]),
  name: text(40),
  mobile: text(20),
  province: text(40),
  city: text(40),
  district: text(40),
  address: text(200),
  lng: z.number(),
  lat: z.number(),
  isDefault: z.boolean(),
});
export type ErrandAddress = z.infer<typeof errandAddressSchema>;

export const errandAddressSaveBodySchema = z.object({
  id: z.number().int().nonnegative().default(0),
  type: z.enum(["FROM", "TO"]).default("FROM"),
  name: text(40).min(1),
  mobile: text(20).default(""),
  province: text(40).default(""),
  city: text(40).default(""),
  district: text(40).default(""),
  address: text(200).min(1),
  lng: z.number().min(-180).max(180).default(0),
  lat: z.number().min(-90).max(90).default(0),
  isDefault: z.boolean().default(false),
});
export type ErrandAddressSaveBody = z.infer<typeof errandAddressSaveBodySchema>;

export const errandPublicCouponClaimBodySchema = z.object({
  site: text(16).default(""),
  couponId: z.number().int().positive(),
  token: text(200).default(""),
});
export type ErrandPublicCouponClaimBody = z.infer<typeof errandPublicCouponClaimBodySchema>;

export const errandPublicCustomerCouponSchema = z.object({
  id: z.number(),
  couponId: z.number(),
  name: text(60),
  type: z.enum(ERRAND_COUPON_TYPES),
  discountValue: z.number(),
  minAmount: money,
  used: z.boolean(),
  expiresAt: text(40),
});
export type ErrandPublicCustomerCoupon = z.infer<typeof errandPublicCustomerCouponSchema>;

export const errandRiderRegisterBodySchema = z.object({
  site: text(16).default(""),
  cityId: z.number().int().nonnegative().default(0),
  code: text(128).default(""),
  name: text(40).min(1),
  mobile: text(20).min(1),
  idCardNo: text(32).default(""),
  vehicleType: z.enum(ERRAND_VEHICLE_TYPES).default("EBIKE"),
  serviceTypes: z.array(z.enum(ERRAND_SERVICE_TYPES)).min(1).default(["SEND", "BUY"]),
  idCardFront: text(500).default(""),
  idCardBack: text(500).default(""),
  vehiclePhoto: text(500).default(""),
});
export type ErrandRiderRegisterBody = z.infer<typeof errandRiderRegisterBodySchema>;

export const errandRiderLoginBodySchema = z.object({
  site: text(16).default(""),
  code: text(128).min(1),
});
export type ErrandRiderLoginBody = z.infer<typeof errandRiderLoginBodySchema>;

export const errandRiderWorkbenchSchema = z.object({
  rider: errandRiderSchema,
  pendingOrders: z.array(errandOrderSchema),
  activeOrders: z.array(errandOrderSchema),
  completedToday: z.number(),
  incomeToday: money,
});
export type ErrandRiderWorkbench = z.infer<typeof errandRiderWorkbenchSchema>;

export const errandRiderOnlineBodySchema = z.object({
  online: z.boolean(),
  serviceTypes: z.array(z.enum(ERRAND_SERVICE_TYPES)).default(["SEND", "BUY"]),
});
export type ErrandRiderOnlineBody = z.infer<typeof errandRiderOnlineBodySchema>;

export const errandRiderActionBodySchema = z.object({
  orderId: z.number().int().positive(),
  action: z.enum(["ACCEPT", "PICKUP", "DELIVER", "ARRIVE", "COMPLETE", "ABANDON"]),
  note: text(300).default(""),
});
export type ErrandRiderActionBody = z.infer<typeof errandRiderActionBodySchema>;

export const errandRiderWithdrawBodySchema = z.object({
  amount: money.min(0.01),
  /** 选中的银行卡 id；0 时回落到 bankInfo 文本。 */
  bankCardId: z.number().int().nonnegative().default(0),
  bankInfo: text(200).default(""),
});
export type ErrandRiderWithdrawBody = z.infer<typeof errandRiderWithdrawBodySchema>;

export const errandBankCardSchema = z.object({
  id: z.number(),
  holder: text(40),
  bankName: text(60),
  cardNoMasked: text(32),
  isDefault: z.boolean(),
  createdAt: text(40),
});
export type ErrandBankCard = z.infer<typeof errandBankCardSchema>;

export const errandBankCardSaveBodySchema = z.object({
  id: z.number().int().nonnegative().default(0),
  holder: text(40).min(1),
  bankName: text(60).min(1),
  cardNo: text(32).min(8),
  isDefault: z.boolean().default(false),
});
export type ErrandBankCardSaveBody = z.infer<typeof errandBankCardSaveBodySchema>;

export const errandRiderLocationBodySchema = z.object({
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
});
export type ErrandRiderLocationBody = z.infer<typeof errandRiderLocationBodySchema>;

export const errandPublicRateBodySchema = z.object({
  site: text(16).default(""),
  orderNo: text(40).min(1),
  rating: z.number().int().min(1).max(5),
  comment: text(300).default(""),
});
export type ErrandPublicRateBody = z.infer<typeof errandPublicRateBodySchema>;

// ---------------------------------------------------------------- 端点清单

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

/**
 * 跑腿小程序工具端点：`Errand_` 店主侧（`/enterprise/errand/**`）、
 * `ErrandAdmin_` 平台侧（`/enterprise/admin/errand/**`），由 `moduleHandlers`
 * 按 operationId 后缀自动挂到控制器同名方法上。C 端与骑手通道手写在 errand.public.ts。
 */
export const errandEndpoints = {
  // ---------- 元信息与概览 ----------
  Errand_meta: get("/enterprise/errand/meta", emptyQuery, errandMetaSchema),
  Errand_overview: get("/enterprise/errand/overview", emptyQuery, errandOverviewSchema),

  // ---------- 站点（一个账号一个跑腿站）----------
  Errand_site: get("/enterprise/errand/site", emptyQuery, errandSiteSchema.nullable()),
  Errand_siteSave: post("/enterprise/errand/site/save", errandSiteSaveBodySchema, errandSiteSchema),
  Errand_siteStatus: post(
    "/enterprise/errand/site/status",
    z.object({ status: z.enum(ERRAND_SITE_STATUSES) }),
    errandSiteSchema,
  ),

  // ---------- 计价规则 ----------
  Errand_cities: get("/enterprise/errand/city/list", emptyQuery, z.array(errandCitySchema)),
  Errand_citySave: post(
    "/enterprise/errand/city/save",
    errandCitySaveBodySchema,
    errandCitySchema,
  ),
  Errand_cityStatus: post(
    "/enterprise/errand/city/status",
    z.object({ id: z.number().int().positive(), status: z.enum(ERRAND_CITY_STATUSES) }),
    errandCitySchema,
  ),
  Errand_cityRemove: post(
    "/enterprise/errand/city/remove",
    z.object({ id: z.number().int().positive() }),
    okResult,
  ),
  Errand_ruleSave: post(
    "/enterprise/errand/rule/save",
    errandRuleUpdateBodySchema,
    errandRuleSchema,
  ),

  // ---------- 订单与履约 ----------
  Errand_orders: get(
    "/enterprise/errand/order/list",
    errandOrderListQuerySchema,
    errandOrderPageSchema,
  ),
  Errand_orderDetail: get(
    "/enterprise/errand/order/detail",
    z.object({ id: z.coerce.number().int().positive() }),
    errandOrderDetailSchema,
  ),
  Errand_orderAction: post(
    "/enterprise/errand/order/action",
    errandOrderActionBodySchema,
    errandOrderDetailSchema,
  ),

  // ---------- 骑手 ----------
  Errand_riders: get(
    "/enterprise/errand/rider/list",
    z.object({
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(200).default(20),
      status: z.string().trim().max(16).default(""),
      cityId: z.coerce.number().int().nonnegative().default(0),
      keyword: z.string().trim().max(60).default(""),
    }),
    errandRiderPageSchema,
  ),
  Errand_riderRoster: get(
    "/enterprise/errand/rider/roster",
    emptyQuery,
    z.array(errandRiderRosterSchema),
  ),
  Errand_riderSave: post(
    "/enterprise/errand/rider/save",
    errandRiderSaveBodySchema,
    errandRiderSchema,
  ),
  Errand_riderStatus: post(
    "/enterprise/errand/rider/status",
    errandRiderStatusBodySchema,
    errandRiderSchema,
  ),

  // ---------- 顾客 ----------
  Errand_customers: get(
    "/enterprise/errand/customer/list",
    z.object({
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(200).default(20),
      keyword: z.string().trim().max(60).default(""),
    }),
    errandCustomerPageSchema,
  ),
  Errand_customerStatus: post(
    "/enterprise/errand/customer/status",
    z.object({ id: z.number().int().positive(), status: z.boolean() }),
    okResult,
  ),

  // ---------- 优惠券 ----------
  Errand_coupons: get(
    "/enterprise/errand/coupon/list",
    emptyQuery,
    z.array(errandCouponSchema),
  ),
  Errand_couponSave: post(
    "/enterprise/errand/coupon/save",
    errandCouponSaveBodySchema,
    errandCouponSchema,
  ),
  Errand_couponStatus: post(
    "/enterprise/errand/coupon/status",
    z.object({ id: z.number().int().positive(), enabled: z.boolean() }),
    errandCouponSchema,
  ),
  Errand_couponRemove: post(
    "/enterprise/errand/coupon/remove",
    z.object({ id: z.number().int().positive() }),
    okResult,
  ),

  // ---------- 骑手钱包与提现 ----------
  Errand_wallet: get("/enterprise/errand/wallet", emptyQuery, errandWalletSummarySchema),
  Errand_withdrawals: get(
    "/enterprise/errand/withdrawal/list",
    z.object({
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(200).default(20),
      status: z.string().trim().max(16).default(""),
    }),
    errandWithdrawalPageSchema,
  ),
  Errand_withdrawalAction: post(
    "/enterprise/errand/withdrawal/action",
    errandWithdrawalActionBodySchema,
    errandWithdrawalSchema,
  ),

  // ---------- 平台底座：数字资产 / AI ----------
  Errand_assets: get(
    "/enterprise/errand/asset/list",
    z.object({ keyword: z.string().trim().max(60).default(""), take: z.coerce.number().int().min(1).max(100).default(40) }),
    z.array(errandAssetSchema),
  ),
  Errand_aiDispatch: post(
    "/enterprise/errand/ai/dispatch",
    errandAiDispatchBodySchema,
    errandAiDispatchResultSchema,
  ),
  Errand_aiOps: post("/enterprise/errand/ai/ops", errandAiOpsBodySchema, errandAiOpsResultSchema),

  // ---------- 小程序主体与发布 ----------
  Errand_appDetail: get("/enterprise/errand/app", emptyQuery, miniAppViewSchema),
  Errand_appSave: post("/enterprise/errand/app/save", errandAppSaveBodySchema, miniAppViewSchema),
  Errand_appTest: post(
    "/enterprise/errand/app/test",
    z.object({}),
    errandAppTestResultSchema,
  ),
  Errand_qrcodeGenerate: post(
    "/enterprise/errand/qrcode/generate",
    z.object({ path: z.string().trim().max(200).default("") }),
    z.object({ url: z.string() }),
  ),

  // ---------- 代理 ----------
  Errand_agents: get("/enterprise/errand/agent/list", emptyQuery, z.array(errandAgentSchema)),
  Errand_agentSave: post(
    "/enterprise/errand/agent/save",
    errandAgentSaveBodySchema,
    errandAgentSchema,
  ),
  Errand_agentStatus: post(
    "/enterprise/errand/agent/status",
    z.object({ id: z.number().int().positive(), status: z.enum(ERRAND_AGENT_STATUSES) }),
    errandAgentSchema,
  ),
  Errand_agentRemove: post(
    "/enterprise/errand/agent/remove",
    z.object({ id: z.number().int().positive() }),
    okResult,
  ),
  Errand_agentWithdrawals: get(
    "/enterprise/errand/agent/withdrawal/list",
    z.object({
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(200).default(20),
      status: z.string().trim().max(16).default(""),
    }),
    errandAgentWithdrawalPageSchema,
  ),
  Errand_agentWithdrawalAction: post(
    "/enterprise/errand/agent/withdrawal/action",
    errandAgentWithdrawalActionBodySchema,
    errandAgentWithdrawalSchema,
  ),

  // ---------- 平台侧 ----------
  ErrandAdmin_settings: get(
    "/enterprise/admin/errand/settings",
    emptyQuery,
    errandAdminSettingsSchema,
  ),
  ErrandAdmin_saveSettings: post(
    "/enterprise/admin/errand/settings/save",
    errandAdminSettingsBodySchema,
    errandAdminSettingsSchema,
  ),
};
