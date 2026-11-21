import { z } from "zod";
import {
  MINI_APP_STATUS_LABELS,
  MINI_REVIEW_STATUS_LABELS,
  miniAppInputSchema,
  miniAppTestResultSchema,
  miniAppViewSchema,
} from "./private-mini";
import { pageQuerySchema } from "./pagination";

const envelope = <T extends z.ZodType>(data: T) =>
  z.object({ code: z.number(), message: z.string(), data: data.nullable() });
const emptyQuery = z.object({});
const okResult = z.object({ ok: z.boolean(), message: z.string() });

/**
 * 金额统一 number（两位小数）。Prisma 侧是 `@db.Decimal(12, 2)`，
 * 服务层一律换算成「分」做整数运算后再回除，禁止浮点直接累加。
 */
const money = z.number().min(0).max(99_999_999);

/**
 * 建站管理 · 电商小程序工具：每个本站用户开自己的微信小程序商城。
 *
 * 业务口径参考 CRMEB Merchant v4.2（多商户电商），但**租户模型是两层**：
 * 本站用户＝商城主人（`shopId` + `ownerUserId` 归属），C 端顾客归店铺、
 * 与站内 `User` 物理隔离；收款走**用户自己的微信商户号**，平台不经手资金。
 * 发布链路复用已实现的 `miniprogram-ci` 直传：按店注入配置出包 → 上传为该店
 * 小程序的**开发版**，提交审核与发布仍在用户自己的微信公众平台完成。
 *
 * 设计见 `docs/建站管理与电商小程序工具设计方案.md`。
 * `BrandMall_` 是店主侧（`/enterprise/brand-mall/**`），`BrandMallAdmin_` 是平台侧
 * （`/enterprise/admin/brand-mall/**`）；C 端顾客走 `/api/public/brand-mall/**`，
 * 契约只声明其请求/响应结构，路由在 `brand.public.ts` 手写注册。
 */

// ---------------------------------------------------------------- 枚举与文案

export const BRAND_SHOP_STATUSES = [
  "DRAFT",
  "ONLINE",
  "SUSPENDED",
  "CLOSED",
] as const;
export type BrandShopStatus = (typeof BRAND_SHOP_STATUSES)[number];
export const BRAND_SHOP_STATUS_LABELS: Record<string, string> = {
  DRAFT: "未上线",
  ONLINE: "营业中",
  SUSPENDED: "平台停服",
  CLOSED: "已关闭",
};

export const BRAND_PRODUCT_STATUSES = ["DRAFT", "OFFLINE", "ONLINE"] as const;
export type BrandProductStatus = (typeof BRAND_PRODUCT_STATUSES)[number];
export const BRAND_PRODUCT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  OFFLINE: "已下架",
  ONLINE: "销售中",
};

/** NORMAL 需发货；VIRTUAL 虚拟商品，下单即完成、不占库存不发货。 */
export const BRAND_PRODUCT_TYPES = ["NORMAL", "VIRTUAL"] as const;
export type BrandProductType = (typeof BRAND_PRODUCT_TYPES)[number];
export const BRAND_PRODUCT_TYPE_LABELS: Record<string, string> = {
  NORMAL: "实物商品",
  VIRTUAL: "虚拟商品",
};

export const BRAND_ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "PAID",
  "SHIPPED",
  "COMPLETED",
  "CANCELLED",
] as const;
export type BrandOrderStatus = (typeof BRAND_ORDER_STATUSES)[number];
export const BRAND_ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "待付款",
  PAID: "待发货",
  SHIPPED: "待收货",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

export const BRAND_PAY_STATUSES = [
  "UNPAID",
  "PAID",
  "REFUNDING",
  "REFUNDED",
] as const;
export const BRAND_PAY_STATUS_LABELS: Record<string, string> = {
  UNPAID: "未支付",
  PAID: "已支付",
  REFUNDING: "退款中",
  REFUNDED: "已退款",
};

/** 订单上的售后汇总态；逐单售后的明细态见 BRAND_REFUND_TICKET_STATUSES。 */
export const BRAND_REFUND_STATUSES = [
  "NONE",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "DONE",
] as const;
export const BRAND_REFUND_STATUS_LABELS: Record<string, string> = {
  NONE: "无售后",
  PENDING: "待处理",
  APPROVED: "待买家退货",
  REJECTED: "售后驳回",
  DONE: "已退款",
};

export const BRAND_PAY_TYPES = ["WECHAT", "BALANCE", "OFFLINE"] as const;
export type BrandPayType = (typeof BRAND_PAY_TYPES)[number];
export const BRAND_PAY_TYPE_LABELS: Record<string, string> = {
  WECHAT: "微信支付",
  BALANCE: "余额支付",
  OFFLINE: "线下支付",
};

export const BRAND_RETURN_TYPES = ["REFUND_ONLY", "RETURN_REFUND"] as const;
export type BrandReturnType = (typeof BRAND_RETURN_TYPES)[number];
export const BRAND_RETURN_TYPE_LABELS: Record<string, string> = {
  REFUND_ONLY: "仅退款",
  RETURN_REFUND: "退货退款",
};

export const BRAND_REFUND_TICKET_STATUSES = [
  "PENDING",
  "AGREED",
  "REJECTED",
  "REFUNDED",
  "CANCELLED",
] as const;
export type BrandRefundTicketStatus =
  (typeof BRAND_REFUND_TICKET_STATUSES)[number];
export const BRAND_REFUND_TICKET_STATUS_LABELS: Record<string, string> = {
  PENDING: "待处理",
  AGREED: "已同意",
  REJECTED: "已拒绝",
  REFUNDED: "已退款",
  CANCELLED: "已取消",
};

export const BRAND_CUSTOMER_STATUSES = ["ACTIVE", "BLOCKED"] as const;
export const BRAND_CUSTOMER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "正常",
  BLOCKED: "已拉黑",
};

export const BRAND_CUSTOMER_SOURCES = ["MINIPROGRAM", "H5", "QR", "MANUAL"] as const;
export const BRAND_CUSTOMER_SOURCE_LABELS: Record<string, string> = {
  MINIPROGRAM: "小程序",
  H5: "H5",
  QR: "推广码",
  MANUAL: "后台录入",
};

export const BRAND_BILL_TYPES = [
  "POINT_EARN",
  "POINT_USE",
  "BALANCE_PAY",
  "BALANCE_REFUND",
] as const;
export const BRAND_BILL_TYPE_LABELS: Record<string, string> = {
  POINT_EARN: "获得积分",
  POINT_USE: "抵扣积分",
  BALANCE_PAY: "余额支付",
  BALANCE_REFUND: "余额退款",
};

export const BRAND_COUPON_TYPES = ["FULL_REDUCE", "DISCOUNT"] as const;
export type BrandCouponType = (typeof BRAND_COUPON_TYPES)[number];
export const BRAND_COUPON_TYPE_LABELS: Record<string, string> = {
  FULL_REDUCE: "满减券",
  DISCOUNT: "折扣券",
};

export const BRAND_COUPON_VALID_TYPES = ["FIXED", "DAYS"] as const;
export const BRAND_COUPON_VALID_TYPE_LABELS: Record<string, string> = {
  FIXED: "固定有效期",
  DAYS: "领取后 N 天",
};

export const BRAND_COUPON_SCOPES = ["ALL", "CATEGORY", "PRODUCT"] as const;
export const BRAND_COUPON_SCOPE_LABELS: Record<string, string> = {
  ALL: "全场通用",
  CATEGORY: "指定分类",
  PRODUCT: "指定商品",
};

export const BRAND_COUPON_STATUSES = ["ONLINE", "OFFLINE", "ENDED"] as const;
export const BRAND_COUPON_STATUS_LABELS: Record<string, string> = {
  ONLINE: "发放中",
  OFFLINE: "已停发",
  ENDED: "已结束",
};

export const BRAND_TICKET_STATUSES = ["UNUSED", "USED", "EXPIRED"] as const;
export const BRAND_TICKET_STATUS_LABELS: Record<string, string> = {
  UNUSED: "未使用",
  USED: "已使用",
  EXPIRED: "已过期",
};

export const BRAND_DIY_PAGE_TYPES = [
  "HOME",
  "CATEGORY",
  "MINE",
  "ACTIVITY",
] as const;
export type BrandDiyPageType = (typeof BRAND_DIY_PAGE_TYPES)[number];
export const BRAND_DIY_PAGE_TYPE_LABELS: Record<string, string> = {
  HOME: "首页",
  CATEGORY: "分类页",
  MINE: "个人中心",
  ACTIVITY: "活动页",
};

export const BRAND_DIY_STATUSES = ["DRAFT", "PUBLISHED"] as const;
export const BRAND_DIY_STATUS_LABELS: Record<string, string> = {
  DRAFT: "未发布",
  PUBLISHED: "已发布",
};

/**
 * 首期组件白名单（与 `brand-mall-miniprogram/components/diy/*` 一一对应）。
 * 单一真源在 `backend/src/brand-mall/brand.diy-widgets.ts`，这里只声明可校验的枚举，
 * 组件的默认值与属性表单由 `BrandMall_diyWidgets` 下发，避免前后端两份清单。
 */
export const BRAND_DIY_WIDGETS = [
  "searchBar",
  "imageAds",
  "imageCube",
  "nav",
  "notice",
  "title",
  "goodsList",
  "coupon",
  "storeHead",
  "categoryLine",
  "richText",
  "spacer",
  "assist",
  "pageFoot",
] as const;
export type BrandDiyWidget = (typeof BRAND_DIY_WIDGETS)[number];

export const BRAND_LINK_TYPES = [
  "NONE",
  "PAGE",
  "PRODUCT",
  "CATEGORY",
  "COUPON",
  "WEBVIEW",
] as const;
export type BrandLinkType = (typeof BRAND_LINK_TYPES)[number];

/**
 * 出包通道、直传状态、审核态等枚举**一律用建站管理底座的**
 * （`MINIPROGRAM_RELEASE_CHANNELS` / `MINI_RELEASE_UPLOAD_STATUSES` / `MINI_REVIEW_STATUSES`），
 * 本模块不再重复定义一套同名异值的枚举。
 */

/** 店铺上线前的自检项：缺哪项就给哪项的跳转入口，不能只说「不可用」。 */
export const BRAND_CHECK_ITEMS = [
  "appConfig",
  "payConfig",
  "diyHome",
  "product",
  "release",
] as const;
export type BrandCheckItem = (typeof BRAND_CHECK_ITEMS)[number];

// ---------------------------------------------------------------- 店铺

export const brandTradeConfigSchema = z.object({
  /** 未付款自动取消分钟数。 */
  autoCancelMinutes: z.number().int().min(5).max(10080).default(30),
  /** 统一运费（首期不做运费模板）。 */
  freightAmount: money.default(0),
  /** 满额包邮门槛，0 = 永不包邮。 */
  freeFreightAmount: money.default(0),
  /** 最低下单金额，0 = 不限。 */
  minOrderAmount: money.default(0),
  /** 是否允许顾客申请售后。 */
  refundEnabled: z.boolean().default(true),
  /** 售后申请时限（确认收货后 N 天，0 = 不限）。 */
  refundDaysLimit: z.number().int().min(0).max(365).default(7),
  /** 下单确认页是否显示买家留言。 */
  buyerMessageEnabled: z.boolean().default(true),
  /** 积分总开关（关闭时不返分、不可抵扣）。 */
  pointsEnabled: z.boolean().default(false),
  /** 每消费 1 元返多少积分。 */
  pointsReturnRate: z.number().min(0).max(1000).default(1),
  /** 抵扣 1 元所需积分数，0 = 不允许抵扣。 */
  pointsPerYuan: z.number().min(0).max(100000).default(0),
  /** 单笔最多用积分抵扣实付金额的百分比。 */
  pointsDeductMaxPercent: z.number().int().min(0).max(100).default(0),
  /** 允许顾客自助取消未付款订单。 */
  selfCancelEnabled: z.boolean().default(true),
});
export type BrandTradeConfig = z.infer<typeof brandTradeConfigSchema>;

/**
 * 交易参数默认值：新开店铺与平台侧「默认交易参数」缺省都取这一份，
 * 保证契约、后端、前端三处不会各写一套。
 */
export const BRAND_DEFAULT_TRADE: BrandTradeConfig = {
  autoCancelMinutes: 30,
  freightAmount: 0,
  freeFreightAmount: 0,
  minOrderAmount: 0,
  refundEnabled: true,
  refundDaysLimit: 7,
  buyerMessageEnabled: true,
  pointsEnabled: false,
  pointsReturnRate: 1,
  pointsPerYuan: 0,
  pointsDeductMaxPercent: 0,
  selfCancelEnabled: true,
};

/** 店铺列表行：带三个计数，首页卡片直接可用。 */
export const brandShopSchema = z.object({
  id: z.number(),
  name: z.string(),
  /** 公开寻址码：底座 bootstrap 的 shopCode，创建后不变。 */
  shopCode: z.string(),
  logo: z.string(),
  slogan: z.string(),
  servicePhone: z.string(),
  status: z.enum(BRAND_SHOP_STATUSES),
  /** 平台停服原因（仅 SUSPENDED 有值）。 */
  offReason: z.string(),
  productCount: z.number(),
  onlineProductCount: z.number(),
  customerCount: z.number(),
  pendingShipCount: z.number(),
  themeColor: z.string(),
  /** 微信小程序凭据是否齐备（列表页徽标用）。 */
  wechatReady: z.boolean(),
  payReady: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BrandShop = z.infer<typeof brandShopSchema>;

/** 上线自检条目：`ok=false` 时 `action` 给出可点的跳转路径。 */
export const brandShopCheckSchema = z.object({
  key: z.enum(BRAND_CHECK_ITEMS),
  label: z.string(),
  ok: z.boolean(),
  hint: z.string(),
  action: z.string(),
});
export type BrandShopCheck = z.infer<typeof brandShopCheckSchema>;

export const brandShopDetailSchema = brandShopSchema.extend({
  trade: brandTradeConfigSchema,
  checks: z.array(brandShopCheckSchema),
  /** 自动开通的 AI 客服服务站 id（0 = 还没建）。 */
  supportSiteId: z.number().default(0),
  /** 站点 key（'' = 站点缺失，C 端客服页回落联系方式）。 */
  deskSiteKey: z.string().default(""),
  /** 站点名称只读回显；站点被删时为空串。 */
  deskSiteName: z.string().default(""),
  /** 站点是否可接客：false 时小程序只显示客服电话。 */
  deskReady: z.boolean().default(false),
});
export type BrandShopDetail = z.infer<typeof brandShopDetailSchema>;

export const brandShopCreateBodySchema = z.object({
  name: z.string().trim().min(2).max(30),
  /** 店铺标识：留空由后端生成；只用大写去混淆字母表，小程序码 scene 里手抄歧义最小。 */
  shopCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{4,16}$/)
    .optional(),
  logo: z.string().max(500).default(""),
  slogan: z.string().max(120).default(""),
  servicePhone: z.string().max(30).default(""),
  themeColor: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .default("#FA3534"),
});
export type BrandShopCreateBody = z.infer<typeof brandShopCreateBodySchema>;

export const brandShopUpdateBodySchema = brandShopCreateBodySchema
  .omit({ shopCode: true })
  .partial()
  .extend({
    shopId: z.number().int().positive(),
  });
export type BrandShopUpdateBody = z.infer<typeof brandShopUpdateBodySchema>;

/** 店铺状态迁移只允许营业中/暂停营业（CLOSED 由 remove 走删除流程）。 */
export const brandShopStatusBodySchema = z.object({
  shopId: z.number().int().positive(),
  status: z.enum(["DRAFT", "ONLINE", "CLOSED"]),
});
export type BrandShopStatusBody = z.infer<typeof brandShopStatusBodySchema>;

export const brandShopTradeBodySchema = z.object({
  shopId: z.number().int().positive(),
  trade: brandTradeConfigSchema,
});
export type BrandShopTradeBody = z.infer<typeof brandShopTradeBodySchema>;

// ---------------------------------------------------------------- 小程序主体（复用私域底座）

/**
 * 微信小程序凭据（AppID / AppSecret / 商户号 / APIv3 密钥）
 * 与代码包台账都归 `private-mini.ts` 的底座契约：
 * 一个店铺一行 `miniprogram_apps`（`scene='BRAND'`，AppID 全局唯一），
 * 一次出包一行 `miniprogram_tenant_releases`。**每个租户是各自独立的小程序主体**，
 * 共享的只是「按店铺注入配置出包 + 直传微信」这套机制，不是同一个小程序。
 * 因此本模块不再定义第二套凭据结构，只做店铺维度的读写入口。
 */

/** 保存主体凭据：留空的密钥字段表示保留原值（密钥不回显）。 */
export const brandAppSaveBodySchema = miniAppInputSchema.extend({
  shopId: z.number().int().positive(),
});
export type BrandAppSaveBody = z.infer<typeof brandAppSaveBodySchema>;

/**
 * 连通性自检结果：底座 `miniAppTestResultSchema` 之上补一条下一步指引，
 * 让「凭据不可用」在页面上永远是可点的动作而不是纯提示。
 */
export const brandAppTestResultSchema = miniAppTestResultSchema.extend({
  nextAction: z.string().default(""),
  nextPath: z.string().default(""),
  /** 本机出口 IP：上传微信前必须加进小程序后台「代码上传」白名单。 */
  serverIp: z.string().default(""),
});
export type BrandAppTestResult = z.infer<typeof brandAppTestResultSchema>;

// ---------------------------------------------------------------- 分类

export const brandCategorySchema = z.object({
  id: z.number(),
  shopId: z.number(),
  parentId: z.number(),
  name: z.string(),
  icon: z.string(),
  image: z.string(),
  level: z.number(),
  sortOrder: z.number(),
  enabled: z.boolean(),
  productCount: z.number(),
});
export type BrandCategory = z.infer<typeof brandCategorySchema>;

/**
 * 分类树：递归结构必须显式标注类型，否则 TS 在自身初始化里推不出类型。
 * 层级由服务层按 `parentId` 组装，最深三级。
 */
export type BrandCategoryTree = BrandCategory & { children: BrandCategoryTree[] };
export const brandCategoryTreeSchema: z.ZodType<BrandCategoryTree> =
  brandCategorySchema
    .extend({
      children: z.array(z.lazy(() => brandCategoryTreeSchema)).default([]),
    })
    // 递归 schema 必须显式给组件 id：否则 zod-to-openapi 在生成文档时无限下钻，
    // 整仓 `/api/openapi.json` 直接 500（api:docs 与 app.spec 一起挂）。
    .meta({ id: 'BrandCategoryTree' });

export const brandCategorySaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().positive().optional(),
  parentId: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(30),
  icon: z.string().max(500).default(""),
  image: z.string().max(500).default(""),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  enabled: z.boolean().default(true),
});
export type BrandCategorySaveBody = z.infer<typeof brandCategorySaveBodySchema>;

export const brandCategorySortBodySchema = z.object({
  shopId: z.number().int().positive(),
  /** 按新顺序提交同级 id 列表，后端按下标写 sortOrder。 */
  ids: z.array(z.number().int().positive()).min(1).max(200),
});
export type BrandCategorySortBody = z.infer<typeof brandCategorySortBodySchema>;

// ---------------------------------------------------------------- 商品

export const brandProductSkuSchema = z.object({
  id: z.number(),
  productId: z.number(),
  shopId: z.number(),
  skuName: z.string(),
  image: z.string(),
  uniqueId: z.string(),
  specValues: z.record(z.string(), z.string()),
  price: money,
  marketPrice: money,
  costPrice: money,
  stock: z.number(),
  sales: z.number(),
  weight: z.number(),
  volume: z.number(),
  barcode: z.string(),
  enabled: z.boolean(),
});
export type BrandProductSku = z.infer<typeof brandProductSkuSchema>;

/** 规格定义：`[{ name: "颜色", values: ["红", "蓝"] }]`，SKU 是它的笛卡尔积。 */
export const brandProductSpecSchema = z.object({
  name: z.string().trim().min(1).max(20),
  values: z.array(z.string().trim().min(1).max(30)).min(1).max(50),
});
export type BrandProductSpec = z.infer<typeof brandProductSpecSchema>;

/** 商品参数行：详情页「商品参数」表格的一行。 */
export const brandProductParamItemSchema = z.object({
  name: z.string().trim().min(1).max(30),
  value: z.string().trim().max(200).default(""),
});
export type BrandProductParamItem = z.infer<typeof brandProductParamItemSchema>;

export const brandProductRowSchema = z.object({
  id: z.number(),
  shopId: z.number(),
  categoryId: z.number(),
  categoryName: z.string(),
  title: z.string(),
  subtitle: z.string(),
  coverImage: z.string(),
  type: z.enum(BRAND_PRODUCT_TYPES),
  price: money,
  marketPrice: money,
  stock: z.number(),
  sales: z.number(),
  unit: z.string(),
  /** 运费模板 id；0 = 回落店铺统一运费。 */
  freightTemplateId: z.number(),
  status: z.enum(BRAND_PRODUCT_STATUSES),
  isHot: z.boolean(),
  isNew: z.boolean(),
  isGood: z.boolean(),
  sortOrder: z.number(),
  skuCount: z.number(),
  reviewCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BrandProductRow = z.infer<typeof brandProductRowSchema>;

export const brandProductDetailSchema = brandProductRowSchema.extend({
  images: z.array(z.string()),
  detail: z.string(),
  costPrice: money,
  weight: z.number(),
  volume: z.number(),
  specs: z.array(brandProductSpecSchema),
  skus: z.array(brandProductSkuSchema),
  guaranteeTags: z.array(z.string()),
  /** 商品参数（材质、产地、规格等键值对）。 */
  params: z.array(brandProductParamItemSchema),
  virtualRemark: z.string(),
});
export type BrandProductDetail = z.infer<typeof brandProductDetailSchema>;

/** 保存时的 SKU：无 id 表示新增，带 id 表示更新，未提交的既有 SKU 删除。 */
export const brandProductSkuInputSchema = z.object({
  id: z.number().int().positive().optional(),
  skuName: z.string().max(120).default(""),
  image: z.string().max(500).default(""),
  specValues: z.record(z.string(), z.string()).default({}),
  price: money,
  marketPrice: money.default(0),
  costPrice: money.default(0),
  stock: z.number().int().min(0).max(9_999_999).default(0),
  weight: z.number().min(0).max(99999).default(0),
  volume: z.number().min(0).max(999999).default(0),
  barcode: z.string().max(64).default(""),
  enabled: z.boolean().default(true),
});
export type BrandProductSkuInput = z.infer<typeof brandProductSkuInputSchema>;

export const brandProductSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().positive().optional(),
  categoryId: z.number().int().min(0).default(0),
  title: z.string().trim().min(1).max(120),
  subtitle: z.string().max(200).default(""),
  coverImage: z.string().max(500).default(""),
  images: z.array(z.string().max(500)).max(20).default([]),
  detail: z.string().max(200_000).default(""),
  type: z.enum(BRAND_PRODUCT_TYPES).default("NORMAL"),
  price: money,
  marketPrice: money.default(0),
  costPrice: money.default(0),
  /** 单规格商品的库存；多规格以 SKU 库存汇总为准。 */
  stock: z.number().int().min(0).max(9_999_999).default(0),
  unit: z.string().max(20).default("件"),
  weight: z.number().min(0).max(99999).default(0),
  volume: z.number().min(0).max(999999).default(0),
  /** 运费模板 id；0 = 回落店铺统一运费。 */
  freightTemplateId: z.number().int().min(0).default(0),
  specs: z.array(brandProductSpecSchema).max(5).default([]),
  skus: z.array(brandProductSkuInputSchema).max(200).default([]),
  guaranteeTags: z.array(z.string().max(30)).max(10).default([]),
  /** 商品参数（材质、产地、规格等键值对）。 */
  params: z.array(brandProductParamItemSchema).max(30).default([]),
  status: z.enum(BRAND_PRODUCT_STATUSES).default("DRAFT"),
  isHot: z.boolean().default(false),
  isNew: z.boolean().default(false),
  isGood: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  virtualRemark: z.string().max(500).default(""),
});
export type BrandProductSaveBody = z.infer<typeof brandProductSaveBodySchema>;

export const brandProductListQuerySchema = pageQuerySchema.extend({
  shopId: z.coerce.number().int().positive(),
  keyword: z.string().max(60).optional(),
  categoryId: z.coerce.number().int().min(0).optional(),
  status: z.enum(BRAND_PRODUCT_STATUSES).optional(),
  type: z.enum(BRAND_PRODUCT_TYPES).optional(),
  /** HOT/NEW/GOOD 标签筛选。 */
  tag: z.enum(["isHot", "isNew", "isGood"]).optional(),
  /** DEFAULT/PRICE_ASC/PRICE_DESC/SALES_DESC/NEWEST。 */
  sort: z
    .enum(["DEFAULT", "PRICE_ASC", "PRICE_DESC", "SALES_DESC", "NEWEST"])
    .optional(),
});

export const brandProductStatusBodySchema = z.object({
  shopId: z.number().int().positive(),
  ids: z.array(z.number().int().positive()).min(1).max(200),
  status: z.enum(BRAND_PRODUCT_STATUSES),
});
export type BrandProductStatusBody = z.infer<typeof brandProductStatusBodySchema>;

// ---------------------------------------------------------------- 评价

export const brandReviewSchema = z.object({
  id: z.number(),
  shopId: z.number(),
  productId: z.number(),
  productTitle: z.string(),
  coverImage: z.string(),
  orderId: z.number(),
  customerId: z.number(),
  nickname: z.string(),
  avatar: z.string(),
  rating: z.number(),
  content: z.string(),
  images: z.array(z.string()),
  status: z.enum(["PENDING", "PUBLISHED", "HIDDEN"]),
  reply: z.string(),
  replyAt: z.string(),
  createdAt: z.string(),
});
export type BrandReview = z.infer<typeof brandReviewSchema>;

export const brandReviewListQuerySchema = pageQuerySchema.extend({
  shopId: z.coerce.number().int().positive(),
  productId: z.coerce.number().int().positive().optional(),
  status: z.enum(["PENDING", "PUBLISHED", "HIDDEN"]).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
});

export const brandReviewReplyBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().positive(),
  reply: z.string().max(500),
});
export type BrandReviewReplyBody = z.infer<typeof brandReviewReplyBodySchema>;

export const brandReviewStatusBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().positive(),
  status: z.enum(["PENDING", "PUBLISHED", "HIDDEN"]),
});
export type BrandReviewStatusBody = z.infer<typeof brandReviewStatusBodySchema>;

// ---------------------------------------------------------------- 运费模板

/** 模板内一条地区规则：regions 为空数组表示全国兜底行。 */
export const brandShippingRuleSchema = z.object({
  id: z.number(),
  templateId: z.number(),
  name: z.string(),
  /** 收货市名列表；空数组 = 全国。 */
  regions: z.array(z.string()),
  firstPiece: z.number(),
  firstFee: money,
  /** 每增加多少件收一次续件费，0 = 不计续件。 */
  additionalPiece: z.number(),
  additionalFee: money,
  /** 满 N 件包邮，0 = 不启用。 */
  freePiece: z.number(),
  sortOrder: z.number(),
});
export type BrandShippingRule = z.infer<typeof brandShippingRuleSchema>;

export const brandShippingTemplateSchema = z.object({
  id: z.number(),
  shopId: z.number(),
  name: z.string(),
  isDefault: z.boolean(),
  rules: z.array(brandShippingRuleSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BrandShippingTemplate = z.infer<typeof brandShippingTemplateSchema>;

/** 保存时的规则行：带 id 表示更新，未提交的既有规则删除。 */
export const brandShippingRuleInputSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().max(60).default(""),
  regions: z.array(z.string().trim().min(1).max(30)).max(400).default([]),
  firstPiece: z.number().int().min(1).max(9999).default(1),
  firstFee: money.default(0),
  additionalPiece: z.number().int().min(0).max(9999).default(0),
  additionalFee: money.default(0),
  freePiece: z.number().int().min(0).max(999999).default(0),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});
export type BrandShippingRuleInput = z.infer<typeof brandShippingRuleInputSchema>;

export const brandShippingSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(60),
  isDefault: z.boolean().default(false),
  rules: z.array(brandShippingRuleInputSchema).max(20).default([]),
});
export type BrandShippingSaveBody = z.infer<typeof brandShippingSaveBodySchema>;

// ---------------------------------------------------------------- 快递公司

export const brandExpressSchema = z.object({
  id: z.number(),
  /** 0 = 平台预置（全店铺可见，不可删改）。 */
  shopId: z.number(),
  name: z.string(),
  code: z.string(),
  phone: z.string(),
  enabled: z.boolean(),
  sortOrder: z.number(),
});
export type BrandExpress = z.infer<typeof brandExpressSchema>;

export const brandExpressSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(40),
  code: z.string().trim().max(40).default(""),
  phone: z.string().max(30).default(""),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});
export type BrandExpressSaveBody = z.infer<typeof brandExpressSaveBodySchema>;

// ---------------------------------------------------------------- 顾客

export const brandCustomerSchema = z.object({
  id: z.number(),
  shopId: z.number(),
  nickname: z.string(),
  avatar: z.string(),
  phone: z.string(),
  gender: z.number(),
  level: z.string(),
  points: z.number(),
  balance: money,
  status: z.enum(BRAND_CUSTOMER_STATUSES),
  source: z.enum(BRAND_CUSTOMER_SOURCES),
  orderCount: z.number(),
  orderAmount: money,
  couponCount: z.number(),
  lastLoginAt: z.string(),
  createdAt: z.string(),
});
export type BrandCustomer = z.infer<typeof brandCustomerSchema>;

export const brandCustomerListQuerySchema = pageQuerySchema.extend({
  shopId: z.coerce.number().int().positive(),
  keyword: z.string().max(60).optional(),
  status: z.enum(BRAND_CUSTOMER_STATUSES).optional(),
  source: z.enum(BRAND_CUSTOMER_SOURCES).optional(),
  /** ALL/HAS_ORDER/NO_ORDER：按是否下过单粗筛。 */
  orderFilter: z.enum(["ALL", "HAS_ORDER", "NO_ORDER"]).optional(),
});

export const brandCustomerUpdateBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().positive(),
  nickname: z.string().max(60).optional(),
  level: z.string().max(30).optional(),
  remark: z.string().max(500).optional(),
  status: z.enum(BRAND_CUSTOMER_STATUSES).optional(),
});
export type BrandCustomerUpdateBody = z.infer<typeof brandCustomerUpdateBodySchema>;

export const brandCustomerAddressSchema = z.object({
  id: z.number(),
  customerId: z.number(),
  realName: z.string(),
  phone: z.string(),
  province: z.string(),
  city: z.string(),
  district: z.string(),
  detail: z.string(),
  postalCode: z.string(),
  isDefault: z.boolean(),
  tag: z.string(),
});
export type BrandCustomerAddress = z.infer<typeof brandCustomerAddressSchema>;

export const brandCustomerBillSchema = z.object({
  id: z.number(),
  type: z.enum(BRAND_BILL_TYPES),
  /** 积分变动（有符号）；amount 留给二期储值流水。 */
  points: z.number(),
  pointsAfter: z.number(),
  amount: money,
  relatedType: z.string(),
  relatedId: z.number(),
  remark: z.string(),
  createdAt: z.string(),
});
export type BrandCustomerBill = z.infer<typeof brandCustomerBillSchema>;

export const brandCustomerDetailSchema = brandCustomerSchema.extend({
  remark: z.string(),
  addresses: z.array(brandCustomerAddressSchema),
  recentOrders: z.array(z.lazy(() => brandOrderRowSchema)),
  bills: z.array(brandCustomerBillSchema),
});
export type BrandCustomerDetail = z.infer<typeof brandCustomerDetailSchema>;

// ---------------------------------------------------------------- 企业微信 SCRM（松耦合）

/**
 * 桥的可用性：商城只依赖这四种原因做提示，不感知 SCRM 内部状态。
 * `FEATURE_CLOSED` 与 `NOT_CONFIGURED` 都不是失败——事件保持 PENDING、恢复后补发。
 */
export const BRAND_SCRM_BRIDGE_REASONS = [
  "OK",
  "FEATURE_CLOSED",
  "NOT_CONFIGURED",
  "UNAUTHORIZED",
] as const;
export type BrandScrmBridgeReason = (typeof BRAND_SCRM_BRIDGE_REASONS)[number];
export const BRAND_SCRM_BRIDGE_REASON_LABELS: Record<BrandScrmBridgeReason, string> = {
  OK: "已接通",
  FEATURE_CLOSED: "SCRM 已停用",
  NOT_CONFIGURED: "未接入企业微信",
  UNAUTHORIZED: "凭据失效",
};

export const brandScrmBridgeStatusSchema = z.object({
  ok: z.boolean(),
  reason: z.enum(BRAND_SCRM_BRIDGE_REASONS),
  hint: z.string(),
});
export type BrandScrmBridgeStatus = z.infer<typeof brandScrmBridgeStatusSchema>;

export const brandScrmStateSchema = z.object({
  enabled: z.boolean(),
  shopName: z.string(),
  bridge: brandScrmBridgeStatusSchema,
  /** 外发箱计数：待发送 / 已发送 / 跳过（匹配不到客户或超窗）/ 失败终止。 */
  outbox: z.object({
    PENDING: z.number(),
    SENT: z.number(),
    SKIPPED: z.number(),
    DEAD: z.number(),
  }),
  /** 匹配三档：可自动匹配（自动绑定）/ 人工绑定 / 已忽略，外加匹配不到的事件数。 */
  bindings: z.object({
    auto: z.number(),
    manual: z.number(),
    ignored: z.number(),
    miss: z.number(),
  }),
  lastSentAt: z.string(),
});
export type BrandScrmState = z.infer<typeof brandScrmStateSchema>;

export const brandScrmToggleBodySchema = z.object({
  shopId: z.number().int().positive(),
  enabled: z.boolean(),
});
export type BrandScrmToggleBody = z.infer<typeof brandScrmToggleBodySchema>;

export const brandScrmRetryBodySchema = z.object({
  shopId: z.number().int().positive(),
});
export type BrandScrmRetryBody = z.infer<typeof brandScrmRetryBodySchema>;

export const brandScrmRetryResultSchema = okResult.extend({
  sent: z.number(),
  skipped: z.number(),
  failed: z.number(),
  deferred: z.number(),
});
export type BrandScrmRetryResult = z.infer<typeof brandScrmRetryResultSchema>;

export const brandScrmReplayBodySchema = z.object({
  shopId: z.number().int().positive(),
  /** 留空 = 本店全部 SKIPPED；带了就只重投这些行。 */
  ids: z.array(z.number().int().positive()).max(500).optional(),
});
export type BrandScrmReplayBody = z.infer<typeof brandScrmReplayBodySchema>;

export const brandScrmReplayResultSchema = okResult.extend({
  count: z.number(),
});
export type BrandScrmReplayResult = z.infer<typeof brandScrmReplayResultSchema>;

/** 顾客详情只读画像：未开启或未匹配也返回对象，页面据此渲染灰字说明而不是空指针。 */
export const brandCustomerScrmSchema = z.object({
  bound: z.boolean(),
  bridge: brandScrmBridgeStatusSchema,
  tags: z.array(z.string()),
  lastInteractionAt: z.string(),
  bindSource: z.string(),
  contactId: z.number(),
});
export type BrandCustomerScrm = z.infer<typeof brandCustomerScrmSchema>;

// ---------------------------------------------------------------- 购物车（C 端）

export const brandCartItemSchema = z.object({
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
  /** 商品已下架/缺货时置为失效，结算时不计入。 */
  valid: z.boolean(),
});
export type BrandCartItem = z.infer<typeof brandCartItemSchema>;

// ---------------------------------------------------------------- 订单

export const brandOrderItemSchema = z.object({
  id: z.number(),
  productId: z.number(),
  skuId: z.number(),
  title: z.string(),
  skuName: z.string(),
  image: z.string(),
  price: money,
  quantity: z.number(),
  totalPrice: money,
  refundStatus: z.enum(BRAND_REFUND_STATUSES),
  refundedAmount: money,
  reviewed: z.boolean(),
});
export type BrandOrderItem = z.infer<typeof brandOrderItemSchema>;

export const brandOrderLogSchema = z.object({
  id: z.number(),
  operatorType: z.enum(["SYSTEM", "CUSTOMER", "OWNER"]),
  operatorId: z.string(),
  action: z.string(),
  content: z.string(),
  createdAt: z.string(),
});
export type BrandOrderLog = z.infer<typeof brandOrderLogSchema>;

export const brandOrderRowSchema = z.object({
  id: z.number(),
  shopId: z.number(),
  orderNo: z.string(),
  customerId: z.number(),
  nickname: z.string(),
  avatar: z.string(),
  customerPhone: z.string(),
  status: z.enum(BRAND_ORDER_STATUSES),
  payStatus: z.enum(BRAND_PAY_STATUSES),
  refundStatus: z.enum(BRAND_REFUND_STATUSES),
  payType: z.enum(BRAND_PAY_TYPES),
  goodsAmount: money,
  freightAmount: money,
  discountAmount: money,
  pointsDeduct: z.number(),
  payAmount: money,
  itemCount: z.number(),
  itemSummary: z.string(),
  coverImage: z.string(),
  couponName: z.string(),
  buyerRemark: z.string(),
  sellerRemark: z.string(),
  expressCompany: z.string(),
  expressNo: z.string(),
  createdAt: z.string(),
  paidAt: z.string(),
  shippedAt: z.string(),
  receivedAt: z.string(),
  completedAt: z.string(),
  cancelledAt: z.string(),
  expireAt: z.string(),
});
export type BrandOrderRow = z.infer<typeof brandOrderRowSchema>;

export const brandOrderReceiverSchema = z.object({
  name: z.string(),
  phone: z.string(),
  province: z.string(),
  city: z.string(),
  district: z.string(),
  detail: z.string(),
});
export type BrandOrderReceiver = z.infer<typeof brandOrderReceiverSchema>;

export const brandOrderDetailSchema = brandOrderRowSchema.extend({
  items: z.array(brandOrderItemSchema),
  logs: z.array(brandOrderLogSchema),
  receiver: brandOrderReceiverSchema,
  transactionId: z.string(),
  refunds: z.array(z.lazy(() => brandRefundSchema)),
});
export type BrandOrderDetail = z.infer<typeof brandOrderDetailSchema>;

export const brandOrderListQuerySchema = pageQuerySchema.extend({
  shopId: z.coerce.number().int().positive(),
  status: z.enum(BRAND_ORDER_STATUSES).optional(),
  refundStatus: z.enum(BRAND_REFUND_STATUSES).optional(),
  payType: z.enum(BRAND_PAY_TYPES).optional(),
  keyword: z.string().max(60).optional(),
  customerId: z.coerce.number().int().positive().optional(),
  /** YYYY-MM-DD */
  dateFrom: z.string().max(10).optional(),
  dateTo: z.string().max(10).optional(),
});

export const brandOrderShipBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().positive(),
  expressCompany: z.string().trim().min(1).max(40),
  expressNo: z.string().trim().min(1).max(60),
  remark: z.string().max(200).default(""),
});
export type BrandOrderShipBody = z.infer<typeof brandOrderShipBodySchema>;

export const brandOrderRemarkBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().positive(),
  sellerRemark: z.string().max(500),
});
export type BrandOrderRemarkBody = z.infer<typeof brandOrderRemarkBodySchema>;

export const brandOrderCloseBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().positive(),
  reason: z.string().max(200).default(""),
});
export type BrandOrderCloseBody = z.infer<typeof brandOrderCloseBodySchema>;

// ---------------------------------------------------------------- 售后

export const brandRefundSchema = z.object({
  id: z.number(),
  shopId: z.number(),
  refundNo: z.string(),
  orderId: z.number(),
  orderNo: z.string(),
  orderItemId: z.number(),
  productId: z.number(),
  title: z.string(),
  skuName: z.string(),
  image: z.string(),
  quantity: z.number(),
  customerId: z.number(),
  nickname: z.string(),
  customerPhone: z.string(),
  type: z.enum(BRAND_RETURN_TYPES),
  reason: z.string(),
  desc: z.string(),
  images: z.array(z.string()),
  amount: money,
  orderPayAmount: money,
  status: z.enum(BRAND_REFUND_TICKET_STATUSES),
  adminRemark: z.string(),
  rejectReason: z.string(),
  returnExpress: z.string(),
  refundedAt: z.string(),
  createdAt: z.string(),
});
export type BrandRefund = z.infer<typeof brandRefundSchema>;

export const brandRefundListQuerySchema = pageQuerySchema.extend({
  shopId: z.coerce.number().int().positive(),
  status: z.enum(BRAND_REFUND_TICKET_STATUSES).optional(),
  keyword: z.string().max(60).optional(),
});

export const brandRefundAgreeBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().positive(),
  adminRemark: z.string().max(200).default(""),
});
export type BrandRefundAgreeBody = z.infer<typeof brandRefundAgreeBodySchema>;

export const brandRefundRejectBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().positive(),
  rejectReason: z.string().trim().min(1).max(200),
});
export type BrandRefundRejectBody = z.infer<typeof brandRefundRejectBodySchema>;

// ---------------------------------------------------------------- 优惠券

export const brandCouponSchema = z.object({
  id: z.number(),
  shopId: z.number(),
  name: z.string(),
  type: z.enum(BRAND_COUPON_TYPES),
  /** 满减券为减免金额；折扣券为折扣百分比（如 88 表示 8.8 折）。 */
  value: z.number(),
  threshold: money,
  totalCount: z.number(),
  receivedCount: z.number(),
  usedCount: z.number(),
  perLimit: z.number(),
  validType: z.enum(BRAND_COUPON_VALID_TYPES),
  startAt: z.string(),
  endAt: z.string(),
  validDays: z.number(),
  scope: z.enum(BRAND_COUPON_SCOPES),
  scopeIds: z.array(z.number()),
  status: z.enum(BRAND_COUPON_STATUSES),
  createdAt: z.string(),
});
export type BrandCoupon = z.infer<typeof brandCouponSchema>;

export const brandCouponSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(40),
  type: z.enum(BRAND_COUPON_TYPES),
  value: z.number().min(0.01).max(999_999),
  threshold: money.default(0),
  totalCount: z.number().int().min(1).max(9_999_999).default(100),
  perLimit: z.number().int().min(1).max(99).default(1),
  validType: z.enum(BRAND_COUPON_VALID_TYPES).default("FIXED"),
  /** ISO 时间；FIXED 模式必填。 */
  startAt: z.string().max(32).default(""),
  endAt: z.string().max(32).default(""),
  validDays: z.number().int().min(1).max(3650).default(7),
  scope: z.enum(BRAND_COUPON_SCOPES).default("ALL"),
  scopeIds: z.array(z.number().int().positive()).max(500).default([]),
  status: z.enum(BRAND_COUPON_STATUSES).default("ONLINE"),
});
export type BrandCouponSaveBody = z.infer<typeof brandCouponSaveBodySchema>;

export const brandCouponListQuerySchema = pageQuerySchema.extend({
  shopId: z.coerce.number().int().positive(),
  status: z.enum(BRAND_COUPON_STATUSES).optional(),
  keyword: z.string().max(40).optional(),
});

export const brandCouponTicketSchema = z.object({
  id: z.number(),
  couponId: z.number(),
  couponName: z.string(),
  customerId: z.number(),
  nickname: z.string(),
  phone: z.string(),
  status: z.enum(BRAND_TICKET_STATUSES),
  orderId: z.number(),
  receivedAt: z.string(),
  usedAt: z.string(),
  expireAt: z.string(),
});
export type BrandCouponTicket = z.infer<typeof brandCouponTicketSchema>;

export const brandCouponTicketListQuerySchema = pageQuerySchema.extend({
  shopId: z.coerce.number().int().positive(),
  couponId: z.coerce.number().int().positive().optional(),
  status: z.enum(BRAND_TICKET_STATUSES).optional(),
  keyword: z.string().max(60).optional(),
});

// ---------------------------------------------------------------- DIY 装修

export const brandDiyLinkSchema = z.object({
  type: z.enum(BRAND_LINK_TYPES),
  /** 展示用名称（选择器回填，渲染不再读取）。 */
  name: z.string().max(60).default(""),
  /** PAGE/WEBVIEW 用 path，PRODUCT/CATEGORY/COUPON 用 targetId。 */
  path: z.string().max(300).default(""),
  targetId: z.number().int().min(0).default(0),
});
export type BrandDiyLink = z.infer<typeof brandDiyLinkSchema>;

export const brandDiyPageStylesSchema = z.object({
  backgroundColor: z.string().default("#F5F5F5"),
  backgroundImage: z.string().default(""),
  headerColor: z.string().default("#FA3534"),
  /** 页面内容顶部留白（px）。 */
  paddingTop: z.number().int().min(0).max(200).default(0),
});
export type BrandDiyPageStyles = z.infer<typeof brandDiyPageStylesSchema>;

export const BRAND_DEFAULT_DIY_STYLES: BrandDiyPageStyles = {
  backgroundColor: "#F5F5F5",
  backgroundImage: "",
  headerColor: "#FA3534",
  paddingTop: 0,
};

export const brandDiyComponentSchema = z.object({
  /** 前端生成的实例 id（同类型可放多个）。 */
  id: z.string().max(64),
  type: z.enum(BRAND_DIY_WIDGETS),
  props: z.record(z.string(), z.unknown()).default({}),
});
export type BrandDiyComponent = z.infer<typeof brandDiyComponentSchema>;

/** 组件清单下发：类型 + 中文名 + 图标 + 默认 props + 属性表单描述。 */
export const brandDiyWidgetMetaSchema = z.object({
  type: z.enum(BRAND_DIY_WIDGETS),
  name: z.string(),
  icon: z.string(),
  group: z.enum(["base", "goods", "marketing", "shop", "assist"]),
  groupLabel: z.string(),
  defaultProps: z.record(z.string(), z.unknown()),
});
export type BrandDiyWidgetMeta = z.infer<typeof brandDiyWidgetMetaSchema>;

export const brandDiyPageRowSchema = z.object({
  id: z.number(),
  shopId: z.number(),
  name: z.string(),
  type: z.enum(BRAND_DIY_PAGE_TYPES),
  status: z.enum(BRAND_DIY_STATUSES),
  isDefault: z.boolean(),
  coverImage: z.string(),
  sortOrder: z.number(),
  componentCount: z.number(),
  publishedAt: z.string(),
  updatedAt: z.string(),
});
export type BrandDiyPageRow = z.infer<typeof brandDiyPageRowSchema>;

export const brandDiyPageSchema = brandDiyPageRowSchema.extend({
  components: z.array(brandDiyComponentSchema),
  styles: brandDiyPageStylesSchema,
  /** 线上快照：C 端读这两项，草稿编辑不影响线上。 */
  publishedComponents: z.array(brandDiyComponentSchema),
  publishedStyles: brandDiyPageStylesSchema,
});
export type BrandDiyPage = z.infer<typeof brandDiyPageSchema>;

export const brandDiySaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(40),
  type: z.enum(BRAND_DIY_PAGE_TYPES).default("ACTIVITY"),
  components: z.array(brandDiyComponentSchema).max(60).default([]),
  styles: brandDiyPageStylesSchema.default(BRAND_DEFAULT_DIY_STYLES),
  coverImage: z.string().max(500).default(""),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});
export type BrandDiySaveBody = z.infer<typeof brandDiySaveBodySchema>;

// ---------------------------------------------------------------- 统计

export const brandStatOverviewSchema = z.object({
  todayOrderCount: z.number(),
  todayOrderAmount: money,
  todayCustomerCount: z.number(),
  pendingShipCount: z.number(),
  pendingPaymentCount: z.number(),
  pendingRefundCount: z.number(),
  onlineProductCount: z.number(),
  totalCustomerCount: z.number(),
  totalOrderCount: z.number(),
  totalOrderAmount: money,
  payConversionPercent: z.number(),
});
export type BrandStatOverview = z.infer<typeof brandStatOverviewSchema>;

export const brandStatTrendPointSchema = z.object({
  /** YYYY-MM-DD */
  date: z.string(),
  orderCount: z.number(),
  orderAmount: money,
  customerCount: z.number(),
});
export type BrandStatTrendPoint = z.infer<typeof brandStatTrendPointSchema>;

export const brandStatProductSchema = z.object({
  productId: z.number(),
  title: z.string(),
  coverImage: z.string(),
  sales: z.number(),
  amount: money,
});
export type BrandStatProduct = z.infer<typeof brandStatProductSchema>;

export const brandStatQuerySchema = z.object({
  shopId: z.coerce.number().int().positive(),
  days: z.coerce.number().int().min(7).max(90).default(30),
});

// ---------------------------------------------------------------- 元信息

export const brandMetaSchema = z.object({
  statusLabels: z.record(z.string(), z.string()),
  productStatusLabels: z.record(z.string(), z.string()),
  orderStatusLabels: z.record(z.string(), z.string()),
  payStatusLabels: z.record(z.string(), z.string()),
  refundStatusLabels: z.record(z.string(), z.string()),
  payTypeLabels: z.record(z.string(), z.string()),
  returnTypeLabels: z.record(z.string(), z.string()),
  refundTicketStatusLabels: z.record(z.string(), z.string()),
  customerSourceLabels: z.record(z.string(), z.string()),
  couponTypeLabels: z.record(z.string(), z.string()),
  couponScopeLabels: z.record(z.string(), z.string()),
  couponStatusLabels: z.record(z.string(), z.string()),
  ticketStatusLabels: z.record(z.string(), z.string()),
  diyPageTypeLabels: z.record(z.string(), z.string()),
  uploadStatusLabels: z.record(z.string(), z.string()),
  reviewStatusLabels: z.record(z.string(), z.string()),
  releaseChannelLabels: z.record(z.string(), z.string()),
  widgets: z.array(brandDiyWidgetMetaSchema),
  /** 平台侧限制：店铺数配额、每店商品数上限等。 */
  shopQuota: z.number(),
  productQuota: z.number(),
  shopCount: z.number(),
  /** 平台是否允许用户开启在线收款。 */
  payAllowed: z.boolean(),
  /** 平台预置快递公司（shopId=0）里启用的那些。 */
  expressPresets: z.array(brandExpressSchema),
});
export type BrandMeta = z.infer<typeof brandMetaSchema>;

// ---------------------------------------------------------------- 平台管理侧

export const brandAdminShopRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  shopCode: z.string(),
  logo: z.string(),
  status: z.enum(BRAND_SHOP_STATUSES),
  /** 店主（本站用户）信息。 */
  ownerUserId: z.string(),
  ownerName: z.string(),
  appId: z.string(),
  payEnabled: z.boolean(),
  productCount: z.number(),
  customerCount: z.number(),
  orderCount: z.number(),
  orderAmount: money,
  offReason: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BrandAdminShopRow = z.infer<typeof brandAdminShopRowSchema>;

export const brandAdminShopListQuerySchema = pageQuerySchema.extend({
  keyword: z.string().max(60).optional(),
  status: z.enum(BRAND_SHOP_STATUSES).optional(),
  /** 是否已配置微信支付。 */
  payFilter: z.enum(["ALL", "ENABLED", "DISABLED"]).optional(),
});

export const brandAdminSuspendBodySchema = z.object({
  shopId: z.number().int().positive(),
  reason: z.string().trim().min(2).max(200),
});
export type BrandAdminSuspendBody = z.infer<typeof brandAdminSuspendBodySchema>;

export const brandAdminSettingsSchema = z.object({
  enabled: z.boolean(),
  shopQuota: z.number(),
  productQuota: z.number(),
  payAllowed: z.boolean(),
  /** 新店铺默认交易参数（开店铺时拷进 tradeJson）。 */
  defaultTrade: brandTradeConfigSchema,
  /** 平台侧统计摘要。 */
  shopTotal: z.number(),
  onlineShopTotal: z.number(),
  orderTotal: z.number(),
  updatedAt: z.string(),
});
export type BrandAdminSettings = z.infer<typeof brandAdminSettingsSchema>;

export const brandAdminSettingsBodySchema = z.object({
  enabled: z.boolean().default(true),
  shopQuota: z.number().int().min(1).max(1000).default(3),
  productQuota: z.number().int().min(10).max(100_000).default(2000),
  payAllowed: z.boolean().default(true),
  defaultTrade: brandTradeConfigSchema.default(BRAND_DEFAULT_TRADE),
});
export type BrandAdminSettingsBody = z.infer<typeof brandAdminSettingsBodySchema>;

// ---------------------------------------------------------------- C 端（公开接口）

/** `/api/public/brand-mall/bootstrap`：免登录，按 shopCode 或 appId 取店铺与装修快照。 */
export const brandPublicBootstrapSchema = z.object({
  shopId: z.number(),
  name: z.string(),
  shopCode: z.string(),
  logo: z.string(),
  slogan: z.string(),
  servicePhone: z.string(),
  status: z.enum(BRAND_SHOP_STATUSES),
  themeColor: z.string(),
  payEnabled: z.boolean(),
  pointsEnabled: z.boolean(),
  trade: brandTradeConfigSchema,
  /** 客服服务站 key（'' = 未绑定）。 */
  deskSiteKey: z.string().default(""),
  /** 客服会话 web-view 地址（含 apiBase + key），未绑定或站点停用为 ''。 */
  deskEmbedUrl: z.string().default(""),
  /** 三个主页面 HOME/CATEGORY/MINE 的发布快照。 */
  pages: z.array(
    z.object({
      id: z.number(),
      type: z.string(),
      name: z.string(),
      components: z.array(brandDiyComponentSchema),
      styles: brandDiyPageStylesSchema,
    }),
  ),
  tabBar: z.array(
    z.object({
      pagePath: z.string(),
      text: z.string(),
      iconPath: z.string(),
      selectedIconPath: z.string(),
    }),
  ),
});
export type BrandPublicBootstrap = z.infer<typeof brandPublicBootstrapSchema>;

export const brandPublicLoginBodySchema = z.object({
  shopId: z.coerce.number().int().positive().optional(),
  shopCode: z.string().max(16).optional(),
  /** wx.login 换来的 code；与 phone/password 三选一。 */
  code: z.string().max(512).optional(),
  /** getPhoneNumber 的加密数据（可选，用于快速取手机号）。 */
  encryptedData: z.string().max(8192).optional(),
  iv: z.string().max(128).optional(),
  nickname: z.string().max(60).optional(),
  avatar: z.string().max(500).optional(),
});
export type BrandPublicLoginBody = z.infer<typeof brandPublicLoginBodySchema>;

export const brandPublicSessionSchema = z.object({
  token: z.string(),
  customerId: z.number(),
  nickname: z.string(),
  avatar: z.string(),
  phone: z.string(),
  points: z.number(),
  balance: money,
  shopId: z.number(),
});
export type BrandPublicSession = z.infer<typeof brandPublicSessionSchema>;

/** C 端商品列表行（不带成本价等店主侧字段）。 */
export const brandPublicProductSchema = z.object({
  id: z.number(),
  categoryId: z.number(),
  title: z.string(),
  subtitle: z.string(),
  coverImage: z.string(),
  images: z.array(z.string()),
  type: z.enum(BRAND_PRODUCT_TYPES),
  price: money,
  marketPrice: money,
  stock: z.number(),
  sales: z.number(),
  unit: z.string(),
  specs: z.array(brandProductSpecSchema),
  skus: z.array(brandProductSkuSchema),
  guaranteeTags: z.array(z.string()),
  isHot: z.boolean(),
  isNew: z.boolean(),
  isGood: z.boolean(),
  detail: z.string(),
  virtualRemark: z.string(),
  reviewCount: z.number(),
  avgRating: z.number(),
});
export type BrandPublicProduct = z.infer<typeof brandPublicProductSchema>;

/** 结算试算：把券、运费、积分的算法收在后端，端上只展示。 */
export const brandPublicPreviewBodySchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        skuId: z.number().int().min(0).default(0),
        quantity: z.number().int().min(1).max(999),
      }),
    )
    .min(1)
    .max(50),
  /** 0 = 从购物车结算（按购物车勾选行取）。 */
  fromCart: z.boolean().default(false),
  addressId: z.number().int().min(0).default(0),
  couponTicketId: z.number().int().min(0).default(0),
  usePoints: z.number().int().min(0).default(0),
});
export type BrandPublicPreviewBody = z.infer<typeof brandPublicPreviewBodySchema>;

export const brandPublicPreviewLineSchema = z.object({
  productId: z.number(),
  skuId: z.number(),
  title: z.string(),
  skuName: z.string(),
  image: z.string(),
  price: money,
  quantity: z.number(),
  totalPrice: money,
  stock: z.number(),
  valid: z.boolean(),
  invalidReason: z.string(),
});
export type BrandPublicPreviewLine = z.infer<typeof brandPublicPreviewLineSchema>;

export const brandPublicPreviewSchema = z.object({
  lines: z.array(brandPublicPreviewLineSchema),
  goodsAmount: money,
  freightAmount: money,
  discountAmount: money,
  pointsDeduct: z.number(),
  pointsDeductAmount: money,
  payAmount: money,
  /** 可用券票（已按门槛与适用范围过滤）。 */
  coupons: z.array(
    z.object({
      ticketId: z.number(),
      name: z.string(),
      type: z.enum(BRAND_COUPON_TYPES),
      value: z.number(),
      threshold: money,
      usable: z.boolean(),
      reason: z.string(),
    }),
  ),
  /** 本单可抵扣积分上限。 */
  maxUsablePoints: z.number(),
  receiver: brandOrderReceiverSchema.nullable(),
  /** 阻断下单的原因（空 = 可以下单）。 */
  blockReason: z.string(),
});
export type BrandPublicPreview = z.infer<typeof brandPublicPreviewSchema>;

export const brandPublicOrderCreateBodySchema = z.object({
  items: brandPublicPreviewBodySchema.shape.items,
  fromCart: z.boolean().default(false),
  addressId: z.number().int().positive(),
  couponTicketId: z.number().int().min(0).default(0),
  usePoints: z.number().int().min(0).default(0),
  buyerRemark: z.string().max(200).default(""),
  payType: z.enum(BRAND_PAY_TYPES).default("WECHAT"),
});
export type BrandPublicOrderCreateBody = z.infer<
  typeof brandPublicOrderCreateBodySchema
>;

/** 下单后返回：微信支付参数（payType=WECHAT 时非空）。 */
export const brandPublicOrderCreatedSchema = z.object({
  orderId: z.number(),
  orderNo: z.string(),
  payAmount: money,
  expireAt: z.string(),
  payParams: z
    .object({
      timeStamp: z.string(),
      nonceStr: z.string(),
      package: z.string(),
      signType: z.string(),
      paySign: z.string(),
    })
    .nullable(),
});
export type BrandPublicOrderCreated = z.infer<
  typeof brandPublicOrderCreatedSchema
>;

export const brandPublicOrderRowSchema = z.object({
  id: z.number(),
  orderNo: z.string(),
  status: z.enum(BRAND_ORDER_STATUSES),
  payStatus: z.enum(BRAND_PAY_STATUSES),
  refundStatus: z.enum(BRAND_REFUND_STATUSES),
  payAmount: money,
  goodsAmount: money,
  freightAmount: money,
  discountAmount: money,
  itemCount: z.number(),
  coverImage: z.string(),
  expressCompany: z.string(),
  expressNo: z.string(),
  createdAt: z.string(),
  paidAt: z.string(),
  expireAt: z.string(),
});
export type BrandPublicOrderRow = z.infer<typeof brandPublicOrderRowSchema>;

export const brandPublicRefundCreateBodySchema = z.object({
  orderId: z.number().int().positive(),
  orderItemId: z.number().int().positive(),
  type: z.enum(BRAND_RETURN_TYPES),
  reason: z.string().trim().min(1).max(100),
  desc: z.string().max(500).default(""),
  images: z.array(z.string().max(500)).max(9).default([]),
  amount: money,
});
export type BrandPublicRefundCreateBody = z.infer<
  typeof brandPublicRefundCreateBodySchema
>;

export const brandPublicAddressBodySchema = z.object({
  id: z.number().int().positive().optional(),
  realName: z.string().trim().min(1).max(30),
  phone: z.string().trim().min(5).max(20),
  province: z.string().max(40),
  city: z.string().max(40),
  district: z.string().max(40),
  detail: z.string().trim().min(1).max(200),
  postalCode: z.string().max(10).default(""),
  isDefault: z.boolean().default(false),
  tag: z.string().max(10).default(""),
});
export type BrandPublicAddressBody = z.infer<typeof brandPublicAddressBodySchema>;

// ---------------------------------------------------------------- 端点清单

/**
 * 一律用 query 传 id、不用路径参数：Hono 按注册顺序匹配，静态段会被先注册的
 * `:param` 兄弟路径吃掉，_geo-site 已踩过_，本模块从源头规避。
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

const shopQuery = <T extends z.ZodRawShape>(extra: T) =>
  z.object({ shopId: z.coerce.number().int().positive(), ...extra });
const idBody = <T extends z.ZodRawShape>(extra: T) =>
  z.object({ shopId: z.number().int().positive(), ...extra });

/**
 * 电商小程序工具端点：`BrandMall_` 店主侧、`BrandMallAdmin_` 平台侧，
 * 由 `moduleHandlers` 按 operationId 后缀自动挂到 `BrandController` 的同名方法上。
 */
export const brandMallEndpoints = {
  // ---------- 元信息与店铺 ----------
  BrandMall_meta: get("/enterprise/brand-mall/meta", emptyQuery, brandMetaSchema),
  BrandMall_shops: get(
    "/enterprise/brand-mall/shop/list",
    emptyQuery,
    z.array(brandShopSchema),
  ),
  BrandMall_shopCreate: post(
    "/enterprise/brand-mall/shop/create",
    brandShopCreateBodySchema,
    brandShopDetailSchema,
  ),
  BrandMall_shopDetail: get(
    "/enterprise/brand-mall/shop/detail",
    shopQuery({}),
    brandShopDetailSchema,
  ),
  BrandMall_shopUpdate: post(
    "/enterprise/brand-mall/shop/update",
    brandShopUpdateBodySchema,
    brandShopDetailSchema,
  ),
  BrandMall_shopStatus: post(
    "/enterprise/brand-mall/shop/status",
    brandShopStatusBodySchema,
    brandShopDetailSchema,
  ),
  BrandMall_shopRemove: post(
    "/enterprise/brand-mall/shop/remove",
    z.object({ shopId: z.number().int().positive() }),
    okResult,
  ),
  BrandMall_shopTrade: post(
    "/enterprise/brand-mall/shop/trade",
    brandShopTradeBodySchema,
    brandShopDetailSchema,
  ),

  // ---------- 小程序主体凭据（底座 miniprogram_apps，scene=MALL）----------
  /** 一店一部独立小程序：AppID、上传密钥、商户号都属该店自己。 */
  BrandMall_appDetail: get(
    "/enterprise/brand-mall/app/detail",
    shopQuery({}),
    miniAppViewSchema,
  ),
  BrandMall_appSave: post(
    "/enterprise/brand-mall/app/save",
    brandAppSaveBodySchema,
    miniAppViewSchema,
  ),
  /** 自检 AppID/Secret 可用性与 IP 白名单前置条件。 */
  BrandMall_appTest: post(
    "/enterprise/brand-mall/app/test",
    idBody({}),
    brandAppTestResultSchema,
  ),
  /** 自检微信支付 APIv3 凭据（商户证书序列号与私钥是否配对）。 */
  BrandMall_payTest: post(
    "/enterprise/brand-mall/app/pay-test",
    idBody({}),
    brandAppTestResultSchema,
  ),

  // ---------- 分类 ----------
  BrandMall_categoryList: get(
    "/enterprise/brand-mall/category/list",
    shopQuery({}),
    z.array(brandCategoryTreeSchema),
  ),
  BrandMall_categorySave: post(
    "/enterprise/brand-mall/category/save",
    brandCategorySaveBodySchema,
    brandCategorySchema,
  ),
  BrandMall_categoryRemove: post(
    "/enterprise/brand-mall/category/remove",
    idBody({ id: z.number().int().positive() }),
    okResult,
  ),
  BrandMall_categorySort: post(
    "/enterprise/brand-mall/category/sort",
    brandCategorySortBodySchema,
    okResult,
  ),

  // ---------- 商品 ----------
  BrandMall_productList: get(
    "/enterprise/brand-mall/product/list",
    brandProductListQuerySchema,
    z.object({
      list: z.array(brandProductRowSchema),
      total: z.number(),
      page: z.number(),
      pageSize: z.number(),
    }),
  ),
  BrandMall_productDetail: get(
    "/enterprise/brand-mall/product/detail",
    shopQuery({ id: z.coerce.number().int().positive() }),
    brandProductDetailSchema,
  ),
  BrandMall_productSave: post(
    "/enterprise/brand-mall/product/save",
    brandProductSaveBodySchema,
    brandProductDetailSchema,
  ),
  BrandMall_productStatus: post(
    "/enterprise/brand-mall/product/status",
    brandProductStatusBodySchema,
    okResult,
  ),
  BrandMall_productRemove: post(
    "/enterprise/brand-mall/product/remove",
    idBody({ ids: z.array(z.number().int().positive()).min(1).max(200) }),
    okResult,
  ),
  BrandMall_productCopy: post(
    "/enterprise/brand-mall/product/copy",
    idBody({ ids: z.array(z.number().int().positive()).min(1).max(50) }),
    okResult,
  ),

  // ---------- 评价 ----------
  BrandMall_reviewList: get(
    "/enterprise/brand-mall/review/list",
    brandReviewListQuerySchema,
    z.object({
      list: z.array(brandReviewSchema),
      total: z.number(),
      page: z.number(),
      pageSize: z.number(),
    }),
  ),
  BrandMall_reviewReply: post(
    "/enterprise/brand-mall/review/reply",
    brandReviewReplyBodySchema,
    brandReviewSchema,
  ),
  BrandMall_reviewStatus: post(
    "/enterprise/brand-mall/review/status",
    brandReviewStatusBodySchema,
    brandReviewSchema,
  ),

  // ---------- 运费模板 ----------
  BrandMall_shippingList: get(
    "/enterprise/brand-mall/shipping/list",
    shopQuery({}),
    z.array(brandShippingTemplateSchema),
  ),
  BrandMall_shippingSave: post(
    "/enterprise/brand-mall/shipping/save",
    brandShippingSaveBodySchema,
    brandShippingTemplateSchema,
  ),
  BrandMall_shippingRemove: post(
    "/enterprise/brand-mall/shipping/remove",
    idBody({ id: z.number().int().positive() }),
    okResult,
  ),

  // ---------- 快递公司 ----------
  BrandMall_expressList: get(
    "/enterprise/brand-mall/express/list",
    shopQuery({}),
    z.array(brandExpressSchema),
  ),
  BrandMall_expressSave: post(
    "/enterprise/brand-mall/express/save",
    brandExpressSaveBodySchema,
    brandExpressSchema,
  ),
  BrandMall_expressRemove: post(
    "/enterprise/brand-mall/express/remove",
    idBody({ id: z.number().int().positive() }),
    okResult,
  ),

  // ---------- 顾客 ----------
  BrandMall_customerList: get(
    "/enterprise/brand-mall/customer/list",
    brandCustomerListQuerySchema,
    z.object({
      list: z.array(brandCustomerSchema),
      total: z.number(),
      page: z.number(),
      pageSize: z.number(),
    }),
  ),
  BrandMall_customerDetail: get(
    "/enterprise/brand-mall/customer/detail",
    shopQuery({ id: z.coerce.number().int().positive() }),
    brandCustomerDetailSchema,
  ),
  BrandMall_customerUpdate: post(
    "/enterprise/brand-mall/customer/update",
    brandCustomerUpdateBodySchema,
    brandCustomerSchema,
  ),
  BrandMall_addressList: get(
    "/enterprise/brand-mall/customer/addresses",
    shopQuery({ customerId: z.coerce.number().int().positive() }),
    z.array(brandCustomerAddressSchema),
  ),
  /** 顾客详情里的「企微画像」块：只读，未开启/未匹配都返回降级对象。 */
  BrandMall_customerScrm: get(
    "/enterprise/brand-mall/customer/scrm",
    shopQuery({ customerId: z.coerce.number().int().positive() }),
    brandCustomerScrmSchema,
  ),

  // ---------- 企业微信 SCRM 集成 ----------
  /** 集成页签健康度：桥状态 + 外发箱计数 + 匹配三档。 */
  BrandMall_scrmState: get(
    "/enterprise/brand-mall/scrm/state",
    shopQuery({}),
    brandScrmStateSchema,
  ),
  BrandMall_scrmToggle: post(
    "/enterprise/brand-mall/scrm/toggle",
    brandScrmToggleBodySchema,
    okResult,
  ),
  /** 立即投递一次本组织待发送事件（店主手动重试）。 */
  BrandMall_scrmRetry: post(
    "/enterprise/brand-mall/scrm/retry",
    brandScrmRetryBodySchema,
    brandScrmRetryResultSchema,
  ),
  /** 一键重投 SKIPPED：SCRM 侧补完客户后把漏掉的事件补发。 */
  BrandMall_scrmReplay: post(
    "/enterprise/brand-mall/scrm/replay",
    brandScrmReplayBodySchema,
    brandScrmReplayResultSchema,
  ),

  // ---------- 订单 ----------
  BrandMall_orderList: get(
    "/enterprise/brand-mall/order/list",
    brandOrderListQuerySchema,
    z.object({
      list: z.array(brandOrderRowSchema),
      total: z.number(),
      page: z.number(),
      pageSize: z.number(),
      /** 各状态计数，页签徽标一次拿全。 */
      statusCounts: z.record(z.string(), z.number()),
    }),
  ),
  BrandMall_orderDetail: get(
    "/enterprise/brand-mall/order/detail",
    shopQuery({ id: z.coerce.number().int().positive() }),
    brandOrderDetailSchema,
  ),
  BrandMall_orderRemark: post(
    "/enterprise/brand-mall/order/remark",
    brandOrderRemarkBodySchema,
    brandOrderDetailSchema,
  ),
  BrandMall_orderShip: post(
    "/enterprise/brand-mall/order/ship",
    brandOrderShipBodySchema,
    brandOrderDetailSchema,
  ),
  BrandMall_orderFinish: post(
    "/enterprise/brand-mall/order/finish",
    idBody({ id: z.number().int().positive() }),
    brandOrderDetailSchema,
  ),
  BrandMall_orderClose: post(
    "/enterprise/brand-mall/order/close",
    brandOrderCloseBodySchema,
    brandOrderDetailSchema,
  ),

  // ---------- 售后 ----------
  BrandMall_refundList: get(
    "/enterprise/brand-mall/refund/list",
    brandRefundListQuerySchema,
    z.object({
      list: z.array(brandRefundSchema),
      total: z.number(),
      page: z.number(),
      pageSize: z.number(),
      statusCounts: z.record(z.string(), z.number()),
    }),
  ),
  BrandMall_refundDetail: get(
    "/enterprise/brand-mall/refund/detail",
    shopQuery({ id: z.coerce.number().int().positive() }),
    brandRefundSchema,
  ),
  BrandMall_refundAgree: post(
    "/enterprise/brand-mall/refund/agree",
    brandRefundAgreeBodySchema,
    brandRefundSchema,
  ),
  BrandMall_refundReject: post(
    "/enterprise/brand-mall/refund/reject",
    brandRefundRejectBodySchema,
    brandRefundSchema,
  ),

  // ---------- 优惠券 ----------
  BrandMall_couponList: get(
    "/enterprise/brand-mall/coupon/list",
    brandCouponListQuerySchema,
    z.object({
      list: z.array(brandCouponSchema),
      total: z.number(),
      page: z.number(),
      pageSize: z.number(),
    }),
  ),
  BrandMall_couponSave: post(
    "/enterprise/brand-mall/coupon/save",
    brandCouponSaveBodySchema,
    brandCouponSchema,
  ),
  BrandMall_couponStatus: post(
    "/enterprise/brand-mall/coupon/status",
    idBody({
      id: z.number().int().positive(),
      status: z.enum(BRAND_COUPON_STATUSES),
    }),
    brandCouponSchema,
  ),
  BrandMall_couponRemove: post(
    "/enterprise/brand-mall/coupon/remove",
    idBody({ id: z.number().int().positive() }),
    okResult,
  ),
  BrandMall_couponTickets: get(
    "/enterprise/brand-mall/coupon/tickets",
    brandCouponTicketListQuerySchema,
    z.object({
      list: z.array(brandCouponTicketSchema),
      total: z.number(),
      page: z.number(),
      pageSize: z.number(),
    }),
  ),

  // ---------- 装修 ----------
  BrandMall_diyWidgets: get(
    "/enterprise/brand-mall/diy/widgets",
    shopQuery({}),
    z.array(brandDiyWidgetMetaSchema),
  ),
  BrandMall_diyList: get(
    "/enterprise/brand-mall/diy/list",
    shopQuery({}),
    z.array(brandDiyPageRowSchema),
  ),
  BrandMall_diyDetail: get(
    "/enterprise/brand-mall/diy/detail",
    shopQuery({ id: z.coerce.number().int().positive() }),
    brandDiyPageSchema,
  ),
  BrandMall_diySave: post(
    "/enterprise/brand-mall/diy/save",
    brandDiySaveBodySchema,
    brandDiyPageSchema,
  ),
  BrandMall_diyPublish: post(
    "/enterprise/brand-mall/diy/publish",
    idBody({ id: z.number().int().positive() }),
    brandDiyPageSchema,
  ),
  BrandMall_diyCopy: post(
    "/enterprise/brand-mall/diy/copy",
    idBody({ id: z.number().int().positive() }),
    brandDiyPageRowSchema,
  ),
  BrandMall_diyRemove: post(
    "/enterprise/brand-mall/diy/remove",
    idBody({ id: z.number().int().positive() }),
    okResult,
  ),

  // ---------- 小程序码 ----------
  /** 小程序码：微信 wxacode.getUnlimited 生成，失败时回可执行提示。 */
  BrandMall_qrcodeGenerate: post(
    "/enterprise/brand-mall/app/qrcode",
    idBody({ path: z.string().max(120).default("") }),
    miniAppViewSchema,
  ),

  // ---------- 看板 ----------
  BrandMall_statOverview: get(
    "/enterprise/brand-mall/stat/overview",
    shopQuery({}),
    brandStatOverviewSchema,
  ),
  BrandMall_statTrend: get(
    "/enterprise/brand-mall/stat/trend",
    brandStatQuerySchema,
    z.array(brandStatTrendPointSchema),
  ),
  BrandMall_statTopProducts: get(
    "/enterprise/brand-mall/stat/top-products",
    shopQuery({ limit: z.coerce.number().int().min(1).max(20).default(10) }),
    z.array(brandStatProductSchema),
  ),

  // ---------- 平台管理侧 ----------
  BrandMallAdmin_shops: get(
    "/enterprise/admin/brand-mall/shop/list",
    brandAdminShopListQuerySchema,
    z.object({
      list: z.array(brandAdminShopRowSchema),
      total: z.number(),
      page: z.number(),
      pageSize: z.number(),
    }),
  ),
  BrandMallAdmin_shopDetail: get(
    "/enterprise/admin/brand-mall/shop/detail",
    z.object({ shopId: z.coerce.number().int().positive() }),
    brandAdminShopRowSchema,
  ),
  BrandMallAdmin_shopSuspend: post(
    "/enterprise/admin/brand-mall/shop/suspend",
    brandAdminSuspendBodySchema,
    okResult,
  ),
  BrandMallAdmin_shopResume: post(
    "/enterprise/admin/brand-mall/shop/resume",
    idBody({}),
    okResult,
  ),
  BrandMallAdmin_settings: get(
    "/enterprise/admin/brand-mall/settings",
    emptyQuery,
    brandAdminSettingsSchema,
  ),
  BrandMallAdmin_saveSettings: post(
    "/enterprise/admin/brand-mall/settings",
    brandAdminSettingsBodySchema,
    brandAdminSettingsSchema,
  ),
  BrandMallAdmin_expressList: get(
    "/enterprise/admin/brand-mall/express/list",
    emptyQuery,
    z.array(brandExpressSchema),
  ),
  BrandMallAdmin_saveExpress: post(
    "/enterprise/admin/brand-mall/express/save",
    brandExpressSaveBodySchema,
    brandExpressSchema,
  ),
  BrandMallAdmin_removeExpress: post(
    "/enterprise/admin/brand-mall/express/remove",
    z.object({ id: z.number().int().positive() }),
    okResult,
  ),
  BrandMallAdmin_statOverview: get(
    "/enterprise/admin/brand-mall/stat/overview",
    emptyQuery,
    z.object({
      shopTotal: z.number(),
      onlineShopTotal: z.number(),
      suspendedShopTotal: z.number(),
      productTotal: z.number(),
      orderTotal: z.number(),
      orderAmountTotal: money,
      customerTotal: z.number(),
    }),
  ),
};
