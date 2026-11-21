import { z } from "zod";
import { pageQuerySchema, pageSchema } from "./pagination";

const envelope = <T extends z.ZodType>(data: T) =>
  z.object({ code: z.number(), message: z.string(), data: data.nullable() });
const emptyQuery = z.object({});

/**
 * 工作台 · 建站管理 · 知识付费小程序工具（参考「知识付费小程序系统」全量按本站架构重写）。
 *
 * 每个平台账号可建立一套自己的知识付费小程序站点：`Kp_*` 端点管站点配置、分类、
 * 付费内容、轮播/公告/精选位、终端会员、解锁订单与卡密，并把模板小程序
 * （仓库 `miniprogram-kp/`）按本站点配置打包成 zip——用户下载后用微信开发者工具
 * 上传；平台不代编译、不代传微信。
 *
 * 小程序端（终端会员）只走免登录公开通道 `/api/public/knowledge-pay/*`，
 * 以 wx.login 的 code 换 openId 建档并签发会员令牌；不进 JSON 契约与 OpenAPI。
 */

/** 内容形态：决定小程序详情页的播放/渲染组件。 */
export const KP_MEDIA_TYPES = ["video", "audio", "article", "image", "live"] as const;
export type KpMediaType = (typeof KP_MEDIA_TYPES)[number];
export const KP_MEDIA_TYPE_LABELS: Record<string, string> = {
  video: "视频",
  audio: "音频",
  article: "图文",
  image: "图片",
  live: "直播",
};

/** 解锁方式：free 一键免费获取；points 按积分价购买；vip 会员专享。 */
export const KP_ACCESS_MODES = ["free", "points", "vip"] as const;
export type KpAccessMode = (typeof KP_ACCESS_MODES)[number];
export const KP_ACCESS_MODE_LABELS: Record<string, string> = {
  free: "免费获取",
  points: "积分购买",
  vip: "会员专享",
};

/** 卡密种类：vip 按天充值会员；points 积分充值；resource 指定内容直通券。 */
export const KP_CARD_KINDS = ["vip", "points", "resource"] as const;
export type KpCardKind = (typeof KP_CARD_KINDS)[number];
export const KP_CARD_KIND_LABELS: Record<string, string> = {
  vip: "会员天数卡",
  points: "积分充值卡",
  resource: "内容直通券",
};
export const KP_CARD_STATUS_LABELS: Record<string, string> = {
  unused: "未使用",
  used: "已使用",
  disabled: "已停用",
};

/** 订单支付方式（与参考版 lunbo/goods/huoqu/dianka/vip 解锁路径对应）。 */
export const KP_PAY_METHOD_LABELS: Record<string, string> = {
  free: "免费获取",
  points: "积分购买",
  vip: "会员免费",
  card: "卡密兑换",
  admin: "站点方开通",
  wechat: "微信支付",
};

/** 课程上架审核状态：公开通道只展示 published。 */
export const KP_AUDIT_STATUSES = ["draft", "pending", "published", "rejected"] as const;
export type KpAuditStatus = (typeof KP_AUDIT_STATUSES)[number];
export const KP_AUDIT_STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  pending: "待审核",
  published: "已上架",
  rejected: "已驳回",
};

/** 现金订单状态。 */
export const KP_CASH_ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "待支付",
  paid: "已支付",
  closed: "已关闭",
  refunded: "已退款",
};

/**
 * 站点开关（对应参考版 zm_config 的页面/模块显隐位）：
 * 关掉的模块在小程序端整块不渲染。键名即 toggles JSON 的键，值为布尔。
 */
export const KP_TOGGLE_KEYS = [
  "indexBanner",
  "indexNotice",
  "indexHot",
  "indexCategories",
  "typePage",
  "faxianPage",
  "vipPage",
  "search",
  "signIn",
  "buyVip",
  "kami",
  "praise",
  "faq",
  "about",
  "contact",
  "adTab",
  "adDetail",
] as const;
export type KpToggleKey = (typeof KP_TOGGLE_KEYS)[number];
export const KP_TOGGLE_LABELS: Record<string, string> = {
  indexBanner: "首页轮播图",
  indexNotice: "首页公告栏",
  indexHot: "首页热门推荐",
  indexCategories: "首页分类栏目",
  typePage: "「分类」页签",
  faxianPage: "「发现」页签",
  vipPage: "「会员」页签",
  search: "搜索功能",
  signIn: "每日签到",
  buyVip: "积分购买会员",
  kami: "卡密兑换",
  praise: "赞赏功能（联系客服）",
  faq: "使用说明页",
  about: "关于我们页",
  contact: "在线客服按钮",
  adTab: "首页微信广告位",
  adDetail: "详情页微信广告位",
};

/** 会员套餐周期（月），与参考版 yiyue/liuyue/shier 定价档一致。 */
export const KP_VIP_PLANS = [1, 6, 12] as const;

// ---------------------------------------------------------------------------
// 行视图与输入
// ---------------------------------------------------------------------------

export const kpVipPlanSchema = z.object({
  /** 周期月数，只允许 KP_VIP_PLANS（1/6/12），服务端兜底校验。 */
  plan: z.number().int().positive(),
  /** 积分价。 */
  price: z.number().int().nonnegative(),
  /** 现金价（分）；0 表示该档不开放微信支付。 */
  cashPrice: z.number().int().nonnegative().default(0),
});
export type KpVipPlan = z.infer<typeof kpVipPlanSchema>;

export const kpSettingsInputSchema = z.object({
  siteName: z.string().trim().min(1, "请填写站点名称").max(60),
  slogan: z.string().trim().max(120).default(""),
  themeColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "主题色需为 #RRGGBB")
    .default("#3370ff"),
  /** 键为 KP_TOGGLE_KEYS，非法键服务端忽略。 */
  toggles: z.record(z.string(), z.boolean()).default({}),
  faq: z.string().max(20000).default(""),
  about: z.string().max(20000).default(""),
  vipPlans: z.array(kpVipPlanSchema).max(3).default([]),
  signRewards: z.array(z.number().int().min(0).max(9999)).max(7).default([]),
  hotWords: z.string().trim().max(255).default(""),
  moreTitle: z.string().trim().max(60).default("精选推荐"),
  wxAppId: z.string().trim().max(64).default(""),
  /** 留空表示保留原值；传入即覆盖（密文入库，只回是否已配置）。 */
  wxAppSecret: z.string().max(128).optional(),
  /** 站点自有微信商户号与证书：资金不进平台，回调路由按站点编码定位。 */
  wxMchId: z.string().trim().max(32).default(""),
  wxPaySerial: z.string().trim().max(64).default(""),
  /** APIv3 密钥与商户私钥：留空保留原值，传入即加密覆盖。 */
  wxPayApiV3Key: z.string().max(128).optional(),
  wxPayPrivateKey: z.string().max(8192).optional(),
  adUnitTab: z.string().trim().max(64).default(""),
  adUnitDetail: z.string().trim().max(64).default(""),
  enabled: z.boolean().default(true),
});
export type KpSettingsInput = z.infer<typeof kpSettingsInputSchema>;

export const kpSettingsViewSchema = z.object({
  siteCode: z.string(),
  siteName: z.string(),
  slogan: z.string(),
  themeColor: z.string(),
  toggles: z.record(z.string(), z.boolean()),
  faq: z.string(),
  about: z.string(),
  vipPlans: z.array(kpVipPlanSchema),
  signRewards: z.array(z.number()),
  hotWords: z.string(),
  moreTitle: z.string(),
  wxAppId: z.string(),
  wxAppSecretConfigured: z.boolean(),
  wxMchId: z.string().default(""),
  wxPaySerial: z.string().default(""),
  wxPayApiV3KeyConfigured: z.boolean().default(false),
  wxPayPrivateKeyConfigured: z.boolean().default(false),
  /** 微信支付是否可用（AppID + 商户号 + APIv3 密钥 + 私钥齐全）。 */
  wxPayReady: z.boolean().default(false),
  adUnitTab: z.string(),
  adUnitDetail: z.string(),
  enabled: z.boolean(),
  updatedAt: z.string(),
});
export type KpSettingsView = z.infer<typeof kpSettingsViewSchema>;

export const kpCategoryRowSchema = z.object({
  id: z.number(),
  title: z.string(),
  cover: z.string(),
  sort: z.number(),
  status: z.boolean(),
  resourceCount: z.number().default(0),
  createdAt: z.string(),
});
export type KpCategoryRow = z.infer<typeof kpCategoryRowSchema>;

export const kpCategoryInputSchema = z.object({
  title: z.string().trim().min(1, "请填写分类名称").max(60),
  cover: z.string().trim().max(512).default(""),
  sort: z.number().int().min(0).max(9999).default(0),
  status: z.boolean().default(true),
});
export type KpCategoryInput = z.infer<typeof kpCategoryInputSchema>;

export const kpResourceRowSchema = z.object({
  id: z.number(),
  categoryId: z.number(),
  categoryTitle: z.string().default(""),
  mediaType: z.enum(KP_MEDIA_TYPES),
  accessMode: z.enum(KP_ACCESS_MODES),
  price: z.number(),
  /** 现金价（分）；0 表示不开放微信支付。 */
  cashPriceCents: z.number().default(0),
  teacherId: z.number().default(0),
  title: z.string(),
  cover: z.string(),
  intro: z.string(),
  url: z.string(),
  teacherName: z.string().default(""),
  teacherTitle: z.string().default(""),
  teacherAvatar: z.string().default(""),
  teacherIntro: z.string().default(""),
  /** 上架审核状态：draft | pending | published | rejected。 */
  auditStatus: z.string().default("published"),
  auditNote: z.string().default(""),
  /** 课时数（课程目录条目数，含已下架课时则不计入）。 */
  lessonCount: z.number().default(0),
  /** 可见评价均分（一位小数）与条数。 */
  ratingAvg: z.number().default(0),
  ratingCount: z.number().default(0),
  hot: z.boolean(),
  sort: z.number(),
  viewCount: z.number(),
  orderCount: z.number().default(0),
  status: z.boolean(),
  createdAt: z.string(),
});
export type KpResourceRow = z.infer<typeof kpResourceRowSchema>;

export const kpResourceInputSchema = z.object({
  categoryId: z.number().int().min(0).default(0),
  mediaType: z.enum(KP_MEDIA_TYPES).default("video"),
  accessMode: z.enum(KP_ACCESS_MODES).default("points"),
  price: z.number().int().min(0).max(999999).default(0),
  /** 现金价（分）：0 不开放微信支付；开启后小程序端可微信直购。 */
  cashPriceCents: z.number().int().min(0).max(99999999).default(0),
  /** 关联讲师 ID（0 = 未绑定，使用下方纯文本讲师信息）。 */
  teacherId: z.number().int().min(0).default(0),
  title: z.string().trim().min(1, "请填写内容标题").max(120),
  cover: z.string().trim().max(512).default(""),
  intro: z.string().max(60000).default(""),
  url: z.string().trim().max(512).default(""),
  teacherName: z.string().trim().max(60).default(""),
  teacherTitle: z.string().trim().max(60).default(""),
  teacherAvatar: z.string().trim().max(512).default(""),
  teacherIntro: z.string().max(2000).default(""),
  auditStatus: z.enum(KP_AUDIT_STATUSES).default("published"),
  auditNote: z.string().trim().max(255).default(""),
  hot: z.boolean().default(false),
  sort: z.number().int().min(0).max(9999).default(0),
  status: z.boolean().default(true),
});
export type KpResourceInput = z.infer<typeof kpResourceInputSchema>;

export const kpResourceAuditInputSchema = z.object({
  auditStatus: z.enum(KP_AUDIT_STATUSES),
  auditNote: z.string().trim().max(255).default(""),
});
export type KpResourceAuditInput = z.infer<typeof kpResourceAuditInputSchema>;

export const kpResourceListQuerySchema = pageQuerySchema.extend({
  keyword: z.string().default(""),
  categoryId: z.coerce.number().int().min(0).default(0),
  mediaType: z.string().default("all"),
  accessMode: z.string().default("all"),
  status: z.string().default("all"),
  auditStatus: z.string().default("all"),
});

// ---------------------------------------------------------------------------
// 课程目录（课时）/ 学习进度 / 评价评分
// ---------------------------------------------------------------------------

/** 课时：课程下的有序小节；freeTrial 允许未解锁试看。 */
export const kpLessonRowSchema = z.object({
  id: z.number(),
  resourceId: z.number(),
  chapterId: z.number().default(0),
  title: z.string(),
  mediaType: z.enum(KP_MEDIA_TYPES),
  url: z.string(),
  intro: z.string(),
  durationSec: z.number(),
  freeTrial: z.boolean(),
  sort: z.number(),
  status: z.boolean(),
  createdAt: z.string(),
});
export type KpLessonRow = z.infer<typeof kpLessonRowSchema>;

export const kpLessonInputSchema = z.object({
  resourceId: z.number().int().positive(),
  chapterId: z.number().int().min(0).default(0),
  title: z.string().trim().min(1, "请填写课时标题").max(120),
  mediaType: z.enum(KP_MEDIA_TYPES).default("video"),
  url: z.string().trim().max(512).default(""),
  /** 图文课时正文；音视频课时可写补充说明。 */
  intro: z.string().max(60000).default(""),
  durationSec: z.number().int().min(0).max(86400).default(0),
  freeTrial: z.boolean().default(false),
  sort: z.number().int().min(0).max(9999).default(0),
  status: z.boolean().default(true),
});
export type KpLessonInput = z.infer<typeof kpLessonInputSchema>;

export const kpLessonListQuerySchema = z.object({
  resourceId: z.coerce.number().int().positive(),
});

/** 单条学习进度（管理端台账）。 */
export const kpLearningRowSchema = z.object({
  id: z.number(),
  memberId: z.number(),
  nickname: z.string(),
  avatar: z.string().default(""),
  resourceId: z.number(),
  courseTitle: z.string(),
  lessonId: z.number(),
  lessonTitle: z.string(),
  positionSec: z.number(),
  durationSec: z.number(),
  completed: z.boolean(),
  updatedAt: z.string(),
});
export type KpLearningRow = z.infer<typeof kpLearningRowSchema>;

export const kpLearningListQuerySchema = pageQuerySchema.extend({
  keyword: z.string().default(""),
  resourceId: z.coerce.number().int().min(0).default(0),
  completed: z.string().default("all"),
});

/** 课程评价（管理端全量视图，含隐藏与回复）。 */
export const kpReviewRowSchema = z.object({
  id: z.number(),
  resourceId: z.number(),
  courseTitle: z.string().default(""),
  memberId: z.number(),
  nickname: z.string().default(""),
  avatar: z.string().default(""),
  rating: z.number(),
  content: z.string(),
  reply: z.string(),
  status: z.boolean(),
  repliedAt: z.string(),
  createdAt: z.string(),
});
export type KpReviewRow = z.infer<typeof kpReviewRowSchema>;

export const kpReviewListQuerySchema = pageQuerySchema.extend({
  keyword: z.string().default(""),
  resourceId: z.coerce.number().int().min(0).default(0),
  status: z.string().default("all"),
});

export const kpReviewReplyInputSchema = z.object({
  reply: z.string().trim().max(2000).default(""),
});
export const kpReviewStatusInputSchema = z.object({
  status: z.boolean(),
});

// ---------------------------------------------------------------------------
// 章节 / 讲师 / 导航 / 单页 / 现金订单
// ---------------------------------------------------------------------------

export const kpChapterRowSchema = z.object({
  id: z.number(),
  resourceId: z.number(),
  title: z.string(),
  sort: z.number(),
  status: z.boolean(),
  lessonCount: z.number().default(0),
  createdAt: z.string(),
});
export type KpChapterRow = z.infer<typeof kpChapterRowSchema>;

export const kpChapterInputSchema = z.object({
  resourceId: z.number().int().positive(),
  title: z.string().trim().min(1, "请填写章节标题").max(120),
  sort: z.number().int().min(0).max(9999).default(0),
  status: z.boolean().default(true),
});
export type KpChapterInput = z.infer<typeof kpChapterInputSchema>;

export const kpChapterListQuerySchema = z.object({
  resourceId: z.coerce.number().int().positive(),
});

export const kpTeacherRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  title: z.string(),
  avatar: z.string(),
  intro: z.string(),
  sort: z.number(),
  status: z.boolean(),
  courseCount: z.number().default(0),
  createdAt: z.string(),
});
export type KpTeacherRow = z.infer<typeof kpTeacherRowSchema>;

export const kpTeacherInputSchema = z.object({
  name: z.string().trim().min(1, "请填写讲师姓名").max(60),
  title: z.string().trim().max(60).default(""),
  avatar: z.string().trim().max(512).default(""),
  intro: z.string().max(2000).default(""),
  sort: z.number().int().min(0).max(9999).default(0),
  status: z.boolean().default(true),
});
export type KpTeacherInput = z.infer<typeof kpTeacherInputSchema>;

export const kpNavRowSchema = z.object({
  id: z.number(),
  title: z.string(),
  icon: z.string(),
  link: z.string(),
  sort: z.number(),
  status: z.boolean(),
});
export type KpNavRow = z.infer<typeof kpNavRowSchema>;

export const kpNavInputSchema = z.object({
  title: z.string().trim().min(1, "请填写导航标题").max(60),
  icon: z.string().trim().max(512).default(""),
  /** resource:<id> | page:<id> | url:<https> | app:<appid>|<path> | none */
  link: z.string().trim().max(512).default("none"),
  sort: z.number().int().min(0).max(9999).default(0),
  status: z.boolean().default(true),
});
export type KpNavInput = z.infer<typeof kpNavInputSchema>;

export const kpPageRowSchema = z.object({
  id: z.number(),
  title: z.string(),
  slug: z.string(),
  content: z.string(),
  sort: z.number(),
  status: z.boolean(),
  createdAt: z.string(),
});
export type KpPageRow = z.infer<typeof kpPageRowSchema>;

export const kpPageInputSchema = z.object({
  title: z.string().trim().min(1, "请填写页面标题").max(120),
  slug: z
    .string()
    .trim()
    .max(60)
    .regex(/^[a-zA-Z0-9_-]*$/, "标识只能包含字母、数字、下划线与短横线")
    .default(""),
  content: z.string().max(60000).default(""),
  sort: z.number().int().min(0).max(9999).default(0),
  status: z.boolean().default(true),
});
export type KpPageInput = z.infer<typeof kpPageInputSchema>;

export const kpCashOrderRowSchema = z.object({
  id: z.number(),
  memberId: z.number(),
  nickname: z.string().default(""),
  kind: z.string(),
  resourceId: z.number(),
  courseTitle: z.string().default(""),
  plan: z.number(),
  title: z.string(),
  amountCents: z.number(),
  outTradeNo: z.string(),
  transactionId: z.string(),
  status: z.string(),
  refundNo: z.string(),
  refundReason: z.string(),
  paidAt: z.string(),
  refundedAt: z.string(),
  createdAt: z.string(),
});
export type KpCashOrderRow = z.infer<typeof kpCashOrderRowSchema>;

export const kpCashOrderListQuerySchema = pageQuerySchema.extend({
  keyword: z.string().default(""),
  status: z.string().default("all"),
  kind: z.string().default("all"),
});

export const kpCashRefundInputSchema = z.object({
  reason: z.string().trim().max(120).default(""),
});

export const kpBannerRowSchema = z.object({
  id: z.number(),
  title: z.string(),
  image: z.string(),
  link: z.string(),
  sort: z.number(),
  status: z.boolean(),
});
export type KpBannerRow = z.infer<typeof kpBannerRowSchema>;

export const kpBannerInputSchema = z.object({
  title: z.string().trim().max(120).default(""),
  image: z.string().trim().min(1, "请上传轮播图片").max(512),
  link: z.string().trim().max(512).default("none"),
  sort: z.number().int().min(0).max(9999).default(0),
  status: z.boolean().default(true),
});
export type KpBannerInput = z.infer<typeof kpBannerInputSchema>;

export const kpNoticeRowSchema = z.object({
  id: z.number(),
  title: z.string(),
  content: z.string(),
  status: z.boolean(),
  createdAt: z.string(),
});
export type KpNoticeRow = z.infer<typeof kpNoticeRowSchema>;

export const kpNoticeInputSchema = z.object({
  title: z.string().trim().min(1, "请填写公告标题").max(120),
  content: z.string().max(20000).default(""),
  status: z.boolean().default(true),
});
export type KpNoticeInput = z.infer<typeof kpNoticeInputSchema>;

export const kpLinkRowSchema = z.object({
  id: z.number(),
  title: z.string(),
  summary: z.string(),
  cover: z.string(),
  link: z.string(),
  sort: z.number(),
  status: z.boolean(),
});
export type KpLinkRow = z.infer<typeof kpLinkRowSchema>;

export const kpLinkInputSchema = z.object({
  title: z.string().trim().min(1, "请填写标题").max(120),
  summary: z.string().trim().max(255).default(""),
  cover: z.string().trim().max(512).default(""),
  link: z.string().trim().max(512).default(""),
  sort: z.number().int().min(0).max(9999).default(0),
  status: z.boolean().default(true),
});
export type KpLinkInput = z.infer<typeof kpLinkInputSchema>;

export const kpCardRowSchema = z.object({
  id: z.number(),
  code: z.string(),
  kind: z.enum(KP_CARD_KINDS),
  resourceId: z.number(),
  resourceTitle: z.string().default(""),
  days: z.number(),
  points: z.number(),
  status: z.string(),
  usedByNickname: z.string().default(""),
  usedAt: z.string(),
  batchNo: z.string(),
  remark: z.string(),
  createdAt: z.string(),
});
export type KpCardRow = z.infer<typeof kpCardRowSchema>;

export const kpCardGenerateInputSchema = z.object({
  kind: z.enum(KP_CARD_KINDS),
  /** 生成张数（一次一批，同参数）。 */
  count: z.number().int().min(1).max(500).default(10),
  /** kind=vip：会员天数。 */
  days: z.number().int().min(0).max(3650).default(0),
  /** kind=points：积分面值。 */
  points: z.number().int().min(0).max(999999).default(0),
  /** kind=resource：指定内容 ID。 */
  resourceId: z.number().int().min(0).default(0),
  remark: z.string().trim().max(120).default(""),
});
export type KpCardGenerateInput = z.infer<typeof kpCardGenerateInputSchema>;

export const kpCardGenerateResultSchema = z.object({
  batchNo: z.string(),
  count: z.number(),
  items: z.array(kpCardRowSchema),
});
export type KpCardGenerateResult = z.infer<typeof kpCardGenerateResultSchema>;

export const kpCardListQuerySchema = pageQuerySchema.extend({
  keyword: z.string().default(""),
  kind: z.string().default("all"),
  status: z.string().default("all"),
});

export const kpMemberRowSchema = z.object({
  id: z.number(),
  nickname: z.string(),
  avatar: z.string(),
  openidMasked: z.string(),
  points: z.number(),
  vipUntil: z.string(),
  vipActive: z.boolean(),
  signInStreak: z.number(),
  orderCount: z.number().default(0),
  status: z.boolean(),
  createdAt: z.string(),
  lastLoginAt: z.string(),
});
export type KpMemberRow = z.infer<typeof kpMemberRowSchema>;

export const kpMemberAdjustInputSchema = z.object({
  /** 积分增减（负数扣减，扣到 0 为止）。 */
  pointsDelta: z.number().int().min(-999999).max(999999).optional(),
  /** 会员天数增减（负数缩短有效期）。 */
  vipDays: z.number().int().min(-3650).max(3650).optional(),
  /** 停用时该会员无法登录小程序与解锁内容。 */
  status: z.boolean().optional(),
  remark: z.string().trim().max(120).optional(),
});
export type KpMemberAdjustInput = z.infer<typeof kpMemberAdjustInputSchema>;

export const kpMemberListQuerySchema = pageQuerySchema.extend({
  keyword: z.string().default(""),
  vip: z.string().default("all"),
});

export const kpOrderRowSchema = z.object({
  id: z.number(),
  memberId: z.number(),
  nickname: z.string(),
  resourceId: z.number(),
  title: z.string(),
  cover: z.string(),
  payMethod: z.string(),
  amount: z.number(),
  createdAt: z.string(),
});
export type KpOrderRow = z.infer<typeof kpOrderRowSchema>;

export const kpOrderListQuerySchema = pageQuerySchema.extend({
  keyword: z.string().default(""),
  payMethod: z.string().default("all"),
});

export const kpOverviewSchema = z.object({
  siteCode: z.string(),
  resourceCount: z.number(),
  onlineCount: z.number(),
  categoryCount: z.number(),
  memberCount: z.number(),
  vipCount: z.number(),
  orderCount: z.number(),
  todayOrders: z.number(),
  pointsConsumed: z.number(),
  cardUnused: z.number(),
  cardUsed: z.number(),
  /** 有学习记录的会员数（去重）。 */
  learnerCount: z.number().default(0),
  /** 学习进度条数（会员 × 课时）。 */
  progressCount: z.number().default(0),
  /** 已完课（课时完成）条数。 */
  completedCount: z.number().default(0),
  /** 评价条数与均分（全量，含隐藏）。 */
  reviewCount: z.number().default(0),
  ratingAvg: z.number().default(0),
  /** 现金订单数、已收金额（分）、已退款金额（分）、待支付笔数。 */
  cashOrderCount: z.number().default(0),
  cashRevenueCents: z.number().default(0),
  cashRefundedCents: z.number().default(0),
  pendingCashOrders: z.number().default(0),
  wxReady: z.boolean(),
});
export type KpOverview = z.infer<typeof kpOverviewSchema>;

// ---------------------------------------------------------------- 会员（终端）

/** 连接自检：用站点 AppID/AppSecret 取一次 access_token。 */
export const kpTestResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
});
export type KpTestResult = z.infer<typeof kpTestResultSchema>;

// ---------------------------------------------------------------------------
// 端点（前缀 Kp_ = 用户侧「知识付费小程序工具」；鉴权会话内可用）
// ---------------------------------------------------------------------------

export const knowledgePayEndpoints = {
  Kp_overview: {
    method: "get" as const,
    path: "/enterprise/knowledge-pay/overview",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(kpOverviewSchema),
  },
  Kp_settings: {
    method: "get" as const,
    path: "/enterprise/knowledge-pay/settings",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(kpSettingsViewSchema),
  },
  Kp_saveSettings: {
    method: "put" as const,
    path: "/enterprise/knowledge-pay/settings",
    params: z.object({}),
    query: emptyQuery,
    body: kpSettingsInputSchema,
    response: envelope(kpSettingsViewSchema),
  },
  /** 凭据自检：AppID/AppSecret 能否取到 access_token。 */
  Kp_test: {
    method: "post" as const,
    path: "/enterprise/knowledge-pay/settings/test",
    params: z.object({}),
    query: emptyQuery,
    body: z.object({}),
    response: envelope(kpTestResultSchema),
  },
  /** 支付自检：下载并验签微信支付平台证书，确认商户凭据链路可用。 */
  Kp_testPay: {
    method: "post" as const,
    path: "/enterprise/knowledge-pay/settings/test-pay",
    params: z.object({}),
    query: emptyQuery,
    body: z.object({}),
    response: envelope(kpTestResultSchema),
  },

  Kp_categories: {
    method: "get" as const,
    path: "/enterprise/knowledge-pay/categories",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ list: z.array(kpCategoryRowSchema) })),
  },
  Kp_createCategory: {
    method: "post" as const,
    path: "/enterprise/knowledge-pay/categories",
    params: z.object({}),
    query: emptyQuery,
    body: kpCategoryInputSchema,
    response: envelope(kpCategoryRowSchema),
  },
  Kp_updateCategory: {
    method: "put" as const,
    path: "/enterprise/knowledge-pay/categories/:id",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: kpCategoryInputSchema,
    response: envelope(kpCategoryRowSchema),
  },
  Kp_removeCategory: {
    method: "delete" as const,
    path: "/enterprise/knowledge-pay/categories/:id",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ removed: z.boolean() })),
  },

  Kp_resources: {
    method: "get" as const,
    path: "/enterprise/knowledge-pay/resources",
    params: z.object({}),
    query: kpResourceListQuerySchema,
    body: z.undefined(),
    response: envelope(pageSchema(kpResourceRowSchema)),
  },
  Kp_createResource: {
    method: "post" as const,
    path: "/enterprise/knowledge-pay/resources",
    params: z.object({}),
    query: emptyQuery,
    body: kpResourceInputSchema,
    response: envelope(kpResourceRowSchema),
  },
  Kp_updateResource: {
    method: "put" as const,
    path: "/enterprise/knowledge-pay/resources/:id",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: kpResourceInputSchema,
    response: envelope(kpResourceRowSchema),
  },
  Kp_removeResource: {
    method: "delete" as const,
    path: "/enterprise/knowledge-pay/resources/:id",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ removed: z.boolean() })),
  },
  /** 审核快捷动作：只改审核态与备注，不动课程正文。 */
  Kp_auditResource: {
    method: "post" as const,
    path: "/enterprise/knowledge-pay/resources/:id/audit",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: kpResourceAuditInputSchema,
    response: envelope(
      z.object({
        id: z.number(),
        auditStatus: z.string(),
        auditNote: z.string(),
      }),
    ),
  },

  /** 课程目录：按课程（资源）列出课时，管理端编辑用（含下架课时）。 */
  Kp_lessons: {
    method: "get" as const,
    path: "/enterprise/knowledge-pay/lessons",
    params: z.object({}),
    query: kpLessonListQuerySchema,
    body: z.undefined(),
    response: envelope(z.object({ list: z.array(kpLessonRowSchema) })),
  },
  Kp_saveLesson: {
    method: "post" as const,
    path: "/enterprise/knowledge-pay/lessons",
    params: z.object({}),
    query: emptyQuery,
    body: kpLessonInputSchema,
    response: envelope(kpLessonRowSchema),
  },
  Kp_updateLesson: {
    method: "put" as const,
    path: "/enterprise/knowledge-pay/lessons/:id",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: kpLessonInputSchema,
    response: envelope(kpLessonRowSchema),
  },
  Kp_removeLesson: {
    method: "delete" as const,
    path: "/enterprise/knowledge-pay/lessons/:id",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ removed: z.boolean() })),
  },

  /** 课程章节：课时按章分组。 */
  Kp_chapters: {
    method: "get" as const,
    path: "/enterprise/knowledge-pay/chapters",
    params: z.object({}),
    query: kpChapterListQuerySchema,
    body: z.undefined(),
    response: envelope(z.object({ list: z.array(kpChapterRowSchema) })),
  },
  Kp_saveChapter: {
    method: "post" as const,
    path: "/enterprise/knowledge-pay/chapters",
    params: z.object({}),
    query: emptyQuery,
    body: kpChapterInputSchema,
    response: envelope(kpChapterRowSchema),
  },
  Kp_updateChapter: {
    method: "put" as const,
    path: "/enterprise/knowledge-pay/chapters/:id",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: kpChapterInputSchema,
    response: envelope(kpChapterRowSchema),
  },
  Kp_removeChapter: {
    method: "delete" as const,
    path: "/enterprise/knowledge-pay/chapters/:id",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ removed: z.boolean() })),
  },

  /** 讲师档案：课程关联讲师后，小程序提供讲师主页。 */
  Kp_teachers: {
    method: "get" as const,
    path: "/enterprise/knowledge-pay/teachers",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ list: z.array(kpTeacherRowSchema) })),
  },
  Kp_saveTeacher: {
    method: "post" as const,
    path: "/enterprise/knowledge-pay/teachers",
    params: z.object({}),
    query: emptyQuery,
    body: kpTeacherInputSchema,
    response: envelope(kpTeacherRowSchema),
  },
  Kp_updateTeacher: {
    method: "put" as const,
    path: "/enterprise/knowledge-pay/teachers/:id",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: kpTeacherInputSchema,
    response: envelope(kpTeacherRowSchema),
  },
  Kp_removeTeacher: {
    method: "delete" as const,
    path: "/enterprise/knowledge-pay/teachers/:id",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ removed: z.boolean() })),
  },

  Kp_banners: {
    method: "get" as const,
    path: "/enterprise/knowledge-pay/banners",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ list: z.array(kpBannerRowSchema) })),
  },
  Kp_saveBanner: {
    method: "post" as const,
    path: "/enterprise/knowledge-pay/banners",
    params: z.object({}),
    query: emptyQuery,
    body: kpBannerInputSchema,
    response: envelope(kpBannerRowSchema),
  },
  Kp_updateBanner: {
    method: "put" as const,
    path: "/enterprise/knowledge-pay/banners/:id",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: kpBannerInputSchema,
    response: envelope(kpBannerRowSchema),
  },
  Kp_removeBanner: {
    method: "delete" as const,
    path: "/enterprise/knowledge-pay/banners/:id",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ removed: z.boolean() })),
  },

  Kp_notices: {
    method: "get" as const,
    path: "/enterprise/knowledge-pay/notices",
    params: z.object({}),
    query: pageQuerySchema,
    body: z.undefined(),
    response: envelope(pageSchema(kpNoticeRowSchema)),
  },
  Kp_saveNotice: {
    method: "post" as const,
    path: "/enterprise/knowledge-pay/notices",
    params: z.object({}),
    query: emptyQuery,
    body: kpNoticeInputSchema,
    response: envelope(kpNoticeRowSchema),
  },
  Kp_updateNotice: {
    method: "put" as const,
    path: "/enterprise/knowledge-pay/notices/:id",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: kpNoticeInputSchema,
    response: envelope(kpNoticeRowSchema),
  },
  Kp_removeNotice: {
    method: "delete" as const,
    path: "/enterprise/knowledge-pay/notices/:id",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ removed: z.boolean() })),
  },

  Kp_links: {
    method: "get" as const,
    path: "/enterprise/knowledge-pay/links",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ list: z.array(kpLinkRowSchema) })),
  },
  Kp_saveLink: {
    method: "post" as const,
    path: "/enterprise/knowledge-pay/links",
    params: z.object({}),
    query: emptyQuery,
    body: kpLinkInputSchema,
    response: envelope(kpLinkRowSchema),
  },
  Kp_updateLink: {
    method: "put" as const,
    path: "/enterprise/knowledge-pay/links/:id",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: kpLinkInputSchema,
    response: envelope(kpLinkRowSchema),
  },
  Kp_removeLink: {
    method: "delete" as const,
    path: "/enterprise/knowledge-pay/links/:id",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ removed: z.boolean() })),
  },

  /** 「发现」页导航。 */
  Kp_navs: {
    method: "get" as const,
    path: "/enterprise/knowledge-pay/navs",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ list: z.array(kpNavRowSchema) })),
  },
  Kp_saveNav: {
    method: "post" as const,
    path: "/enterprise/knowledge-pay/navs",
    params: z.object({}),
    query: emptyQuery,
    body: kpNavInputSchema,
    response: envelope(kpNavRowSchema),
  },
  Kp_updateNav: {
    method: "put" as const,
    path: "/enterprise/knowledge-pay/navs/:id",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: kpNavInputSchema,
    response: envelope(kpNavRowSchema),
  },
  Kp_removeNav: {
    method: "delete" as const,
    path: "/enterprise/knowledge-pay/navs/:id",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ removed: z.boolean() })),
  },

  /** 自定义单页（关于/协议/活动），小程序按 id 渲染富文本。 */
  Kp_pages: {
    method: "get" as const,
    path: "/enterprise/knowledge-pay/pages",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ list: z.array(kpPageRowSchema) })),
  },
  Kp_savePage: {
    method: "post" as const,
    path: "/enterprise/knowledge-pay/pages",
    params: z.object({}),
    query: emptyQuery,
    body: kpPageInputSchema,
    response: envelope(kpPageRowSchema),
  },
  Kp_updatePage: {
    method: "put" as const,
    path: "/enterprise/knowledge-pay/pages/:id",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: kpPageInputSchema,
    response: envelope(kpPageRowSchema),
  },
  Kp_removePage: {
    method: "delete" as const,
    path: "/enterprise/knowledge-pay/pages/:id",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ removed: z.boolean() })),
  },

  Kp_cards: {
    method: "get" as const,
    path: "/enterprise/knowledge-pay/cards",
    params: z.object({}),
    query: kpCardListQuerySchema,
    body: z.undefined(),
    response: envelope(pageSchema(kpCardRowSchema)),
  },
  Kp_generateCards: {
    method: "post" as const,
    path: "/enterprise/knowledge-pay/cards",
    params: z.object({}),
    query: emptyQuery,
    body: kpCardGenerateInputSchema,
    response: envelope(kpCardGenerateResultSchema),
  },
  Kp_disableCard: {
    method: "post" as const,
    path: "/enterprise/knowledge-pay/cards/:id/disable",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.object({}),
    response: envelope(kpCardRowSchema),
  },
  Kp_removeCard: {
    method: "delete" as const,
    path: "/enterprise/knowledge-pay/cards/:id",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ removed: z.boolean() })),
  },

  Kp_members: {
    method: "get" as const,
    path: "/enterprise/knowledge-pay/members",
    params: z.object({}),
    query: kpMemberListQuerySchema,
    body: z.undefined(),
    response: envelope(pageSchema(kpMemberRowSchema)),
  },
  Kp_adjustMember: {
    method: "post" as const,
    path: "/enterprise/knowledge-pay/members/:id/adjust",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: kpMemberAdjustInputSchema,
    response: envelope(kpMemberRowSchema),
  },

  Kp_orders: {
    method: "get" as const,
    path: "/enterprise/knowledge-pay/orders",
    params: z.object({}),
    query: kpOrderListQuerySchema,
    body: z.undefined(),
    response: envelope(pageSchema(kpOrderRowSchema)),
  },

  /** 学习台账：会员 × 课时的播放进度与完课状态。 */
  Kp_learnings: {
    method: "get" as const,
    path: "/enterprise/knowledge-pay/learnings",
    params: z.object({}),
    query: kpLearningListQuerySchema,
    body: z.undefined(),
    response: envelope(pageSchema(kpLearningRowSchema)),
  },

  Kp_reviews: {
    method: "get" as const,
    path: "/enterprise/knowledge-pay/reviews",
    params: z.object({}),
    query: kpReviewListQuerySchema,
    body: z.undefined(),
    response: envelope(pageSchema(kpReviewRowSchema)),
  },
  Kp_replyReview: {
    method: "post" as const,
    path: "/enterprise/knowledge-pay/reviews/:id/reply",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: kpReviewReplyInputSchema,
    response: envelope(kpReviewRowSchema),
  },
  Kp_setReviewStatus: {
    method: "post" as const,
    path: "/enterprise/knowledge-pay/reviews/:id/status",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: kpReviewStatusInputSchema,
    response: envelope(kpReviewRowSchema),
  },
  Kp_removeReview: {
    method: "delete" as const,
    path: "/enterprise/knowledge-pay/reviews/:id",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ removed: z.boolean() })),
  },

  /** 现金订单（站点自有微信商户号）：列表、关闭待支付、原路退款。 */
  Kp_cashOrders: {
    method: "get" as const,
    path: "/enterprise/knowledge-pay/cash-orders",
    params: z.object({}),
    query: kpCashOrderListQuerySchema,
    body: z.undefined(),
    response: envelope(pageSchema(kpCashOrderRowSchema)),
  },
  Kp_closeCashOrder: {
    method: "post" as const,
    path: "/enterprise/knowledge-pay/cash-orders/:id/close",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.object({}),
    response: envelope(kpCashOrderRowSchema),
  },
  Kp_refundCashOrder: {
    method: "post" as const,
    path: "/enterprise/knowledge-pay/cash-orders/:id/refund",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: kpCashRefundInputSchema,
    response: envelope(kpCashOrderRowSchema),
  },
} as const;
