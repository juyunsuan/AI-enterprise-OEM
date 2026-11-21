import { z } from "zod";
import { pageQuerySchema } from "./pagination";
import {
  PRIVATE_MINI_SCENES,
  miniAppInputSchema,
  miniAppTestResultSchema,
  miniAppViewSchema,
} from "./private-mini";

const envelope = <T extends z.ZodType>(data: T) =>
  z.object({ code: z.number(), message: z.string(), data: data.nullable() });
const emptyQuery = z.object({});

/**
 * 工作台 · 建站管理 · 健康管理小程序工具。
 *
 * 每个本站用户可开一部自己的健康管理小程序：机构与医护自助入驻、号源排班与挂号、
 * 图文/电话/视频问诊、健康档案与指标监测、慢病随访与量表、用药与处方建议、体检与
 * 报告解读、药品器械实物商城、会员卡/券/积分、统一订单与微信支付、分账收益与提现
 * 台账、科普与病友社区，顾客端与医护工作台端在同一部小程序内按身份切页。
 *
 * 三条硬口径：
 * 1. 出包与发布全部走私域底座（`private-mini`，`scene='HEALTH'`），本域不写第二套
 *    凭据表与发布表；提审发布仍在用户自己的微信公众平台完成。
 * 2. **所有文字沟通与在线客服复用平台 AI客服（service-desk）**：问诊单只保存会话标识
 *    与状态机，本域没有任何聊天表；电话/视频问诊做成预约单 + 到点订阅消息，不建房间。
 * 3. 与上门服务 / 电商 / 知识付费等板块**互不影响**：表只写 `health_*`，路由只走
 *    `/enterprise/health/**` 与 `/api/public/health/**`，积分与余额是店内账、不外兑。
 *
 * C 端顾客与医护免登录通道只走 `/api/public/health/*`（独立顾客令牌，与站内 User
 * 物理隔离），不进 JSON 契约与 OpenAPI。业务口径见
 * docs/建站管理·健康管理小程序工具设计方案.md；参考源码只用于确定语义，代码全部重写。
 */

/** HEALTH 场景常量：与底座 `PRIVATE_MINI_SCENES` 对齐，编译期就挡住拼错。 */
export const HEALTH_MINI_SCENE = "HEALTH" satisfies (typeof PRIVATE_MINI_SCENES)[number];

// ============================================================================
// 一、状态与枚举
// ============================================================================

/** 店铺状态：草稿 → 营业中；SUSPENDED 为平台停服（数据保留）。 */
export const HEALTH_SHOP_STATUSES = ["DRAFT", "ONLINE", "SUSPENDED", "CLOSED"] as const;
export type HealthShopStatus = (typeof HEALTH_SHOP_STATUSES)[number];
export const HEALTH_SHOP_STATUS_LABELS: Record<string, string> = {
  DRAFT: "未上线",
  ONLINE: "营业中",
  SUSPENDED: "平台停服",
  CLOSED: "已关闭",
};

/** 店内角色（店主在「人员与权限」里给本站账号分的岗位面）。 */
export const HEALTH_STAFF_ROLES = [
  "OWNER",
  "OPERATION",
  "MEDICAL",
  "PHARMACY",
  "FINANCE",
] as const;
export type HealthStaffRole = (typeof HEALTH_STAFF_ROLES)[number];
export const HEALTH_STAFF_ROLE_LABELS: Record<string, string> = {
  OWNER: "店主",
  OPERATION: "运营",
  MEDICAL: "医疗管理",
  PHARMACY: "药师",
  FINANCE: "财务",
};

/** 医护身份：执业医生、健康管理师、药师、导诊师。 */
export const HEALTH_PRACTITIONER_ROLES = [
  "DOCTOR",
  "MANAGER",
  "PHARMACIST",
  "GUIDE",
] as const;
export type HealthPractitionerRole = (typeof HEALTH_PRACTITIONER_ROLES)[number];
export const HEALTH_PRACTITIONER_ROLE_LABELS: Record<string, string> = {
  DOCTOR: "执业医师",
  MANAGER: "健康管理师",
  PHARMACIST: "药师",
  GUIDE: "导诊师",
};

/** 入驻与认证审核态（机构、医护、内容、评价共用一套语义）。 */
export const HEALTH_AUDIT_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "OFFLINE",
] as const;
export type HealthAuditStatus = (typeof HEALTH_AUDIT_STATUSES)[number];
export const HEALTH_AUDIT_STATUS_LABELS: Record<string, string> = {
  PENDING: "待审核",
  APPROVED: "已通过",
  REJECTED: "已驳回",
  OFFLINE: "已下架",
};

/** 通用启用态。 */
export const HEALTH_ON_STATUSES = ["ON", "OFF"] as const;

/** 订单业务类型：一部小程序里所有付款都进同一张订单表，靠它分流履约。 */
export const HEALTH_ORDER_BIZ_TYPES = [
  "REGISTER",
  "CONSULT_TEXT",
  "CONSULT_PHONE",
  "CONSULT_VIDEO",
  "EXAM",
  "GOODS",
  "SIGN_PKG",
  "YEAR_CARD",
  "MEMBER_CARD",
  "GREEN",
  "CONCIERGE",
  "REPORT_READ",
  "GUIDANCE",
  "RECHARGE",
] as const;
export type HealthOrderBizType = (typeof HEALTH_ORDER_BIZ_TYPES)[number];
export const HEALTH_ORDER_BIZ_TYPE_LABELS: Record<string, string> = {
  REGISTER: "挂号预约",
  CONSULT_TEXT: "图文问诊",
  CONSULT_PHONE: "电话问诊",
  CONSULT_VIDEO: "视频问诊",
  EXAM: "体检套餐",
  GOODS: "商品订单",
  SIGN_PKG: "家医签约",
  YEAR_CARD: "医生年卡",
  MEMBER_CARD: "会员卡",
  GREEN: "绿通/手术快约",
  CONCIERGE: "私人医生",
  REPORT_READ: "报告解读",
  GUIDANCE: "快速导诊",
  RECHARGE: "余额充值",
};

/** 统一订单状态机（`health.order.rules.ts` 是唯一实现点，非法转换必须拒绝）。 */
export const HEALTH_ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "PAID",
  "ACCEPTED",
  "ASSIGNED",
  "SERVING",
  "DELIVERED",
  "COMPLETED",
  "VERIFIED",
  "REVIEWED",
  "CANCELLED",
  "EXPIRED",
  "REFUND_PENDING",
  "REFUNDED",
  "AFTER_SALE_PENDING",
  "AFTER_SALE_DONE",
] as const;
export type HealthOrderStatus = (typeof HEALTH_ORDER_STATUSES)[number];
export const HEALTH_ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "待付款",
  PAID: "已付款待接单",
  ACCEPTED: "已接单",
  ASSIGNED: "已派单",
  SERVING: "服务中",
  DELIVERED: "已发货",
  COMPLETED: "已完成",
  VERIFIED: "已核销",
  REVIEWED: "已评价",
  CANCELLED: "已取消",
  EXPIRED: "已超时",
  REFUND_PENDING: "退款中",
  REFUNDED: "已退款",
  AFTER_SALE_PENDING: "售后处理中",
  AFTER_SALE_DONE: "售后完成",
};

export const HEALTH_PAY_STATUSES = ["UNPAID", "PAID", "REFUNDING", "REFUNDED"] as const;
export type HealthPayStatus = (typeof HEALTH_PAY_STATUSES)[number];
export const HEALTH_PAY_STATUS_LABELS: Record<string, string> = {
  UNPAID: "未支付",
  PAID: "已支付",
  REFUNDING: "退款中",
  REFUNDED: "已退款",
};

/** 问诊单状态（文字沟通在 AI客服会话里，这里只记接单与履约）。 */
export const HEALTH_CONSULT_STATUSES = [
  "PENDING_PAYMENT",
  "WAIT_ACCEPT",
  "IN_SESSION",
  "PRACTITIONER_REPLIED",
  "CUSTOMER_DONE",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
] as const;
export type HealthConsultStatus = (typeof HEALTH_CONSULT_STATUSES)[number];
export const HEALTH_CONSULT_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "待付款",
  WAIT_ACCEPT: "待接单",
  IN_SESSION: "沟通中",
  PRACTITIONER_REPLIED: "医护已答复",
  CUSTOMER_DONE: "顾客已结单",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  REFUNDED: "已退款",
};

/** 号源类型：门诊号、体检位、上门服务位（绿通另走工单）。 */
export const HEALTH_SLOT_KINDS = ["OUTPATIENT", "EXAM", "HOME"] as const;
export type HealthSlotKind = (typeof HEALTH_SLOT_KINDS)[number];
export const HEALTH_SLOT_KIND_LABELS: Record<string, string> = {
  OUTPATIENT: "门诊号源",
  EXAM: "体检位",
  HOME: "上门位",
};

/** 随访任务：来源、方式与状态。 */
export const HEALTH_FOLLOWUP_SOURCES = ["PLAN", "MANUAL", "SURVEY"] as const;
export const HEALTH_FOLLOWUP_WAYS = ["PHONE", "TEXT", "OUTPATIENT", "SELF_FILL"] as const;
export type HealthFollowupWay = (typeof HEALTH_FOLLOWUP_WAYS)[number];
export const HEALTH_FOLLOWUP_WAY_LABELS: Record<string, string> = {
  PHONE: "电话随访",
  TEXT: "文字随访（AI客服会话）",
  OUTPATIENT: "门诊随访",
  SELF_FILL: "居家自填",
};
export const HEALTH_FOLLOWUP_STATUSES = [
  "PENDING",
  "DONE",
  "SKIPPED",
  "OVERDUE",
  "CANCELLED",
] as const;
export type HealthFollowupStatus = (typeof HEALTH_FOLLOWUP_STATUSES)[number];
export const HEALTH_FOLLOWUP_STATUS_LABELS: Record<string, string> = {
  PENDING: "待随访",
  DONE: "已完成",
  SKIPPED: "已跳过",
  OVERDUE: "已逾期",
  CANCELLED: "已取消",
};

/** 指标预警规则类型与预警事件状态。 */
export const HEALTH_ALERT_RULE_TYPES = [
  "ABSOLUTE",
  "BASELINE_DELTA",
  "CONSECUTIVE",
  "PERIOD_LIMIT",
] as const;
export type HealthAlertRuleType = (typeof HEALTH_ALERT_RULE_TYPES)[number];
export const HEALTH_ALERT_RULE_TYPE_LABELS: Record<string, string> = {
  ABSOLUTE: "超出目标区间",
  BASELINE_DELTA: "相对基线偏移",
  CONSECUTIVE: "连续 N 次同向",
  PERIOD_LIMIT: "时段累计超限",
};
export const HEALTH_ALERT_STATUSES = ["OPEN", "ACKED", "RESOLVED", "FALSE"] as const;
export type HealthAlertStatus = (typeof HEALTH_ALERT_STATUSES)[number];
export const HEALTH_ALERT_STATUS_LABELS: Record<string, string> = {
  OPEN: "待处理",
  ACKED: "处理中",
  RESOLVED: "已闭环",
  FALSE: "误报",
};

/** 处方状态：医师开具 → 药师审核 → 调配/作废。 */
export const HEALTH_PRESCRIPTION_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "PHARMACY_APPROVED",
  "PHARMACY_REJECTED",
  "DISPENSED",
  "EXPIRED",
  "REVOKED",
] as const;
export type HealthPrescriptionStatus =
  (typeof HEALTH_PRESCRIPTION_STATUSES)[number];
export const HEALTH_PRESCRIPTION_STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  SUBMITTED: "待药师审核",
  PHARMACY_APPROVED: "审核通过",
  PHARMACY_REJECTED: "审核驳回",
  DISPENSED: "已调配",
  EXPIRED: "已过期",
  REVOKED: "已作废",
};

/** 售后类型与状态。 */
export const HEALTH_AFTERSALE_KINDS = ["REFUND_ONLY", "RETURN_REFUND", "EXCHANGE"] as const;
export type HealthAftersaleKind = (typeof HEALTH_AFTERSALE_KINDS)[number];
export const HEALTH_AFTERSALE_KIND_LABELS: Record<string, string> = {
  REFUND_ONLY: "仅退款",
  RETURN_REFUND: "退货退款",
  EXCHANGE: "换货",
};
export const HEALTH_AFTERSALE_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "RETURNED",
  "DONE",
  "CLOSED",
] as const;
export type HealthAftersaleStatus = (typeof HEALTH_AFTERSALE_STATUSES)[number];
export const HEALTH_AFTERSALE_STATUS_LABELS: Record<string, string> = {
  PENDING: "待处理",
  APPROVED: "已同意",
  REJECTED: "已驳回",
  RETURNED: "买家已寄回",
  DONE: "已完成",
  CLOSED: "已关闭",
};

/** 提现台账状态：线上只做申请与审批留痕，打款由店主线下完成。 */
export const HEALTH_WITHDRAWAL_STATUSES = [
  "PENDING",
  "APPROVED",
  "PAID",
  "REJECTED",
  "CANCELLED",
] as const;
export type HealthWithdrawalStatus = (typeof HEALTH_WITHDRAWAL_STATUSES)[number];
export const HEALTH_WITHDRAWAL_STATUS_LABELS: Record<string, string> = {
  PENDING: "待审核",
  APPROVED: "待打款",
  PAID: "已打款",
  REJECTED: "已驳回",
  CANCELLED: "已撤销",
};

/** 收益归属方。 */
export const HEALTH_EARNER_KINDS = ["SHOP", "ORGAN", "PRACTITIONER", "PROMOTER", "TEAM"] as const;
export type HealthEarnerKind = (typeof HEALTH_EARNER_KINDS)[number];
export const HEALTH_EARNER_KIND_LABELS: Record<string, string> = {
  SHOP: "店铺",
  ORGAN: "入驻机构",
  PRACTITIONER: "医护个人",
  PROMOTER: "推客",
  TEAM: "服务团队",
};

/** 券、积分、卡等营销物件的状态。 */
export const HEALTH_COUPON_KINDS = ["FULL_REDUCE", "DISCOUNT", "CASH", "SPECIFIED"] as const;
export type HealthCouponKind = (typeof HEALTH_COUPON_KINDS)[number];
export const HEALTH_COUPON_KIND_LABELS: Record<string, string> = {
  FULL_REDUCE: "满减券",
  DISCOUNT: "折扣券",
  CASH: "代金券",
  SPECIFIED: "指定商品券",
};
export const HEALTH_COUPON_TICKET_STATUSES = ["UNUSED", "USED", "EXPIRED"] as const;
export const HEALTH_MEMBER_GRANT_STATUSES = ["UNUSED", "BINDING", "USED_UP", "EXPIRED", "REVOKED"] as const;
export type HealthMemberGrantStatus = (typeof HEALTH_MEMBER_GRANT_STATUSES)[number];
export const HEALTH_MEMBER_GRANT_STATUS_LABELS: Record<string, string> = {
  UNUSED: "未激活",
  BINDING: "已绑定生效",
  USED_UP: "权益用尽",
  EXPIRED: "已过期",
  REVOKED: "已收回",
};

/** 签约服务包适用人群（家医签约的人群分类）。 */
export const HEALTH_CROWD_KINDS = [
  "ALL",
  "ELDERLY",
  "HYPERTENSION",
  "DIABETES",
  "MATERNAL",
  "CHILD",
  "POST_OPERATION",
  "CHRONIC_OTHER",
] as const;
export type HealthCrowdKind = (typeof HEALTH_CROWD_KINDS)[number];
export const HEALTH_CROWD_KIND_LABELS: Record<string, string> = {
  ALL: "全部人群",
  ELDERLY: "老年人",
  HYPERTENSION: "高血压",
  DIABETES: "糖尿病",
  MATERNAL: "孕产妇",
  CHILD: "儿童",
  POST_OPERATION: "术后",
  CHRONIC_OTHER: "其他慢病",
};

/** 档案条目分型（既往史/过敏史/家族史/生活方式/症状）。 */
export const HEALTH_RECORD_ITEM_TYPES = [
  "PAST",
  "ALLERGY",
  "FAMILY",
  "LIFESTYLE",
  "SYMPTOM",
  "IMMUNE",
] as const;
export type HealthRecordItemType = (typeof HEALTH_RECORD_ITEM_TYPES)[number];
export const HEALTH_RECORD_ITEM_TYPE_LABELS: Record<string, string> = {
  PAST: "既往史",
  ALLERGY: "过敏史",
  FAMILY: "家族史",
  LIFESTYLE: "生活方式",
  SYMPTOM: "症状",
  IMMUNE: "接种史",
};

/** 内容形态与来源。 */
export const HEALTH_CONTENT_KINDS = ["ARTICLE", "VIDEO", "AUDIO", "LIVE"] as const;
export type HealthContentKind = (typeof HEALTH_CONTENT_KINDS)[number];
export const HEALTH_CONTENT_KIND_LABELS: Record<string, string> = {
  ARTICLE: "图文",
  VIDEO: "视频",
  AUDIO: "音频",
  LIVE: "直播回放",
};
export const HEALTH_AUTHOR_KINDS = ["SHOP", "ORGAN", "PRACTITIONER", "TEAM", "CUSTOMER"] as const;
export type HealthAuthorKind = (typeof HEALTH_AUTHOR_KINDS)[number];
export const HEALTH_AUTHOR_KIND_LABELS: Record<string, string> = {
  SHOP: "店铺官方",
  ORGAN: "入驻机构",
  PRACTITIONER: "医护",
  TEAM: "团队",
  CUSTOMER: "顾客",
};

/** 就诊人来源与关系。 */
export const HEALTH_PATIENT_RELATIONS = ["SELF", "SPOUSE", "CHILD", "PARENT", "OTHER"] as const;
export type HealthPatientRelation = (typeof HEALTH_PATIENT_RELATIONS)[number];
export const HEALTH_PATIENT_RELATION_LABELS: Record<string, string> = {
  SELF: "本人",
  SPOUSE: "配偶",
  CHILD: "子女",
  PARENT: "父母",
  OTHER: "其他",
};

/** 绿通/手术快约工单状态。 */
export const HEALTH_GREEN_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "MATCHING",
  "BOOKED",
  "DONE",
  "REJECTED",
] as const;
export type HealthGreenStatus = (typeof HEALTH_GREEN_STATUSES)[number];
export const HEALTH_GREEN_STATUS_LABELS: Record<string, string> = {
  PENDING: "待受理",
  ACCEPTED: "已受理",
  MATCHING: "匹配医院中",
  BOOKED: "已约到",
  DONE: "已完成",
  REJECTED: "已退单",
};

/** 群发触达渠道与状态。 */
export const HEALTH_BROADCAST_CHANNELS = ["SUBSCRIBE", "IN_APP"] as const;
export type HealthBroadcastChannel = (typeof HEALTH_BROADCAST_CHANNELS)[number];
export const HEALTH_BROADCAST_CHANNELS_LABELS: Record<string, string> = {
  SUBSCRIBE: "微信订阅消息",
  IN_APP: "站内消息",
};
export const HEALTH_BROADCAST_STATUSES = ["DRAFT", "SENT", "FAILED", "CANCELLED"] as const;

/** 装修组件键：首期支持的板块（超出即视为未实现，前端不渲染空壳）。 */
export const HEALTH_DIY_BLOCKS = [
  "search",
  "banner",
  "notice",
  "quickEntries",
  "serviceGrid",
  "recommendPractitioners",
  "recommendGoods",
  "articles",
  "metricsCard",
  "followupCard",
  "memberCard",
  "questionWall",
] as const;
export type HealthDiyBlock = (typeof HEALTH_DIY_BLOCKS)[number];
export const HEALTH_DIY_BLOCK_LABELS: Record<string, string> = {
  search: "搜索与热词",
  banner: "轮播广告位",
  notice: "公告",
  quickEntries: "快捷入口",
  serviceGrid: "服务分类宫格",
  recommendPractitioners: "推荐医护",
  recommendGoods: "推荐商品",
  articles: "科普内容",
  metricsCard: "健康指标卡",
  followupCard: "待随访卡",
  memberCard: "会员卡与权益",
  questionWall: "公开问答墙",
};

/** 「全部服务」入口键：关掉即端上不出这个入口（能力开关，不是删除数据）。 */
export const HEALTH_SERVICE_ENTRY_KEYS = [
  "register",
  "consultText",
  "consultPhone",
  "consultVideo",
  "exam",
  "guidance",
  "green",
  "concierge",
  "reportRead",
  "signPkg",
  "yearCard",
  "goods",
  "metrics",
  "followup",
  "medication",
  "articles",
  "question",
  "community",
  "member",
  "coupon",
  "wallet",
  "serviceDesk",
  "tongue",
] as const;
export type HealthServiceEntryKey = (typeof HEALTH_SERVICE_ENTRY_KEYS)[number];
export const HEALTH_SERVICE_ENTRY_LABELS: Record<string, string> = {
  register: "预约挂号",
  consultText: "图文问诊",
  consultPhone: "电话问诊",
  consultVideo: "视频问诊",
  exam: "体检套餐",
  guidance: "快速导诊",
  green: "绿通/手术快约",
  concierge: "私人医生",
  reportRead: "报告解读",
  signPkg: "家庭医生签约",
  yearCard: "医生年卡",
  goods: "医药商城",
  metrics: "指标监测",
  followup: "慢病随访",
  medication: "用药管理",
  articles: "健康科普",
  question: "公开问答",
  community: "病友圈",
  member: "会员卡",
  coupon: "优惠券",
  wallet: "余额充值",
  serviceDesk: "在线客服（AI客服）",
  tongue: "舌象分析",
};

// ============================================================================
// 二、店铺、交易参数与外观
// ============================================================================

/** 派单模式：医护自接单，或店铺统一派单。 */
export const HEALTH_DISPATCH_MODES = ["PRACTITIONER", "SHOP"] as const;
export type HealthDispatchMode = (typeof HEALTH_DISPATCH_MODES)[number];
export const HEALTH_DISPATCH_MODE_LABELS: Record<string, string> = {
  PRACTITIONER: "医护自接单",
  SHOP: "店铺统一派单",
};

/** 药师审方口径。 */
export const HEALTH_PHARMACIST_REVIEW_MODES = ["OFF", "REQUIRED", "SAMPLE"] as const;
export type HealthPharmacistReviewMode = (typeof HEALTH_PHARMACIST_REVIEW_MODES)[number];
export const HEALTH_PHARMACIST_REVIEW_MODE_LABELS: Record<string, string> = {
  OFF: "不启用药师审核",
  REQUIRED: "每张处方必须药师审核",
  SAMPLE: "按比例抽检",
};

/**
 * 交易与运营参数（JSON 列，归一化与边界校验的唯一实现点在
 * `backend/src/health/health.shop.service.ts` 的 `normalizeTrade`）。
 */
export const healthTradeSchema = z.object({
  /** 未付款自动取消分钟数。 */
  autoCancelMinutes: z.number().int().min(1).max(120).default(15),
  /** 可约时间片粒度（必须 5 的倍数，号源引擎按它切片）。 */
  timeUnitMinutes: z.number().int().min(5).max(120).multipleOf(5).default(30),
  /** 前后缓冲分钟：占用判定外扩。 */
  bufferMinutes: z.number().int().min(0).max(120).default(0),
  /** 最多可约到第几天。 */
  maxDays: z.number().int().min(1).max(90).default(14),
  allowCrossDay: z.boolean().default(false),
  /** 最少提前预约分钟数。 */
  bookingLeadMinutes: z.number().int().min(0).max(1440).default(30),
  dispatchMode: z.enum(HEALTH_DISPATCH_MODES).default("PRACTITIONER"),
  /** 完成后多少小时才进可提现收益。 */
  canTxHours: z.number().int().min(0).max(720).default(24),
  /** 取消/退款是否回补号源。 */
  refundReleaseSlot: z.boolean().default(true),
  /** 允许在线收款的店铺侧开关（平台侧另有总闸）。 */
  onlinePayEnabled: z.boolean().default(true),
  /** 允许顾客余额支付。 */
  walletPayEnabled: z.boolean().default(true),
  /** 允许积分抵扣及其上限比例（%）。 */
  pointDeductEnabled: z.boolean().default(true),
  pointDeductMaxPercent: z.number().int().min(0).max(100).default(50),
  /** 包邮门槛与默认运费（分）。 */
  freeShippingOverCents: z.number().int().min(0).max(99999999).default(0),
  defaultShippingCents: z.number().int().min(0).max(999999).default(0),
  /** 处方药下单是否强制要求有效处方。 */
  prescriptionDrugGuard: z.boolean().default(true),
  pharmacistReviewMode: z.enum(HEALTH_PHARMACIST_REVIEW_MODES).default("REQUIRED"),
  /** 药师抽检比例（%，仅 SAMPLE 生效）。 */
  pharmacistSamplePercent: z.number().int().min(1).max(100).default(30),
  /** 处方有效期（小时）。 */
  prescriptionValidHours: z.number().int().min(1).max(72).default(72),
  /** 允许自助入驻（机构/医护提交资质）。 */
  selfOnboarding: z.boolean().default(true),
  /** 入驻与认证是否需店主审核。 */
  onboardingAudit: z.boolean().default(true),
  /** 允许推客分销。 */
  promoterEnabled: z.boolean().default(false),
  /** 默认推客分佣比例（%）。 */
  promoterRatePercent: z.number().int().min(0).max(50).default(10),
  /** 允许提现。 */
  withdrawalEnabled: z.boolean().default(true),
  /** 提现最低金额（分）与税点（%）。 */
  withdrawalMinCents: z.number().int().min(0).max(99999999).default(1000),
  withdrawalTaxPercent: z.number().int().min(0).max(45).default(0),
  /** 评价开关与先审后展示。 */
  reviewEnabled: z.boolean().default(true),
  reviewAuditFirst: z.boolean().default(false),
  /** 指标预警总闸与去重窗口。 */
  alertEnabled: z.boolean().default(true),
  alertDedupeMinutes: z.number().int().min(1).max(1440).default(60),
  /** 随访逾期多久提醒店主。 */
  followupOverdueHours: z.number().int().min(1).max(168).default(24),
  /** 病友圈发帖是否先审。 */
  postAuditFirst: z.boolean().default(true),
  /** 紧急就医提示文案（端上固定展示，不可清空）。 */
  emergencyTip: z.string().trim().max(200).default("急危重症请立即拨打 120 或前往就近急诊，本小程序不提供急救指导。"),
});
export type HealthTrade = z.infer<typeof healthTradeSchema>;

export const HEALTH_DEFAULT_TRADE: HealthTrade = healthTradeSchema.parse({});

export const healthThemeSchema = z.object({
  themeColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "主题色需为 #RRGGBB")
    .default("#1a73e8"),
  navigationTitle: z.string().trim().max(30).default("健康管理"),
  /** tabBar 四项文案（顺序固定：首页 / 服务 / 问诊 / 我的）。 */
  tabBarLabels: z
    .array(z.string().trim().min(1).max(8))
    .min(4)
    .max(4)
    .default(["首页", "服务", "问诊", "我的"]),
});
export type HealthTheme = z.infer<typeof healthThemeSchema>;

export const healthShopRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  shopCode: z.string(),
  logo: z.string(),
  slogan: z.string(),
  servicePhone: z.string(),
  status: z.enum(HEALTH_SHOP_STATUSES),
  shareImage: z.string(),
  /** 主营城市（C 端切城市的默认值）。 */
  city: z.string(),
  theme: healthThemeSchema,
  trade: healthTradeSchema,
  appConfigured: z.boolean(),
  payEnabled: z.boolean(),
  offReason: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type HealthShopRow = z.infer<typeof healthShopRowSchema>;

/** 舌象分析增值服务：店铺级开关与视觉模型（留空跟随账号「视觉理解」模型）。 */
export const healthTongueConfigSchema = z.object({
  enabled: z.boolean(),
  channelId: z.number().int(),
  model: z.string(),
});
export type HealthTongueConfig = z.infer<typeof healthTongueConfigSchema>;

/** 一次舌象分析的结构化结论（原图 URL 可直接展示）。 */
export const healthTongueRecordSchema = z.object({
  id: z.number(),
  customerId: z.number(),
  customerName: z.string().default(""),
  imageUrl: z.string(),
  quality: z.string().default("GOOD"),
  tongueColor: z.string().default(""),
  coatingColor: z.string().default(""),
  tongueShape: z.string().default(""),
  constitution: z.string().default(""),
  interpretation: z.string().default(""),
  suggestions: z.array(z.string()).default([]),
  cautions: z.array(z.string()).default([]),
  confidence: z.number().default(0),
  model: z.string().default(""),
  createdAt: z.string(),
});
export type HealthTongueRecord = z.infer<typeof healthTongueRecordSchema>;

export const healthShopInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slogan: z.string().trim().max(120).default(""),
  logo: z.string().trim().max(500).default(""),
  servicePhone: z.string().trim().max(32).default(""),
  shareImage: z.string().trim().max(500).default(""),
  city: z.string().trim().max(60).default(""),
});
export type HealthShopInput = z.infer<typeof healthShopInputSchema>;

export const healthGuideStepSchema = z.object({
  key: z.string(),
  label: z.string(),
  desc: z.string(),
  done: z.boolean(),
  href: z.string().default(""),
  action: z.string().default(""),
});
export type HealthGuideStep = z.infer<typeof healthGuideStepSchema>;

export const healthOverviewSchema = z.object({
  hasShop: z.boolean(),
  shop: healthShopRowSchema.nullable(),
  open: z.boolean(),
  steps: z.array(healthGuideStepSchema),
  /** 关键存量计数，引导页与看板顶部用一次拉全，不再逐个接口试。 */
  counters: z
    .object({
      customers: z.number(),
      patients: z.number(),
      organs: z.number(),
      practitioners: z.number(),
      pendingAudits: z.number(),
      openOrders: z.number(),
      alerts: z.number(),
      followups: z.number(),
    })
    .default({
      customers: 0,
      patients: 0,
      organs: 0,
      practitioners: 0,
      pendingAudits: 0,
      openOrders: 0,
      alerts: 0,
      followups: 0,
    }),
});
export type HealthOverview = z.infer<typeof healthOverviewSchema>;

/** 状态开关通用入参（上下架、启用停用、审核通过驳回都用它，reason 必填于驳回场景）。 */
export const healthStatusInputSchema = z.object({
  id: z.number().int().min(0).default(0),
  status: z.string().trim().min(1).max(24),
  reason: z.string().trim().max(200).default(""),
});
export type HealthStatusInput = z.infer<typeof healthStatusInputSchema>;

/** id 入参：一律走 query/body，不用路径参数（Hono 静态段会被先注册的 `:param` 兄弟路径吃掉）。 */
export const healthShopIdQuery = <T extends z.ZodRawShape>(extra: T) =>
  z.object({ shopId: z.coerce.number().int().positive(), ...extra });
export const healthShopIdBody = <T extends z.ZodRawShape>(extra: T) =>
  z.object({ shopId: z.number().int().positive(), ...extra });

// ============================================================================
// 三、平台侧（板块开关与资金总闸）
// ============================================================================

export const healthPlatformSettingsSchema = z.object({
  enabled: z.boolean(),
  allowOnlinePay: z.boolean(),
  defaultTrade: healthTradeSchema,
  updatedBy: z.string().default(""),
  updatedAt: z.string().default(""),
});
export type HealthPlatformSettings = z.infer<typeof healthPlatformSettingsSchema>;

export const healthQrcodeSchema = z.object({
  url: z.string(),
  page: z.string(),
  scene: z.string(),
  message: z.string().default(""),
});
export type HealthQrcode = z.infer<typeof healthQrcodeSchema>;

/** 元信息：把枚举文案与能力开关一次下发，前端与小程序都取一份，避免各处硬编码。 */
export const healthMetaSchema = z.object({
  scene: z.string(),
  shopStatuses: z.record(z.string(), z.string()),
  staffRoles: z.record(z.string(), z.string()),
  practitionerRoles: z.record(z.string(), z.string()),
  auditStatuses: z.record(z.string(), z.string()),
  bizTypes: z.record(z.string(), z.string()),
  orderStatuses: z.record(z.string(), z.string()),
  consultStatuses: z.record(z.string(), z.string()),
  followupWays: z.record(z.string(), z.string()),
  alertRuleTypes: z.record(z.string(), z.string()),
  prescriptionStatuses: z.record(z.string(), z.string()),
  aftersaleKinds: z.record(z.string(), z.string()),
  withdrawalStatuses: z.record(z.string(), z.string()),
  earnerKinds: z.record(z.string(), z.string()),
  crowdKinds: z.record(z.string(), z.string()),
  recordItemTypes: z.record(z.string(), z.string()),
  contentKinds: z.record(z.string(), z.string()),
  diyBlocks: z.record(z.string(), z.string()),
  serviceEntries: z.record(z.string(), z.string()),
  timeUnits: z.array(z.number()),
});
export type HealthMeta = z.infer<typeof healthMetaSchema>;

// ============================================================================
// 四、店内人员与权限
// ============================================================================

export const healthStaffRowSchema = z.object({
  id: z.number(),
  shopId: z.number(),
  /** 站内账号（本站 User id），不是顾客令牌。 */
  userId: z.string(),
  label: z.string(),
  role: z.enum(HEALTH_STAFF_ROLES),
  /** 权限面键（页签与动作），空数组表示按角色默认面。 */
  scopes: z.array(z.string()),
  status: z.enum(HEALTH_ON_STATUSES),
  createdAt: z.string(),
});
export type HealthStaffRow = z.infer<typeof healthStaffRowSchema>;

export const healthStaffSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  userId: z.string().trim().min(1).max(64),
  label: z.string().trim().max(60).default(""),
  role: z.enum(HEALTH_STAFF_ROLES).default("OPERATION"),
  scopes: z.array(z.string().trim().max(40)).max(60).default([]),
  status: z.enum(HEALTH_ON_STATUSES).default("ON"),
});
export type HealthStaffSaveBody = z.infer<typeof healthStaffSaveBodySchema>;

export const healthStaffScopeSchema = z.object({
  key: z.string(),
  label: z.string(),
  group: z.string(),
});
export type HealthStaffScope = z.infer<typeof healthStaffScopeSchema>;

// ============================================================================
// 五、主体：医院 / 科室 / 机构入驻 / 医护认证 / 团队
// ============================================================================

export const HEALTH_HOSPITAL_LEVELS = [
  "NONE",
  "GRADE1",
  "GRADE2",
  "GRADE3",
  "SPECIALTY",
  "CLINIC",
] as const;
export type HealthHospitalLevel = (typeof HEALTH_HOSPITAL_LEVELS)[number];
export const HEALTH_HOSPITAL_LEVEL_LABELS: Record<string, string> = {
  NONE: "未填等级",
  GRADE1: "一级",
  GRADE2: "二级",
  GRADE3: "三级",
  SPECIALTY: "专科",
  CLINIC: "诊所/门诊部",
};

export const healthHospitalRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  level: z.enum(HEALTH_HOSPITAL_LEVELS),
  city: z.string(),
  address: z.string(),
  lng: z.number(),
  lat: z.number(),
  intro: z.string(),
  /** 是否本店合作医院（决定绿通与挂号是否优先展示）。 */
  partnered: z.boolean(),
  status: z.enum(HEALTH_ON_STATUSES),
  departmentCount: z.number(),
  practitionerCount: z.number(),
});
export type HealthHospitalRow = z.infer<typeof healthHospitalRowSchema>;

export const healthHospitalSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  name: z.string().trim().min(2).max(120),
  level: z.enum(HEALTH_HOSPITAL_LEVELS).default("NONE"),
  city: z.string().trim().max(60).default(""),
  address: z.string().trim().max(200).default(""),
  lng: z.number().min(-180).max(180).default(0),
  lat: z.number().min(-90).max(90).default(0),
  intro: z.string().trim().max(2000).default(""),
  partnered: z.boolean().default(false),
  status: z.enum(HEALTH_ON_STATUSES).default("ON"),
});
export type HealthHospitalSaveBody = z.infer<typeof healthHospitalSaveBodySchema>;

export const healthDepartmentRowSchema = z.object({
  id: z.number(),
  hospitalId: z.number(),
  hospitalName: z.string(),
  name: z.string(),
  category: z.string(),
  intro: z.string(),
  sort: z.number(),
  status: z.enum(HEALTH_ON_STATUSES),
  practitionerCount: z.number(),
});
export type HealthDepartmentRow = z.infer<typeof healthDepartmentRowSchema>;

export const healthDepartmentSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  hospitalId: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(60),
  category: z.string().trim().max(40).default(""),
  intro: z.string().trim().max(1000).default(""),
  sort: z.number().int().min(0).max(9999).default(0),
  status: z.enum(HEALTH_ON_STATUSES).default("ON"),
});
export type HealthDepartmentSaveBody = z.infer<typeof healthDepartmentSaveBodySchema>;

export const HEALTH_ORGAN_KINDS = [
  "CLINIC",
  "HOSPITAL",
  "EXAM_CENTER",
  "PHARMACY",
  "HEALTH_MANAGEMENT",
] as const;
export type HealthOrganKind = (typeof HEALTH_ORGAN_KINDS)[number];
export const HEALTH_ORGAN_KIND_LABELS: Record<string, string> = {
  CLINIC: "诊所",
  HOSPITAL: "医院",
  EXAM_CENTER: "体检中心",
  PHARMACY: "药房",
  HEALTH_MANAGEMENT: "健康管理机构",
};

export const healthOrganRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  kind: z.enum(HEALTH_ORGAN_KINDS),
  city: z.string(),
  address: z.string(),
  contactName: z.string(),
  contactPhone: z.string(),
  licenseNo: z.string(),
  /** 机构自有分成比例（%），0 表示按店铺默认。 */
  commissionPercent: z.number(),
  auditStatus: z.enum(HEALTH_AUDIT_STATUSES),
  auditReason: z.string(),
  auditAt: z.string(),
  practitionerCount: z.number(),
  createdAt: z.string(),
});
export type HealthOrganRow = z.infer<typeof healthOrganRowSchema>;

export const healthOrganSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  name: z.string().trim().min(2).max(120),
  kind: z.enum(HEALTH_ORGAN_KINDS).default("CLINIC"),
  city: z.string().trim().max(60).default(""),
  address: z.string().trim().max(200).default(""),
  contactName: z.string().trim().max(60).default(""),
  contactPhone: z.string().trim().max(32).default(""),
  licenseNo: z.string().trim().max(64).default(""),
  licenseImages: z.array(z.string().trim().max(500)).max(9).default([]),
  commissionPercent: z.number().int().min(0).max(100).default(0),
  intro: z.string().trim().max(2000).default(""),
});
export type HealthOrganSaveBody = z.infer<typeof healthOrganSaveBodySchema>;

/** 入驻申请：机构与医护共用一张申请表单形状，审核动作走同一套口径。 */
export const healthApplicationRowSchema = z.object({
  id: z.number(),
  kind: z.string(),
  targetId: z.number(),
  name: z.string(),
  phone: z.string(),
  city: z.string(),
  submitAt: z.string(),
  auditStatus: z.enum(HEALTH_AUDIT_STATUSES),
  auditReason: z.string(),
  materials: z.array(z.string()),
  /** 摘要展示用的资质信息（执业证号、科室等），不含证件明文。 */
  extras: z.record(z.string(), z.string()),
});
export type HealthApplicationRow = z.infer<typeof healthApplicationRowSchema>;

export const healthPractitionerRowSchema = z.object({
  id: z.number(),
  organId: z.number(),
  organName: z.string(),
  hospitalId: z.number(),
  hospitalName: z.string(),
  departmentId: z.number(),
  departmentName: z.string(),
  name: z.string(),
  role: z.enum(HEALTH_PRACTITIONER_ROLES),
  title: z.string(),
  avatar: z.string(),
  phone: z.string(),
  city: z.string(),
  intro: z.string(),
  goodAt: z.array(z.string()),
  licenseNo: z.string(),
  commissionPercent: z.number(),
  auditStatus: z.enum(HEALTH_AUDIT_STATUSES),
  auditReason: z.string(),
  auditAt: z.string(),
  status: z.enum(HEALTH_ON_STATUSES),
  /** 可被哪些服务类型接单（与 `health_practitioner_services` 对应）。 */
  services: z.array(
    z.object({
      id: z.number(),
      serviceId: z.number(),
      serviceName: z.string(),
      bizType: z.enum(HEALTH_ORDER_BIZ_TYPES),
      priceCents: z.number(),
      instant: z.boolean(),
      status: z.enum(HEALTH_ON_STATUSES),
    }),
  ),
  ratings: z.object({
    score: z.number(),
    count: z.number(),
  }),
  patientCount: z.number(),
  createdAt: z.string(),
});
export type HealthPractitionerRow = z.infer<typeof healthPractitionerRowSchema>;

export const healthPractitionerSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  organId: z.number().int().min(0).default(0),
  hospitalId: z.number().int().min(0).default(0),
  departmentId: z.number().int().min(0).default(0),
  name: z.string().trim().min(2).max(60),
  role: z.enum(HEALTH_PRACTITIONER_ROLES).default("DOCTOR"),
  title: z.string().trim().max(40).default(""),
  avatar: z.string().trim().max(500).default(""),
  phone: z.string().trim().max(32).default(""),
  city: z.string().trim().max(60).default(""),
  intro: z.string().trim().max(2000).default(""),
  goodAt: z.array(z.string().trim().max(30)).max(20).default([]),
  licenseNo: z.string().trim().max(64).default(""),
  licenseImages: z.array(z.string().trim().max(500)).max(9).default([]),
  commissionPercent: z.number().int().min(0).max(100).default(0),
});
export type HealthPractitionerSaveBody = z.infer<typeof healthPractitionerSaveBodySchema>;

export const healthPractitionerServiceSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  practitionerId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  serviceId: z.number().int().positive(),
  priceCents: z.number().int().min(0).max(99999999).default(0),
  /** 极速问诊：按响应时长计费、无需选时段。 */
  instant: z.boolean().default(false),
  maxDailyCount: z.number().int().min(0).max(200).default(0),
  status: z.enum(HEALTH_ON_STATUSES).default("ON"),
});
export type HealthPractitionerServiceSaveBody = z.infer<
  typeof healthPractitionerServiceSaveBodySchema
>;

export const healthTeamRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  organId: z.number(),
  organName: z.string(),
  leaderPractitionerId: z.number(),
  leaderName: z.string(),
  intro: z.string(),
  qrcodeUrl: z.string(),
  memberCount: z.number(),
  patientCount: z.number(),
  status: z.enum(HEALTH_ON_STATUSES),
  createdAt: z.string(),
});
export type HealthTeamRow = z.infer<typeof healthTeamRowSchema>;

export const healthTeamSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  name: z.string().trim().min(2).max(80),
  organId: z.number().int().min(0).default(0),
  leaderPractitionerId: z.number().int().min(0).default(0),
  intro: z.string().trim().max(2000).default(""),
  status: z.enum(HEALTH_ON_STATUSES).default("ON"),
});
export type HealthTeamSaveBody = z.infer<typeof healthTeamSaveBodySchema>;

export const healthTeamMemberRowSchema = z.object({
  id: z.number(),
  teamId: z.number(),
  practitionerId: z.number(),
  name: z.string(),
  role: z.enum(HEALTH_PRACTITIONER_ROLES),
  title: z.string(),
  isLeader: z.boolean(),
  joinedAt: z.string(),
});
export type HealthTeamMemberRow = z.infer<typeof healthTeamMemberRowSchema>;

export const healthTeamNoticeRowSchema = z.object({
  id: z.number(),
  teamId: z.number(),
  title: z.string(),
  content: z.string(),
  authorName: z.string(),
  createdAt: z.string(),
});
export type HealthTeamNoticeRow = z.infer<typeof healthTeamNoticeRowSchema>;

export const healthTeamJoinRowSchema = z.object({
  id: z.number(),
  teamId: z.number(),
  teamName: z.string(),
  practitionerId: z.number(),
  name: z.string(),
  message: z.string(),
  auditStatus: z.enum(HEALTH_AUDIT_STATUSES),
  auditReason: z.string(),
  createdAt: z.string(),
});
export type HealthTeamJoinRow = z.infer<typeof healthTeamJoinRowSchema>;

// ============================================================================
// 六、装修、公告、协议与服务入口
// ============================================================================

export const healthBannerRowSchema = z.object({
  id: z.number(),
  title: z.string(),
  image: z.string(),
  linkType: z.string(),
  linkValue: z.string(),
  sort: z.number(),
  status: z.enum(HEALTH_ON_STATUSES),
  startAt: z.string(),
  endAt: z.string(),
});
export type HealthBannerRow = z.infer<typeof healthBannerRowSchema>;

export const healthBannerSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  title: z.string().trim().max(60).default(""),
  image: z.string().trim().max(500),
  linkType: z.string().trim().max(20).default("NONE"),
  linkValue: z.string().trim().max(500).default(""),
  sort: z.number().int().min(0).max(999).default(0),
  status: z.enum(HEALTH_ON_STATUSES).default("ON"),
  startAt: z.string().trim().max(32).default(""),
  endAt: z.string().trim().max(32).default(""),
});
export type HealthBannerSaveBody = z.infer<typeof healthBannerSaveBodySchema>;

export const healthNoticeRowSchema = z.object({
  id: z.number(),
  title: z.string(),
  content: z.string(),
  sort: z.number(),
  status: z.enum(HEALTH_ON_STATUSES),
  updatedAt: z.string(),
});
export type HealthNoticeRow = z.infer<typeof healthNoticeRowSchema>;

export const healthDiyPageRowSchema = z.object({
  pageKey: z.string(),
  title: z.string(),
  blocks: z.array(
    z.object({
      key: z.enum(HEALTH_DIY_BLOCKS),
      visible: z.boolean(),
      sort: z.number(),
      config: z.record(z.string(), z.unknown()),
    }),
  ),
  publishedAt: z.string(),
});
export type HealthDiyPageRow = z.infer<typeof healthDiyPageRowSchema>;

export const healthDiyPageSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  pageKey: z.string().trim().min(1).max(30),
  blocks: z
    .array(
      z.object({
        key: z.enum(HEALTH_DIY_BLOCKS),
        visible: z.boolean().default(true),
        sort: z.number().int().min(0).max(99).default(0),
        config: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .max(20),
  publish: z.boolean().default(false),
});
export type HealthDiyPageSaveBody = z.infer<typeof healthDiyPageSaveBodySchema>;

export const healthServiceEntryRowSchema = z.object({
  key: z.enum(HEALTH_SERVICE_ENTRY_KEYS),
  label: z.string(),
  visible: z.boolean(),
  sort: z.number(),
  /** 依赖条件：不满足时端上置灰并给出原因（如未配商户号则收款类入口不可用）。 */
  dependsOn: z.string().default(""),
  blockedReason: z.string().default(""),
});
export type HealthServiceEntryRow = z.infer<typeof healthServiceEntryRowSchema>;

export const healthServiceEntrySaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  entries: z
    .array(
      z.object({
        key: z.enum(HEALTH_SERVICE_ENTRY_KEYS),
        visible: z.boolean(),
        sort: z.number().int().min(0).max(999).default(0),
      }),
    )
    .max(30),
});
export type HealthServiceEntrySaveBody = z.infer<typeof healthServiceEntrySaveBodySchema>;

/** 协议与须知：键固定，端上在建档/下单/问诊前强制展示与勾选。 */
export const HEALTH_AGREEMENT_KEYS = [
  "service",
  "privacy",
  "visitNotice",
  "collectNotice",
  "withdrawRule",
  "refundRule",
] as const;
export type HealthAgreementKey = (typeof HEALTH_AGREEMENT_KEYS)[number];
export const HEALTH_AGREEMENT_LABELS: Record<string, string> = {
  service: "服务协议",
  privacy: "隐私政策",
  visitNotice: "就诊须知",
  collectNotice: "健康数据采集告知",
  withdrawRule: "提现规则与须知",
  refundRule: "退款与售后规则",
};

export const healthAgreementRowSchema = z.object({
  key: z.enum(HEALTH_AGREEMENT_KEYS),
  label: z.string(),
  title: z.string(),
  content: z.string(),
  updatedAt: z.string(),
});
export type HealthAgreementRow = z.infer<typeof healthAgreementRowSchema>;

export const healthAgreementSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  key: z.enum(HEALTH_AGREEMENT_KEYS),
  title: z.string().trim().max(80).default(""),
  content: z.string().max(60000).default(""),
});
export type HealthAgreementSaveBody = z.infer<typeof healthAgreementSaveBodySchema>;

// ============================================================================
// 七、顾客、就诊人、人群分组与健康档案
// ============================================================================

export const healthCustomerRowSchema = z.object({
  id: z.number(),
  nickname: z.string(),
  avatar: z.string(),
  /** 手机号仅店主侧脱敏展示（列表回 `138****0000`，详情按权限回全量并留审计）。 */
  phone: z.string(),
  gender: z.string(),
  city: z.string(),
  source: z.string(),
  /** 推客归因：谁带来的这个顾客（有效期内才算）。 */
  promoterId: z.number(),
  promoterName: z.string(),
  memberLevelId: z.number(),
  memberLevelName: z.string(),
  patientCount: z.number(),
  orderCount: z.number(),
  totalPayCents: z.number(),
  walletCents: z.number(),
  pointValue: z.number(),
  status: z.enum(HEALTH_ON_STATUSES),
  lastActiveAt: z.string(),
  createdAt: z.string(),
});
export type HealthCustomerRow = z.infer<typeof healthCustomerRowSchema>;

export const healthCustomerSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().positive(),
  nickname: z.string().trim().max(60).optional(),
  phone: z.string().trim().max(32).optional(),
  city: z.string().trim().max(60).optional(),
  memberLevelId: z.number().int().min(0).optional(),
  remark: z.string().trim().max(500).optional(),
  status: z.enum(HEALTH_ON_STATUSES).optional(),
});
export type HealthCustomerSaveBody = z.infer<typeof healthCustomerSaveBodySchema>;

export const healthCustomerDetailSchema = z.object({
  customer: healthCustomerRowSchema,
  patients: z.array(z.lazy(() => healthPatientRowSchema)),
  recentOrders: z.array(z.lazy(() => healthOrderRowSchema)),
  recentAlerts: z.array(z.lazy(() => healthAlertRowSchema)),
  remark: z.string(),
});
export type HealthCustomerDetail = z.infer<typeof healthCustomerDetailSchema>;

export const healthPatientRowSchema = z.object({
  id: z.number(),
  customerId: z.number(),
  customerLabel: z.string(),
  name: z.string(),
  relation: z.enum(HEALTH_PATIENT_RELATIONS),
  gender: z.string(),
  birthday: z.string(),
  age: z.number(),
  phone: z.string(),
  idCardMasked: z.string(),
  bloodType: z.string(),
  heightCm: z.number(),
  weightKg: z.number(),
  /** 责任健管师（随访与预警的默认通知对象）。 */
  ownerPractitionerId: z.number(),
  ownerPractitionerName: z.string(),
  crowdIds: z.array(z.number()),
  crowdNames: z.array(z.string()),
  remark: z.string(),
  createdAt: z.string(),
});
export type HealthPatientRow = z.infer<typeof healthPatientRowSchema>;

export const healthPatientSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  customerId: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(60),
  relation: z.enum(HEALTH_PATIENT_RELATIONS).default("SELF"),
  gender: z.string().trim().max(8).default(""),
  birthday: z.string().trim().max(20).default(""),
  phone: z.string().trim().max(32).default(""),
  idCard: z.string().trim().max(32).default(""),
  bloodType: z.string().trim().max(8).default(""),
  heightCm: z.number().min(0).max(250).default(0),
  weightKg: z.number().min(0).max(400).default(0),
  ownerPractitionerId: z.number().int().min(0).default(0),
  crowdIds: z.array(z.number().int().positive()).max(20).default([]),
  remark: z.string().trim().max(500).default(""),
});
export type HealthPatientSaveBody = z.infer<typeof healthPatientSaveBodySchema>;

export const healthCrowdGroupRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  kind: z.enum(HEALTH_CROWD_KINDS),
  desc: z.string(),
  memberCount: z.number(),
  createdAt: z.string(),
});
export type HealthCrowdGroupRow = z.infer<typeof healthCrowdGroupRowSchema>;

export const healthCrowdGroupSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(40),
  kind: z.enum(HEALTH_CROWD_KINDS).default("ALL"),
  desc: z.string().trim().max(200).default(""),
});
export type HealthCrowdGroupSaveBody = z.infer<typeof healthCrowdGroupSaveBodySchema>;

export const healthRecordRowSchema = z.object({
  id: z.number(),
  patientId: z.number(),
  patientName: z.string(),
  /** 档案是否完整（必填项 + 至少一条分型条目）。C 端建档引导按它判断。 */
  completed: z.boolean(),
  basics: z.record(z.string(), z.unknown()),
  items: z.array(
    z.object({
      id: z.number(),
      type: z.enum(HEALTH_RECORD_ITEM_TYPES),
      label: z.string(),
      value: z.string(),
      dictKey: z.string(),
      startAt: z.string(),
      endAt: z.string(),
      updatedAt: z.string(),
    }),
  ),
  events: z.array(z.lazy(() => healthMedicalEventRowSchema)),
  updatedAt: z.string(),
});
export type HealthRecordRow = z.infer<typeof healthRecordRowSchema>;

export const healthRecordSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  patientId: z.number().int().positive(),
  basics: z.record(z.string(), z.unknown()).default({}),
});
export type HealthRecordSaveBody = z.infer<typeof healthRecordSaveBodySchema>;

export const healthRecordItemSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  patientId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  type: z.enum(HEALTH_RECORD_ITEM_TYPES),
  label: z.string().trim().max(60).default(""),
  value: z.string().trim().max(500),
  dictKey: z.string().trim().max(60).default(""),
  startAt: z.string().trim().max(20).default(""),
  endAt: z.string().trim().max(20).default(""),
});
export type HealthRecordItemSaveBody = z.infer<typeof healthRecordItemSaveBodySchema>;

export const HEALTH_MEDICAL_EVENT_KINDS = [
  "OUTPATIENT",
  "INPATIENT",
  "OPERATION",
  "EMERGENCY",
  "OTHER",
] as const;
export type HealthMedicalEventKind = (typeof HEALTH_MEDICAL_EVENT_KINDS)[number];
export const HEALTH_MEDICAL_EVENT_KIND_LABELS: Record<string, string> = {
  OUTPATIENT: "门诊",
  INPATIENT: "住院",
  OPERATION: "手术",
  EMERGENCY: "急诊",
  OTHER: "其他",
};

export const healthMedicalEventRowSchema = z.object({
  id: z.number(),
  patientId: z.number(),
  kind: z.enum(HEALTH_MEDICAL_EVENT_KINDS),
  title: z.string(),
  hospitalName: z.string(),
  departmentName: z.string(),
  doctorName: z.string(),
  occurAt: z.string(),
  leaveAt: z.string(),
  diagnosis: z.string(),
  summary: z.string(),
  attachments: z.array(z.object({ name: z.string(), url: z.string() })),
  source: z.string(),
  createdAt: z.string(),
});
export type HealthMedicalEventRow = z.infer<typeof healthMedicalEventRowSchema>;

export const healthMedicalEventSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  patientId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  kind: z.enum(HEALTH_MEDICAL_EVENT_KINDS).default("OUTPATIENT"),
  title: z.string().trim().max(120),
  hospitalName: z.string().trim().max(120).default(""),
  departmentName: z.string().trim().max(60).default(""),
  doctorName: z.string().trim().max(60).default(""),
  occurAt: z.string().trim().max(20).default(""),
  leaveAt: z.string().trim().max(20).default(""),
  diagnosis: z.string().trim().max(500).default(""),
  summary: z.string().max(4000).default(""),
  attachments: z
    .array(z.object({ name: z.string().max(80), url: z.string().max(500) }))
    .max(9)
    .default([]),
});
export type HealthMedicalEventSaveBody = z.infer<typeof healthMedicalEventSaveBodySchema>;

/** 店铺自有字典项（过敏原、疾病名、生活习惯等，供档案与表单下拉）。 */
export const healthDictItemRowSchema = z.object({
  id: z.number(),
  groupKey: z.string(),
  label: z.string(),
  value: z.string(),
  sort: z.number(),
  status: z.enum(HEALTH_ON_STATUSES),
});
export type HealthDictItemRow = z.infer<typeof healthDictItemRowSchema>;

export const healthDictItemSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  groupKey: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(60),
  value: z.string().trim().max(60).default(""),
  sort: z.number().int().min(0).max(9999).default(0),
  status: z.enum(HEALTH_ON_STATUSES).default("ON"),
});
export type HealthDictItemSaveBody = z.infer<typeof healthDictItemSaveBodySchema>;

// ============================================================================
// 八、指标监测与异常预警
// ============================================================================

export const HEALTH_METRIC_VALUE_TYPES = ["NUMBER", "TEXT", "SELECT", "BOOLEAN"] as const;
export type HealthMetricValueType = (typeof HEALTH_METRIC_VALUE_TYPES)[number];

export const healthMetricRowSchema = z.object({
  id: z.number(),
  metricKey: z.string(),
  name: z.string(),
  unit: z.string(),
  valueType: z.enum(HEALTH_METRIC_VALUE_TYPES),
  decimals: z.number(),
  /** 目标区间（预警规则的默认兜底）。 */
  normalLow: z.number(),
  normalHigh: z.number(),
  options: z.array(z.string()),
  /** 录入表单额外字段（如血压的舒张压、测量时段）。 */
  extraFields: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      type: z.enum(HEALTH_METRIC_VALUE_TYPES),
      required: z.boolean(),
      unit: z.string(),
      options: z.array(z.string()),
    }),
  ),
  builtin: z.boolean(),
  sort: z.number(),
  status: z.enum(HEALTH_ON_STATUSES),
  recordCount: z.number(),
});
export type HealthMetricRow = z.infer<typeof healthMetricRowSchema>;

export const healthMetricSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  metricKey: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(40),
  unit: z.string().trim().max(16).default(""),
  valueType: z.enum(HEALTH_METRIC_VALUE_TYPES).default("NUMBER"),
  decimals: z.number().int().min(0).max(4).default(1),
  normalLow: z.number().min(-999999).max(999999).default(0),
  normalHigh: z.number().min(-999999).max(999999).default(0),
  options: z.array(z.string().trim().max(30)).max(20).default([]),
  extraFields: z
    .array(
      z.object({
        key: z.string().trim().max(40),
        label: z.string().trim().max(40),
        type: z.enum(HEALTH_METRIC_VALUE_TYPES).default("NUMBER"),
        required: z.boolean().default(false),
        unit: z.string().trim().max(16).default(""),
        options: z.array(z.string().trim().max(30)).max(20).default([]),
      }),
    )
    .max(10)
    .default([]),
  sort: z.number().int().min(0).max(999).default(0),
  status: z.enum(HEALTH_ON_STATUSES).default("ON"),
});
export type HealthMetricSaveBody = z.infer<typeof healthMetricSaveBodySchema>;

export const healthMetricLogRowSchema = z.object({
  id: z.number(),
  patientId: z.number(),
  patientName: z.string(),
  metricId: z.number(),
  metricKey: z.string(),
  metricName: z.string(),
  unit: z.string(),
  value: z.number(),
  valueText: z.string(),
  extras: z.record(z.string(), z.unknown()),
  measuredAt: z.string(),
  /** SELF 顾客自填 / STAFF 医护代录 / DEVICE 设备导入。 */
  source: z.string(),
  staffName: z.string(),
  abnormal: z.boolean(),
  abnormalDirection: z.string(),
  note: z.string(),
  createdAt: z.string(),
});
export type HealthMetricLogRow = z.infer<typeof healthMetricLogRowSchema>;

export const healthMetricLogSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  patientId: z.number().int().positive(),
  metricId: z.number().int().positive(),
  value: z.number().min(-999999).max(999999).default(0),
  valueText: z.string().trim().max(120).default(""),
  extras: z.record(z.string(), z.unknown()).default({}),
  measuredAt: z.string().trim().max(32).default(""),
  note: z.string().trim().max(500).default(""),
});
export type HealthMetricLogSaveBody = z.infer<typeof healthMetricLogSaveBodySchema>;

export const healthMetricTrendPointSchema = z.object({
  bucket: z.string(),
  count: z.number(),
  avgValue: z.number(),
  maxValue: z.number(),
  minValue: z.number(),
  abnormalCount: z.number(),
});
export type HealthMetricTrendPoint = z.infer<typeof healthMetricTrendPointSchema>;

export const healthMetricTrendSchema = z.object({
  metricId: z.number(),
  metricName: z.string(),
  unit: z.string(),
  normalLow: z.number(),
  normalHigh: z.number(),
  granularity: z.string(),
  points: z.array(healthMetricTrendPointSchema),
  latest: healthMetricLogRowSchema.nullable(),
  baselineValue: z.number(),
});
export type HealthMetricTrend = z.infer<typeof healthMetricTrendSchema>;

export const healthAlertRuleRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  metricId: z.number(),
  metricName: z.string(),
  ruleType: z.enum(HEALTH_ALERT_RULE_TYPES),
  lowThreshold: z.number(),
  highThreshold: z.number(),
  deltaPercent: z.number(),
  consecutiveTimes: z.number(),
  periodDays: z.number(),
  /** 通知对象：顾客本人 / 责任健管师 / 店主。 */
  notifyCustomer: z.boolean(),
  notifyOwner: z.boolean(),
  notifyShop: z.boolean(),
  severity: z.string(),
  status: z.enum(HEALTH_ON_STATUSES),
  hitCount: z.number(),
});
export type HealthAlertRuleRow = z.infer<typeof healthAlertRuleRowSchema>;

export const healthAlertRuleSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(60),
  metricId: z.number().int().positive(),
  ruleType: z.enum(HEALTH_ALERT_RULE_TYPES).default("ABSOLUTE"),
  lowThreshold: z.number().min(-999999).max(999999).default(0),
  highThreshold: z.number().min(-999999).max(999999).default(0),
  deltaPercent: z.number().int().min(1).max(500).default(20),
  consecutiveTimes: z.number().int().min(1).max(30).default(2),
  periodDays: z.number().int().min(1).max(365).default(7),
  notifyCustomer: z.boolean().default(true),
  notifyOwner: z.boolean().default(true),
  notifyShop: z.boolean().default(false),
  severity: z.string().trim().max(12).default("NORMAL"),
  status: z.enum(HEALTH_ON_STATUSES).default("ON"),
});
export type HealthAlertRuleSaveBody = z.infer<typeof healthAlertRuleSaveBodySchema>;

export const healthAlertRowSchema = z.object({
  id: z.number(),
  patientId: z.number(),
  patientName: z.string(),
  customerId: z.number(),
  ruleId: z.number(),
  ruleName: z.string(),
  metricId: z.number(),
  metricName: z.string(),
  unit: z.string(),
  value: z.number(),
  thresholdText: z.string(),
  measuredAt: z.string(),
  severity: z.string(),
  status: z.enum(HEALTH_ALERT_STATUSES),
  ownerPractitionerName: z.string(),
  handleNote: z.string(),
  handledAt: z.string(),
  handledBy: z.string(),
  createdAt: z.string(),
});
export type HealthAlertRow = z.infer<typeof healthAlertRowSchema>;

export const healthAlertHandleBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().positive(),
  status: z.enum(HEALTH_ALERT_STATUSES),
  note: z.string().trim().max(500).default(""),
});
export type HealthAlertHandleBody = z.infer<typeof healthAlertHandleBodySchema>;

// ============================================================================
// 九、管理方案、随访、量表与用药
// ============================================================================

export const HEALTH_PLAN_STEP_TYPES = [
  "METRIC",
  "FOLLOWUP",
  "MEDICATION",
  "SURVEY",
  "REVIEW_VISIT",
  "ARTICLE",
] as const;
export type HealthPlanStepType = (typeof HEALTH_PLAN_STEP_TYPES)[number];
export const HEALTH_PLAN_STEP_TYPE_LABELS: Record<string, string> = {
  METRIC: "指标监测",
  FOLLOWUP: "随访",
  MEDICATION: "用药",
  SURVEY: "量表评估",
  REVIEW_VISIT: "复查就诊",
  ARTICLE: "宣教阅读",
};

export const healthPlanRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  crowdKind: z.enum(HEALTH_CROWD_KINDS),
  cycleDays: z.number(),
  desc: z.string(),
  steps: z.array(
    z.object({
      id: z.number(),
      type: z.enum(HEALTH_PLAN_STEP_TYPES),
      name: z.string(),
      /** 周期内第几天触发（1 起）。 */
      dayOffset: z.number(),
      repeatEveryDays: z.number(),
      refId: z.number(),
      refName: z.string(),
      required: z.boolean(),
    }),
  ),
  runningCount: z.number(),
  status: z.enum(HEALTH_ON_STATUSES),
  createdAt: z.string(),
});
export type HealthPlanRow = z.infer<typeof healthPlanRowSchema>;

export const healthPlanSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(80),
  crowdKind: z.enum(HEALTH_CROWD_KINDS).default("ALL"),
  cycleDays: z.number().int().min(1).max(730).default(90),
  desc: z.string().trim().max(2000).default(""),
  status: z.enum(HEALTH_ON_STATUSES).default("ON"),
  steps: z
    .array(
      z.object({
        type: z.enum(HEALTH_PLAN_STEP_TYPES),
        name: z.string().trim().max(60),
        dayOffset: z.number().int().min(1).max(730).default(1),
        repeatEveryDays: z.number().int().min(0).max(365).default(0),
        refId: z.number().int().min(0).default(0),
        required: z.boolean().default(true),
      }),
    )
    .max(50)
    .default([]),
});
export type HealthPlanSaveBody = z.infer<typeof healthPlanSaveBodySchema>;

export const healthPatientPlanRowSchema = z.object({
  id: z.number(),
  planId: z.number(),
  planName: z.string(),
  patientId: z.number(),
  patientName: z.string(),
  practitionerId: z.number(),
  practitionerName: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  /** RUNNING 执行中 / PAUSED 暂停 / DONE 完成 / DROPPED 中止。 */
  status: z.string(),
  stepDoneCount: z.number(),
  stepTotalCount: z.number(),
  progressPercent: z.number(),
  createdAt: z.string(),
});
export type HealthPatientPlanRow = z.infer<typeof healthPatientPlanRowSchema>;

export const healthPatientPlanStartBodySchema = z.object({
  shopId: z.number().int().positive(),
  planId: z.number().int().positive(),
  patientIds: z.array(z.number().int().positive()).min(1).max(200),
  practitionerId: z.number().int().min(0).default(0),
  startAt: z.string().trim().max(32).default(""),
  cycleDays: z.number().int().min(1).max(730).default(0),
});
export type HealthPatientPlanStartBody = z.infer<typeof healthPatientPlanStartBodySchema>;

export const healthFollowupTaskRowSchema = z.object({
  id: z.number(),
  patientId: z.number(),
  patientName: z.string(),
  customerId: z.number(),
  planId: z.number(),
  planName: z.string(),
  source: z.enum(HEALTH_FOLLOWUP_SOURCES),
  way: z.enum(HEALTH_FOLLOWUP_WAYS),
  title: z.string(),
  content: z.string(),
  planAt: z.string(),
  status: z.enum(HEALTH_FOLLOWUP_STATUSES),
  practitionerId: z.number(),
  practitionerName: z.string(),
  crowdNames: z.array(z.string()),
  doneAt: z.string(),
  overdueHours: z.number(),
  createdAt: z.string(),
});
export type HealthFollowupTaskRow = z.infer<typeof healthFollowupTaskRowSchema>;

export const healthFollowupTaskCreateBodySchema = z.object({
  shopId: z.number().int().positive(),
  patientIds: z.array(z.number().int().positive()).min(1).max(200),
  title: z.string().trim().max(80).default(""),
  content: z.string().trim().max(2000).default(""),
  way: z.enum(HEALTH_FOLLOWUP_WAYS).default("PHONE"),
  planAt: z.string().trim().max(32),
  practitionerId: z.number().int().min(0).default(0),
});
export type HealthFollowupTaskCreateBody = z.infer<
  typeof healthFollowupTaskCreateBodySchema
>;

export const healthFollowupRecordSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  taskId: z.number().int().positive(),
  conclusion: z.string().trim().max(2000),
  nextAt: z.string().trim().max(32).default(""),
  metrics: z
    .array(
      z.object({
        metricId: z.number().int().positive(),
        value: z.number().min(-999999).max(999999),
        measuredAt: z.string().trim().max(32).default(""),
      }),
    )
    .max(20)
    .default([]),
  attachments: z
    .array(z.object({ name: z.string().max(80), url: z.string().max(500) }))
    .max(9)
    .default([]),
  /** 跳过原因（status=SKIPPED 时必填）。 */
  reason: z.string().trim().max(200).default(""),
  status: z.enum(["DONE", "SKIPPED", "CANCELLED"]).default("DONE"),
});
export type HealthFollowupRecordSaveBody = z.infer<
  typeof healthFollowupRecordSaveBodySchema
>;

export const healthFollowupRecordRowSchema = z.object({
  id: z.number(),
  taskId: z.number(),
  patientId: z.number(),
  patientName: z.string(),
  practitionerName: z.string(),
  conclusion: z.string(),
  metrics: z.array(
    z.object({ metricName: z.string(), value: z.number(), unit: z.string(), measuredAt: z.string() }),
  ),
  attachments: z.array(z.object({ name: z.string(), url: z.string() })),
  nextAt: z.string(),
  createdAt: z.string(),
});
export type HealthFollowupRecordRow = z.infer<typeof healthFollowupRecordRowSchema>;

export const healthSurveyRowSchema = z.object({
  id: z.number(),
  title: z.string(),
  desc: z.string(),
  crowdKind: z.enum(HEALTH_CROWD_KINDS),
  questionCount: z.number(),
  /** 总分区间 → 风险等级（端上按它出「提示」而不是结论）。 */
  riskBands: z.array(
    z.object({
      minScore: z.number(),
      maxScore: z.number(),
      level: z.string(),
      advice: z.string(),
    }),
  ),
  auditStatus: z.enum(HEALTH_AUDIT_STATUSES),
  status: z.enum(HEALTH_ON_STATUSES),
  answerCount: z.number(),
  updatedAt: z.string(),
});
export type HealthSurveyRow = z.infer<typeof healthSurveyRowSchema>;

export const healthSurveyDetailSchema = z.object({
  survey: healthSurveyRowSchema,
  questions: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      type: z.enum(["SINGLE", "MULTI", "NUMBER", "TEXT"]),
      required: z.boolean(),
      sort: z.number(),
      options: z.array(z.object({ label: z.string(), score: z.number() })),
      unit: z.string(),
    }),
  ),
});
export type HealthSurveyDetail = z.infer<typeof healthSurveyDetailSchema>;

export const healthSurveySaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  title: z.string().trim().min(1).max(80),
  desc: z.string().trim().max(1000).default(""),
  crowdKind: z.enum(HEALTH_CROWD_KINDS).default("ALL"),
  status: z.enum(HEALTH_ON_STATUSES).default("ON"),
  riskBands: z
    .array(
      z.object({
        minScore: z.number().int().min(0).max(9999),
        maxScore: z.number().int().min(0).max(9999),
        level: z.string().trim().max(20),
        advice: z.string().trim().max(500),
      }),
    )
    .max(10)
    .default([]),
  questions: z
    .array(
      z.object({
        title: z.string().trim().max(200),
        type: z.enum(["SINGLE", "MULTI", "NUMBER", "TEXT"]).default("SINGLE"),
        required: z.boolean().default(true),
        sort: z.number().int().min(0).max(999).default(0),
        unit: z.string().trim().max(16).default(""),
        options: z
          .array(z.object({ label: z.string().trim().max(80), score: z.number().int().min(0).max(999).default(0) }))
          .max(30)
          .default([]),
      }),
    )
    .max(100)
    .default([]),
});
export type HealthSurveySaveBody = z.infer<typeof healthSurveySaveBodySchema>;

export const healthSurveyAnswerRowSchema = z.object({
  id: z.number(),
  surveyId: z.number(),
  surveyTitle: z.string(),
  patientId: z.number(),
  patientName: z.string(),
  score: z.number(),
  riskLevel: z.string(),
  answers: z.array(
    z.object({
      questionTitle: z.string(),
      labels: z.array(z.string()),
      numberValue: z.number(),
      textValue: z.string(),
    }),
  ),
  filledBy: z.string(),
  createdAt: z.string(),
});
export type HealthSurveyAnswerRow = z.infer<typeof healthSurveyAnswerRowSchema>;

export const HEALTH_MEDICATION_WAYS = [
  "ORAL",
  "INJECTION",
  "TOPICAL",
  "INHALATION",
  "OTHER",
] as const;
export const HEALTH_MEDICATION_FREQUENCIES = [
  "QD",
  "BID",
  "TID",
  "QID",
  "QW",
  "PRN",
  "OTHER",
] as const;
export type HealthMedicationFrequency = (typeof HEALTH_MEDICATION_FREQUENCIES)[number];
export const HEALTH_MEDICATION_FREQUENCY_LABELS: Record<string, string> = {
  QD: "每日一次",
  BID: "每日两次",
  TID: "每日三次",
  QID: "每日四次",
  QW: "每周一次",
  PRN: "按需",
  OTHER: "自定义",
};

export const healthMedicationRowSchema = z.object({
  id: z.number(),
  patientId: z.number(),
  patientName: z.string(),
  drugName: z.string(),
  drugId: z.number(),
  spec: z.string(),
  doseText: z.string(),
  way: z.enum(HEALTH_MEDICATION_WAYS),
  frequency: z.enum(HEALTH_MEDICATION_FREQUENCIES),
  frequencyText: z.string(),
  startAt: z.string(),
  stopAt: z.string(),
  /** 服药提醒时点（HH:mm 列表）。 */
  remindTimes: z.array(z.string()),
  prescriptionId: z.number(),
  status: z.enum(HEALTH_ON_STATUSES),
  note: z.string(),
  logCount: z.number(),
  createdAt: z.string(),
});
export type HealthMedicationRow = z.infer<typeof healthMedicationRowSchema>;

export const healthMedicationSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  patientId: z.number().int().positive(),
  drugId: z.number().int().min(0).default(0),
  drugName: z.string().trim().max(120),
  spec: z.string().trim().max(60).default(""),
  doseText: z.string().trim().max(60).default(""),
  way: z.enum(HEALTH_MEDICATION_WAYS).default("ORAL"),
  frequency: z.enum(HEALTH_MEDICATION_FREQUENCIES).default("QD"),
  frequencyText: z.string().trim().max(60).default(""),
  startAt: z.string().trim().max(20).default(""),
  stopAt: z.string().trim().max(20).default(""),
  remindTimes: z.array(z.string().trim().max(8)).max(12).default([]),
  prescriptionId: z.number().int().min(0).default(0),
  note: z.string().trim().max(500).default(""),
  status: z.enum(HEALTH_ON_STATUSES).default("ON"),
});
export type HealthMedicationSaveBody = z.infer<typeof healthMedicationSaveBodySchema>;

export const healthMedicationLogRowSchema = z.object({
  id: z.number(),
  medicationId: z.number(),
  patientId: z.number(),
  patientName: z.string(),
  drugName: z.string(),
  planAt: z.string(),
  takenAt: z.string(),
  /** TAKEN 已服 / MISSED 漏服 / REFUSED 拒服。 */
  result: z.string(),
  note: z.string(),
  createdAt: z.string(),
});
export type HealthMedicationLogRow = z.infer<typeof healthMedicationLogRowSchema>;

export const healthMedicationEffectRowSchema = z.object({
  id: z.number(),
  medicationId: z.number(),
  patientId: z.number(),
  patientName: z.string(),
  drugName: z.string(),
  evaluatedAt: z.string(),
  level: z.string(),
  symptomText: z.string(),
  metrics: z.array(z.object({ metricName: z.string(), value: z.number(), unit: z.string() })),
  advice: z.string(),
  evaluatorName: z.string(),
});
export type HealthMedicationEffectRow = z.infer<typeof healthMedicationEffectRowSchema>;

export const healthPrescriptionRowSchema = z.object({
  id: z.number(),
  prescriptionNo: z.string(),
  patientId: z.number(),
  patientName: z.string(),
  consultId: z.number(),
  orderId: z.number(),
  doctorId: z.number(),
  doctorName: z.string(),
  diagnosisText: z.string(),
  items: z.array(
    z.object({
      id: z.number(),
      drugId: z.number(),
      drugName: z.string(),
      spec: z.string(),
      quantity: z.number(),
      unit: z.string(),
      doseText: z.string(),
      way: z.string(),
      frequency: z.string(),
      days: z.number(),
      prescriptionRequired: z.boolean(),
      priceCents: z.number(),
    }),
  ),
  advice: z.string(),
  totalCents: z.number(),
  status: z.enum(HEALTH_PRESCRIPTION_STATUSES),
  pharmacistName: z.string(),
  pharmacyNote: z.string(),
  reviewedAt: z.string(),
  validUntil: z.string(),
  signatureUrl: z.string(),
  createdAt: z.string(),
});
export type HealthPrescriptionRow = z.infer<typeof healthPrescriptionRowSchema>;

export const healthPrescriptionSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  patientId: z.number().int().positive(),
  consultId: z.number().int().min(0).default(0),
  orderId: z.number().int().min(0).default(0),
  doctorId: z.number().int().min(0).default(0),
  diagnosisText: z.string().trim().max(500),
  advice: z.string().trim().max(1000).default(""),
  signatureUrl: z.string().trim().max(500).default(""),
  items: z
    .array(
      z.object({
        drugId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(9999),
        doseText: z.string().trim().max(60).default(""),
        way: z.string().trim().max(20).default("ORAL"),
        frequency: z.string().trim().max(20).default("QD"),
        days: z.number().int().min(0).max(180).default(0),
      }),
    )
    .min(1)
    .max(50),
  submit: z.boolean().default(false),
});
export type HealthPrescriptionSaveBody = z.infer<typeof healthPrescriptionSaveBodySchema>;

export const healthPrescriptionReviewBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().positive(),
  approved: z.boolean(),
  note: z.string().trim().max(500).default(""),
});
export type HealthPrescriptionReviewBody = z.infer<
  typeof healthPrescriptionReviewBodySchema
>;

// ============================================================================
// 十、服务项目、号源排班与预约
// ============================================================================

export const healthServiceRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  bizType: z.enum(HEALTH_ORDER_BIZ_TYPES),
  category: z.string(),
  cover: z.string(),
  intro: z.string(),
  /** 是否需要选号源/时段（挂号、体检、上门位为 true）。 */
  needSlot: z.boolean(),
  needPatient: z.boolean(),
  /** 时长（分钟），0 表示按号源时段。 */
  durationMinutes: z.number(),
  priceCents: z.number(),
  originPriceCents: z.number(),
  cityIds: z.array(z.number()),
  crowdKinds: z.array(z.enum(HEALTH_CROWD_KINDS)),
  auditStatus: z.enum(HEALTH_AUDIT_STATUSES),
  status: z.enum(HEALTH_ON_STATUSES),
  sort: z.number(),
  orderCount: z.number(),
});
export type HealthServiceRow = z.infer<typeof healthServiceRowSchema>;

export const healthServiceSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(80),
  bizType: z.enum(HEALTH_ORDER_BIZ_TYPES).default("CONSULT_TEXT"),
  category: z.string().trim().max(40).default(""),
  cover: z.string().trim().max(500).default(""),
  intro: z.string().trim().max(4000).default(""),
  needSlot: z.boolean().default(false),
  needPatient: z.boolean().default(true),
  durationMinutes: z.number().int().min(0).max(1440).default(0),
  priceCents: z.number().int().min(0).max(99999999).default(0),
  originPriceCents: z.number().int().min(0).max(99999999).default(0),
  crowdKinds: z.array(z.enum(HEALTH_CROWD_KINDS)).max(8).default([]),
  status: z.enum(HEALTH_ON_STATUSES).default("ON"),
  sort: z.number().int().min(0).max(9999).default(0),
});
export type HealthServiceSaveBody = z.infer<typeof healthServiceSaveBodySchema>;

export const healthCityRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  code: z.string(),
  sort: z.number(),
  status: z.enum(HEALTH_ON_STATUSES),
  hospitalCount: z.number(),
});
export type HealthCityRow = z.infer<typeof healthCityRowSchema>;

export const healthCitySaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(40),
  code: z.string().trim().max(20).default(""),
  sort: z.number().int().min(0).max(999).default(0),
  status: z.enum(HEALTH_ON_STATUSES).default("ON"),
});
export type HealthCitySaveBody = z.infer<typeof healthCitySaveBodySchema>;

export const HEALTH_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export const healthShiftTemplateRowSchema = z.object({
  id: z.number(),
  practitionerId: z.number(),
  practitionerName: z.string(),
  hospitalId: z.number(),
  departmentId: z.number(),
  kind: z.enum(HEALTH_SLOT_KINDS),
  weekdays: z.array(z.number().int().min(1).max(7)),
  startAt: z.string(),
  endAt: z.string(),
  slotMinutes: z.number(),
  quotaPerSlot: z.number(),
  priceCents: z.number(),
  status: z.enum(HEALTH_ON_STATUSES),
  /** 与店铺粒度的冲突提示：粒度不是 5 的倍数或不能被时段整除时给出口径。 */
  configWarning: z.string(),
});
export type HealthShiftTemplateRow = z.infer<typeof healthShiftTemplateRowSchema>;

export const healthShiftTemplateSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  practitionerId: z.number().int().positive(),
  hospitalId: z.number().int().min(0).default(0),
  departmentId: z.number().int().min(0).default(0),
  kind: z.enum(HEALTH_SLOT_KINDS).default("OUTPATIENT"),
  weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  startAt: z.string().trim().max(8),
  endAt: z.string().trim().max(8),
  slotMinutes: z.number().int().min(5).max(240).multipleOf(5).default(30),
  quotaPerSlot: z.number().int().min(1).max(999).default(1),
  priceCents: z.number().int().min(0).max(99999999).default(0),
  status: z.enum(HEALTH_ON_STATUSES).default("ON"),
});
export type HealthShiftTemplateSaveBody = z.infer<typeof healthShiftTemplateSaveBodySchema>;

export const healthSlotRowSchema = z.object({
  id: z.number(),
  day: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  practitionerId: z.number(),
  practitionerName: z.string(),
  departmentName: z.string(),
  hospitalName: z.string(),
  kind: z.enum(HEALTH_SLOT_KINDS),
  quota: z.number(),
  occupied: z.number(),
  remain: z.number(),
  priceCents: z.number(),
  /** 是否因「最少提前预约」或已过时而不可选。 */
  bookable: z.boolean(),
  blockedReason: z.string(),
});
export type HealthSlotRow = z.infer<typeof healthSlotRowSchema>;

export const healthSlotCalendarQuerySchema = z.object({
  shopId: z.coerce.number().int().positive(),
  practitionerId: z.coerce.number().int().min(0).default(0),
  departmentId: z.coerce.number().int().min(0).default(0),
  hospitalId: z.coerce.number().int().min(0).default(0),
  kind: z.string().default("all"),
  from: z.string().trim().max(20).default(""),
  days: z.number().int().min(1).max(60).default(7),
});
export type HealthSlotCalendarQuery = z.infer<typeof healthSlotCalendarQuerySchema>;

export const healthSlotCalendarSchema = z.object({
  days: z.array(
    z.object({
      day: z.string(),
      weekday: z.number(),
      slots: z.array(healthSlotRowSchema),
      remainTotal: z.number(),
    }),
  ),
  timezone: z.string().default("+08:00"),
});
export type HealthSlotCalendar = z.infer<typeof healthSlotCalendarSchema>;

export const healthShiftGenerateBodySchema = z.object({
  shopId: z.number().int().positive(),
  practitionerId: z.number().int().min(0).default(0),
  from: z.string().trim().max(20),
  days: z.number().int().min(1).max(90).default(30),
  /** 已存在的号源是否覆盖额度（默认只补新增，不动已占）。 */
  overwriteQuota: z.boolean().default(false),
});
export type HealthShiftGenerateBody = z.infer<typeof healthShiftGenerateBodySchema>;

export const healthShiftGenerateResultSchema = z.object({
  createdSlots: z.number(),
  updatedSlots: z.number(),
  skippedSlots: z.number(),
  message: z.string(),
});
export type HealthShiftGenerateResult = z.infer<typeof healthShiftGenerateResultSchema>;

export const healthSlotBlockBodySchema = z.object({
  shopId: z.number().int().positive(),
  slotId: z.number().int().positive(),
  blocked: z.boolean(),
  reason: z.string().trim().max(100).default(""),
});
export type HealthSlotBlockBody = z.infer<typeof healthSlotBlockBodySchema>;

export const healthConsultRuleRowSchema = z.object({
  id: z.number(),
  practitionerId: z.number(),
  practitionerName: z.string(),
  bizType: z.enum(["CONSULT_TEXT", "CONSULT_PHONE", "CONSULT_VIDEO"]),
  /** 极速问诊：无需选时段，按首次响应时长约束。 */
  instant: z.boolean(),
  priceCents: z.number(),
  minutes: z.number(),
  maxDailyCount: z.number(),
  /** 图文问诊单轮可发送条数上限（0 = 不限）。 */
  messageLimit: z.number(),
  needPatient: z.boolean(),
  status: z.enum(HEALTH_ON_STATUSES),
});
export type HealthConsultRuleRow = z.infer<typeof healthConsultRuleRowSchema>;

export const healthConsultRuleSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  practitionerId: z.number().int().positive(),
  bizType: z.enum(["CONSULT_TEXT", "CONSULT_PHONE", "CONSULT_VIDEO"]),
  instant: z.boolean().default(false),
  priceCents: z.number().int().min(0).max(99999999).default(0),
  minutes: z.number().int().min(0).max(1440).default(0),
  maxDailyCount: z.number().int().min(0).max(999).default(0),
  messageLimit: z.number().int().min(0).max(9999).default(0),
  needPatient: z.boolean().default(true),
  status: z.enum(HEALTH_ON_STATUSES).default("ON"),
});
export type HealthConsultRuleSaveBody = z.infer<typeof healthConsultRuleSaveBodySchema>;

/** 问诊单：文字沟通在 AI客服会话里，这里只挂会话标识与履约状态。 */
export const healthConsultRowSchema = z.object({
  id: z.number(),
  bizType: z.enum(["CONSULT_TEXT", "CONSULT_PHONE", "CONSULT_VIDEO"]),
  orderId: z.number(),
  orderNo: z.string(),
  customerName: z.string(),
  patientName: z.string(),
  patientId: z.number(),
  practitionerId: z.number(),
  practitionerName: z.string(),
  status: z.enum(HEALTH_CONSULT_STATUSES),
  title: z.string(),
  symptomText: z.string(),
  attachments: z.array(z.object({ name: z.string(), url: z.string() })),
  /** AI客服侧标识：会话、站点与坐席；本域不存任何消息内容。 */
  serviceDeskSiteKey: z.string(),
  serviceDeskConversationId: z.number(),
  serviceDeskAgentId: z.number(),
  /** 电话/视频：预约时段与到场方式；平台不代拨、不建房间。 */
  appointAt: z.string(),
  contactPhoneMasked: z.string(),
  meetingUrl: z.string(),
  startedAt: z.string(),
  expiredAt: z.string(),
  finishedAt: z.string(),
  conclusion: z.string(),
  ratingScore: z.number(),
  createdAt: z.string(),
});
export type HealthConsultRow = z.infer<typeof healthConsultRowSchema>;

/** 接单后拿到的客服会话接入参数（小程序据此跳 AI客服会话页）。 */
export const healthConsultSessionSchema = z.object({
  consultId: z.number(),
  conversationId: z.number(),
  siteKey: z.string(),
  /** 供小程序免登录进会话的短期令牌（由 service-desk 签发，本域只转发）。 */
  accessToken: z.string(),
  streamPath: z.string(),
  expiresAt: z.string(),
  message: z.string().default(""),
});
export type HealthConsultSession = z.infer<typeof healthConsultSessionSchema>;

export const healthConsultCreateBodySchema = z.object({
  shopId: z.number().int().positive(),
  bizType: z.enum(["CONSULT_TEXT", "CONSULT_PHONE", "CONSULT_VIDEO"]).default("CONSULT_TEXT"),
  patientId: z.number().int().min(0).default(0),
  practitionerId: z.number().int().min(0).default(0),
  title: z.string().trim().max(80).default(""),
  symptomText: z.string().trim().max(2000),
  attachments: z
    .array(z.object({ name: z.string().max(80), url: z.string().max(500) }))
    .max(9)
    .default([]),
  appointAt: z.string().trim().max(32).default(""),
  contactPhone: z.string().trim().max(32).default(""),
  meetingUrl: z.string().trim().max(500).default(""),
});
export type HealthConsultCreateBody = z.infer<typeof healthConsultCreateBodySchema>;

export const healthConsultActionBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().positive(),
  action: z.enum(["ACCEPT", "REJECT", "FINISH", "CANCEL", "REMIND", "CONCLUDE"]),
  reason: z.string().trim().max(200).default(""),
  conclusion: z.string().trim().max(2000).default(""),
});
export type HealthConsultActionBody = z.infer<typeof healthConsultActionBodySchema>;

export const healthSignPackageRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  teamId: z.number(),
  teamName: z.string(),
  practitionerId: z.number(),
  practitionerName: z.string(),
  priceCents: z.number(),
  years: z.number(),
  crowdKinds: z.array(z.enum(HEALTH_CROWD_KINDS)),
  benefits: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      /** 次数额度，0 表示不限次。 */
      quota: z.number(),
      desc: z.string(),
    }),
  ),
  intro: z.string(),
  status: z.enum(HEALTH_ON_STATUSES),
  orderCount: z.number(),
});
export type HealthSignPackageRow = z.infer<typeof healthSignPackageRowSchema>;

export const healthSignPackageSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(80),
  teamId: z.number().int().min(0).default(0),
  practitionerId: z.number().int().min(0).default(0),
  priceCents: z.number().int().min(0).max(99999999),
  years: z.number().int().min(1).max(5).default(1),
  crowdKinds: z.array(z.enum(HEALTH_CROWD_KINDS)).max(8).default([]),
  intro: z.string().trim().max(4000).default(""),
  status: z.enum(HEALTH_ON_STATUSES).default("ON"),
  benefits: z
    .array(
      z.object({
        key: z.string().trim().max(40),
        label: z.string().trim().max(40),
        quota: z.number().int().min(0).max(9999).default(0),
        desc: z.string().trim().max(200).default(""),
      }),
    )
    .max(20)
    .default([]),
});
export type HealthSignPackageSaveBody = z.infer<typeof healthSignPackageSaveBodySchema>;

export const HEALTH_SIGN_ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "SIGNED",
  "EFFECTIVE",
  "EXPIRED",
  "CANCELLED",
  "REFUNDED",
] as const;
export type HealthSignOrderStatus = (typeof HEALTH_SIGN_ORDER_STATUSES)[number];
export const HEALTH_SIGN_ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "待支付",
  SIGNED: "已签约待生效",
  EFFECTIVE: "服务中",
  EXPIRED: "已到期",
  CANCELLED: "已取消",
  REFUNDED: "已退款",
};

export const healthSignOrderRowSchema = z.object({
  id: z.number(),
  orderId: z.number(),
  orderNo: z.string(),
  packageId: z.number(),
  packageName: z.string(),
  patientId: z.number(),
  patientName: z.string(),
  customerName: z.string(),
  teamName: z.string(),
  practitionerName: z.string(),
  status: z.enum(HEALTH_SIGN_ORDER_STATUSES),
  startAt: z.string(),
  endAt: z.string(),
  amountCents: z.number(),
  /** 签约拍照与手写签名（家医签约线下签署留痕）。 */
  signPhotoUrl: z.string(),
  signatureUrl: z.string(),
  verifyCode: z.string(),
  verified: z.boolean(),
  benefitUsed: z.array(z.object({ key: z.string(), label: z.string(), used: z.number(), quota: z.number() })),
  createdAt: z.string(),
});
export type HealthSignOrderRow = z.infer<typeof healthSignOrderRowSchema>;

export const healthGreenOrderRowSchema = z.object({
  id: z.number(),
  orderId: z.number(),
  orderNo: z.string(),
  patientId: z.number(),
  patientName: z.string(),
  customerName: z.string(),
  kind: z.enum(["GREEN", "OPERATION"]),
  targetHospital: z.string(),
  targetDepartment: z.string(),
  expectAt: z.string(),
  urgency: z.string(),
  symptomText: z.string(),
  attachments: z.array(z.object({ name: z.string(), url: z.string() })),
  status: z.enum(HEALTH_GREEN_STATUSES),
  matchedHospital: z.string(),
  matchedDoctor: z.string(),
  matchedAt: z.string(),
  progress: z.array(
    z.object({ at: z.string(), label: z.string(), note: z.string(), operatorName: z.string() }),
  ),
  amountCents: z.number(),
  createdAt: z.string(),
});
export type HealthGreenOrderRow = z.infer<typeof healthGreenOrderRowSchema>;

export const healthGreenProgressBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().positive(),
  status: z.enum(HEALTH_GREEN_STATUSES),
  matchedHospital: z.string().trim().max(120).default(""),
  matchedDoctor: z.string().trim().max(60).default(""),
  matchedAt: z.string().trim().max(32).default(""),
  note: z.string().trim().max(500).default(""),
});
export type HealthGreenProgressBody = z.infer<typeof healthGreenProgressBodySchema>;

// ============================================================================
// 十一、体检套餐与报告
// ============================================================================

export const healthExamItemRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  category: z.string(),
  unit: z.string(),
  reference: z.string(),
  priceCents: z.number(),
  genderLimit: z.string(),
  crowdKinds: z.array(z.enum(HEALTH_CROWD_KINDS)),
  desc: z.string(),
  status: z.enum(HEALTH_ON_STATUSES),
});
export type HealthExamItemRow = z.infer<typeof healthExamItemRowSchema>;

export const healthExamItemSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(80),
  category: z.string().trim().max(40).default(""),
  unit: z.string().trim().max(20).default(""),
  reference: z.string().trim().max(120).default(""),
  priceCents: z.number().int().min(0).max(99999999).default(0),
  genderLimit: z.string().trim().max(8).default("ALL"),
  crowdKinds: z.array(z.enum(HEALTH_CROWD_KINDS)).max(8).default([]),
  desc: z.string().trim().max(1000).default(""),
  status: z.enum(HEALTH_ON_STATUSES).default("ON"),
});
export type HealthExamItemSaveBody = z.infer<typeof healthExamItemSaveBodySchema>;

export const healthExamPackageRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  cover: z.string(),
  cityId: z.number(),
  cityName: z.string(),
  organId: z.number(),
  organName: z.string(),
  crowdKinds: z.array(z.enum(HEALTH_CROWD_KINDS)),
  genderLimit: z.string(),
  marriedLimit: z.string(),
  priceCents: z.number(),
  originPriceCents: z.number(),
  itemCount: z.number(),
  items: z.array(
    z.object({
      itemId: z.number(),
      name: z.string(),
      category: z.string(),
      priceCents: z.number(),
      /** INCLUDE 套餐内含 / ADDON 可加价加项。 */
      mode: z.string(),
    }),
  ),
  intro: z.string(),
  notice: z.string(),
  hot: z.boolean(),
  status: z.enum(HEALTH_ON_STATUSES),
  orderCount: z.number(),
});
export type HealthExamPackageRow = z.infer<typeof healthExamPackageRowSchema>;

export const healthExamPackageSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(80),
  cover: z.string().trim().max(500).default(""),
  cityId: z.number().int().min(0).default(0),
  organId: z.number().int().min(0).default(0),
  crowdKinds: z.array(z.enum(HEALTH_CROWD_KINDS)).max(8).default([]),
  genderLimit: z.string().trim().max(8).default("ALL"),
  marriedLimit: z.string().trim().max(8).default("ALL"),
  priceCents: z.number().int().min(0).max(99999999),
  originPriceCents: z.number().int().min(0).max(99999999).default(0),
  intro: z.string().trim().max(4000).default(""),
  notice: z.string().trim().max(2000).default(""),
  hot: z.boolean().default(false),
  status: z.enum(HEALTH_ON_STATUSES).default("ON"),
  items: z
    .array(
      z.object({
        itemId: z.number().int().positive(),
        mode: z.enum(["INCLUDE", "ADDON"]).default("INCLUDE"),
      }),
    )
    .max(200)
    .default([]),
});
export type HealthExamPackageSaveBody = z.infer<typeof healthExamPackageSaveBodySchema>;

export const HEALTH_REPORT_SOURCES = ["CUSTOMER_UPLOAD", "ORGAN_IMPORT", "EXAM_ORDER"] as const;
export type HealthReportSource = (typeof HEALTH_REPORT_SOURCES)[number];
export const HEALTH_REPORT_SOURCE_LABELS: Record<string, string> = {
  CUSTOMER_UPLOAD: "顾客上传",
  ORGAN_IMPORT: "机构导入",
  EXAM_ORDER: "体检订单生成",
};

export const healthReportRowSchema = z.object({
  id: z.number(),
  patientId: z.number(),
  patientName: z.string(),
  title: z.string(),
  kind: z.string(),
  source: z.enum(HEALTH_REPORT_SOURCES),
  hospitalName: z.string(),
  reportAt: z.string(),
  conclusion: z.string(),
  itemCount: z.number(),
  abnormalCount: z.number(),
  files: z.array(z.object({ name: z.string(), url: z.string() })),
  /** 是否已被解读（解读单或医师建议）。 */
  readCount: z.number(),
  adviceCount: z.number(),
  createdAt: z.string(),
});
export type HealthReportRow = z.infer<typeof healthReportRowSchema>;

export const healthReportDetailSchema = z.object({
  report: healthReportRowSchema,
  items: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      valueText: z.string(),
      value: z.number(),
      unit: z.string(),
      reference: z.string(),
      abnormal: z.boolean(),
      direction: z.string(),
    }),
  ),
  advices: z.array(
    z.object({
      id: z.number(),
      content: z.string(),
      doctorName: z.string(),
      consultId: z.number(),
      createdAt: z.string(),
    }),
  ),
});
export type HealthReportDetail = z.infer<typeof healthReportDetailSchema>;

export const healthReportSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  patientId: z.number().int().positive(),
  title: z.string().trim().min(1).max(120),
  kind: z.string().trim().max(40).default("EXAM"),
  hospitalName: z.string().trim().max(120).default(""),
  reportAt: z.string().trim().max(20).default(""),
  conclusion: z.string().trim().max(2000).default(""),
  files: z
    .array(z.object({ name: z.string().max(80), url: z.string().max(500) }))
    .max(9)
    .default([]),
  items: z
    .array(
      z.object({
        name: z.string().trim().max(80),
        valueText: z.string().trim().max(120).default(""),
        value: z.number().min(-999999).max(999999).default(0),
        unit: z.string().trim().max(20).default(""),
        reference: z.string().trim().max(120).default(""),
        abnormal: z.boolean().default(false),
        direction: z.string().trim().max(8).default(""),
      }),
    )
    .max(500)
    .default([]),
});
export type HealthReportSaveBody = z.infer<typeof healthReportSaveBodySchema>;

export const healthReportAdviceSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  reportId: z.number().int().positive(),
  consultId: z.number().int().min(0).default(0),
  content: z.string().trim().min(1).max(4000),
});
export type HealthReportAdviceSaveBody = z.infer<typeof healthReportAdviceSaveBodySchema>;

export const healthDiseaseRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  category: z.string(),
  departmentIds: z.array(z.number()),
  departmentNames: z.array(z.string()),
  symptomIds: z.array(z.number()),
  symptomNames: z.array(z.string()),
  overview: z.string(),
  advice: z.string(),
  auditStatus: z.enum(HEALTH_AUDIT_STATUSES),
  status: z.enum(HEALTH_ON_STATUSES),
});
export type HealthDiseaseRow = z.infer<typeof healthDiseaseRowSchema>;

export const healthDiseaseSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(60),
  category: z.string().trim().max(40).default(""),
  departmentIds: z.array(z.number().int().positive()).max(20).default([]),
  symptomNames: z.array(z.string().trim().max(30)).max(50).default([]),
  overview: z.string().max(8000).default(""),
  advice: z.string().trim().max(2000).default(""),
  status: z.enum(HEALTH_ON_STATUSES).default("ON"),
});
export type HealthDiseaseSaveBody = z.infer<typeof healthDiseaseSaveBodySchema>;

/** 快速导诊：症状 → 推荐科室 → 推荐医护（只给建议，不下诊断）。 */
export const healthGuidanceResultSchema = z.object({
  symptomNames: z.array(z.string()),
  departments: z.array(
    z.object({
      departmentId: z.number(),
      departmentName: z.string(),
      hitDiseases: z.array(z.string()),
      advice: z.string(),
    }),
  ),
  practitioners: z.array(
    z.object({
      practitionerId: z.number(),
      name: z.string(),
      role: z.enum(HEALTH_PRACTITIONER_ROLES),
      title: z.string(),
      departmentName: z.string(),
      hospitalName: z.string(),
      score: z.number(),
      reason: z.string(),
    }),
  ),
  disclaimer: z.string().default("以上为就医参考建议，不能作为诊断结论。"),
});
export type HealthGuidanceResult = z.infer<typeof healthGuidanceResultSchema>;

// ============================================================================
// 十二、实物商城（药品 / 器械 / 耗材）
// ============================================================================

export const healthGoodsCategoryRowSchema = z.object({
  id: z.number(),
  parentId: z.number(),
  name: z.string(),
  icon: z.string(),
  sort: z.number(),
  status: z.enum(HEALTH_ON_STATUSES),
  goodsCount: z.number(),
});
export type HealthGoodsCategoryRow = z.infer<typeof healthGoodsCategoryRowSchema>;

export const healthGoodsCategorySaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  parentId: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(40),
  icon: z.string().trim().max(500).default(""),
  sort: z.number().int().min(0).max(9999).default(0),
  status: z.enum(HEALTH_ON_STATUSES).default("ON"),
});
export type HealthGoodsCategorySaveBody = z.infer<typeof healthGoodsCategorySaveBodySchema>;

export const HEALTH_GOODS_KINDS = ["DRUG", "DEVICE", "CONSUMABLE", "HEALTH_PRODUCT"] as const;
export type HealthGoodsKind = (typeof HEALTH_GOODS_KINDS)[number];
export const HEALTH_GOODS_KIND_LABELS: Record<string, string> = {
  DRUG: "药品",
  DEVICE: "医疗器械",
  CONSUMABLE: "耗材",
  HEALTH_PRODUCT: "健康商品",
};

export const healthGoodsRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  kind: z.enum(HEALTH_GOODS_KINDS),
  categoryId: z.number(),
  categoryName: z.string(),
  images: z.array(z.string()),
  mainImage: z.string(),
  /** 关联药品字典后可带出批准文号与处方标记。 */
  drugId: z.number(),
  drugName: z.string(),
  approvalNo: z.string(),
  prescriptionRequired: z.boolean(),
  spec: z.string(),
  unit: z.string(),
  priceCents: z.number(),
  originPriceCents: z.number(),
  costCents: z.number(),
  stock: z.number(),
  sales: z.number(),
  skuMode: z.boolean(),
  skus: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      specs: z.array(z.object({ key: z.string(), label: z.string(), value: z.string() })),
      priceCents: z.number(),
      stock: z.number(),
      sales: z.number(),
    }),
  ),
  detail: z.string(),
  shippingMode: z.string(),
  shippingTemplateId: z.number(),
  recommend: z.boolean(),
  auditStatus: z.enum(HEALTH_AUDIT_STATUSES),
  status: z.enum(HEALTH_ON_STATUSES),
  reviewCount: z.number(),
  reviewScore: z.number(),
  createdAt: z.string(),
});
export type HealthGoodsRow = z.infer<typeof healthGoodsRowSchema>;

export const healthGoodsSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(120),
  kind: z.enum(HEALTH_GOODS_KINDS).default("HEALTH_PRODUCT"),
  categoryId: z.number().int().min(0).default(0),
  images: z.array(z.string().trim().max(500)).max(9).default([]),
  drugId: z.number().int().min(0).default(0),
  prescriptionRequired: z.boolean().default(false),
  spec: z.string().trim().max(60).default(""),
  unit: z.string().trim().max(16).default("件"),
  priceCents: z.number().int().min(0).max(99999999),
  originPriceCents: z.number().int().min(0).max(99999999).default(0),
  costCents: z.number().int().min(0).max(99999999).default(0),
  stock: z.number().int().min(0).max(9999999).default(0),
  skuMode: z.boolean().default(false),
  skus: z
    .array(
      z.object({
        name: z.string().trim().max(80),
        specs: z
          .array(z.object({ key: z.string().trim().max(20), label: z.string().trim().max(20), value: z.string().trim().max(30) }))
          .max(6)
          .default([]),
        priceCents: z.number().int().min(0).max(99999999),
        stock: z.number().int().min(0).max(9999999).default(0),
      }),
    )
    .max(100)
    .default([]),
  detail: z.string().max(60000).default(""),
  shippingMode: z.enum(["TEMPLATE", "FREE", "FIXED"]).default("TEMPLATE"),
  shippingTemplateId: z.number().int().min(0).default(0),
  recommend: z.boolean().default(false),
  status: z.enum(HEALTH_ON_STATUSES).default("ON"),
});
export type HealthGoodsSaveBody = z.infer<typeof healthGoodsSaveBodySchema>;

export const healthDrugRowSchema = z.object({
  id: z.number(),
  genericName: z.string(),
  brandName: z.string(),
  spec: z.string(),
  unit: z.string(),
  manufacturer: z.string(),
  approvalNo: z.string(),
  prescriptionRequired: z.boolean(),
  otcClass: z.string(),
  category: z.string(),
  priceCents: z.number(),
  stock: z.number(),
  intro: z.string(),
  status: z.enum(HEALTH_ON_STATUSES),
});
export type HealthDrugRow = z.infer<typeof healthDrugRowSchema>;

export const healthDrugSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  genericName: z.string().trim().min(1).max(120),
  brandName: z.string().trim().max(120).default(""),
  spec: z.string().trim().max(60).default(""),
  unit: z.string().trim().max(16).default("盒"),
  manufacturer: z.string().trim().max(120).default(""),
  approvalNo: z.string().trim().max(64).default(""),
  prescriptionRequired: z.boolean().default(false),
  otcClass: z.string().trim().max(20).default(""),
  category: z.string().trim().max(40).default(""),
  priceCents: z.number().int().min(0).max(99999999).default(0),
  stock: z.number().int().min(0).max(9999999).default(0),
  intro: z.string().trim().max(2000).default(""),
  status: z.enum(HEALTH_ON_STATUSES).default("ON"),
});
export type HealthDrugSaveBody = z.infer<typeof healthDrugSaveBodySchema>;

export const healthExpressCompanyRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  code: z.string(),
  phone: z.string(),
  status: z.enum(HEALTH_ON_STATUSES),
});
export type HealthExpressCompanyRow = z.infer<typeof healthExpressCompanyRowSchema>;

export const healthShippingTemplateRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  freeOverCents: z.number(),
  firstFeeCents: z.number(),
  additionalFeeCents: z.number(),
  regions: z.array(z.object({ province: z.string(), firstFeeCents: z.number(), additionalFeeCents: z.number() })),
  status: z.enum(HEALTH_ON_STATUSES),
});
export type HealthShippingTemplateRow = z.infer<typeof healthShippingTemplateRowSchema>;

export const healthShippingTemplateSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(40),
  freeOverCents: z.number().int().min(0).max(99999999).default(0),
  firstFeeCents: z.number().int().min(0).max(999999).default(0),
  additionalFeeCents: z.number().int().min(0).max(999999).default(0),
  regions: z
    .array(
      z.object({
        province: z.string().trim().max(30),
        firstFeeCents: z.number().int().min(0).max(999999),
        additionalFeeCents: z.number().int().min(0).max(999999),
      }),
    )
    .max(40)
    .default([]),
  status: z.enum(HEALTH_ON_STATUSES).default("ON"),
});
export type HealthShippingTemplateSaveBody = z.infer<typeof healthShippingTemplateSaveBodySchema>;

export const healthShipmentRowSchema = z.object({
  id: z.number(),
  orderId: z.number(),
  orderNo: z.string(),
  expressCompanyName: z.string(),
  expressCode: z.string(),
  trackingNo: z.string(),
  items: z.array(z.object({ name: z.string(), quantity: z.number() })),
  remark: z.string(),
  shippedAt: z.string(),
  receivedAt: z.string(),
  traces: z.array(z.object({ at: z.string(), text: z.string() })),
  traceMessage: z.string(),
});
export type HealthShipmentRow = z.infer<typeof healthShipmentRowSchema>;

export const healthDeliverBodySchema = z.object({
  shopId: z.number().int().positive(),
  orderId: z.number().int().positive(),
  expressCompanyId: z.number().int().min(0).default(0),
  expressCompanyName: z.string().trim().max(60).default(""),
  trackingNo: z.string().trim().max(64),
  remark: z.string().trim().max(200).default(""),
});
export type HealthDeliverBody = z.infer<typeof healthDeliverBodySchema>;

export const healthAftersaleRowSchema = z.object({
  id: z.number(),
  orderId: z.number(),
  orderNo: z.string(),
  customerId: z.number(),
  customerName: z.string(),
  kind: z.enum(HEALTH_AFTERSALE_KINDS),
  reason: z.string(),
  description: z.string(),
  images: z.array(z.string()),
  applyAmountCents: z.number(),
  refundAmountCents: z.number(),
  status: z.enum(HEALTH_AFTERSALE_STATUSES),
  shopReply: z.string(),
  returnTrackingNo: z.string(),
  handledAt: z.string(),
  createdAt: z.string(),
});
export type HealthAftersaleRow = z.infer<typeof healthAftersaleRowSchema>;

export const healthAftersaleHandleBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().positive(),
  action: z.enum(["APPROVE", "REJECT", "RECEIVED", "CLOSE"]),
  reply: z.string().trim().max(500).default(""),
  refundAmountCents: z.number().int().min(0).max(99999999).default(0),
});
export type HealthAftersaleHandleBody = z.infer<typeof healthAftersaleHandleBodySchema>;

// ============================================================================
// 十三、会员、券、积分与核销
// ============================================================================

export const healthMemberLevelRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  /** 达标方式：累计消费（分）或手动指定。 */
  reachCents: z.number(),
  discountPercent: z.number(),
  pointRatePercent: z.number(),
  benefits: z.array(z.string()),
  sort: z.number(),
  status: z.enum(HEALTH_ON_STATUSES),
  memberCount: z.number(),
});
export type HealthMemberLevelRow = z.infer<typeof healthMemberLevelRowSchema>;

export const healthMemberLevelSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(40),
  reachCents: z.number().int().min(0).max(99999999).default(0),
  discountPercent: z.number().int().min(1).max(100).default(100),
  pointRatePercent: z.number().int().min(0).max(500).default(100),
  benefits: z.array(z.string().trim().max(60)).max(20).default([]),
  sort: z.number().int().min(0).max(999).default(0),
  status: z.enum(HEALTH_ON_STATUSES).default("ON"),
});
export type HealthMemberLevelSaveBody = z.infer<typeof healthMemberLevelSaveBodySchema>;

export const healthMemberCardRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  cover: z.string(),
  priceCents: z.number(),
  originPriceCents: z.number(),
  validDays: z.number(),
  /** 权益明细（次数/折扣/赠送），发放时快照到 grant。 */
  benefits: z.array(
    z.object({ key: z.string(), label: z.string(), quota: z.number(), desc: z.string() }),
  ),
  intro: z.string(),
  soldCount: z.number(),
  status: z.enum(HEALTH_ON_STATUSES),
});
export type HealthMemberCardRow = z.infer<typeof healthMemberCardRowSchema>;

export const healthMemberCardSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(80),
  cover: z.string().trim().max(500).default(""),
  priceCents: z.number().int().min(0).max(99999999),
  originPriceCents: z.number().int().min(0).max(99999999).default(0),
  validDays: z.number().int().min(1).max(3650).default(365),
  intro: z.string().trim().max(4000).default(""),
  status: z.enum(HEALTH_ON_STATUSES).default("ON"),
  benefits: z
    .array(
      z.object({
        key: z.string().trim().max(40),
        label: z.string().trim().max(40),
        quota: z.number().int().min(0).max(99999).default(0),
        desc: z.string().trim().max(200).default(""),
      }),
    )
    .max(20)
    .default([]),
});
export type HealthMemberCardSaveBody = z.infer<typeof healthMemberCardSaveBodySchema>;

export const healthMemberGrantRowSchema = z.object({
  id: z.number(),
  cardId: z.number(),
  cardName: z.string(),
  customerLabel: z.string(),
  orderId: z.number(),
  verifyCode: z.string(),
  status: z.enum(HEALTH_MEMBER_GRANT_STATUSES),
  benefits: z.array(z.object({ key: z.string(), label: z.string(), used: z.number(), quota: z.number() })),
  activatedAt: z.string(),
  expireAt: z.string(),
  source: z.string(),
  createdAt: z.string(),
});
export type HealthMemberGrantRow = z.infer<typeof healthMemberGrantRowSchema>;

export const healthMemberGrantBodySchema = z.object({
  shopId: z.number().int().positive(),
  cardId: z.number().int().positive(),
  customerIds: z.array(z.number().int().positive()).min(1).max(200),
  validDays: z.number().int().min(1).max(3650).default(0),
  reason: z.string().trim().max(200).default(""),
});
export type HealthMemberGrantBody = z.infer<typeof healthMemberGrantBodySchema>;

export const healthCouponRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  kind: z.enum(HEALTH_COUPON_KINDS),
  /** 满减/代金用 reduceCents，折扣用 discountPercent。 */
  reduceCents: z.number(),
  discountPercent: z.number(),
  startFeeCents: z.number(),
  totalCount: z.number(),
  takenCount: z.number(),
  usedCount: z.number(),
  perCustomerLimit: z.number(),
  validDays: z.number(),
  validStart: z.string(),
  validEnd: z.string(),
  /** 适用业务：空数组表示全部。 */
  bizTypes: z.array(z.enum(HEALTH_ORDER_BIZ_TYPES)),
  goodsIds: z.array(z.number()),
  status: z.enum(HEALTH_ON_STATUSES),
});
export type HealthCouponRow = z.infer<typeof healthCouponRowSchema>;

export const healthCouponSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(60),
  kind: z.enum(HEALTH_COUPON_KINDS).default("FULL_REDUCE"),
  reduceCents: z.number().int().min(0).max(99999999).default(0),
  discountPercent: z.number().int().min(1).max(99).default(100),
  startFeeCents: z.number().int().min(0).max(99999999).default(0),
  totalCount: z.number().int().min(0).max(9999999).default(0),
  perCustomerLimit: z.number().int().min(1).max(99).default(1),
  validDays: z.number().int().min(0).max(3650).default(30),
  validStart: z.string().trim().max(32).default(""),
  validEnd: z.string().trim().max(32).default(""),
  bizTypes: z.array(z.enum(HEALTH_ORDER_BIZ_TYPES)).max(14).default([]),
  goodsIds: z.array(z.number().int().positive()).max(200).default([]),
  status: z.enum(HEALTH_ON_STATUSES).default("ON"),
});
export type HealthCouponSaveBody = z.infer<typeof healthCouponSaveBodySchema>;

export const healthCouponTicketRowSchema = z.object({
  id: z.number(),
  couponId: z.number(),
  couponName: z.string(),
  customerLabel: z.string(),
  code: z.string(),
  status: z.enum(HEALTH_COUPON_TICKET_STATUSES),
  receivedAt: z.string(),
  usedAt: z.string(),
  expireAt: z.string(),
  orderId: z.number(),
});
export type HealthCouponTicketRow = z.infer<typeof healthCouponTicketRowSchema>;

export const healthPointRuleRowSchema = z.object({
  id: z.number(),
  action: z.string(),
  label: z.string(),
  pointValue: z.number(),
  dailyLimit: z.number(),
  status: z.enum(HEALTH_ON_STATUSES),
});
export type HealthPointRuleRow = z.infer<typeof healthPointRuleRowSchema>;

export const healthPointRuleSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  action: z.string().trim().min(1).max(40),
  label: z.string().trim().max(60).default(""),
  pointValue: z.number().int().min(-9999).max(9999).default(0),
  dailyLimit: z.number().int().min(0).max(9999).default(0),
  status: z.enum(HEALTH_ON_STATUSES).default("ON"),
});
export type HealthPointRuleSaveBody = z.infer<typeof healthPointRuleSaveBodySchema>;

export const healthPointLogRowSchema = z.object({
  id: z.number(),
  customerId: z.number(),
  customerLabel: z.string(),
  action: z.string(),
  pointValue: z.number(),
  balance: z.number(),
  refType: z.string(),
  refId: z.number(),
  note: z.string(),
  createdAt: z.string(),
});
export type HealthPointLogRow = z.infer<typeof healthPointLogRowSchema>;

/** 统一核销：挂号、体检、签约、年卡权益都走一单一码。 */
export const healthVerifyBodySchema = z.object({
  shopId: z.number().int().positive(),
  code: z.string().trim().min(4).max(32),
  practitionerId: z.number().int().min(0).default(0),
});
export type HealthVerifyBody = z.infer<typeof healthVerifyBodySchema>;

export const healthVerifyResultSchema = z.object({
  ok: z.boolean(),
  order: z.lazy(() => healthOrderRowSchema).nullable(),
  patientName: z.string(),
  serviceName: z.string(),
  message: z.string(),
});
export type HealthVerifyResult = z.infer<typeof healthVerifyResultSchema>;

// ============================================================================
// 十四、统一订单
// ============================================================================

export const healthOrderItemRowSchema = z.object({
  id: z.number(),
  productId: z.number(),
  productName: z.string(),
  skuName: z.string(),
  cover: z.string(),
  quantity: z.number(),
  unitPriceCents: z.number(),
  amountCents: z.number(),
  /** 关联对象：号源、服务、套餐、就诊人、医护等。 */
  refType: z.string(),
  refId: z.number(),
  refLabel: z.string(),
});
export type HealthOrderItemRow = z.infer<typeof healthOrderItemRowSchema>;

export const healthOrderRowSchema = z.object({
  id: z.number(),
  orderNo: z.string(),
  bizType: z.enum(HEALTH_ORDER_BIZ_TYPES),
  bizTypeLabel: z.string(),
  status: z.enum(HEALTH_ORDER_STATUSES),
  payStatus: z.enum(HEALTH_PAY_STATUSES),
  refundStatus: z.string(),
  customerId: z.number(),
  customerName: z.string(),
  customerPhoneMasked: z.string(),
  patientId: z.number(),
  patientName: z.string(),
  practitionerId: z.number(),
  practitionerName: z.string(),
  organId: z.number(),
  organName: z.string(),
  shopEarnCents: z.number(),
  /** 金额（分）：明细合计 → 券 → 积分 → 运费 的完整链路快照。 */
  goodsAmountCents: z.number(),
  serviceAmountCents: z.number(),
  shippingCents: z.number(),
  couponCents: z.number(),
  pointDeductCents: z.number(),
  discountCents: z.number(),
  payAmountCents: z.number(),
  paidCents: z.number(),
  refundAmountCents: z.number(),
  refundableCents: z.number(),
  payType: z.string(),
  walletUsedCents: z.number(),
  pointUsed: z.number(),
  verifyCode: z.string(),
  verified: z.boolean(),
  verifiedAt: z.string(),
  remark: z.string(),
  shopNote: z.string(),
  /** 履约时间轴（按 bizType 取用不同字段）。 */
  appointAt: z.string(),
  slotId: z.number(),
  slotText: z.string(),
  paidAt: z.string(),
  acceptedAt: z.string(),
  shippedAt: z.string(),
  receivedAt: z.string(),
  completedAt: z.string(),
  expireAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type HealthOrderRow = z.infer<typeof healthOrderRowSchema>;

export const healthOrderDetailSchema = z.object({
  order: healthOrderRowSchema,
  items: z.array(healthOrderItemRowSchema),
  priceFlows: z.array(
    z.object({
      step: z.string(),
      label: z.string(),
      amountCents: z.number(),
      refLabel: z.string(),
      createdAt: z.string(),
    }),
  ),
  statusLogs: z.array(
    z.object({ from: z.string(), to: z.string(), note: z.string(), operator: z.string(), createdAt: z.string() }),
  ),
  shipments: z.array(healthShipmentRowSchema),
  aftersales: z.array(healthAftersaleRowSchema),
  shares: z.array(z.lazy(() => healthOrderShareRowSchema)),
  consult: z.lazy(() => healthConsultRowSchema).nullable(),
  prescription: z.lazy(() => healthPrescriptionRowSchema).nullable(),
  review: z.lazy(() => healthReviewRowSchema).nullable(),
});
export type HealthOrderDetail = z.infer<typeof healthOrderDetailSchema>;

export const healthOrderListQuerySchema = z.object({
  shopId: z.coerce.number().int().positive(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  bizType: z.string().default("all"),
  status: z.string().default("all"),
  payStatus: z.string().default("all"),
  practitionerId: z.coerce.number().int().min(0).default(0),
  organId: z.coerce.number().int().min(0).default(0),
  patientId: z.coerce.number().int().min(0).default(0),
  keyword: z.string().default(""),
  from: z.string().default(""),
  to: z.string().default(""),
});
export type HealthOrderListQuery = z.infer<typeof healthOrderListQuerySchema>;

export const healthOrderActionBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().positive(),
  action: z.enum([
    "ACCEPT",
    "ASSIGN",
    "REJECT",
    "START",
    "COMPLETE",
    "SHIP",
    "VERIFY",
    "REMARK",
    "REFUND_APPROVE",
    "REFUND_REJECT",
    "CANCEL",
  ]),
  note: z.string().trim().max(500).default(""),
  practitionerId: z.number().int().min(0).default(0),
  refundAmountCents: z.number().int().min(0).max(99999999).default(0),
});
export type HealthOrderActionBody = z.infer<typeof healthOrderActionBodySchema>;

export const healthOrderStatsSchema = z.object({
  totalCount: z.number(),
  pendingPayCount: z.number(),
  servingCount: z.number(),
  pendingShipCount: z.number(),
  aftersaleCount: z.number(),
  todayCount: z.number(),
  todayPayCents: z.number(),
  monthPayCents: z.number(),
  refundCents: z.number(),
  byBizType: z.array(z.object({ bizType: z.enum(HEALTH_ORDER_BIZ_TYPES), count: z.number(), payCents: z.number() })),
  trend: z.array(z.object({ day: z.string(), count: z.number(), payCents: z.number() })),
});
export type HealthOrderStats = z.infer<typeof healthOrderStatsSchema>;

// ============================================================================
// 十五、资金：钱包、收益、分账、提现与推客
// ============================================================================

export const healthWalletLogRowSchema = z.object({
  id: z.number(),
  customerId: z.number(),
  customerLabel: z.string(),
  kind: z.string(),
  amountCents: z.number(),
  balanceCents: z.number(),
  refType: z.string(),
  refId: z.number(),
  note: z.string(),
  createdAt: z.string(),
});
export type HealthWalletLogRow = z.infer<typeof healthWalletLogRowSchema>;

export const healthCommissionRuleRowSchema = z.object({
  id: z.number(),
  /** 作用域优先级：SERVICE > PRACTITIONER > ORGAN > DEFAULT。 */
  scope: z.enum(["DEFAULT", "ORGAN", "PRACTITIONER", "SERVICE", "TEAM"]),
  scopeId: z.number(),
  scopeName: z.string(),
  bizTypes: z.array(z.enum(HEALTH_ORDER_BIZ_TYPES)),
  organPercent: z.number(),
  practitionerPercent: z.number(),
  promoterPercent: z.number(),
  teamPercent: z.number(),
  shopPercent: z.number(),
  status: z.enum(HEALTH_ON_STATUSES),
  /** 校验结果：各方合计不等于 100% 时给出提示（保存会被拒）。 */
  validateMessage: z.string(),
});
export type HealthCommissionRuleRow = z.infer<typeof healthCommissionRuleRowSchema>;

export const healthCommissionRuleSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  scope: z.enum(["DEFAULT", "ORGAN", "PRACTITIONER", "SERVICE", "TEAM"]),
  scopeId: z.number().int().min(0).default(0),
  bizTypes: z.array(z.enum(HEALTH_ORDER_BIZ_TYPES)).max(14).default([]),
  organPercent: z.number().int().min(0).max(100).default(0),
  practitionerPercent: z.number().int().min(0).max(100).default(0),
  promoterPercent: z.number().int().min(0).max(100).default(0),
  teamPercent: z.number().int().min(0).max(100).default(0),
  status: z.enum(HEALTH_ON_STATUSES).default("ON"),
});
export type HealthCommissionRuleSaveBody = z.infer<
  typeof healthCommissionRuleSaveBodySchema
>;

export const healthOrderShareRowSchema = z.object({
  id: z.number(),
  orderId: z.number(),
  orderNo: z.string(),
  earnerKind: z.enum(HEALTH_EARNER_KINDS),
  earnerId: z.number(),
  earnerName: z.string(),
  percent: z.number(),
  baseCents: z.number(),
  shareCents: z.number(),
  deductedCents: z.number(),
  actualCents: z.number(),
  settleableAt: z.string(),
  settled: z.boolean(),
});
export type HealthOrderShareRow = z.infer<typeof healthOrderShareRowSchema>;

export const healthEarnerRowSchema = z.object({
  earnerKind: z.enum(HEALTH_EARNER_KINDS),
  earnerId: z.number(),
  earnerName: z.string(),
  totalCents: z.number(),
  settleableCents: z.number(),
  withdrawingCents: z.number(),
  withdrawnCents: z.number(),
  pendingCents: z.number(),
  orderCount: z.number(),
  /** 已绑定的收款银行卡（只回后四位与开户行）。 */
  bankLabel: z.string(),
});
export type HealthEarnerRow = z.infer<typeof healthEarnerRowSchema>;

export const healthBankCardRowSchema = z.object({
  id: z.number(),
  earnerKind: z.enum(HEALTH_EARNER_KINDS),
  earnerId: z.number(),
  holderName: z.string(),
  bankName: z.string(),
  branchName: z.string(),
  /** 卡号脱敏：只回后 4 位，明文不入库不回显。 */
  cardTail: z.string(),
  isDefault: z.boolean(),
  createdAt: z.string(),
});
export type HealthBankCardRow = z.infer<typeof healthBankCardRowSchema>;

export const healthBankCardSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  earnerKind: z.enum(HEALTH_EARNER_KINDS).default("PRACTITIONER"),
  earnerId: z.number().int().min(0).default(0),
  holderName: z.string().trim().max(60),
  bankName: z.string().trim().max(60),
  branchName: z.string().trim().max(120).default(""),
  cardNo: z.string().trim().max(32).default(""),
  isDefault: z.boolean().default(false),
});
export type HealthBankCardSaveBody = z.infer<typeof healthBankCardSaveBodySchema>;

export const healthWithdrawalRowSchema = z.object({
  id: z.number(),
  withdrawalNo: z.string(),
  earnerKind: z.enum(HEALTH_EARNER_KINDS),
  earnerId: z.number(),
  earnerName: z.string(),
  amountCents: z.number(),
  taxCents: z.number(),
  feeCents: z.number(),
  actualCents: z.number(),
  status: z.enum(HEALTH_WITHDRAWAL_STATUSES),
  bankLabel: z.string(),
  applyAt: z.string(),
  handledAt: z.string(),
  handleNote: z.string(),
  paidVoucher: z.string(),
});
export type HealthWithdrawalRow = z.infer<typeof healthWithdrawalRowSchema>;

export const healthWithdrawalHandleBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().positive(),
  action: z.enum(["APPROVE", "REJECT", "PAID", "CANCEL"]),
  note: z.string().trim().max(500).default(""),
  paidVoucher: z.string().trim().max(500).default(""),
});
export type HealthWithdrawalHandleBody = z.infer<typeof healthWithdrawalHandleBodySchema>;

export const healthPromoterRowSchema = z.object({
  id: z.number(),
  customerId: z.number(),
  name: z.string(),
  phoneMasked: z.string(),
  auditStatus: z.enum(HEALTH_AUDIT_STATUSES),
  auditReason: z.string(),
  /** 个人override 比例（%），0 表示按店铺默认。 */
  ratePercent: z.number(),
  bindCustomerCount: z.number(),
  orderCount: z.number(),
  earningCents: z.number(),
  settleableCents: z.number(),
  createdAt: z.string(),
});
export type HealthPromoterRow = z.infer<typeof healthPromoterRowSchema>;

export const healthPromoteLogRowSchema = z.object({
  id: z.number(),
  promoterId: z.number(),
  promoterName: z.string(),
  customerId: z.number(),
  customerLabel: z.string(),
  targetType: z.string(),
  targetId: z.number(),
  targetName: z.string(),
  orderId: z.number(),
  commissionCents: z.number(),
  createdAt: z.string(),
});
export type HealthPromoteLogRow = z.infer<typeof healthPromoteLogRowSchema>;

export const healthPosterRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  targetType: z.enum(["SHOP", "SERVICE", "GOODS", "EXAM", "SIGN_PKG", "ARTICLE"]),
  targetId: z.number(),
  background: z.string(),
  qrcodePosition: z.object({ x: z.number(), y: z.number(), size: z.number() }),
  titleText: z.string(),
  subtitleText: z.string(),
  status: z.enum(HEALTH_ON_STATUSES),
});
export type HealthPosterRow = z.infer<typeof healthPosterRowSchema>;

export const healthPosterSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(60),
  targetType: z.enum(["SHOP", "SERVICE", "GOODS", "EXAM", "SIGN_PKG", "ARTICLE"]),
  targetId: z.number().int().min(0).default(0),
  background: z.string().trim().max(500).default(""),
  qrcodePosition: z
    .object({ x: z.number().int().min(0).max(2000), y: z.number().int().min(0).max(4000), size: z.number().int().min(60).max(800) })
    .default({ x: 300, y: 1000, size: 180 }),
  titleText: z.string().trim().max(60).default(""),
  subtitleText: z.string().trim().max(120).default(""),
  status: z.enum(HEALTH_ON_STATUSES).default("ON"),
});
export type HealthPosterSaveBody = z.infer<typeof healthPosterSaveBodySchema>;

// ============================================================================
// 十六、内容、社区、问答、评价与触达
// ============================================================================

export const healthArticleCategoryRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  sort: z.number(),
  status: z.enum(HEALTH_ON_STATUSES),
  articleCount: z.number(),
});
export type HealthArticleCategoryRow = z.infer<typeof healthArticleCategoryRowSchema>;

export const healthArticleCategorySaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(40),
  sort: z.number().int().min(0).max(999).default(0),
  status: z.enum(HEALTH_ON_STATUSES).default("ON"),
});
export type HealthArticleCategorySaveBody = z.infer<typeof healthArticleCategorySaveBodySchema>;

export const healthArticleRowSchema = z.object({
  id: z.number(),
  title: z.string(),
  kind: z.enum(HEALTH_CONTENT_KINDS),
  categoryId: z.number(),
  categoryName: z.string(),
  cover: z.string(),
  mediaUrl: z.string(),
  summary: z.string(),
  authorKind: z.enum(HEALTH_AUTHOR_KINDS),
  authorId: z.number(),
  authorName: z.string(),
  /** 可见范围：公开 / 会员专享 / 指定人群 / 已签约。 */
  visibility: z.enum(["PUBLIC", "MEMBER", "CROWD", "SIGNED"]),
  crowdKinds: z.array(z.enum(HEALTH_CROWD_KINDS)),
  recommend: z.boolean(),
  auditStatus: z.enum(HEALTH_AUDIT_STATUSES),
  auditReason: z.string(),
  status: z.enum(HEALTH_ON_STATUSES),
  readCount: z.number(),
  likeCount: z.number(),
  commentCount: z.number(),
  collectCount: z.number(),
  publishedAt: z.string(),
  createdAt: z.string(),
});
export type HealthArticleRow = z.infer<typeof healthArticleRowSchema>;

export const healthArticleSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().min(0).default(0),
  title: z.string().trim().min(1).max(120),
  kind: z.enum(HEALTH_CONTENT_KINDS).default("ARTICLE"),
  categoryId: z.number().int().min(0).default(0),
  cover: z.string().trim().max(500).default(""),
  mediaUrl: z.string().trim().max(1000).default(""),
  content: z.string().max(60000).default(""),
  summary: z.string().trim().max(300).default(""),
  authorKind: z.enum(HEALTH_AUTHOR_KINDS).default("SHOP"),
  authorId: z.number().int().min(0).default(0),
  visibility: z.enum(["PUBLIC", "MEMBER", "CROWD", "SIGNED"]).default("PUBLIC"),
  crowdKinds: z.array(z.enum(HEALTH_CROWD_KINDS)).max(8).default([]),
  recommend: z.boolean().default(false),
  status: z.enum(HEALTH_ON_STATUSES).default("ON"),
});
export type HealthArticleSaveBody = z.infer<typeof healthArticleSaveBodySchema>;

export const healthPostRowSchema = z.object({
  id: z.number(),
  title: z.string(),
  content: z.string(),
  images: z.array(z.string()),
  authorKind: z.enum(HEALTH_AUTHOR_KINDS),
  authorId: z.number(),
  authorName: z.string(),
  tagIds: z.array(z.number()),
  tagNames: z.array(z.string()),
  auditStatus: z.enum(HEALTH_AUDIT_STATUSES),
  auditReason: z.string(),
  status: z.enum(HEALTH_ON_STATUSES),
  likeCount: z.number(),
  commentCount: z.number(),
  reportCount: z.number(),
  createdAt: z.string(),
});
export type HealthPostRow = z.infer<typeof healthPostRowSchema>;

export const healthPostCommentRowSchema = z.object({
  id: z.number(),
  postId: z.number(),
  postTitle: z.string(),
  parentId: z.number(),
  authorKind: z.enum(HEALTH_AUTHOR_KINDS),
  authorName: z.string(),
  content: z.string(),
  likeCount: z.number(),
  auditStatus: z.enum(HEALTH_AUDIT_STATUSES),
  createdAt: z.string(),
});
export type HealthPostCommentRow = z.infer<typeof healthPostCommentRowSchema>;

export const healthPostTagRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  sort: z.number(),
  status: z.enum(HEALTH_ON_STATUSES),
  postCount: z.number(),
});
export type HealthPostTagRow = z.infer<typeof healthPostTagRowSchema>;

export const healthQuestionRowSchema = z.object({
  id: z.number(),
  title: z.string(),
  detail: z.string(),
  patientId: z.number(),
  patientName: z.string(),
  customerId: z.number(),
  customerName: z.string(),
  crowdKind: z.enum(HEALTH_CROWD_KINDS),
  /** 悬赏（分）：采纳给回答者，未采纳可退。 */
  bountyCents: z.number(),
  isPublic: z.boolean(),
  answerCount: z.number(),
  adoptedAnswerId: z.number(),
  status: z.enum(["OPEN", "ANSWERED", "ADOPTED", "CLOSED"]),
  createdAt: z.string(),
});
export type HealthQuestionRow = z.infer<typeof healthQuestionRowSchema>;

export const healthAnswerRowSchema = z.object({
  id: z.number(),
  questionId: z.number(),
  questionTitle: z.string(),
  practitionerId: z.number(),
  practitionerName: z.string(),
  practitionerTitle: z.string(),
  content: z.string(),
  likeCount: z.number(),
  adopted: z.boolean(),
  auditStatus: z.enum(HEALTH_AUDIT_STATUSES),
  createdAt: z.string(),
});
export type HealthAnswerRow = z.infer<typeof healthAnswerRowSchema>;

export const healthReviewRowSchema = z.object({
  id: z.number(),
  orderId: z.number(),
  orderNo: z.string(),
  bizType: z.enum(HEALTH_ORDER_BIZ_TYPES),
  targetKind: z.enum(["PRACTITIONER", "ORGAN", "GOODS", "SERVICE", "SHOP"]),
  targetId: z.number(),
  targetName: z.string(),
  customerId: z.number(),
  customerLabel: z.string(),
  patientName: z.string(),
  score: z.number(),
  scores: z.record(z.string(), z.number()),
  tags: z.array(z.string()),
  content: z.string(),
  images: z.array(z.string()),
  anonymous: z.boolean(),
  auditStatus: z.enum(HEALTH_AUDIT_STATUSES),
  appealStatus: z.string(),
  reply: z.string(),
  repliedAt: z.string(),
  createdAt: z.string(),
});
export type HealthReviewRow = z.infer<typeof healthReviewRowSchema>;

export const healthReviewReplyBodySchema = z.object({
  shopId: z.number().int().positive(),
  id: z.number().int().positive(),
  reply: z.string().trim().min(1).max(1000),
});
export type HealthReviewReplyBody = z.infer<typeof healthReviewReplyBodySchema>;

export const healthReviewStatRowSchema = z.object({
  targetKind: z.string(),
  targetId: z.number(),
  targetName: z.string(),
  count: z.number(),
  avgScore: z.number(),
  goodPercent: z.number(),
  badCount: z.number(),
  pendingAppeal: z.number(),
});
export type HealthReviewStatRow = z.infer<typeof healthReviewStatRowSchema>;

export const healthBroadcastRowSchema = z.object({
  id: z.number(),
  title: z.string(),
  content: z.string(),
  channel: z.enum(HEALTH_BROADCAST_CHANNELS),
  templateKey: z.string(),
  crowdGroupIds: z.array(z.number()),
  crowdNames: z.array(z.string()),
  targetCount: z.number(),
  sentCount: z.number(),
  failedCount: z.number(),
  status: z.enum(HEALTH_BROADCAST_STATUSES),
  lastError: z.string(),
  scheduledAt: z.string(),
  createdAt: z.string(),
});
export type HealthBroadcastRow = z.infer<typeof healthBroadcastRowSchema>;

export const healthBroadcastCreateBodySchema = z.object({
  shopId: z.number().int().positive(),
  title: z.string().trim().min(1).max(60),
  content: z.string().trim().min(1).max(500),
  channel: z.enum(HEALTH_BROADCAST_CHANNELS).default("IN_APP"),
  templateKey: z.string().trim().max(40).default(""),
  crowdGroupIds: z.array(z.number().int().positive()).max(20).default([]),
  page: z.string().trim().max(200).default(""),
  scheduledAt: z.string().trim().max(32).default(""),
});
export type HealthBroadcastCreateBody = z.infer<typeof healthBroadcastCreateBodySchema>;

export const healthCannedRowSchema = z.object({
  id: z.number(),
  groupKey: z.string(),
  content: z.string(),
  sort: z.number(),
  status: z.enum(HEALTH_ON_STATUSES),
});
export type HealthCannedRow = z.infer<typeof healthCannedRowSchema>;

export const healthHotKeywordRowSchema = z.object({
  id: z.number(),
  keyword: z.string(),
  manual: z.boolean(),
  searchCount: z.number(),
  status: z.enum(HEALTH_ON_STATUSES),
});
export type HealthHotKeywordRow = z.infer<typeof healthHotKeywordRowSchema>;

export const healthSearchLogRowSchema = z.object({
  keyword: z.string(),
  count: z.number(),
  zeroResultCount: z.number(),
  lastAt: z.string(),
});
export type HealthSearchLogRow = z.infer<typeof healthSearchLogRowSchema>;

/** AI客服（service-desk）绑定态：店主在这里看到「在线客服走的是平台 AI客服」这件事的证据。 */
export const healthServiceDeskBindSchema = z.object({
  bound: z.boolean(),
  siteKey: z.string(),
  siteName: z.string(),
  agentCount: z.number(),
  conversationCount: z.number(),
  /** 未绑定时的可操作指引（跳客服板块的哪个页签）。 */
  guideText: z.string(),
  guideHref: z.string(),
});
export type HealthServiceDeskBind = z.infer<typeof healthServiceDeskBindSchema>;

export const healthServiceDeskBindBodySchema = z.object({
  shopId: z.number().int().positive(),
  siteKey: z.string().trim().max(64).default(""),
});
export type HealthServiceDeskBindBody = z.infer<typeof healthServiceDeskBindBodySchema>;

// ----------------------------------------------------------------------------
// AI 医护（店铺级）
//
// 口径：本域只存两件事——「开没开」与「每位医护绑哪个纯AI客服员工」。
// 人设、模型、知识库范围、转人工口径全部属于 AI客服板块，这里只引用它的编号。
// ----------------------------------------------------------------------------

/** 可绑定的 AI 客服员工（来自 AI客服 → 团队，只取在岗的）。 */
export const healthAiStaffAgentSchema = z.object({
  id: z.number(),
  name: z.string(),
  /** AUTO = AI 先接（可转人工）；BOT = 纯AI接待。 */
  mode: z.string(),
  statusLabel: z.string(),
});
export type HealthAiStaffAgent = z.infer<typeof healthAiStaffAgentSchema>;

/** 本店医护的 AI 绑定态。 */
export const healthAiStaffPractitionerSchema = z.object({
  id: z.number(),
  name: z.string(),
  role: z.string(),
  /** 0 = 未绑定。 */
  agentId: z.number(),
  agentName: z.string(),
});
export type HealthAiStaffPractitioner = z.infer<typeof healthAiStaffPractitionerSchema>;

export const healthAiStaffStatusSchema = z.object({
  enabled: z.boolean(),
  /** 本店医护用得最多的那个 AI 客服；一个都没绑定时缺省。 */
  agentId: z.number().optional(),
  agents: z.array(healthAiStaffAgentSchema),
  practitioners: z.array(healthAiStaffPractitionerSchema),
});
export type HealthAiStaffStatus = z.infer<typeof healthAiStaffStatusSchema>;

export const healthAiStaffEnabledBodySchema = z.object({
  shopId: z.number().int().positive(),
  enabled: z.boolean(),
});
export type HealthAiStaffEnabledBody = z.infer<typeof healthAiStaffEnabledBodySchema>;

export const healthAiStaffBindingBodySchema = z.object({
  shopId: z.number().int().positive(),
  practitionerId: z.number().int().positive(),
  /** 0 = 解除绑定。 */
  agentId: z.number().int().min(0),
});
export type HealthAiStaffBindingBody = z.infer<typeof healthAiStaffBindingBodySchema>;

// ============================================================================
// 十六之二、与营销工具「企业微信 SCRM」的松耦合对接
//
// 口径：本域只写自己的绑定表与出站事件表；SCRM 侧若未接入/被平台关闭，
// 事件原样排队（PENDING），本域所有功能照常可用；SCRM 侧也从不反向依赖本域。
// 推送方式是「给企微外部联系人打标签」，后续跟进由 SCRM 自己的 SOP 决定。
// ============================================================================

/** 会进入 SCRM 队列的业务事件。 */
export const HEALTH_SCRM_EVENT_TYPES = [
  "CUSTOMER_CREATED",
  "ORDER_PAID",
  "ORDER_REFUNDED",
  "CONSULT_FINISHED",
  "ALERT_OPEN",
  "FOLLOWUP_DUE",
  "MEMBER_LEVEL_CHANGED",
  "REVIEW_PUBLISHED",
] as const;
export type HealthScrmEventType = (typeof HEALTH_SCRM_EVENT_TYPES)[number];
export const HEALTH_SCRM_EVENT_LABELS: Record<string, string> = {
  CUSTOMER_CREATED: "新顾客",
  ORDER_PAID: "订单支付",
  ORDER_REFUNDED: "订单退款",
  CONSULT_FINISHED: "问诊结束",
  ALERT_OPEN: "指标预警",
  FOLLOWUP_DUE: "随访到期",
  MEMBER_LEVEL_CHANGED: "会员等级变化",
  REVIEW_PUBLISHED: "评价发布",
};

export const HEALTH_SCRM_EVENT_STATUSES = [
  "PENDING",
  "SENT",
  "FAILED",
  "SKIPPED",
] as const;
export type HealthScrmEventStatus = (typeof HEALTH_SCRM_EVENT_STATUSES)[number];
export const HEALTH_SCRM_EVENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "排队中",
  SENT: "已推送",
  FAILED: "推送失败",
  SKIPPED: "已跳过",
};

/** 事件 → 企微标签 id（SCRM 侧标签库里的 id）。 */
export const healthScrmTagMapSchema = z.record(z.string(), z.number().int().min(0));
export type HealthScrmTagMap = z.infer<typeof healthScrmTagMapSchema>;

export const healthScrmLinkSchema = z.object({
  linked: z.boolean(),
  orgType: z.string(),
  orgUserId: z.string(),
  /** SCRM 侧的启用态（只读观测；未接入或停用都不会影响本域）。 */
  scrmAvailable: z.boolean(),
  scrmStatusText: z.string(),
  pushEnabled: z.boolean(),
  pullEnabled: z.boolean(),
  tagMap: healthScrmTagMapSchema,
  pendingCount: z.number(),
  failedCount: z.number(),
  sentCount: z.number(),
  lastPushAt: z.string(),
  lastPullAt: z.string(),
  lastError: z.string(),
  /** 未接入时的操作指引（去营销工具哪个页签）。 */
  guideText: z.string(),
  guideHref: z.string(),
});
export type HealthScrmLink = z.infer<typeof healthScrmLinkSchema>;

export const healthScrmLinkSaveBodySchema = z.object({
  shopId: z.number().int().positive(),
  orgType: z.string().trim().min(1).max(20),
  orgUserId: z.string().trim().min(1).max(64),
  pushEnabled: z.boolean().default(true),
  pullEnabled: z.boolean().default(false),
  tagMap: healthScrmTagMapSchema.default({}),
});
export type HealthScrmLinkSaveBody = z.infer<
  typeof healthScrmLinkSaveBodySchema
>;

export const healthScrmEventRowSchema = z.object({
  id: z.number(),
  eventType: z.enum(HEALTH_SCRM_EVENT_TYPES),
  customerId: z.number(),
  customerName: z.string(),
  refType: z.string(),
  refId: z.number(),
  status: z.enum(HEALTH_SCRM_EVENT_STATUSES),
  attempts: z.number(),
  lastError: z.string(),
  occurredAt: z.string(),
  sentAt: z.string(),
});
export type HealthScrmEventRow = z.infer<typeof healthScrmEventRowSchema>;

export const healthScrmPushBodySchema = z.object({
  shopId: z.number().int().positive(),
  /** 留空 = 把队列里全部 PENDING 推一遍。 */
  ids: z.array(z.number().int().positive()).default([]),
  limit: z.number().int().min(1).max(200).default(50),
});
export type HealthScrmPushBody = z.infer<typeof healthScrmPushBodySchema>;

export const healthScrmPushResultSchema = z.object({
  sent: z.number(),
  skipped: z.number(),
  failed: z.number(),
  message: z.string(),
});
export type HealthScrmPushResult = z.infer<typeof healthScrmPushResultSchema>;

// ============================================================================
// 十七、看板
// ============================================================================

export const healthDashboardSchema = z.object({
  range: z.object({ from: z.string(), to: z.string(), days: z.number() }),
  customerNew: z.number(),
  customerActive: z.number(),
  patientCount: z.number(),
  orderCount: z.number(),
  payCents: z.number(),
  refundCents: z.number(),
  consultCount: z.number(),
  consultAvgAcceptMinutes: z.number(),
  followupTotal: z.number(),
  followupDone: z.number(),
  followupOverdue: z.number(),
  followupDonePercent: z.number(),
  metricLogCount: z.number(),
  alertCount: z.number(),
  alertOpenCount: z.number(),
  prescriptionCount: z.number(),
  prescriptionPendingReview: z.number(),
  goodsShipPending: z.number(),
  aftersalePending: z.number(),
  withdrawalPending: z.number(),
  practitionerActive: z.number(),
  reviewScore: z.number(),
  reviewCount: z.number(),
  trend: z.array(
    z.object({
      day: z.string(),
      customerNew: z.number(),
      orderCount: z.number(),
      payCents: z.number(),
      alertCount: z.number(),
    }),
  ),
  bizMix: z.array(z.object({ bizType: z.enum(HEALTH_ORDER_BIZ_TYPES), count: z.number(), payCents: z.number() })),
  topPractitioners: z.array(
    z.object({
      practitionerId: z.number(),
      name: z.string(),
      orderCount: z.number(),
      earningCents: z.number(),
      score: z.number(),
    }),
  ),
  todo: z.array(z.object({ key: z.string(), label: z.string(), count: z.number(), href: z.string() })),
});
export type HealthDashboard = z.infer<typeof healthDashboardSchema>;

export const healthDashboardQuerySchema = z.object({
  shopId: z.coerce.number().int().positive(),
  days: z.coerce.number().int().min(1).max(365).default(30),
});
export type HealthDashboardQuery = z.infer<typeof healthDashboardQuerySchema>;

// ============================================================================
// 十八、端点面
// ============================================================================

/**
 * id 一律走 query/body：Hono 按注册顺序匹配，静态段会被先注册的 `:param` 兄弟路径吃掉，
 * 本模块从源头规避（与 `_card-shop` 同口径）。
 */
const get = <Q extends z.ZodType, R extends z.ZodType>(path: string, query: Q, response: R) => ({
  method: "get" as const,
  path,
  params: z.object({}),
  query,
  body: z.undefined(),
  response: envelope(response),
});

const post = <B extends z.ZodType, R extends z.ZodType>(path: string, body: B, response: R) => ({
  method: "post" as const,
  path,
  params: z.object({}),
  query: emptyQuery,
  body,
  response: envelope(response),
});

const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({
    list: z.array(item),
    total: z.number(),
    page: z.number(),
    pageSize: z.number(),
  });

const listQuery = <T extends z.ZodRawShape>(extra: T) =>
  healthShopIdQuery({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(20),
    keyword: z.string().default(""),
    status: z.string().default("all"),
    ...extra,
  });

/** 通用「按 id 取详情」查询。 */
const idQuery = z.object({
  shopId: z.coerce.number().int().positive(),
  id: z.coerce.number().int().positive(),
});

const okSchema = z.object({ ok: z.boolean(), message: z.string().default("") });
export type HealthOk = z.infer<typeof okSchema>;

const healthCoreEndpoints = {
  // ---------- 元信息与开店引导 ----------
  Health_meta: get("/enterprise/health/meta", emptyQuery, healthMetaSchema),
  Health_overview: get("/enterprise/health/overview", emptyQuery, healthOverviewSchema),
  Health_dashboard: get("/enterprise/health/dashboard", healthDashboardQuerySchema, healthDashboardSchema),

  // ---------- 店铺 ----------
  Health_shops: get("/enterprise/health/shop/list", emptyQuery, z.array(healthShopRowSchema)),
  Health_shopCreate: post("/enterprise/health/shop/create", healthShopInputSchema, healthShopRowSchema),
  Health_shopDetail: get(
    "/enterprise/health/shop/detail",
    healthShopIdQuery({}),
    healthShopRowSchema,
  ),
  Health_shopSave: post(
    "/enterprise/health/shop/save",
    healthShopIdBody(healthShopInputSchema.shape),
    healthShopRowSchema,
  ),
  Health_shopStatus: post(
    "/enterprise/health/shop/status",
    healthShopIdBody(healthStatusInputSchema.shape),
    healthShopRowSchema,
  ),
  Health_shopClose: post(
    "/enterprise/health/shop/close",
    healthShopIdBody({ reason: z.string().trim().max(200).default("") }),
    healthShopRowSchema,
  ),
  Health_tradeSave: post("/enterprise/health/shop/trade", healthShopIdBody(healthTradeSchema.shape), healthShopRowSchema),
  Health_themeSave: post("/enterprise/health/shop/theme", healthShopIdBody(healthThemeSchema.shape), healthShopRowSchema),

  // ---------- 微信凭据与发布（全部走私域底座） ----------
  Health_wechat: get("/enterprise/health/wechat/detail", healthShopIdQuery({}), miniAppViewSchema),
  Health_wechatSave: post("/enterprise/health/wechat/save", healthShopIdBody(miniAppInputSchema.shape), miniAppViewSchema),
  Health_wechatTest: post(
    "/enterprise/health/wechat/test",
    healthShopIdBody({}),
    miniAppTestResultSchema,
  ),
  Health_qrcode: get(
    "/enterprise/health/qrcode",
    healthShopIdQuery({ page: z.string().default(""), scene: z.string().default("") }),
    healthQrcodeSchema,
  ),

  // ---------- 店内人员与权限 ----------
  Health_staffList: get("/enterprise/health/staff/list", healthShopIdQuery({}), z.array(healthStaffRowSchema)),
  Health_staffScopes: get("/enterprise/health/staff/scopes", healthShopIdQuery({}), z.array(healthStaffScopeSchema)),
  Health_staffSave: post("/enterprise/health/staff/save", healthStaffSaveBodySchema, healthStaffRowSchema),
  Health_staffRemove: post("/enterprise/health/staff/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),

  // ---------- AI客服绑定（沟通统一走平台客服系统） ----------
  Health_serviceDeskBind: get("/enterprise/health/service-desk", healthShopIdQuery({}), healthServiceDeskBindSchema),
  Health_serviceDeskBindSave: post("/enterprise/health/service-desk/bind", healthServiceDeskBindBodySchema, healthServiceDeskBindSchema),

  // ---------- AI 医护（只引用 AI客服的纯AI客服员工） ----------
  Health_aiStatus: get("/enterprise/health/ai/status", healthShopIdQuery({}), healthAiStaffStatusSchema),
  Health_aiEnabledSave: post("/enterprise/health/ai/enabled", healthAiStaffEnabledBodySchema, healthAiStaffStatusSchema),
  Health_aiBindingSave: post("/enterprise/health/ai/binding", healthAiStaffBindingBodySchema, healthAiStaffStatusSchema),

  // ---------- SCRM 松耦合对接 ----------
  Health_scrmLink: get("/enterprise/health/scrm/link", healthShopIdQuery({}), healthScrmLinkSchema),
  Health_scrmLinkSave: post("/enterprise/health/scrm/link/save", healthScrmLinkSaveBodySchema, healthScrmLinkSchema),
  Health_scrmLinkRemove: post("/enterprise/health/scrm/link/remove", healthShopIdBody({}), okSchema),
  Health_scrmEvents: get(
    "/enterprise/health/scrm/event/list",
    listQuery({
      eventType: z.string().default("all"),
      eventStatus: z.string().default("all"),
    }),
    pageOf(healthScrmEventRowSchema),
  ),
  Health_scrmPush: post("/enterprise/health/scrm/push", healthScrmPushBodySchema, healthScrmPushResultSchema),
  Health_scrmSkip: post("/enterprise/health/scrm/skip", healthShopIdBody({ ids: z.array(z.number().int().positive()).min(1).max(200) }), okSchema),

  // ---------- 装修、公告、协议与服务入口 ----------
  Health_bannerList: get("/enterprise/health/banner/list", healthShopIdQuery({}), z.array(healthBannerRowSchema)),
  Health_bannerSave: post("/enterprise/health/banner/save", healthBannerSaveBodySchema, healthBannerRowSchema),
  Health_bannerRemove: post("/enterprise/health/banner/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_noticeList: get("/enterprise/health/notice/list", healthShopIdQuery({}), z.array(healthNoticeRowSchema)),
  Health_noticeSave: post(
    "/enterprise/health/notice/save",
    healthShopIdBody({
      id: z.number().int().min(0).default(0),
      title: z.string().trim().max(80),
      content: z.string().trim().max(2000),
      sort: z.number().int().min(0).max(999).default(0),
      status: z.enum(HEALTH_ON_STATUSES).default("ON"),
    }),
    healthNoticeRowSchema,
  ),
  Health_noticeRemove: post("/enterprise/health/notice/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_diyPageList: get("/enterprise/health/diy/list", healthShopIdQuery({}), z.array(healthDiyPageRowSchema)),
  Health_diyPageSave: post("/enterprise/health/diy/save", healthDiyPageSaveBodySchema, healthDiyPageRowSchema),
  Health_serviceEntryList: get("/enterprise/health/entry/list", healthShopIdQuery({}), z.array(healthServiceEntryRowSchema)),
  Health_serviceEntrySave: post("/enterprise/health/entry/save", healthServiceEntrySaveBodySchema, z.array(healthServiceEntryRowSchema)),
  Health_agreementList: get("/enterprise/health/agreement/list", healthShopIdQuery({}), z.array(healthAgreementRowSchema)),
  Health_agreementSave: post("/enterprise/health/agreement/save", healthAgreementSaveBodySchema, healthAgreementRowSchema),
};

const healthSubjectEndpoints = {
  // ---------- 医院与科室 ----------
  Health_hospitals: get("/enterprise/health/hospital/list", listQuery({ city: z.string().default("") }), pageOf(healthHospitalRowSchema)),
  Health_hospitalSave: post("/enterprise/health/hospital/save", healthHospitalSaveBodySchema, healthHospitalRowSchema),
  Health_hospitalRemove: post("/enterprise/health/hospital/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_departments: get("/enterprise/health/department/list", listQuery({ hospitalId: z.coerce.number().int().min(0).default(0) }), pageOf(healthDepartmentRowSchema)),
  Health_departmentSave: post("/enterprise/health/department/save", healthDepartmentSaveBodySchema, healthDepartmentRowSchema),
  Health_departmentRemove: post("/enterprise/health/department/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_cities: get("/enterprise/health/city/list", healthShopIdQuery({}), z.array(healthCityRowSchema)),
  Health_citySave: post("/enterprise/health/city/save", healthCitySaveBodySchema, healthCityRowSchema),
  Health_cityRemove: post("/enterprise/health/city/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),

  // ---------- 机构与入驻审核 ----------
  Health_organs: get("/enterprise/health/organ/list", listQuery({ kind: z.string().default("all") }), pageOf(healthOrganRowSchema)),
  Health_organDetail: get("/enterprise/health/organ/detail", idQuery, healthOrganRowSchema),
  Health_organSave: post("/enterprise/health/organ/save", healthOrganSaveBodySchema, healthOrganRowSchema),
  Health_organAudit: post(
    "/enterprise/health/organ/audit",
    healthShopIdBody({ id: z.number().int().positive(), approved: z.boolean(), reason: z.string().trim().max(200).default("") }),
    healthOrganRowSchema,
  ),
  Health_organRemove: post("/enterprise/health/organ/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_applications: get("/enterprise/health/application/list", listQuery({ kind: z.string().default("all") }), pageOf(healthApplicationRowSchema)),

  // ---------- 医护 ----------
  Health_practitioners: get(
    "/enterprise/health/practitioner/list",
    listQuery({
      role: z.string().default("all"),
      organId: z.coerce.number().int().min(0).default(0),
      hospitalId: z.coerce.number().int().min(0).default(0),
      departmentId: z.coerce.number().int().min(0).default(0),
    }),
    pageOf(healthPractitionerRowSchema),
  ),
  Health_practitionerDetail: get("/enterprise/health/practitioner/detail", idQuery, healthPractitionerRowSchema),
  Health_practitionerSave: post("/enterprise/health/practitioner/save", healthPractitionerSaveBodySchema, healthPractitionerRowSchema),
  Health_practitionerAudit: post(
    "/enterprise/health/practitioner/audit",
    healthShopIdBody({ id: z.number().int().positive(), approved: z.boolean(), reason: z.string().trim().max(200).default("") }),
    healthPractitionerRowSchema,
  ),
  Health_practitionerStatus: post(
    "/enterprise/health/practitioner/status",
    healthShopIdBody(healthStatusInputSchema.shape),
    healthPractitionerRowSchema,
  ),
  Health_practitionerRemove: post("/enterprise/health/practitioner/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_practitionerServiceSave: post(
    "/enterprise/health/practitioner/service/save",
    healthPractitionerServiceSaveBodySchema,
    healthPractitionerRowSchema,
  ),
  Health_practitionerServiceRemove: post(
    "/enterprise/health/practitioner/service/remove",
    healthShopIdBody({ id: z.number().int().positive() }),
    healthPractitionerRowSchema,
  ),

  // ---------- 团队 ----------
  Health_teams: get("/enterprise/health/team/list", listQuery({ organId: z.coerce.number().int().min(0).default(0) }), pageOf(healthTeamRowSchema)),
  Health_teamDetail: get("/enterprise/health/team/detail", idQuery, z.object({ team: healthTeamRowSchema, members: z.array(healthTeamMemberRowSchema), notices: z.array(healthTeamNoticeRowSchema), joins: z.array(healthTeamJoinRowSchema) })),
  Health_teamSave: post("/enterprise/health/team/save", healthTeamSaveBodySchema, healthTeamRowSchema),
  Health_teamRemove: post("/enterprise/health/team/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_teamMemberAdd: post(
    "/enterprise/health/team/member/add",
    healthShopIdBody({ teamId: z.number().int().positive(), practitionerId: z.number().int().positive(), isLeader: z.boolean().default(false) }),
    healthTeamMemberRowSchema,
  ),
  Health_teamMemberRemove: post(
    "/enterprise/health/team/member/remove",
    healthShopIdBody({ id: z.number().int().positive() }),
    okSchema,
  ),
  Health_teamNoticeSave: post(
    "/enterprise/health/team/notice/save",
    healthShopIdBody({ id: z.number().int().min(0).default(0), teamId: z.number().int().positive(), title: z.string().trim().max(80), content: z.string().trim().max(4000) }),
    healthTeamNoticeRowSchema,
  ),
  Health_teamNoticeRemove: post("/enterprise/health/team/notice/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_teamJoinAudit: post(
    "/enterprise/health/team/join/audit",
    healthShopIdBody({ id: z.number().int().positive(), approved: z.boolean(), reason: z.string().trim().max(200).default("") }),
    healthTeamJoinRowSchema,
  ),
};

const healthArchiveEndpoints = {
  // ---------- 顾客 ----------
  Health_customers: get(
    "/enterprise/health/customer/list",
    listQuery({ memberLevelId: z.coerce.number().int().min(0).default(0), crowdGroupId: z.coerce.number().int().min(0).default(0) }),
    pageOf(healthCustomerRowSchema),
  ),
  Health_customerDetail: get("/enterprise/health/customer/detail", idQuery, healthCustomerDetailSchema),
  Health_customerSave: post("/enterprise/health/customer/save", healthCustomerSaveBodySchema, healthCustomerRowSchema),
  Health_customerExport: get(
    "/enterprise/health/customer/export",
    healthShopIdQuery({}),
    z.object({ url: z.string(), fileName: z.string(), count: z.number(), message: z.string() }),
  ),

  // ---------- 就诊人 ----------
  Health_patients: get(
    "/enterprise/health/patient/list",
    listQuery({
      customerId: z.coerce.number().int().min(0).default(0),
      practitionerId: z.coerce.number().int().min(0).default(0),
      crowdGroupId: z.coerce.number().int().min(0).default(0),
    }),
    pageOf(healthPatientRowSchema),
  ),
  Health_patientDetail: get("/enterprise/health/patient/detail", idQuery, healthPatientRowSchema),
  Health_patientSave: post("/enterprise/health/patient/save", healthPatientSaveBodySchema, healthPatientRowSchema),
  Health_patientRemove: post("/enterprise/health/patient/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_patientMove: post(
    "/enterprise/health/patient/move",
    healthShopIdBody({
      patientIds: z.array(z.number().int().positive()).min(1).max(200),
      practitionerId: z.number().int().min(0).default(0),
      crowdGroupIds: z.array(z.number().int().positive()).max(20).default([]),
      replace: z.boolean().default(false),
    }),
    okSchema,
  ),

  // ---------- 人群分组 ----------
  Health_crowdGroups: get("/enterprise/health/crowd/list", healthShopIdQuery({}), z.array(healthCrowdGroupRowSchema)),
  Health_crowdGroupSave: post("/enterprise/health/crowd/save", healthCrowdGroupSaveBodySchema, healthCrowdGroupRowSchema),
  Health_crowdGroupRemove: post("/enterprise/health/crowd/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),

  // ---------- 档案 ----------
  Health_recordDetail: get("/enterprise/health/record/detail", idQuery, healthRecordRowSchema),
  Health_recordSave: post("/enterprise/health/record/save", healthRecordSaveBodySchema, healthRecordRowSchema),
  Health_recordItemSave: post("/enterprise/health/record/item/save", healthRecordItemSaveBodySchema, healthRecordRowSchema),
  Health_recordItemRemove: post(
    "/enterprise/health/record/item/remove",
    healthShopIdBody({ patientId: z.number().int().positive(), id: z.number().int().positive() }),
    healthRecordRowSchema,
  ),
  Health_medicalEventList: get(
    "/enterprise/health/medical-event/list",
    listQuery({ patientId: z.coerce.number().int().min(0).default(0), kind: z.string().default("all") }),
    pageOf(healthMedicalEventRowSchema),
  ),
  Health_medicalEventSave: post("/enterprise/health/medical-event/save", healthMedicalEventSaveBodySchema, healthMedicalEventRowSchema),
  Health_medicalEventRemove: post("/enterprise/health/medical-event/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_dictList: get("/enterprise/health/dict/list", healthShopIdQuery({ groupKey: z.string().default("") }), z.array(healthDictItemRowSchema)),
  Health_dictSave: post("/enterprise/health/dict/save", healthDictItemSaveBodySchema, healthDictItemRowSchema),
  Health_dictRemove: post("/enterprise/health/dict/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),

  // ---------- 指标与趋势 ----------
  Health_metrics: get("/enterprise/health/metric/list", healthShopIdQuery({}), z.array(healthMetricRowSchema)),
  Health_metricSave: post("/enterprise/health/metric/save", healthMetricSaveBodySchema, healthMetricRowSchema),
  Health_metricRemove: post("/enterprise/health/metric/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_metricLogs: get(
    "/enterprise/health/metric/log/list",
    listQuery({ patientId: z.coerce.number().int().min(0).default(0), metricId: z.coerce.number().int().min(0).default(0), abnormalOnly: z.coerce.number().int().min(0).max(1).default(0), from: z.string().default(""), to: z.string().default("") }),
    pageOf(healthMetricLogRowSchema),
  ),
  Health_metricLogSave: post("/enterprise/health/metric/log/save", healthMetricLogSaveBodySchema, healthMetricLogRowSchema),
  Health_metricLogRemove: post("/enterprise/health/metric/log/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_metricTrend: get(
    "/enterprise/health/metric/trend",
    healthShopIdQuery({
      patientId: z.coerce.number().int().positive(),
      metricId: z.coerce.number().int().positive(),
      days: z.coerce.number().int().min(1).max(730).default(90),
      granularity: z.enum(["DAY", "WEEK", "MONTH"]).default("DAY"),
    }),
    healthMetricTrendSchema,
  ),

  // ---------- 预警 ----------
  Health_alertRules: get("/enterprise/health/alert-rule/list", healthShopIdQuery({}), z.array(healthAlertRuleRowSchema)),
  Health_alertRuleSave: post("/enterprise/health/alert-rule/save", healthAlertRuleSaveBodySchema, healthAlertRuleRowSchema),
  Health_alertRuleRemove: post("/enterprise/health/alert-rule/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_alerts: get(
    "/enterprise/health/alert/list",
    listQuery({ patientId: z.coerce.number().int().min(0).default(0), ruleId: z.coerce.number().int().min(0).default(0), alertStatus: z.string().default("all") }),
    pageOf(healthAlertRowSchema),
  ),
  Health_alertHandle: post("/enterprise/health/alert/handle", healthAlertHandleBodySchema, healthAlertRowSchema),
};

const healthSlotEndpoints = {
  // ---------- 服务项目与号源 ----------
  Health_services: get(
    "/enterprise/health/service/list",
    listQuery({ bizType: z.string().default("all"), category: z.string().default("") }),
    pageOf(healthServiceRowSchema),
  ),
  Health_serviceSave: post("/enterprise/health/service/save", healthServiceSaveBodySchema, healthServiceRowSchema),
  Health_serviceStatus: post("/enterprise/health/service/status", healthShopIdBody(healthStatusInputSchema.shape), healthServiceRowSchema),
  Health_serviceRemove: post("/enterprise/health/service/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_shiftTemplates: get(
    "/enterprise/health/shift-template/list",
    healthShopIdQuery({ practitionerId: z.coerce.number().int().min(0).default(0) }),
    z.array(healthShiftTemplateRowSchema),
  ),
  Health_shiftTemplateSave: post("/enterprise/health/shift-template/save", healthShiftTemplateSaveBodySchema, healthShiftTemplateRowSchema),
  Health_shiftTemplateRemove: post("/enterprise/health/shift-template/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_shiftGenerate: post("/enterprise/health/shift/generate", healthShiftGenerateBodySchema, healthShiftGenerateResultSchema),
  Health_slotCalendar: get("/enterprise/health/slot/calendar", healthSlotCalendarQuerySchema, healthSlotCalendarSchema),
  Health_slotBlock: post("/enterprise/health/slot/block", healthSlotBlockBodySchema, healthSlotRowSchema),

  // ---------- 问诊规则与问诊单 ----------
  Health_consultRules: get(
    "/enterprise/health/consult-rule/list",
    healthShopIdQuery({ practitionerId: z.coerce.number().int().min(0).default(0) }),
    z.array(healthConsultRuleRowSchema),
  ),
  Health_consultRuleSave: post("/enterprise/health/consult-rule/save", healthConsultRuleSaveBodySchema, healthConsultRuleRowSchema),
  Health_consultRuleRemove: post("/enterprise/health/consult-rule/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_consults: get(
    "/enterprise/health/consult/list",
    listQuery({
      consultBizType: z.string().default("all"),
      consultStatus: z.string().default("all"),
      practitionerId: z.coerce.number().int().min(0).default(0),
      from: z.string().default(""),
      to: z.string().default(""),
    }),
    pageOf(healthConsultRowSchema),
  ),
  Health_consultDetail: get("/enterprise/health/consult/detail", idQuery, healthConsultRowSchema),
  Health_consultCreate: post("/enterprise/health/consult/create", healthConsultCreateBodySchema, healthConsultRowSchema),
  Health_consultAction: post("/enterprise/health/consult/action", healthConsultActionBodySchema, healthConsultRowSchema),
  Health_consultSession: get(
    "/enterprise/health/consult/session",
    idQuery,
    healthConsultSessionSchema,
  ),

  // ---------- 家医签约 ----------
  Health_signPackages: get("/enterprise/health/sign-package/list", listQuery({ teamId: z.coerce.number().int().min(0).default(0) }), pageOf(healthSignPackageRowSchema)),
  Health_signPackageSave: post("/enterprise/health/sign-package/save", healthSignPackageSaveBodySchema, healthSignPackageRowSchema),
  Health_signPackageRemove: post("/enterprise/health/sign-package/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_signOrders: get(
    "/enterprise/health/sign-order/list",
    listQuery({ patientId: z.coerce.number().int().min(0).default(0), signStatus: z.string().default("all") }),
    pageOf(healthSignOrderRowSchema),
  ),
  Health_signOrderDetail: get("/enterprise/health/sign-order/detail", idQuery, healthSignOrderRowSchema),
  Health_signOrderSignSave: post(
    "/enterprise/health/sign-order/sign-save",
    healthShopIdBody({ id: z.number().int().positive(), signPhotoUrl: z.string().trim().max(500).default(""), signatureUrl: z.string().trim().max(500).default("") }),
    healthSignOrderRowSchema,
  ),

  // ---------- 绿通与手术快约 ----------
  Health_greenOrders: get("/enterprise/health/green/list", listQuery({ greenStatus: z.string().default("all"), kind: z.string().default("all") }), pageOf(healthGreenOrderRowSchema)),
  Health_greenDetail: get("/enterprise/health/green/detail", idQuery, healthGreenOrderRowSchema),
  Health_greenProgress: post("/enterprise/health/green/progress", healthGreenProgressBodySchema, healthGreenOrderRowSchema),

  // ---------- 疾病百科与导诊 ----------
  Health_diseases: get("/enterprise/health/disease/list", listQuery({ category: z.string().default("") }), pageOf(healthDiseaseRowSchema)),
  Health_diseaseSave: post("/enterprise/health/disease/save", healthDiseaseSaveBodySchema, healthDiseaseRowSchema),
  Health_diseaseRemove: post("/enterprise/health/disease/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_guidanceSimulate: post(
    "/enterprise/health/guidance/simulate",
    healthShopIdBody({ symptomNames: z.array(z.string().trim().max(30)).min(1).max(20), patientAge: z.number().int().min(0).max(120).default(0), patientGender: z.string().trim().max(8).default("") }),
    healthGuidanceResultSchema,
  ),

  // ---------- 体检与报告 ----------
  Health_examItems: get("/enterprise/health/exam-item/list", listQuery({ category: z.string().default("") }), pageOf(healthExamItemRowSchema)),
  Health_examItemSave: post("/enterprise/health/exam-item/save", healthExamItemSaveBodySchema, healthExamItemRowSchema),
  Health_examItemRemove: post("/enterprise/health/exam-item/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_examPackages: get("/enterprise/health/exam-package/list", listQuery({ cityId: z.coerce.number().int().min(0).default(0), crowdKind: z.string().default("all") }), pageOf(healthExamPackageRowSchema)),
  Health_examPackageDetail: get("/enterprise/health/exam-package/detail", idQuery, healthExamPackageRowSchema),
  Health_examPackageSave: post("/enterprise/health/exam-package/save", healthExamPackageSaveBodySchema, healthExamPackageRowSchema),
  Health_examPackageRemove: post("/enterprise/health/exam-package/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_reports: get(
    "/enterprise/health/report/list",
    listQuery({ patientId: z.coerce.number().int().min(0).default(0), kind: z.string().default("all"), abnormalOnly: z.coerce.number().int().min(0).max(1).default(0) }),
    pageOf(healthReportRowSchema),
  ),
  Health_reportDetail: get("/enterprise/health/report/detail", idQuery, healthReportDetailSchema),
  Health_reportSave: post("/enterprise/health/report/save", healthReportSaveBodySchema, healthReportRowSchema),
  Health_reportRemove: post("/enterprise/health/report/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_reportAdviceSave: post("/enterprise/health/report/advice/save", healthReportAdviceSaveBodySchema, healthReportDetailSchema),
};

const healthShopTradeEndpoints = {
  // ---------- 商品 ----------
  Health_goodsCategories: get("/enterprise/health/goods-category/list", healthShopIdQuery({}), z.array(healthGoodsCategoryRowSchema)),
  Health_goodsCategorySave: post("/enterprise/health/goods-category/save", healthGoodsCategorySaveBodySchema, healthGoodsCategoryRowSchema),
  Health_goodsCategoryRemove: post("/enterprise/health/goods-category/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_goods: get(
    "/enterprise/health/goods/list",
    listQuery({
      categoryId: z.coerce.number().int().min(0).default(0),
      kind: z.string().default("all"),
      prescriptionOnly: z.coerce.number().int().min(0).max(1).default(0),
      lowStock: z.coerce.number().int().min(0).max(1).default(0),
    }),
    pageOf(healthGoodsRowSchema),
  ),
  Health_goodsDetail: get("/enterprise/health/goods/detail", idQuery, healthGoodsRowSchema),
  Health_goodsSave: post("/enterprise/health/goods/save", healthGoodsSaveBodySchema, healthGoodsRowSchema),
  Health_goodsStatus: post("/enterprise/health/goods/status", healthShopIdBody(healthStatusInputSchema.shape), healthGoodsRowSchema),
  Health_goodsRemove: post("/enterprise/health/goods/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_goodsStockAdjust: post(
    "/enterprise/health/goods/stock",
    healthShopIdBody({ id: z.number().int().positive(), skuId: z.number().int().min(0).default(0), delta: z.number().int().min(-999999).max(999999), note: z.string().trim().max(200).default("") }),
    healthGoodsRowSchema,
  ),

  // ---------- 药品字典 ----------
  Health_drugs: get("/enterprise/health/drug/list", listQuery({ prescriptionOnly: z.coerce.number().int().min(0).max(1).default(0) }), pageOf(healthDrugRowSchema)),
  Health_drugSave: post("/enterprise/health/drug/save", healthDrugSaveBodySchema, healthDrugRowSchema),
  Health_drugRemove: post("/enterprise/health/drug/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),

  // ---------- 物流与售后 ----------
  Health_expressCompanies: get("/enterprise/health/express/list", healthShopIdQuery({}), z.array(healthExpressCompanyRowSchema)),
  Health_expressSave: post(
    "/enterprise/health/express/save",
    healthShopIdBody({
      id: z.number().int().min(0).default(0),
      name: z.string().trim().min(1).max(60),
      code: z.string().trim().max(40).default(""),
      phone: z.string().trim().max(32).default(""),
      status: z.enum(HEALTH_ON_STATUSES).default("ON"),
    }),
    healthExpressCompanyRowSchema,
  ),
  Health_expressRemove: post("/enterprise/health/express/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_shippingTemplates: get("/enterprise/health/shipping-template/list", healthShopIdQuery({}), z.array(healthShippingTemplateRowSchema)),
  Health_shippingTemplateSave: post("/enterprise/health/shipping-template/save", healthShippingTemplateSaveBodySchema, healthShippingTemplateRowSchema),
  Health_shippingTemplateRemove: post("/enterprise/health/shipping-template/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_aftersales: get("/enterprise/health/aftersale/list", listQuery({ aftersaleStatus: z.string().default("all"), kind: z.string().default("all") }), pageOf(healthAftersaleRowSchema)),
  Health_aftersaleDetail: get("/enterprise/health/aftersale/detail", idQuery, healthAftersaleRowSchema),
  Health_aftersaleHandle: post("/enterprise/health/aftersale/handle", healthAftersaleHandleBodySchema, healthAftersaleRowSchema),

  // ---------- 会员 / 券 / 积分 ----------
  Health_memberLevels: get("/enterprise/health/member-level/list", healthShopIdQuery({}), z.array(healthMemberLevelRowSchema)),
  Health_memberLevelSave: post("/enterprise/health/member-level/save", healthMemberLevelSaveBodySchema, healthMemberLevelRowSchema),
  Health_memberLevelRemove: post("/enterprise/health/member-level/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_memberCards: get("/enterprise/health/member-card/list", listQuery({}), pageOf(healthMemberCardRowSchema)),
  Health_memberCardSave: post("/enterprise/health/member-card/save", healthMemberCardSaveBodySchema, healthMemberCardRowSchema),
  Health_memberCardRemove: post("/enterprise/health/member-card/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_memberGrants: get("/enterprise/health/member-grant/list", listQuery({ grantStatus: z.string().default("all"), customerId: z.coerce.number().int().min(0).default(0) }), pageOf(healthMemberGrantRowSchema)),
  Health_memberGrant: post("/enterprise/health/member-grant/grant", healthMemberGrantBodySchema, z.object({ granted: z.number(), message: z.string() })),
  Health_memberGrantRevoke: post(
    "/enterprise/health/member-grant/revoke",
    healthShopIdBody({ id: z.number().int().positive(), reason: z.string().trim().max(200).default("") }),
    healthMemberGrantRowSchema,
  ),
  Health_coupons: get("/enterprise/health/coupon/list", listQuery({}), pageOf(healthCouponRowSchema)),
  Health_couponSave: post("/enterprise/health/coupon/save", healthCouponSaveBodySchema, healthCouponRowSchema),
  Health_couponRemove: post("/enterprise/health/coupon/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_couponTickets: get("/enterprise/health/coupon/ticket/list", listQuery({ couponId: z.coerce.number().int().min(0).default(0), ticketStatus: z.string().default("all") }), pageOf(healthCouponTicketRowSchema)),
  Health_pointRules: get("/enterprise/health/point-rule/list", healthShopIdQuery({}), z.array(healthPointRuleRowSchema)),
  Health_pointRuleSave: post("/enterprise/health/point-rule/save", healthPointRuleSaveBodySchema, healthPointRuleRowSchema),
  Health_pointLogs: get("/enterprise/health/point/log/list", listQuery({ customerId: z.coerce.number().int().min(0).default(0) }), pageOf(healthPointLogRowSchema)),
  Health_pointAdjust: post(
    "/enterprise/health/point/adjust",
    healthShopIdBody({ customerId: z.number().int().positive(), pointValue: z.number().int().min(-999999).max(999999), note: z.string().trim().max(200) }),
    healthPointLogRowSchema,
  ),
  Health_verify: post("/enterprise/health/verify", healthVerifyBodySchema, healthVerifyResultSchema),

  // ---------- 订单 ----------
  Health_orders: get("/enterprise/health/order/list", healthOrderListQuerySchema, pageOf(healthOrderRowSchema)),
  Health_orderDetail: get("/enterprise/health/order/detail", idQuery, healthOrderDetailSchema),
  Health_orderAction: post("/enterprise/health/order/action", healthOrderActionBodySchema, healthOrderRowSchema),
  Health_orderDeliver: post("/enterprise/health/order/deliver", healthDeliverBodySchema, healthOrderRowSchema),
  Health_orderStats: get("/enterprise/health/order/stats", healthDashboardQuerySchema, healthOrderStatsSchema),
  Health_orderExport: get(
    "/enterprise/health/order/export",
    healthOrderListQuerySchema.omit({ page: true, pageSize: true }).extend({ shopId: z.coerce.number().int().positive() }),
    z.object({ url: z.string(), fileName: z.string(), count: z.number(), message: z.string() }),
  ),

  // ---------- 资金 ----------
  Health_walletLogs: get("/enterprise/health/wallet/log/list", listQuery({ customerId: z.coerce.number().int().min(0).default(0) }), pageOf(healthWalletLogRowSchema)),
  Health_commissionRules: get("/enterprise/health/commission/list", healthShopIdQuery({}), z.array(healthCommissionRuleRowSchema)),
  Health_commissionRuleSave: post("/enterprise/health/commission/save", healthCommissionRuleSaveBodySchema, healthCommissionRuleRowSchema),
  Health_commissionRuleRemove: post("/enterprise/health/commission/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_orderShares: get("/enterprise/health/share/list", listQuery({ orderId: z.coerce.number().int().min(0).default(0), earnerKind: z.string().default("all") }), pageOf(healthOrderShareRowSchema)),
  Health_earners: get("/enterprise/health/earner/list", healthShopIdQuery({ earnerKind: z.string().default("all") }), z.array(healthEarnerRowSchema)),
  Health_bankCards: get("/enterprise/health/bank/list", healthShopIdQuery({ earnerKind: z.string().default("all"), earnerId: z.coerce.number().int().min(0).default(0) }), z.array(healthBankCardRowSchema)),
  Health_bankCardSave: post("/enterprise/health/bank/save", healthBankCardSaveBodySchema, healthBankCardRowSchema),
  Health_bankCardRemove: post("/enterprise/health/bank/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_withdrawals: get("/enterprise/health/withdrawal/list", listQuery({ withdrawalStatus: z.string().default("all"), earnerKind: z.string().default("all") }), pageOf(healthWithdrawalRowSchema)),
  Health_withdrawalHandle: post("/enterprise/health/withdrawal/handle", healthWithdrawalHandleBodySchema, healthWithdrawalRowSchema),

  // ---------- 推客分销 ----------
  Health_promoters: get("/enterprise/health/promoter/list", listQuery({ auditStatus: z.string().default("all") }), pageOf(healthPromoterRowSchema)),
  Health_promoterAudit: post(
    "/enterprise/health/promoter/audit",
    healthShopIdBody({ id: z.number().int().positive(), approved: z.boolean(), ratePercent: z.number().int().min(0).max(50).default(0), reason: z.string().trim().max(200).default("") }),
    healthPromoterRowSchema,
  ),
  Health_promoteLogs: get("/enterprise/health/promoter/log/list", listQuery({ promoterId: z.coerce.number().int().min(0).default(0) }), pageOf(healthPromoteLogRowSchema)),
  Health_posters: get("/enterprise/health/poster/list", healthShopIdQuery({}), z.array(healthPosterRowSchema)),
  Health_posterSave: post("/enterprise/health/poster/save", healthPosterSaveBodySchema, healthPosterRowSchema),
  Health_posterRemove: post("/enterprise/health/poster/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
};

const healthContentEndpoints = {
  // ---------- 科普与课程 ----------
  Health_articleCategories: get("/enterprise/health/article-category/list", healthShopIdQuery({}), z.array(healthArticleCategoryRowSchema)),
  Health_articleCategorySave: post("/enterprise/health/article-category/save", healthArticleCategorySaveBodySchema, healthArticleCategoryRowSchema),
  Health_articleCategoryRemove: post("/enterprise/health/article-category/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_articles: get(
    "/enterprise/health/article/list",
    listQuery({
      kind: z.string().default("all"),
      categoryId: z.coerce.number().int().min(0).default(0),
      authorKind: z.string().default("all"),
      auditStatus: z.string().default("all"),
    }),
    pageOf(healthArticleRowSchema),
  ),
  Health_articleDetail: get("/enterprise/health/article/detail", idQuery, z.object({ article: healthArticleRowSchema, content: z.string() })),
  Health_articleSave: post("/enterprise/health/article/save", healthArticleSaveBodySchema, healthArticleRowSchema),
  Health_articleAudit: post(
    "/enterprise/health/article/audit",
    healthShopIdBody({ id: z.number().int().positive(), approved: z.boolean(), reason: z.string().trim().max(200).default("") }),
    healthArticleRowSchema,
  ),
  Health_articleRemove: post("/enterprise/health/article/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),

  // ---------- 病友圈 ----------
  Health_postTags: get("/enterprise/health/post-tag/list", healthShopIdQuery({}), z.array(healthPostTagRowSchema)),
  Health_postTagSave: post(
    "/enterprise/health/post-tag/save",
    healthShopIdBody({ id: z.number().int().min(0).default(0), name: z.string().trim().min(1).max(30), sort: z.number().int().min(0).max(999).default(0), status: z.enum(HEALTH_ON_STATUSES).default("ON") }),
    healthPostTagRowSchema,
  ),
  Health_posts: get("/enterprise/health/post/list", listQuery({ postIdAudit: z.string().default("all"), tagId: z.coerce.number().int().min(0).default(0) }), pageOf(healthPostRowSchema)),
  Health_postDetail: get("/enterprise/health/post/detail", idQuery, z.object({ post: healthPostRowSchema, comments: z.array(healthPostCommentRowSchema) })),
  Health_postAudit: post(
    "/enterprise/health/post/audit",
    healthShopIdBody({ id: z.number().int().positive(), approved: z.boolean(), reason: z.string().trim().max(200).default("") }),
    healthPostRowSchema,
  ),
  Health_postRemove: post("/enterprise/health/post/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_postCommentAudit: post(
    "/enterprise/health/post/comment/audit",
    healthShopIdBody({ id: z.number().int().positive(), approved: z.boolean(), reason: z.string().trim().max(200).default("") }),
    healthPostCommentRowSchema,
  ),
  Health_postCommentRemove: post("/enterprise/health/post/comment/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),

  // ---------- 公开问答 ----------
  Health_questions: get("/enterprise/health/question/list", listQuery({ questionStatus: z.string().default("all") }), pageOf(healthQuestionRowSchema)),
  Health_questionDetail: get("/enterprise/health/question/detail", idQuery, z.object({ question: healthQuestionRowSchema, answers: z.array(healthAnswerRowSchema) })),
  Health_answerAudit: post(
    "/enterprise/health/answer/audit",
    healthShopIdBody({ id: z.number().int().positive(), approved: z.boolean(), reason: z.string().trim().max(200).default("") }),
    healthAnswerRowSchema,
  ),
  Health_answerRemove: post("/enterprise/health/answer/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),

  // ---------- 评价 ----------
  Health_reviews: get(
    "/enterprise/health/review/list",
    listQuery({
      targetKind: z.string().default("all"),
      targetId: z.coerce.number().int().min(0).default(0),
      auditStatus: z.string().default("all"),
      minScore: z.coerce.number().int().min(0).max(5).default(0),
      maxScore: z.coerce.number().int().min(0).max(5).default(0),
    }),
    pageOf(healthReviewRowSchema),
  ),
  Health_reviewStats: get("/enterprise/health/review/stats", healthShopIdQuery({ targetKind: z.string().default("all") }), z.array(healthReviewStatRowSchema)),
  Health_reviewReply: post("/enterprise/health/review/reply", healthReviewReplyBodySchema, healthReviewRowSchema),
  Health_reviewAudit: post(
    "/enterprise/health/review/audit",
    healthShopIdBody({ id: z.number().int().positive(), approved: z.boolean(), reason: z.string().trim().max(200).default("") }),
    healthReviewRowSchema,
  ),
  Health_reviewAppealHandle: post(
    "/enterprise/health/review/appeal",
    healthShopIdBody({ id: z.number().int().positive(), approved: z.boolean(), note: z.string().trim().max(500).default("") }),
    healthReviewRowSchema,
  ),
  Health_reviewRemove: post("/enterprise/health/review/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),

  // ---------- 触达、搜索与常用语 ----------
  Health_broadcasts: get("/enterprise/health/broadcast/list", listQuery({}), pageOf(healthBroadcastRowSchema)),
  Health_broadcastCreate: post("/enterprise/health/broadcast/create", healthBroadcastCreateBodySchema, healthBroadcastRowSchema),
  Health_broadcastCancel: post("/enterprise/health/broadcast/cancel", healthShopIdBody({ id: z.number().int().positive() }), healthBroadcastRowSchema),
  Health_hotKeywords: get("/enterprise/health/hot-word/list", healthShopIdQuery({}), z.array(healthHotKeywordRowSchema)),
  Health_hotKeywordSave: post(
    "/enterprise/health/hot-word/save",
    healthShopIdBody({ id: z.number().int().min(0).default(0), keyword: z.string().trim().min(1).max(30), status: z.enum(HEALTH_ON_STATUSES).default("ON") }),
    healthHotKeywordRowSchema,
  ),
  Health_hotKeywordRemove: post("/enterprise/health/hot-word/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_searchLogs: get("/enterprise/health/search-log/list", listQuery({ days: z.coerce.number().int().min(1).max(90).default(7), zeroOnly: z.coerce.number().int().min(0).max(1).default(0) }), z.array(healthSearchLogRowSchema)),
  Health_cannedList: get("/enterprise/health/canned/list", healthShopIdQuery({ groupKey: z.string().default("") }), z.array(healthCannedRowSchema)),
  Health_cannedSave: post(
    "/enterprise/health/canned/save",
    healthShopIdBody({ id: z.number().int().min(0).default(0), groupKey: z.string().trim().max(40).default("DEFAULT"), content: z.string().trim().min(1).max(500), sort: z.number().int().min(0).max(999).default(0), status: z.enum(HEALTH_ON_STATUSES).default("ON") }),
    healthCannedRowSchema,
  ),
  Health_cannedRemove: post("/enterprise/health/canned/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
};

/** 舌象分析增值服务（店主侧）：开关与视觉模型、顾客分析记录。 */
const healthTongueEndpoints = {
  Health_tongueConfig: get("/enterprise/health/tongue/config", healthShopIdQuery({}), healthTongueConfigSchema),
  Health_tongueConfigSave: post(
    "/enterprise/health/tongue/config/save",
    healthShopIdBody({
      enabled: z.boolean().default(false),
      channelId: z.number().int().min(-1).default(0),
      model: z.string().trim().max(128).default(""),
    }),
    healthTongueConfigSchema,
  ),
  Health_tongueRecords: get(
    "/enterprise/health/tongue/record/list",
    listQuery({ customerId: z.coerce.number().int().min(0).default(0) }),
    pageOf(healthTongueRecordSchema),
  ),
  Health_tongueRecordDetail: get("/enterprise/health/tongue/record/detail", idQuery, healthTongueRecordSchema),
  Health_tongueRecordRemove: post(
    "/enterprise/health/tongue/record/remove",
    healthShopIdBody({ id: z.number().int().positive() }),
    okSchema,
  ),
};

/** 平台侧：板块开关、资金总闸与默认参数；台账只保留只读订单视图。 */
const healthAdminEndpoints = {
  HealthAdmin_settings: get("/enterprise/admin/health/settings", emptyQuery, healthPlatformSettingsSchema),
  HealthAdmin_saveSettings: post(
    "/enterprise/admin/health/settings/save",
    z.object({
      enabled: z.boolean().default(true),
      allowOnlinePay: z.boolean().default(true),
      defaultTrade: healthTradeSchema.default(HEALTH_DEFAULT_TRADE),
    }),
    healthPlatformSettingsSchema,
  ),
  HealthAdmin_orders: get(
    "/enterprise/admin/health/orders",
    pageQuerySchema.extend({ shopId: z.coerce.number().int().min(0).default(0), bizType: z.string().default("all"), orderStatus: z.string().default("all"), from: z.string().default(""), to: z.string().default("") }),
    pageOf(healthOrderRowSchema),
  ),
};

/** 管理方案、随访、量表、用药与处方（C5）。 */
const healthCareEndpoints = {
  // ---------- 管理方案 ----------
  Health_plans: get("/enterprise/health/plan/list", listQuery({ crowdKind: z.string().default("all") }), pageOf(healthPlanRowSchema)),
  Health_planDetail: get("/enterprise/health/plan/detail", idQuery, healthPlanRowSchema),
  Health_planSave: post("/enterprise/health/plan/save", healthPlanSaveBodySchema, healthPlanRowSchema),
  Health_planRemove: post("/enterprise/health/plan/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_patientPlans: get(
    "/enterprise/health/patient-plan/list",
    listQuery({ planId: z.coerce.number().int().min(0).default(0), patientId: z.coerce.number().int().min(0).default(0), planStatus: z.string().default("all") }),
    pageOf(healthPatientPlanRowSchema),
  ),
  Health_patientPlanStart: post("/enterprise/health/patient-plan/start", healthPatientPlanStartBodySchema, z.object({ started: z.number(), skipped: z.number(), message: z.string() })),
  Health_patientPlanStatus: post(
    "/enterprise/health/patient-plan/status",
    healthShopIdBody({ id: z.number().int().positive(), status: z.enum(["RUNNING", "PAUSED", "DONE", "DROPPED"]), reason: z.string().trim().max(200).default("") }),
    healthPatientPlanRowSchema,
  ),

  // ---------- 随访 ----------
  Health_followupTasks: get(
    "/enterprise/health/followup/list",
    listQuery({
      patientId: z.coerce.number().int().min(0).default(0),
      practitionerId: z.coerce.number().int().min(0).default(0),
      taskStatus: z.string().default("all"),
      way: z.string().default("all"),
      from: z.string().default(""),
      to: z.string().default(""),
    }),
    pageOf(healthFollowupTaskRowSchema),
  ),
  Health_followupDetail: get("/enterprise/health/followup/detail", idQuery, z.object({ task: healthFollowupTaskRowSchema, records: z.array(healthFollowupRecordRowSchema) })),
  Health_followupCreate: post("/enterprise/health/followup/create", healthFollowupTaskCreateBodySchema, z.object({ created: z.number(), message: z.string() })),
  Health_followupSave: post("/enterprise/health/followup/save", healthFollowupRecordSaveBodySchema, healthFollowupTaskRowSchema),
  Health_followupAssign: post(
    "/enterprise/health/followup/assign",
    healthShopIdBody({ taskIds: z.array(z.number().int().positive()).min(1).max(200), practitionerId: z.number().int().positive() }),
    okSchema,
  ),
  Health_followupRemove: post("/enterprise/health/followup/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),

  // ---------- 量表 ----------
  Health_surveys: get("/enterprise/health/survey/list", listQuery({ crowdKind: z.string().default("all") }), pageOf(healthSurveyRowSchema)),
  Health_surveyDetail: get("/enterprise/health/survey/detail", idQuery, healthSurveyDetailSchema),
  Health_surveySave: post("/enterprise/health/survey/save", healthSurveySaveBodySchema, healthSurveyRowSchema),
  Health_surveyRemove: post("/enterprise/health/survey/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_surveyAnswers: get(
    "/enterprise/health/survey/answer/list",
    listQuery({ surveyId: z.coerce.number().int().min(0).default(0), patientId: z.coerce.number().int().min(0).default(0) }),
    pageOf(healthSurveyAnswerRowSchema),
  ),

  // ---------- 用药 ----------
  Health_medications: get("/enterprise/health/medication/list", listQuery({ patientId: z.coerce.number().int().min(0).default(0) }), pageOf(healthMedicationRowSchema)),
  Health_medicationSave: post("/enterprise/health/medication/save", healthMedicationSaveBodySchema, healthMedicationRowSchema),
  Health_medicationStatus: post("/enterprise/health/medication/status", healthShopIdBody(healthStatusInputSchema.shape), healthMedicationRowSchema),
  Health_medicationRemove: post("/enterprise/health/medication/remove", healthShopIdBody({ id: z.number().int().positive() }), okSchema),
  Health_medicationLogs: get(
    "/enterprise/health/medication/log/list",
    listQuery({ patientId: z.coerce.number().int().min(0).default(0), medicationId: z.coerce.number().int().min(0).default(0), from: z.string().default(""), to: z.string().default("") }),
    pageOf(healthMedicationLogRowSchema),
  ),
  Health_medicationLogSave: post(
    "/enterprise/health/medication/log/save",
    healthShopIdBody({
      medicationId: z.number().int().positive(),
      planAt: z.string().trim().max(32).default(""),
      result: z.enum(["TAKEN", "MISSED", "REFUSED"]).default("TAKEN"),
      note: z.string().trim().max(200).default(""),
    }),
    healthMedicationLogRowSchema,
  ),
  Health_medicationEffects: get(
    "/enterprise/health/medication/effect/list",
    listQuery({ patientId: z.coerce.number().int().min(0).default(0), medicationId: z.coerce.number().int().min(0).default(0) }),
    pageOf(healthMedicationEffectRowSchema),
  ),
  Health_medicationEffectSave: post(
    "/enterprise/health/medication/effect/save",
    healthShopIdBody({
      medicationId: z.number().int().positive(),
      level: z.enum(["BETTER", "STABLE", "WORSE", "UNKNOWN"]),
      symptomText: z.string().trim().max(1000).default(""),
      advice: z.string().trim().max(1000).default(""),
    }),
    healthMedicationEffectRowSchema,
  ),

  // ---------- 处方 ----------
  Health_prescriptions: get(
    "/enterprise/health/prescription/list",
    listQuery({
      patientId: z.coerce.number().int().min(0).default(0),
      doctorId: z.coerce.number().int().min(0).default(0),
      prescriptionStatus: z.string().default("all"),
    }),
    pageOf(healthPrescriptionRowSchema),
  ),
  Health_prescriptionDetail: get("/enterprise/health/prescription/detail", idQuery, healthPrescriptionRowSchema),
  Health_prescriptionSave: post("/enterprise/health/prescription/save", healthPrescriptionSaveBodySchema, healthPrescriptionRowSchema),
  Health_prescriptionReview: post("/enterprise/health/prescription/review", healthPrescriptionReviewBodySchema, healthPrescriptionRowSchema),
  Health_prescriptionRevoke: post(
    "/enterprise/health/prescription/revoke",
    healthShopIdBody({ id: z.number().int().positive(), reason: z.string().trim().max(200).default("") }),
    healthPrescriptionRowSchema,
  ),
};

/** 健康管理小程序工具的对外接口面：按簇合一个导出（前端与 OpenAPI 都取这份）。 */
export const healthEndpoints = {
  ...healthCoreEndpoints,
  ...healthSubjectEndpoints,
  ...healthArchiveEndpoints,
  ...healthCareEndpoints,
  ...healthSlotEndpoints,
  ...healthShopTradeEndpoints,
  ...healthContentEndpoints,
  ...healthTongueEndpoints,
  ...healthAdminEndpoints,
} as const;
