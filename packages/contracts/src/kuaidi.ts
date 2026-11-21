import { z } from "zod";
import { pageSchema } from "./pagination";
import {
  PRIVATE_MINI_SCENES,
  miniAppInputSchema,
  miniAppTestResultSchema,
  miniAppViewSchema,
} from "./private-mini";

const envelope = <T extends z.ZodType>(data: T) =>
  z.object({ code: z.number(), message: z.string(), data: data.nullable() });
const emptyQuery = z.object({});
const okResult = z.object({ ok: z.boolean(), message: z.string() });
const money = z.number().min(0).max(9_999_999_999);

/**
 * 工作台 · 建站管理 · 快递寄件小程序工具（参考「快递寄件小程序源码」业务口径按本站架构重写）。
 *
 * 每个本站用户可以建自己的快递寄件平台：配置自己的快递公司报价、用微信小程序接单、
 * 买家在小程序里选寄/收件人与快递公司、按重量与地区自动算运费、保价与取件时间、
 * 支付（微信商户号直收或线下登记）后进入履约状态机；最后按自己的小程序主体出包并直传微信。
 *
 * 三条硬口径：
 * 1. 资金直收——在线收款走店主自己的微信支付商户号（凭据在 kuaidi_pay_accounts，
 *    归属企业级、多个寄件点共用），平台不经手资金，本域没有资金账本、提现与代付；
 * 2. 客服复用系统 AI 客服（service-desk）——站点只存绑定的 deskSiteKey，
 *    小程序用 web-view 打开现成 `/embed/service-desk?key=`，本域不建任何会话表；
 * 3. 运费只由后端报价引擎算——快递公司报价（首重/续重/偏远/保价）按站点配置落库，
 *    端上传的重量尺寸只作为报价输入，不参与最终金额。
 *
 * 主体口径（2026-11-18 需求方拍定）：**一个账号一部小程序**，站点只是寄件点（位置），
 * 数量完全放开；AppID/密钥、出包台账、收款账户都挂在账号级，C 端进小程序后选寄件点。
 *
 * 小程序端（买家）只走 `/api/public/kuaidi/*` 免登录公开通道；契约在此声明其
 * 请求/响应结构，路由由 `backend/src/kuaidi/kuaidi.public.ts` 手写注册，不进 JSON 契约与 OpenAPI。
 */

// ---------------------------------------------------------------- 枚举与文案

export const KUAIDI_SITE_STATUSES = ["DRAFT", "ONLINE", "CLOSED"] as const;
export type KuaidiSiteStatus = (typeof KUAIDI_SITE_STATUSES)[number];
export const KUAIDI_SITE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "未上线",
  ONLINE: "营业中",
  CLOSED: "已关闭",
};

/** 履约状态：支付成功后才进入待取件，未支付单由 payState 单独表达。 */
export const KUAIDI_ORDER_STATES = [
  "PENDING_PICKUP",
  "ACCEPTED",
  "PICKED_UP",
  "IN_TRANSIT",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
  "EXCEPTION",
] as const;
export type KuaidiOrderState = (typeof KUAIDI_ORDER_STATES)[number];
export const KUAIDI_ORDER_STATE_LABELS: Record<string, string> = {
  PENDING_PICKUP: "待取件",
  ACCEPTED: "已接单",
  PICKED_UP: "已取件",
  IN_TRANSIT: "运输中",
  DELIVERED: "已签收",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  EXCEPTION: "异常",
};

/** 支付状态：与履约状态分开，退款只登记线下处置，平台不代扣代退。 */
export const KUAIDI_PAY_STATES = [
  "PENDING",
  "PAID",
  "REFUNDED",
  "CLOSED",
] as const;
export type KuaidiPayState = (typeof KUAIDI_PAY_STATES)[number];
export const KUAIDI_PAY_STATE_LABELS: Record<string, string> = {
  PENDING: "待支付",
  PAID: "已支付",
  REFUNDED: "已退款",
  CLOSED: "已关闭",
};

export const KUAIDI_PAY_MODES = ["ONLINE", "OFFLINE"] as const;
export type KuaidiPayMode = (typeof KUAIDI_PAY_MODES)[number];
export const KUAIDI_PAY_MODE_LABELS: Record<string, string> = {
  ONLINE: "微信在线支付",
  OFFLINE: "线下登记",
};

export const KUAIDI_ADDRESS_TYPES = ["SENDER", "RECEIVER"] as const;
export type KuaidiAddressType = (typeof KUAIDI_ADDRESS_TYPES)[number];
export const KUAIDI_ADDRESS_TYPE_LABELS: Record<string, string> = {
  SENDER: "寄件地址",
  RECEIVER: "收件地址",
};

/** 店主推进履约的动作；金额与状态转换都由服务端裁决。 */
export const KUAIDI_ORDER_ACTIONS = [
  "MARK_PAID",
  "ACCEPT",
  "PICKUP",
  "TRANSIT",
  "DELIVER",
  "COMPLETE",
  "EXCEPTION",
  "CANCEL",
  "REFUND",
] as const;
export type KuaidiOrderAction = (typeof KUAIDI_ORDER_ACTIONS)[number];
export const KUAIDI_ORDER_ACTION_LABELS: Record<string, string> = {
  MARK_PAID: "登记已收款",
  ACCEPT: "接单",
  PICKUP: "已取件",
  TRANSIT: "运输中",
  DELIVER: "已签收",
  COMPLETE: "完成订单",
  EXCEPTION: "标记异常",
  CANCEL: "取消订单",
  REFUND: "登记退款",
};

/**
 * 站点开关（键名即 toggles JSON 的键）：关掉的模块在小程序端整块不渲染。
 * deskChat 关掉后客服入口降级为联系方式名片，不影响 AI 客服本身。
 */
export const KUAIDI_TOGGLE_KEYS = [
  "indexNotice",
  "deskChat",
  "contact",
  "insurance",
  "addressBook",
  "myOrders",
  "protocol",
  "pickupTime",
  "tracking",
] as const;
export type KuaidiToggleKey = (typeof KUAIDI_TOGGLE_KEYS)[number];
export const KUAIDI_TOGGLE_LABELS: Record<string, string> = {
  indexNotice: "首页公告栏",
  deskChat: "在线客服（AI 客服会话）",
  contact: "联系方式名片",
  insurance: "保价服务",
  addressBook: "地址簿",
  myOrders: "「我的订单」（需微信登录）",
  protocol: "寄件协议勾选",
  pickupTime: "预约取件时间",
  tracking: "物流单号与轨迹",
};

/** 内置快递公司模板：建站时铺一份，店主改价即可用。 */
export const KUAIDI_PRESET_COMPANIES = [
  {
    code: "SF",
    name: "顺丰速运",
    firstWeightKg: 1,
    firstPrice: 18,
    extraWeightKg: 1,
    extraPrice: 8,
    deliveryDays: "1-2 天",
    sort: 100,
  },
  {
    code: "JD",
    name: "京东快递",
    firstWeightKg: 1,
    firstPrice: 12,
    extraWeightKg: 1,
    extraPrice: 5,
    deliveryDays: "1-3 天",
    sort: 90,
  },
  {
    code: "ZTO",
    name: "中通快递",
    firstWeightKg: 1,
    firstPrice: 8,
    extraWeightKg: 1,
    extraPrice: 3,
    deliveryDays: "2-4 天",
    sort: 80,
  },
  {
    code: "YTO",
    name: "圆通速递",
    firstWeightKg: 1,
    firstPrice: 8,
    extraWeightKg: 1,
    extraPrice: 3,
    deliveryDays: "2-4 天",
    sort: 70,
  },
  {
    code: "STO",
    name: "申通快递",
    firstWeightKg: 1,
    firstPrice: 8,
    extraWeightKg: 1,
    extraPrice: 3,
    deliveryDays: "2-4 天",
    sort: 60,
  },
  {
    code: "YUNDA",
    name: "韵达快递",
    firstWeightKg: 1,
    firstPrice: 7,
    extraWeightKg: 1,
    extraPrice: 3,
    deliveryDays: "2-4 天",
    sort: 50,
  },
  {
    code: "JTSD",
    name: "极兔速递",
    firstWeightKg: 1,
    firstPrice: 7,
    extraWeightKg: 1,
    extraPrice: 2.5,
    deliveryDays: "2-4 天",
    sort: 40,
  },
  {
    code: "DEPPON",
    name: "德邦快递",
    firstWeightKg: 1,
    firstPrice: 10,
    extraWeightKg: 1,
    extraPrice: 4,
    deliveryDays: "2-4 天",
    sort: 30,
  },
] as const;

export const KUAIDI_DEFAULT_PICKUP_SLOTS = [
  "09:00-12:00",
  "12:00-15:00",
  "15:00-18:00",
  "18:00-20:00",
] as const;

export const KUAIDI_MINI_SCENE = "EXPRESS" satisfies (typeof PRIVATE_MINI_SCENES)[number];

// ---------------------------------------------------------------- 通用结构

export const kuaidiContactSchema = z.object({
  phone: z.string().max(32).default(""),
  wechat: z.string().max(64).default(""),
  email: z.string().max(120).default(""),
});
export type KuaidiContact = z.infer<typeof kuaidiContactSchema>;

export const kuaidiPartySchema = z.object({
  name: z.string().trim().min(1).max(40),
  mobile: z
    .string()
    .trim()
    .regex(/^1[3-9]\d{9}$/, "请输入 11 位手机号"),
  province: z.string().trim().min(1).max(40),
  city: z.string().trim().min(1).max(40),
  district: z.string().trim().min(1).max(40),
  address: z.string().trim().min(1).max(200),
});
export type KuaidiParty = z.infer<typeof kuaidiPartySchema>;

export const kuaidiTogglesSchema = z.object({
  indexNotice: z.boolean().default(true),
  deskChat: z.boolean().default(true),
  contact: z.boolean().default(true),
  insurance: z.boolean().default(true),
  addressBook: z.boolean().default(true),
  myOrders: z.boolean().default(true),
  protocol: z.boolean().default(true),
  pickupTime: z.boolean().default(true),
  tracking: z.boolean().default(true),
});
export type KuaidiToggles = z.infer<typeof kuaidiTogglesSchema>;
export const KUAIDI_DEFAULT_TOGGLES = kuaidiTogglesSchema.parse({});

// ---------------------------------------------------------------- 站点

export const kuaidiSiteSchema = z.object({
  id: z.number(),
  siteCode: z.string(),
  name: z.string(),
  logo: z.string(),
  slogan: z.string(),
  themeColor: z.string(),
  notice: z.string(),
  serviceContact: kuaidiContactSchema,
  /** 寄件点位置：C 端选点、扫码进站与地图导航都用它 */
  province: z.string(),
  city: z.string(),
  district: z.string(),
  addressLine: z.string(),
  /** 经度 / 纬度（WGS-84，地图选点回填）；0 = 未设置 */
  lng: z.number(),
  lat: z.number(),
  businessHours: z.string(),
  phone: z.string(),
  pickupNote: z.string(),
  /** 共用收款账户 id；0 = 用账号下第一个启用账户 */
  payAccountId: z.number(),
  payAccountName: z.string(),
  /** 绑定的 AI 客服（service-desk）服务站 siteKey，空串 = 未绑定 */
  deskSiteKey: z.string(),
  deskSiteName: z.string(),
  toggles: kuaidiTogglesSchema,
  insuranceEnabled: z.boolean(),
  /** 保价费率（如 0.005 = 千分之五），按声明价值计费 */
  insuranceRate: z.number(),
  /** 单件最高保价金额（元），0 = 不限 */
  insuranceMax: money,
  /** 单件最大计费重量（kg），超过时小程序直接拒单 */
  maxWeightKg: z.number(),
  /** 未支付订单保留时长（分钟），到期自动关闭 */
  payMinutes: z.number(),
  pickupSlots: z.array(z.string()),
  protocolText: z.string(),
  status: z.enum(KUAIDI_SITE_STATUSES),
  /** 站点对外地址：登记微信 request / 业务域名时要填它 */
  siteUrl: z.string(),
  companyTotal: z.number(),
  orderTotal: z.number(),
  customerTotal: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type KuaidiSite = z.infer<typeof kuaidiSiteSchema>;

export const kuaidiSiteSaveBodySchema = z.object({
  id: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(120),
  logo: z.string().max(500).default(""),
  slogan: z.string().max(200).default(""),
  themeColor: z.string().trim().max(16).default("#3370FF"),
  notice: z.string().max(500).default(""),
  serviceContact: kuaidiContactSchema.partial().default({}),
  province: z.string().trim().max(40).default(""),
  city: z.string().trim().max(40).default(""),
  district: z.string().trim().max(40).default(""),
  addressLine: z.string().trim().max(200).default(""),
  lng: z.number().min(-180).max(180).default(0),
  lat: z.number().min(-90).max(90).default(0),
  businessHours: z.string().trim().max(80).default(""),
  phone: z.string().trim().max(32).default(""),
  pickupNote: z.string().trim().max(300).default(""),
  payAccountId: z.number().int().min(0).default(0),
  deskSiteKey: z.string().max(64).default(""),
  toggles: kuaidiTogglesSchema.partial().default({}),
  insuranceEnabled: z.boolean().default(true),
  insuranceRate: z.number().min(0).max(0.2).default(0.005),
  insuranceMax: money.default(20000),
  maxWeightKg: z.number().min(0.1).max(1000).default(100),
  payMinutes: z.number().int().min(5).max(1440).default(30),
  pickupSlots: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  protocolText: z.string().max(200_000).default(""),
});
export type KuaidiSiteSaveBody = z.infer<typeof kuaidiSiteSaveBodySchema>;

export const kuaidiSiteStatusBodySchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(["DRAFT", "ONLINE", "CLOSED"]),
  reason: z.string().max(500).default(""),
});

export const kuaidiOverviewSchema = z.object({
  site: kuaidiSiteSchema.nullable(),
  todayOrders: z.number(),
  todayRevenue: money,
  pendingPay: z.number(),
  pendingPickup: z.number(),
  inTransit: z.number(),
  completed: z.number(),
  totalOrders: z.number(),
  totalRevenue: money,
  companyTotal: z.number(),
  customerTotal: z.number(),
  dailyTrend: z.array(
    z.object({ date: z.string(), orders: z.number(), revenue: money }),
  ),
});
export type KuaidiOverview = z.infer<typeof kuaidiOverviewSchema>;

// ---------------------------------------------------------------- 快递公司报价

export const kuaidiCompanySchema = z.object({
  id: z.number(),
  siteId: z.number(),
  code: z.string(),
  name: z.string(),
  logo: z.string(),
  firstWeightKg: z.number(),
  firstPrice: money,
  extraWeightKg: z.number(),
  extraPrice: money,
  /** 偏远地区省份名清单（如 ["新疆","西藏","内蒙古"]），命中加收偏远费 */
  remoteProvinces: z.array(z.string()),
  remoteExtra: money,
  deliveryDays: z.string(),
  remark: z.string(),
  enabled: z.boolean(),
  sort: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type KuaidiCompany = z.infer<typeof kuaidiCompanySchema>;

export const kuaidiCompanySaveBodySchema = z.object({
  id: z.number().int().min(0).default(0),
  siteId: z.number().int().positive(),
  code: z.string().trim().max(20).default(""),
  name: z.string().trim().min(1).max(60),
  logo: z.string().max(500).default(""),
  firstWeightKg: z.number().min(0.1).max(100).default(1),
  firstPrice: money.default(8),
  extraWeightKg: z.number().min(0.1).max(100).default(1),
  extraPrice: money.default(3),
  remoteProvinces: z.array(z.string().trim().min(1).max(20)).max(40).default([]),
  remoteExtra: money.default(0),
  deliveryDays: z.string().trim().max(40).default(""),
  remark: z.string().max(200).default(""),
  enabled: z.boolean().default(true),
  sort: z.number().int().min(-9999).max(9999).default(0),
});
export type KuaidiCompanySaveBody = z.infer<typeof kuaidiCompanySaveBodySchema>;

export const kuaidiCompanyStatusBodySchema = z.object({
  siteId: z.number().int().positive(),
  id: z.number().int().positive(),
  enabled: z.boolean(),
});

// ---------------------------------------------------------------- 报价（公开）

export const kuaidiQuoteInputSchema = z.object({
  site: z.string().trim().max(16).default(""),
  companyId: z.number().int().min(0).default(0),
  weightKg: z.number().min(0.1).max(1000),
  length: z.number().min(0).max(300).default(0),
  width: z.number().min(0).max(300).default(0),
  height: z.number().min(0).max(300).default(0),
  insuredValue: money.default(0),
  province: z.string().trim().max(40).default(""),
});
export type KuaidiQuoteInput = z.infer<typeof kuaidiQuoteInputSchema>;

export const kuaidiQuoteItemSchema = z.object({
  companyId: z.number(),
  code: z.string(),
  name: z.string(),
  logo: z.string(),
  deliveryDays: z.string(),
  firstWeightKg: z.number(),
  firstPrice: money,
  extraWeightKg: z.number(),
  extraPrice: money,
  chargeWeightKg: z.number(),
  baseFee: money,
  extraFee: money,
  remoteFee: money,
  insuranceFee: money,
  totalFee: money,
  remote: z.boolean(),
  remark: z.string(),
});
export type KuaidiQuoteItem = z.infer<typeof kuaidiQuoteItemSchema>;

export const kuaidiQuoteResultSchema = z.object({
  actualWeightKg: z.number(),
  volumeWeightKg: z.number(),
  chargeWeightKg: z.number(),
  insuranceEnabled: z.boolean(),
  insuranceRate: z.number(),
  insuranceMax: money,
  maxWeightKg: z.number(),
  quotes: z.array(kuaidiQuoteItemSchema),
});
export type KuaidiQuoteResult = z.infer<typeof kuaidiQuoteResultSchema>;

// ---------------------------------------------------------------- 地址簿（公开）

export const kuaidiAddressSchema = z.object({
  id: z.number(),
  type: z.enum(KUAIDI_ADDRESS_TYPES),
  name: z.string(),
  mobile: z.string(),
  province: z.string(),
  city: z.string(),
  district: z.string(),
  address: z.string(),
  isDefault: z.boolean(),
  createdAt: z.string(),
});
export type KuaidiAddress = z.infer<typeof kuaidiAddressSchema>;

export const kuaidiAddressSaveBodySchema = z.object({
  site: z.string().trim().max(16).default(""),
  id: z.number().int().min(0).default(0),
  type: z.enum(KUAIDI_ADDRESS_TYPES),
  name: z.string().trim().min(1).max(40),
  mobile: z
    .string()
    .trim()
    .regex(/^1[3-9]\d{9}$/, "请输入 11 位手机号"),
  province: z.string().trim().min(1).max(40),
  city: z.string().trim().min(1).max(40),
  district: z.string().trim().min(1).max(40),
  address: z.string().trim().min(1).max(200),
  isDefault: z.boolean().default(false),
});
export type KuaidiAddressSaveBody = z.infer<typeof kuaidiAddressSaveBodySchema>;

// ---------------------------------------------------------------- 订单

export const kuaidiOrderEventSchema = z.object({
  id: z.number(),
  status: z.enum(KUAIDI_ORDER_STATES),
  statusLabel: z.string(),
  note: z.string(),
  operator: z.string(),
  at: z.string(),
});
export type KuaidiOrderEvent = z.infer<typeof kuaidiOrderEventSchema>;

export const kuaidiOrderSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  orderNo: z.string(),
  companyId: z.number(),
  companyName: z.string(),
  sender: kuaidiPartySchema,
  receiver: kuaidiPartySchema,
  itemName: z.string(),
  itemWeightKg: z.number(),
  itemCount: z.number(),
  length: z.number(),
  width: z.number(),
  height: z.number(),
  volumeWeightKg: z.number(),
  chargeWeightKg: z.number(),
  insuredValue: money,
  baseFee: money,
  extraFee: money,
  remoteFee: money,
  insuranceFee: money,
  totalAmount: money,
  payState: z.enum(KUAIDI_PAY_STATES),
  payMode: z.enum(KUAIDI_PAY_MODES),
  status: z.enum(KUAIDI_ORDER_STATES),
  pickupSlot: z.string(),
  remark: z.string(),
  trackingNo: z.string(),
  cancelReason: z.string(),
  customerId: z.number(),
  openid: z.string(),
  paidAt: z.string(),
  closedAt: z.string(),
  refundedAt: z.string(),
  expireAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type KuaidiOrder = z.infer<typeof kuaidiOrderSchema>;

export const kuaidiOrderDetailSchema = kuaidiOrderSchema.extend({
  events: z.array(kuaidiOrderEventSchema),
  customerNickname: z.string(),
});
export type KuaidiOrderDetail = z.infer<typeof kuaidiOrderDetailSchema>;

export const kuaidiOrderListQuerySchema = z.object({
  siteId: z.coerce.number().int().positive(),
  keyword: z.string().trim().max(60).optional(),
  status: z.enum(KUAIDI_ORDER_STATES).optional(),
  payState: z.enum(KUAIDI_PAY_STATES).optional(),
  from: z.string().trim().max(20).optional(),
  to: z.string().trim().max(20).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type KuaidiOrderListQuery = z.infer<typeof kuaidiOrderListQuerySchema>;

export const kuaidiOrderActionBodySchema = z.object({
  siteId: z.number().int().positive(),
  id: z.number().int().positive(),
  action: z.enum(KUAIDI_ORDER_ACTIONS),
  note: z.string().trim().max(300).default(""),
  trackingNo: z.string().trim().max(64).default(""),
});
export type KuaidiOrderActionBody = z.infer<
  typeof kuaidiOrderActionBodySchema
>;

export const kuaidiCustomerSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  openid: z.string(),
  nickname: z.string(),
  avatar: z.string(),
  orderCount: z.number(),
  paidOrderCount: z.number(),
  totalAmount: money,
  lastOrderAt: z.string().nullable(),
  status: z.boolean(),
  createdAt: z.string(),
});
export type KuaidiCustomer = z.infer<typeof kuaidiCustomerSchema>;

export const kuaidiCustomerListQuerySchema = z.object({
  siteId: z.coerce.number().int().positive(),
  keyword: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type KuaidiCustomerListQuery = z.infer<
  typeof kuaidiCustomerListQuerySchema
>;

// ---------------------------------------------------------------- 发布

export const kuaidiAppTestResultSchema = miniAppTestResultSchema.extend({
  nextAction: z.string().default(""),
  nextPath: z.string().default(""),
  serverIp: z.string().default(""),
});
export type KuaidiAppTestResult = z.infer<typeof kuaidiAppTestResultSchema>;

// ---------------------------------------------------------------- 收款账户（企业级）

/** 已备案企业选项：收款账户归属企业，多个寄件点共用同一个商户号。 */
export const kuaidiEnterpriseSchema = z.object({
  id: z.number(),
  name: z.string(),
  subjectType: z.string(),
});
export type KuaidiEnterprise = z.infer<typeof kuaidiEnterpriseSchema>;

export const kuaidiPayAccountSchema = z.object({
  id: z.number(),
  name: z.string(),
  enterpriseId: z.number(),
  enterpriseName: z.string(),
  mchId: z.string(),
  certSerial: z.string(),
  keyConfigured: z.boolean(),
  certConfigured: z.boolean(),
  enabled: z.boolean(),
  /** 商户号 + APIv3 密钥 + 证书私钥齐全才算可用 */
  complete: z.boolean(),
  updatedAt: z.string(),
});
export type KuaidiPayAccount = z.infer<typeof kuaidiPayAccountSchema>;

export const kuaidiPayAccountSaveBodySchema = z.object({
  id: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(80),
  /** 0 = 不绑定企业（个人主体） */
  enterpriseId: z.number().int().min(0).default(0),
  mchId: z.string().trim().min(1).max(64),
  /** 留空保留原密钥，密钥只写不读 */
  apiV3Key: z.string().max(128).optional(),
  certSerial: z.string().trim().max(128).default(""),
  privateKey: z.string().max(8192).optional(),
  enabled: z.boolean().default(true),
});
export type KuaidiPayAccountSaveBody = z.infer<
  typeof kuaidiPayAccountSaveBodySchema
>;

// ---------------------------------------------------------------- 平台侧

export const kuaidiAdminSettingsSchema = z.object({
  enabled: z.boolean(),
  payAllowed: z.boolean(),
  siteTotal: z.number(),
  onlineSiteTotal: z.number(),
  orderTotal: z.number(),
  revenueTotal: money,
  updatedAt: z.string(),
});
export type KuaidiAdminSettings = z.infer<typeof kuaidiAdminSettingsSchema>;

export const kuaidiAdminSettingsBodySchema = z.object({
  enabled: z.boolean().default(true),
  payAllowed: z.boolean().default(true),
});
export type KuaidiAdminSettingsBody = z.infer<
  typeof kuaidiAdminSettingsBodySchema
>;

export const kuaidiMetaSchema = z.object({
  scene: z.enum(PRIVATE_MINI_SCENES),
  siteStatusLabels: z.record(z.string(), z.string()),
  orderStateLabels: z.record(z.string(), z.string()),
  payStateLabels: z.record(z.string(), z.string()),
  payModeLabels: z.record(z.string(), z.string()),
  addressTypeLabels: z.record(z.string(), z.string()),
  actionLabels: z.record(z.string(), z.string()),
  toggleLabels: z.record(z.string(), z.string()),
  toggleKeys: z.array(z.string()),
  limits: z.object({
    enabled: z.boolean(),
    payAllowed: z.boolean(),
  }),
});
export type KuaidiMeta = z.infer<typeof kuaidiMetaSchema>;

// ---------------------------------------------------------------- C 端（公开通道）结构体

export const kuaidiPublicBootstrapSchema = z.object({
  siteId: z.number(),
  siteCode: z.string(),
  name: z.string(),
  logo: z.string(),
  slogan: z.string(),
  themeColor: z.string(),
  notice: z.string(),
  addressLine: z.string(),
  businessHours: z.string(),
  phone: z.string(),
  pickupNote: z.string(),
  toggles: kuaidiTogglesSchema,
  contact: kuaidiContactSchema,
  deskSiteKey: z.string(),
  deskEmbedUrl: z.string(),
  protocolEnabled: z.boolean(),
  protocolText: z.string(),
  insuranceEnabled: z.boolean(),
  insuranceRate: z.number(),
  insuranceMax: money,
  maxWeightKg: z.number(),
  pickupSlots: z.array(z.string()),
  companies: z.array(kuaidiQuoteItemSchema.pick({ companyId: true }).extend({
    code: z.string(),
    name: z.string(),
    logo: z.string(),
    deliveryDays: z.string(),
    firstWeightKg: z.number(),
    firstPrice: money,
    extraWeightKg: z.number(),
    extraPrice: money,
    remoteProvinces: z.array(z.string()),
    remoteExtra: money,
    remark: z.string(),
  })),
});
export type KuaidiPublicBootstrap = z.infer<
  typeof kuaidiPublicBootstrapSchema
>;

/** C 端寄件点列表：一个账号一部小程序，进店先选寄件点（或扫码带 site 直接进）。 */
export const kuaidiPublicSiteSchema = z.object({
  siteCode: z.string(),
  name: z.string(),
  province: z.string(),
  city: z.string(),
  district: z.string(),
  addressLine: z.string(),
  lng: z.number(),
  lat: z.number(),
  businessHours: z.string(),
  phone: z.string(),
});
export type KuaidiPublicSite = z.infer<typeof kuaidiPublicSiteSchema>;

export const kuaidiPublicLoginBodySchema = z.object({
  site: z.string().trim().max(16).default(""),
  code: z.string().trim().max(128).default(""),
});
export type KuaidiPublicLoginBody = z.infer<typeof kuaidiPublicLoginBodySchema>;

export const kuaidiPublicLoginResultSchema = z.object({
  token: z.string(),
  customerId: z.number(),
  nickname: z.string(),
  avatar: z.string(),
});
export type KuaidiPublicLoginResult = z.infer<
  typeof kuaidiPublicLoginResultSchema
>;

export const kuaidiPublicOrderCreateBodySchema = z.object({
  site: z.string().trim().max(16).default(""),
  companyId: z.number().int().positive(),
  sender: kuaidiPartySchema,
  receiver: kuaidiPartySchema,
  itemName: z.string().trim().min(1).max(80),
  itemWeightKg: z.number().min(0.1).max(1000),
  itemCount: z.number().int().min(1).max(999).default(1),
  length: z.number().min(0).max(300).default(0),
  width: z.number().min(0).max(300).default(0),
  height: z.number().min(0).max(300).default(0),
  insuredValue: money.default(0),
  pickupSlot: z.string().trim().max(40).default(""),
  remark: z.string().trim().max(300).default(""),
  agreed: z.boolean().default(false),
});
export type KuaidiPublicOrderCreateBody = z.infer<
  typeof kuaidiPublicOrderCreateBodySchema
>;

export const kuaidiPublicPayParamsSchema = z.object({
  timeStamp: z.string(),
  nonceStr: z.string(),
  package: z.string(),
  signType: z.string(),
  paySign: z.string(),
});
export type KuaidiPublicPayParams = z.infer<
  typeof kuaidiPublicPayParamsSchema
>;

export const kuaidiPublicOrderCreatedSchema = z.object({
  orderNo: z.string(),
  totalAmount: money,
  payMode: z.enum(KUAIDI_PAY_MODES),
  payParams: kuaidiPublicPayParamsSchema.nullable(),
  /** 待支付订单的到期时间，端上据此提示 */
  expireAt: z.string(),
  message: z.string(),
});
export type KuaidiPublicOrderCreated = z.infer<
  typeof kuaidiPublicOrderCreatedSchema
>;

export const kuaidiPublicRepayBodySchema = z.object({
  site: z.string().trim().max(16).default(""),
  orderNo: z.string().trim().min(1).max(40),
  mobile: z.string().trim().max(20).default(""),
});
export type KuaidiPublicRepayBody = z.infer<
  typeof kuaidiPublicRepayBodySchema
>;

export const kuaidiPublicOrderQuerySchema = z.object({
  site: z.string().trim().max(16).default(""),
  orderNo: z.string().trim().max(40).default(""),
  mobile: z.string().trim().max(20).default(""),
});

export const kuaidiPublicOrderSchema = kuaidiOrderSchema.extend({
  events: z.array(kuaidiOrderEventSchema),
});
export type KuaidiPublicOrder = z.infer<typeof kuaidiPublicOrderSchema>;

export const kuaidiPublicCancelBodySchema = z.object({
  site: z.string().trim().max(16).default(""),
  orderNo: z.string().trim().min(1).max(40),
  mobile: z.string().trim().max(20).default(""),
});
export type KuaidiPublicCancelBody = z.infer<
  typeof kuaidiPublicCancelBodySchema
>;

// ---------------------------------------------------------------- 端点清单

/**
 * 一律用 query 传 id、不用路径参数：Hono 按注册顺序匹配，静态段会被先注册的
 * `:param` 兄弟路径吃掉，本模块从源头规避。
 */
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

const siteQuery = <T extends z.ZodRawShape>(extra: T) =>
  z.object({ siteId: z.coerce.number().int().positive(), ...extra });
const siteIdBody = <T extends z.ZodRawShape>(extra: T) =>
  z.object({ siteId: z.number().int().positive(), ...extra });

export const kuaidiAppSaveBodySchema = miniAppInputSchema;
export type KuaidiAppSaveBody = z.infer<typeof kuaidiAppSaveBodySchema>;

/**
 * 快递寄件小程序工具端点：`Kuaidi_` 店主侧（`/enterprise/kuaidi/**`）、
 * `KuaidiAdmin_` 平台侧（`/enterprise/admin/kuaidi/**`），由 `moduleHandlers`
 * 按 operationId 后缀自动挂到控制器同名方法上。
 */
export const kuaidiEndpoints = {
  // ---------- 元信息与概览 ----------
  Kuaidi_meta: get("/enterprise/kuaidi/meta", emptyQuery, kuaidiMetaSchema),
  Kuaidi_overview: get(
    "/enterprise/kuaidi/overview",
    siteQuery({}),
    kuaidiOverviewSchema,
  ),

  // ---------- 站点 ----------
  Kuaidi_sites: get(
    "/enterprise/kuaidi/site/list",
    emptyQuery,
    z.array(kuaidiSiteSchema),
  ),
  Kuaidi_siteCreate: post(
    "/enterprise/kuaidi/site/create",
    kuaidiSiteSaveBodySchema,
    kuaidiSiteSchema,
  ),
  Kuaidi_siteDetail: get(
    "/enterprise/kuaidi/site/detail",
    siteQuery({}),
    kuaidiSiteSchema,
  ),
  Kuaidi_siteSave: post(
    "/enterprise/kuaidi/site/save",
    kuaidiSiteSaveBodySchema,
    kuaidiSiteSchema,
  ),
  Kuaidi_siteStatus: post(
    "/enterprise/kuaidi/site/status",
    kuaidiSiteStatusBodySchema,
    kuaidiSiteSchema,
  ),
  Kuaidi_siteRemove: post(
    "/enterprise/kuaidi/site/remove",
    z.object({ siteId: z.number().int().positive() }),
    okResult,
  ),

  // ---------- 小程序主体凭据（账号级：一个账号一部小程序，底座 scene=EXPRESS / shopId=0）----------
  Kuaidi_appDetail: get(
    "/enterprise/kuaidi/app/detail",
    emptyQuery,
    miniAppViewSchema,
  ),
  Kuaidi_appSave: post(
    "/enterprise/kuaidi/app/save",
    kuaidiAppSaveBodySchema,
    miniAppViewSchema,
  ),
  Kuaidi_appTest: post(
    "/enterprise/kuaidi/app/test",
    z.object({}),
    kuaidiAppTestResultSchema,
  ),
  Kuaidi_qrcodeGenerate: post(
    "/enterprise/kuaidi/app/qrcode",
    z.object({ path: z.string().max(120).default("") }),
    miniAppViewSchema,
  ),

  // ---------- 收款账户（企业级，多寄件点共用）----------
  Kuaidi_enterprises: get(
    "/enterprise/kuaidi/pay/enterprise/list",
    emptyQuery,
    z.array(kuaidiEnterpriseSchema),
  ),
  Kuaidi_payAccounts: get(
    "/enterprise/kuaidi/pay/account/list",
    emptyQuery,
    z.array(kuaidiPayAccountSchema),
  ),
  Kuaidi_payAccountSave: post(
    "/enterprise/kuaidi/pay/account/save",
    kuaidiPayAccountSaveBodySchema,
    kuaidiPayAccountSchema,
  ),
  Kuaidi_payAccountRemove: post(
    "/enterprise/kuaidi/pay/account/remove",
    z.object({ id: z.number().int().positive() }),
    okResult,
  ),
  Kuaidi_payAccountTest: post(
    "/enterprise/kuaidi/pay/account/test",
    z.object({ id: z.number().int().positive() }),
    z.object({ ok: z.boolean(), message: z.string() }),
  ),

  // ---------- 快递公司报价 ----------
  Kuaidi_companies: get(
    "/enterprise/kuaidi/company/list",
    siteQuery({}),
    z.array(kuaidiCompanySchema),
  ),
  Kuaidi_companySave: post(
    "/enterprise/kuaidi/company/save",
    kuaidiCompanySaveBodySchema,
    kuaidiCompanySchema,
  ),
  Kuaidi_companyStatus: post(
    "/enterprise/kuaidi/company/status",
    kuaidiCompanyStatusBodySchema,
    kuaidiCompanySchema,
  ),
  Kuaidi_companyRemove: post(
    "/enterprise/kuaidi/company/remove",
    siteIdBody({ id: z.number().int().positive() }),
    okResult,
  ),

  // ---------- 订单与履约 ----------
  Kuaidi_orders: get(
    "/enterprise/kuaidi/order/list",
    kuaidiOrderListQuerySchema,
    pageSchema(kuaidiOrderSchema),
  ),
  Kuaidi_orderDetail: get(
    "/enterprise/kuaidi/order/detail",
    siteQuery({ id: z.coerce.number().int().positive() }),
    kuaidiOrderDetailSchema,
  ),
  Kuaidi_orderAction: post(
    "/enterprise/kuaidi/order/action",
    kuaidiOrderActionBodySchema,
    z.object({ ok: z.boolean(), message: z.string(), order: kuaidiOrderSchema }),
  ),

  // ---------- 顾客 ----------
  Kuaidi_customers: get(
    "/enterprise/kuaidi/customer/list",
    kuaidiCustomerListQuerySchema,
    pageSchema(kuaidiCustomerSchema),
  ),
  Kuaidi_customerStatus: post(
    "/enterprise/kuaidi/customer/status",
    siteIdBody({ id: z.number().int().positive(), status: z.boolean() }),
    okResult,
  ),

  // ---------- 平台侧 ----------
  KuaidiAdmin_settings: get(
    "/enterprise/admin/kuaidi/settings",
    emptyQuery,
    kuaidiAdminSettingsSchema,
  ),
  KuaidiAdmin_saveSettings: post(
    "/enterprise/admin/kuaidi/settings/save",
    kuaidiAdminSettingsBodySchema,
    kuaidiAdminSettingsSchema,
  ),
};
