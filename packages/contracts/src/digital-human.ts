import { z } from "zod";
import {
  miniAppInputSchema,
  miniAppTestResultSchema,
  miniAppViewSchema,
} from "./private-mini";

const envelope = <T extends z.ZodType>(data: T) =>
  z.object({ code: z.number(), message: z.string(), data: data.nullable() });
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

const idBody = <T extends z.ZodRawShape>(extra: T) =>
  z.object({ id: z.number().int().positive(), ...extra });

const pageQuery = <T extends z.ZodRawShape>(extra: T) =>
  z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    ...extra,
  });

const pageOf = <T extends z.ZodType>(row: T) =>
  z.object({
    list: z.array(row),
    total: z.number(),
    page: z.number(),
    pageSize: z.number(),
  });

/**
 * 工作台 · 建站管理 · 数字人小程序工具（参考「AI 数字人分身系统」全量按本站架构重写）。
 *
 * 每个平台账号可建立一套自己的数字人小程序站点：`Dh_*` 端点管站点品牌/开关/计价、
 * 模型渠道（形象训练/声音克隆/TTS/对口型，本站「模型配置」范式，密钥密文入库）、
 * 终端会员与三账户流水、形象/声音资产、公共音色与 BGM 库、作品与异步任务、
 * AI 文案模板与记录、充值套餐与订单（微信商户号直收，平台不经手资金）、卡密、
 * 图文/轮播/海报、两级分销（推广员申请、佣金流水、提现）、反馈，
 * 以及数字人小程序模板（仓库 `miniprogram-dh/`）出包直传微信。
 *
 * 模型服务复用本站底层：文本走 ai-gateway，语音合成/克隆、形象训练、对口型走
 * `Dh_channel*` 配置的渠道（fox|synclabs|custom 三协议 + webhook 状态机）。
 * 在线客服复用本站 service-desk（站点只存 serviceDeskSiteKey，不建会话表）。
 *
 * 小程序端（终端会员）只走免登录公开通道 `/api/public/digital-human/*`，
 * 以 wx.login 的 code 换 openId 建档并签发会员令牌；不进 JSON 契约与 OpenAPI。
 */

// ---------------------------------------------------------------------------
// 枚举与标签
// ---------------------------------------------------------------------------

/** 渠道能力：一个能力可配多条渠道，其中一条为默认。 */
export const DH_CHANNEL_CAPABILITIES = [
  "voice-clone",
  "body-train",
  "tts",
  "lipsync",
] as const;
export type DhChannelCapability = (typeof DH_CHANNEL_CAPABILITIES)[number];
export const DH_CHANNEL_CAPABILITY_LABELS: Record<string, string> = {
  "voice-clone": "声音克隆",
  "body-train": "形象训练",
  tts: "语音合成",
  lipsync: "对口型",
};

/** 供应商协议：fox=workai 聚合、synclabs=对口型代理、custom=自定义。 */
export const DH_CHANNEL_PROTOCOLS = ["fox", "synclabs", "custom"] as const;
export type DhChannelProtocol = (typeof DH_CHANNEL_PROTOCOLS)[number];
export const DH_CHANNEL_PROTOCOL_LABELS: Record<string, string> = {
  fox: "Fox 聚合",
  synclabs: "SyncLabs",
  custom: "自定义",
};

export const DH_SITE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "未上线",
  ONLINE: "营业中",
  SUSPENDED: "平台停服",
  CLOSED: "已关闭",
};

export const DH_MEMBER_STATUS = ["ACTIVE", "FROZEN", "DELETED"] as const;
export const DH_MEMBER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "正常",
  FROZEN: "已冻结",
  DELETED: "已注销",
};

/** 三账户：算力（合成扣它）、形象克隆点、声音克隆点。 */
export const DH_ACCOUNTS = ["point", "body", "voice"] as const;
export const DH_ACCOUNT_LABELS: Record<string, string> = {
  point: "算力",
  body: "形象点",
  voice: "声音点",
};

export const DH_BIZ_TYPE_LABELS: Record<string, string> = {
  gift: "新人礼",
  recharge: "充值",
  work: "视频合成",
  tts: "语音合成",
  body: "形象克隆",
  voice: "声音克隆",
  card: "卡密兑换",
  refund: "失败退回",
  admin: "站点方调整",
  commission: "佣金抵扣",
};

/** 形象/声音训练状态：与数字人作品页的素材选择联动。 */
export const DH_TRAIN_STATUS_LABELS: Record<string, string> = {
  "0": "训练中",
  "1": "已可用",
  "2": "训练失败",
};

export const DH_WORK_STATUS_LABELS: Record<string, string> = {
  "0": "合成中",
  "1": "已完成",
  "2": "合成失败",
};
export const DH_WORK_STAGE_LABELS: Record<string, string> = {
  tts: "语音合成中",
  lipsync: "画面合成中",
  done: "已完成",
};

export const DH_TASK_KIND_LABELS: Record<string, string> = {
  "voice-clone": "声音克隆",
  "body-train": "形象训练",
  tts: "语音合成",
  lipsync: "对口型",
  "bgm-merge": "背景音乐混流",
};
export const DH_TASK_STATUS_LABELS: Record<string, string> = {
  "0": "待发起",
  "1": "进行中",
  "2": "成功",
  "3": "失败",
};

/** 套餐类型：vip 会员 / point 算力 / body 形象点 / voice 声音点。 */
export const DH_PACKAGE_TYPES = ["vip", "point", "body", "voice"] as const;
export const DH_PACKAGE_TYPE_LABELS: Record<string, string> = {
  vip: "会员套餐",
  point: "算力套餐",
  body: "形象点套餐",
  voice: "声音点套餐",
};

export const DH_ORDER_STATUS_LABELS: Record<string, string> = {
  "0": "未支付",
  "1": "已支付",
  "2": "已退款",
  "3": "已关闭",
};

export const DH_CARD_STATUS_LABELS: Record<string, string> = {
  unused: "未使用",
  used: "已使用",
  disabled: "已停用",
};

/** 图文栏目：与小程序「我的/系统」页的固定入口一一对应。 */
export const DH_ARTICLE_TYPES = [
  "help",
  "notice",
  "about",
  "privacy",
  "agreement",
] as const;
export const DH_ARTICLE_TYPE_LABELS: Record<string, string> = {
  help: "使用教程",
  notice: "公告",
  about: "关于我们",
  privacy: "隐私政策",
  agreement: "用户协议",
};
export const DH_ARTICLE_CONTENT_TYPES = ["article", "video", "link"] as const;
export const DH_ARTICLE_CONTENT_TYPE_LABELS: Record<string, string> = {
  article: "图文",
  video: "视频",
  link: "外链",
};

export const DH_WRITE_KINDS = [
  "write_model",
  "write_topic",
  "clone_hint",
  "voice_example",
] as const;
export const DH_WRITE_KIND_LABELS: Record<string, string> = {
  write_model: "AI 写作模板",
  write_topic: "AI 选题",
  clone_hint: "克隆引导文案",
  voice_example: "朗读示例文案",
};

export const DH_JOIN_TYPES = ["auto", "pay", "manual"] as const;
export const DH_JOIN_TYPE_LABELS: Record<string, string> = {
  auto: "自动开通",
  pay: "付费开通",
  manual: "人工审核",
};

export const DH_COMMISSION_TYPE_LABELS: Record<string, string> = {
  "1": "推广收入",
  "2": "提现支出",
  "3": "退款扣回",
  "4": "提现退回",
};

export const DH_WITHDRAW_STATUS_LABELS: Record<string, string> = {
  "0": "待处理",
  "1": "已打款",
  "2": "已驳回",
};
export const DH_WITHDRAW_METHODS = ["bank", "qrcode"] as const;
export const DH_WITHDRAW_METHOD_LABELS: Record<string, string> = {
  bank: "银行卡",
  qrcode: "收款码",
};

/**
 * 站点模块显隐（对应参考版页面/功能开关）：关掉的模块小程序端整块不渲染。
 * 键名即 toggles JSON 的键，值为布尔；未出现的键按标签默认（除标注外默认开）。
 */
export const DH_TOGGLE_KEYS = [
  "indexSwiper",
  "indexNotice",
  "bodyClone",
  "voiceClone",
  "aiWrite",
  "ttsAudio",
  "worksPage",
  "vipPage",
  "card",
  "commissionPage",
  "poster",
  "feedback",
  "serviceDesk",
  "agreement",
] as const;
export type DhToggleKey = (typeof DH_TOGGLE_KEYS)[number];
export const DH_TOGGLE_LABELS: Record<string, string> = {
  indexSwiper: "首页轮播图",
  indexNotice: "首页公告栏",
  bodyClone: "形象克隆",
  voiceClone: "声音克隆",
  aiWrite: "AI 文案",
  ttsAudio: "语音合成（仅朗读）",
  worksPage: "「作品」页签",
  vipPage: "「会员」页签",
  card: "卡密兑换",
  commissionPage: "「分销中心」页签",
  poster: "推广海报",
  feedback: "意见反馈",
  serviceDesk: "在线客服",
  agreement: "协议与隐私",
};

// ---------------------------------------------------------------------------
// 站点设置
// ---------------------------------------------------------------------------

export const dhBrandSchema = z.object({
  shareTitle: z.string().trim().max(120).default(""),
  shareImage: z.string().trim().max(500).default(""),
  navigationTitle: z.string().trim().max(60).default(""),
});
export type DhBrand = z.infer<typeof dhBrandSchema>;

/** 计价（单位：点数）与账户显示名；端上按此展示消耗预估。 */
export const dhPricingSchema = z.object({
  pointTitle: z.string().trim().max(20).default("算力"),
  priceVideo: z.number().int().min(0).max(9999).default(10),
  priceTts: z.number().int().min(0).max(9999).default(1),
  priceBody: z.number().int().min(0).max(9999).default(3),
  priceVoice: z.number().int().min(0).max(9999).default(3),
});
export type DhPricing = z.infer<typeof dhPricingSchema>;

export const dhGiftSchema = z.object({
  vipDays: z.number().int().min(0).max(3650).default(0),
  point: z.number().int().min(0).max(99999).default(0),
  body: z.number().int().min(0).max(9999).default(0),
  voice: z.number().int().min(0).max(9999).default(0),
});
export type DhGift = z.infer<typeof dhGiftSchema>;

export const dhLoginSchema = z.object({
  /** 开启后非会员不能提交合成（仍可浏览）。 */
  mustVip: z.boolean().default(false),
});
export type DhLogin = z.infer<typeof dhLoginSchema>;

/** 克隆素材校验参数（秒/字），端上与服务端双重把关。 */
export const dhCloneSchema = z.object({
  bodyMinSec: z.number().int().min(1).max(120).default(5),
  bodyMaxSec: z.number().int().min(1).max(180).default(60),
  voiceMinSec: z.number().int().min(1).max(120).default(10),
  voiceMaxSec: z.number().int().min(1).max(180).default(60),
  scriptMaxLen: z.number().int().min(10).max(5000).default(800),
});
export type DhClone = z.infer<typeof dhCloneSchema>;

/** 两级分销参数：比例按百分数（20 = 20%），关闭后分销中心整块隐藏。 */
export const dhCommissionSchema = z.object({
  enabled: z.boolean().default(false),
  level1Rate: z.number().int().min(0).max(100).default(20),
  level2Rate: z.number().int().min(0).max(100).default(5),
  joinType: z.enum(DH_JOIN_TYPES).default("auto"),
  /** joinType=pay 时，开通推广员要买的套餐。 */
  payPackageId: z.number().int().min(0).default(0),
  minWithdrawCents: z.number().int().min(0).max(100000000).default(1000),
});
export type DhCommissionConfig = z.infer<typeof dhCommissionSchema>;

/** 首页 DIY 组件白名单；小程序模板按 type 逐类渲染，未知类型直接跳过。 */
export const DH_DIY_WIDGET_TYPES = [
  "swiper",
  "images",
  "buttons",
  "title",
  "blank",
] as const;
export const DH_DIY_WIDGET_LABELS: Record<string, string> = {
  swiper: "轮播图",
  images: "图片组",
  buttons: "按钮组",
  title: "标题栏",
  blank: "占位空白",
};

export const dhDiyItemSchema = z.object({
  image: z.string().trim().max(500).default(""),
  /** buttons 组显示在图片下方的按钮文字。 */
  text: z.string().trim().max(30).default(""),
  /** 站内路径（/pages/...）或 https 链接。 */
  link: z.string().trim().max(300).default(""),
});
export type DhDiyItem = z.infer<typeof dhDiyItemSchema>;

export const dhDiyComponentSchema = z.object({
  id: z.string().trim().min(1).max(32),
  type: z.enum(DH_DIY_WIDGET_TYPES),
  title: z.string().trim().max(60).default(""),
  /** swiper/buttons/blank 的区块高度（rpx），0＝按内容自适应。 */
  height: z.number().int().min(0).max(2000).default(0),
  radius: z.number().int().min(0).max(60).default(12),
  items: z.array(dhDiyItemSchema).max(12).default([]),
});
export type DhDiyComponent = z.infer<typeof dhDiyComponentSchema>;

export const dhDiyPageSchema = z.object({
  components: z.array(dhDiyComponentSchema).max(40).default([]),
});
export type DhDiyPage = z.infer<typeof dhDiyPageSchema>;

export const dhSettingsInputSchema = z.object({
  siteName: z.string().trim().min(1, "请填写站点名称").max(60),
  slogan: z.string().trim().max(120).default(""),
  logo: z.string().trim().max(500).default(""),
  themeColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "主题色需为 #RRGGBB")
    .default("#3370ff"),
  servicePhone: z.string().trim().max(32).default(""),
  brand: dhBrandSchema.partial().default({}),
  /** 键为 DH_TOGGLE_KEYS，非法键服务端忽略。 */
  toggles: z.record(z.string(), z.boolean()).default({}),
  pricing: dhPricingSchema.partial().default({}),
  gift: dhGiftSchema.partial().default({}),
  login: dhLoginSchema.partial().default({}),
  clone: dhCloneSchema.partial().default({}),
  commission: dhCommissionSchema.partial().default({}),
  /** service-desk 站点 siteKey；留空＝不接在线客服。 */
  serviceDeskSiteKey: z.string().trim().max(64).default(""),
  /** 首页 DIY 组件树；空组件列表＝小程序端用默认功能入口布局。 */
  diyPage: dhDiyPageSchema.default({ components: [] }),
  /** true=上线营业（ONLINE），false=下线（DRAFT）。 */
  enabled: z.boolean().default(true),
});
export type DhSettingsInput = z.infer<typeof dhSettingsInputSchema>;

export const dhSettingsViewSchema = z.object({
  siteCode: z.string(),
  siteName: z.string(),
  slogan: z.string(),
  logo: z.string(),
  themeColor: z.string(),
  servicePhone: z.string(),
  status: z.string(),
  brand: dhBrandSchema,
  toggles: z.record(z.string(), z.boolean()),
  pricing: dhPricingSchema,
  gift: dhGiftSchema,
  login: dhLoginSchema,
  clone: dhCloneSchema,
  commission: dhCommissionSchema,
  serviceDeskSiteKey: z.string(),
  diyPage: dhDiyPageSchema,
  updatedAt: z.string(),
});
export type DhSettingsView = z.infer<typeof dhSettingsViewSchema>;

export const dhOverviewSchema = z.object({
  siteCode: z.string(),
  status: z.string(),
  memberCount: z.number(),
  vipCount: z.number(),
  workCount: z.number(),
  taskRunning: z.number(),
  orderCount: z.number(),
  todayOrderCount: z.number(),
  paidAmountCents: z.number(),
  pointConsumed: z.number(),
  cardUnused: z.number(),
  pendingWithdraws: z.number(),
  pendingApplies: z.number(),
  pendingFeedbacks: z.number(),
  /** 四类能力是否都有可用的默认渠道（缺失时首页给配置引导）。 */
  channelsReady: z.record(z.string(), z.boolean()),
  payEnabled: z.boolean(),
});
export type DhOverview = z.infer<typeof dhOverviewSchema>;

// ---------------------------------------------------------------------------
// 模型渠道
// ---------------------------------------------------------------------------

export const dhChannelRowSchema = z.object({
  id: z.number(),
  capability: z.enum(DH_CHANNEL_CAPABILITIES),
  protocol: z.enum(DH_CHANNEL_PROTOCOLS),
  name: z.string(),
  baseUrl: z.string(),
  modelTier: z.string(),
  keyConfigured: z.boolean(),
  secretConfigured: z.boolean(),
  enabled: z.boolean(),
  isDefault: z.boolean(),
  verifiedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type DhChannelRow = z.infer<typeof dhChannelRowSchema>;

export const dhChannelInputSchema = z.object({
  id: z.number().int().positive().optional(),
  capability: z.enum(DH_CHANNEL_CAPABILITIES),
  protocol: z.enum(DH_CHANNEL_PROTOCOLS).default("fox"),
  name: z.string().trim().min(1, "请填写渠道名称").max(64),
  baseUrl: z.string().trim().max(300).default(""),
  /** 留空表示保留原值；传入即覆盖（密文入库，只回是否已配置）。 */
  key: z.string().max(512).optional(),
  /** webhook 回调校验密钥；留空表示保留原值。 */
  secret: z.string().max(512).optional(),
  modelTier: z.string().trim().max(64).default(""),
  enabled: z.boolean().default(true),
  isDefault: z.boolean().default(false),
});
export type DhChannelInput = z.infer<typeof dhChannelInputSchema>;

export const dhChannelTestResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
});
export type DhChannelTestResult = z.infer<typeof dhChannelTestResultSchema>;

// ---------------------------------------------------------------------------
// 会员与资产
// ---------------------------------------------------------------------------

export const dhMemberRowSchema = z.object({
  id: z.number(),
  nickname: z.string(),
  avatar: z.string(),
  phone: z.string(),
  point: z.number(),
  bodyQuota: z.number(),
  voiceQuota: z.number(),
  vipExpireAt: z.string().nullable(),
  isVip: z.boolean(),
  promoterLevel: z.number(),
  commissionBalance: z.number(),
  commissionTotal: z.number(),
  referrerId: z.number(),
  status: z.enum(DH_MEMBER_STATUS),
  workCount: z.number().default(0),
  loginCount: z.number(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});
export type DhMemberRow = z.infer<typeof dhMemberRowSchema>;

export const dhMemberUpdateInputSchema = z.object({
  id: z.number().int().positive(),
  pointDelta: z.number().int().min(-99999).max(99999).optional(),
  bodyDelta: z.number().int().min(-9999).max(9999).optional(),
  voiceDelta: z.number().int().min(-9999).max(9999).optional(),
  /** 正数＝续期天数，负数＝收回天数。 */
  vipDays: z.number().int().min(-3650).max(3650).optional(),
  status: z.enum(["ACTIVE", "FROZEN"]).optional(),
  remark: z.string().trim().max(200).default(""),
});
export type DhMemberUpdateInput = z.infer<typeof dhMemberUpdateInputSchema>;

export const dhBalanceLogRowSchema = z.object({
  id: z.number(),
  memberId: z.number(),
  nickname: z.string(),
  account: z.enum(DH_ACCOUNTS),
  delta: z.number(),
  balanceAfter: z.number(),
  bizType: z.string(),
  isRefund: z.boolean(),
  remark: z.string(),
  createdAt: z.string(),
});
export type DhBalanceLogRow = z.infer<typeof dhBalanceLogRowSchema>;

export const dhBodyRowSchema = z.object({
  id: z.number(),
  memberId: z.number(),
  nickname: z.string(),
  name: z.string(),
  sourceVideoUrl: z.string(),
  coverUrl: z.string(),
  durationSec: z.number(),
  status: z.number(),
  failReason: z.string(),
  createdAt: z.string(),
});
export type DhBodyRow = z.infer<typeof dhBodyRowSchema>;

export const dhVoiceRowSchema = z.object({
  id: z.number(),
  memberId: z.number(),
  nickname: z.string(),
  name: z.string(),
  sampleAudioUrl: z.string(),
  demoAudioUrl: z.string(),
  status: z.number(),
  failReason: z.string(),
  createdAt: z.string(),
});
export type DhVoiceRow = z.infer<typeof dhVoiceRowSchema>;

// ---------------------------------------------------------------------------
// 公共素材库（音色分组/音色、BGM 分组/曲目）
// ---------------------------------------------------------------------------

export const dhVoiceGroupRowSchema = z.object({
  id: z.number(),
  /** 0＝平台全局库（只读），>0＝站点自建。 */
  siteId: z.number(),
  name: z.string(),
  sort: z.number(),
  enabled: z.boolean(),
  voiceCount: z.number().default(0),
});
export type DhVoiceGroupRow = z.infer<typeof dhVoiceGroupRowSchema>;

export const dhVoiceGroupInputSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1, "请填写分组名称").max(60),
  sort: z.number().int().min(0).max(9999).default(0),
  enabled: z.boolean().default(true),
});
export type DhVoiceGroupInput = z.infer<typeof dhVoiceGroupInputSchema>;

export const dhPresetVoiceRowSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  groupId: z.number(),
  name: z.string(),
  speakerId: z.string(),
  gender: z.string(),
  language: z.string(),
  demoUrl: z.string(),
  tags: z.string(),
  sort: z.number(),
  enabled: z.boolean(),
});
export type DhPresetVoiceRow = z.infer<typeof dhPresetVoiceRowSchema>;

export const dhPresetVoiceInputSchema = z.object({
  id: z.number().int().positive().optional(),
  groupId: z.number().int().min(0).default(0),
  name: z.string().trim().min(1, "请填写音色名称").max(60),
  /** 供应商音色标识（TTS 渠道的 voice/speaker id）。 */
  speakerId: z.string().trim().min(1, "请填写供应商音色标识").max(120),
  gender: z.string().trim().max(8).default(""),
  language: z.string().trim().max(16).default("zh"),
  demoUrl: z.string().trim().max(500).default(""),
  tags: z.string().trim().max(120).default(""),
  sort: z.number().int().min(0).max(9999).default(0),
  enabled: z.boolean().default(true),
});
export type DhPresetVoiceInput = z.infer<typeof dhPresetVoiceInputSchema>;

export const dhBgmGroupRowSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  name: z.string(),
  sort: z.number(),
  enabled: z.boolean(),
  bgmCount: z.number().default(0),
});
export type DhBgmGroupRow = z.infer<typeof dhBgmGroupRowSchema>;

export const dhBgmGroupInputSchema = dhVoiceGroupInputSchema;
export type DhBgmGroupInput = z.infer<typeof dhBgmGroupInputSchema>;

export const dhBgmRowSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  groupId: z.number(),
  name: z.string(),
  url: z.string(),
  durationSec: z.number(),
  sort: z.number(),
  enabled: z.boolean(),
});
export type DhBgmRow = z.infer<typeof dhBgmRowSchema>;

export const dhBgmInputSchema = z.object({
  id: z.number().int().positive().optional(),
  groupId: z.number().int().min(0).default(0),
  name: z.string().trim().min(1, "请填写曲目名称").max(80),
  url: z.string().trim().min(1, "请上传或填写音频地址").max(500),
  durationSec: z.number().int().min(0).max(3600).default(0),
  sort: z.number().int().min(0).max(9999).default(0),
  enabled: z.boolean().default(true),
});
export type DhBgmInput = z.infer<typeof dhBgmInputSchema>;

// ---------------------------------------------------------------------------
// 作品与任务
// ---------------------------------------------------------------------------

export const dhWorkRowSchema = z.object({
  id: z.number(),
  memberId: z.number(),
  nickname: z.string(),
  title: z.string(),
  bodyId: z.number(),
  voiceSource: z.string(),
  voiceId: z.number(),
  audioType: z.string(),
  script: z.string(),
  status: z.number(),
  stage: z.string(),
  resultVideoUrl: z.string(),
  audioUrl: z.string(),
  coverUrl: z.string(),
  durationSec: z.number(),
  pointCost: z.number(),
  isRefund: z.boolean(),
  failReason: z.string(),
  playCount: z.number(),
  createdAt: z.string(),
});
export type DhWorkRow = z.infer<typeof dhWorkRowSchema>;

export const dhTaskRowSchema = z.object({
  id: z.number(),
  kind: z.string(),
  refTable: z.string(),
  refId: z.number(),
  protocol: z.string(),
  providerTaskId: z.string(),
  status: z.number(),
  resultUrl: z.string(),
  error: z.string(),
  attempts: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DhTaskRow = z.infer<typeof dhTaskRowSchema>;

// ---------------------------------------------------------------------------
// AI 文案
// ---------------------------------------------------------------------------

export const dhWriteTopicRowSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  kind: z.enum(DH_WRITE_KINDS),
  title: z.string(),
  category: z.string(),
  content: z.string(),
  modelTier: z.string(),
  sort: z.number(),
  enabled: z.boolean(),
  createdAt: z.string(),
});
export type DhWriteTopicRow = z.infer<typeof dhWriteTopicRowSchema>;

export const dhWriteTopicInputSchema = z.object({
  id: z.number().int().positive().optional(),
  kind: z.enum(DH_WRITE_KINDS).default("write_model"),
  title: z.string().trim().min(1, "请填写标题").max(120),
  category: z.string().trim().max(60).default(""),
  /** 写作模板支持 [PROMPT]/[WORDS] 占位符。 */
  content: z.string().max(20000).default(""),
  modelTier: z.string().trim().max(64).default(""),
  sort: z.number().int().min(0).max(9999).default(0),
  enabled: z.boolean().default(true),
});
export type DhWriteTopicInput = z.infer<typeof dhWriteTopicInputSchema>;

export const dhAiRecordRowSchema = z.object({
  id: z.number(),
  memberId: z.number(),
  nickname: z.string(),
  topicId: z.number(),
  prompt: z.string(),
  response: z.string(),
  wordCount: z.number(),
  createdAt: z.string(),
});
export type DhAiRecordRow = z.infer<typeof dhAiRecordRowSchema>;

// ---------------------------------------------------------------------------
// 套餐、订单、卡密
// ---------------------------------------------------------------------------

export const dhPackageRowSchema = z.object({
  id: z.number(),
  type: z.enum(DH_PACKAGE_TYPES),
  name: z.string(),
  priceCents: z.number(),
  originalCents: z.number(),
  vipDays: z.number(),
  point: z.number(),
  bodyQuota: z.number(),
  voiceQuota: z.number(),
  limitNum: z.number(),
  sales: z.number(),
  recommended: z.boolean(),
  sort: z.number(),
  enabled: z.boolean(),
});
export type DhPackageRow = z.infer<typeof dhPackageRowSchema>;

export const dhPackageInputSchema = z.object({
  id: z.number().int().positive().optional(),
  type: z.enum(DH_PACKAGE_TYPES),
  name: z.string().trim().min(1, "请填写套餐名称").max(80),
  priceCents: z.number().int().min(1).max(100000000),
  originalCents: z.number().int().min(0).max(100000000).default(0),
  vipDays: z.number().int().min(0).max(3650).default(0),
  point: z.number().int().min(0).max(999999).default(0),
  bodyQuota: z.number().int().min(0).max(99999).default(0),
  voiceQuota: z.number().int().min(0).max(99999).default(0),
  limitNum: z.number().int().min(0).max(9999).default(0),
  recommended: z.boolean().default(false),
  sort: z.number().int().min(0).max(9999).default(0),
  enabled: z.boolean().default(true),
});
export type DhPackageInput = z.infer<typeof dhPackageInputSchema>;

export const dhOrderRowSchema = z.object({
  id: z.number(),
  orderNo: z.string(),
  memberId: z.number(),
  nickname: z.string(),
  packageId: z.number(),
  packageName: z.string(),
  type: z.string(),
  amountCents: z.number(),
  payType: z.string(),
  status: z.number(),
  transactionId: z.string(),
  paidAt: z.string().nullable(),
  promoterId: z.number(),
  commission1Cents: z.number(),
  commission2Cents: z.number(),
  createdAt: z.string(),
});
export type DhOrderRow = z.infer<typeof dhOrderRowSchema>;

export const dhOrderRefundInputSchema = z.object({
  id: z.number().int().positive(),
  reason: z.string().trim().max(200).default("站点方退款"),
});
export type DhOrderRefundInput = z.infer<typeof dhOrderRefundInputSchema>;

export const dhOrderRefundResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
});
export type DhOrderRefundResult = z.infer<typeof dhOrderRefundResultSchema>;

export const dhCardBatchRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.enum(DH_PACKAGE_TYPES),
  quantity: z.number(),
  usedCount: z.number(),
  vipDays: z.number(),
  point: z.number(),
  bodyQuota: z.number(),
  voiceQuota: z.number(),
  remark: z.string(),
  createdAt: z.string(),
});
export type DhCardBatchRow = z.infer<typeof dhCardBatchRowSchema>;

export const dhCardBatchCreateInputSchema = z.object({
  name: z.string().trim().max(80).default(""),
  type: z.enum(DH_PACKAGE_TYPES),
  quantity: z.number().int().min(1).max(1000),
  vipDays: z.number().int().min(0).max(3650).default(0),
  point: z.number().int().min(0).max(999999).default(0),
  bodyQuota: z.number().int().min(0).max(99999).default(0),
  voiceQuota: z.number().int().min(0).max(99999).default(0),
  remark: z.string().trim().max(200).default(""),
});
export type DhCardBatchCreateInput = z.infer<
  typeof dhCardBatchCreateInputSchema
>;

export const dhCardRowSchema = z.object({
  id: z.number(),
  batchId: z.number(),
  code: z.string(),
  type: z.string(),
  vipDays: z.number(),
  point: z.number(),
  bodyQuota: z.number(),
  voiceQuota: z.number(),
  status: z.string(),
  usedByMemberId: z.number(),
  usedNickname: z.string(),
  usedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type DhCardRow = z.infer<typeof dhCardRowSchema>;

export const dhCardsExportResultSchema = z.object({
  url: z.string(),
  fileName: z.string(),
});
export type DhCardsExportResult = z.infer<typeof dhCardsExportResultSchema>;

// ---------------------------------------------------------------------------
// 内容位（图文/轮播/海报）
// ---------------------------------------------------------------------------

export const dhArticleRowSchema = z.object({
  id: z.number(),
  type: z.string(),
  contentType: z.enum(DH_ARTICLE_CONTENT_TYPES),
  title: z.string(),
  cover: z.string(),
  summary: z.string(),
  body: z.string(),
  link: z.string(),
  sort: z.number(),
  enabled: z.boolean(),
  createdAt: z.string(),
});
export type DhArticleRow = z.infer<typeof dhArticleRowSchema>;

export const dhArticleInputSchema = z.object({
  id: z.number().int().positive().optional(),
  type: z.enum(DH_ARTICLE_TYPES),
  contentType: z.enum(DH_ARTICLE_CONTENT_TYPES).default("article"),
  title: z.string().trim().min(1, "请填写标题").max(120),
  cover: z.string().trim().max(500).default(""),
  summary: z.string().trim().max(300).default(""),
  body: z.string().max(200000).default(""),
  link: z.string().trim().max(500).default(""),
  sort: z.number().int().min(0).max(9999).default(0),
  enabled: z.boolean().default(true),
});
export type DhArticleInput = z.infer<typeof dhArticleInputSchema>;

export const dhSwiperRowSchema = z.object({
  id: z.number(),
  title: z.string(),
  image: z.string(),
  link: z.string(),
  sort: z.number(),
  enabled: z.boolean(),
  createdAt: z.string(),
});
export type DhSwiperRow = z.infer<typeof dhSwiperRowSchema>;

export const dhSwiperInputSchema = z.object({
  id: z.number().int().positive().optional(),
  title: z.string().trim().max(120).default(""),
  image: z.string().trim().min(1, "请上传轮播图片").max(500),
  /** article:<id> | work:<id> | url:<https> | page:<path> | none */
  link: z.string().trim().max(500).default("none"),
  sort: z.number().int().min(0).max(9999).default(0),
  enabled: z.boolean().default(true),
});
export type DhSwiperInput = z.infer<typeof dhSwiperInputSchema>;

export const dhPosterRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  bgUrl: z.string(),
  avatarX: z.number(),
  avatarY: z.number(),
  avatarSize: z.number(),
  qrX: z.number(),
  qrY: z.number(),
  qrSize: z.number(),
  sort: z.number(),
  enabled: z.boolean(),
});
export type DhPosterRow = z.infer<typeof dhPosterRowSchema>;

export const dhPosterInputSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().max(80).default(""),
  bgUrl: z.string().trim().min(1, "请上传海报背景图").max(500),
  avatarX: z.number().int().min(0).max(2000).default(0),
  avatarY: z.number().int().min(0).max(4000).default(0),
  avatarSize: z.number().int().min(0).max(2000).default(120),
  qrX: z.number().int().min(0).max(2000).default(0),
  qrY: z.number().int().min(0).max(4000).default(0),
  qrSize: z.number().int().min(0).max(2000).default(180),
  sort: z.number().int().min(0).max(9999).default(0),
  enabled: z.boolean().default(true),
});
export type DhPosterInput = z.infer<typeof dhPosterInputSchema>;

// ---------------------------------------------------------------------------
// 分销与反馈
// ---------------------------------------------------------------------------

export const dhPromoterApplyRowSchema = z.object({
  id: z.number(),
  memberId: z.number(),
  nickname: z.string(),
  avatar: z.string(),
  joinType: z.enum(DH_JOIN_TYPES),
  status: z.number(),
  orderId: z.number(),
  reason: z.string(),
  adminRemark: z.string(),
  appliedAt: z.string(),
  reviewedAt: z.string().nullable(),
});
export type DhPromoterApplyRow = z.infer<typeof dhPromoterApplyRowSchema>;

export const dhAuditInputSchema = z.object({
  id: z.number().int().positive(),
  pass: z.boolean(),
  remark: z.string().trim().max(200).default(""),
});
export type DhAuditInput = z.infer<typeof dhAuditInputSchema>;

export const dhCommissionRowSchema = z.object({
  id: z.number(),
  memberId: z.number(),
  nickname: z.string(),
  fromMemberId: z.number(),
  fromNickname: z.string(),
  orderId: z.number(),
  level: z.number(),
  type: z.number(),
  amountCents: z.number(),
  rate: z.number(),
  balanceAfter: z.number(),
  remark: z.string(),
  createdAt: z.string(),
});
export type DhCommissionRow = z.infer<typeof dhCommissionRowSchema>;

export const dhWithdrawRowSchema = z.object({
  id: z.number(),
  memberId: z.number(),
  nickname: z.string(),
  amountCents: z.number(),
  method: z.enum(DH_WITHDRAW_METHODS),
  accountName: z.string(),
  accountNo: z.string(),
  bankName: z.string(),
  qrUrl: z.string(),
  status: z.number(),
  adminRemark: z.string(),
  createdAt: z.string(),
  processedAt: z.string().nullable(),
});
export type DhWithdrawRow = z.infer<typeof dhWithdrawRowSchema>;

export const dhFeedbackRowSchema = z.object({
  id: z.number(),
  memberId: z.number(),
  nickname: z.string(),
  content: z.string(),
  contact: z.string(),
  images: z.array(z.string()),
  status: z.string(),
  reply: z.string(),
  createdAt: z.string(),
});
export type DhFeedbackRow = z.infer<typeof dhFeedbackRowSchema>;

// ---------------------------------------------------------------------------
// 发布（复用 private-mini 底座）
// ---------------------------------------------------------------------------

/** 主体凭据保存：直传 private-mini 输入（appId/secret/上传密钥/商户号/支付证书）。 */
export const dhAppSaveBodySchema = miniAppInputSchema;
export type DhAppSaveBody = z.infer<typeof dhAppSaveBodySchema>;

export const dhAppTestResultSchema = miniAppTestResultSchema.extend({
  payConfigured: z.boolean().default(false),
});
export type DhAppTestResult = z.infer<typeof dhAppTestResultSchema>;

export const dhQrcodeResultSchema = z.object({
  qrcodeUrl: z.string(),
  message: z.string().default(""),
});
export type DhQrcodeResult = z.infer<typeof dhQrcodeResultSchema>;

// ---------------------------------------------------------------------------
// 端点（前缀 Dh_ = 用户侧「数字人小程序工具」；鉴权会话内可用）
// ---------------------------------------------------------------------------

export const digitalHumanEndpoints = {
  // 站点
  Dh_overview: get("/enterprise/digital-human/overview", emptyQuery, dhOverviewSchema),
  Dh_settings: get("/enterprise/digital-human/settings", emptyQuery, dhSettingsViewSchema),
  Dh_settingsSave: post("/enterprise/digital-human/settings", dhSettingsInputSchema, dhSettingsViewSchema),
  Dh_miniApp: get("/enterprise/digital-human/mini-app", emptyQuery, miniAppViewSchema),
  Dh_miniAppSave: post("/enterprise/digital-human/mini-app", dhAppSaveBodySchema, miniAppViewSchema),
  Dh_miniAppTest: post("/enterprise/digital-human/mini-app/test", z.undefined(), dhAppTestResultSchema),

  // 模型渠道
  Dh_channelsList: get("/enterprise/digital-human/channels", pageQuery({ capability: z.enum(DH_CHANNEL_CAPABILITIES).optional() }), z.array(dhChannelRowSchema)),
  Dh_channelSave: post("/enterprise/digital-human/channels/save", dhChannelInputSchema, dhChannelRowSchema),
  Dh_channelRemove: post("/enterprise/digital-human/channels/remove", idBody({}), z.object({ ok: z.boolean() })),
  Dh_channelTest: post("/enterprise/digital-human/channels/test", idBody({}), dhChannelTestResultSchema),

  // 会员与资产
  Dh_membersList: get("/enterprise/digital-human/members", pageQuery({ keyword: z.string().trim().max(40).optional(), vipOnly: z.coerce.boolean().optional(), promoterOnly: z.coerce.boolean().optional(), status: z.enum(DH_MEMBER_STATUS).optional() }), pageOf(dhMemberRowSchema)),
  Dh_memberUpdate: post("/enterprise/digital-human/members/update", dhMemberUpdateInputSchema, dhMemberRowSchema),
  Dh_balanceLogs: get("/enterprise/digital-human/balance-logs", pageQuery({ memberId: z.coerce.number().int().positive().optional(), account: z.enum(DH_ACCOUNTS).optional() }), pageOf(dhBalanceLogRowSchema)),
  Dh_bodiesList: get("/enterprise/digital-human/bodies", pageQuery({ memberId: z.coerce.number().int().positive().optional(), status: z.coerce.number().int().min(0).max(2).optional() }), pageOf(dhBodyRowSchema)),
  Dh_bodyRemove: post("/enterprise/digital-human/bodies/remove", idBody({}), z.object({ ok: z.boolean() })),
  Dh_voicesList: get("/enterprise/digital-human/voices", pageQuery({ memberId: z.coerce.number().int().positive().optional(), status: z.coerce.number().int().min(0).max(2).optional() }), pageOf(dhVoiceRowSchema)),
  Dh_voiceRemove: post("/enterprise/digital-human/voices/remove", idBody({}), z.object({ ok: z.boolean() })),

  // 公共素材库
  Dh_voiceGroupsList: get("/enterprise/digital-human/voice-groups", emptyQuery, z.array(dhVoiceGroupRowSchema)),
  Dh_voiceGroupSave: post("/enterprise/digital-human/voice-groups/save", dhVoiceGroupInputSchema, dhVoiceGroupRowSchema),
  Dh_voiceGroupRemove: post("/enterprise/digital-human/voice-groups/remove", idBody({}), z.object({ ok: z.boolean() })),
  Dh_presetVoicesList: get("/enterprise/digital-human/preset-voices", z.object({ groupId: z.coerce.number().int().min(0).optional() }), z.array(dhPresetVoiceRowSchema)),
  Dh_presetVoiceSave: post("/enterprise/digital-human/preset-voices/save", dhPresetVoiceInputSchema, dhPresetVoiceRowSchema),
  Dh_presetVoiceRemove: post("/enterprise/digital-human/preset-voices/remove", idBody({}), z.object({ ok: z.boolean() })),
  Dh_bgmGroupsList: get("/enterprise/digital-human/bgm-groups", emptyQuery, z.array(dhBgmGroupRowSchema)),
  Dh_bgmGroupSave: post("/enterprise/digital-human/bgm-groups/save", dhBgmGroupInputSchema, dhBgmGroupRowSchema),
  Dh_bgmGroupRemove: post("/enterprise/digital-human/bgm-groups/remove", idBody({}), z.object({ ok: z.boolean() })),
  Dh_bgmsList: get("/enterprise/digital-human/bgms", z.object({ groupId: z.coerce.number().int().min(0).optional() }), z.array(dhBgmRowSchema)),
  Dh_bgmSave: post("/enterprise/digital-human/bgms/save", dhBgmInputSchema, dhBgmRowSchema),
  Dh_bgmRemove: post("/enterprise/digital-human/bgms/remove", idBody({}), z.object({ ok: z.boolean() })),

  // 作品与任务
  Dh_worksList: get("/enterprise/digital-human/works", pageQuery({ status: z.coerce.number().int().min(0).max(2).optional(), memberId: z.coerce.number().int().positive().optional(), keyword: z.string().trim().max(40).optional() }), pageOf(dhWorkRowSchema)),
  Dh_workRemove: post("/enterprise/digital-human/works/remove", idBody({}), z.object({ ok: z.boolean() })),
  Dh_tasksList: get("/enterprise/digital-human/tasks", pageQuery({ kind: z.string().trim().max(16).optional(), status: z.coerce.number().int().min(0).max(3).optional() }), pageOf(dhTaskRowSchema)),
  Dh_taskRetry: post("/enterprise/digital-human/tasks/retry", idBody({}), z.object({ ok: z.boolean(), message: z.string() })),

  // AI 文案
  Dh_writeTopicsList: get("/enterprise/digital-human/write-topics", z.object({ kind: z.enum(DH_WRITE_KINDS).optional() }), z.array(dhWriteTopicRowSchema)),
  Dh_writeTopicSave: post("/enterprise/digital-human/write-topics/save", dhWriteTopicInputSchema, dhWriteTopicRowSchema),
  Dh_writeTopicRemove: post("/enterprise/digital-human/write-topics/remove", idBody({}), z.object({ ok: z.boolean() })),
  Dh_aiRecordsList: get("/enterprise/digital-human/ai-records", pageQuery({ memberId: z.coerce.number().int().positive().optional() }), pageOf(dhAiRecordRowSchema)),

  // 套餐与订单
  Dh_packagesList: get("/enterprise/digital-human/packages", z.object({ type: z.enum(DH_PACKAGE_TYPES).optional() }), z.array(dhPackageRowSchema)),
  Dh_packageSave: post("/enterprise/digital-human/packages/save", dhPackageInputSchema, dhPackageRowSchema),
  Dh_packageRemove: post("/enterprise/digital-human/packages/remove", idBody({}), z.object({ ok: z.boolean() })),
  Dh_ordersList: get("/enterprise/digital-human/orders", pageQuery({ status: z.coerce.number().int().min(0).max(3).optional(), type: z.enum(DH_PACKAGE_TYPES).optional(), keyword: z.string().trim().max(40).optional() }), pageOf(dhOrderRowSchema)),
  Dh_orderRefund: post("/enterprise/digital-human/orders/refund", dhOrderRefundInputSchema, dhOrderRefundResultSchema),

  // 卡密
  Dh_cardBatchesList: get("/enterprise/digital-human/card-batches", pageQuery({}), pageOf(dhCardBatchRowSchema)),
  Dh_cardBatchCreate: post("/enterprise/digital-human/card-batches/create", dhCardBatchCreateInputSchema, dhCardBatchRowSchema),
  Dh_cardsList: get("/enterprise/digital-human/cards", pageQuery({ batchId: z.coerce.number().int().positive().optional(), status: z.string().trim().max(16).optional(), keyword: z.string().trim().max(40).optional() }), pageOf(dhCardRowSchema)),
  Dh_cardDisable: post("/enterprise/digital-human/cards/disable", idBody({}), z.object({ ok: z.boolean() })),
  Dh_cardsExport: get("/enterprise/digital-human/cards/export", z.object({ batchId: z.coerce.number().int().positive().optional() }), dhCardsExportResultSchema),

  // 内容位
  Dh_articlesList: get("/enterprise/digital-human/articles", pageQuery({ type: z.enum(DH_ARTICLE_TYPES).optional() }), pageOf(dhArticleRowSchema)),
  Dh_articleSave: post("/enterprise/digital-human/articles/save", dhArticleInputSchema, dhArticleRowSchema),
  Dh_articleRemove: post("/enterprise/digital-human/articles/remove", idBody({}), z.object({ ok: z.boolean() })),
  Dh_swipersList: get("/enterprise/digital-human/swipers", emptyQuery, z.array(dhSwiperRowSchema)),
  Dh_swiperSave: post("/enterprise/digital-human/swipers/save", dhSwiperInputSchema, dhSwiperRowSchema),
  Dh_swiperRemove: post("/enterprise/digital-human/swipers/remove", idBody({}), z.object({ ok: z.boolean() })),
  Dh_postersList: get("/enterprise/digital-human/posters", emptyQuery, z.array(dhPosterRowSchema)),
  Dh_posterSave: post("/enterprise/digital-human/posters/save", dhPosterInputSchema, dhPosterRowSchema),
  Dh_posterRemove: post("/enterprise/digital-human/posters/remove", idBody({}), z.object({ ok: z.boolean() })),

  // 分销与反馈
  Dh_promoterAppliesList: get("/enterprise/digital-human/promoter-applies", pageQuery({ status: z.coerce.number().int().min(0).max(2).optional() }), pageOf(dhPromoterApplyRowSchema)),
  Dh_promoterApplyAudit: post("/enterprise/digital-human/promoter-applies/audit", dhAuditInputSchema, dhPromoterApplyRowSchema),
  Dh_commissionsList: get("/enterprise/digital-human/commissions", pageQuery({ memberId: z.coerce.number().int().positive().optional(), type: z.coerce.number().int().min(1).max(4).optional() }), pageOf(dhCommissionRowSchema)),
  Dh_withdrawsList: get("/enterprise/digital-human/withdraws", pageQuery({ status: z.coerce.number().int().min(0).max(2).optional(), memberId: z.coerce.number().int().positive().optional() }), pageOf(dhWithdrawRowSchema)),
  Dh_withdrawAudit: post("/enterprise/digital-human/withdraws/audit", dhAuditInputSchema, dhWithdrawRowSchema),
  Dh_feedbacksList: get("/enterprise/digital-human/feedbacks", pageQuery({ status: z.string().trim().max(16).optional() }), pageOf(dhFeedbackRowSchema)),
  Dh_feedbackReply: post("/enterprise/digital-human/feedbacks/reply", idBody({ reply: z.string().trim().min(1, "请填写回复").max(2000) }), dhFeedbackRowSchema),

  // 小程序码
  Dh_releaseQrcode: get("/enterprise/digital-human/release/qrcode", emptyQuery, dhQrcodeResultSchema),
};
export type DigitalHumanEndpoints = typeof digitalHumanEndpoints;
