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
const okResult = z.object({ ok: z.boolean(), message: z.string() });

/**
 * 金额统一 number（两位小数）。Prisma 侧 `@db.Decimal(18, 2)`，
 * 服务层一律换算成「分」做整数运算后再回除。
 */
const money = z.number().min(0).max(9_999_999_999);

/**
 * 建站管理 · 多店铺商城平台（B2B2C）。
 *
 * 三层身份严格分离：
 * 1. 市场运营方＝本站用户（`Market_*`，`/enterprise/marketplace/**`，站内会话）；
 * 2. 商户＝独立账号体系（`MpMerchant_*`，`/api/merchant/mp/**`，商户令牌），
 *    **不进站内 User / org-staff**，令牌 issuer 独立，载荷带 marketId + merchantId；
 * 3. 买家＝C 端顾客令牌（`/api/public/market/**`，B1 起接入，不进契约）。
 * 平台管理员侧 `MpAdmin_*` 走 `/enterprise/admin/marketplace/**`。
 *
 * 说明：`Mp_` 前缀已被模型广场占用（operationId 全局唯一），市场运营方前缀取 `Market_`。
 * 商户通道不进 `endpoints` 总表：它不属站内会话鉴权、也不能被 MCP 以站内身份调用，
 * 由 `backend/src/marketplace/mp.merchant.routes.ts` 手写注册，契约在此共享 DTO。
 */

// ---------------------------------------------------------------- 枚举与文案

export const MP_MARKET_STATUSES = [
  "DRAFT",
  "ONLINE",
  "SUSPENDED",
  "CLOSED",
] as const;
export type MpMarketStatus = (typeof MP_MARKET_STATUSES)[number];
export const MP_MARKET_STATUS_LABELS: Record<string, string> = {
  DRAFT: "筹备中",
  ONLINE: "营业中",
  SUSPENDED: "平台停服",
  CLOSED: "已关闭",
};

/** 运营方自己可切的状态：停服/解停只归平台管理员。 */
export const MP_MARKET_SELF_STATUSES = ["DRAFT", "ONLINE", "CLOSED"] as const;

export const MP_MERCHANT_AUDIT_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "BANNED",
] as const;
export type MpMerchantAuditStatus = (typeof MP_MERCHANT_AUDIT_STATUSES)[number];
export const MP_MERCHANT_AUDIT_STATUS_LABELS: Record<string, string> = {
  PENDING: "待审核",
  APPROVED: "已通过",
  REJECTED: "已驳回",
  BANNED: "已封禁",
};

export const MP_MERCHANT_AUDIT_ACTIONS = [
  "APPROVE",
  "REJECT",
  "BAN",
  "UNBAN",
] as const;
export type MpMerchantAuditAction = (typeof MP_MERCHANT_AUDIT_ACTIONS)[number];

export const MP_MERCHANT_STATUSES = ["ACTIVE", "CLOSED"] as const;
export type MpMerchantStatus = (typeof MP_MERCHANT_STATUSES)[number];
export const MP_MERCHANT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "正常",
  CLOSED: "已退出",
};

export const MP_SHOP_STATUSES = [
  "DRAFT",
  "ONLINE",
  "SUSPENDED",
  "CLOSED",
] as const;
export type MpShopStatus = (typeof MP_SHOP_STATUSES)[number];
export const MP_SHOP_STATUS_LABELS: Record<string, string> = {
  DRAFT: "装修中",
  ONLINE: "营业中",
  SUSPENDED: "平台停服",
  CLOSED: "已关闭",
};

export const MP_MERCHANT_ROLES = ["OWNER", "STAFF"] as const;
export type MpMerchantRole = (typeof MP_MERCHANT_ROLES)[number];
export const MP_MERCHANT_ROLE_LABELS: Record<string, string> = {
  OWNER: "负责人",
  STAFF: "店员",
};

export const MP_CATEGORY_STATUSES = ["ONLINE", "OFFLINE"] as const;
export type MpCategoryStatus = (typeof MP_CATEGORY_STATUSES)[number];

export const MP_MERCHANT_USER_STATUSES = ["ACTIVE", "DISABLED"] as const;

// ---------------------------------------------------------------- 市场

export const mpOverviewSchema = z.object({
  merchantTotal: z.number(),
  pendingMerchantTotal: z.number(),
  shopTotal: z.number(),
  onlineShopTotal: z.number(),
  categoryTotal: z.number(),
  /** 近 7 天新增商户 */
  weekMerchantTotal: z.number(),
});
export type MpOverview = z.infer<typeof mpOverviewSchema>;

export const mpMarketSchema = z.object({
  id: z.number(),
  /** 公开寻址码：小程序 config.js 的 market 值 */
  shopCode: z.string(),
  name: z.string(),
  logo: z.string(),
  description: z.string(),
  themeColor: z.string(),
  /** 未支付订单自动关闭分钟数 */
  closeMinutes: z.number(),
  /** 结算周期（天） */
  settleCycleDays: z.number(),
  status: z.enum(MP_MARKET_STATUSES),
  offReason: z.string(),
  merchantTotal: z.number(),
  pendingMerchantTotal: z.number(),
  shopTotal: z.number(),
  categoryTotal: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MpMarket = z.infer<typeof mpMarketSchema>;

export const mpMarketCreateBodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  logo: z.string().max(500).default(""),
  description: z.string().max(500).default(""),
  themeColor: z.string().trim().max(16).default("#E93323"),
});
export type MpMarketCreateBody = z.infer<typeof mpMarketCreateBodySchema>;

export const mpMarketSaveBodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  logo: z.string().max(500).default(""),
  description: z.string().max(500).default(""),
  themeColor: z.string().trim().max(16).default("#E93323"),
  closeMinutes: z.number().int().min(5).max(1440).default(30),
  settleCycleDays: z.number().int().min(1).max(90).default(7),
});
export type MpMarketSaveBody = z.infer<typeof mpMarketSaveBodySchema>;

export const mpMarketStatusBodySchema = z.object({
  status: z.enum(MP_MARKET_SELF_STATUSES),
});
export type MpMarketStatusBody = z.infer<typeof mpMarketStatusBodySchema>;

// ---------------------------------------------------------------- 商户

export const mpMerchantSchema = z.object({
  id: z.number(),
  marketId: z.number(),
  name: z.string(),
  licenseNo: z.string(),
  licenseImage: z.string(),
  contactName: z.string(),
  contactPhone: z.string(),
  categoryIds: z.array(z.number()),
  categoryNames: z.array(z.string()),
  auditStatus: z.enum(MP_MERCHANT_AUDIT_STATUSES),
  auditNote: z.string(),
  auditAt: z.string(),
  auditBy: z.string(),
  status: z.enum(MP_MERCHANT_STATUSES),
  commissionRate: money.nullable(),
  expireAt: z.string(),
  shopCount: z.number(),
  createdAt: z.string(),
});
export type MpMerchant = z.infer<typeof mpMerchantSchema>;

export const mpMerchantListQuerySchema = pageQuerySchema.extend({
  keyword: z.string().trim().max(60).default(""),
  auditStatus: z.string().trim().max(16).default(""),
  status: z.string().trim().max(16).default(""),
});

export const mpMerchantAuditBodySchema = z.object({
  id: z.number().int().positive(),
  action: z.enum(MP_MERCHANT_AUDIT_ACTIONS),
  /** 驳回/封禁必填；通过时留空即可 */
  note: z.string().trim().max(500).default(""),
  /** 可选：按商户覆盖抽佣比例（百分数，如 5.00） */
  commissionRate: money.max(100).nullable().optional(),
});
export type MpMerchantAuditBody = z.infer<typeof mpMerchantAuditBodySchema>;

export const mpMerchantStatusBodySchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(MP_MERCHANT_STATUSES),
});
export type MpMerchantStatusBody = z.infer<typeof mpMerchantStatusBodySchema>;

export const mpMerchantUserSchema = z.object({
  id: z.number(),
  username: z.string(),
  role: z.enum(MP_MERCHANT_ROLES),
  phone: z.string(),
  status: z.enum(MP_MERCHANT_USER_STATUSES),
  lastLoginAt: z.string(),
  createdAt: z.string(),
});
export type MpMerchantUser = z.infer<typeof mpMerchantUserSchema>;

export const mpMerchantDetailSchema = z.object({
  merchant: mpMerchantSchema,
  shops: z.array(
    z.object({
      id: z.number(),
      shopCode: z.string(),
      name: z.string(),
      logo: z.string(),
      status: z.enum(MP_SHOP_STATUSES),
      payEnabled: z.boolean(),
      createdAt: z.string(),
    }),
  ),
  users: z.array(mpMerchantUserSchema),
});
export type MpMerchantDetail = z.infer<typeof mpMerchantDetailSchema>;

// ---------------------------------------------------------------- 店铺

export const mpShopSchema = z.object({
  id: z.number(),
  marketId: z.number(),
  merchantId: z.number(),
  merchantName: z.string(),
  name: z.string(),
  logo: z.string(),
  intro: z.string(),
  categoryIds: z.array(z.number()),
  categoryNames: z.array(z.string()),
  shopCode: z.string(),
  mchId: z.string(),
  payEnabled: z.boolean(),
  status: z.enum(MP_SHOP_STATUSES),
  sortOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MpShop = z.infer<typeof mpShopSchema>;

export const mpShopListQuerySchema = pageQuerySchema.extend({
  keyword: z.string().trim().max(60).default(""),
  status: z.string().trim().max(16).default(""),
});

export const mpShopStatusBodySchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(["ONLINE", "SUSPENDED", "CLOSED"]),
  reason: z.string().trim().max(500).default(""),
});
export type MpShopStatusBody = z.infer<typeof mpShopStatusBodySchema>;

// ---------------------------------------------------------------- 平台类目

export const mpCategorySchema = z.object({
  id: z.number(),
  marketId: z.number(),
  parentId: z.number(),
  name: z.string(),
  icon: z.string(),
  sortOrder: z.number(),
  status: z.enum(MP_CATEGORY_STATUSES),
  merchantTotal: z.number(),
  createdAt: z.string(),
});
export type MpCategory = z.infer<typeof mpCategorySchema>;

export const mpCategorySaveBodySchema = z.object({
  id: z.number().int().min(0).default(0),
  parentId: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(60),
  icon: z.string().max(500).default(""),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  status: z.enum(MP_CATEGORY_STATUSES).default("ONLINE"),
});
export type MpCategorySaveBody = z.infer<typeof mpCategorySaveBodySchema>;

export const mpCategoryRemoveBodySchema = z.object({
  id: z.number().int().positive(),
});

// ---------------------------------------------------------------- 入驻与商户会话

export const mpMerchantApplyBodySchema = z.object({
  /** 市场公开寻址码（运营方在「市场设置」里可见） */
  marketCode: z.string().trim().min(4).max(16),
  name: z.string().trim().min(2).max(120),
  licenseNo: z.string().trim().max(64).default(""),
  licenseImage: z.string().max(500).default(""),
  contactName: z.string().trim().min(1).max(60),
  contactPhone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{5,32}$/, "联系电话格式不正确"),
  categoryIds: z.array(z.number().int().positive()).max(20).default([]),
  username: z
    .string()
    .trim()
    .min(4)
    .max(32)
    .regex(
      /^[A-Za-z][A-Za-z0-9_]*$/,
      "账号需以字母开头，仅含字母、数字、下划线",
    ),
  password: z.string().min(8).max(64),
  phone: z.string().trim().max(32).default(""),
});
export type MpMerchantApplyBody = z.infer<typeof mpMerchantApplyBodySchema>;

export const mpMerchantLoginBodySchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(64),
});
export type MpMerchantLoginBody = z.infer<typeof mpMerchantLoginBodySchema>;

export const mpMerchantOptionsSchema = z.object({
  marketName: z.string(),
  marketCode: z.string(),
  categories: z.array(
    z.object({ id: z.number(), name: z.string(), parentId: z.number() }),
  ),
});
export type MpMerchantOptions = z.infer<typeof mpMerchantOptionsSchema>;

/** 登录结果：令牌只在这里出现一次，之后任何读接口都不回传。 */
export const mpMerchantSessionSchema = z.object({
  token: z.string(),
  merchantId: z.number(),
  marketId: z.number(),
  marketName: z.string(),
  marketShopCode: z.string(),
  shopId: z.number(),
  shopCode: z.string(),
  shopName: z.string(),
  username: z.string(),
  role: z.enum(MP_MERCHANT_ROLES),
  auditStatus: z.enum(MP_MERCHANT_AUDIT_STATUSES),
  auditNote: z.string(),
});
export type MpMerchantSession = z.infer<typeof mpMerchantSessionSchema>;

export const mpMerchantProfileSchema = z.object({
  merchantId: z.number(),
  merchantName: z.string(),
  marketId: z.number(),
  marketName: z.string(),
  marketShopCode: z.string(),
  marketStatus: z.enum(MP_MARKET_STATUSES),
  auditStatus: z.enum(MP_MERCHANT_AUDIT_STATUSES),
  auditNote: z.string(),
  userId: z.number(),
  username: z.string(),
  role: z.enum(MP_MERCHANT_ROLES),
  phone: z.string(),
  lastLoginAt: z.string(),
  shop: mpShopSchema.nullable(),
});
export type MpMerchantProfile = z.infer<typeof mpMerchantProfileSchema>;

export const mpMerchantPasswordBodySchema = z.object({
  oldPassword: z.string().min(1).max(64),
  newPassword: z.string().min(8).max(64),
});
export type MpMerchantPasswordBody = z.infer<
  typeof mpMerchantPasswordBodySchema
>;

export const mpMerchantShopSaveBodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  logo: z.string().max(500).default(""),
  intro: z.string().max(500).default(""),
  categoryIds: z.array(z.number().int().positive()).max(20).default([]),
  mchId: z.string().trim().max(64).default(""),
  payEnabled: z.boolean().default(false),
});
export type MpMerchantShopSaveBody = z.infer<
  typeof mpMerchantShopSaveBodySchema
>;

export const mpMerchantShopStatusBodySchema = z.object({
  status: z.enum(["DRAFT", "ONLINE"]),
});
export type MpMerchantShopStatusBody = z.infer<
  typeof mpMerchantShopStatusBodySchema
>;

export const mpMerchantStaffSaveBodySchema = z.object({
  id: z.number().int().min(0).default(0),
  username: z
    .string()
    .trim()
    .min(4)
    .max(32)
    .regex(
      /^[A-Za-z][A-Za-z0-9_]*$/,
      "账号需以字母开头，仅含字母、数字、下划线",
    ),
  /** 新建必填；编辑留空表示不改密码 */
  password: z.string().max(64).default(""),
  role: z.enum(MP_MERCHANT_ROLES).default("STAFF"),
  phone: z.string().trim().max(32).default(""),
});
export type MpMerchantStaffSaveBody = z.infer<
  typeof mpMerchantStaffSaveBodySchema
>;

export const mpMerchantStaffStatusBodySchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(MP_MERCHANT_USER_STATUSES),
});

// ---------------------------------------------------------------- 平台管理员台账

export const mpAdminMarketRowSchema = z.object({
  id: z.number(),
  ownerUserId: z.string(),
  ownerName: z.string(),
  shopCode: z.string(),
  name: z.string(),
  status: z.enum(MP_MARKET_STATUSES),
  merchantTotal: z.number(),
  shopTotal: z.number(),
  offReason: z.string(),
  createdAt: z.string(),
});
export type MpAdminMarketRow = z.infer<typeof mpAdminMarketRowSchema>;

export const mpAdminMarketListQuerySchema = pageQuerySchema.extend({
  keyword: z.string().trim().max(60).default(""),
  status: z.string().trim().max(16).default(""),
});

export const mpAdminMarketStatusBodySchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(MP_MARKET_STATUSES),
  reason: z.string().trim().max(500).default(""),
});
export type MpAdminMarketStatusBody = z.infer<
  typeof mpAdminMarketStatusBodySchema
>;

// ---------------------------------------------------------------- B1 商品域

export const MP_PRODUCT_STATUSES = [
  "DRAFT",
  "PENDING",
  "ONLINE",
  "OFFLINE",
  "REJECTED",
] as const;
export type MpProductStatus = (typeof MP_PRODUCT_STATUSES)[number];
export const MP_PRODUCT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  PENDING: "待审核",
  ONLINE: "在售",
  OFFLINE: "已下架",
  REJECTED: "审核驳回",
};

export const MP_PRODUCT_AUDIT_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
] as const;
export type MpProductAuditStatus = (typeof MP_PRODUCT_AUDIT_STATUSES)[number];
export const MP_PRODUCT_AUDIT_STATUS_LABELS: Record<string, string> = {
  PENDING: "待审核",
  APPROVED: "已通过",
  REJECTED: "已驳回",
};

export const MP_PRODUCT_TYPES = ["NORMAL", "VIRTUAL"] as const;
export type MpProductType = (typeof MP_PRODUCT_TYPES)[number];

export const mpProductSpecSchema = z.object({
  name: z.string().trim().min(1).max(30),
  values: z.array(z.string().trim().min(1).max(60)).max(50),
});
export type MpProductSpec = z.infer<typeof mpProductSpecSchema>;

export const mpProductSkuSchema = z.object({
  id: z.number(),
  skuName: z.string(),
  image: z.string(),
  uniqueId: z.string(),
  specValues: z.record(z.string(), z.string()),
  price: z.number(),
  marketPrice: z.number(),
  costPrice: z.number(),
  stock: z.number(),
  sales: z.number(),
  weight: z.number(),
  barcode: z.string(),
  enabled: z.boolean(),
});
export type MpProductSku = z.infer<typeof mpProductSkuSchema>;

export const mpProductSchema = z.object({
  id: z.number(),
  marketId: z.number(),
  merchantId: z.number(),
  shopId: z.number(),
  shopName: z.string(),
  categoryId: z.number(),
  categoryName: z.string(),
  title: z.string(),
  subtitle: z.string(),
  coverImage: z.string(),
  images: z.array(z.string()),
  detail: z.string(),
  type: z.enum(MP_PRODUCT_TYPES),
  price: z.number(),
  marketPrice: z.number(),
  costPrice: z.number(),
  stock: z.number(),
  sales: z.number(),
  unit: z.string(),
  weight: z.number(),
  freightAmount: z.number(),
  specs: z.array(mpProductSpecSchema),
  guarantee: z.array(z.string()),
  status: z.enum(MP_PRODUCT_STATUSES),
  auditNote: z.string(),
  sortOrder: z.number(),
  isHot: z.boolean(),
  isNew: z.boolean(),
  reviewCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MpProduct = z.infer<typeof mpProductSchema>;

export const mpProductDetailSchema = z.object({
  product: mpProductSchema,
  skus: z.array(mpProductSkuSchema),
});
export type MpProductDetail = z.infer<typeof mpProductDetailSchema>;

export const mpProductListQuerySchema = pageQuerySchema.extend({
  keyword: z.string().trim().max(60).default(""),
  status: z.string().trim().max(16).default(""),
});

export const mpSkuSaveBodySchema = z.object({
  /** 0 = 新增 */
  id: z.number().int().min(0).default(0),
  skuName: z.string().trim().max(200).default(""),
  image: z.string().max(500).default(""),
  specValues: z.record(z.string(), z.string()).default({}),
  price: money.default(0),
  marketPrice: money.default(0),
  costPrice: money.default(0),
  stock: z.number().int().min(0).max(9_999_999).default(0),
  weight: z.number().min(0).max(9_999_999).default(0),
  barcode: z.string().trim().max(64).default(""),
  enabled: z.boolean().default(true),
});
export type MpSkuSaveBody = z.infer<typeof mpSkuSaveBodySchema>;

export const mpProductSaveBodySchema = z.object({
  /** 0 = 新建 */
  id: z.number().int().min(0).default(0),
  categoryId: z.number().int().min(0).default(0),
  title: z.string().trim().min(1, "请填写商品标题").max(200),
  subtitle: z.string().trim().max(200).default(""),
  coverImage: z.string().max(500).default(""),
  images: z.array(z.string().max(500)).max(9).default([]),
  detail: z.string().max(200_000).default(""),
  type: z.enum(MP_PRODUCT_TYPES).default("NORMAL"),
  price: money.default(0),
  marketPrice: money.default(0),
  costPrice: money.default(0),
  stock: z.number().int().min(0).max(9_999_999).default(0),
  unit: z.string().trim().max(20).default("件"),
  weight: z.number().min(0).max(9_999_999).default(0),
  freightAmount: money.default(0),
  specs: z.array(mpProductSpecSchema).max(3).default([]),
  guarantee: z.array(z.string().trim().max(30)).max(10).default([]),
  skus: z.array(mpSkuSaveBodySchema).max(200).default([]),
});
export type MpProductSaveBody = z.infer<typeof mpProductSaveBodySchema>;

export const mpProductIdBodySchema = z.object({
  id: z.number().int().positive(),
});

export const mpProductStatusBodySchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(["ONLINE", "OFFLINE"]),
});
export type MpProductStatusBody = z.infer<typeof mpProductStatusBodySchema>;

export const mpProductAuditSchema = z.object({
  id: z.number(),
  productId: z.number(),
  productTitle: z.string(),
  shopId: z.number(),
  shopName: z.string(),
  merchantName: z.string(),
  auditStatus: z.enum(MP_PRODUCT_AUDIT_STATUSES),
  reason: z.string(),
  snapshotHash: z.string(),
  submitBy: z.string(),
  auditBy: z.string(),
  auditAt: z.string(),
  createdAt: z.string(),
});
export type MpProductAudit = z.infer<typeof mpProductAuditSchema>;

export const mpProductAuditListQuerySchema = pageQuerySchema.extend({
  auditStatus: z.string().trim().max(16).default("PENDING"),
  keyword: z.string().trim().max(60).default(""),
});

export const mpProductAuditBodySchema = z.object({
  id: z.number().int().positive(),
  approve: z.boolean(),
  reason: z.string().trim().max(500).default(""),
});
export type MpProductAuditBody = z.infer<typeof mpProductAuditBodySchema>;

// ---------------------------------------------------------------- B1 C 端顾客与地址

export const mpCustomerSchema = z.object({
  id: z.number(),
  marketId: z.number(),
  nickname: z.string(),
  avatar: z.string(),
  phone: z.string(),
  gender: z.number(),
  level: z.string(),
  points: z.number(),
  balance: z.number(),
  status: z.string(),
  createdAt: z.string(),
});
export type MpCustomer = z.infer<typeof mpCustomerSchema>;

export const mpCustomerLoginBodySchema = z.object({
  marketCode: z.string().trim().min(4).max(16),
  /** `wx.login` 拿到的 code */
  code: z.string().trim().min(1).max(128),
  nickname: z.string().trim().max(60).default(""),
  avatar: z.string().max(500).default(""),
});
export type MpCustomerLoginBody = z.infer<typeof mpCustomerLoginBodySchema>;

export const mpCustomerLoginResultSchema = z.object({
  token: z.string(),
  customer: mpCustomerSchema,
});
export type MpCustomerLoginResult = z.infer<typeof mpCustomerLoginResultSchema>;

export const mpAddressSchema = z.object({
  id: z.number(),
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
export type MpAddress = z.infer<typeof mpAddressSchema>;

export const mpAddressSaveBodySchema = z.object({
  /** 0 = 新增 */
  id: z.number().int().min(0).default(0),
  realName: z.string().trim().min(1, "请填写收货人").max(30),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{5,20}$/, "手机号格式不正确"),
  province: z.string().trim().max(40).default(""),
  city: z.string().trim().max(40).default(""),
  district: z.string().trim().max(40).default(""),
  detail: z.string().trim().min(1, "请填写详细地址").max(200),
  postalCode: z.string().trim().max(10).default(""),
  isDefault: z.boolean().default(false),
  tag: z.string().trim().max(10).default(""),
});
export type MpAddressSaveBody = z.infer<typeof mpAddressSaveBodySchema>;

export const mpAddressIdBodySchema = z.object({
  id: z.number().int().positive(),
});

// ---------------------------------------------------------------- B1 购物车与结算

export const mpCartItemSchema = z.object({
  id: z.number(),
  shopId: z.number(),
  shopName: z.string(),
  productId: z.number(),
  skuId: z.number(),
  title: z.string(),
  skuName: z.string(),
  image: z.string(),
  price: z.number(),
  quantity: z.number(),
  stock: z.number(),
  selected: z.boolean(),
  /** 商品下架/店铺停业时不可勾选，原因对买家可见 */
  invalidReason: z.string(),
});
export type MpCartItem = z.infer<typeof mpCartItemSchema>;

export const mpCartAddBodySchema = z.object({
  productId: z.number().int().positive(),
  skuId: z.number().int().min(0).default(0),
  quantity: z.number().int().min(1).max(999).default(1),
});
export type MpCartAddBody = z.infer<typeof mpCartAddBodySchema>;

export const mpCartQuantityBodySchema = z.object({
  id: z.number().int().positive(),
  quantity: z.number().int().min(1).max(999),
});

export const mpCartSelectBodySchema = z.object({
  /** 0 = 全选/全不选 */
  id: z.number().int().min(0).default(0),
  selected: z.boolean(),
});

export const mpCartRemoveBodySchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(100),
});

export const mpSettleItemSchema = z.object({
  cartId: z.number(),
  productId: z.number(),
  skuId: z.number(),
  title: z.string(),
  skuName: z.string(),
  image: z.string(),
  price: z.number(),
  quantity: z.number(),
  totalPrice: z.number(),
});
export type MpSettleItem = z.infer<typeof mpSettleItemSchema>;

export const mpSettleShopSchema = z.object({
  shopId: z.number(),
  shopName: z.string(),
  merchantId: z.number(),
  goodsAmount: z.number(),
  freightAmount: z.number(),
  discountAmount: z.number(),
  payAmount: z.number(),
  commissionRate: z.number(),
  commissionAmount: z.number(),
  items: z.array(mpSettleItemSchema),
});
export type MpSettleShop = z.infer<typeof mpSettleShopSchema>;

export const mpSettlePreviewSchema = z.object({
  marketId: z.number(),
  shops: z.array(mpSettleShopSchema),
  goodsAmount: z.number(),
  freightAmount: z.number(),
  discountAmount: z.number(),
  payAmount: z.number(),
  /** 当前选中的券与抵扣额（0 表示未选券） */
  couponTicketId: z.number().default(0),
  couponName: z.string().default(""),
  couponDiscount: z.number().default(0),
  /** 顾客可用券：usable=false 时 reason 给出不可用原因 */
  coupons: z
    .array(
      z.object({
        ticketId: z.number(),
        couponId: z.number(),
        name: z.string(),
        type: z.string(),
        value: z.number(),
        threshold: z.number(),
        expireAt: z.string(),
        usable: z.boolean(),
        reason: z.string(),
      }),
    )
    .default([]),
  address: mpAddressSchema.nullable(),
});
export type MpSettlePreview = z.infer<typeof mpSettlePreviewSchema>;

export const mpSettlePreviewBodySchema = z.object({
  cartIds: z.array(z.number().int().positive()).min(1).max(200),
  /** 0 = 不用券；选券后按券范围与门槛重算 */
  couponTicketId: z.number().int().min(0).default(0),
});

// ---------------------------------------------------------------- B1 父单 / 子单

export const MP_ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "PAID",
  "SHIPPED",
  "COMPLETED",
  "CANCELLED",
] as const;
export type MpOrderStatus = (typeof MP_ORDER_STATUSES)[number];
export const MP_ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "待付款",
  PAID: "待发货",
  SHIPPED: "已发货",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

export const mpShopOrderItemSchema = z.object({
  id: z.number(),
  productId: z.number(),
  skuId: z.number(),
  title: z.string(),
  skuName: z.string(),
  image: z.string(),
  price: z.number(),
  quantity: z.number(),
  totalPrice: z.number(),
  refundStatus: z.string(),
  reviewed: z.boolean(),
});
export type MpShopOrderItem = z.infer<typeof mpShopOrderItemSchema>;

export const mpShopOrderSchema = z.object({
  id: z.number(),
  orderId: z.number(),
  subOrderNo: z.string(),
  marketId: z.number(),
  merchantId: z.number(),
  shopId: z.number(),
  shopName: z.string(),
  status: z.enum(MP_ORDER_STATUSES),
  payStatus: z.string(),
  refundStatus: z.string(),
  goodsAmount: z.number(),
  freightAmount: z.number(),
  discountAmount: z.number(),
  payAmount: z.number(),
  commissionRate: z.number(),
  commissionAmount: z.number(),
  receiverName: z.string(),
  receiverPhone: z.string(),
  receiverAddress: z.string(),
  buyerRemark: z.string(),
  sellerRemark: z.string(),
  expressCompany: z.string(),
  expressNo: z.string(),
  shippedAt: z.string(),
  completedAt: z.string(),
  createdAt: z.string(),
  items: z.array(mpShopOrderItemSchema),
});
export type MpShopOrder = z.infer<typeof mpShopOrderSchema>;

export const mpOrderSchema = z.object({
  id: z.number(),
  orderNo: z.string(),
  marketId: z.number(),
  status: z.enum(MP_ORDER_STATUSES),
  payStatus: z.string(),
  goodsAmount: z.number(),
  freightAmount: z.number(),
  discountAmount: z.number(),
  payAmount: z.number(),
  couponName: z.string().default(""),
  shopOrderCount: z.number(),
  receiverName: z.string(),
  receiverPhone: z.string(),
  receiverAddress: z.string(),
  buyerRemark: z.string(),
  paidAt: z.string(),
  expireAt: z.string(),
  createdAt: z.string(),
  shopOrders: z.array(mpShopOrderSchema),
});
export type MpOrder = z.infer<typeof mpOrderSchema>;

export const mpPayParamsSchema = z.object({
  timeStamp: z.string(),
  nonceStr: z.string(),
  package: z.string(),
  signType: z.string(),
  paySign: z.string(),
});
export type MpPayParams = z.infer<typeof mpPayParamsSchema>;

export const mpOrderCreatedSchema = z.object({
  order: mpOrderSchema,
  /** 微信支付参数；未配置商户号或线下标记时为空，按 payHint 提示 */
  payParams: mpPayParamsSchema.nullable(),
  payHint: z.string(),
});
export type MpOrderCreated = z.infer<typeof mpOrderCreatedSchema>;

export const mpOrderCreateBodySchema = z.object({
  cartIds: z.array(z.number().int().positive()).min(1).max(200),
  addressId: z.number().int().positive(),
  buyerRemark: z.string().trim().max(200).default(""),
  /** 0 = 不用券；须为顾客本人未使用且适用的券 */
  couponTicketId: z.number().int().min(0).default(0),
});
export type MpOrderCreateBody = z.infer<typeof mpOrderCreateBodySchema>;

export const mpOrderListQuerySchema = pageQuerySchema.extend({
  status: z.string().trim().max(20).default(""),
});

export const mpOrderIdBodySchema = z.object({
  id: z.number().int().positive(),
});

export const mpShopOrderIdBodySchema = z.object({
  id: z.number().int().positive(),
});

export const mpShopOrderShipBodySchema = z.object({
  id: z.number().int().positive(),
  expressCompany: z.string().trim().min(1, "请填写快递公司").max(40),
  expressNo: z.string().trim().min(1, "请填写快递单号").max(60),
});
export type MpShopOrderShipBody = z.infer<typeof mpShopOrderShipBodySchema>;

export const mpShopOrderRemarkBodySchema = z.object({
  id: z.number().int().positive(),
  sellerRemark: z.string().trim().max(500).default(""),
});

// ---------------------------------------------------------------- 装修节点
//
// 定义前置：公开浏览的 bootstrap 与商品详情都要带回已发布的装修快照。

/** 装修节点：type 由 MP_DIY_WIDGETS 白名单收敛，props 由前端编辑器和渲染器共同约定。 */
export const mpDiyNodeSchema = z.object({
  type: z.string(),
  props: z.record(z.string(), z.unknown()),
});
export type MpDiyNode = z.infer<typeof mpDiyNodeSchema>;

/** C 端读到的线上装修快照（发布过才回，草稿不可见）。 */
export const mpPublicDiySchema = z.object({
  components: z.array(mpDiyNodeSchema),
  styles: z.record(z.string(), z.unknown()),
});
export type MpPublicDiy = z.infer<typeof mpPublicDiySchema>;

// ---------------------------------------------------------------- B1 公开浏览

export const mpPublicMarketSchema = z.object({
  id: z.number(),
  name: z.string(),
  logo: z.string(),
  description: z.string(),
  themeColor: z.string(),
  shopCode: z.string(),
  /** 平台装修的首页（未发布过则为空，C 端回落到默认楼层） */
  home: mpPublicDiySchema.nullable().default(null),
  /** 市场绑定的 AI 客服站点（空 = 未开通，端上显示未开通并回落联系方式） */
  deskSiteKey: z.string().default(""),
  deskEmbedUrl: z.string().default(""),
});
export type MpPublicMarket = z.infer<typeof mpPublicMarketSchema>;

export const mpPublicCategorySchema = z.object({
  id: z.number(),
  parentId: z.number(),
  name: z.string(),
  icon: z.string(),
  sortOrder: z.number(),
});

export const mpPublicShopSchema = z.object({
  id: z.number(),
  name: z.string(),
  logo: z.string(),
  intro: z.string(),
  shopCode: z.string(),
  sortOrder: z.number(),
  themeColor: z.string().default(""),
  /** 当前顾客是否已关注（未带顾客令牌时恒为 false） */
  followed: z.boolean().default(false),
});
export type MpPublicShop = z.infer<typeof mpPublicShopSchema>;

export const mpPublicBootstrapSchema = z.object({
  market: mpPublicMarketSchema,
  categories: z.array(mpPublicCategorySchema),
  shops: z.array(mpPublicShopSchema),
});
export type MpPublicBootstrap = z.infer<typeof mpPublicBootstrapSchema>;

export const mpPublicProductSchema = z.object({
  id: z.number(),
  shopId: z.number(),
  shopName: z.string(),
  categoryId: z.number(),
  title: z.string(),
  subtitle: z.string(),
  coverImage: z.string(),
  price: z.number(),
  marketPrice: z.number(),
  stock: z.number(),
  sales: z.number(),
  unit: z.string(),
  isHot: z.boolean(),
  isNew: z.boolean(),
  reviewCount: z.number(),
});
export type MpPublicProduct = z.infer<typeof mpPublicProductSchema>;

export const mpPublicProductListQuerySchema = pageQuerySchema.extend({
  marketCode: z.string().trim().min(4).max(16),
  keyword: z.string().trim().max(60).default(""),
  shopId: z.coerce.number().int().min(0).default(0),
  categoryId: z.coerce.number().int().min(0).default(0),
});

export const mpPublicProductDetailSchema = z.object({
  product: mpPublicProductSchema,
  detail: z.string(),
  images: z.array(z.string()),
  specs: z.array(mpProductSpecSchema),
  guarantee: z.array(z.string()),
  skus: z.array(mpProductSkuSchema),
  shop: mpPublicShopSchema,
});
export type MpPublicProductDetail = z.infer<typeof mpPublicProductDetailSchema>;

export const mpPublicProductIdQuerySchema = z.object({
  marketCode: z.string().trim().min(4).max(16),
  id: z.coerce.number().int().positive(),
});

// ---------------------------------------------------------------- B2 售后
//
// 买家发起 → 商户审核 → （退货单买家回填物流、商户确认收货）→ 退款执行。
// 商户驳回后买家可再申请；平台在市场侧可仲裁强制退款或维持驳回。

export const MP_AFTER_SALE_TYPES = ["REFUND_ONLY", "RETURN_REFUND"] as const;
export type MpAfterSaleType = (typeof MP_AFTER_SALE_TYPES)[number];
export const MP_AFTER_SALE_TYPE_LABELS: Record<string, string> = {
  REFUND_ONLY: "仅退款",
  RETURN_REFUND: "退货退款",
};

/** AGREED：仅退款即刻执行退款、退货退款等待买家寄回并商户确认收货。 */
export const MP_AFTER_SALE_STATUSES = [
  "PENDING",
  "AGREED",
  "REJECTED",
  "REFUNDED",
  "CANCELLED",
] as const;
export type MpAfterSaleStatus = (typeof MP_AFTER_SALE_STATUSES)[number];
export const MP_AFTER_SALE_STATUS_LABELS: Record<string, string> = {
  PENDING: "待审核",
  AGREED: "待退货",
  REJECTED: "已驳回",
  REFUNDED: "已退款",
  CANCELLED: "已撤销",
};

export const MP_AFTER_SALE_AUDIT_ACTIONS = ["AGREE", "REJECT"] as const;
export type MpAfterSaleAuditAction =
  (typeof MP_AFTER_SALE_AUDIT_ACTIONS)[number];
export const MP_AFTER_SALE_ARBITRATE_ACTIONS = ["REFUND", "REJECT"] as const;
export type MpAfterSaleArbitrateAction =
  (typeof MP_AFTER_SALE_ARBITRATE_ACTIONS)[number];

export const mpAfterSaleItemSchema = z.object({
  id: z.number(),
  orderItemId: z.number(),
  productId: z.number(),
  skuId: z.number(),
  title: z.string(),
  skuName: z.string(),
  image: z.string(),
  price: z.number(),
  quantity: z.number(),
  amount: z.number(),
});
export type MpAfterSaleItem = z.infer<typeof mpAfterSaleItemSchema>;

export const mpAfterSaleSchema = z.object({
  id: z.number(),
  afterSaleNo: z.string(),
  marketId: z.number(),
  merchantId: z.number(),
  shopId: z.number(),
  shopName: z.string(),
  orderId: z.number(),
  shopOrderId: z.number(),
  subOrderNo: z.string(),
  customerId: z.number(),
  type: z.enum(MP_AFTER_SALE_TYPES),
  status: z.enum(MP_AFTER_SALE_STATUSES),
  reason: z.string(),
  description: z.string(),
  images: z.array(z.string()),
  amount: z.number(),
  merchantRemark: z.string(),
  rejectReason: z.string(),
  platformNote: z.string(),
  returnExpress: z.string(),
  returnExpressNo: z.string(),
  refundId: z.number(),
  refundNo: z.string(),
  refundStatus: z.string(),
  auditedAt: z.string(),
  refundedAt: z.string(),
  createdAt: z.string(),
  items: z.array(mpAfterSaleItemSchema),
});
export type MpAfterSale = z.infer<typeof mpAfterSaleSchema>;

export const mpAfterSaleApplyItemSchema = z.object({
  orderItemId: z.number().int().positive(),
  quantity: z.number().int().positive().max(999),
});
export type MpAfterSaleApplyItem = z.infer<typeof mpAfterSaleApplyItemSchema>;

export const mpAfterSaleCreateBodySchema = z.object({
  shopOrderId: z.number().int().positive(),
  type: z.enum(MP_AFTER_SALE_TYPES).default("REFUND_ONLY"),
  reason: z.string().trim().min(1, "请选择售后原因").max(100),
  description: z.string().trim().max(500).default(""),
  images: z.array(z.string().trim().max(500)).max(6).default([]),
  items: z.array(mpAfterSaleApplyItemSchema).min(1).max(50),
});
export type MpAfterSaleCreateBody = z.infer<typeof mpAfterSaleCreateBodySchema>;

export const mpAfterSaleListQuerySchema = pageQuerySchema.extend({
  status: z.string().trim().max(20).default(""),
});

export const mpAfterSaleManageListQuerySchema =
  mpAfterSaleListQuerySchema.extend({
    keyword: z.string().trim().max(60).default(""),
  });

export const mpAfterSaleIdQuerySchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const mpAfterSaleIdBodySchema = z.object({
  id: z.number().int().positive(),
});

export const mpAfterSaleAuditBodySchema = z.object({
  id: z.number().int().positive(),
  action: z.enum(MP_AFTER_SALE_AUDIT_ACTIONS),
  merchantRemark: z.string().trim().max(200).default(""),
  rejectReason: z.string().trim().max(200).default(""),
});
export type MpAfterSaleAuditBody = z.infer<typeof mpAfterSaleAuditBodySchema>;

export const mpAfterSaleReturnBodySchema = z.object({
  id: z.number().int().positive(),
  returnExpress: z.string().trim().min(1, "请填写快递公司").max(60),
  returnExpressNo: z.string().trim().min(1, "请填写快递单号").max(60),
});
export type MpAfterSaleReturnBody = z.infer<typeof mpAfterSaleReturnBodySchema>;

export const mpAfterSaleReceiveBodySchema = z.object({
  id: z.number().int().positive(),
  merchantRemark: z.string().trim().max(200).default(""),
});

export const mpAfterSaleArbitrateBodySchema = z.object({
  id: z.number().int().positive(),
  action: z.enum(MP_AFTER_SALE_ARBITRATE_ACTIONS),
  platformNote: z.string().trim().min(1, "请填写仲裁说明").max(200),
});
export type MpAfterSaleArbitrateBody = z.infer<
  typeof mpAfterSaleArbitrateBodySchema
>;

// ---------------------------------------------------------------- B2 退款与支付流水

export const MP_REFUND_CHANNELS = ["WECHAT", "OFFLINE"] as const;
export type MpRefundChannel = (typeof MP_REFUND_CHANNELS)[number];
export const MP_REFUND_CHANNEL_LABELS: Record<string, string> = {
  WECHAT: "原路退回",
  OFFLINE: "线下退款",
};

export const MP_REFUND_STATUSES = ["PENDING", "SUCCESS", "FAILED"] as const;
export type MpRefundStatus = (typeof MP_REFUND_STATUSES)[number];
export const MP_REFUND_STATUS_LABELS: Record<string, string> = {
  PENDING: "退款中",
  SUCCESS: "已退款",
  FAILED: "退款失败",
};

export const MP_REFUND_EFFECTS = [
  "RESTORE_STOCK",
  "REVOKE_COMMISSION",
] as const;
export type MpRefundEffect = (typeof MP_REFUND_EFFECTS)[number];
export const MP_REFUND_EFFECT_LABELS: Record<string, string> = {
  RESTORE_STOCK: "回补库存",
  REVOKE_COMMISSION: "佣金冲销",
};

export const MP_REFUND_EFFECT_STATUSES = ["PENDING", "DONE", "FAILED"] as const;
export type MpRefundEffectStatus = (typeof MP_REFUND_EFFECT_STATUSES)[number];

export const mpRefundSchema = z.object({
  id: z.number(),
  refundNo: z.string(),
  marketId: z.number(),
  merchantId: z.number(),
  shopId: z.number(),
  shopName: z.string(),
  afterSaleId: z.number(),
  orderId: z.number(),
  shopOrderId: z.number(),
  subOrderNo: z.string(),
  channel: z.enum(MP_REFUND_CHANNELS),
  amount: z.number(),
  status: z.enum(MP_REFUND_STATUSES),
  reason: z.string(),
  transactionId: z.string(),
  error: z.string(),
  operatorType: z.string(),
  refundedAt: z.string(),
  createdAt: z.string(),
});
export type MpRefund = z.infer<typeof mpRefundSchema>;

export const mpRefundEffectSchema = z.object({
  id: z.number(),
  refundId: z.number(),
  effect: z.enum(MP_REFUND_EFFECTS),
  status: z.enum(MP_REFUND_EFFECT_STATUSES),
  detail: z.record(z.string(), z.unknown()),
  error: z.string(),
  finishedAt: z.string(),
});
export type MpRefundEffectView = z.infer<typeof mpRefundEffectSchema>;

export const mpRefundDetailSchema = z.object({
  refund: mpRefundSchema,
  effects: z.array(mpRefundEffectSchema),
});
export type MpRefundDetail = z.infer<typeof mpRefundDetailSchema>;

export const mpRefundListQuerySchema = pageQuerySchema.extend({
  status: z.string().trim().max(16).default(""),
  keyword: z.string().trim().max(60).default(""),
});

export const mpRefundIdBodySchema = z.object({
  id: z.number().int().positive(),
});

export const MP_PAY_TYPES = ["WECHAT", "OFFLINE"] as const;
export type MpPayType = (typeof MP_PAY_TYPES)[number];

export const MP_PAY_RECORD_STATUSES = ["PAID", "REFUNDED"] as const;
export type MpPayRecordStatus = (typeof MP_PAY_RECORD_STATUSES)[number];

export const mpPayRecordSchema = z.object({
  id: z.number(),
  marketId: z.number(),
  orderId: z.number(),
  shopOrderId: z.number(),
  orderNo: z.string(),
  subOrderNo: z.string(),
  transactionId: z.string(),
  payType: z.enum(MP_PAY_TYPES),
  amount: z.number(),
  commissionAmount: z.number(),
  status: z.enum(MP_PAY_RECORD_STATUSES),
  paidAt: z.string(),
  createdAt: z.string(),
});
export type MpPayRecord = z.infer<typeof mpPayRecordSchema>;

export const mpPayRecordListQuerySchema = pageQuerySchema.extend({
  merchantId: z.coerce.number().int().min(0).default(0),
  shopId: z.coerce.number().int().min(0).default(0),
  status: z.string().trim().max(16).default(""),
  keyword: z.string().trim().max(60).default(""),
});

// ---------------------------------------------------------------- B2 抽佣 / 结算 / 提现

export const MP_COMMISSION_SCOPE_TYPES = [
  "PLATFORM",
  "CATEGORY",
  "MERCHANT",
] as const;
export type MpCommissionScopeType = (typeof MP_COMMISSION_SCOPE_TYPES)[number];
export const MP_COMMISSION_SCOPE_LABELS: Record<string, string> = {
  PLATFORM: "平台默认",
  CATEGORY: "类目",
  MERCHANT: "商户专属",
};

export const MP_COMMISSION_RULE_STATUSES = ["ACTIVE", "DISABLED"] as const;
export type MpCommissionRuleStatus =
  (typeof MP_COMMISSION_RULE_STATUSES)[number];

export const mpCommissionRuleSchema = z.object({
  id: z.number(),
  marketId: z.number(),
  scopeType: z.enum(MP_COMMISSION_SCOPE_TYPES),
  scopeId: z.number(),
  /** 类目名 / 商户名；平台默认为空 */
  scopeName: z.string(),
  rate: z.number(),
  remark: z.string(),
  status: z.enum(MP_COMMISSION_RULE_STATUSES),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MpCommissionRule = z.infer<typeof mpCommissionRuleSchema>;

export const mpCommissionRuleSaveBodySchema = z.object({
  /** 0 = 新建 */
  id: z.number().int().min(0).default(0),
  scopeType: z.enum(MP_COMMISSION_SCOPE_TYPES),
  /** PLATFORM 固定 0，其余为类目 id / 商户 id */
  scopeId: z.number().int().min(0).default(0),
  /** 百分比，如 5 表示 5% */
  rate: z.number().min(0).max(100),
  remark: z.string().trim().max(200).default(""),
});
export type MpCommissionRuleSaveBody = z.infer<
  typeof mpCommissionRuleSaveBodySchema
>;

export const mpCommissionRuleStatusBodySchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(MP_COMMISSION_RULE_STATUSES),
});

/** 商户实际生效费率：商户专属 > 类目 > 平台默认。 */
export const mpMerchantCommissionSchema = z.object({
  rate: z.number(),
  scopeType: z.enum(MP_COMMISSION_SCOPE_TYPES),
  scopeName: z.string(),
});
export type MpMerchantCommission = z.infer<typeof mpMerchantCommissionSchema>;

export const MP_SETTLEMENT_STATUSES = ["PENDING", "CONFIRMED", "PAID"] as const;
export type MpSettlementStatus = (typeof MP_SETTLEMENT_STATUSES)[number];
export const MP_SETTLEMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "待确认",
  CONFIRMED: "待打款",
  PAID: "已打款",
};

export const mpSettlementItemSchema = z.object({
  id: z.number(),
  settlementId: z.number(),
  shopOrderId: z.number(),
  subOrderNo: z.string(),
  completedAt: z.string(),
  payAmount: z.number(),
  refundAmount: z.number(),
  commissionAmount: z.number(),
  netAmount: z.number(),
});
export type MpSettlementItem = z.infer<typeof mpSettlementItemSchema>;

export const mpSettlementSchema = z.object({
  id: z.number(),
  settleNo: z.string(),
  marketId: z.number(),
  merchantId: z.number(),
  shopId: z.number(),
  shopName: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  orderCount: z.number(),
  grossAmount: z.number(),
  refundAmount: z.number(),
  commissionAmount: z.number(),
  netAmount: z.number(),
  status: z.enum(MP_SETTLEMENT_STATUSES),
  remark: z.string(),
  voucher: z.string(),
  confirmedAt: z.string(),
  paidAt: z.string(),
  createdAt: z.string(),
});
export type MpSettlement = z.infer<typeof mpSettlementSchema>;

export const mpSettlementDetailSchema = mpSettlementSchema.extend({
  items: z.array(mpSettlementItemSchema),
});
export type MpSettlementDetail = z.infer<typeof mpSettlementDetailSchema>;

export const mpSettlementListQuerySchema = pageQuerySchema.extend({
  merchantId: z.coerce.number().int().min(0).default(0),
  shopId: z.coerce.number().int().min(0).default(0),
  status: z.string().trim().max(16).default(""),
  keyword: z.string().trim().max(60).default(""),
});

export const mpSettlementIdQuerySchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const mpSettlementIdBodySchema = z.object({
  id: z.number().int().positive(),
});

/** 平台按周期归集已完成子单；同一子单只会进一次结算（唯一键兜底）。 */
export const mpSettlementGenerateBodySchema = z.object({
  merchantId: z.number().int().positive(),
  /** 0 = 该商户全部店铺 */
  shopId: z.number().int().min(0).default(0),
  periodStart: z.string().trim().min(10).max(30),
  periodEnd: z.string().trim().min(10).max(30),
});
export type MpSettlementGenerateBody = z.infer<
  typeof mpSettlementGenerateBodySchema
>;

export const mpSettlementConfirmBodySchema = z.object({
  id: z.number().int().positive(),
  remark: z.string().trim().max(200).default(""),
});

export const mpSettlementPaidBodySchema = z.object({
  id: z.number().int().positive(),
  voucher: z.string().trim().min(1, "请上传打款凭证").max(500),
});

/** 商户资金口径：可提现 = 已确认结算净额 - 已申请/已打款提现。 */
export const mpFinanceSummarySchema = z.object({
  pendingAmount: z.number(),
  settledAmount: z.number(),
  withdrawalAmount: z.number(),
  frozenAmount: z.number(),
  availableAmount: z.number(),
});
export type MpFinanceSummary = z.infer<typeof mpFinanceSummarySchema>;

export const MP_WITHDRAWAL_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "PAID",
] as const;
export type MpWithdrawalStatus = (typeof MP_WITHDRAWAL_STATUSES)[number];
export const MP_WITHDRAWAL_STATUS_LABELS: Record<string, string> = {
  PENDING: "待审核",
  APPROVED: "待打款",
  REJECTED: "已驳回",
  PAID: "已打款",
};

export const mpWithdrawalSchema = z.object({
  id: z.number(),
  withdrawNo: z.string(),
  marketId: z.number(),
  merchantId: z.number(),
  merchantName: z.string(),
  shopId: z.number(),
  shopName: z.string(),
  applyAmount: z.number(),
  fee: z.number(),
  actualAmount: z.number(),
  bankName: z.string(),
  bankAccount: z.string(),
  accountName: z.string(),
  status: z.enum(MP_WITHDRAWAL_STATUSES),
  auditNote: z.string(),
  voucher: z.string(),
  auditedAt: z.string(),
  auditedBy: z.string(),
  paidAt: z.string(),
  createdAt: z.string(),
});
export type MpWithdrawal = z.infer<typeof mpWithdrawalSchema>;

export const mpWithdrawalApplyBodySchema = z.object({
  applyAmount: z.number().positive().max(9_999_999_999),
  bankName: z.string().trim().min(1, "请填写开户行").max(60),
  bankAccount: z.string().trim().min(4, "请填写收款账号").max(64),
  accountName: z.string().trim().min(1, "请填写户名").max(60),
});
export type MpWithdrawalApplyBody = z.infer<typeof mpWithdrawalApplyBodySchema>;

export const mpWithdrawalListQuerySchema = pageQuerySchema.extend({
  status: z.string().trim().max(16).default(""),
  merchantId: z.coerce.number().int().min(0).default(0),
  keyword: z.string().trim().max(60).default(""),
});

export const mpWithdrawalIdBodySchema = z.object({
  id: z.number().int().positive(),
});

export const MP_WITHDRAWAL_AUDIT_ACTIONS = ["APPROVE", "REJECT"] as const;
export type MpWithdrawalAuditAction =
  (typeof MP_WITHDRAWAL_AUDIT_ACTIONS)[number];

export const mpWithdrawalAuditBodySchema = z.object({
  id: z.number().int().positive(),
  action: z.enum(MP_WITHDRAWAL_AUDIT_ACTIONS),
  auditNote: z.string().trim().max(200).default(""),
  /** 审核通过时由平台核定手续费，实际打款 = 申请金额 - 手续费 */
  fee: z.number().min(0).max(9_999_999_999).default(0),
});
export type MpWithdrawalAuditBody = z.infer<typeof mpWithdrawalAuditBodySchema>;

export const mpWithdrawalPaidBodySchema = z.object({
  id: z.number().int().positive(),
  voucher: z.string().trim().min(1, "请上传打款凭证").max(500),
});

// ---------------------------------------------------------------- B3 装修 / 优惠券 / 关注
//
// 装修：市场级（shopId=0）与店铺级（shopId>0）共用一套页面模型与组件白名单；
// 券：平台券（issuerType=PLATFORM，shopId=0）与商户券（绑店铺），跨商户父单券按子单商品额分摊；
// 关注：顾客对店铺的私域复访入口，只存关系不复制店铺资料。

export const MP_DIY_WIDGETS = [
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
  "shopList",
  "richText",
  "spacer",
  "assist",
] as const;
export type MpDiyWidget = (typeof MP_DIY_WIDGETS)[number];

export const MP_DIY_LINK_TYPES = [
  "NONE",
  "PAGE",
  "PRODUCT",
  "CATEGORY",
  "SHOP",
  "COUPON",
  "WEBVIEW",
] as const;
export type MpDiyLinkType = (typeof MP_DIY_LINK_TYPES)[number];

export const MP_DIY_PAGE_TYPES = [
  "HOME",
  "CATEGORY",
  "MINE",
  "ACTIVITY",
] as const;
export type MpDiyPageType = (typeof MP_DIY_PAGE_TYPES)[number];
export const MP_DIY_PAGE_TYPE_LABELS: Record<string, string> = {
  HOME: "首页",
  CATEGORY: "分类页",
  MINE: "个人中心",
  ACTIVITY: "活动页",
};

export const MP_DIY_STATUSES = ["DRAFT", "PUBLISHED"] as const;
export type MpDiyStatus = (typeof MP_DIY_STATUSES)[number];
export const MP_DIY_STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  PUBLISHED: "已发布",
};

export const mpDiyWidgetMetaSchema = z.object({
  type: z.enum(MP_DIY_WIDGETS),
  name: z.string(),
  icon: z.string(),
  group: z.enum(["base", "goods", "marketing", "shop", "assist"]),
  groupLabel: z.string(),
  defaultProps: z.record(z.string(), z.unknown()),
});
export type MpDiyWidgetMeta = z.infer<typeof mpDiyWidgetMetaSchema>;

export const mpDiyPageRowSchema = z.object({
  id: z.number(),
  marketId: z.number(),
  shopId: z.number(),
  name: z.string(),
  type: z.enum(MP_DIY_PAGE_TYPES),
  status: z.enum(MP_DIY_STATUSES),
  isDefault: z.boolean(),
  coverImage: z.string(),
  sortOrder: z.number(),
  componentCount: z.number(),
  publishedAt: z.string(),
  updatedAt: z.string(),
});
export type MpDiyPageRow = z.infer<typeof mpDiyPageRowSchema>;

export const mpDiyPageSchema = z.object({
  id: z.number(),
  marketId: z.number(),
  shopId: z.number(),
  name: z.string(),
  type: z.enum(MP_DIY_PAGE_TYPES),
  components: z.array(mpDiyNodeSchema),
  styles: z.record(z.string(), z.unknown()),
  coverImage: z.string(),
  isDefault: z.boolean(),
  status: z.enum(MP_DIY_STATUSES),
  sortOrder: z.number(),
  publishedAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MpDiyPage = z.infer<typeof mpDiyPageSchema>;

export const mpDiyPageSaveBodySchema = z.object({
  /** 0 = 新建 */
  id: z.number().int().min(0).default(0),
  /** 0 = 市场级；商户侧固定为本人店铺 */
  shopId: z.number().int().min(0).default(0),
  name: z.string().trim().min(1, "请填写页面名称").max(40),
  type: z.enum(MP_DIY_PAGE_TYPES).default("ACTIVITY"),
  components: z.array(z.unknown()).max(200).default([]),
  styles: z.record(z.string(), z.unknown()).default({}),
  coverImage: z.string().trim().max(500).default(""),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});
export type MpDiyPageSaveBody = z.infer<typeof mpDiyPageSaveBodySchema>;

export const mpDiyPageIdBodySchema = z.object({
  id: z.number().int().positive(),
});

export const mpDiyPageIdQuerySchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const mpDiyListQuerySchema = z.object({
  /** 0 = 市场级；商户侧忽略该值，强制为本人店铺 */
  shopId: z.coerce.number().int().min(0).default(0),
  /** '' = 全部 */
  type: z.string().trim().max(16).default(""),
});

/** C 端拉取店铺首页装修：未发布过返回 null，前端回落到默认店铺页。 */
export const mpPublicShopDiyQuerySchema = z.object({
  marketCode: z.string().trim().min(4).max(16),
  shopId: z.coerce.number().int().positive(),
});

export const MP_COUPON_ISSUER_TYPES = ["PLATFORM", "MERCHANT"] as const;
export type MpCouponIssuerType = (typeof MP_COUPON_ISSUER_TYPES)[number];
export const MP_COUPON_ISSUER_LABELS: Record<string, string> = {
  PLATFORM: "平台券",
  MERCHANT: "商户券",
};

export const MP_COUPON_TYPES = ["FULL_REDUCE", "DISCOUNT"] as const;
export type MpCouponType = (typeof MP_COUPON_TYPES)[number];
export const MP_COUPON_TYPE_LABELS: Record<string, string> = {
  FULL_REDUCE: "满减",
  DISCOUNT: "折扣",
};

export const MP_COUPON_VALID_TYPES = ["FIXED", "DAYS"] as const;
export type MpCouponValidType = (typeof MP_COUPON_VALID_TYPES)[number];

export const MP_COUPON_SCOPES = ["ALL", "SHOP", "CATEGORY", "PRODUCT"] as const;
export type MpCouponScope = (typeof MP_COUPON_SCOPES)[number];
export const MP_COUPON_SCOPE_LABELS: Record<string, string> = {
  ALL: "全场通用",
  SHOP: "指定店铺",
  CATEGORY: "指定类目",
  PRODUCT: "指定商品",
};

export const MP_COUPON_STATUSES = ["ONLINE", "OFFLINE", "ENDED"] as const;
export type MpCouponStatus = (typeof MP_COUPON_STATUSES)[number];
export const MP_COUPON_STATUS_LABELS: Record<string, string> = {
  ONLINE: "发放中",
  OFFLINE: "已停发",
  ENDED: "已结束",
};

export const mpCouponSchema = z.object({
  id: z.number(),
  marketId: z.number(),
  shopId: z.number(),
  merchantId: z.number(),
  issuerType: z.enum(MP_COUPON_ISSUER_TYPES),
  shopName: z.string().default(""),
  name: z.string(),
  type: z.enum(MP_COUPON_TYPES),
  value: z.number(),
  threshold: z.number(),
  totalCount: z.number(),
  receivedCount: z.number(),
  usedCount: z.number(),
  perLimit: z.number(),
  validType: z.enum(MP_COUPON_VALID_TYPES),
  startAt: z.string(),
  endAt: z.string(),
  validDays: z.number(),
  scope: z.enum(MP_COUPON_SCOPES),
  scopeIds: z.array(z.number()),
  status: z.enum(MP_COUPON_STATUSES),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MpCoupon = z.infer<typeof mpCouponSchema>;

export const mpCouponSaveBodySchema = z.object({
  /** 0 = 新建 */
  id: z.number().int().min(0).default(0),
  name: z.string().trim().min(1, "请填写券名称").max(40),
  type: z.enum(MP_COUPON_TYPES).default("FULL_REDUCE"),
  /** 满减金额（元）或折扣（如 8.5 表示 8.5 折） */
  value: z.number().positive().max(9_999_999),
  threshold: z.number().min(0).max(9_999_999).default(0),
  totalCount: z.number().int().min(0).max(1_000_000).default(0),
  perLimit: z.number().int().min(1).max(100).default(1),
  validType: z.enum(MP_COUPON_VALID_TYPES).default("FIXED"),
  startAt: z.string().trim().max(30).default(""),
  endAt: z.string().trim().max(30).default(""),
  validDays: z.number().int().min(1).max(365).default(7),
  scope: z.enum(MP_COUPON_SCOPES).default("ALL"),
  scopeIds: z.array(z.number().int().positive()).max(200).default([]),
});
export type MpCouponSaveBody = z.infer<typeof mpCouponSaveBodySchema>;

export const mpCouponStatusBodySchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(["ONLINE", "OFFLINE"]),
});

export const mpCouponListQuerySchema = pageQuerySchema.extend({
  status: z.string().trim().max(16).default(""),
  keyword: z.string().trim().max(60).default(""),
});

export const mpCouponIdBodySchema = z.object({
  id: z.number().int().positive(),
});

/** C 端可领券视图：只暴露领用需要的信息，不回领取人台账。 */
export const mpPublicCouponSchema = z.object({
  id: z.number(),
  name: z.string(),
  issuerType: z.enum(MP_COUPON_ISSUER_TYPES),
  shopId: z.number(),
  shopName: z.string(),
  type: z.enum(MP_COUPON_TYPES),
  value: z.number(),
  threshold: z.number(),
  /** 剩余可领数量；-1 = 不限量（totalCount=0），0 = 已领完 */
  remaining: z.number(),
  perLimit: z.number(),
  scope: z.enum(MP_COUPON_SCOPES),
  expireAt: z.string(),
  claimed: z.number().default(0),
  /** 是否还能再领（余量 + 每人限领都满足） */
  claimable: z.boolean().default(true),
});
export type MpPublicCoupon = z.infer<typeof mpPublicCouponSchema>;

export const mpPublicCouponListQuerySchema = z.object({
  marketCode: z.string().trim().min(4).max(16),
  shopId: z.coerce.number().int().min(0).default(0),
});

export const mpCouponClaimBodySchema = z.object({
  couponId: z.number().int().positive(),
});

export const mpCouponTicketSchema = z.object({
  ticketId: z.number(),
  couponId: z.number(),
  name: z.string(),
  issuerType: z.enum(MP_COUPON_ISSUER_TYPES),
  shopId: z.number(),
  shopName: z.string(),
  type: z.enum(MP_COUPON_TYPES),
  value: z.number(),
  threshold: z.number(),
  scope: z.enum(MP_COUPON_SCOPES),
  status: z.enum(["UNUSED", "USED", "EXPIRED"]),
  orderId: z.number(),
  receivedAt: z.string(),
  usedAt: z.string(),
  expireAt: z.string(),
});
export type MpCouponTicket = z.infer<typeof mpCouponTicketSchema>;

export const mpCouponTicketListQuerySchema = z.object({
  /** '' = 全部；UNUSED / USED / EXPIRED */
  status: z.string().trim().max(16).default(""),
});

export const mpFollowBodySchema = z.object({
  shopId: z.number().int().positive(),
});

export const mpFollowStateSchema = z.object({
  followed: z.boolean(),
  followerCount: z.number().default(0),
});
export type MpFollowState = z.infer<typeof mpFollowStateSchema>;

export const mpFollowShopSchema = z.object({
  shopId: z.number(),
  name: z.string(),
  logo: z.string(),
  shopCode: z.string(),
  followedAt: z.string(),
});
export type MpFollowShop = z.infer<typeof mpFollowShopSchema>;

// ---------------------------------------------------------------- 企业微信 SCRM（B4）

/** 桥状态：reason 沿用 commerce-core/scrm-port 的四种可用性，hint 给页面渲染下一步入口。 */
export const mpScrmBridgeSchema = z.object({
  ok: z.boolean(),
  reason: z.string(),
  hint: z.string(),
});

export const mpScrmOutboxCountsSchema = z.object({
  PENDING: z.number(),
  SENT: z.number(),
  SKIPPED: z.number(),
  DEAD: z.number(),
});

export const mpScrmBindingCountsSchema = z.object({
  auto: z.number(),
  manual: z.number(),
  ignored: z.number(),
  miss: z.number(),
});

/** 市场运营方视图：市场级开关 + 全市场外发箱与匹配三档。 */
export const mpScrmStateSchema = z.object({
  enabled: z.boolean(),
  marketName: z.string(),
  bridge: mpScrmBridgeSchema,
  outbox: mpScrmOutboxCountsSchema,
  bindings: mpScrmBindingCountsSchema,
  lastSentAt: z.string(),
});
export type MpScrmState = z.infer<typeof mpScrmStateSchema>;

/** 商户只读视图：开关归市场，商户只能看到自己名下的事件与外发健康度。 */
export const mpScrmMerchantStateSchema = mpScrmStateSchema.extend({
  merchantName: z.string(),
});
export type MpScrmMerchantState = z.infer<typeof mpScrmMerchantStateSchema>;

export const mpScrmToggleBodySchema = z.object({
  enabled: z.boolean(),
});

export const mpScrmReplayBodySchema = z.object({
  /** 留空 = 全市场 SKIPPED；带了就只重投这些行。 */
  ids: z.array(z.number().int().positive()).max(500).optional(),
});

export const mpScrmRetryResultSchema = okResult.extend({
  sent: z.number(),
  skipped: z.number(),
  failed: z.number(),
  deferred: z.number(),
});
export type MpScrmRetryResult = z.infer<typeof mpScrmRetryResultSchema>;

export const mpScrmReplayResultSchema = okResult.extend({
  count: z.number(),
});
export type MpScrmReplayResult = z.infer<typeof mpScrmReplayResultSchema>;

// ---------------------------------------------------------------- 端点辅助

/**
 * 契约端点一律用 query 传 id：Hono 按注册顺序匹配，静态段会被先注册的 :param 兄弟路径吃掉。
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

/**
 * 多店铺商城小程序发布：与卡密 / 快递同一套建站底座（scene=MARKET），
 * 主体凭据与出包台账按市场（ownerUserId）定位，市场自身即租户根。
 */
export const mpAppTestResultSchema = miniAppTestResultSchema.extend({
  nextAction: z.string().default(""),
  serverIp: z.string().default(""),
});
export type MpAppTestResult = z.infer<typeof mpAppTestResultSchema>;

/**
 * 市场运营方与平台管理员端点（站内会话）。
 * `Market_*` 前缀对应 `MarketplaceController`，`MpAdmin_*` 对应 `MarketplaceAdminController`。
 */
export const marketplaceEndpoints = {
  // ---------- 市场 ----------
  Market_overview: get(
    "/enterprise/marketplace/overview",
    emptyQuery,
    mpOverviewSchema,
  ),
  Market_detail: get(
    "/enterprise/marketplace/detail",
    emptyQuery,
    mpMarketSchema.nullable(),
  ),
  Market_create: post(
    "/enterprise/marketplace/create",
    mpMarketCreateBodySchema,
    mpMarketSchema,
  ),
  Market_save: post(
    "/enterprise/marketplace/save",
    mpMarketSaveBodySchema,
    mpMarketSchema,
  ),
  Market_status: post(
    "/enterprise/marketplace/status",
    mpMarketStatusBodySchema,
    mpMarketSchema,
  ),

  // ---------- 小程序主体凭据（底座 miniprogram_apps，scene=MARKET）----------
  /** 一个市场一部独立小程序：AppID、上传密钥、商户号都属运营方自己。 */
  Market_appDetail: get(
    "/enterprise/marketplace/app/detail",
    emptyQuery,
    miniAppViewSchema,
  ),
  Market_appSave: post(
    "/enterprise/marketplace/app/save",
    miniAppInputSchema,
    miniAppViewSchema,
  ),
  Market_appTest: post(
    "/enterprise/marketplace/app/test",
    z.object({}),
    mpAppTestResultSchema,
  ),
  Market_payTest: post(
    "/enterprise/marketplace/app/pay-test",
    z.object({}),
    z.object({ ok: z.boolean(), message: z.string() }),
  ),
  Market_qrcodeGenerate: post(
    "/enterprise/marketplace/app/qrcode",
    z.object({ path: z.string().max(120).default("") }),
    miniAppViewSchema,
  ),

  // ---------- 平台类目（商户只能选不能造） ----------
  Market_categories: get(
    "/enterprise/marketplace/category/list",
    emptyQuery,
    z.array(mpCategorySchema),
  ),
  Market_categorySave: post(
    "/enterprise/marketplace/category/save",
    mpCategorySaveBodySchema,
    mpCategorySchema,
  ),
  Market_categoryRemove: post(
    "/enterprise/marketplace/category/remove",
    mpCategoryRemoveBodySchema,
    okResult,
  ),

  // ---------- 商户入驻审核 ----------
  Market_merchants: get(
    "/enterprise/marketplace/merchant/list",
    mpMerchantListQuerySchema,
    pageSchema(mpMerchantSchema),
  ),
  Market_merchantDetail: get(
    "/enterprise/marketplace/merchant/detail",
    z.object({ id: z.coerce.number().int().positive() }),
    mpMerchantDetailSchema,
  ),
  Market_merchantAudit: post(
    "/enterprise/marketplace/merchant/audit",
    mpMerchantAuditBodySchema,
    mpMerchantSchema,
  ),
  Market_merchantStatus: post(
    "/enterprise/marketplace/merchant/status",
    mpMerchantStatusBodySchema,
    mpMerchantSchema,
  ),

  // ---------- 店铺 ----------
  Market_shops: get(
    "/enterprise/marketplace/shop/list",
    mpShopListQuerySchema,
    pageSchema(mpShopSchema),
  ),
  Market_shopStatus: post(
    "/enterprise/marketplace/shop/status",
    mpShopStatusBodySchema,
    mpShopSchema,
  ),

  // ---------- 商品审核（B1） ----------
  Market_products: get(
    "/enterprise/marketplace/product/list",
    mpProductListQuerySchema.extend({
      shopId: z.coerce.number().int().min(0).default(0),
    }),
    pageSchema(mpProductSchema),
  ),
  Market_productAudits: get(
    "/enterprise/marketplace/product/audit/list",
    mpProductAuditListQuerySchema,
    pageSchema(mpProductAuditSchema),
  ),
  Market_productAudit: post(
    "/enterprise/marketplace/product/audit",
    mpProductAuditBodySchema,
    mpProductAuditSchema,
  ),

  // ---------- 售后仲裁与退款台账（B2） ----------
  Market_afterSales: get(
    "/enterprise/marketplace/aftersale/list",
    mpAfterSaleManageListQuerySchema,
    pageSchema(mpAfterSaleSchema),
  ),
  Market_afterSaleDetail: get(
    "/enterprise/marketplace/aftersale/detail",
    mpAfterSaleIdQuerySchema,
    mpAfterSaleSchema,
  ),
  Market_afterSaleArbitrate: post(
    "/enterprise/marketplace/aftersale/arbitrate",
    mpAfterSaleArbitrateBodySchema,
    mpAfterSaleSchema,
  ),
  Market_refunds: get(
    "/enterprise/marketplace/refund/list",
    mpRefundListQuerySchema,
    pageSchema(mpRefundSchema),
  ),
  Market_refundDetail: get(
    "/enterprise/marketplace/refund/detail",
    z.object({ id: z.coerce.number().int().positive() }),
    mpRefundDetailSchema,
  ),
  Market_payRecords: get(
    "/enterprise/marketplace/pay/list",
    mpPayRecordListQuerySchema,
    pageSchema(mpPayRecordSchema),
  ),

  // ---------- 抽佣规则（B2） ----------
  Market_commissionRules: get(
    "/enterprise/marketplace/commission/list",
    emptyQuery,
    z.array(mpCommissionRuleSchema),
  ),
  Market_commissionRuleSave: post(
    "/enterprise/marketplace/commission/save",
    mpCommissionRuleSaveBodySchema,
    mpCommissionRuleSchema,
  ),
  Market_commissionRuleStatus: post(
    "/enterprise/marketplace/commission/status",
    mpCommissionRuleStatusBodySchema,
    mpCommissionRuleSchema,
  ),

  // ---------- 结算与提现（B2） ----------
  Market_settlements: get(
    "/enterprise/marketplace/settlement/list",
    mpSettlementListQuerySchema,
    pageSchema(mpSettlementSchema),
  ),
  Market_settlementDetail: get(
    "/enterprise/marketplace/settlement/detail",
    mpSettlementIdQuerySchema,
    mpSettlementDetailSchema,
  ),
  Market_settlementGenerate: post(
    "/enterprise/marketplace/settlement/generate",
    mpSettlementGenerateBodySchema,
    mpSettlementDetailSchema,
  ),
  Market_settlementPaid: post(
    "/enterprise/marketplace/settlement/paid",
    mpSettlementPaidBodySchema,
    mpSettlementSchema,
  ),
  Market_withdrawals: get(
    "/enterprise/marketplace/withdrawal/list",
    mpWithdrawalListQuerySchema,
    pageSchema(mpWithdrawalSchema),
  ),
  Market_withdrawalAudit: post(
    "/enterprise/marketplace/withdrawal/audit",
    mpWithdrawalAuditBodySchema,
    mpWithdrawalSchema,
  ),
  Market_withdrawalPaid: post(
    "/enterprise/marketplace/withdrawal/paid",
    mpWithdrawalPaidBodySchema,
    mpWithdrawalSchema,
  ),
  Market_merchantFinance: get(
    "/enterprise/marketplace/merchant/finance",
    z.object({ merchantId: z.coerce.number().int().positive() }),
    mpFinanceSummarySchema,
  ),

  // ---------- 装修与券（B3） ----------
  Market_diyWidgets: get(
    "/enterprise/marketplace/diy/widgets",
    emptyQuery,
    z.array(mpDiyWidgetMetaSchema),
  ),
  Market_diyList: get(
    "/enterprise/marketplace/diy/list",
    mpDiyListQuerySchema,
    z.array(mpDiyPageRowSchema),
  ),
  Market_diyDetail: get(
    "/enterprise/marketplace/diy/detail",
    mpDiyPageIdQuerySchema,
    mpDiyPageSchema,
  ),
  Market_diySave: post(
    "/enterprise/marketplace/diy/save",
    mpDiyPageSaveBodySchema,
    mpDiyPageSchema,
  ),
  Market_diyPublish: post(
    "/enterprise/marketplace/diy/publish",
    mpDiyPageIdBodySchema,
    mpDiyPageSchema,
  ),
  Market_diyRemove: post(
    "/enterprise/marketplace/diy/remove",
    mpDiyPageIdBodySchema,
    okResult,
  ),
  Market_coupons: get(
    "/enterprise/marketplace/coupon/list",
    mpCouponListQuerySchema,
    pageSchema(mpCouponSchema),
  ),
  Market_couponSave: post(
    "/enterprise/marketplace/coupon/save",
    mpCouponSaveBodySchema,
    mpCouponSchema,
  ),
  Market_couponStatus: post(
    "/enterprise/marketplace/coupon/status",
    mpCouponStatusBodySchema,
    mpCouponSchema,
  ),

  // ---------- 企业微信 SCRM（B4） ----------
  Market_scrm: get(
    "/enterprise/marketplace/scrm/state",
    emptyQuery,
    mpScrmStateSchema,
  ),
  Market_scrmToggle: post(
    "/enterprise/marketplace/scrm/toggle",
    mpScrmToggleBodySchema,
    okResult,
  ),
  /** 立即投递一次（市场运营方手动重试），失败不消耗业务事务。 */
  Market_scrmRetry: post(
    "/enterprise/marketplace/scrm/retry",
    emptyQuery,
    mpScrmRetryResultSchema,
  ),
  /** 一键重投 SKIPPED：SCRM 侧补完客户后补发漏掉的事件。 */
  Market_scrmReplay: post(
    "/enterprise/marketplace/scrm/replay",
    mpScrmReplayBodySchema,
    mpScrmReplayResultSchema,
  ),

  // ---------- 平台管理员：跨市场台账 ----------
  MpAdmin_overview: get(
    "/enterprise/admin/marketplace/overview",
    emptyQuery,
    z.object({
      marketTotal: z.number(),
      onlineMarketTotal: z.number(),
      merchantTotal: z.number(),
      pendingMerchantTotal: z.number(),
      shopTotal: z.number(),
    }),
  ),
  MpAdmin_markets: get(
    "/enterprise/admin/marketplace/market/list",
    mpAdminMarketListQuerySchema,
    pageSchema(mpAdminMarketRowSchema),
  ),
  MpAdmin_marketStatus: post(
    "/enterprise/admin/marketplace/market/status",
    mpAdminMarketStatusBodySchema,
    mpAdminMarketRowSchema,
  ),
};

/**
 * 商户后台端点：走商户令牌，路径前缀 `/api/merchant/mp/**`。
 *
 * **刻意不并入 `endpoints` 总表**：总表的处理器由站内会话鉴权，并会暴露给 MCP 以站内身份调用；
 * 商户端点由 `mp.merchant.routes.ts` 单独注册，前端经 `/api/backend/mp-merchant/**` 同源代理访问。
 * 这里只共享 DTO 与原样路径，供商户后台 API 客户端与后端路由复用。
 */
export const mpMerchantEndpoints = {
  MpMerchant_profile: get(
    "/api/merchant/mp/profile",
    emptyQuery,
    mpMerchantProfileSchema,
  ),
  MpMerchant_password: post(
    "/api/merchant/mp/password",
    mpMerchantPasswordBodySchema,
    okResult,
  ),
  MpMerchant_shopDetail: get(
    "/api/merchant/mp/shop/detail",
    emptyQuery,
    mpShopSchema,
  ),
  MpMerchant_shopSave: post(
    "/api/merchant/mp/shop/save",
    mpMerchantShopSaveBodySchema,
    mpShopSchema,
  ),
  MpMerchant_shopStatus: post(
    "/api/merchant/mp/shop/status",
    mpMerchantShopStatusBodySchema,
    mpShopSchema,
  ),
  MpMerchant_staffList: get(
    "/api/merchant/mp/staff/list",
    emptyQuery,
    z.array(mpMerchantUserSchema),
  ),
  MpMerchant_staffSave: post(
    "/api/merchant/mp/staff/save",
    mpMerchantStaffSaveBodySchema,
    mpMerchantUserSchema,
  ),
  MpMerchant_staffStatus: post(
    "/api/merchant/mp/staff/status",
    mpMerchantStaffStatusBodySchema,
    mpMerchantUserSchema,
  ),

  // ---------- 商品（B1） ----------
  MpMerchant_products: get(
    "/api/merchant/mp/product/list",
    mpProductListQuerySchema,
    pageSchema(mpProductSchema),
  ),
  MpMerchant_productDetail: get(
    "/api/merchant/mp/product/detail",
    z.object({ id: z.coerce.number().int().positive() }),
    mpProductDetailSchema,
  ),
  MpMerchant_productSave: post(
    "/api/merchant/mp/product/save",
    mpProductSaveBodySchema,
    mpProductDetailSchema,
  ),
  MpMerchant_productStatus: post(
    "/api/merchant/mp/product/status",
    mpProductStatusBodySchema,
    mpProductSchema,
  ),
  MpMerchant_productSubmit: post(
    "/api/merchant/mp/product/submit",
    mpProductIdBodySchema,
    mpProductSchema,
  ),
  MpMerchant_productRemove: post(
    "/api/merchant/mp/product/remove",
    mpProductIdBodySchema,
    okResult,
  ),

  // ---------- 订单（B1） ----------
  MpMerchant_orders: get(
    "/api/merchant/mp/order/list",
    mpOrderListQuerySchema,
    pageSchema(mpShopOrderSchema),
  ),
  MpMerchant_orderDetail: get(
    "/api/merchant/mp/order/detail",
    z.object({ id: z.coerce.number().int().positive() }),
    mpShopOrderSchema,
  ),
  MpMerchant_orderShip: post(
    "/api/merchant/mp/order/ship",
    mpShopOrderShipBodySchema,
    mpShopOrderSchema,
  ),
  MpMerchant_orderRemark: post(
    "/api/merchant/mp/order/remark",
    mpShopOrderRemarkBodySchema,
    mpShopOrderSchema,
  ),

  // ---------- 售后与退款（B2） ----------
  MpMerchant_afterSales: get(
    "/api/merchant/mp/aftersale/list",
    mpAfterSaleManageListQuerySchema,
    pageSchema(mpAfterSaleSchema),
  ),
  MpMerchant_afterSaleDetail: get(
    "/api/merchant/mp/aftersale/detail",
    mpAfterSaleIdQuerySchema,
    mpAfterSaleSchema,
  ),
  MpMerchant_afterSaleAudit: post(
    "/api/merchant/mp/aftersale/audit",
    mpAfterSaleAuditBodySchema,
    mpAfterSaleSchema,
  ),
  MpMerchant_afterSaleReceive: post(
    "/api/merchant/mp/aftersale/receive",
    mpAfterSaleReceiveBodySchema,
    mpAfterSaleSchema,
  ),
  MpMerchant_refunds: get(
    "/api/merchant/mp/refund/list",
    mpRefundListQuerySchema,
    pageSchema(mpRefundSchema),
  ),
  MpMerchant_refundDetail: get(
    "/api/merchant/mp/refund/detail",
    z.object({ id: z.coerce.number().int().positive() }),
    mpRefundDetailSchema,
  ),
  MpMerchant_refundRetry: post(
    "/api/merchant/mp/refund/retry",
    mpRefundIdBodySchema,
    mpRefundSchema,
  ),

  // ---------- 抽佣 / 结算 / 提现（B2） ----------
  MpMerchant_commission: get(
    "/api/merchant/mp/commission",
    emptyQuery,
    mpMerchantCommissionSchema,
  ),
  MpMerchant_finance: get(
    "/api/merchant/mp/finance",
    emptyQuery,
    mpFinanceSummarySchema,
  ),
  MpMerchant_settlements: get(
    "/api/merchant/mp/settlement/list",
    mpSettlementListQuerySchema,
    pageSchema(mpSettlementSchema),
  ),
  MpMerchant_settlementDetail: get(
    "/api/merchant/mp/settlement/detail",
    mpSettlementIdQuerySchema,
    mpSettlementDetailSchema,
  ),
  MpMerchant_settlementConfirm: post(
    "/api/merchant/mp/settlement/confirm",
    mpSettlementConfirmBodySchema,
    mpSettlementSchema,
  ),
  MpMerchant_withdrawals: get(
    "/api/merchant/mp/withdrawal/list",
    mpWithdrawalListQuerySchema,
    pageSchema(mpWithdrawalSchema),
  ),
  MpMerchant_withdrawalApply: post(
    "/api/merchant/mp/withdrawal/apply",
    mpWithdrawalApplyBodySchema,
    mpWithdrawalSchema,
  ),
  MpMerchant_withdrawalCancel: post(
    "/api/merchant/mp/withdrawal/cancel",
    mpWithdrawalIdBodySchema,
    mpWithdrawalSchema,
  ),

  // ---------- 装修与券（B3，店铺级） ----------
  MpMerchant_diyWidgets: get(
    "/api/merchant/mp/diy/widgets",
    emptyQuery,
    z.array(mpDiyWidgetMetaSchema),
  ),
  MpMerchant_diyList: get(
    "/api/merchant/mp/diy/list",
    mpDiyListQuerySchema,
    z.array(mpDiyPageRowSchema),
  ),
  MpMerchant_diyDetail: get(
    "/api/merchant/mp/diy/detail",
    mpDiyPageIdQuerySchema,
    mpDiyPageSchema,
  ),
  MpMerchant_diySave: post(
    "/api/merchant/mp/diy/save",
    mpDiyPageSaveBodySchema,
    mpDiyPageSchema,
  ),
  MpMerchant_diyPublish: post(
    "/api/merchant/mp/diy/publish",
    mpDiyPageIdBodySchema,
    mpDiyPageSchema,
  ),
  MpMerchant_diyRemove: post(
    "/api/merchant/mp/diy/remove",
    mpDiyPageIdBodySchema,
    okResult,
  ),
  MpMerchant_coupons: get(
    "/api/merchant/mp/coupon/list",
    mpCouponListQuerySchema,
    pageSchema(mpCouponSchema),
  ),
  MpMerchant_couponSave: post(
    "/api/merchant/mp/coupon/save",
    mpCouponSaveBodySchema,
    mpCouponSchema,
  ),
  MpMerchant_couponStatus: post(
    "/api/merchant/mp/coupon/status",
    mpCouponStatusBodySchema,
    mpCouponSchema,
  ),

  // ---------- 企业微信 SCRM（B4，只读） ----------
  MpMerchant_scrm: get(
    "/api/merchant/mp/scrm",
    emptyQuery,
    mpScrmMerchantStateSchema,
  ),
};

export type MpMerchantEndpointId = keyof typeof mpMerchantEndpoints;
