import { z } from "zod";
import { pageQuerySchema, pageSchema } from "./pagination";
import {
  miniAppInputSchema,
  miniAppTestResultSchema,
  miniAppViewSchema,
  miniTemplateInfoSchema,
} from "./private-mini";

const envelope = <T extends z.ZodType>(data: T) =>
  z.object({ code: z.number(), message: z.string(), data: data.nullable() });
const emptyQuery = z.object({});

/**
 * 工作台 · 建站管理 · 上门服务小程序工具。
 *
 * 每个本站用户可建立一套自己的上门服务平台：定义服务与服务人员、排期与车费口径、
 * 接单与四步打卡履约、售后与评价、一键报警，并把模板小程序（仓库 `miniprogram-onsite/`）
 * 按当前模板输出统一源码包——用户下载后用微信开发者工具填参数、编译、上传
 * （提审发布仍在用户自己的微信公众平台完成，平台不代编译、不代传）。
 *
 * C 端顾客与技师侧只走免登录公开通道 `/api/public/onsite/*`（独立顾客令牌，
 * 与站内 User 物理隔离），不进 JSON 契约与 OpenAPI。
 * 参考源码的业务口径见 docs/建站管理·上门服务小程序工具设计方案.md，代码全部重写。
 */

/** 派单模式：指定技师自接单，或平台（店主）统一派单。 */
export const ONSITE_DISPATCH_MODES = ["STAFF", "PLATFORM"] as const;
export type OnsiteDispatchMode = (typeof ONSITE_DISPATCH_MODES)[number];
export const ONSITE_DISPATCH_MODE_LABELS: Record<string, string> = {
  STAFF: "技师自接单",
  PLATFORM: "店铺统一派单",
};

/** 店铺状态：草稿 → 营业中；SUSPENDED 为平台停服（数据保留）。 */
export const ONSITE_SHOP_STATUSES = ["DRAFT", "ONLINE", "SUSPENDED", "CLOSED"] as const;
export type OnsiteShopStatus = (typeof ONSITE_SHOP_STATUSES)[number];
export const ONSITE_SHOP_STATUS_LABELS: Record<string, string> = {
  DRAFT: "未上线",
  ONLINE: "营业中",
  SUSPENDED: "平台停服",
  CLOSED: "已关闭",
};

/** 时间片粒度（分钟）：与参考源码 `time_unit` 同语义，默认 30，端上按 5 的倍数给选项。 */
export const ONSITE_TIME_UNITS = [5, 10, 15, 30, 60] as const;
const timeUnitSchema = z.number().int().min(5).max(60).multipleOf(5).default(30);

export const onsiteTradeSchema = z.object({
  /** 未付款自动取消分钟数（参考源码 S_config.over_time）。 */
  autoCancelMinutes: z.number().int().min(1).max(120).default(15),
  /** 可约时间片粒度。 */
  timeUnitMinutes: timeUnitSchema,
  /** 前后缓冲分钟：占用判定时把已订区间外扩（参考源码 time_interval）。 */
  bufferMinutes: z.number().int().min(0).max(120).default(15),
  /** 最多可约到第几天。 */
  maxDays: z.number().int().min(1).max(60).default(7),
  /** 允许跨零点夜班（可服务时段 end < start 视为跨天）。 */
  allowCrossDay: z.boolean().default(false),
  /** 最少提前预约分钟数（防止下单即开始）。 */
  bookingLeadMinutes: z.number().int().min(0).max(1440).default(30),
  dispatchMode: z.enum(ONSITE_DISPATCH_MODES).default("STAFF"),
  /** 完成后多少小时可提现（参考源码 can_tx_time，默认 24）。 */
  canTxHours: z.number().int().min(0).max(168).default(24),
  /** 是否收取车费。 */
  travelFeeEnabled: z.boolean().default(true),
  /** 距离算不出时的兜底车费（分），0 = 不兜底。 */
  travelFeeFallbackCents: z.number().int().min(0).max(1000000).default(0),
  /** 是否允许顾客评价已完成订单。 */
  reviewEnabled: z.boolean().default(true),
  /** 评价先审后展示：开启后新评价落 PENDING，店主在评价页放行才计分。 */
  reviewAuditFirst: z.boolean().default(false),
  /** 一键报警入口（服务人员安全兜底，默认开）。 */
  alertEnabled: z.boolean().default(true),
  /** 求救外呼号码（一期只留痕，短信/语音通道随 P4 虚拟号接入）。 */
  alertHelpPhones: z.array(z.string().trim().max(32)).max(10).default([]),
  /** 求救是否站内提醒店主。 */
  alertNotifyOwner: z.boolean().default(true),
  /** 同一技师重复报警的去重窗口（分钟），防误触刷屏。 */
  alertDedupeMinutes: z.number().int().min(1).max(120).default(10),
  /**
   * 在线客服：绑定本站 AI 客服（service-desk）站点的 siteKey，空串＝未绑定。
   * 只存引用，不在本域建会话表；与 SCRM 活码互不依赖。
   */
  deskSiteKey: z.string().trim().max(48).default(""),
  /** 小程序是否展示在线客服入口（只看本项与客服站点自身可用性）。 */
  deskEnabled: z.boolean().default(true),
  /** 私域对接：绑定营销工具·企业微信 SCRM 的活码 id，0＝未绑定。与客服互不依赖。 */
  scrmCodeId: z.number().int().min(0).max(1000000).default(0),
  /** 小程序是否展示「添加专属顾问」入口（只看本项与活码自身可用性）。 */
  scrmEnabled: z.boolean().default(true),
});
export type OnsiteTrade = z.infer<typeof onsiteTradeSchema>;

export const onsiteThemeSchema = z.object({
  themeColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "主题色需为 #RRGGBB")
    .default("#3370ff"),
  navigationTitle: z.string().trim().max(30).default("上门服务"),
  /** tabBar 四项文案（顺序固定：首页 / 服务 / 订单 / 我的）。 */
  tabBarLabels: z
    .array(z.string().trim().min(1).max(8))
    .min(4)
    .max(4)
    .default(["首页", "服务", "订单", "我的"]),
});
export type OnsiteTheme = z.infer<typeof onsiteThemeSchema>;

export const onsiteShopRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  shopCode: z.string(),
  logo: z.string(),
  slogan: z.string(),
  servicePhone: z.string(),
  status: z.enum(ONSITE_SHOP_STATUSES),
  shareImage: z.string(),
  theme: onsiteThemeSchema,
  trade: onsiteTradeSchema,
  /** 该店是否已配小程序主体（引导用）。 */
  appConfigured: z.boolean(),
  payEnabled: z.boolean(),
  offReason: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type OnsiteShopRow = z.infer<typeof onsiteShopRowSchema>;

export const onsiteShopInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slogan: z.string().trim().max(120).default(""),
  logo: z.string().trim().max(500).default(""),
  servicePhone: z.string().trim().max(32).default(""),
  shareImage: z.string().trim().max(500).default(""),
});
export type OnsiteShopInput = z.infer<typeof onsiteShopInputSchema>;

/** 开通引导：每一项都带页面链接，缺前置条件时必须给出可操作入口。 */
export const onsiteGuideStepSchema = z.object({
  key: z.string(),
  label: z.string(),
  desc: z.string(),
  done: z.boolean(),
  href: z.string().default(""),
  action: z.string().default(""),
});
export type OnsiteGuideStep = z.infer<typeof onsiteGuideStepSchema>;

export const onsiteOverviewSchema = z.object({
  hasShop: z.boolean(),
  shop: onsiteShopRowSchema.nullable(),
  steps: z.array(onsiteGuideStepSchema),
  /** 板块被平台关闭时为 false，页面给出停用提示而非报错。 */
  open: z.boolean(),
});
export type OnsiteOverview = z.infer<typeof onsiteOverviewSchema>;

export const onsitePlatformSettingsSchema = z.object({
  /** 板块总开关：关闭后菜单入口隐藏、下单只读。 */
  enabled: z.boolean(),
  /** 是否允许用户在小程序里在线收款（未开时下单走线下标记）。 */
  allowOnlinePay: z.boolean(),
  /** 新店铺默认交易参数模板（用户可在店铺内改）。 */
  defaultTrade: onsiteTradeSchema,
  template: miniTemplateInfoSchema,
  shopCount: z.number(),
  updatedAt: z.string(),
});
export type OnsitePlatformSettings = z.infer<
  typeof onsitePlatformSettingsSchema
>;

export const onsitePlatformSettingsInputSchema = z.object({
  enabled: z.boolean().default(false),
  allowOnlinePay: z.boolean().default(true),
  /** 新店铺默认交易参数模板；缺省表示沿用本站内置默认。 */
  defaultTrade: onsiteTradeSchema.optional(),
});
export type OnsitePlatformSettingsInput = z.infer<
  typeof onsitePlatformSettingsInputSchema
>;

/** 平台侧店铺台账行：带归属账号与店铺体量概览。 */
export const onsiteAdminShopRowSchema = z.object({
  id: z.number(),
  ownerUserId: z.string(),
  ownerUsername: z.string(),
  name: z.string(),
  shopCode: z.string(),
  status: z.enum(ONSITE_SHOP_STATUSES),
  appId: z.string(),
  payEnabled: z.boolean(),
  offBy: z.string(),
  offReason: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type OnsiteAdminShopRow = z.infer<typeof onsiteAdminShopRowSchema>;

/** 店铺内通用状态开关（服务/技师/内容等后续批次共用一套出参）。 */
export const onsiteStatusInputSchema = z.object({
  status: z.string().trim().min(1).max(24),
  reason: z.string().trim().max(200).default(""),
});

const onsiteCoreEndpoints = {
  // ---------- 店主侧 ----------
  Onsite_overview: {
    method: "get" as const,
    path: "/enterprise/onsite/overview",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(onsiteOverviewSchema),
  },
  Onsite_shops: {
    method: "get" as const,
    path: "/enterprise/onsite/shops",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ list: z.array(onsiteShopRowSchema) })),
  },
  Onsite_createShop: {
    method: "post" as const,
    path: "/enterprise/onsite/shops",
    params: z.object({}),
    query: emptyQuery,
    body: onsiteShopInputSchema,
    response: envelope(onsiteShopRowSchema),
  },
  /** 店铺详情：P0 只做基础资料 + 引导，后续批次在同一页面挂各业务页签。 */
  Onsite_shopDetail: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(onsiteShopRowSchema),
  },
  Onsite_updateShop: {
    method: "put" as const,
    path: "/enterprise/onsite/shops/:id",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: onsiteShopInputSchema,
    response: envelope(onsiteShopRowSchema),
  },
  /** 关闭店铺（软删）：状态置 CLOSED，数据保留，之后可重新开通一家。 */
  Onsite_closeShop: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/close",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.object({ reason: z.string().trim().max(200).default("") }),
    response: envelope(onsiteShopRowSchema),
  },
  Onsite_saveTrade: {
    method: "put" as const,
    path: "/enterprise/onsite/shops/:id/trade",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: onsiteTradeSchema,
    response: envelope(onsiteShopRowSchema),
  },
  Onsite_saveTheme: {
    method: "put" as const,
    path: "/enterprise/onsite/shops/:id/theme",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: onsiteThemeSchema,
    response: envelope(onsiteShopRowSchema),
  },
  /** 店铺上线/下线（店主自助，与平台停服分开：SUSPENDED 只能平台侧解）。 */
  Onsite_setStatus: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/status",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: onsiteStatusInputSchema,
    response: envelope(onsiteShopRowSchema),
  },

  // ---------- 小程序主体与支付凭据 ----------
  Onsite_wechat: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/wechat",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(miniAppViewSchema),
  },
  Onsite_saveWechat: {
    method: "put" as const,
    path: "/enterprise/onsite/shops/:id/wechat",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: miniAppInputSchema,
    response: envelope(miniAppViewSchema),
  },
  /** 凭据自检：用该店 AppID / AppSecret 取一次 access_token。 */
  Onsite_testWechat: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/wechat/test",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.object({}),
    response: envelope(miniAppTestResultSchema),
  },

  /** 小程序码：用该店凭据生成无限制码（scene = 店铺码），落主体记录。 */
  Onsite_qrcode: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/qrcode",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.object({ page: z.string().trim().max(120).default("") }),
    response: envelope(z.object({ qrcodeUrl: z.string() })),
  },

  // ---------- 平台侧 ----------
  OnsiteAdmin_shops: {
    method: "get" as const,
    path: "/enterprise/admin/onsite/shops",
    params: z.object({}),
    query: pageQuerySchema.extend({
      keyword: z.string().default(""),
      status: z.string().default("all"),
    }),
    body: z.undefined(),
    response: envelope(pageSchema(onsiteAdminShopRowSchema)),
  },
  OnsiteAdmin_suspendShop: {
    method: "post" as const,
    path: "/enterprise/admin/onsite/shops/:id/suspend",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.object({ reason: z.string().trim().max(500).default("") }),
    response: envelope(onsiteAdminShopRowSchema),
  },
  OnsiteAdmin_resumeShop: {
    method: "post" as const,
    path: "/enterprise/admin/onsite/shops/:id/resume",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.object({}),
    response: envelope(onsiteAdminShopRowSchema),
  },
  OnsiteAdmin_settings: {
    method: "get" as const,
    path: "/enterprise/admin/onsite/settings",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(onsitePlatformSettingsSchema),
  },
  OnsiteAdmin_saveSettings: {
    method: "put" as const,
    path: "/enterprise/admin/onsite/settings",
    params: z.object({}),
    query: emptyQuery,
    body: onsitePlatformSettingsInputSchema,
    response: envelope(onsitePlatformSettingsSchema),
  },
} as const;

// ============================================================================
// P1-1 服务目录 / 服务人员与排期 / 城市与车费 / 内容与自定义表单（契约）
// 金额一律以「分」为单位进出契约：浮点金额在算价、退款、分账三处最容易对不平，
// 端上与后端都只在展示层除 100，计算链路上不出现小数。
// ============================================================================

export const ONSITE_SERVICE_STATUSES = ["DRAFT", "ONLINE", "OFFLINE"] as const;
export type OnsiteServiceStatus = (typeof ONSITE_SERVICE_STATUSES)[number];
export const ONSITE_SERVICE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  ONLINE: "已上架",
  OFFLINE: "已下架",
};

export const ONSITE_TRAVEL_FEE_MODES = ["CITY", "CUSTOM"] as const;
export const ONSITE_TRAVEL_FEE_SOURCE_LABELS: Record<string, string> = {
  DRIVING: "驾车距离",
  STRAIGHT: "直线距离",
  STAFF_FEE: "技师自定车费",
  SERVICE_FIXED: "服务固定车费",
  FALLBACK: "兜底金额",
  SKIPPED: "未计费",
};

export const ONSITE_LABEL_TYPES = ["FEATURE", "REVIEW"] as const;
export const ONSITE_LABEL_TYPE_LABELS: Record<string, string> = {
  FEATURE: "服务特性",
  REVIEW: "评价词",
};

export const ONSITE_STAFF_STATUSES = [
  "PENDING",
  "ONLINE",
  "OFF_DUTY",
  "SUSPENDED",
  "LEFT",
] as const;
export type OnsiteStaffStatus = (typeof ONSITE_STAFF_STATUSES)[number];
export const ONSITE_STAFF_STATUS_LABELS: Record<string, string> = {
  PENDING: "待审核",
  ONLINE: "在岗",
  OFF_DUTY: "休息",
  SUSPENDED: "停用",
  LEFT: "已离场",
};

export const ONSITE_ARTICLE_STATUSES = ["DRAFT", "PUBLISHED", "OFFLINE"] as const;
export const ONSITE_FORM_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "select",
  "phone",
  "idcard",
  "date",
  "region",
] as const;
export const ONSITE_FORM_FIELD_TYPE_LABELS: Record<string, string> = {
  text: "单行文本",
  textarea: "多行文本",
  number: "数字",
  select: "单选",
  phone: "手机号",
  idcard: "身份证号",
  date: "日期",
  region: "省市区的",
};

/** 链接对象：轮播位与内容位共用，type=NONE 表示不跳转。 */
export const onsiteLinkSchema = z.object({
  type: z
    .enum(["NONE", "SERVICE", "CATEGORY", "STAFF", "ARTICLE", "WEBVIEW"])
    .default("NONE"),
  value: z.string().trim().max(300).default(""),
});
export type OnsiteLink = z.infer<typeof onsiteLinkSchema>;

// ---------- 分类 ----------

export const onsiteCategoryRowSchema = z.object({
  id: z.number(),
  parentId: z.number(),
  name: z.string(),
  image: z.string(),
  sortOrder: z.number(),
  enabled: z.boolean(),
  /** 该分类下已挂的服务数：删除分类前界面要能提示「先移走」。 */
  serviceCount: z.number(),
});
export type OnsiteCategoryRow = z.infer<typeof onsiteCategoryRowSchema>;

export const onsiteCategoryInputSchema = z.object({
  id: z.number().int().optional(),
  parentId: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(60),
  image: z.string().trim().max(500).default(""),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  enabled: z.boolean().default(true),
});
export type OnsiteCategoryInput = z.infer<typeof onsiteCategoryInputSchema>;

// ---------- 服务 ----------

export const onsiteServiceRowSchema = z.object({
  id: z.number(),
  title: z.string(),
  subtitle: z.string(),
  coverImage: z.string(),
  images: z.array(z.string()),
  detail: z.string(),
  priceCents: z.number(),
  marketPriceCents: z.number(),
  durationMinutes: z.number(),
  maxDurationMinutes: z.number(),
  addonEnabled: z.boolean(),
  addonUnitMinutes: z.number(),
  /** 加钟费率百分比：100 = 按原价加收一个单位时长。 */
  addonRate: z.number(),
  materialFeeCents: z.number(),
  travelFeeMode: z.enum(ONSITE_TRAVEL_FEE_MODES),
  customTravelFeeCents: z.number(),
  highlights: z.array(z.string()),
  doorEnabled: z.boolean(),
  storeEnabled: z.boolean(),
  status: z.enum(ONSITE_SERVICE_STATUSES),
  sortOrder: z.number(),
  salesVirtual: z.number(),
  salesTrue: z.number(),
  rating: z.number(),
  reviewCount: z.number(),
  categoryIds: z.array(z.number()),
  /** 已配置差异价的技师数（列表页用来提示「几个人可服务」）。 */
  staffCount: z.number(),
  updatedAt: z.string(),
});
export type OnsiteServiceRow = z.infer<typeof onsiteServiceRowSchema>;

export const onsiteServiceInputSchema = z.object({
  id: z.number().int().optional(),
  title: z.string().trim().min(2).max(120),
  subtitle: z.string().trim().max(160).default(""),
  coverImage: z.string().trim().max(500).default(""),
  images: z.array(z.string().max(500)).max(12).default([]),
  detail: z.string().max(60000).default(""),
  priceCents: z.number().int().min(0).max(99999999),
  marketPriceCents: z.number().int().min(0).max(99999999).default(0),
  durationMinutes: z.number().int().min(5).max(1440),
  maxDurationMinutes: z.number().int().min(0).max(2880).default(0),
  addonEnabled: z.boolean().default(true),
  addonUnitMinutes: z.number().int().min(5).max(240).default(30),
  addonRate: z.number().min(0).max(300).default(100),
  materialFeeCents: z.number().int().min(0).max(9999999).default(0),
  travelFeeMode: z.enum(ONSITE_TRAVEL_FEE_MODES).default("CITY"),
  customTravelFeeCents: z.number().int().min(0).max(999999).default(0),
  labelIds: z.array(z.number().int()).max(12).default([]),
  categoryIds: z.array(z.number().int()).max(8).default([]),
  doorEnabled: z.boolean().default(true),
  storeEnabled: z.boolean().default(false),
  status: z.enum(ONSITE_SERVICE_STATUSES).default("DRAFT"),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  salesVirtual: z.number().int().min(0).max(999999).default(0),
});
export type OnsiteServiceInput = z.infer<typeof onsiteServiceInputSchema>;

export const onsiteServiceStatusInputSchema = z.object({
  ids: z.array(z.number().int()).min(1).max(100),
  status: z.enum(ONSITE_SERVICE_STATUSES),
});
export type OnsiteServiceStatusInput = z.infer<typeof onsiteServiceStatusInputSchema>;

export const onsiteServiceQuerySchema = pageQuerySchema.extend({
  status: z.string().default("all"),
  keyword: z.string().default(""),
  categoryId: z.string().default(""),
  staffId: z.string().default(""),
});

export const onsiteStaffPriceRowSchema = z.object({
  staffId: z.number(),
  name: z.string(),
  phone: z.string(),
  priceCents: z.number(),
  durationMinutes: z.number(),
  /** false = 沿用服务价格（未单独定价） */
  priced: z.boolean(),
});
export type OnsiteStaffPriceRow = z.infer<typeof onsiteStaffPriceRowSchema>;

export const onsiteStaffPricesInputSchema = z.object({
  rows: z
    .array(
      z.object({
        staffId: z.number().int().positive(),
        priceCents: z.number().int().min(0).max(99999999),
        durationMinutes: z.number().int().min(0).max(1440).default(0),
      }),
    )
    .max(200),
});

// ---------- 标签与轮播 ----------

export const onsiteLabelRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.enum(ONSITE_LABEL_TYPES),
  sortOrder: z.number(),
  enabled: z.boolean(),
  usageCount: z.number(),
});
export type OnsiteLabelRow = z.infer<typeof onsiteLabelRowSchema>;

export const onsiteLabelInputSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().trim().min(1).max(40),
  type: z.enum(ONSITE_LABEL_TYPES).default("FEATURE"),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  enabled: z.boolean().default(true),
});
export type OnsiteLabelInput = z.infer<typeof onsiteLabelInputSchema>;

export const onsiteBannerRowSchema = z.object({
  id: z.number(),
  position: z.string(),
  title: z.string(),
  image: z.string(),
  link: onsiteLinkSchema,
  sortOrder: z.number(),
  enabled: z.boolean(),
});
export type OnsiteBannerRow = z.infer<typeof onsiteBannerRowSchema>;

export const onsiteBannerInputSchema = z.object({
  id: z.number().int().optional(),
  position: z.string().trim().max(20).default("HOME"),
  title: z.string().trim().max(80).default(""),
  image: z.string().trim().max(500),
  link: onsiteLinkSchema.default({ type: "NONE", value: "" }),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  enabled: z.boolean().default(true),
});
export type OnsiteBannerInput = z.infer<typeof onsiteBannerInputSchema>;

// ---------- 服务人员 ----------

export const onsiteStaffRowSchema = z.object({
  id: z.number(),
  staffNo: z.string(),
  name: z.string(),
  gender: z.number(),
  phone: z.string(),
  avatar: z.string(),
  /** 身份证只回是否已录与掩码，明文不出后端 */
  idCardConfigured: z.boolean(),
  idCardMasked: z.string(),
  licenseImages: z.array(z.string()),
  workYears: z.number(),
  intro: z.string(),
  images: z.array(z.string()),
  video: z.string(),
  levelId: z.number(),
  levelName: z.string(),
  cityId: z.number(),
  cityName: z.string(),
  serviceCity: z.string(),
  lng: z.number(),
  lat: z.number(),
  address: z.string(),
  serviceStartAt: z.string(),
  serviceEndAt: z.string(),
  crossDay: z.boolean(),
  dailyOrderLimit: z.number(),
  selfPriceEnabled: z.boolean(),
  carFeeEnabled: z.boolean(),
  carFeeCents: z.number(),
  rating: z.number(),
  reviewCount: z.number(),
  orderCountVirtual: z.number(),
  orderCountTrue: z.number(),
  recommendTop: z.boolean(),
  sortTop: z.number(),
  locationEnabled: z.boolean(),
  lastLocationAt: z.string(),
  status: z.enum(ONSITE_STAFF_STATUSES),
  authStatus: z.string(),
  reviewRemark: z.string(),
  /** 有资料修改待审：界面要给出「查看变更」入口 */
  hasPendingProfile: z.boolean(),
  pendingDiff: z.array(z.object({ label: z.string(), value: z.string() })),
  source: z.string(),
  serviceCount: z.number(),
  createdAt: z.string(),
});
export type OnsiteStaffRow = z.infer<typeof onsiteStaffRowSchema>;

export const onsiteStaffInputSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().trim().min(1).max(60),
  gender: z.number().int().min(0).max(2).default(0),
  phone: z.string().trim().min(3).max(32),
  avatar: z.string().trim().max(500).default(""),
  /** 留空表示不改动已存身份证密文 */
  idCard: z.string().max(32).optional(),
  licenseImages: z.array(z.string().max(500)).max(9).default([]),
  workYears: z.number().int().min(0).max(60).default(0),
  intro: z.string().max(2000).default(""),
  images: z.array(z.string().max(500)).max(12).default([]),
  video: z.string().trim().max(500).default(""),
  levelId: z.number().int().min(0).default(0),
  cityId: z.number().int().min(0).default(0),
  serviceCity: z.string().trim().max(60).default(""),
  lng: z.number().min(-180).max(180).default(0),
  lat: z.number().min(-90).max(90).default(0),
  address: z.string().trim().max(200).default(""),
  serviceStartAt: z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "时段需为 HH:mm")
    .default("09:00"),
  serviceEndAt: z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "时段需为 HH:mm")
    .default("19:00"),
  crossDay: z.boolean().default(false),
  dailyOrderLimit: z.number().int().min(0).max(50).default(0),
  selfPriceEnabled: z.boolean().default(true),
  carFeeEnabled: z.boolean().default(false),
  carFeeCents: z.number().int().min(0).max(999999).default(0),
  recommendTop: z.boolean().default(false),
  sortTop: z.number().int().min(0).max(9999).default(0),
  locationEnabled: z.boolean().default(false),
  orderCountVirtual: z.number().int().min(0).max(999999).default(0),
  status: z.enum(ONSITE_STAFF_STATUSES).default("ONLINE"),
});
export type OnsiteStaffInput = z.infer<typeof onsiteStaffInputSchema>;

export const onsiteStaffQuerySchema = pageQuerySchema.extend({
  status: z.string().default("all"),
  keyword: z.string().default(""),
  levelId: z.string().default(""),
  cityId: z.string().default(""),
});

export const onsiteStaffLevelRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  rank: z.number(),
  commissionRate: z.number(),
  addonRate: z.number(),
  minPerformanceCents: z.number(),
  onlineHoursRequired: z.number(),
  points: z.number(),
  agreementArticleId: z.number(),
  sortOrder: z.number(),
  enabled: z.boolean(),
  staffCount: z.number(),
});
export type OnsiteStaffLevelRow = z.infer<typeof onsiteStaffLevelRowSchema>;

export const onsiteStaffLevelInputSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().trim().min(1).max(40),
  rank: z.number().int().min(1).max(20).default(1),
  commissionRate: z.number().min(0).max(100).default(50),
  addonRate: z.number().min(0).max(300).default(100),
  minPerformanceCents: z.number().int().min(0).max(999999999).default(0),
  onlineHoursRequired: z.number().int().min(0).max(20000).default(0),
  points: z.number().int().min(0).max(999999).default(0),
  agreementArticleId: z.number().int().min(0).default(0),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  enabled: z.boolean().default(true),
});
export type OnsiteStaffLevelInput = z.infer<typeof onsiteStaffLevelInputSchema>;

export const onsiteRestRowSchema = z.object({
  id: z.number(),
  staffId: z.number(),
  startAt: z.string(),
  endAt: z.string(),
  allDay: z.boolean(),
  reason: z.string(),
  createdByRole: z.string(),
});
export type OnsiteRestRow = z.infer<typeof onsiteRestRowSchema>;

export const onsiteRestInputSchema = z.object({
  id: z.number().int().optional(),
  startAt: z.string().trim().min(1).max(32),
  endAt: z.string().trim().min(1).max(32),
  allDay: z.boolean().default(false),
  reason: z.string().trim().max(200).default(""),
});
export type OnsiteRestInput = z.infer<typeof onsiteRestInputSchema>;

export const onsiteWorkLogRowSchema = z.object({
  day: z.string(),
  serviceMinutes: z.number(),
  travelMinutes: z.number(),
  orderCount: z.number(),
});
export type OnsiteWorkLogRow = z.infer<typeof onsiteWorkLogRowSchema>;

// ---------- 排期 ----------

/** 时间片状态：可约 / 已占 / 休息 / 过期 / 超出时段。 */
export const ONSITE_SLOT_REASONS = [
  "AVAILABLE",
  "OCCUPIED",
  "REST",
  "EXPIRED",
  "OUT_OF_SERVICE",
  "DAILY_LIMIT",
  "LEAD_TIME",
] as const;
export const ONSITE_SLOT_REASON_LABELS: Record<string, string> = {
  AVAILABLE: "可预约",
  OCCUPIED: "已被预约",
  REST: "休息中",
  EXPIRED: "已过时间",
  OUT_OF_SERVICE: "超出服务时段",
  DAILY_LIMIT: "当日接单已满",
  LEAD_TIME: "未满足提前预约时长",
};

export const onsiteSlotSchema = z.object({
  startAt: z.number(),
  endAt: z.number(),
  label: z.string(),
  available: z.boolean(),
  reason: z.enum(ONSITE_SLOT_REASONS),
  /** 可约校验：该片段能否容纳指定时长（连续占片结果） */
  fitsDuration: z.boolean(),
  orderId: z.number().default(0),
});
export type OnsiteSlot = z.infer<typeof onsiteSlotSchema>;

export const onsiteTimelineRowSchema = z.object({
  staffId: z.number(),
  staffName: z.string(),
  avatar: z.string(),
  levelName: z.string(),
  rating: z.number(),
  serviceStartAt: z.string(),
  serviceEndAt: z.string(),
  availableCount: z.number(),
  slots: z.array(onsiteSlotSchema),
});
export type OnsiteTimelineRow = z.infer<typeof onsiteTimelineRowSchema>;

export const onsiteTimelineResultSchema = z.object({
  day: z.string(),
  timeUnitMinutes: z.number(),
  durationMinutes: z.number(),
  /** 排期引擎参数回显，界面要能说明「为什么这个时段不可选」 */
  bufferMinutes: z.number(),
  timelines: z.array(onsiteTimelineRowSchema),
  note: z.string().default(""),
});
export type OnsiteTimelineResult = z.infer<typeof onsiteTimelineResultSchema>;

export const onsiteScheduleDaySchema = z.object({
  day: z.string(),
  availableCount: z.number(),
  totalSlots: z.number(),
});
export type OnsiteScheduleDay = z.infer<typeof onsiteScheduleDaySchema>;

export const onsiteScheduleDaysResultSchema = z.object({
  days: z.array(onsiteScheduleDaySchema),
  timeUnitMinutes: z.number(),
});
export type OnsiteScheduleDaysResult = z.infer<
  typeof onsiteScheduleDaysResultSchema
>;

// ---------- 城市与车费 ----------

export const onsiteCityRowSchema = z.object({
  id: z.number(),
  shopId: z.number(),
  parentId: z.number(),
  name: z.string(),
  level: z.string(),
  provinceCode: z.string(),
  cityCode: z.string(),
  areaCode: z.string(),
  lng: z.number(),
  lat: z.number(),
  enabled: z.boolean(),
  sortOrder: z.number(),
  /** 该城市的车费规则（没有则回落到店铺默认） */
  ruleId: z.number(),
  staffCount: z.number(),
});
export type OnsiteCityRow = z.infer<typeof onsiteCityRowSchema>;

export const onsiteCityInputSchema = z.object({
  id: z.number().int().optional(),
  parentId: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(60),
  level: z.enum(["PROVINCE", "CITY", "DISTRICT"]).default("CITY"),
  provinceCode: z.string().trim().max(12).default(""),
  cityCode: z.string().trim().max(12).default(""),
  areaCode: z.string().trim().max(12).default(""),
  lng: z.number().min(-180).max(180).default(0),
  lat: z.number().min(-90).max(90).default(0),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});
export type OnsiteCityInput = z.infer<typeof onsiteCityInputSchema>;

export const onsiteFeeRuleRowSchema = z.object({
  id: z.number(),
  cityId: z.number(),
  cityName: z.string(),
  freeKilometers: z.number(),
  startFeeCents: z.number(),
  startKilometers: z.number(),
  pricePerKilometerCents: z.number(),
  virtualExtraKilometers: z.number(),
  publicTransitEnabled: z.boolean(),
  minFeeCents: z.number(),
  enabled: z.boolean(),
});
export type OnsiteFeeRuleRow = z.infer<typeof onsiteFeeRuleRowSchema>;

/** 里程与费率都以「整数」表达：公里两位小数取百分之一公里，金额取分。 */
export const onsiteFeeRuleInputSchema = z.object({
  id: z.number().int().optional(),
  cityId: z.number().int().min(0).default(0),
  freeKilometers: z.number().min(0).max(100).default(0),
  startFeeCents: z.number().int().min(0).max(999999).default(0),
  startKilometers: z.number().min(0).max(100).default(0),
  pricePerKilometerCents: z.number().int().min(0).max(999999).default(0),
  virtualExtraKilometers: z.number().min(0).max(100).default(0),
  publicTransitEnabled: z.boolean().default(false),
  minFeeCents: z.number().int().min(0).max(999999).default(0),
  enabled: z.boolean().default(true),
});
export type OnsiteFeeRuleInput = z.infer<typeof onsiteFeeRuleInputSchema>;

export const onsiteFeeEstimateInputSchema = z.object({
  fromLng: z.number().min(-180).max(180).default(0),
  fromLat: z.number().min(-90).max(90).default(0),
  toLng: z.number().min(-180).max(180),
  toLat: z.number().min(-90).max(90),
  cityId: z.number().int().min(0).default(0),
  serviceId: z.number().int().min(0).default(0),
  staffId: z.number().int().min(0).default(0),
});
export type OnsiteFeeEstimateInput = z.infer<typeof onsiteFeeEstimateInputSchema>;

export const onsiteFeeEstimateResultSchema = z.object({
  distanceMeters: z.number(),
  kilometers: z.number(),
  source: z.string(),
  ruleHit: z.string(),
  feeCents: z.number(),
  note: z.string().default(""),
});
export type OnsiteFeeEstimateResult = z.infer<
  typeof onsiteFeeEstimateResultSchema
>;

// ---------- 内容文章与自定义表单 ----------

export const onsiteArticleRowSchema = z.object({
  id: z.number(),
  title: z.string(),
  summary: z.string(),
  content: z.string(),
  cover: z.string(),
  formEnabled: z.boolean(),
  formPurpose: z.string(),
  sortOrder: z.number(),
  status: z.enum(ONSITE_ARTICLE_STATUSES),
  pv: z.number(),
  fieldIds: z.array(z.number()),
  submissionCount: z.number(),
  updatedAt: z.string(),
});
export type OnsiteArticleRow = z.infer<typeof onsiteArticleRowSchema>;

export const onsiteArticleInputSchema = z.object({
  id: z.number().int().optional(),
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().max(200).default(""),
  content: z.string().max(60000).default(""),
  cover: z.string().trim().max(500).default(""),
  formEnabled: z.boolean().default(false),
  formPurpose: z.enum(["AGREEMENT", "STAFF_APPLY", "CUSTOM"]).default("CUSTOM"),
  fieldIds: z.array(z.number().int()).max(30).default([]),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  status: z.enum(ONSITE_ARTICLE_STATUSES).default("DRAFT"),
});
export type OnsiteArticleInput = z.infer<typeof onsiteArticleInputSchema>;

export const onsiteFormFieldRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  fieldType: z.enum(ONSITE_FORM_FIELD_TYPES),
  options: z.array(z.string()),
  placeholder: z.string(),
  required: z.boolean(),
  sortOrder: z.number(),
  enabled: z.boolean(),
  articleCount: z.number(),
});
export type OnsiteFormFieldRow = z.infer<typeof onsiteFormFieldRowSchema>;

export const onsiteFormFieldInputSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().trim().min(1).max(60),
  fieldType: z.enum(ONSITE_FORM_FIELD_TYPES).default("text"),
  options: z.array(z.string().max(40)).max(30).default([]),
  placeholder: z.string().trim().max(80).default(""),
  required: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  enabled: z.boolean().default(true),
});
export type OnsiteFormFieldInput = z.infer<typeof onsiteFormFieldInputSchema>;

export const onsiteSubmissionRowSchema = z.object({
  id: z.number(),
  articleId: z.number(),
  articleTitle: z.string(),
  name: z.string(),
  phone: z.string(),
  customerId: z.number(),
  staffId: z.number(),
  status: z.string(),
  auditRemark: z.string(),
  auditedAt: z.string(),
  createdAt: z.string(),
});
export type OnsiteSubmissionRow = z.infer<typeof onsiteSubmissionRowSchema>;

export const onsiteSubmissionDetailSchema = onsiteSubmissionRowSchema.extend({
  answers: z.array(
    z.object({ label: z.string(), value: z.string(), fieldType: z.string() }),
  ),
});
export type OnsiteSubmissionDetail = z.infer<
  typeof onsiteSubmissionDetailSchema
>;

export const onsiteSubmissionAuditInputSchema = z.object({
  id: z.number().int().positive(),
  approved: z.boolean(),
  remark: z.string().trim().max(200).default(""),
  /** 审核通过时顺手建档为服务人员（报名场景） */
  createStaff: z.boolean().default(false),
});
export type OnsiteSubmissionAuditInput = z.infer<typeof onsiteSubmissionAuditInputSchema>;

export const onsiteShieldRowSchema = z.object({
  id: z.number(),
  customerId: z.number(),
  customerNickname: z.string(),
  staffId: z.number(),
  staffName: z.string(),
  type: z.string(),
  createdAt: z.string(),
});
export type OnsiteShieldRow = z.infer<typeof onsiteShieldRowSchema>;

const list = <T extends z.ZodType>(row: T) => z.object({ list: z.array(row) });
const removed = envelope(z.object({ removed: z.boolean() }));
const idBody = z.object({ id: z.number().int().positive() });

export const onsiteCatalogEndpoints = {
  // ---------- 分类与服务 ----------
  Onsite_categories: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/categories",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(list(onsiteCategoryRowSchema)),
  },
  Onsite_saveCategory: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/categories",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: onsiteCategoryInputSchema,
    response: envelope(onsiteCategoryRowSchema),
  },
  Onsite_removeCategory: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/categories/remove",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: idBody,
    response: removed,
  },
  Onsite_services: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/services",
    params: z.object({ id: z.string() }),
    query: onsiteServiceQuerySchema,
    body: z.undefined(),
    response: envelope(pageSchema(onsiteServiceRowSchema)),
  },
  Onsite_serviceDetail: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/services/:serviceId",
    params: z.object({ id: z.string(), serviceId: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(onsiteServiceRowSchema),
  },
  Onsite_saveService: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/services",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: onsiteServiceInputSchema,
    response: envelope(onsiteServiceRowSchema),
  },
  Onsite_removeService: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/services/remove",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: idBody,
    response: removed,
  },
  Onsite_setServiceStatus: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/services/status",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: onsiteServiceStatusInputSchema,
    response: envelope(z.object({ updated: z.number() })),
  },
  Onsite_copyService: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/services/copy",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: idBody,
    response: envelope(onsiteServiceRowSchema),
  },
  Onsite_staffPrices: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/services/:serviceId/prices",
    params: z.object({ id: z.string(), serviceId: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(list(onsiteStaffPriceRowSchema)),
  },
  Onsite_saveStaffPrices: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/services/:serviceId/prices",
    params: z.object({ id: z.string(), serviceId: z.string() }),
    query: emptyQuery,
    body: onsiteStaffPricesInputSchema,
    response: envelope(list(onsiteStaffPriceRowSchema)),
  },
  Onsite_labels: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/labels",
    params: z.object({ id: z.string() }),
    query: z.object({ type: z.string().default("all") }),
    body: z.undefined(),
    response: envelope(list(onsiteLabelRowSchema)),
  },
  Onsite_saveLabel: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/labels",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: onsiteLabelInputSchema,
    response: envelope(onsiteLabelRowSchema),
  },
  Onsite_removeLabel: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/labels/remove",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: idBody,
    response: removed,
  },
  Onsite_banners: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/banners",
    params: z.object({ id: z.string() }),
    query: z.object({ position: z.string().default("all") }),
    body: z.undefined(),
    response: envelope(list(onsiteBannerRowSchema)),
  },
  Onsite_saveBanner: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/banners",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: onsiteBannerInputSchema,
    response: envelope(onsiteBannerRowSchema),
  },
  Onsite_removeBanner: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/banners/remove",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: idBody,
    response: removed,
  },

  // ---------- 服务人员 ----------
  Onsite_staff: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/staff",
    params: z.object({ id: z.string() }),
    query: onsiteStaffQuerySchema,
    body: z.undefined(),
    response: envelope(pageSchema(onsiteStaffRowSchema)),
  },
  Onsite_staffDetail: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/staff/:staffId",
    params: z.object({ id: z.string(), staffId: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(onsiteStaffRowSchema),
  },
  Onsite_saveStaff: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/staff",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: onsiteStaffInputSchema,
    response: envelope(onsiteStaffRowSchema),
  },
  Onsite_removeStaff: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/staff/remove",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: idBody,
    response: removed,
  },
  Onsite_setStaffStatus: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/staff/status",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.object({
      id: z.number().int().positive(),
      status: z.enum(ONSITE_STAFF_STATUSES),
      remark: z.string().trim().max(200).default(""),
    }),
    response: envelope(onsiteStaffRowSchema),
  },
  Onsite_reviewStaffProfile: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/staff/review-profile",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.object({
      id: z.number().int().positive(),
      approved: z.boolean(),
      remark: z.string().trim().max(200).default(""),
    }),
    response: envelope(onsiteStaffRowSchema),
  },
  Onsite_staffLevels: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/staff-levels",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(list(onsiteStaffLevelRowSchema)),
  },
  Onsite_saveStaffLevel: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/staff-levels",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: onsiteStaffLevelInputSchema,
    response: envelope(onsiteStaffLevelRowSchema),
  },
  Onsite_removeStaffLevel: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/staff-levels/remove",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: idBody,
    response: removed,
  },
  Onsite_staffRest: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/staff/:staffId/rest",
    params: z.object({ id: z.string(), staffId: z.string() }),
    query: z.object({ day: z.string().default("") }),
    body: z.undefined(),
    response: envelope(list(onsiteRestRowSchema)),
  },
  Onsite_saveStaffRest: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/staff/:staffId/rest",
    params: z.object({ id: z.string(), staffId: z.string() }),
    query: emptyQuery,
    body: onsiteRestInputSchema,
    response: envelope(onsiteRestRowSchema),
  },
  Onsite_removeStaffRest: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/staff/:staffId/rest/remove",
    params: z.object({ id: z.string(), staffId: z.string() }),
    query: emptyQuery,
    body: idBody,
    response: removed,
  },
  Onsite_staffWorkLogs: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/staff/:staffId/work-logs",
    params: z.object({ id: z.string(), staffId: z.string() }),
    query: z.object({ days: z.string().default("14") }),
    body: z.undefined(),
    response: envelope(list(onsiteWorkLogRowSchema)),
  },

  // ---------- 排期 ----------
  Onsite_timeline: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/schedule/timeline",
    params: z.object({ id: z.string() }),
    query: z.object({
      day: z.string().default(""),
      staffId: z.string().default(""),
      serviceId: z.string().default(""),
    }),
    body: z.undefined(),
    response: envelope(onsiteTimelineResultSchema),
  },
  Onsite_scheduleDays: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/schedule/days",
    params: z.object({ id: z.string() }),
    query: z.object({
      staffId: z.string().default(""),
      serviceId: z.string().default(""),
    }),
    body: z.undefined(),
    response: envelope(onsiteScheduleDaysResultSchema),
  },

  // ---------- 城市与车费 ----------
  Onsite_cities: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/cities",
    params: z.object({ id: z.string() }),
    query: z.object({ keyword: z.string().default("") }),
    body: z.undefined(),
    response: envelope(list(onsiteCityRowSchema)),
  },
  Onsite_saveCity: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/cities",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: onsiteCityInputSchema,
    response: envelope(onsiteCityRowSchema),
  },
  Onsite_removeCity: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/cities/remove",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: idBody,
    response: removed,
  },
  Onsite_feeRules: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/fee-rules",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(list(onsiteFeeRuleRowSchema)),
  },
  Onsite_saveFeeRule: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/fee-rules",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: onsiteFeeRuleInputSchema,
    response: envelope(onsiteFeeRuleRowSchema),
  },
  Onsite_removeFeeRule: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/fee-rules/remove",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: idBody,
    response: removed,
  },
  Onsite_estimateFee: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/fee-rules/estimate",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: onsiteFeeEstimateInputSchema,
    response: envelope(onsiteFeeEstimateResultSchema),
  },

  // ---------- 内容、表单与屏蔽 ----------
  Onsite_articles: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/articles",
    params: z.object({ id: z.string() }),
    query: pageQuerySchema.extend({
      status: z.string().default("all"),
      keyword: z.string().default(""),
    }),
    body: z.undefined(),
    response: envelope(pageSchema(onsiteArticleRowSchema)),
  },
  Onsite_saveArticle: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/articles",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: onsiteArticleInputSchema,
    response: envelope(onsiteArticleRowSchema),
  },
  Onsite_removeArticle: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/articles/remove",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: idBody,
    response: removed,
  },
  Onsite_formFields: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/form-fields",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(list(onsiteFormFieldRowSchema)),
  },
  Onsite_saveFormField: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/form-fields",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: onsiteFormFieldInputSchema,
    response: envelope(onsiteFormFieldRowSchema),
  },
  Onsite_removeFormField: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/form-fields/remove",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: idBody,
    response: removed,
  },
  Onsite_submissions: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/submissions",
    params: z.object({ id: z.string() }),
    query: pageQuerySchema.extend({
      status: z.string().default("all"),
      articleId: z.string().default(""),
    }),
    body: z.undefined(),
    response: envelope(pageSchema(onsiteSubmissionRowSchema)),
  },
  Onsite_submissionDetail: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/submissions/:submissionId",
    params: z.object({ id: z.string(), submissionId: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(onsiteSubmissionDetailSchema),
  },
  Onsite_auditSubmission: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/submissions/audit",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: onsiteSubmissionAuditInputSchema,
    response: envelope(onsiteSubmissionRowSchema),
  },
  Onsite_shields: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/shields",
    params: z.object({ id: z.string() }),
    query: z.object({ staffId: z.string().default("") }),
    body: z.undefined(),
    response: envelope(list(onsiteShieldRowSchema)),
  },
  Onsite_removeShield: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/shields/remove",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: idBody,
    response: removed,
  },
} as const;


// ============================================================================
// P1-2 交易与履约（店主侧契约；C 端顾客走 /api/public/onsite/*，不进 JSON 契约）
// ============================================================================

export const ONSITE_ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "待付款",
  PAID: "待接单",
  ACCEPTED: "已接单",
  EN_ROUTE: "服务出发",
  ON_SITE: "已到达",
  SERVING: "服务中",
  COMPLETED: "已完成",
  SIGNED: "已签收",
  REVIEWED: "已评价",
  CANCELLED: "已取消",
  EXPIRED: "超时关闭",
  REJECTED: "技师拒单",
  REFUND_PENDING: "退款中",
  REFUNDED: "已退款",
};

export const ONSITE_ORDER_ACTIONS = [
  "accept",
  "reject",
  "depart",
  "arrive",
  "start",
  "complete",
] as const;
export type OnsiteOrderAction = (typeof ONSITE_ORDER_ACTIONS)[number];
export const ONSITE_ORDER_ACTION_LABELS: Record<string, string> = {
  accept: "接单",
  reject: "拒单",
  depart: "出发打卡",
  arrive: "到达打卡（需拍照）",
  start: "开始服务",
  complete: "完成服务",
};

export const onsiteOrderItemRowSchema = z.object({
  id: z.number(),
  serviceId: z.number(),
  title: z.string(),
  coverImage: z.string(),
  unitPriceCents: z.number(),
  quantity: z.number(),
  durationMinutes: z.number(),
  materialFeeCents: z.number(),
  payAmountCents: z.number(),
  refundableQuantity: z.number(),
  refundedQuantity: z.number(),
});
export type OnsiteOrderItemRow = z.infer<typeof onsiteOrderItemRowSchema>;

export const onsiteOrderRowSchema = z.object({
  id: z.number(),
  orderNo: z.string(),
  status: z.string(),
  payStatus: z.string(),
  refundStatus: z.string(),
  serviceMode: z.string(),
  customerId: z.number(),
  customerName: z.string(),
  customerPhone: z.string(),
  staffId: z.number(),
  staffName: z.string(),
  staffPhone: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  durationMinutes: z.number(),
  trueDurationMinutes: z.number(),
  serviceFeeCents: z.number(),
  travelFeeCents: z.number(),
  materialFeeCents: z.number(),
  discountCents: z.number(),
  couponAmountCents: z.number(),
  balanceAmountCents: z.number(),
  payAmountCents: z.number(),
  payType: z.string(),
  paidAt: z.string(),
  expireAt: z.string(),
  acceptedAt: z.string(),
  departedAt: z.string(),
  arrivedAt: z.string(),
  serviceStartedAt: z.string(),
  completedAt: z.string(),
  signedAt: z.string(),
  distanceMeters: z.number(),
  travelFeeSource: z.string(),
  reviewed: z.boolean(),
  isAddon: z.boolean(),
  parentOrderId: z.number(),
  addonCount: z.number(),
  settlementStatus: z.string(),
  settleableAt: z.string(),
  ownerRemark: z.string(),
  customerRemark: z.string(),
  items: z.array(onsiteOrderItemRowSchema),
  createdAt: z.string(),
});
export type OnsiteOrderRow = z.infer<typeof onsiteOrderRowSchema>;

export const onsiteOrderDetailSchema = onsiteOrderRowSchema.extend({
  address: z
    .object({
      contactName: z.string(),
      phone: z.string(),
      province: z.string(),
      city: z.string(),
      district: z.string(),
      detail: z.string(),
      lng: z.number(),
      lat: z.number(),
    })
    .nullable(),
  signature: z
    .object({
      image: z.string(),
      signedAt: z.string(),
      confirmedBy: z.string(),
    })
    .nullable(),
  timeline: z.array(
    z.object({
      action: z.string(),
      fromStatus: z.string(),
      toStatus: z.string(),
      operatorRole: z.string(),
      content: z.string(),
      at: z.string(),
    }),
  ),
  tracks: z.array(
    z.object({
      stage: z.string(),
      address: z.string(),
      image: z.string(),
      lng: z.number(),
      lat: z.number(),
      at: z.string(),
    }),
  ),
  staffChanges: z.array(
    z.object({
      id: z.number(),
      fromStaffName: z.string(),
      toStaffName: z.string(),
      travelFeeDeltaCents: z.number(),
      remark: z.string(),
      at: z.string(),
    }),
  ),
});
export type OnsiteOrderDetail = z.infer<typeof onsiteOrderDetailSchema>;

export const onsiteOrderCreateInputSchema = z.object({
  staffId: z.number().int().min(0).default(0),
  addressId: z.number().int().positive(),
  /** ISO 时间或 `YYYY-MM-DDTHH:mm`；服务端按店铺时区解析后再校验档期 */
  startAt: z.string().trim().min(1).max(32),
  items: z
    .array(
      z.object({
        serviceId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(20).default(1),
      }),
    )
    .min(1)
    .max(20),
  customerRemark: z.string().trim().max(300).default(""),
  /** 仅店主代客下单用：按手机号找顾客档案 */
  customerPhone: z.string().trim().max(32).default(""),
  customerId: z.number().int().min(0).default(0),
  /** 使用的券票 id（0 = 不用券）；抵扣在试算与建单两处各算一次，绝不信任端上金额 */
  couponTicketId: z.number().int().min(0).default(0),
  /** 是否用店内余额抵扣；不足部分仍走微信（零元单直接置为已支付） */
  useBalance: z.boolean().default(false),
});
export type OnsiteOrderCreateInput = z.infer<
  typeof onsiteOrderCreateInputSchema
>;

export const onsiteOrderAdvanceInputSchema = z.object({
  orderId: z.number().int().positive(),
  action: z.enum(ONSITE_ORDER_ACTIONS),
  content: z.string().trim().max(200).default(""),
  image: z.string().trim().max(500).default(""),
  lng: z.number().min(-180).max(180).default(0),
  lat: z.number().min(-90).max(90).default(0),
  address: z.string().trim().max(200).default(""),
});
export type OnsiteOrderAdvanceInput = z.infer<
  typeof onsiteOrderAdvanceInputSchema
>;

export const onsiteOrderQuerySchema = pageQuerySchema.extend({
  status: z.string().default("all"),
  keyword: z.string().default(""),
  staffId: z.string().default(""),
});

export const onsitePayParamsSchema = z.object({
  payable: z.boolean(),
  reason: z.string().default(""),
  params: z
    .object({
      timeStamp: z.string(),
      nonceStr: z.string(),
      package: z.string(),
      signType: z.string(),
      paySign: z.string(),
    })
    .nullable(),
});
export type OnsitePayParams = z.infer<typeof onsitePayParamsSchema>;

export const onsiteAddonResultSchema = z.object({
  addonId: z.number(),
  endAt: z.string(),
  order: onsiteOrderRowSchema,
});

export const onsiteTradeEndpoints = {
  Onsite_orders: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/orders",
    params: z.object({ id: z.string() }),
    query: onsiteOrderQuerySchema,
    body: z.undefined(),
    response: envelope(pageSchema(onsiteOrderRowSchema)),
  },
  Onsite_orderDetail: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/orders/:orderId",
    params: z.object({ id: z.string(), orderId: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(onsiteOrderDetailSchema),
  },
  Onsite_createOrder: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/orders/create",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: onsiteOrderCreateInputSchema,
    response: envelope(onsiteOrderRowSchema),
  },
  Onsite_dispatchOrder: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/orders/dispatch",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.object({ orderId: z.number().int().positive(), staffId: z.number().int().positive() }),
    response: envelope(onsiteOrderRowSchema),
  },
  Onsite_advanceOrder: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/orders/advance",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: onsiteOrderAdvanceInputSchema,
    response: envelope(onsiteOrderRowSchema),
  },
  Onsite_orderPayParams: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/orders/pay-params",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.object({ orderId: z.number().int().positive() }),
    response: envelope(onsitePayParamsSchema),
  },
  Onsite_orderPayOffline: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/orders/pay-offline",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.object({
      orderId: z.number().int().positive(),
      remark: z.string().trim().max(200).default(""),
    }),
    response: envelope(onsiteOrderRowSchema),
  },
  Onsite_orderSign: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/orders/sign",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.object({
      orderId: z.number().int().positive(),
      image: z.string().trim().max(500),
    }),
    response: envelope(onsiteOrderRowSchema),
  },
  Onsite_orderAddon: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/orders/addon",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.object({
      orderId: z.number().int().positive(),
      orderItemId: z.number().int().positive(),
      quantity: z.number().int().min(1).max(10).default(1),
    }),
    response: envelope(onsiteAddonResultSchema),
  },
  Onsite_cancelOrder: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/orders/cancel",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.object({
      orderId: z.number().int().positive(),
      reason: z.string().trim().max(200).default(""),
    }),
    response: envelope(onsiteOrderRowSchema),
  },
  Onsite_orderRemark: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/orders/remark",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.object({
      orderId: z.number().int().positive(),
      note: z.string().trim().max(300).default(""),
    }),
    response: envelope(onsiteOrderRowSchema),
  },
} as const;


// ============================================================================
// P1-2 售后 / 评价 / 安全（契约）
// ============================================================================

export const ONSITE_REFUND_STATUSES = [
  "PENDING",
  "REFUNDED",
  "REJECTED",
  "CANCELLED",
] as const;
export const ONSITE_REFUND_STATUS_LABELS: Record<string, string> = {
  PENDING: "待处理",
  REFUNDED: "已退款",
  REJECTED: "已驳回",
  CANCELLED: "已撤销",
};

export const ONSITE_REVIEW_STATUSES = ["PENDING", "PUBLISHED", "HIDDEN"] as const;
export type OnsiteReviewStatus = (typeof ONSITE_REVIEW_STATUSES)[number];
export const ONSITE_REVIEW_STATUS_LABELS: Record<string, string> = {
  PENDING: "待审核",
  PUBLISHED: "已展示",
  HIDDEN: "已隐藏",
};

export const ONSITE_APPEAL_STATUSES = ["PENDING", "ACCEPTED", "REJECTED"] as const;
export const ONSITE_APPEAL_STATUS_LABELS: Record<string, string> = {
  PENDING: "待处理",
  ACCEPTED: "申诉成立",
  REJECTED: "申诉驳回",
};

export const ONSITE_ALERT_STATUSES = [
  "PENDING",
  "PROCESSING",
  "RESOLVED",
  "MISFIRE",
] as const;
export const ONSITE_ALERT_STATUS_LABELS: Record<string, string> = {
  PENDING: "待处理",
  PROCESSING: "联系中",
  RESOLVED: "已处置",
  MISFIRE: "误报",
};

// ---------- 退款 ----------

export const onsiteRefundRowSchema = z.object({
  id: z.number(),
  refundNo: z.string(),
  orderId: z.number(),
  orderNo: z.string(),
  customerId: z.number(),
  staffId: z.number(),
  applyAmountCents: z.number(),
  refundAmountCents: z.number(),
  reason: z.string(),
  description: z.string(),
  evidenceImages: z.array(z.string()),
  status: z.string(),
  auditRemark: z.string(),
  refundTransactionId: z.string(),
  refundedAt: z.string(),
  createdAt: z.string(),
});
export type OnsiteRefundRow = z.infer<typeof onsiteRefundRowSchema>;

export const onsiteRefundDetailSchema = onsiteRefundRowSchema.extend({
  orderStatus: z.string(),
  payType: z.string(),
  lines: z.array(
    z.object({
      orderItemId: z.number(),
      quantity: z.number(),
      amountCents: z.number(),
      materialFeeCents: z.number(),
    }),
  ),
});
export type OnsiteRefundDetail = z.infer<typeof onsiteRefundDetailSchema>;

export const onsiteRefundApplyInputSchema = z.object({
  orderId: z.number().int().positive(),
  reason: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(""),
  evidenceImages: z.array(z.string().max(500)).max(9).default([]),
  /** 留空表示整单剩余可退全退 */
  items: z
    .array(
      z.object({
        orderItemId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(20),
      }),
    )
    .max(20)
    .default([]),
});
export type OnsiteRefundApplyInput = z.infer<typeof onsiteRefundApplyInputSchema>;

export const onsiteRefundQuoteSchema = z.object({
  orderNo: z.string(),
  status: z.string(),
  refundableCents: z.number(),
  pendingRefund: z.boolean(),
  items: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      quantity: z.number(),
      refundableQuantity: z.number(),
      unitPriceCents: z.number(),
      materialFeeCents: z.number(),
      durationMinutes: z.number(),
    }),
  ),
});
export type OnsiteRefundQuote = z.infer<typeof onsiteRefundQuoteSchema>;

// ---------- 评价 ----------

export const onsiteReviewItemRowSchema = z.object({
  serviceId: z.number(),
  title: z.string(),
  rating: z.number(),
});

export const onsiteReviewRowSchema = z.object({
  id: z.number(),
  orderId: z.number(),
  orderNo: z.string(),
  customerId: z.number(),
  customerNickname: z.string(),
  anonymous: z.boolean(),
  staffId: z.number(),
  staffName: z.string(),
  rating: z.number(),
  serviceRating: z.number(),
  attitudeRating: z.number(),
  tags: z.array(z.string()),
  content: z.string(),
  images: z.array(z.string()),
  status: z.enum(ONSITE_REVIEW_STATUSES),
  reply: z.string(),
  repliedAt: z.string(),
  items: z.array(onsiteReviewItemRowSchema),
  appealCount: z.number(),
  createdAt: z.string(),
});
export type OnsiteReviewRow = z.infer<typeof onsiteReviewRowSchema>;

export const onsiteReviewCreateInputSchema = z.object({
  orderId: z.number().int().positive(),
  rating: z.number().int().min(1).max(5),
  serviceRating: z.number().int().min(1).max(5).default(5),
  attitudeRating: z.number().int().min(1).max(5).default(5),
  tags: z.array(z.string().max(40)).max(12).default([]),
  content: z.string().max(2000).default(""),
  images: z.array(z.string().max(500)).max(9).default([]),
  anonymous: z.boolean().default(false),
  items: z
    .array(
      z.object({
        serviceId: z.number().int().positive(),
        rating: z.number().int().min(1).max(5),
      }),
    )
    .max(20)
    .default([]),
});
export type OnsiteReviewCreateInput = z.infer<typeof onsiteReviewCreateInputSchema>;

export const onsiteAppealRowSchema = z.object({
  id: z.number(),
  reviewId: z.number(),
  orderNo: z.string(),
  staffId: z.number(),
  staffName: z.string(),
  reason: z.string(),
  images: z.array(z.string()),
  status: z.enum(ONSITE_APPEAL_STATUSES),
  reply: z.string(),
  handledAt: z.string(),
  createdAt: z.string(),
});
export type OnsiteAppealRow = z.infer<typeof onsiteAppealRowSchema>;

export const onsiteFeedbackRowSchema = z.object({
  id: z.number(),
  customerId: z.number(),
  staffId: z.number(),
  staffName: z.string(),
  orderId: z.number(),
  category: z.string(),
  content: z.string(),
  images: z.array(z.string()),
  video: z.string(),
  status: z.string(),
  reply: z.string(),
  handledAt: z.string(),
  createdAt: z.string(),
});
export type OnsiteFeedbackRow = z.infer<typeof onsiteFeedbackRowSchema>;

// ---------- 安全 ----------

export const onsiteAlertRowSchema = z.object({
  id: z.number(),
  staffId: z.number(),
  staffName: z.string(),
  staffPhone: z.string(),
  customerId: z.number(),
  orderId: z.number(),
  orderNo: z.string(),
  lng: z.number(),
  lat: z.number(),
  address: z.string(),
  content: z.string(),
  audioUrl: z.string(),
  notifyResult: z.string(),
  status: z.enum(ONSITE_ALERT_STATUSES),
  handleRemark: z.string(),
  handledBy: z.string(),
  handledAt: z.string(),
  createdAt: z.string(),
});
export type OnsiteAlertRow = z.infer<typeof onsiteAlertRowSchema>;

export const onsiteAlertConfigSchema = z.object({
  enabled: z.boolean(),
  helpPhones: z.array(z.string()),
  notifyOwner: z.boolean(),
  /** 同一技师重复报警的去重窗口（分钟），避免连点刷屏 */
  dedupeMinutes: z.number(),
});
export type OnsiteAlertConfig = z.infer<typeof onsiteAlertConfigSchema>;

/** 发起求救的返回：只回单号与是否命中去重，细节由列表页查看。 */
export const onsiteAlertRaiseSchema = z.object({
  id: z.number(),
  /** true = 去重窗口内已有未处理报警，本次只作提醒不重复建单 */
  duplicated: z.boolean(),
  status: z.enum(ONSITE_ALERT_STATUSES),
});
export type OnsiteAlertRaise = z.infer<typeof onsiteAlertRaiseSchema>;

export const onsiteAlertConfigInputSchema = z.object({
  enabled: z.boolean().default(true),
  helpPhones: z.array(z.string().max(32)).max(10).default([]),
  notifyOwner: z.boolean().default(true),
  dedupeMinutes: z.number().int().min(1).max(120).default(10),
});
export type OnsiteAlertConfigInput = z.infer<typeof onsiteAlertConfigInputSchema>;

/**
 * 客服与私域对接：AI 客服（service-desk）与企业微信 SCRM（营销工具）各自独立。
 *
 * 松耦合口径：`desk*` 只反映「service-desk 板块开关 + 绑定的客服站点自身状态」，
 * `scrm*` 只反映「wecom-scrm 板块开关 + 绑定的活码自身状态」；平台管理员关掉任意一个，
 * 另一个照常工作，本域也不因为任一侧缺失而拒绝读写配置。
 */
export const onsiteServiceConfigSchema = z.object({
  deskEnabled: z.boolean(),
  deskSiteKey: z.string(),
  deskSiteName: z.string(),
  deskAvailable: z.boolean(),
  /** 不可用原因与下一步入口；可用时为空串。 */
  deskHint: z.string(),
  scrmEnabled: z.boolean(),
  scrmCodeId: z.number(),
  scrmCodeName: z.string(),
  scrmQrUrl: z.string(),
  scrmAvailable: z.boolean(),
  scrmHint: z.string(),
});
export type OnsiteServiceConfig = z.infer<typeof onsiteServiceConfigSchema>;

export const onsiteServiceConfigInputSchema = z.object({
  deskEnabled: z.boolean().default(true),
  deskSiteKey: z.string().trim().max(48).default(""),
  scrmEnabled: z.boolean().default(true),
  scrmCodeId: z.number().int().min(0).max(1000000).default(0),
});
export type OnsiteServiceConfigInput = z.infer<
  typeof onsiteServiceConfigInputSchema
>;

/** 下拉候选：本域直读被绑对象，避免前端跨板块调用受开关影响的接口。 */
export const onsiteServiceOptionsSchema = z.object({
  deskSites: z
    .array(
      z.object({
        siteKey: z.string(),
        name: z.string(),
        enabled: z.boolean(),
      }),
    )
    .default([]),
  scrmCodes: z
    .array(
      z.object({
        id: z.number(),
        name: z.string(),
        qrUrl: z.string(),
        status: z.string(),
      }),
    )
    .default([]),
  /** 前置条件不满足时的可操作入口（工作台菜单路径），两侧各给一条。 */
  deskHref: z.string().default(""),
  scrmHref: z.string().default(""),
});
export type OnsiteServiceOptions = z.infer<typeof onsiteServiceOptionsSchema>;

/** 顾客状态：拉黑只影响下单，历史订单与评价保留。 */
export const ONSITE_CUSTOMER_STATUSES = ["ACTIVE", "BLOCKED"] as const;
export type OnsiteCustomerStatus = (typeof ONSITE_CUSTOMER_STATUSES)[number];

export const onsiteCustomerRowSchema = z.object({
  id: z.number(),
  nickname: z.string(),
  avatar: z.string(),
  phone: z.string(),
  gender: z.number(),
  city: z.string(),
  status: z.enum(ONSITE_CUSTOMER_STATUSES),
  /** 累计成交（已支付口径），店主据此看复购而不是只看单量。 */
  orderCount: z.number(),
  paidAmountCents: z.number(),
  lastOrderAt: z.string(),
  lastLoginAt: z.string(),
  createdAt: z.string(),
});
export type OnsiteCustomerRow = z.infer<typeof onsiteCustomerRowSchema>;

export const onsiteCustomerQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  keyword: z.string().trim().max(60).default(""),
  status: z.enum([...ONSITE_CUSTOMER_STATUSES, "ALL"]).default("ALL"),
});
export type OnsiteCustomerQuery = z.infer<typeof onsiteCustomerQuerySchema>;

export const onsiteCustomerStatusInputSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(ONSITE_CUSTOMER_STATUSES),
  /** 拉黑原因会进审计与店主操作留痕，恢复时可空。 */
  remark: z.string().trim().max(200).default(""),
});
export type OnsiteCustomerStatusInput = z.infer<
  typeof onsiteCustomerStatusInputSchema
>;

const listPage = <T extends z.ZodType>(row: T) => pageSchema(row);

export const onsiteTrade2Endpoints = {
  // ---------- 售后 ----------
  Onsite_refunds: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/refunds",
    params: z.object({ id: z.string() }),
    query: pageQuerySchema.extend({ status: z.string().default("all") }),
    body: z.undefined(),
    response: envelope(listPage(onsiteRefundRowSchema)),
  },
  Onsite_refundDetail: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/refunds/:refundId",
    params: z.object({ id: z.string(), refundId: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(onsiteRefundDetailSchema),
  },
  Onsite_refundQuote: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/refunds/quote",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.object({ orderId: z.number().int().positive() }),
    response: envelope(onsiteRefundQuoteSchema),
  },
  Onsite_applyRefund: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/refunds/apply",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: onsiteRefundApplyInputSchema,
    response: envelope(onsiteRefundRowSchema),
  },
  Onsite_agreeRefund: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/refunds/agree",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.object({
      refundId: z.number().int().positive(),
      remark: z.string().trim().max(300).default(""),
      /** 线下已退登记（顾客到店退现），开启则不调微信退款接口 */
      offline: z.boolean().default(false),
    }),
    response: envelope(onsiteRefundRowSchema),
  },
  Onsite_rejectRefund: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/refunds/reject",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.object({
      refundId: z.number().int().positive(),
      remark: z.string().trim().min(1).max(300),
    }),
    response: envelope(onsiteRefundRowSchema),
  },

  // ---------- 评价 ----------
  Onsite_reviews: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/reviews",
    params: z.object({ id: z.string() }),
    query: pageQuerySchema.extend({
      status: z.string().default("all"),
      staffId: z.string().default(""),
      rating: z.string().default(""),
    }),
    body: z.undefined(),
    response: envelope(listPage(onsiteReviewRowSchema)),
  },
  Onsite_replyReview: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/reviews/reply",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.object({ id: z.number().int().positive(), reply: z.string().trim().max(1000) }),
    response: envelope(onsiteReviewRowSchema),
  },
  Onsite_setReviewStatus: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/reviews/status",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.object({
      id: z.number().int().positive(),
      status: z.enum(ONSITE_REVIEW_STATUSES),
    }),
    response: envelope(onsiteReviewRowSchema),
  },
  Onsite_appeals: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/appeals",
    params: z.object({ id: z.string() }),
    query: pageQuerySchema.extend({ status: z.string().default("all") }),
    body: z.undefined(),
    response: envelope(listPage(onsiteAppealRowSchema)),
  },
  Onsite_handleAppeal: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/appeals/handle",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.object({
      id: z.number().int().positive(),
      accepted: z.boolean(),
      reply: z.string().trim().max(300).default(""),
    }),
    response: envelope(onsiteAppealRowSchema),
  },
  Onsite_feedbacks: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/feedbacks",
    params: z.object({ id: z.string() }),
    query: pageQuerySchema.extend({ status: z.string().default("all") }),
    body: z.undefined(),
    response: envelope(listPage(onsiteFeedbackRowSchema)),
  },
  Onsite_handleFeedback: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/feedbacks/handle",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.object({
      id: z.number().int().positive(),
      reply: z.string().trim().max(300).default(""),
      status: z.enum(["PENDING", "DONE"]).default("DONE"),
    }),
    response: envelope(onsiteFeedbackRowSchema),
  },

  // ---------- 安全 ----------
  Onsite_alerts: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/alerts",
    params: z.object({ id: z.string() }),
    query: pageQuerySchema.extend({ status: z.string().default("all") }),
    body: z.undefined(),
    response: envelope(listPage(onsiteAlertRowSchema)),
  },
  Onsite_handleAlert: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/alerts/handle",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.object({
      id: z.number().int().positive(),
      status: z.enum(ONSITE_ALERT_STATUSES),
      remark: z.string().trim().max(300).default(""),
    }),
    response: envelope(onsiteAlertRowSchema),
  },
  /**
   * 发起一键报警：店主代报（必传 staffId）或绑定了站内账号的服务人员报自己。
   * 小程序技师分包的独立登录在 P4 落地，本期先给站内身份留一个可用入口。
   */
  Onsite_raiseAlert: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/alerts/raise",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.object({
      staffId: z.number().int().min(0).default(0),
      orderId: z.number().int().min(0).default(0),
      lng: z.number().min(-180).max(180).default(0),
      lat: z.number().min(-90).max(90).default(0),
      address: z.string().trim().max(200).default(""),
      content: z.string().trim().max(300).default(""),
      audioUrl: z.string().trim().max(500).default(""),
    }),
    response: envelope(onsiteAlertRaiseSchema),
  },
  Onsite_alertConfig: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/alerts/config",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(onsiteAlertConfigSchema),
  },
  Onsite_saveAlertConfig: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/alerts/config",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: onsiteAlertConfigInputSchema,
    response: envelope(onsiteAlertConfigSchema),
  },
  Onsite_serviceConfig: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/service-config",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(onsiteServiceConfigSchema),
  },
  Onsite_saveServiceConfig: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/service-config",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: onsiteServiceConfigInputSchema,
    response: envelope(onsiteServiceConfigSchema),
  },
  Onsite_serviceOptions: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/service-options",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(onsiteServiceOptionsSchema),
  },
  Onsite_customers: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/customers",
    params: z.object({ id: z.string() }),
    query: onsiteCustomerQuerySchema,
    body: z.undefined(),
    response: envelope(pageSchema(onsiteCustomerRowSchema)),
  },
  Onsite_setCustomerStatus: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/customers/status",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: onsiteCustomerStatusInputSchema,
    response: envelope(onsiteCustomerRowSchema),
  },
} as const;

// ============================================================================
// P2：分销体系 / 分账 / 结算与提现 / 卡券营销 / 余额与积分
// 口径见 docs/私域小程序·上门服务小程序工具设计方案.md §4.2、§5.4：
// 佣金下单预生成（PENDING）→ 支付生效（ACTIVE）→ 退款按比例冲销（REVERSED）；
// 金额在契约里一律用「分」（*Cents），服务层按分做整数运算。
// ============================================================================

export const ONSITE_COMMISSION_ROLES = [
  "DISTRIBUTOR",
  "SALESMAN",
  "CHANNEL",
  "PARTNER",
  "AGENT",
] as const;
export type OnsiteCommissionRole = (typeof ONSITE_COMMISSION_ROLES)[number];
export const ONSITE_COMMISSION_ROLE_LABELS: Record<string, string> = {
  DISTRIBUTOR: "分销商",
  SALESMAN: "业务员",
  CHANNEL: "渠道商",
  PARTNER: "合伙人",
  AGENT: "代理",
};

export const ONSITE_WITHDRAWAL_METHODS = ["WECHAT", "ALIPAY", "OFFLINE"] as const;
export const ONSITE_WITHDRAWAL_METHOD_LABELS: Record<string, string> = {
  WECHAT: "微信零钱",
  ALIPAY: "支付宝",
  OFFLINE: "线下转账",
};
export const ONSITE_WITHDRAWAL_STATUS_LABELS: Record<string, string> = {
  PENDING: "待处理",
  APPROVED: "已通过待打款",
  PAID: "已打款",
  REJECTED: "已驳回",
  CANCELLED: "已撤销",
};
export const ONSITE_WITHDRAWAL_ACTIONS = ["APPROVE", "REJECT", "PAID", "CANCEL"] as const;

export const ONSITE_COUPON_TYPES = ["FULL_REDUCTION", "DISCOUNT", "NEW_USER"] as const;
export const ONSITE_COUPON_TYPE_LABELS: Record<string, string> = {
  FULL_REDUCTION: "满减券",
  DISCOUNT: "折扣券",
  NEW_USER: "新客券",
};
export const ONSITE_COUPON_SCOPES = ["ALL", "CATEGORY", "SERVICE"] as const;
export const ONSITE_COUPON_SCOPE_LABELS: Record<string, string> = {
  ALL: "全场通用",
  CATEGORY: "指定分类",
  SERVICE: "指定服务",
};

export const ONSITE_AGENT_TYPES = ["PROVINCE", "CITY", "DISTRICT"] as const;
export const ONSITE_AGENT_TYPE_LABELS: Record<string, string> = {
  PROVINCE: "省代",
  CITY: "市代",
  DISTRICT: "区县代",
};

export const onsiteP2QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  keyword: z.string().trim().max(60).default(""),
  status: z.string().trim().max(16).default("ALL"),
});
export type OnsiteP2Query = z.infer<typeof onsiteP2QuerySchema>;

export const onsiteCommissionRuleRowSchema = z.object({
  role: z.enum(ONSITE_COMMISSION_ROLES),
  roleName: z.string(),
  totalRate: z.number(),
  staffBorneRate: z.number(),
  ownerBorneRate: z.number(),
  platformBorneRate: z.number(),
  enabled: z.boolean(),
});
export type OnsiteCommissionRuleRow = z.infer<typeof onsiteCommissionRuleRowSchema>;

export const onsiteCommissionRuleSaveSchema = z.object({
  role: z.enum(ONSITE_COMMISSION_ROLES),
  totalRate: z.number().min(0).max(100),
  staffBorneRate: z.number().min(0).max(100),
  ownerBorneRate: z.number().min(0).max(100),
  platformBorneRate: z.number().min(0).max(100).default(0),
  enabled: z.boolean().default(true),
});
export type OnsiteCommissionRuleSave = z.infer<typeof onsiteCommissionRuleSaveSchema>;

export const onsiteIncomeOverviewSchema = z.object({
  orderCount: z.number(),
  orderAmountCents: z.number(),
  commissionCents: z.number(),
  staffBorneCents: z.number(),
  ownerBorneCents: z.number(),
  platformBorneCents: z.number(),
  pendingSettleCents: z.number(),
  pendingWithdrawCents: z.number(),
  balanceLiabilityCents: z.number(),
  rechargeCents: z.number(),
  byRole: z.array(
    z.object({
      role: z.string(),
      roleName: z.string(),
      orderCount: z.number(),
      totalCents: z.number(),
    }),
  ),
});
export type OnsiteIncomeOverview = z.infer<typeof onsiteIncomeOverviewSchema>;

export const onsiteOrderCommissionRowSchema = z.object({
  id: z.number(),
  orderId: z.number(),
  orderNo: z.string(),
  customerId: z.number(),
  customerName: z.string(),
  status: z.string(),
  baseCents: z.number(),
  totalCents: z.number(),
  itemCount: z.number(),
  paidAt: z.string(),
  createdAt: z.string(),
});
export type OnsiteOrderCommissionRow = z.infer<typeof onsiteOrderCommissionRowSchema>;

export const onsiteCouponRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.enum(ONSITE_COUPON_TYPES),
  thresholdCents: z.number(),
  discountCents: z.number(),
  discountRate: z.number(),
  newUserOnly: z.boolean(),
  totalQuantity: z.number(),
  issuedCount: z.number(),
  perLimit: z.number(),
  scope: z.enum(ONSITE_COUPON_SCOPES),
  scopeTargets: z.array(z.number()),
  validStartAt: z.string(),
  validEndAt: z.string(),
  status: z.string(),
  createdAt: z.string(),
});
export type OnsiteCouponRow = z.infer<typeof onsiteCouponRowSchema>;

export const onsiteCouponSaveSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(60),
  type: z.enum(ONSITE_COUPON_TYPES).default("FULL_REDUCTION"),
  thresholdCents: z.number().int().min(0).default(0),
  discountCents: z.number().int().min(0).default(0),
  discountRate: z.number().min(0).max(100).default(0),
  newUserOnly: z.boolean().default(false),
  totalQuantity: z.number().int().min(0).default(0),
  perLimit: z.number().int().min(1).max(20).default(1),
  scope: z.enum(ONSITE_COUPON_SCOPES).default("ALL"),
  scopeTargets: z.array(z.number().int().positive()).max(100).default([]),
  validStartAt: z.string().trim().max(30).default(""),
  validEndAt: z.string().trim().max(30).default(""),
});
export type OnsiteCouponSave = z.infer<typeof onsiteCouponSaveSchema>;

export const onsiteCouponTicketRowSchema = z.object({
  id: z.number(),
  couponId: z.number(),
  customerId: z.number(),
  customerName: z.string(),
  code: z.string(),
  status: z.string(),
  usedOrderId: z.number(),
  usedAt: z.string(),
  expireAt: z.string(),
  createdAt: z.string(),
});
export type OnsiteCouponTicketRow = z.infer<typeof onsiteCouponTicketRowSchema>;

export const onsiteActivityRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.string(),
  rewardType: z.string(),
  rewardCents: z.number(),
  couponId: z.number(),
  startAt: z.string(),
  endAt: z.string(),
  status: z.string(),
  inviteCount: z.number(),
  rewardCount: z.number(),
  createdAt: z.string(),
});
export type OnsiteActivityRow = z.infer<typeof onsiteActivityRowSchema>;

export const onsiteActivitySaveSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(60),
  rewardType: z.enum(["BALANCE", "POINTS", "COUPON"]).default("BALANCE"),
  rewardCents: z.number().int().min(0).default(0),
  couponId: z.number().int().min(0).default(0),
  startAt: z.string().trim().max(30).default(""),
  endAt: z.string().trim().max(30).default(""),
});
export type OnsiteActivitySave = z.infer<typeof onsiteActivitySaveSchema>;

export const onsiteActivityRecordRowSchema = z.object({
  id: z.number(),
  inviterCustomerId: z.number(),
  inviterName: z.string(),
  inviteeCustomerId: z.number(),
  inviteeName: z.string(),
  status: z.string(),
  rewardCents: z.number(),
  rewardedAt: z.string(),
  createdAt: z.string(),
});
export type OnsiteActivityRecordRow = z.infer<typeof onsiteActivityRecordRowSchema>;

export const onsiteInviteRowSchema = z.object({
  id: z.number(),
  activityId: z.number(),
  inviterCustomerId: z.number(),
  inviterName: z.string(),
  code: z.string(),
  inviteCount: z.number(),
  createdAt: z.string(),
});
export type OnsiteInviteRow = z.infer<typeof onsiteInviteRowSchema>;

export const onsiteBalanceCardRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  faceCents: z.number(),
  giftCents: z.number(),
  priceCents: z.number(),
  validityDays: z.number(),
  enabled: z.boolean(),
  sortOrder: z.number(),
});
export type OnsiteBalanceCardRow = z.infer<typeof onsiteBalanceCardRowSchema>;

export const onsiteBalanceCardSaveSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(60),
  faceCents: z.number().int().min(0),
  giftCents: z.number().int().min(0).default(0),
  priceCents: z.number().int().min(0),
  validityDays: z.number().int().min(0).max(3650).default(0),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});
export type OnsiteBalanceCardSave = z.infer<typeof onsiteBalanceCardSaveSchema>;

export const onsiteRechargeRowSchema = z.object({
  id: z.number(),
  orderNo: z.string(),
  customerId: z.number(),
  customerName: z.string(),
  cardId: z.number(),
  amountCents: z.number(),
  giftCents: z.number(),
  totalCents: z.number(),
  status: z.string(),
  payType: z.string(),
  paidAt: z.string(),
  createdAt: z.string(),
});
export type OnsiteRechargeRow = z.infer<typeof onsiteRechargeRowSchema>;

export const onsiteBalanceFlowRowSchema = z.object({
  id: z.number(),
  customerId: z.number(),
  customerName: z.string(),
  type: z.string(),
  changeCents: z.number(),
  beforeCents: z.number(),
  afterCents: z.number(),
  relatedOrderId: z.number(),
  remark: z.string(),
  createdAt: z.string(),
});
export type OnsiteBalanceFlowRow = z.infer<typeof onsiteBalanceFlowRowSchema>;

export const onsiteBalanceAdjustSchema = z.object({
  customerId: z.number().int().positive(),
  /** 调整金额（分），正数加、负数减；余额不允许调成负数 */
  amountCents: z.number().int().refine((value) => value !== 0, "调整金额不能为 0"),
  remark: z.string().trim().min(1).max(200),
});
export type OnsiteBalanceAdjust = z.infer<typeof onsiteBalanceAdjustSchema>;

export const onsitePointsAdjustSchema = z.object({
  customerId: z.number().int().positive(),
  points: z.number().int().refine((value) => value !== 0, "调整积分不能为 0"),
  remark: z.string().trim().min(1).max(200),
});
export type OnsitePointsAdjust = z.infer<typeof onsitePointsAdjustSchema>;

export const onsiteSettlementRowSchema = z.object({
  id: z.number(),
  staffId: z.number(),
  staffName: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  orderCount: z.number(),
  grossCents: z.number(),
  commissionCents: z.number(),
  netCents: z.number(),
  status: z.string(),
  paidAt: z.string(),
});
export type OnsiteSettlementRow = z.infer<typeof onsiteSettlementRowSchema>;

export const onsiteSettlementCreateSchema = z.object({
  staffId: z.number().int().positive(),
  periodStart: z.string().trim().min(1).max(30),
  periodEnd: z.string().trim().min(1).max(30),
});
export type OnsiteSettlementCreate = z.infer<typeof onsiteSettlementCreateSchema>;

export const onsiteWithdrawalRowSchema = z.object({
  id: z.number(),
  ownerType: z.string(),
  ownerId: z.number(),
  ownerName: z.string(),
  amountCents: z.number(),
  taxRate: z.number(),
  taxCents: z.number(),
  actualCents: z.number(),
  method: z.enum(ONSITE_WITHDRAWAL_METHODS),
  status: z.string(),
  rejectReason: z.string(),
  transactionId: z.string(),
  handledAt: z.string(),
  createdAt: z.string(),
});
export type OnsiteWithdrawalRow = z.infer<typeof onsiteWithdrawalRowSchema>;

export const onsiteWithdrawalHandleSchema = z.object({
  action: z.enum(ONSITE_WITHDRAWAL_ACTIONS),
  reason: z.string().trim().max(200).default(""),
  transactionId: z.string().trim().max(64).default(""),
});
export type OnsiteWithdrawalHandle = z.infer<typeof onsiteWithdrawalHandleSchema>;

export const onsiteAgentRowSchema = z.object({
  id: z.number(),
  agentType: z.enum(ONSITE_AGENT_TYPES),
  name: z.string(),
  phone: z.string(),
  provinceCode: z.string(),
  cityCode: z.string(),
  areaCode: z.string(),
  commissionRate: z.number(),
  parentId: z.number(),
  parentName: z.string(),
  status: z.string(),
  orderCount: z.number(),
  commissionCents: z.number(),
});
export type OnsiteAgentRow = z.infer<typeof onsiteAgentRowSchema>;

export const onsiteAgentSaveSchema = z.object({
  id: z.number().int().positive().optional(),
  agentType: z.enum(ONSITE_AGENT_TYPES).default("CITY"),
  name: z.string().trim().min(1).max(60),
  phone: z.string().trim().max(32).default(""),
  provinceCode: z.string().trim().max(20).default(""),
  cityCode: z.string().trim().max(20).default(""),
  areaCode: z.string().trim().max(20).default(""),
  commissionRate: z.number().min(0).max(100).default(0),
  parentId: z.number().int().min(0).default(0),
});
export type OnsiteAgentSave = z.infer<typeof onsiteAgentSaveSchema>;

export const onsiteSalesmanRowSchema = z.object({
  id: z.number(),
  agentId: z.number(),
  agentName: z.string(),
  name: z.string(),
  phone: z.string(),
  area: z.string(),
  rate: z.number(),
  status: z.string(),
  commissionCents: z.number(),
});
export type OnsiteSalesmanRow = z.infer<typeof onsiteSalesmanRowSchema>;

export const onsiteSalesmanSaveSchema = z.object({
  id: z.number().int().positive().optional(),
  agentId: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(60),
  phone: z.string().trim().max(32).default(""),
  area: z.string().trim().max(120).default(""),
  rate: z.number().min(0).max(100).default(0),
});
export type OnsiteSalesmanSave = z.infer<typeof onsiteSalesmanSaveSchema>;

export const onsiteChannelCategoryRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  sortOrder: z.number(),
});
export type OnsiteChannelCategoryRow = z.infer<typeof onsiteChannelCategoryRowSchema>;

export const onsiteChannelCategorySaveSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(40),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});
export type OnsiteChannelCategorySave = z.infer<typeof onsiteChannelCategorySaveSchema>;

export const onsiteChannelRowSchema = z.object({
  id: z.number(),
  categoryId: z.number(),
  categoryName: z.string(),
  name: z.string(),
  contact: z.string(),
  phone: z.string(),
  rate: z.number(),
  status: z.string(),
  orderCount: z.number(),
  commissionCents: z.number(),
});
export type OnsiteChannelRow = z.infer<typeof onsiteChannelRowSchema>;

export const onsiteChannelSaveSchema = z.object({
  id: z.number().int().positive().optional(),
  categoryId: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(80),
  contact: z.string().trim().max(60).default(""),
  phone: z.string().trim().max(32).default(""),
  rate: z.number().min(0).max(100).default(0),
});
export type OnsiteChannelSave = z.infer<typeof onsiteChannelSaveSchema>;

export const onsitePartnerRowSchema = z.object({
  id: z.number(),
  staffId: z.number(),
  staffName: z.string(),
  name: z.string(),
  rate: z.number(),
  status: z.string(),
  commissionCents: z.number(),
});
export type OnsitePartnerRow = z.infer<typeof onsitePartnerRowSchema>;

export const onsitePartnerSaveSchema = z.object({
  id: z.number().int().positive().optional(),
  staffId: z.number().int().positive(),
  name: z.string().trim().max(60).default(""),
  rate: z.number().min(0).max(100).default(0),
});
export type OnsitePartnerSave = z.infer<typeof onsitePartnerSaveSchema>;

export const onsiteDistributorRowSchema = z.object({
  id: z.number(),
  customerId: z.number(),
  customerName: z.string(),
  realName: z.string(),
  phone: z.string(),
  levelName: z.string(),
  rate: z.number(),
  status: z.string(),
  pid: z.number(),
  rejectReason: z.string(),
  reviewedAt: z.string(),
  orderCount: z.number(),
  commissionCents: z.number(),
  createdAt: z.string(),
});
export type OnsiteDistributorRow = z.infer<typeof onsiteDistributorRowSchema>;

export const onsiteDistributorReviewSchema = z.object({
  profileId: z.number().int().positive(),
  approve: z.boolean(),
  levelName: z.string().trim().max(40).default(""),
  rate: z.number().min(0).max(100).default(0),
  rejectReason: z.string().trim().max(200).default(""),
});
export type OnsiteDistributorReview = z.infer<typeof onsiteDistributorReviewSchema>;

export const onsiteRelationRowSchema = z.object({
  id: z.number(),
  customerId: z.number(),
  customerName: z.string(),
  pid: z.number(),
  channelId: z.number(),
  channelName: z.string(),
  salesmanId: z.number(),
  salesmanName: z.string(),
  agentId: z.number(),
  agentName: z.string(),
  source: z.string(),
  expiresAt: z.string(),
  createdAt: z.string(),
});
export type OnsiteRelationRow = z.infer<typeof onsiteRelationRowSchema>;

export const onsiteRelationBindSchema = z.object({
  customerId: z.number().int().positive(),
  pid: z.number().int().min(0).default(0),
  channelId: z.number().int().min(0).default(0),
  salesmanId: z.number().int().min(0).default(0),
  agentId: z.number().int().min(0).default(0),
  expiresAt: z.string().trim().max(30).default(""),
});
export type OnsiteRelationBind = z.infer<typeof onsiteRelationBindSchema>;

/** 店主/代理海报：后端排版为 SVG（内嵌小程序码），店主端可预览、下载或交给小程序 canvas 重绘。 */
export const onsitePosterSchema = z.object({
  kind: z.enum(["SHOP", "AGENT"]),
  title: z.string(),
  subtitle: z.string(),
  contact: z.string(),
  shopName: z.string(),
  qrcodeUrl: z.string(),
  posterUrl: z.string(),
  width: z.number(),
  height: z.number(),
});
export type OnsitePoster = z.infer<typeof onsitePosterSchema>;

export const onsiteStatusToggleSchema = z.object({
  status: z.string().trim().min(1).max(16),
});
export type OnsiteStatusToggle = z.infer<typeof onsiteStatusToggleSchema>;

const onsiteP2QueryOf = <const T extends readonly [string, ...string[]]>(statuses: T) =>
  z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    keyword: z.string().trim().max(60).default(""),
    status: z.enum(["ALL", ...statuses] as const).default("ALL"),
  });

const couponQuerySchema = onsiteP2QueryOf(["ON", "OFF"] as const);
const activityQuerySchema = onsiteP2QueryOf(["ON", "OFF"] as const);
const distributorQuerySchema = onsiteP2QueryOf(["PENDING", "APPROVED", "REJECTED", "DISABLED"] as const);
const withdrawalQuerySchema = onsiteP2QueryOf([
  "PENDING",
  "APPROVED",
  "PAID",
  "REJECTED",
  "CANCELLED",
] as const);
const rechargeQuerySchema = onsiteP2QueryOf(["UNPAID", "PAID", "CANCELLED", "EXPIRED"] as const);
const commissionQuerySchema = onsiteP2QueryOf(["PENDING", "ACTIVE", "REVERSED"] as const);

/** 余额流水按顾客筛选：customerId=0 表示全店。 */
const balanceFlowQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  customerId: z.coerce.number().int().min(0).default(0),
});

const shopPath = z.object({ id: z.string() });

const onsiteP2Endpoints = {
  // ---------- 营销：券 / 活动 / 邀请 ----------
  Onsite_coupons: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/coupons",
    params: shopPath,
    query: couponQuerySchema,
    body: z.undefined(),
    response: envelope(pageSchema(onsiteCouponRowSchema)),
  },
  Onsite_saveCoupon: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/coupons",
    params: shopPath,
    query: emptyQuery,
    body: onsiteCouponSaveSchema,
    response: envelope(onsiteCouponRowSchema),
  },
  Onsite_removeCoupon: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/coupons/:couponId/remove",
    params: z.object({ id: z.string(), couponId: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ id: z.number() })),
  },
  Onsite_setCouponStatus: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/coupons/:couponId/status",
    params: z.object({ id: z.string(), couponId: z.string() }),
    query: emptyQuery,
    body: onsiteStatusToggleSchema,
    response: envelope(onsiteCouponRowSchema),
  },
  Onsite_issueCoupon: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/coupons/:couponId/issue",
    params: z.object({ id: z.string(), couponId: z.string() }),
    query: emptyQuery,
    body: z.object({
      customerIds: z.array(z.number().int().positive()).min(1).max(200),
    }),
    response: envelope(z.object({ issued: z.number(), skipped: z.number() })),
  },
  Onsite_couponTickets: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/coupons/:couponId/tickets",
    params: z.object({ id: z.string(), couponId: z.string() }),
    query: onsiteP2QuerySchema,
    body: z.undefined(),
    response: envelope(pageSchema(onsiteCouponTicketRowSchema)),
  },
  Onsite_activities: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/activities",
    params: shopPath,
    query: activityQuerySchema,
    body: z.undefined(),
    response: envelope(pageSchema(onsiteActivityRowSchema)),
  },
  Onsite_saveActivity: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/activities",
    params: shopPath,
    query: emptyQuery,
    body: onsiteActivitySaveSchema,
    response: envelope(onsiteActivityRowSchema),
  },
  Onsite_setActivityStatus: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/activities/:activityId/status",
    params: z.object({ id: z.string(), activityId: z.string() }),
    query: emptyQuery,
    body: onsiteStatusToggleSchema,
    response: envelope(onsiteActivityRowSchema),
  },
  Onsite_activityRecords: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/activities/:activityId/records",
    params: z.object({ id: z.string(), activityId: z.string() }),
    query: onsiteP2QuerySchema,
    body: z.undefined(),
    response: envelope(pageSchema(onsiteActivityRecordRowSchema)),
  },
  Onsite_invites: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/invites",
    params: shopPath,
    query: onsiteP2QuerySchema,
    body: z.undefined(),
    response: envelope(pageSchema(onsiteInviteRowSchema)),
  },

  // ---------- 财务：分账 / 结算 / 提现 / 余额 ----------
  Onsite_incomeOverview: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/finance/overview",
    params: shopPath,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(onsiteIncomeOverviewSchema),
  },
  Onsite_commissionRules: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/finance/commission-rules",
    params: shopPath,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ list: z.array(onsiteCommissionRuleRowSchema) })),
  },
  Onsite_saveCommissionRule: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/finance/commission-rules",
    params: shopPath,
    query: emptyQuery,
    body: onsiteCommissionRuleSaveSchema,
    response: envelope(onsiteCommissionRuleRowSchema),
  },
  Onsite_orderCommissions: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/finance/commissions",
    params: shopPath,
    query: commissionQuerySchema,
    body: z.undefined(),
    response: envelope(pageSchema(onsiteOrderCommissionRowSchema)),
  },
  Onsite_balanceCards: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/finance/balance-cards",
    params: shopPath,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ list: z.array(onsiteBalanceCardRowSchema) })),
  },
  Onsite_saveBalanceCard: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/finance/balance-cards",
    params: shopPath,
    query: emptyQuery,
    body: onsiteBalanceCardSaveSchema,
    response: envelope(onsiteBalanceCardRowSchema),
  },
  Onsite_removeBalanceCard: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/finance/balance-cards/:cardId/remove",
    params: z.object({ id: z.string(), cardId: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ id: z.number() })),
  },
  Onsite_rechargeOrders: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/finance/recharges",
    params: shopPath,
    query: rechargeQuerySchema,
    body: z.undefined(),
    response: envelope(pageSchema(onsiteRechargeRowSchema)),
  },
  Onsite_confirmRecharge: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/finance/recharges/:rechargeId/confirm",
    params: z.object({ id: z.string(), rechargeId: z.string() }),
    query: emptyQuery,
    body: z.object({ remark: z.string().trim().max(200).default("") }),
    response: envelope(onsiteRechargeRowSchema),
  },
  Onsite_balanceFlows: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/finance/balance-flows",
    params: shopPath,
    query: balanceFlowQuerySchema,
    body: z.undefined(),
    response: envelope(pageSchema(onsiteBalanceFlowRowSchema)),
  },
  Onsite_adjustBalance: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/finance/balance-adjust",
    params: shopPath,
    query: emptyQuery,
    body: onsiteBalanceAdjustSchema,
    response: envelope(z.object({ customerId: z.number(), balanceCents: z.number() })),
  },
  Onsite_adjustPoints: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/finance/points-adjust",
    params: shopPath,
    query: emptyQuery,
    body: onsitePointsAdjustSchema,
    response: envelope(z.object({ customerId: z.number(), points: z.number() })),
  },
  Onsite_settlements: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/finance/settlements",
    params: shopPath,
    query: onsiteP2QuerySchema,
    body: z.undefined(),
    response: envelope(pageSchema(onsiteSettlementRowSchema)),
  },
  Onsite_createSettlement: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/finance/settlements",
    params: shopPath,
    query: emptyQuery,
    body: onsiteSettlementCreateSchema,
    response: envelope(onsiteSettlementRowSchema),
  },
  Onsite_paySettlement: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/finance/settlements/:settlementId/pay",
    params: z.object({ id: z.string(), settlementId: z.string() }),
    query: emptyQuery,
    body: z.object({ remark: z.string().trim().max(200).default("") }),
    response: envelope(onsiteSettlementRowSchema),
  },
  Onsite_withdrawals: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/finance/withdrawals",
    params: shopPath,
    query: withdrawalQuerySchema,
    body: z.undefined(),
    response: envelope(pageSchema(onsiteWithdrawalRowSchema)),
  },
  Onsite_handleWithdrawal: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/finance/withdrawals/:withdrawalId/handle",
    params: z.object({ id: z.string(), withdrawalId: z.string() }),
    query: emptyQuery,
    body: onsiteWithdrawalHandleSchema,
    response: envelope(onsiteWithdrawalRowSchema),
  },

  // ---------- 代理 / 业务员 / 渠道 / 合伙人 / 分销商 ----------
  Onsite_agents: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/agents",
    params: shopPath,
    query: onsiteP2QuerySchema,
    body: z.undefined(),
    response: envelope(z.object({ list: z.array(onsiteAgentRowSchema) })),
  },
  Onsite_saveAgent: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/agents",
    params: shopPath,
    query: emptyQuery,
    body: onsiteAgentSaveSchema,
    response: envelope(onsiteAgentRowSchema),
  },
  Onsite_setAgentStatus: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/agents/:agentId/status",
    params: z.object({ id: z.string(), agentId: z.string() }),
    query: emptyQuery,
    body: onsiteStatusToggleSchema,
    response: envelope(onsiteAgentRowSchema),
  },
  Onsite_salesmen: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/salesmen",
    params: shopPath,
    query: onsiteP2QuerySchema,
    body: z.undefined(),
    response: envelope(z.object({ list: z.array(onsiteSalesmanRowSchema) })),
  },
  Onsite_saveSalesman: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/salesmen",
    params: shopPath,
    query: emptyQuery,
    body: onsiteSalesmanSaveSchema,
    response: envelope(onsiteSalesmanRowSchema),
  },
  Onsite_setSalesmanStatus: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/salesmen/:salesmanId/status",
    params: z.object({ id: z.string(), salesmanId: z.string() }),
    query: emptyQuery,
    body: onsiteStatusToggleSchema,
    response: envelope(onsiteSalesmanRowSchema),
  },
  Onsite_channelCategories: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/channel-categories",
    params: shopPath,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ list: z.array(onsiteChannelCategoryRowSchema) })),
  },
  Onsite_saveChannelCategory: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/channel-categories",
    params: shopPath,
    query: emptyQuery,
    body: onsiteChannelCategorySaveSchema,
    response: envelope(onsiteChannelCategoryRowSchema),
  },
  Onsite_removeChannelCategory: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/channel-categories/:categoryId/remove",
    params: z.object({ id: z.string(), categoryId: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ id: z.number() })),
  },
  Onsite_channels: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/channels",
    params: shopPath,
    query: onsiteP2QuerySchema,
    body: z.undefined(),
    response: envelope(z.object({ list: z.array(onsiteChannelRowSchema) })),
  },
  Onsite_saveChannel: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/channels",
    params: shopPath,
    query: emptyQuery,
    body: onsiteChannelSaveSchema,
    response: envelope(onsiteChannelRowSchema),
  },
  Onsite_setChannelStatus: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/channels/:channelId/status",
    params: z.object({ id: z.string(), channelId: z.string() }),
    query: emptyQuery,
    body: onsiteStatusToggleSchema,
    response: envelope(onsiteChannelRowSchema),
  },
  Onsite_partners: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/partners",
    params: shopPath,
    query: onsiteP2QuerySchema,
    body: z.undefined(),
    response: envelope(z.object({ list: z.array(onsitePartnerRowSchema) })),
  },
  Onsite_savePartner: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/partners",
    params: shopPath,
    query: emptyQuery,
    body: onsitePartnerSaveSchema,
    response: envelope(onsitePartnerRowSchema),
  },
  Onsite_distributors: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/distributors",
    params: shopPath,
    query: distributorQuerySchema,
    body: z.undefined(),
    response: envelope(pageSchema(onsiteDistributorRowSchema)),
  },
  Onsite_reviewDistributor: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/distributors/review",
    params: shopPath,
    query: emptyQuery,
    body: onsiteDistributorReviewSchema,
    response: envelope(onsiteDistributorRowSchema),
  },
  Onsite_relations: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/relations",
    params: shopPath,
    query: onsiteP2QuerySchema,
    body: z.undefined(),
    response: envelope(pageSchema(onsiteRelationRowSchema)),
  },
  Onsite_bindRelation: {
    method: "post" as const,
    path: "/enterprise/onsite/shops/:id/relations",
    params: shopPath,
    query: emptyQuery,
    body: onsiteRelationBindSchema,
    response: envelope(onsiteRelationRowSchema),
  },
  Onsite_poster: {
    method: "get" as const,
    path: "/enterprise/onsite/shops/:id/poster",
    params: shopPath,
    query: z.object({
      kind: z.enum(["SHOP", "AGENT"]).default("SHOP"),
      agentId: z.coerce.number().int().min(0).default(0),
    }),
    body: z.undefined(),
    response: envelope(onsitePosterSchema),
  },
} as const;

/** 上门服务的对外接口面：核心店铺 + P1 目录与引擎 + P1 交易与履约，三段合一个导出。 */
export const onsiteEndpoints = {
  ...onsiteCoreEndpoints,
  ...onsiteCatalogEndpoints,
  ...onsiteTradeEndpoints,
  ...onsiteTrade2Endpoints,
  ...onsiteP2Endpoints,
} as const;
