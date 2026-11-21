import { z } from "zod";

/**
 * Agent-Bot · Bot 主机（docs/Agent-Bot方案.md）：
 * AWBotDSH 客户端与平台配对后按心跳领取指令并在本机执行 → 流式回传。
 * 客户端里怎么配模型、有哪些技能与数字分身都归它自己管，平台一概不过问、
 * 不展示、不校验；平台只认「主机在线 / 离线」与它上报的工作区候选。
 * 设备通道免登录、只认主机令牌。
 *
 * 本文件放设备侧与界面侧共用的形状与常量；设备通道的 HTTP 形状（极简 { ok, ... } 信封）
 * 由后端 bot-host.public.ts 提供，不套站内 code/message/data 信封。
 */

/** 主机令牌前缀：明文只在配对成功响应里出现一次，库内只存 sha256。 */
export const BOT_HOST_TOKEN_PREFIX = "bot_";
/** AWBot 手机令牌前缀（与桌面主机分命名空间，仍走同一张设备表与令牌头）。 */
export const AWBOT_HOST_TOKEN_PREFIX = "awb_";

/** 设备类型：桌面 AWBotDSH / AWBot 手机。 */
export const BOT_CLIENT_KINDS = ["DESKTOP", "AWBOT"] as const;
export type BotClientKind = (typeof BOT_CLIENT_KINDS)[number];
export const BOT_CLIENT_KIND_LABELS: Record<string, string> = {
  DESKTOP: "Bot 主机",
  AWBOT: "AWBot 手机",
};
/** 客户端调用主机通道时携带令牌的请求头。 */
export const BOT_HOST_TOKEN_HEADER = "x-bot-token";

/* ---------------------------------------------------------------- 主机状态 */

/** ONLINE＝心跳未超时；OFFLINE＝心跳超时；NEVER＝从未上线；DISABLED＝已停用。 */
export const BOT_HOST_STATUSES = ["ONLINE", "OFFLINE", "NEVER", "DISABLED"] as const;
export type BotHostStatus = (typeof BOT_HOST_STATUSES)[number];
export const BOT_HOST_STATUS_LABELS: Record<string, string> = {
  ONLINE: "在线",
  OFFLINE: "离线",
  NEVER: "未接入",
  DISABLED: "已停用",
};

/** 在线判定：心跳默认 5 秒一次，超过 6 个周期算离线。 */
export const BOT_HEARTBEAT_SECONDS = 5;
export const BOT_HOST_ONLINE_TIMEOUT_MS = 30_000;
/** 每次心跳最多下发的指令条数。 */
export const BOT_HEARTBEAT_BATCH = 5;
/** 单机待执行指令队列上限：离线主机堆积保护。 */
export const BOT_PENDING_QUEUE_LIMIT = 50;

/** 服务端按 lastSeenAt 折算在线态，不落冗余状态更新（与设备通道同一口径）。 */
export function botHostOnline(row: {
  status: string;
  lastSeenAt: Date | string | null;
  now?: number;
}): boolean {
  if (row.status !== "ONLINE") return false;
  if (!row.lastSeenAt) return false;
  const seen =
    row.lastSeenAt instanceof Date
      ? row.lastSeenAt.getTime()
      : new Date(row.lastSeenAt).getTime();
  return (
    Number.isFinite(seen) && (row.now ?? Date.now()) - seen <= BOT_HOST_ONLINE_TIMEOUT_MS
  );
}

/* ---------------------------------------------------------------- 工作区 */

/**
 * 平台只认客户端上报的工作区候选：下发指令时 cwd 落在哪个目录，
 * 由用户在这张候选表里选，平台不替用户猜路径。
 * 客户端里怎么配模型、装了什么技能与数字分身都与平台无关，不经这里上报。
 */
export const botWorkspaceViewSchema = z.object({
  path: z.string(),
  label: z.string(),
  exists: z.boolean(),
  isGit: z.boolean(),
  trust: z.string(),
  source: z.string(),
  lastUsedAt: z.string().nullable(),
});
export type BotWorkspaceView = z.infer<typeof botWorkspaceViewSchema>;

/** 主机摘要里的工作区：默认目录 + 候选数量，明细走单主机接口。 */
export const botWorkspaceSummarySchema = z.object({
  /** 客户端默认工作区（指令 cwd 缺省取它）。 */
  defaultPath: z.string(),
  count: z.number(),
});
export type BotWorkspaceSummary = z.infer<typeof botWorkspaceSummarySchema>;

/** 单主机工作区详情：带候选表，供对话框/定时表单的工作区下拉。 */
export const botWorkspaceDetailSchema = botWorkspaceSummarySchema.extend({
  list: z.array(botWorkspaceViewSchema),
});
export type BotWorkspaceDetail = z.infer<typeof botWorkspaceDetailSchema>;

/* ---------------------------------------------------------------- 指纹窗口 */

/**
 * AWBotDSH 客户端自带的内核级指纹窗口（RPA「AWBotDSH 浏览器」设备的执行位）。
 *
 * 与工作区同一口径：平台只认客户端心跳上报的窗口候选，任务落在哪个窗口由用户在这张表里选，
 * 平台不替用户建窗口、也不下发任何窗口配置；窗口本体、内核与内置 Automa 插件都只在客户端本机。
 */
export const botFingerprintWindowSchema = z.object({
  /** 客户端本机档案 ID（形如 fp<12hex>），派发时原样带回给同一台主机。 */
  id: z.string(),
  name: z.string(),
  groupName: z.string(),
  kernelVersion: z.string(),
  lastOpenAt: z.string().nullable(),
});
export type BotFingerprintWindow = z.infer<typeof botFingerprintWindowSchema>;

/** 主机摘要里的指纹窗口：只带数量，明细走单主机接口（一台主机最多几百个窗口）。 */
export const botFingerprintSummarySchema = z.object({
  count: z.number(),
});
export type BotFingerprintSummary = z.infer<typeof botFingerprintSummarySchema>;

/** 单主机指纹窗口详情：RPA 任务的「指纹窗口」下拉用它。 */
export const botFingerprintDetailSchema = z.object({
  list: z.array(botFingerprintWindowSchema),
  /** 客户端设为「Agent 默认窗口」的档案 ID；空串＝没设，任务不指定窗口时由主机自取。 */
  defaultWindowId: z.string(),
});
export type BotFingerprintDetail = z.infer<typeof botFingerprintDetailSchema>;

/** 指纹窗口候选上限：与客户端单机档案上限同量级，超出部分按上报顺序截断。 */
export const BOT_FINGERPRINT_WINDOW_LIMIT = 200;

/** 客户端上报的单个窗口条目（宽松接收：名称/分组/内核缺了都能补齐）。 */
const botFingerprintWindowInputSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().max(120).optional(),
  groupName: z.string().max(64).optional(),
  kernelVersion: z.string().max(32).optional(),
  lastOpenAt: z.union([z.number(), z.string(), z.null()]).optional(),
});

/** caps.agent 里只有 fingerprint 这一段与平台有关，其余键（工作区、模型等）不参与解析。 */
const botFingerprintCapsSchema = z
  .object({
    fingerprint: z
      .object({
        defaultId: z.string().max(64).optional(),
        windows: z.array(z.unknown()).max(BOT_FINGERPRINT_WINDOW_LIMIT).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

/**
 * 心跳 caps.agent.fingerprint → 窗口候选表（纯函数，界面校验与派发校验共用）。
 *
 * 客户端没上报过就是空表：平台不臆造窗口，也不替用户建窗口。
 * 单条形状不对只跳过那一条，不让一个坏档案拖垮整张候选表。
 */
export function readBotFingerprintCaps(capsAgent: unknown): BotFingerprintDetail {
  const parsed = botFingerprintCapsSchema.safeParse(capsAgent);
  const fingerprint = parsed.success ? parsed.data.fingerprint : undefined;
  if (!fingerprint) return { list: [], defaultWindowId: "" };
  const list: BotFingerprintWindow[] = [];
  for (const item of fingerprint.windows ?? []) {
    const row = botFingerprintWindowInputSchema.safeParse(item);
    if (!row.success) continue;
    const id = row.data.id.trim();
    if (!id) continue;
    list.push({
      id,
      name: row.data.name?.trim() || id,
      groupName: row.data.groupName?.trim() || "",
      kernelVersion: row.data.kernelVersion?.trim() || "",
      lastOpenAt:
        typeof row.data.lastOpenAt === "number"
          ? new Date(row.data.lastOpenAt).toISOString()
          : row.data.lastOpenAt?.trim() || null,
    });
  }
  return { list, defaultWindowId: fingerprint.defaultId?.trim() || "" };
}

/* ---------------------------------------------------------------- 指令 */

/**
 * prompt＝自然语言直投客户端本地 Agent（对话框与手动下发）；
 * schedule＝定时任务到点下发（载荷与 prompt 同构，只是来源不同，运行记录要回指计划）。
 * 主机跑在本人机器、本人登录态下，指令不设确认闸（W2）；要收口的是权限域而不是确认弹窗。
 */
export const BOT_COMMAND_KINDS = ["prompt", "schedule"] as const;
export type BotCommandKind = (typeof BOT_COMMAND_KINDS)[number];

/**
 * 指令状态机：
 * PENDING 入库待领取 → DISPATCHED 已领取执行中 → DONE/FAILED/TIMEOUT/CANCELED 终结。
 */
export const BOT_COMMAND_STATUSES = [
  "PENDING",
  "DISPATCHED",
  "DONE",
  "FAILED",
  "TIMEOUT",
  "CANCELED",
] as const;
export const BOT_COMMAND_STATUS_LABELS: Record<string, string> = {
  PENDING: "待执行",
  DISPATCHED: "执行中",
  DONE: "已完成",
  FAILED: "失败",
  TIMEOUT: "超时",
  CANCELED: "已取消",
};
/** 终结态：心跳不再下发、重复回执按幂等处理。 */
export const BOT_TERMINAL_COMMAND_STATUSES = [
  "DONE",
  "FAILED",
  "TIMEOUT",
  "CANCELED",
] as const;

/** 单条指令默认超时（秒）：本地 Agent 跑工具链可能较慢，给足 300s 再由平台收口。 */
export const BOT_COMMAND_DEFAULT_TIMEOUT_SEC = 300;

/* ---------------------------------------------------------------- 定时任务 */

export const BOT_SCHEDULE_STATUS_LABELS: Record<string, string> = {
  enabled: "启用中",
  paused: "已暂停",
};

/** 计划的「最近一轮」结果；空串＝还没跑过。 */
export const BOT_SCHEDULE_LAST_STATUS_LABELS: Record<string, string> = {
  "": "未执行",
  queued: "已排队",
  dispatched: "执行中",
  succeeded: "成功",
  failed: "失败",
  skipped: "跳过",
};

/** 平台模型授权：一条主机同一时刻最多一个渠道 + 一个模型。 */
export const botHostModelGrantSchema = z.object({
  hostId: z.number(),
  channelId: z.number(),
  channelName: z.string(),
  model: z.string(),
  enabled: z.boolean(),
  /** 渠道仍可用（没被删/停用）；false 时心跳不会下发密钥。 */
  available: z.boolean(),
  /**
   * 这条模型设置的来源：
   * default＝跟随平台「模型设置 → 文本」默认槽位；platform＝平台管理员为本机授权；
   * client＝客户端改模型后同步上来的覆盖项。
   */
  source: z.enum(["default", "platform", "client"]),
  updatedAt: z.string(),
});
export type BotHostModelGrant = z.infer<typeof botHostModelGrantSchema>;

/* ---------------------------------------------------------------- 视图形状 */

export const botHostViewSchema = z.object({
  id: z.number(),
  name: z.string(),
  platform: z.string(),
  status: z.enum(BOT_HOST_STATUSES),
  statusLabel: z.string(),
  online: z.boolean(),
  lastSeenAt: z.string().nullable(),
  lastIp: z.string(),
  clientVersion: z.string(),
  tokenPrefix: z.string(),
  pendingCount: z.number(),
  channelCount: z.number(),
  clientKind: z.enum(BOT_CLIENT_KINDS),
  /** AWBot 手机自报状态（桌面主机为 null）；只展示，不参与调度。 */
  awbot: z
    .object({
      battery: z.number(),
      charging: z.boolean(),
      network: z.string(),
      engine: z.string(),
      modelSyncedAt: z.string(),
    })
    .nullable(),
  workspace: botWorkspaceSummarySchema,
  /** 指纹窗口候选数量（RPA「AWBotDSH 浏览器」设备的执行位）；明细走单主机接口。 */
  fingerprint: botFingerprintSummarySchema,
  /** 平台模型授权摘要（未授权为 null）：只给平台界面看，不下发客户端。 */
  modelGrant: z
    .object({
      channelId: z.number(),
      channelName: z.string(),
      model: z.string(),
      available: z.boolean(),
      source: z.enum(["default", "platform", "client"]),
    })
    .nullable(),
  createdAt: z.string(),
});
export type BotHostView = z.infer<typeof botHostViewSchema>;

export const botChannelViewSchema = z.object({
  id: z.number(),
  kind: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  lastEventAt: z.string().nullable(),
  eventCount: z.number(),
});
export type BotChannelView = z.infer<typeof botChannelViewSchema>;

export const botCommandViewSchema = z.object({
  id: z.number(),
  commandCode: z.string(),
  hostId: z.number(),
  kind: z.enum(BOT_COMMAND_KINDS),
  /** 请求的工作区（空串＝用客户端默认工作区）。 */
  workspace: z.string(),
  /** 实际生效的工作区：客户端回执带回，是"没跑错目录"的唯一凭据。 */
  effectiveWorkspace: z.string(),
  mode: z.string(),
  title: z.string(),
  instruction: z.string(),
  status: z.string(),
  statusLabel: z.string(),
  resultText: z.string(),
  error: z.string(),
  canceled: z.boolean(),
  createdAt: z.string(),
  dispatchedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
export type BotCommandView = z.infer<typeof botCommandViewSchema>;

/**
 * 会话气泡：只做「说了什么 / 回了什么」。
 * 指令的状态与取消入口走 botCommandView 单独一份清单，两边按 createdAt 交错渲染——
 * 消息行上没有指令码可存，硬凑一个关联字段只会是假数据。
 */
export const botMessageViewSchema = z.object({
  id: z.number(),
  role: z.string(),
  content: z.string(),
  status: z.string(),
  createdAt: z.string(),
});
export type BotMessageView = z.infer<typeof botMessageViewSchema>;

export const botScheduleViewSchema = z.object({
  id: z.number(),
  hostId: z.number(),
  hostName: z.string(),
  workspace: z.string(),
  title: z.string(),
  instruction: z.string(),
  scheduleType: z.string(),
  scheduleTypeLabel: z.string(),
  scheduleConfig: z.record(z.string(), z.unknown()),
  scheduledAt: z.string().nullable(),
  status: z.string(),
  statusLabel: z.string(),
  lastRunAt: z.string().nullable(),
  lastStatus: z.string(),
  lastStatusLabel: z.string(),
  lastError: z.string(),
  runCount: z.number(),
  createdAt: z.string(),
});
export type BotScheduleView = z.infer<typeof botScheduleViewSchema>;

export const botScheduleRunViewSchema = z.object({
  id: z.number(),
  status: z.string(),
  commandCode: z.string(),
  error: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
export type BotScheduleRunView = z.infer<typeof botScheduleRunViewSchema>;

/** 状态窗口展示的最近任务：客户端侧不经此契约，这里给界面复用同一形状。 */
export const botRecentCommandSchema = z.object({
  commandCode: z.string(),
  title: z.string(),
  status: z.string(),
  at: z.string(),
});
export type BotRecentCommand = z.infer<typeof botRecentCommandSchema>;

/* ---------------------------------------------------------------- 端点清单 */

const envelope = <T extends z.ZodType>(data: T) =>
  z.object({
    code: z.number(),
    message: z.string(),
    data: data.nullable(),
  });

const emptyQuery = z.object({});
const passthroughBody = z.object({}).passthrough();
const hostParams = z.object({ hostId: z.coerce.number().int().positive() });
const idParams = z.object({ id: z.coerce.number().int().positive() });
const commandParams = z.object({ commandCode: z.string() });

/**
 * 本模块的业务侧端点（登录态，站内 code/message/data 信封）。
 * 设备侧（客户端用、免登录、只认主机令牌）在 bot-host.public.ts，不进这张表。
 */
export const botHostEndpoints = {
  BotHost_list: {
    method: "get" as const,
    path: "/enterprise/bot-hosts",
    params: z.object({}),
    query: z.object({
      /** 不传＝Bot 主机（桌面）；AWBot 手机页显式传 AWBOT。 */
      kind: z.enum(BOT_CLIENT_KINDS).optional(),
    }),
    body: z.undefined(),
    response: envelope(z.object({ list: z.array(botHostViewSchema) })),
  },
  BotHost_pair: {
    method: "post" as const,
    path: "/enterprise/bot-hosts/pair",
    params: z.object({}),
    query: emptyQuery,
    body: passthroughBody,
    // token 明文只在此响应出现一次，用户粘贴进客户端；库内只存 sha256。
    response: envelope(z.object({ host: botHostViewSchema, token: z.string() })),
  },
  /** AWBot 扫码配对：站内登录后生成一次性二维码，手机扫码免登录兑换设备令牌。 */
  BotHost_createPairQr: {
    method: "post" as const,
    path: "/enterprise/bot-hosts/pair-qr",
    params: z.object({}),
    query: emptyQuery,
    body: z.object({
      /** 设备名；留空＝用手机自报的机型。 */
      name: z.string().max(80).optional(),
      /** 平台站点地址；写进二维码，手机据此连回本站。 */
      siteUrl: z.string().max(300).optional(),
      /** AWBotDSH 桌面主机：带上它才是「平台 + 主机」组合码。 */
      hostId: z.number().int().positive().optional(),
    }),
    response: envelope(
      z.object({
        code: z.string(),
        expiresAt: z.string(),
        /** 二维码里的原文，便于客户端自行渲染。 */
        payload: z.string(),
        /** 二维码 PNG 的 data URL。 */
        image: z.string(),
      }),
    ),
  },
  BotHost_setStatus: {
    method: "post" as const,
    path: "/enterprise/bot-hosts/:hostId/status",
    params: hostParams,
    query: emptyQuery,
    body: passthroughBody,
    response: envelope(z.object({ host: botHostViewSchema })),
  },
  BotHost_remove: {
    method: "delete" as const,
    path: "/enterprise/bot-hosts/:hostId",
    params: hostParams,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ removed: z.boolean() })),
  },
  BotHost_rotateToken: {
    method: "post" as const,
    path: "/enterprise/bot-hosts/:hostId/rotate-token",
    params: hostParams,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ token: z.string(), tokenPrefix: z.string() })),
  },
  BotHost_channels: {
    method: "get" as const,
    path: "/enterprise/bot-hosts/:hostId/channels",
    params: hostParams,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ list: z.array(botChannelViewSchema) })),
  },
  /** 单主机工作区详情：带候选表，供对话框/定时表单的工作区下拉。 */
  BotHost_workspaces: {
    method: "get" as const,
    path: "/enterprise/bot-hosts/:hostId/workspaces",
    params: hostParams,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(botWorkspaceDetailSchema),
  },
  /** 单主机指纹窗口详情：供 RPA「AWBotDSH 浏览器」任务选执行落在哪个窗口。 */
  BotHost_fingerprints: {
    method: "get" as const,
    path: "/enterprise/bot-hosts/:hostId/fingerprints",
    params: hostParams,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(botFingerprintDetailSchema),
  },
  /** 平台模型授权：查 / 存 / 撤销（心跳据此下发真实密钥）。 */
  BotHost_modelGrant: {
    method: "get" as const,
    path: "/enterprise/bot-hosts/:hostId/model-grant",
    params: hostParams,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ grant: botHostModelGrantSchema.nullable() })),
  },
  BotHost_saveModelGrant: {
    method: "put" as const,
    path: "/enterprise/bot-hosts/:hostId/model-grant",
    params: hostParams,
    query: emptyQuery,
    body: z.object({ channelId: z.number().int(), model: z.string().trim().min(1).max(128) }),
    response: envelope(z.object({ grant: botHostModelGrantSchema.nullable() })),
  },
  BotHost_removeModelGrant: {
    method: "delete" as const,
    path: "/enterprise/bot-hosts/:hostId/model-grant",
    params: hostParams,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ removed: z.boolean() })),
  },
  BotHost_conversation: {
    method: "get" as const,
    path: "/enterprise/bot-hosts/:hostId/conversation",
    params: hostParams,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(
      z.object({
        host: botHostViewSchema,
        messages: z.array(botMessageViewSchema),
        commands: z.array(botCommandViewSchema),
      }),
    ),
  },
  BotHost_send: {
    method: "post" as const,
    path: "/enterprise/bot-hosts/:hostId/messages",
    params: hostParams,
    query: emptyQuery,
    body: passthroughBody,
    response: envelope(z.object({ command: botCommandViewSchema })),
  },
  BotHost_cancel: {
    method: "post" as const,
    path: "/enterprise/bot-hosts/commands/:commandCode/cancel",
    params: commandParams,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ canceled: z.boolean() })),
  },
  BotHost_schedules: {
    method: "get" as const,
    path: "/enterprise/bot-hosts/schedules",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ list: z.array(botScheduleViewSchema) })),
  },
  BotHost_createSchedule: {
    method: "post" as const,
    path: "/enterprise/bot-hosts/schedules",
    params: z.object({}),
    query: emptyQuery,
    body: passthroughBody,
    response: envelope(z.object({ schedule: botScheduleViewSchema })),
  },
  BotHost_updateSchedule: {
    method: "post" as const,
    path: "/enterprise/bot-hosts/schedules/:id",
    params: idParams,
    query: emptyQuery,
    body: passthroughBody,
    response: envelope(z.object({ schedule: botScheduleViewSchema })),
  },
  BotHost_removeSchedule: {
    method: "delete" as const,
    path: "/enterprise/bot-hosts/schedules/:id",
    params: idParams,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ removed: z.boolean() })),
  },
  BotHost_runSchedule: {
    method: "post" as const,
    path: "/enterprise/bot-hosts/schedules/:id/run",
    params: idParams,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ command: botCommandViewSchema })),
  },
  BotHost_scheduleRuns: {
    method: "get" as const,
    path: "/enterprise/bot-hosts/schedules/:id/runs",
    params: idParams,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ list: z.array(botScheduleRunViewSchema) })),
  },
};
