import {
  BOT_DISPATCH_SOURCE_LABELS,
  BOT_DISPATCH_TARGET_KIND_LABELS,
  BOT_DISPATCH_TARGET_KIND_SHORT_LABELS,
  BOT_DISPATCH_TARGET_KINDS,
  endpoints,
  type BotDispatchSource,
  type BotDispatchTargetKind,
  type BotDispatchTask,
  type BotDispatchTaskDetail,
  type BotDispatchTaskType,
} from "@enterprise/contracts";
import { endpoint } from "@/api/endpoint";

/**
 * Agent 群控页签的取数层：只取派单台账——三条通道（AWBotDSH 主机 / AWBot 手机 / WorkBuddy 企业云）
 * 的清单与在线状态都在「Agent-Bot」看，这里不复制一份（账号下可能挂几百台设备）。
 * 写侧派单在对话里由 Agent 发起（M3 内置工具），或在设备 / 企云页签手动下发；
 * 本页签只允许暂停/恢复 Agent 建的定时任务。
 * 后端 /enterprise/agent-dispatch/*（登录态信封，endpoint() 已剥壳）。
 */

const api = {
  tasks: endpoint(endpoints.AgentDispatch_tasks),
  taskDetail: endpoint(endpoints.AgentDispatch_taskDetail),
  scheduleStatus: endpoint(endpoints.AgentDispatch_scheduleStatus),
};

/** 取数：失败不抛错，交页面提示（与 agent/_components/common.ts 同口径）。 */
async function load<T>(work: Promise<unknown>): Promise<{
  data: T | null;
  message: string;
}> {
  try {
    return { data: (await work) as T, message: "" };
  } catch (error) {
    return { data: null, message: (error as Error).message || "加载失败" };
  }
}

export type DispatchTaskPage = {
  list: BotDispatchTask[];
  total: number;
  page: number;
  pageSize: number;
};

export type DispatchTaskQuery = {
  type?: BotDispatchTaskType;
  source?: BotDispatchSource | "ALL";
  page?: number;
  pageSize?: number;
};

export const dispatchApi = {
  tasks: (query: DispatchTaskQuery) =>
    load<DispatchTaskPage>(api.tasks({ query: { ...query } })),
  /** 编号在设备表与云端表里会重复，详情必须带 clientKind 才知道读哪张表。 */
  taskDetail: (
    id: number,
    type: BotDispatchTaskType,
    kind: BotDispatchTargetKind,
  ) =>
    load<BotDispatchTaskDetail>(
      api.taskDetail({ params: { id }, query: { type, kind } }),
    ),
  /** 暂停 / 恢复 Agent 建的定时任务：设备与云端两张定时表按 kind 路由。 */
  setScheduleStatus: (
    id: number,
    status: "enabled" | "paused",
    kind: BotDispatchTargetKind,
  ) =>
    api.scheduleStatus({
      params: { id },
      body: { status, kind },
    }) as Promise<BotDispatchTask>,
};

export const SOURCE_LABEL = BOT_DISPATCH_SOURCE_LABELS;

/** 未到终态的指令：台账要自动续拉，云端行还要靠平台轮询才变得动。 */
const OPEN_COMMAND_STATUSES = new Set(["PENDING", "DISPATCHED"]);

export function isOpenTask(row: BotDispatchTask) {
  return row.type === "command" && OPEN_COMMAND_STATUSES.has(row.status);
}

export function taskStatusColor(row: BotDispatchTask) {
  if (row.type === "schedule") return row.status === "enabled" ? "success" : "default";
  if (row.status === "DONE") return "success";
  if (row.status === "DISPATCHED") return "processing";
  if (row.status === "FAILED" || row.status === "TIMEOUT") return "error";
  if (row.status === "CANCELED") return "default";
  return "warning";
}

/** 行主键：设备编号与企云账号编号会重复，必须把通道拼进去。 */
export function dispatchRowKey(row: {
  type: BotDispatchTaskType;
  clientKind: BotDispatchTargetKind;
  id: number;
}) {
  return `${row.type}-${row.clientKind}-${row.id}`;
}

/** 执行位的深链落点：主机 / 手机 / 企云分属 Agent-Bot 的三个页签。 */
export function deviceChatPath(
  clientKind: BotDispatchTargetKind,
  hostId: number,
) {
  if (clientKind === "WORKBUDDY") return "/agent-bot?tab=cloud&sub=chat";
  const tab = clientKind === "AWBOT" ? "awbot" : "bots";
  return `/agent-bot?tab=${tab}&sub=chat&hostId=${hostId}`;
}

export function devicePairingPath(clientKind: BotDispatchTargetKind) {
  if (clientKind === "WORKBUDDY") return "/agent-bot?tab=cloud&sub=accounts";
  return `/agent-bot?tab=${clientKind === "AWBOT" ? "awbot" : "bots"}`;
}

/** 企云已下发的会话平台中止不了，按钮只能说「停止跟踪」。 */
export function isCloudRow(clientKind: BotDispatchTargetKind) {
  return clientKind === "WORKBUDDY";
}

/** 本轮（或这个定时任务）允许 Agent 指挥的目标类型；空数组＝不开群控。 */
export type DispatchScope = BotDispatchTargetKind[];

/** 「+」二级面板里的三个复选项：顺序与文案跟着契约走。 */
export const DISPATCH_TARGET_OPTIONS: {
  value: BotDispatchTargetKind;
  label: string;
}[] = BOT_DISPATCH_TARGET_KINDS.map((value) => ({
  value,
  label: BOT_DISPATCH_TARGET_KIND_LABELS[value] || value,
}));

/** 勾选/取消某一类目标，结果按契约里的固定顺序去重。 */
export function toggleDispatchScope(
  scope: DispatchScope,
  kind: BotDispatchTargetKind,
  checked: boolean,
): DispatchScope {
  const next = new Set(scope);
  if (checked) next.add(kind);
  else next.delete(kind);
  return BOT_DISPATCH_TARGET_KINDS.filter((item) => next.has(item));
}

/** 「+」一级菜单右侧的当前选择（一屏放不下三个全名，用短名）。 */
export function dispatchScopeSummary(scope: DispatchScope) {
  if (!scope.length) return "未选";
  if (scope.length === BOT_DISPATCH_TARGET_KINDS.length) return "主机 + 手机 + 企云";
  return scope.map((kind) => BOT_DISPATCH_TARGET_KIND_SHORT_LABELS[kind]).join(" + ");
}

/** 输入框上方标签：群控：Bot 主机 + AWBot 手机 + WorkBuddy 企业云。 */
export function dispatchScopeLabel(scope: DispatchScope) {
  return `群控：${scope
    .map((kind) => BOT_DISPATCH_TARGET_KIND_LABELS[kind] || kind)
    .join(" + ")}`;
}
