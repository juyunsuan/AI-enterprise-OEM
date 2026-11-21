import { z } from "zod";

/**
 * 建站管理底座（供上门服务 / 电商小程序等自营工具共用）：
 * 按租户归属的小程序主体凭据、租户出包台账与顾客令牌的公共契约。
 *
 * 与「用户版小程序」（`miniprogram.ts`）的分工：那是平台自营的移动办公壳，
 * 凭据与代码包全平台一份；这里是**用户自己的小程序主体**——AppID、上传密钥、
 * 微信商户号、合法域名、类目都由用户自己提供，资金直进用户账户，平台不经手。
 * 凭据只回 `xxxConfigured` 掩码状态，任何读接口不回明文。
 */

/** 自营小程序的业务场景：同一业务实例只允许一个场景主体。 */
export const PRIVATE_MINI_SCENES = [
  "ONSITE",
  "BRAND",
  "CARD_SHOP",
  "HEALTH",
  "DIGITAL_HUMAN",
  "EXPRESS",
  "ERRAND",
  "CIRCLE",
  "MARKET",
  "TAKEOUT",
  "RENTAL",
  "PARK",
] as const;
export type PrivateMiniScene = (typeof PRIVATE_MINI_SCENES)[number];
export const PRIVATE_MINI_SCENE_LABELS: Record<string, string> = {
  ONSITE: "上门服务",
  BRAND: "品牌商城",
  CARD_SHOP: "卡密商城",
  HEALTH: "健康管理",
  DIGITAL_HUMAN: "数字人分身",
  EXPRESS: "快递寄件",
  CIRCLE: "圈子社区",
  ERRAND: "跑腿",
  MARKET: "多店铺商城",
  TAKEOUT: "外卖点餐",
  RENTAL: "租赁管理",
  PARK: "园区管理",
};

/** 主体凭据自检状态。 */
export const MINI_APP_STATUSES = ["UNVERIFIED", "VERIFIED", "FAILED"] as const;
export type MiniAppStatus = (typeof MINI_APP_STATUSES)[number];
export const MINI_APP_STATUS_LABELS: Record<string, string> = {
  UNVERIFIED: "未自检",
  VERIFIED: "凭据可用",
  FAILED: "自检失败",
};

/** 用户在微信侧自助回填的审核态（本站不代提审，只做台账）。 */
export const MINI_REVIEW_STATUSES = ["", "SUBMITTED", "APPROVED", "REJECTED"] as const;
export const MINI_REVIEW_STATUS_LABELS: Record<string, string> = {
  "": "未提交",
  SUBMITTED: "审核中",
  APPROVED: "审核通过",
  REJECTED: "审核驳回",
};

/** 订阅消息模板位：下单/接单/取消/换技师/求救；键名即 templates JSON 的键。 */
export const MINI_TEMPLATE_KEYS = [
  "order",
  "accept",
  "cancel",
  "coachChange",
  "help",
  "circleComment",
  "circleLike",
  "circleAudit",
  "circleActivity",
  "parkApprove",
  "parkVisit",
  "parkWork",
] as const;
export type MiniTemplateKey = (typeof MINI_TEMPLATE_KEYS)[number];
export const MINI_TEMPLATE_LABELS: Record<string, string> = {
  order: "下单提醒",
  accept: "接单提醒",
  cancel: "取消提醒",
  coachChange: "更换服务人员提醒",
  help: "一键报警提醒",
  circleComment: "圈子评论/回复提醒",
  circleLike: "圈子点赞提醒",
  circleAudit: "圈子审核结果提醒",
  circleActivity: "圈子活动提醒",
  parkApprove: "园区审批结果提醒",
  parkVisit: "园区通行核验提醒",
  parkWork: "园区工单完成提醒",
};

export const miniAppViewSchema = z.object({
  configured: z.boolean(),
  scene: z.enum(PRIVATE_MINI_SCENES),
  shopId: z.number(),
  appId: z.string(),
  appSecretConfigured: z.boolean(),
  mchId: z.string(),
  payCertSerial: z.string(),
  payKeyConfigured: z.boolean(),
  payCertConfigured: z.boolean(),
  payEnabled: z.boolean(),
  mapKeyConfigured: z.boolean(),
  templates: z.record(z.string(), z.string()),
  qrcodeUrl: z.string(),
  status: z.enum(MINI_APP_STATUSES),
  lastError: z.string(),
  verifiedAt: z.string(),
});
export type MiniAppView = z.infer<typeof miniAppViewSchema>;

/** 凭据保存：字符串字段留空表示保留原值（密钥不回显，改一次即可）。 */
export const miniAppInputSchema = z.object({
  appId: z.string().trim().max(64).default(""),
  appSecret: z.string().max(128).optional(),
  mchId: z.string().trim().max(64).default(""),
  payApiV3Key: z.string().max(128).optional(),
  payCertSerial: z.string().trim().max(128).default(""),
  payPrivateKey: z.string().max(8192).optional(),
  payEnabled: z.boolean().default(false),
  mapKey: z.string().max(128).optional(),
  templates: z.record(z.string(), z.string()).default({}),
});
export type MiniAppInput = z.infer<typeof miniAppInputSchema>;

export const miniAppTestResultSchema = z.object({
  ok: z.boolean(),
  shopName: z.string().default(""),
  message: z.string().default(""),
});
export type MiniAppTestResult = z.infer<typeof miniAppTestResultSchema>;

/** 模板小程序状态：仓库内置模板是否可用、版本号、注入项清单。 */
export const miniTemplateInfoSchema = z.object({
  available: z.boolean(),
  scene: z.enum(PRIVATE_MINI_SCENES),
  templateDir: z.string(),
  version: z.string(),
  entryCount: z.number(),
  sizeBytes: z.number(),
  injectedKeys: z.array(z.string()),
});
export type MiniTemplateInfo = z.infer<typeof miniTemplateInfoSchema>;

/** 自营小程序公开启动配置（免登录，绝不回凭据痕迹）。 */
export const miniBootstrapSchema = z.object({
  scene: z.enum(PRIVATE_MINI_SCENES),
  shopCode: z.string(),
  shopName: z.string(),
  slogan: z.string(),
  logo: z.string(),
  themeColor: z.string(),
  navigationTitle: z.string(),
  servicePhone: z.string(),
  features: z.record(z.string(), z.boolean()),
  /** 在线收款是否可用（未配商户号时端上不显示微信支付按钮，走线下标记）。 */
  payEnabled: z.boolean(),
});
export type MiniBootstrap = z.infer<typeof miniBootstrapSchema>;
