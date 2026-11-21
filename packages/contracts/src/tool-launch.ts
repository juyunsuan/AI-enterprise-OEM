import { z } from "zod";

const envelope = <T extends z.ZodType>(data: T) =>
  z.object({ code: z.number(), message: z.string(), data: data.nullable() });
const emptyQuery = z.object({});

/**
 * 建站管理「启动设置」契约。
 *
 * 一码三用：`toolCode` 同时是功能目录卡片码、启动台账 `tool_subscriptions.tool_code`
 * 与价目行 `module_pricing.code` 的映射键（映射表在 `backend/src/tool-launch/tool-launch.catalog.ts`）。
 *
 * 口径要点（与产品确认）：
 * - 工具级启动：一个账号一个工具一条订阅；未启动＝C 端停服 + 禁出包/直传 + 管理端写操作拒绝，且**不扣积分**；
 * - 计费口径全部来自平台管理员的价目行，`plan.note` 与出账同一函数生成，页面说什么就只会扣什么；
 * - 按访问 / 按流量本期只计量（`usage`），账单不出，`plan.usageBilled` 恒 false 直到启用出账。
 */

// ---------------------------------------------------------------- 枚举

export const TOOL_LAUNCH_CODES = [
  "knowledge-pay",
  "onsite",
  "brand-mall",
  "health",
  "marketplace",
  "digital-human",
  "card-shop",
  "kuaidi",
  "errand",
  "takeout",
  "circle",
  "global-site",
  "park",
] as const;
export type ToolLaunchCode = (typeof TOOL_LAUNCH_CODES)[number];

export const TOOL_LAUNCH_STATUSES = ["STOPPED", "TRIAL", "ACTIVE", "ARREARS"] as const;
export type ToolLaunchStatus = (typeof TOOL_LAUNCH_STATUSES)[number];
export const TOOL_LAUNCH_STATUS_LABELS: Record<string, string> = {
  STOPPED: "未启动",
  TRIAL: "免费过渡期",
  ACTIVE: "运行中",
  ARREARS: "欠费宽限中",
};

export const TOOL_STOP_REASONS = ["", "NOT_STARTED", "USER", "ARREARS", "PLATFORM"] as const;
export type ToolStopReason = (typeof TOOL_STOP_REASONS)[number];
export const TOOL_STOP_REASON_LABELS: Record<string, string> = {
  NOT_STARTED: "尚未启动",
  USER: "已手动停止",
  ARREARS: "欠费停服",
  PLATFORM: "平台停用",
};

export const TOOL_BILLING_CYCLES = [
  "FREE",
  "DAY",
  "DAY30",
  "YEAR",
  "USAGE_PV",
  "USAGE_BYTES",
  "USAGE_VIEW",
] as const;
export type ToolBillingCycle = (typeof TOOL_BILLING_CYCLES)[number];
export const TOOL_BILLING_CYCLE_LABELS: Record<string, string> = {
  FREE: "免费",
  DAY: "按日",
  DAY30: "按 30 天",
  YEAR: "按年",
  USAGE_PV: "按访问",
  USAGE_BYTES: "按流量",
  USAGE_VIEW: "按浏览量",
};

export const TOOL_BILL_STATUSES = ["CHARGED", "WAIVED", "ARREARS"] as const;
export type ToolBillStatus = (typeof TOOL_BILL_STATUSES)[number];
export const TOOL_BILL_STATUS_LABELS: Record<string, string> = {
  CHARGED: "已扣费",
  WAIVED: "免费",
  ARREARS: "欠费待补",
};

// ---------------------------------------------------------------- 计费口径

/** 生效口径：平台管理员的价目行 + 平台策略，经纯函数解析后的结果。 */
export const toolLaunchPlanSchema = z.object({
  cycle: z.enum(TOOL_BILLING_CYCLES),
  cycleLabel: z.string(),
  /** 账期天数：1 / 30 / 365；按量与免费为 0。 */
  cycleDays: z.number(),
  unitLabel: z.string(),
  unitPrice: z.number(),
  /** 周期口径：启动后前 N 期免费。 */
  freePeriods: z.number(),
  /** 按量口径：每期免费量。 */
  freeQuantity: z.number(),
  usageUnitSize: z.number(),
  minCharge: z.number(),
  billingEnabled: z.boolean(),
  launchAllowed: z.boolean(),
  usageBilled: z.boolean(),
  graceHours: z.number(),
  transitionDays: z.number(),
  /** 一句话口径：启动确认、账单备注与平台台账共用同一字符串。 */
  note: z.string(),
});
export type ToolLaunchPlanView = z.infer<typeof toolLaunchPlanSchema>;

export const toolLaunchStateSchema = z.object({
  toolCode: z.enum(TOOL_LAUNCH_CODES),
  name: z.string(),
  path: z.string(),
  launchPath: z.string(),
  summary: z.string(),
  /** 自带账单体系（国际独立站）：启动只是功能闸，积分按站点月账走。 */
  ownBilling: z.boolean(),
  status: z.enum(TOOL_LAUNCH_STATUSES),
  stopReason: z.enum(TOOL_STOP_REASONS),
  startedAt: z.string().nullable(),
  stoppedAt: z.string().nullable(),
  trialEndsAt: z.string().nullable(),
  cycleDays: z.number(),
  unitPrice: z.number(),
  periodStart: z.string().nullable(),
  periodEnd: z.string().nullable(),
  billedPeriods: z.number(),
  arrearsSince: z.string().nullable(),
  offBy: z.string(),
  offReason: z.string(),
  plan: toolLaunchPlanSchema,
  /** 本期是否可用（闸门口径的唯一答案）。 */
  open: z.boolean(),
  nextChargeAt: z.string().nullable(),
  nextChargeAmount: z.number(),
});
export type ToolLaunchStateView = z.infer<typeof toolLaunchStateSchema>;

export const toolLaunchBillSchema = z.object({
  id: z.number(),
  periodKey: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  days: z.number(),
  billingMode: z.string(),
  pointsAmount: z.number(),
  status: z.string(),
  remark: z.string(),
});
export type ToolLaunchBillView = z.infer<typeof toolLaunchBillSchema>;

/** 本账期计量（按访问 / 按流量口径的展示依据，本期不参与出账）。 */
export const toolLaunchUsageSchema = z.object({
  pv: z.number(),
  views: z.number().default(0),
  bytes: z.number(),
  days: z.number(),
  /** 快照聚合出的订单数：只用于额度与看板，不参与扣积分 */
  orders: z.number(),
});
export type ToolLaunchUsageView = z.infer<typeof toolLaunchUsageSchema>;

export const toolLaunchDetailSchema = z.object({
  state: toolLaunchStateSchema,
  balanceAmount: z.number(),
  bills: z.array(toolLaunchBillSchema),
  usage: toolLaunchUsageSchema,
});
export type ToolLaunchDetail = z.infer<typeof toolLaunchDetailSchema>;

const toolQuery = z.object({ tool: z.enum(TOOL_LAUNCH_CODES) });
const toolBody = z.object({ tool: z.enum(TOOL_LAUNCH_CODES) });

// ---------------------------------------------------------------- 平台管理侧

export const toolLaunchPricingRowSchema = z.object({
  toolCode: z.enum(TOOL_LAUNCH_CODES),
  pricingCode: z.string(),
  name: z.string(),
  /** 价目行是否存在（缺行按免费处理，但页面上要能看出来是「没配」而不是「配了 0」）。 */
  configured: z.boolean(),
  mode: z.string(),
  billingCycle: z.string(),
  unitPriceAmount: z.number(),
  freeQuotaAmount: z.number(),
  minChargeAmount: z.number(),
  usageUnitSize: z.number(),
  launchEnabled: z.boolean(),
  /** 按量口径是否真正出账；关闭时只计量。 */
  usageBilled: z.boolean().default(false),
  enabled: z.boolean(),
  /** 自带账单体系（国际独立站按站点月账）：本页不维护它的单价与周期。 */
  ownBilling: z.boolean(),
  note: z.string(),
  /** 该工具当前的启动台数分布：管理员改价前先看影响面。 */
  stats: z.object({
    active: z.number(),
    trial: z.number(),
    arrears: z.number(),
    stopped: z.number(),
  }),
});
export type ToolLaunchPricingRow = z.infer<typeof toolLaunchPricingRowSchema>;

export const toolLaunchPolicySchema = z.object({
  graceHours: z.number(),
  transitionDays: z.number(),
  suspendOnArrears: z.boolean(),
  legacyAnchor: z.string(),
});
export type ToolLaunchPolicy = z.infer<typeof toolLaunchPolicySchema>;

export const toolLaunchSubscriptionRowSchema = z.object({
  id: z.number(),
  userId: z.string(),
  username: z.string(),
  toolCode: z.string(),
  toolName: z.string(),
  status: z.string(),
  stopReason: z.string(),
  cycleDays: z.number(),
  unitPriceAmount: z.number(),
  billedPeriods: z.number(),
  periodStart: z.string().nullable(),
  periodEnd: z.string().nullable(),
  trialEndsAt: z.string().nullable(),
  arrearsSince: z.string().nullable(),
  offReason: z.string(),
});
export type ToolLaunchSubscriptionRow = z.infer<typeof toolLaunchSubscriptionRowSchema>;

export const toolLaunchAdminOverviewSchema = z.object({
  tools: z.array(toolLaunchPricingRowSchema),
  policy: toolLaunchPolicySchema,
  counters: z.object({
    active: z.number(),
    trial: z.number(),
    arrears: z.number(),
    stopped: z.number(),
    unpaidBills: z.number(),
    pointsCharged30d: z.number(),
  }),
});
export type ToolLaunchAdminOverview = z.infer<typeof toolLaunchAdminOverviewSchema>;

export const toolLaunchPricingSaveBodySchema = z.object({
  tool: z.enum(TOOL_LAUNCH_CODES),
  billingCycle: z.enum(TOOL_BILLING_CYCLES),
  mode: z.enum(["FREE", "METERED"]).optional(),
  unitPriceAmount: z.number().min(0).max(9_999_999),
  freeQuotaAmount: z.number().min(0).max(9_999_999),
  minChargeAmount: z.number().min(0).max(9_999_999),
  usageUnitSize: z.number().int().min(1).max(1_073_741_824),
  launchEnabled: z.boolean(),
  /** 缺省＝保留现有开关，避免旧页面保存一次把已开的按量出账关掉。 */
  usageBilled: z.boolean().optional(),
  enabled: z.boolean(),
});
export type ToolLaunchPricingSaveBody = z.infer<typeof toolLaunchPricingSaveBodySchema>;

export const toolLaunchPolicySaveBodySchema = toolLaunchPolicySchema
  .omit({ legacyAnchor: true })
  .partial();

export const toolLaunchAdminToggleBodySchema = z.object({
  user: z.string().min(1),
  tool: z.enum(TOOL_LAUNCH_CODES),
  off: z.boolean(),
  reason: z.string().max(200).optional(),
});

export const toolLaunchAdminSubscriptionsSchema = z.object({
  rows: z.array(toolLaunchSubscriptionRowSchema),
  total: z.number(),
});

// ---------------------------------------------------------------- 端点

/**
 * 契约端点一律用 query 传标识：Hono 按注册顺序匹配，静态段会被先注册的 :param 兄弟路径吃掉。
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
 * 用户侧 `ToolLaunch_*` 走 `/enterprise/tool-launch/**`（站内会话）；
 * 平台侧 `ToolLaunchAdmin_*` 走 `/enterprise/admin/tool-launch/**`（受功能开关白名单保护，
 * 关掉任何建站工具都不影响平台处置）。
 */
export const toolLaunchEndpoints = {
  ToolLaunch_states: get(
    "/enterprise/tool-launch/states",
    emptyQuery,
    z.array(toolLaunchStateSchema),
  ),
  ToolLaunch_detail: get(
    "/enterprise/tool-launch/detail",
    toolQuery,
    toolLaunchDetailSchema,
  ),
  ToolLaunch_start: post("/enterprise/tool-launch/start", toolBody, toolLaunchStateSchema),
  ToolLaunch_stop: post("/enterprise/tool-launch/stop", toolBody, toolLaunchStateSchema),

  ToolLaunchAdmin_overview: get(
    "/enterprise/admin/tool-launch/overview",
    emptyQuery,
    toolLaunchAdminOverviewSchema,
  ),
  ToolLaunchAdmin_savePricing: post(
    "/enterprise/admin/tool-launch/pricing",
    toolLaunchPricingSaveBodySchema,
    toolLaunchPricingRowSchema,
  ),
  ToolLaunchAdmin_savePolicy: post(
    "/enterprise/admin/tool-launch/policy",
    toolLaunchPolicySaveBodySchema,
    toolLaunchPolicySchema,
  ),
  ToolLaunchAdmin_subscriptions: get(
    "/enterprise/admin/tool-launch/subscriptions",
    z.object({
      tool: z.enum(TOOL_LAUNCH_CODES).optional(),
      status: z.enum(TOOL_LAUNCH_STATUSES).optional(),
      keyword: z.string().max(60).optional(),
      // query 参数是字符串，必须 coerce（与 pageQuerySchema 同口径），否则整页 422
      page: z.coerce.number().int().min(1).max(2000).optional(),
      pageSize: z.coerce.number().int().min(1).max(200).optional(),
    }),
    toolLaunchAdminSubscriptionsSchema,
  ),
  ToolLaunchAdmin_toggle: post(
    "/enterprise/admin/tool-launch/toggle",
    toolLaunchAdminToggleBodySchema,
    toolLaunchStateSchema,
  ),
};
