import { z } from "zod";

/**
 * Agent 群控（docs/Agent群控（替换插件页签）产品设计方案.md）：
 * 把「指挥 BotBuddy 主机 + Mobot 手机 + WorkBuddy 企业云」做成 Agent 的能力——目标清单与派单台账都从这里走。
 * 三类目标各有各的存储与下发通道（设备两表 / 云端两表），这里只定义台账与工具共用的那一套形状。
 */

/** 派单来源：UI＝设备或企云页面手动下发，AGENT＝Agent 在对话/定时任务里派发。 */
export const BOT_DISPATCH_SOURCES = ["UI", "AGENT"] as const;
export type BotDispatchSource = (typeof BOT_DISPATCH_SOURCES)[number];
export const BOT_DISPATCH_SOURCE_LABELS: Record<string, string> = {
  UI: "手动下发",
  AGENT: "Agent 派单",
};

/**
 * 群控可派目标类型（决议 D6 把企云纳进来）。
 * 与 `BOT_CLIENT_KINDS` 刻意分开：后者是 `workbuddy_hosts.client_kind` 的口径——有令牌、靠心跳领指令的机器；
 * 云账号既没有令牌也不心跳，不能塞进设备表，所以群控侧另立三元词汇，DESKTOP / MOBOT 取值保持一致。
 */
export const BOT_DISPATCH_TARGET_KINDS = ["DESKTOP", "MOBOT", "WORKBUDDY"] as const;
export type BotDispatchTargetKind = (typeof BOT_DISPATCH_TARGET_KINDS)[number];
export const BOT_DISPATCH_TARGET_KIND_LABELS: Record<string, string> = {
  DESKTOP: "Bot 主机",
  MOBOT: "Mobot 手机",
  WORKBUDDY: "WorkBuddy 企业云",
};
/** 「+」入口与范围标签用的短名（一屏放不下「WorkBuddy 企业云」）。 */
export const BOT_DISPATCH_TARGET_KIND_SHORT_LABELS: Record<string, string> = {
  DESKTOP: "主机",
  MOBOT: "手机",
  WORKBUDDY: "企云",
};

/** 群控任务列表里的两类条目：一次性派单（指令）与目标侧定时任务。 */
export const BOT_DISPATCH_TASK_TYPES = ["command", "schedule"] as const;
export type BotDispatchTaskType = (typeof BOT_DISPATCH_TASK_TYPES)[number];

/**
 * 定时任务行的 taskKey 前缀：设备定时与云端定时各占一张表、编号会重复，
 * 用前缀分开后台账与 Agent 工具都能凭 taskKey 找回原行。
 */
export const BOT_SCHEDULE_KEY_PREFIX = "sch_";
export const BOT_CLOUD_SCHEDULE_KEY_PREFIX = "csch_";

const envelope = <T extends z.ZodType>(data: T) =>
  z.object({
    code: z.number(),
    message: z.string(),
    data: data.nullable(),
  });

const emptyQuery = z.object({});
const idParams = z.object({ id: z.coerce.number().int().positive() });

/** 企云账号下的一个可派 Agent（算力在腾讯云侧，版本可空＝用当前发布版）。 */
export const botDispatchAgentRefSchema = z.object({
  agentId: z.string(),
  versionId: z.string(),
  name: z.string(),
});
export type BotDispatchAgentRef = z.infer<typeof botDispatchAgentRefSchema>;

/**
 * 群控目标清单：BotBuddy 主机与 Mobot 手机来自设备表，WorkBuddy 企业云来自企云账号表。
 * 只带「能不能派、适合派什么」需要的字段，各通道特有的细节仍回各自页面看。
 */
export const botDispatchDeviceSchema = z.object({
  id: z.number(),
  /** DESKTOP / MOBOT＝主机编号，WORKBUDDY＝企云账号编号（与台账行的 hostId 同一口径）。 */
  name: z.string(),
  clientKind: z.enum(BOT_DISPATCH_TARGET_KINDS),
  kindLabel: z.string(),
  platform: z.string(),
  status: z.string(),
  statusLabel: z.string(),
  /** 主机/手机＝心跳在线可立即执行；企云＝凭据校验通过、随时可发。 */
  online: z.boolean(),
  /** 离线时能否排队：靠心跳领指令的设备可以（上线即执行），企云没有队列。 */
  queueable: z.boolean(),
  /** 待执行队列长度；企云固定 0。 */
  pendingCount: z.number(),
  lastSeenAt: z.string().nullable(),
  /** 主机默认工作区（需要指定目录的活才用得上）；手机与企云为空。 */
  workspacePath: z.string(),
  /** 手机电量（0-100），非手机为 null。 */
  battery: z.number().nullable(),
  /** 手机是否正在充电（非手机为 false）：长任务能不能挂在手机上跑。 */
  charging: z.boolean(),
  network: z.string(),
  /** 用的是什么模型：主机/手机给授权渠道摘要，企云说明算力在腾讯云账号侧、本站不计积分。 */
  modelLabel: z.string(),
  /** 仅企云：该账号可派的 Agent 与版本；读不到云端清单时为空数组。 */
  agents: z.array(botDispatchAgentRefSchema).default([]),
});
export type BotDispatchDevice = z.infer<typeof botDispatchDeviceSchema>;

/** 群控任务列表行：command＝一条指令，schedule＝一个设备定时任务。 */
export const botDispatchTaskSchema = z.object({
  type: z.enum(BOT_DISPATCH_TASK_TYPES),
  id: z.number(),
  /** 一次性派单用 commandCode（全局唯一）；定时任务用 `sch_{id}`，云端定时用 `csch_{id}`，都能被 list_dispatch_tasks 追踪。 */
  taskKey: z.string(),
  /** DESKTOP / MOBOT＝主机编号，WORKBUDDY＝企云账号编号；与 `clientKind` 合起来才是行的主键。 */
  hostId: z.number(),
  hostName: z.string(),
  /** 存储路由键：WORKBUDDY 的行来自云端两表，其余来自设备两表（设备表永远取不到 WORKBUDDY）。 */
  clientKind: z.enum(BOT_DISPATCH_TARGET_KINDS),
  title: z.string(),
  instruction: z.string(),
  /** command：PENDING/DISPATCHED/DONE/FAILED/TIMEOUT/CANCELED；schedule：enabled/paused。 */
  status: z.string(),
  statusLabel: z.string(),
  /** 派单来源，UI 手动与 AGENT 群控在同一台账里可区分。 */
  source: z.enum(BOT_DISPATCH_SOURCES),
  /** 发起派单的站内 Agent 会话（0＝非群控派单）。 */
  agentConversationId: z.number(),
  /** 结果摘要（指令的终结回执文本，截断）；定时任务取最近一轮。 */
  resultSummary: z.string(),
  error: z.string(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  /** 定时任务的下一轮执行时刻；指令为 null。 */
  scheduledAt: z.string().nullable(),
  /** 定时任务已执行轮次；指令固定 0。 */
  runCount: z.number(),
});
export type BotDispatchTask = z.infer<typeof botDispatchTaskSchema>;

/** 任务详情：列表行 + 进度累积 + 设备会话跳转参数。 */
export const botDispatchTaskDetailSchema = botDispatchTaskSchema.extend({
  /** 客户端流式回传的进度片段（指令专有，定时任务取最近一轮指令）。 */
  progressText: z.string(),
  /** 执行工作区（仅 Bot 主机有意义；手机为空）。 */
  workspace: z.string(),
});
export type BotDispatchTaskDetail = z.infer<typeof botDispatchTaskDetailSchema>;

/**
 * 群控页签的登录态端点（站内 code/message/data 信封）。
 * 写侧（派单/取消）在 M3 由 Agent 工具经 BotHostService 受控方法走，不新开公开写接口。
 */
export const agentDispatchEndpoints = {
  AgentDispatch_devices: {
    method: "get" as const,
    path: "/enterprise/agent-dispatch/devices",
    params: z.object({}),
    query: z.object({
      /** 不传＝三类目标一起返回（群控一屏看全）。 */
      kind: z.enum(BOT_DISPATCH_TARGET_KINDS).optional(),
    }),
    body: z.undefined(),
    response: envelope(z.object({ list: z.array(botDispatchDeviceSchema) })),
  },
  AgentDispatch_tasks: {
    method: "get" as const,
    path: "/enterprise/agent-dispatch/tasks",
    params: z.object({}),
    query: z.object({
      type: z.enum(BOT_DISPATCH_TASK_TYPES).optional(),
      /** 不传＝只看 Agent 派单；ALL＝把设备页面手动下发一起列出来。 */
      source: z.enum([...BOT_DISPATCH_SOURCES, "ALL"]).optional(),
      /** 指令状态或定时任务状态的原值；不传＝全部。 */
      status: z.string().max(16).optional(),
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(50).default(20),
    }),
    body: z.undefined(),
    response: envelope(
      z.object({
        list: z.array(botDispatchTaskSchema),
        total: z.number(),
        page: z.number(),
        pageSize: z.number(),
      }),
    ),
  },
  AgentDispatch_taskDetail: {
    method: "get" as const,
    path: "/enterprise/agent-dispatch/tasks/:id",
    params: idParams,
    query: z.object({
      type: z.enum(BOT_DISPATCH_TASK_TYPES).default("command"),
      /** 行来自哪张表：WORKBUDDY＝云端两表，其余＝设备两表。编号在两边会重复，必须带它路由。 */
      kind: z.enum(BOT_DISPATCH_TARGET_KINDS).default("DESKTOP"),
    }),
    body: z.undefined(),
    response: envelope(botDispatchTaskDetailSchema),
  },
  AgentDispatch_scheduleStatus: {
    method: "patch" as const,
    path: "/enterprise/agent-dispatch/schedules/:id",
    params: idParams,
    query: emptyQuery,
    body: z.object({
      status: z.enum(["enabled", "paused"]),
      /** 同上：暂停 / 恢复要落到正确的那张定时表。 */
      kind: z.enum(BOT_DISPATCH_TARGET_KINDS).default("DESKTOP"),
    }),
    response: envelope(botDispatchTaskSchema),
  },
} as const;
