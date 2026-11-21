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

/**
 * 金额统一 number（两位小数）。Prisma 侧 `@db.Decimal(18, 2)`，
 * 服务层一律换算成「分」做整数运算后再回除，禁止浮点直接累加。
 */
const money = z.number().min(0).max(9_999_999_999);

/**
 * 工作台 · 建站管理 · 卡密商城小程序工具（参考「鲸发卡」业务口径全量按本站架构重写）。
 *
 * 每个本站用户可开一套自己的卡密（虚拟卡/兑换码）自动发货商店：`CardShop_*` 端点管站点、
 * 分类、卡密商品、卡密批次（文本/文件导入、去重、乱序、回收站、导出）、订单、券码、
 * 顾客、内容与小程序发布；`CardShopAdmin_*` 是平台侧配额与处置。
 *
 * 三条硬口径（详见 docs/建站管理·卡密商城小程序工具设计方案.md）：
 * 1. 资金直收——收款走店主自己的微信支付商户号（凭据在底座 miniprogram_apps，
 *    scene='CARD_SHOP'），平台不经手资金，因此本域没有资金账本、提现与代付；
 * 2. 客服复用系统 AI 客服（service-desk）——站点只存绑定的 deskSiteKey，
 *    小程序用 web-view 打开现成 `/embed/service-desk?key=`，本域不建任何会话表；
 * 3. 与其他建站业务零耦合——不引用 mall/knowledge-pay/onsite 业务表，
 *    关本板块只拦 `/enterprise/card-shop/**`，C 端公开通道不受开关影响。
 *
 * 小程序端（买家）只走 `/api/public/card-shop/*` 免登录公开通道；契约在此声明其
 * 请求/响应结构，路由由 `backend/src/card-shop/card-shop.public.ts` 手写注册，
 * 不进 JSON 契约与 OpenAPI。
 */

// ---------------------------------------------------------------- 枚举与文案

export const CARD_SHOP_SITE_STATUSES = [
  "DRAFT",
  "ONLINE",
  "SUSPENDED",
  "CLOSED",
] as const;
export type CardShopSiteStatus = (typeof CARD_SHOP_SITE_STATUSES)[number];
export const CARD_SHOP_SITE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "未上线",
  ONLINE: "营业中",
  SUSPENDED: "已停服",
  CLOSED: "已关闭",
};

export const CARD_SHOP_GOODS_STATUSES = [
  "DRAFT",
  "OFFLINE",
  "ONLINE",
  "FROZEN",
] as const;
export type CardShopGoodsStatus = (typeof CARD_SHOP_GOODS_STATUSES)[number];
export const CARD_SHOP_GOODS_STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  OFFLINE: "已下架",
  ONLINE: "销售中",
  FROZEN: "平台冻结",
};

/** 卡密状态机：AVAILABLE → LOCKED → SOLD；DISABLED 人工停用，VOID 批次撤回作废。 */
export const CARD_SHOP_CARD_STATUSES = [
  "AVAILABLE",
  "LOCKED",
  "SOLD",
  "DISABLED",
  "VOID",
] as const;
export type CardShopCardStatus = (typeof CARD_SHOP_CARD_STATUSES)[number];
export const CARD_SHOP_CARD_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: "可售",
  LOCKED: "待支付占用",
  SOLD: "已售",
  DISABLED: "已停用",
  VOID: "已作废",
};

export const CARD_SHOP_ORDER_STATES = [
  "PENDING",
  "PAID",
  "CLOSED",
  "REFUNDED",
] as const;
export type CardShopOrderState = (typeof CARD_SHOP_ORDER_STATES)[number];
export const CARD_SHOP_ORDER_STATE_LABELS: Record<string, string> = {
  PENDING: "待支付",
  PAID: "已支付",
  CLOSED: "已关闭",
  REFUNDED: "已退款",
};

/** 取卡密码：OFF 不要 | REQUIRED 买家必须设 | OPTIONAL 可选设（查单时才强校验）。 */
export const CARD_SHOP_TAKE_CARD_MODES = ["OFF", "REQUIRED", "OPTIONAL"] as const;
export type CardShopTakeCardMode =
  (typeof CARD_SHOP_TAKE_CARD_MODES)[number];
export const CARD_SHOP_TAKE_CARD_MODE_LABELS: Record<string, string> = {
  OFF: "不需要",
  REQUIRED: "必填",
  OPTIONAL: "选填",
};

/** 买家必填联系方式（对应参考版 contact_limit）。 */
export const CARD_SHOP_CONTACT_MODES = [
  "NONE",
  "ANY",
  "MOBILE",
  "EMAIL",
  "QQ",
] as const;
export type CardShopContactMode = (typeof CARD_SHOP_CONTACT_MODES)[number];
export const CARD_SHOP_CONTACT_MODE_LABELS: Record<string, string> = {
  NONE: "不用留",
  ANY: "手机/邮箱/QQ 任一",
  MOBILE: "手机号",
  EMAIL: "邮箱",
  QQ: "QQ 号",
};

/** SINGLE 只发卡密（多数兑换码）；PAIR 同时发卡号与卡密（多数点卡/账号卡）。 */
export const CARD_SHOP_CARD_FORMATS = ["SINGLE", "PAIR"] as const;
export type CardShopCardFormat = (typeof CARD_SHOP_CARD_FORMATS)[number];
export const CARD_SHOP_CARD_FORMAT_LABELS: Record<string, string> = {
  SINGLE: "仅卡密",
  PAIR: "卡号 + 卡密",
};

/** 库存展示口径（对应参考版 stock_display）：实际数字或分段描述。 */
export const CARD_SHOP_STOCK_DISPLAYS = ["ACTUAL", "RANGE"] as const;
export type CardShopStockDisplay = (typeof CARD_SHOP_STOCK_DISPLAYS)[number];
export const CARD_SHOP_STOCK_DISPLAY_LABELS: Record<string, string> = {
  ACTUAL: "显示实际库存",
  RANGE: "显示库存区间",
};

/** 出卡顺序（对应参考版 card_order，站点默认 + 商品覆盖）。 */
export const CARD_SHOP_CARD_ORDERS = ["OLDEST", "NEWEST", "RANDOM"] as const;
export type CardShopCardOrder = (typeof CARD_SHOP_CARD_ORDERS)[number];
export const CARD_SHOP_CARD_ORDER_LABELS: Record<string, string> = {
  OLDEST: "先卖老卡",
  NEWEST: "先卖新卡",
  RANDOM: "随机出卡",
};

export const CARD_SHOP_COUPON_KINDS = ["FIXED", "PERCENT"] as const;
export type CardShopCouponKind = (typeof CARD_SHOP_COUPON_KINDS)[number];
export const CARD_SHOP_COUPON_KIND_LABELS: Record<string, string> = {
  FIXED: "立减金额",
  PERCENT: "按比例折让",
};

export const CARD_SHOP_COUPON_STATUSES = [
  "UNUSED",
  "LOCKED",
  "USED",
  "DISABLED",
] as const;
export type CardShopCouponStatus = (typeof CARD_SHOP_COUPON_STATUSES)[number];
export const CARD_SHOP_COUPON_STATUS_LABELS: Record<string, string> = {
  UNUSED: "未使用",
  LOCKED: "下单占用",
  USED: "已核销",
  DISABLED: "已停用",
};

export const CARD_SHOP_CONTENT_KINDS = ["NOTICE", "ARTICLE", "PAGE"] as const;
export type CardShopContentKind = (typeof CARD_SHOP_CONTENT_KINDS)[number];
export const CARD_SHOP_CONTENT_KIND_LABELS: Record<string, string> = {
  NOTICE: "公告",
  ARTICLE: "资讯",
  PAGE: "单页",
};

/**
 * 站点开关（键名即 toggles JSON 的键）：关掉的模块在小程序端整块不渲染。
 * deskChat 关掉后客服入口降级为联系方式名片，不影响 AI 客服本身。
 */
export const CARD_SHOP_TOGGLE_KEYS = [
  "indexBanner",
  "indexNotice",
  "indexHot",
  "categoryPage",
  "search",
  "coupon",
  "protocol",
  "article",
  "deskChat",
  "contact",
  "myOrders",
] as const;
export type CardShopToggleKey = (typeof CARD_SHOP_TOGGLE_KEYS)[number];
export const CARD_SHOP_TOGGLE_LABELS: Record<string, string> = {
  indexBanner: "首页轮播图",
  indexNotice: "首页公告栏",
  indexHot: "首页热门推荐",
  categoryPage: "「分类」页签",
  search: "搜索功能",
  coupon: "优惠券抵扣",
  protocol: "购卡协议勾选",
  article: "资讯与单页",
  deskChat: "在线客服（AI 客服会话）",
  contact: "联系方式名片",
  myOrders: "「我的订单」（需微信登录）",
};

/** 卡密导入：分隔符 AUTO 时按首个有效行自动识别（空格 / 逗号 / 竖线 / 四个连字符）。 */
export const CARD_SHOP_IMPORT_SPLITTERS = [
  "AUTO",
  "SPACE",
  "COMMA",
  "PIPE",
  "DASH",
  "TAB",
  "NONE",
] as const;
export type CardShopImportSplitter = (typeof CARD_SHOP_IMPORT_SPLITTERS)[number];
export const CARD_SHOP_IMPORT_SPLITTER_LABELS: Record<string, string> = {
  AUTO: "自动识别",
  SPACE: "空格",
  COMMA: "逗号",
  PIPE: "竖线 |",
  DASH: "四个连字符 ----",
  TAB: "制表符",
  NONE: "整行当卡密",
};

export const CARD_SHOP_IMPORT_SOURCES = ["TEXT", "FILE"] as const;

/** 库存区间文案（RANGE 口径下小程序展示这三档）。 */
export const CARD_SHOP_STOCK_LEVELS = ["FULL", "TIGHT", "SOLD_OUT"] as const;
export type CardShopStockLevel = (typeof CARD_SHOP_STOCK_LEVELS)[number];
export const CARD_SHOP_STOCK_LEVEL_LABELS: Record<string, string> = {
  FULL: "库存充足",
  TIGHT: "库存紧张",
  SOLD_OUT: "已售罄",
};

/** CARD_SHOP 场景常量：与底座 PRIVATE_MINI_SCENES 对齐，编译期就挡住拼错。 */
export const CARD_SHOP_MINI_SCENE = "CARD_SHOP" satisfies (typeof PRIVATE_MINI_SCENES)[number];

// ---------------------------------------------------------------- 站点

export const cardShopContactSchema = z.object({
  phone: z.string().max(32).default(""),
  qq: z.string().max(32).default(""),
  wechat: z.string().max(64).default(""),
  email: z.string().max(120).default(""),
});
export type CardShopContact = z.infer<typeof cardShopContactSchema>;

export const cardShopTogglesSchema = z.object({
  indexBanner: z.boolean().default(true),
  indexNotice: z.boolean().default(true),
  indexHot: z.boolean().default(true),
  categoryPage: z.boolean().default(true),
  search: z.boolean().default(true),
  coupon: z.boolean().default(true),
  protocol: z.boolean().default(true),
  article: z.boolean().default(true),
  deskChat: z.boolean().default(true),
  contact: z.boolean().default(true),
  myOrders: z.boolean().default(true),
});
export type CardShopToggles = z.infer<typeof cardShopTogglesSchema>;
export const CARD_SHOP_DEFAULT_TOGGLES = cardShopTogglesSchema.parse({});

export const cardShopSiteSchema = z.object({
  id: z.number(),
  siteCode: z.string(),
  name: z.string(),
  logo: z.string(),
  slogan: z.string(),
  themeColor: z.string(),
  notice: z.string(),
  serviceContact: cardShopContactSchema,
  /** 绑定的 AI 客服（service-desk）服务站 siteKey，空串 = 未绑定 */
  deskSiteKey: z.string(),
  /** 绑定的服务站名称（便于管理端回显，反查 service_desk_sites 得到） */
  deskSiteName: z.string(),
  toggles: cardShopTogglesSchema,
  stockDisplayMode: z.enum(CARD_SHOP_STOCK_DISPLAYS),
  cardOrderMode: z.enum(CARD_SHOP_CARD_ORDERS),
  lockMinutes: z.number(),
  protocolText: z.string(),
  status: z.enum(CARD_SHOP_SITE_STATUSES),
  offReason: z.string(),
  /** 站点对外地址：登记微信「request 合法域名 / 业务域名」时要填它，未配置为空串 */
  siteUrl: z.string(),
  goodsTotal: z.number(),
  cardAvailableTotal: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CardShopSite = z.infer<typeof cardShopSiteSchema>;

/** 站点保存：id 为 0 表示新建（配额内），字符串留空表示不改动。 */
export const cardShopSiteSaveBodySchema = z.object({
  id: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(120),
  logo: z.string().max(500).default(""),
  slogan: z.string().max(200).default(""),
  themeColor: z.string().trim().max(16).default("#3370FF"),
  notice: z.string().max(500).default(""),
  serviceContact: cardShopContactSchema.partial().default({}),
  /** 绑定/解绑 AI 客服服务站；传空串即解绑 */
  deskSiteKey: z.string().max(64).default(""),
  toggles: cardShopTogglesSchema.partial().default({}),
  stockDisplayMode: z.enum(CARD_SHOP_STOCK_DISPLAYS).default("RANGE"),
  cardOrderMode: z.enum(CARD_SHOP_CARD_ORDERS).default("OLDEST"),
  lockMinutes: z.number().int().min(1).max(1440).default(15),
  protocolText: z.string().max(200_000).default(""),
});
export type CardShopSiteSaveBody = z.infer<typeof cardShopSiteSaveBodySchema>;

export const cardShopSiteStatusBodySchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(CARD_SHOP_SITE_STATUSES),
  reason: z.string().max(500).default(""),
});

export const cardShopOverviewSchema = z.object({
  site: cardShopSiteSchema.nullable(),
  todayAmount: money,
  todayPaidOrders: z.number(),
  pendingOrders: z.number(),
  totalAmount: money,
  totalPaidOrders: z.number(),
  goodsTotal: z.number(),
  onlineGoodsTotal: z.number(),
  availableCards: z.number(),
  customerTotal: z.number(),
  /** 库存预警商品清单（可用卡数低于阈值或为 0 的在售商品） */
  stockWarnings: z.array(
    z.object({ id: z.number(), name: z.string(), available: z.number() }),
  ),
  /** 七天内每日销售额，概览页柱图用 */
  dailyTrend: z.array(
    z.object({ date: z.string(), amount: money, orders: z.number() }),
  ),
});
export type CardShopOverview = z.infer<typeof cardShopOverviewSchema>;

// ---------------------------------------------------------------- 分类

export const cardShopCategorySchema = z.object({
  id: z.number(),
  siteId: z.number(),
  name: z.string(),
  icon: z.string(),
  remark: z.string(),
  sort: z.number(),
  status: z.boolean(),
  goodsTotal: z.number(),
  createdAt: z.string(),
});
export type CardShopCategory = z.infer<typeof cardShopCategorySchema>;

export const cardShopCategorySaveBodySchema = z.object({
  siteId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(60),
  icon: z.string().max(500).default(""),
  remark: z.string().max(200).default(""),
  sort: z.number().int().min(0).max(9999).default(0),
  status: z.boolean().default(true),
});

// ---------------------------------------------------------------- 商品

export const cardShopWholesaleTierSchema = z.object({
  /** 达到该数量即享受 price（张） */
  min: z.number().int().min(1).max(100000),
  price: money,
});
export type CardShopWholesaleTier = z.infer<typeof cardShopWholesaleTierSchema>;

/** 库存视图：ACTUAL 给数字，RANGE 给区间档位；两者都带，端上按站点口径取。 */
export const cardShopStockSchema = z.object({
  available: z.number(),
  locked: z.number(),
  sold: z.number(),
  level: z.enum(CARD_SHOP_STOCK_LEVELS),
  levelLabel: z.string(),
});
export type CardShopStock = z.infer<typeof cardShopStockSchema>;

export const cardShopGoodsSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  categoryId: z.number(),
  categoryName: z.string(),
  name: z.string(),
  subtitle: z.string(),
  coverImage: z.string(),
  images: z.array(z.string()),
  price: money,
  marketPrice: money,
  wholesaleTiers: z.array(cardShopWholesaleTierSchema),
  limitQuantity: z.number(),
  maxQuantity: z.number(),
  stockWarn: z.number(),
  couponEnabled: z.boolean(),
  takeCardMode: z.enum(CARD_SHOP_TAKE_CARD_MODES),
  /** 是否设了访问密码（只回有无，永不回显密文与明文） */
  visitPasswordSet: z.boolean(),
  contactMode: z.enum(CARD_SHOP_CONTACT_MODES),
  notifyFlags: z.object({
    merchantStation: z.boolean(),
    buyerEmail: z.boolean(),
  }),
  cardFormat: z.enum(CARD_SHOP_CARD_FORMATS),
  intro: z.string(),
  detail: z.string(),
  remark: z.string(),
  cardOrderMode: z.string(),
  hot: z.boolean(),
  sort: z.number(),
  viewCount: z.number(),
  soldCount: z.number(),
  status: z.enum(CARD_SHOP_GOODS_STATUSES),
  trashedAt: z.string().nullable(),
  stock: cardShopStockSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CardShopGoods = z.infer<typeof cardShopGoodsSchema>;

export const cardShopGoodsSaveBodySchema = z.object({
  siteId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  categoryId: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(200),
  subtitle: z.string().max(200).default(""),
  coverImage: z.string().max(500).default(""),
  images: z.array(z.string().max(500)).max(9).default([]),
  price: money,
  marketPrice: money.default(0),
  wholesaleTiers: z.array(cardShopWholesaleTierSchema).max(20).default([]),
  limitQuantity: z.number().int().min(0).max(100000).default(0),
  maxQuantity: z.number().int().min(0).max(100000).default(0),
  stockWarn: z.number().int().min(0).max(100000).default(0),
  couponEnabled: z.boolean().default(false),
  takeCardMode: z.enum(CARD_SHOP_TAKE_CARD_MODES).default("OFF"),
  /** 明文只在写入这一次出现；传空串表示清空访问密码，不传表示保留原值 */
  visitPassword: z.string().max(64).optional(),
  contactMode: z.enum(CARD_SHOP_CONTACT_MODES).default("ANY"),
  notifyFlags: z
    .object({
      merchantStation: z.boolean().default(true),
      buyerEmail: z.boolean().default(false),
    })
    .default({ merchantStation: true, buyerEmail: false }),
  cardFormat: z.enum(CARD_SHOP_CARD_FORMATS).default("SINGLE"),
  intro: z.string().max(500).default(""),
  detail: z.string().max(200_000).default(""),
  remark: z.string().max(200_000).default(""),
  /** 空串 = 跟随站点默认出卡顺序 */
  cardOrderMode: z.enum([...CARD_SHOP_CARD_ORDERS, ""]).default(""),
  hot: z.boolean().default(false),
  sort: z.number().int().min(0).max(9999).default(0),
  status: z.enum(CARD_SHOP_GOODS_STATUSES).default("DRAFT"),
});
export type CardShopGoodsSaveBody = z.infer<typeof cardShopGoodsSaveBodySchema>;

export const cardShopGoodsListQuerySchema = z.object({
  siteId: z.coerce.number().int().positive(),
  keyword: z.string().trim().max(60).optional(),
  categoryId: z.coerce.number().int().min(0).optional(),
  status: z.enum(CARD_SHOP_GOODS_STATUSES).optional(),
  /** 1 只看库存预警 */
  warnOnly: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

// ---------------------------------------------------------------- 卡密

export const cardShopCardSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  goodsId: z.number(),
  goodsName: z.string(),
  batchId: z.number(),
  batchNo: z.string(),
  number: z.string(),
  /** 列表默认掩码（前 3 后 2），detail/export 才给明文 */
  secret: z.string(),
  secretMasked: z.boolean(),
  remark: z.string(),
  status: z.enum(CARD_SHOP_CARD_STATUSES),
  seq: z.number(),
  lockOrderId: z.number(),
  lockExpireAt: z.string().nullable(),
  soldOrderNo: z.string(),
  soldAt: z.string().nullable(),
  createdAt: z.string(),
  trashedAt: z.string().nullable(),
});
export type CardShopCard = z.infer<typeof cardShopCardSchema>;

export const cardShopCardListQuerySchema = z.object({
  siteId: z.coerce.number().int().positive(),
  goodsId: z.coerce.number().int().positive().optional(),
  batchId: z.coerce.number().int().positive().optional(),
  status: z.enum(CARD_SHOP_CARD_STATUSES).optional(),
  /** 1 = 只看回收站 */
  trash: z.coerce.number().int().min(0).max(1).default(0),
  keyword: z.string().trim().max(191).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
});

export const cardShopCardImportBodySchema = z.object({
  siteId: z.number().int().positive(),
  goodsId: z.number().int().positive(),
  source: z.enum(CARD_SHOP_IMPORT_SOURCES).default("TEXT"),
  /** source=TEXT 时的粘贴内容；一行一张卡 */
  content: z.string().max(8_000_000).default(""),
  /** source=FILE 时由前端先读成文本再传（避开 multipart 契约复杂度） */
  fileName: z.string().max(200).default(""),
  splitter: z.enum(CARD_SHOP_IMPORT_SPLITTERS).default("AUTO"),
  /** 同站点同商品内按卡号+卡密去重 */
  dedup: z.boolean().default(true),
  orderMode: z.enum(["SEQUENTIAL", "SHUFFLE"]).default("SEQUENTIAL"),
  remark: z.string().max(200).default(""),
});
export type CardShopCardImportBody = z.infer<
  typeof cardShopCardImportBodySchema
>;

export const cardShopCardImportResultSchema = z.object({
  batchNo: z.string(),
  batchId: z.number(),
  totalLines: z.number(),
  importedCount: z.number(),
  duplicatedCount: z.number(),
  invalidCount: z.number(),
  /** AUTO 识别出的实际分隔符（供前端提示） */
  splitterUsed: z.string(),
  splitterLabel: z.string(),
  /** 前若干条无效行的原因，便于用户改文件 */
  samples: z.array(z.object({ line: z.number(), reason: z.string() })),
  message: z.string(),
});
export type CardShopCardImportResult = z.infer<
  typeof cardShopCardImportResultSchema
>;

export const cardShopCardBatchSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  goodsId: z.number(),
  goodsName: z.string(),
  batchNo: z.string(),
  source: z.string(),
  splitter: z.string(),
  totalLines: z.number(),
  importedCount: z.number(),
  duplicatedCount: z.number(),
  invalidCount: z.number(),
  orderMode: z.string(),
  operator: z.string(),
  availableCount: z.number(),
  soldCount: z.number(),
  createdAt: z.string(),
});
export type CardShopCardBatch = z.infer<typeof cardShopCardBatchSchema>;

export const cardShopCardBatchRemoveBodySchema = z.object({
  siteId: z.number().int().positive(),
  batchId: z.number().int().positive(),
  /** true = 连已售出的一起进回收站（默认只撤未售出的，已售保留取证） */
  includeSold: z.boolean().default(false),
});

export const cardShopCardSaveBodySchema = z.object({
  siteId: z.number().int().positive(),
  id: z.number().int().positive(),
  number: z.string().max(191).default(""),
  secret: z.string().min(1).max(191),
  remark: z.string().max(200).default(""),
});

export const cardShopCardStatusBodySchema = z.object({
  siteId: z.number().int().positive(),
  ids: z.array(z.number().int().positive()).min(1).max(5000),
  /** AVAILABLE 恢复可售 | DISABLED 停用 | VOID 作废 */
  status: z.enum(["AVAILABLE", "DISABLED", "VOID"]),
});

export const cardShopCardRemoveBodySchema = z.object({
  siteId: z.number().int().positive(),
  ids: z.array(z.number().int().positive()).min(1).max(5000),
  /** 1 = 直接彻底删除（默认进回收站） */
  hard: z.coerce.number().int().min(0).max(1).default(0),
});

export const cardShopCardExportBodySchema = z.object({
  siteId: z.number().int().positive(),
  goodsId: z.number().int().positive(),
  status: z.enum(CARD_SHOP_CARD_STATUSES).optional(),
  batchId: z.number().int().positive().optional(),
  /** 1 = 明文导出（默认掩码，防误传） */
  plain: z.coerce.number().int().min(0).max(1).default(0),
});

export const cardShopCardExportResultSchema = z.object({
  fileName: z.string(),
  /**
   * 导出物直接回 CSV 文本，由前端存盘：不落对象存储——卡密明文进公开读的桶
   * 等于把库存搬到站外，且 OSS 未配置时导出会连带不可用。
   */
  content: z.string(),
  count: z.number(),
  /** 本次是否含明文卡密；plain=0 时卡密掩码，只能用来核对库存 */
  plain: z.boolean(),
  /** 行数超过单次导出上限时为 true，消息里说明截断了多少 */
  truncated: z.boolean(),
  message: z.string(),
});

// ---------------------------------------------------------------- 订单

export const cardShopOrderSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  orderNo: z.string(),
  goodsId: z.number(),
  goodsName: z.string(),
  goodsCover: z.string(),
  cardFormat: z.enum(CARD_SHOP_CARD_FORMATS),
  unitPrice: money,
  quantity: z.number(),
  productAmount: money,
  couponId: z.number(),
  discountAmount: money,
  totalAmount: money,
  contact: z.string(),
  notifyEmail: z.string(),
  payState: z.enum(CARD_SHOP_ORDER_STATES),
  payStateLabel: z.string(),
  transactionId: z.string(),
  paidAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  expireAt: z.string().nullable(),
  cardCount: z.number(),
  customerId: z.number(),
  openid: z.string(),
  createIp: z.string(),
  failReason: z.string(),
  createdAt: z.string(),
});
export type CardShopOrder = z.infer<typeof cardShopOrderSchema>;

/** 出货卡密（店主订单详情与买家取卡页共用结构；明文只在这两处出现）。 */
export const cardShopOrderCardSchema = z.object({
  id: z.number(),
  number: z.string(),
  secret: z.string(),
  sort: z.number(),
});
export type CardShopOrderCard = z.infer<typeof cardShopOrderCardSchema>;

export const cardShopOrderDetailSchema = cardShopOrderSchema.extend({
  cards: z.array(cardShopOrderCardSchema),
  /** 站点侧使用说明（买家取卡页展示） */
  goodsRemark: z.string(),
  takeCardMode: z.enum(CARD_SHOP_TAKE_CARD_MODES),
});
export type CardShopOrderDetail = z.infer<typeof cardShopOrderDetailSchema>;

export const cardShopOrderListQuerySchema = z.object({
  siteId: z.coerce.number().int().positive(),
  keyword: z.string().trim().max(60).optional(),
  goodsId: z.coerce.number().int().positive().optional(),
  payState: z.enum(CARD_SHOP_ORDER_STATES).optional(),
  /** 起止日 YYYY-MM-DD */
  from: z.string().trim().max(10).optional(),
  to: z.string().trim().max(10).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const cardShopOrderCloseBodySchema = z.object({
  siteId: z.number().int().positive(),
  orderId: z.number().int().positive(),
  reason: z.string().max(300).default("店主手动关闭"),
});

/** 补发：订单已支付但买家拿不到卡（换手机、误删）时，把原出货快照重新下发。 */
export const cardShopOrderReissueBodySchema = z.object({
  siteId: z.number().int().positive(),
  orderId: z.number().int().positive(),
  email: z.string().max(120).default(""),
});

// ---------------------------------------------------------------- 券码

export const cardShopCouponSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  code: z.string(),
  kind: z.enum(CARD_SHOP_COUPON_KINDS),
  value: money,
  categoryId: z.number(),
  categoryName: z.string(),
  minAmount: money,
  remark: z.string(),
  batchNo: z.string(),
  status: z.enum(CARD_SHOP_COUPON_STATUSES),
  usedOrderNo: z.string(),
  usedAt: z.string().nullable(),
  expireAt: z.string().nullable(),
  createdAt: z.string(),
});
export type CardShopCoupon = z.infer<typeof cardShopCouponSchema>;

export const cardShopCouponListQuerySchema = z.object({
  siteId: z.coerce.number().int().positive(),
  keyword: z.string().trim().max(40).optional(),
  status: z.enum(CARD_SHOP_COUPON_STATUSES).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
});

export const cardShopCouponGenerateBodySchema = z.object({
  siteId: z.number().int().positive(),
  kind: z.enum(CARD_SHOP_COUPON_KINDS).default("FIXED"),
  value: money,
  categoryId: z.number().int().min(0).default(0),
  minAmount: money.default(0),
  count: z.number().int().min(1).max(5000).default(10),
  /** 留空由服务端生成 CS 前缀码 */
  prefix: z.string().trim().max(12).default(""),
  expireAt: z.string().trim().max(32).default(""),
  remark: z.string().max(200).default(""),
});

export const cardShopCouponSaveBodySchema = z.object({
  siteId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  code: z.string().trim().min(1).max(40),
  kind: z.enum(CARD_SHOP_COUPON_KINDS).default("FIXED"),
  value: money,
  categoryId: z.number().int().min(0).default(0),
  minAmount: money.default(0),
  remark: z.string().max(200).default(""),
  expireAt: z.string().trim().max(32).default(""),
  status: z.enum(CARD_SHOP_COUPON_STATUSES).default("UNUSED"),
});

export const cardShopCouponRemoveBodySchema = z.object({
  siteId: z.number().int().positive(),
  ids: z.array(z.number().int().positive()).min(1).max(2000),
});

// ---------------------------------------------------------------- 顾客

export const cardShopCustomerSchema = z.object({
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
export type CardShopCustomer = z.infer<typeof cardShopCustomerSchema>;

export const cardShopCustomerListQuerySchema = z.object({
  siteId: z.coerce.number().int().positive(),
  keyword: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

// ---------------------------------------------------------------- 内容

export const cardShopContentSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  kind: z.enum(CARD_SHOP_CONTENT_KINDS),
  title: z.string(),
  summary: z.string(),
  coverImage: z.string(),
  images: z.array(z.string()),
  content: z.string(),
  link: z.string(),
  popAuto: z.boolean(),
  sort: z.number(),
  status: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CardShopContent = z.infer<typeof cardShopContentSchema>;

export const cardShopContentSaveBodySchema = z.object({
  siteId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  kind: z.enum(CARD_SHOP_CONTENT_KINDS).default("NOTICE"),
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(300).default(""),
  coverImage: z.string().max(500).default(""),
  images: z.array(z.string().max(500)).max(9).default([]),
  content: z.string().max(200_000).default(""),
  link: z.string().max(500).default(""),
  popAuto: z.boolean().default(false),
  sort: z.number().int().min(0).max(9999).default(0),
  status: z.boolean().default(true),
});

export const cardShopContentListQuerySchema = z.object({
  siteId: z.coerce.number().int().positive(),
  kind: z.enum(CARD_SHOP_CONTENT_KINDS).optional(),
  keyword: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

// ---------------------------------------------------------------- 出包与发布（复用私域底座视图）

/**
 * 出包与发布：凭据与版本包台账的结构体一律复用建站底座 `private-mini`
 * （`miniprogram_apps` / `miniprogram_tenant_releases` 按 scene + shopId 定位），
 * 本模块只补站点维度与卡密业务特有的提示，不再定义第二套。
 */

/** 保存主体凭据：留空的密钥字段表示保留原值（密钥永不回显）。 */
export const cardShopAppSaveBodySchema = miniAppInputSchema.extend({
  siteId: z.number().int().positive(),
});
export type CardShopAppSaveBody = z.infer<typeof cardShopAppSaveBodySchema>;

/**
 * 自检结果：底座结果之上补「下一步动作」与本机出口 IP。
 * 上传微信前必须把该 IP 加进小程序后台「代码上传」白名单。
 */
export const cardShopAppTestResultSchema = miniAppTestResultSchema.extend({
  nextAction: z.string().default(""),
  nextPath: z.string().default(""),
  serverIp: z.string().default(""),
});
export type CardShopAppTestResult = z.infer<typeof cardShopAppTestResultSchema>;

// ---------------------------------------------------------------- C 端（公开通道）结构体

/** 小程序 bootstrap：站点外观 + 开关 + 客服指向（AI 客服 siteKey）。 */
export const cardShopPublicBootstrapSchema = z.object({
  siteId: z.number(),
  siteCode: z.string(),
  name: z.string(),
  logo: z.string(),
  slogan: z.string(),
  themeColor: z.string(),
  notice: z.string(),
  toggles: cardShopTogglesSchema,
  stockDisplayMode: z.enum(CARD_SHOP_STOCK_DISPLAYS),
  contact: cardShopContactSchema,
  /** 在线客服：非空即小程序用 web-view 打开 `${apiBase}/embed/service-desk?key=…` */
  deskSiteKey: z.string(),
  deskEmbedUrl: z.string(),
  protocolEnabled: z.boolean(),
  protocolText: z.string(),
  categories: z.array(
    z.object({ id: z.number(), name: z.string(), icon: z.string() }),
  ),
  hotGoods: z.array(z.lazy(() => cardShopPublicGoodsSchema)),
  notices: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      summary: z.string(),
      content: z.string(),
      popAuto: z.boolean(),
    }),
  ),
  banners: z.array(
    z.object({ id: z.number(), title: z.string(), image: z.string(), link: z.string() }),
  ),
});
export type CardShopPublicBootstrap = z.infer<
  typeof cardShopPublicBootstrapSchema
>;

/** 买家可见商品：价格与库存口径，绝不含成本、券本与卡密。 */
export const cardShopPublicGoodsSchema = z.object({
  id: z.number(),
  categoryId: z.number(),
  name: z.string(),
  subtitle: z.string(),
  coverImage: z.string(),
  images: z.array(z.string()),
  price: money,
  marketPrice: money,
  wholesaleTiers: z.array(cardShopWholesaleTierSchema),
  limitQuantity: z.number(),
  maxQuantity: z.number(),
  couponEnabled: z.boolean(),
  takeCardMode: z.enum(CARD_SHOP_TAKE_CARD_MODES),
  /** 是否需要先过访问密码 */
  needVisitPassword: z.boolean(),
  contactMode: z.enum(CARD_SHOP_CONTACT_MODES),
  cardFormat: z.enum(CARD_SHOP_CARD_FORMATS),
  intro: z.string(),
  detail: z.string(),
  remark: z.string(),
  soldCount: z.number(),
  viewCount: z.number(),
  stock: cardShopStockSchema,
  /** ACTUAL 口径下给数字，RANGE 口径下给 0（端上按 level 展示） */
  stockCount: z.number(),
});
export type CardShopPublicGoods = z.infer<typeof cardShopPublicGoodsSchema>;

export const cardShopPublicOrderCreateBodySchema = z.object({
  site: z.string().trim().max(16).default(""),
  goodsId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(100000),
  contact: z.string().trim().max(120).default(""),
  email: z.string().trim().max(120).default(""),
  takeCardPassword: z.string().max(32).default(""),
  couponCode: z.string().trim().max(40).default(""),
  /** 买家同意购卡协议（站点开启协议时必为 true） */
  agreed: z.boolean().default(false),
});
export type CardShopPublicOrderCreateBody = z.infer<
  typeof cardShopPublicOrderCreateBodySchema
>;

export const cardShopPublicOrderCreatedSchema = z.object({
  orderNo: z.string(),
  totalAmount: money,
  quantity: z.number(),
  /** 未配置商户号或平台关掉收款时为空对象，端上走「暂未开通在线收款」提示 */
  payEnabled: z.boolean(),
  payParams: z
    .object({
      timeStamp: z.string(),
      nonceStr: z.string(),
      package: z.string(),
      signType: z.string(),
      paySign: z.string(),
    })
    .nullable(),
  /** 待支付订单的取卡凭据说明 */
  message: z.string(),
});
export type CardShopPublicOrderCreated = z.infer<
  typeof cardShopPublicOrderCreatedSchema
>;

/** 查单取卡：orderNo + contact（+ 取卡密码）三要素；不匹配统一同一句话。 */
export const cardShopPublicQuerySchema = z.object({
  orderNo: z.string().trim().min(1).max(40),
  contact: z.string().trim().max(120).default(""),
  takeCardPassword: z.string().max(32).default(""),
});

export const cardShopPublicQueryResultSchema = z.object({
  found: z.boolean(),
  payState: z.enum(CARD_SHOP_ORDER_STATES),
  payStateLabel: z.string(),
  orderNo: z.string(),
  goodsName: z.string(),
  quantity: z.number(),
  totalAmount: money,
  createdAt: z.string(),
  paidAt: z.string(),
  /** 仅已支付且已出货时非空 */
  cards: z.array(cardShopOrderCardSchema),
  remark: z.string(),
  cardFormat: z.enum(CARD_SHOP_CARD_FORMATS),
  needTakeCardPassword: z.boolean(),
  message: z.string(),
});
export type CardShopPublicQueryResult = z.infer<
  typeof cardShopPublicQueryResultSchema
>;

export const cardShopPublicLoginBodySchema = z.object({
  site: z.string().trim().max(16).default(""),
  code: z.string().trim().max(128).default(""),
});

export const cardShopPublicLoginResultSchema = z.object({
  token: z.string(),
  customerId: z.number(),
  nickname: z.string(),
  avatar: z.string(),
});

// ---------------------------------------------------------------- 平台侧

export const cardShopAdminSettingsSchema = z.object({
  enabled: z.boolean(),
  goodsQuota: z.number(),
  cardQuota: z.number(),
  importMaxLines: z.number(),
  importMaxBytes: z.number(),
  payAllowed: z.boolean(),
  /** 商品名/说明敏感词，逗号分隔（虚拟卡密类易被拿去倒卖，平台侧硬闸门） */
  keywordFilter: z.array(z.string()),
  siteTotal: z.number(),
  onlineSiteTotal: z.number(),
  orderTotal: z.number(),
  orderAmountTotal: money,
  updatedAt: z.string(),
});
export type CardShopAdminSettings = z.infer<typeof cardShopAdminSettingsSchema>;

export const cardShopAdminSettingsBodySchema = z.object({
  enabled: z.boolean().default(true),
  goodsQuota: z.number().int().min(10).max(100000).default(2000),
  cardQuota: z.number().int().min(100).max(2_000_000).default(200000),
  importMaxLines: z.number().int().min(100).max(200000).default(50000),
  importMaxBytes: z.number().int().min(1024).max(52_428_800).default(2_097_152),
  payAllowed: z.boolean().default(true),
  keywordFilter: z.array(z.string().trim().min(1).max(40)).max(500).default([]),
});

export const cardShopAdminOrderSearchQuerySchema = z.object({
  keyword: z.string().trim().min(1).max(60),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

/** 元信息：把枚举文案一次性下发，前端与小程序都不用第二份清单。 */
export const cardShopMetaSchema = z.object({
  scene: z.enum(PRIVATE_MINI_SCENES),
  siteStatusLabels: z.record(z.string(), z.string()),
  goodsStatusLabels: z.record(z.string(), z.string()),
  cardStatusLabels: z.record(z.string(), z.string()),
  orderStateLabels: z.record(z.string(), z.string()),
  takeCardModeLabels: z.record(z.string(), z.string()),
  contactModeLabels: z.record(z.string(), z.string()),
  cardFormatLabels: z.record(z.string(), z.string()),
  stockDisplayLabels: z.record(z.string(), z.string()),
  cardOrderLabels: z.record(z.string(), z.string()),
  couponKindLabels: z.record(z.string(), z.string()),
  couponStatusLabels: z.record(z.string(), z.string()),
  contentKindLabels: z.record(z.string(), z.string()),
  toggleLabels: z.record(z.string(), z.string()),
  toggleKeys: z.array(z.string()),
  splitterLabels: z.record(z.string(), z.string()),
  stockLevelLabels: z.record(z.string(), z.string()),
  limits: z.object({
    goodsQuota: z.number(),
    cardQuota: z.number(),
    importMaxLines: z.number(),
    importMaxBytes: z.number(),
    payAllowed: z.boolean(),
    enabled: z.boolean(),
  }),
});
export type CardShopMeta = z.infer<typeof cardShopMetaSchema>;

// ---------------------------------------------------------------- 端点清单

/**
 * 一律用 query 传 id、不用路径参数：Hono 按注册顺序匹配，静态段会被先注册的
 * `:param` 兄弟路径吃掉（_geo-site 已踩过_），本模块从源头规避。
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

/**
 * 卡密商城小程序工具端点：`CardShop_` 店主侧（`/enterprise/card-shop/**`）、
 * `CardShopAdmin_` 平台侧（`/enterprise/admin/card-shop/**`），由 `moduleHandlers`
 * 按 operationId 后缀自动挂到控制器同名方法上。
 */
/** 请求体/查询参数与结果行的一次性类型导出：后端控制器与前端 API 层都按这些名字引用。 */
export type CardShopSiteStatusBody = z.infer<typeof cardShopSiteStatusBodySchema>;
export type CardShopCategorySaveBody = z.infer<typeof cardShopCategorySaveBodySchema>;
export type CardShopGoodsListQuery = z.infer<typeof cardShopGoodsListQuerySchema>;
export type CardShopCardListQuery = z.infer<typeof cardShopCardListQuerySchema>;
export type CardShopCardBatchRemoveBody = z.infer<typeof cardShopCardBatchRemoveBodySchema>;
export type CardShopCardSaveBody = z.infer<typeof cardShopCardSaveBodySchema>;
export type CardShopCardStatusBody = z.infer<typeof cardShopCardStatusBodySchema>;
export type CardShopCardRemoveBody = z.infer<typeof cardShopCardRemoveBodySchema>;
export type CardShopCardExportBody = z.infer<typeof cardShopCardExportBodySchema>;
export type CardShopCardExportResult = z.infer<typeof cardShopCardExportResultSchema>;
export type CardShopOrderListQuery = z.infer<typeof cardShopOrderListQuerySchema>;
export type CardShopOrderCloseBody = z.infer<typeof cardShopOrderCloseBodySchema>;
export type CardShopOrderReissueBody = z.infer<typeof cardShopOrderReissueBodySchema>;
export type CardShopCouponListQuery = z.infer<typeof cardShopCouponListQuerySchema>;
export type CardShopCouponGenerateBody = z.infer<typeof cardShopCouponGenerateBodySchema>;
export type CardShopCouponSaveBody = z.infer<typeof cardShopCouponSaveBodySchema>;
export type CardShopCouponRemoveBody = z.infer<typeof cardShopCouponRemoveBodySchema>;
export type CardShopCustomerListQuery = z.infer<typeof cardShopCustomerListQuerySchema>;
export type CardShopContentSaveBody = z.infer<typeof cardShopContentSaveBodySchema>;
export type CardShopContentListQuery = z.infer<typeof cardShopContentListQuerySchema>;
export type CardShopPublicQuery = z.infer<typeof cardShopPublicQuerySchema>;
export type CardShopPublicLoginBody = z.infer<typeof cardShopPublicLoginBodySchema>;
export type CardShopPublicLoginResult = z.infer<typeof cardShopPublicLoginResultSchema>;
export type CardShopAdminSettingsBody = z.infer<typeof cardShopAdminSettingsBodySchema>;
export type CardShopAdminOrderSearchQuery = z.infer<typeof cardShopAdminOrderSearchQuerySchema>;

export const cardShopEndpoints = {
  // ---------- 元信息与概览 ----------
  CardShop_meta: get("/enterprise/card-shop/meta", emptyQuery, cardShopMetaSchema),
  CardShop_overview: get(
    "/enterprise/card-shop/overview",
    siteQuery({}),
    cardShopOverviewSchema,
  ),

  // ---------- 站点 ----------
  CardShop_sites: get(
    "/enterprise/card-shop/site/list",
    emptyQuery,
    z.array(cardShopSiteSchema),
  ),
  CardShop_siteCreate: post(
    "/enterprise/card-shop/site/create",
    cardShopSiteSaveBodySchema,
    cardShopSiteSchema,
  ),
  CardShop_siteDetail: get(
    "/enterprise/card-shop/site/detail",
    siteQuery({}),
    cardShopSiteSchema,
  ),
  CardShop_siteSave: post(
    "/enterprise/card-shop/site/save",
    cardShopSiteSaveBodySchema,
    cardShopSiteSchema,
  ),
  CardShop_siteStatus: post(
    "/enterprise/card-shop/site/status",
    cardShopSiteStatusBodySchema,
    cardShopSiteSchema,
  ),
  CardShop_siteRemove: post(
    "/enterprise/card-shop/site/remove",
    z.object({ siteId: z.number().int().positive() }),
    okResult,
  ),

  // ---------- 小程序主体凭据（底座 miniprogram_apps，scene=CARD_SHOP）----------
  /** 一站一部独立小程序：AppID、上传密钥、商户号都属店主自己。 */
  CardShop_appDetail: get(
    "/enterprise/card-shop/app/detail",
    siteQuery({}),
    miniAppViewSchema,
  ),
  CardShop_appSave: post(
    "/enterprise/card-shop/app/save",
    cardShopAppSaveBodySchema,
    miniAppViewSchema,
  ),
  /** 自检 AppID/Secret 可用性与代码上传 IP 白名单前置条件。 */
  CardShop_appTest: post(
    "/enterprise/card-shop/app/test",
    siteIdBody({}),
    cardShopAppTestResultSchema,
  ),
  /** 自检微信支付 APIv3 凭据（商户证书序列号与私钥是否配对）。 */
  CardShop_payTest: post(
    "/enterprise/card-shop/app/pay-test",
    siteIdBody({}),
    z.object({ ok: z.boolean(), message: z.string() }),
  ),
  /** 小程序码：微信 wxacode.getUnlimited 生成，失败时回可执行提示。 */
  CardShop_qrcodeGenerate: post(
    "/enterprise/card-shop/app/qrcode",
    siteIdBody({ path: z.string().max(120).default("") }),
    miniAppViewSchema,
  ),

  // ---------- 分类 ----------
  CardShop_categories: get(
    "/enterprise/card-shop/category/list",
    siteQuery({}),
    z.array(cardShopCategorySchema),
  ),
  CardShop_categorySave: post(
    "/enterprise/card-shop/category/save",
    cardShopCategorySaveBodySchema,
    cardShopCategorySchema,
  ),
  CardShop_categoryRemove: post(
    "/enterprise/card-shop/category/remove",
    siteIdBody({ id: z.number().int().positive() }),
    okResult,
  ),

  // ---------- 商品 ----------
  CardShop_goodsList: get(
    "/enterprise/card-shop/goods/list",
    cardShopGoodsListQuerySchema,
    pageSchema(cardShopGoodsSchema),
  ),
  CardShop_goodsDetail: get(
    "/enterprise/card-shop/goods/detail",
    siteQuery({ id: z.coerce.number().int().positive() }),
    cardShopGoodsSchema,
  ),
  CardShop_goodsSave: post(
    "/enterprise/card-shop/goods/save",
    cardShopGoodsSaveBodySchema,
    cardShopGoodsSchema,
  ),
  CardShop_goodsStatus: post(
    "/enterprise/card-shop/goods/status",
    siteIdBody({
      ids: z.array(z.number().int().positive()).min(1).max(500),
      status: z.enum(CARD_SHOP_GOODS_STATUSES),
    }),
    z.object({ ok: z.boolean(), changed: z.number(), message: z.string() }),
  ),
  CardShop_goodsRemove: post(
    "/enterprise/card-shop/goods/remove",
    siteIdBody({ ids: z.array(z.number().int().positive()).min(1).max(500) }),
    okResult,
  ),
  CardShop_goodsRestore: post(
    "/enterprise/card-shop/goods/restore",
    siteIdBody({ ids: z.array(z.number().int().positive()).min(1).max(500) }),
    okResult,
  ),

  // ---------- 卡密 ----------
  CardShop_cardList: get(
    "/enterprise/card-shop/card/list",
    cardShopCardListQuerySchema,
    pageSchema(cardShopCardSchema),
  ),
  CardShop_cardImport: post(
    "/enterprise/card-shop/card/import",
    cardShopCardImportBodySchema,
    cardShopCardImportResultSchema,
  ),
  CardShop_cardSave: post(
    "/enterprise/card-shop/card/save",
    cardShopCardSaveBodySchema,
    cardShopCardSchema,
  ),
  CardShop_cardStatus: post(
    "/enterprise/card-shop/card/status",
    cardShopCardStatusBodySchema,
    z.object({ ok: z.boolean(), changed: z.number(), message: z.string() }),
  ),
  CardShop_cardRemove: post(
    "/enterprise/card-shop/card/remove",
    cardShopCardRemoveBodySchema,
    z.object({ ok: z.boolean(), changed: z.number(), message: z.string() }),
  ),
  CardShop_cardRestore: post(
    "/enterprise/card-shop/card/restore",
    siteIdBody({ ids: z.array(z.number().int().positive()).min(1).max(5000) }),
    z.object({ ok: z.boolean(), changed: z.number(), message: z.string() }),
  ),
  CardShop_batchList: get(
    "/enterprise/card-shop/card/batch/list",
    siteQuery({ goodsId: z.coerce.number().int().positive().optional() }),
    z.array(cardShopCardBatchSchema),
  ),
  CardShop_batchRemove: post(
    "/enterprise/card-shop/card/batch/remove",
    cardShopCardBatchRemoveBodySchema,
    z.object({ ok: z.boolean(), voided: z.number(), message: z.string() }),
  ),
  CardShop_cardExport: post(
    "/enterprise/card-shop/card/export",
    cardShopCardExportBodySchema,
    cardShopCardExportResultSchema,
  ),
  CardShop_stock: get(
    "/enterprise/card-shop/card/stock",
    siteQuery({}),
    z.array(
      z.object({
        goodsId: z.number(),
        name: z.string(),
        available: z.number(),
        locked: z.number(),
        sold: z.number(),
      }),
    ),
  ),

  // ---------- 订单 ----------
  CardShop_orderList: get(
    "/enterprise/card-shop/order/list",
    cardShopOrderListQuerySchema,
    pageSchema(cardShopOrderSchema),
  ),
  CardShop_orderDetail: get(
    "/enterprise/card-shop/order/detail",
    siteQuery({ id: z.coerce.number().int().positive() }),
    cardShopOrderDetailSchema,
  ),
  CardShop_orderClose: post(
    "/enterprise/card-shop/order/close",
    cardShopOrderCloseBodySchema,
    okResult,
  ),
  CardShop_orderReissue: post(
    "/enterprise/card-shop/order/reissue",
    cardShopOrderReissueBodySchema,
    okResult,
  ),

  // ---------- 券码 ----------
  CardShop_couponList: get(
    "/enterprise/card-shop/coupon/list",
    cardShopCouponListQuerySchema,
    pageSchema(cardShopCouponSchema),
  ),
  CardShop_couponGenerate: post(
    "/enterprise/card-shop/coupon/generate",
    cardShopCouponGenerateBodySchema,
    z.object({
      batchNo: z.string(),
      created: z.number(),
      codes: z.array(z.string()),
      message: z.string(),
    }),
  ),
  CardShop_couponSave: post(
    "/enterprise/card-shop/coupon/save",
    cardShopCouponSaveBodySchema,
    cardShopCouponSchema,
  ),
  CardShop_couponRemove: post(
    "/enterprise/card-shop/coupon/remove",
    cardShopCouponRemoveBodySchema,
    okResult,
  ),

  // ---------- 顾客 ----------
  CardShop_customerList: get(
    "/enterprise/card-shop/customer/list",
    cardShopCustomerListQuerySchema,
    pageSchema(cardShopCustomerSchema),
  ),
  CardShop_customerStatus: post(
    "/enterprise/card-shop/customer/status",
    siteIdBody({ id: z.number().int().positive(), status: z.boolean() }),
    okResult,
  ),

  // ---------- 内容 ----------
  CardShop_contentList: get(
    "/enterprise/card-shop/content/list",
    cardShopContentListQuerySchema,
    pageSchema(cardShopContentSchema),
  ),
  CardShop_contentDetail: get(
    "/enterprise/card-shop/content/detail",
    siteQuery({ id: z.coerce.number().int().positive() }),
    cardShopContentSchema,
  ),
  CardShop_contentSave: post(
    "/enterprise/card-shop/content/save",
    cardShopContentSaveBodySchema,
    cardShopContentSchema,
  ),
  CardShop_contentRemove: post(
    "/enterprise/card-shop/content/remove",
    siteIdBody({ id: z.number().int().positive() }),
    okResult,
  ),

  // ---------- 平台侧 ----------
  CardShopAdmin_settings: get(
    "/enterprise/admin/card-shop/settings",
    emptyQuery,
    cardShopAdminSettingsSchema,
  ),
  CardShopAdmin_saveSettings: post(
    "/enterprise/admin/card-shop/settings",
    cardShopAdminSettingsBodySchema,
    cardShopAdminSettingsSchema,
  ),
  CardShopAdmin_orderSearch: get(
    "/enterprise/admin/card-shop/order/search",
    cardShopAdminOrderSearchQuerySchema,
    pageSchema(cardShopOrderSchema),
  ),
} as const;
