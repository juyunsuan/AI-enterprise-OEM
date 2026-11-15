import {
  BOT_COMMAND_STATUS_LABELS,
  BOT_HOST_STATUS_LABELS,
  BOT_SCHEDULE_LAST_STATUS_LABELS,
  BOT_SCHEDULE_STATUS_LABELS,
  endpoints,
  type BotChannelView,
  type BotCommandView,
  type BotHostView,
  type BotMessageView,
  type BotScheduleRunView,
  type BotScheduleView,
  type BotHostModelGrant,
  type BotWorkspaceDetail,
} from "@enterprise/contracts";
import { endpoint } from "@/api/endpoint";

/**
 * Bot 主机界面层：一台主机＝本人机器上跑着的 BotBuddy 客户端，与本站配对后
 * 按心跳领取指令并在本机执行。平台只下发「做什么」与「落到哪个工作区」，
 * 客户端里怎么配模型、有哪些技能与数字分身都归它自己，平台不展示也不修改。
 * 后端 /enterprise/bot-hosts/*（登录态）；设备侧走 /api/public/bot-host/**（只认主机令牌）。
 */

export { fmtTime } from "@/lib/datetime";

export const HOST_STATUS_LABEL = BOT_HOST_STATUS_LABELS;
export const COMMAND_STATUS_LABEL = BOT_COMMAND_STATUS_LABELS;
export const SCHEDULE_STATUS_LABEL = BOT_SCHEDULE_STATUS_LABELS;
export const SCHEDULE_LAST_STATUS_LABEL = BOT_SCHEDULE_LAST_STATUS_LABELS;

/** 本期只接 Windows / macOS 主机（Linux 主机不在范围内）。 */
export const PLATFORM_LABEL: Record<string, string> = {
  win: "Windows",
  mac: "macOS",
};

export function platformLabel(value: string) {
  return PLATFORM_LABEL[value] || "未上报";
}

function hostColor(status: string) {
  if (status === "ONLINE") return "success";
  if (status === "OFFLINE") return "warning";
  if (status === "DISABLED") return "error";
  return "default";
}

function commandColor(status: string) {
  if (status === "DONE") return "success";
  if (status === "DISPATCHED") return "processing";
  if (status === "FAILED" || status === "TIMEOUT") return "error";
  return "default";
}

export const hostStatusColor = hostColor;
export const commandStatusColor = commandColor;

const api = {
  list: endpoint(endpoints.BotHost_list),
  pair: endpoint(endpoints.BotHost_pair),
  setStatus: endpoint(endpoints.BotHost_setStatus),
  remove: endpoint(endpoints.BotHost_remove),
  rotateToken: endpoint(endpoints.BotHost_rotateToken),
  channels: endpoint(endpoints.BotHost_channels),
  workspaces: endpoint(endpoints.BotHost_workspaces),
  modelGrant: endpoint(endpoints.BotHost_modelGrant),
  saveModelGrant: endpoint(endpoints.BotHost_saveModelGrant),
  removeModelGrant: endpoint(endpoints.BotHost_removeModelGrant),
  conversation: endpoint(endpoints.BotHost_conversation),
  send: endpoint(endpoints.BotHost_send),
  cancel: endpoint(endpoints.BotHost_cancel),
  schedules: endpoint(endpoints.BotHost_schedules),
  createSchedule: endpoint(endpoints.BotHost_createSchedule),
  updateSchedule: endpoint(endpoints.BotHost_updateSchedule),
  removeSchedule: endpoint(endpoints.BotHost_removeSchedule),
  runSchedule: endpoint(endpoints.BotHost_runSchedule),
  scheduleRuns: endpoint(endpoints.BotHost_scheduleRuns),
};

/** 取数：失败不抛错，交页面提示（与 workbuddy/_components/common.ts 同口径）。 */
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

/** 写操作：失败抛出后端文案，由调用方 message.error。 */
async function mutate<T>(work: Promise<unknown>): Promise<T> {
  return (await work) as T;
}

export type HostConversation = {
  host: BotHostView;
  messages: BotMessageView[];
  commands: BotCommandView[];
};

export const botHostApi = {
  hosts: () => load<{ list: BotHostView[] }>(api.list({})),
  /** 配对：填了配对码走设备码通道，留空＝直接建主机并当场回一次令牌。 */
  pair: (body: { name?: string; code?: string }) =>
    mutate<{ host: BotHostView; token: string }>(api.pair({ body })),
  setStatus: (hostId: number, enabled: boolean) =>
    mutate<{ host: BotHostView }>(
      api.setStatus({ params: { hostId: String(hostId) }, body: { enabled } }),
    ),
  remove: (hostId: number) =>
    mutate<{ removed: boolean }>(
      api.remove({ params: { hostId: String(hostId) } }),
    ),
  rotateToken: (hostId: number) =>
    mutate<{ token: string; tokenPrefix: string }>(
      api.rotateToken({ params: { hostId: String(hostId) } }),
    ),
  channels: (hostId: number) =>
    load<{ list: BotChannelView[] }>(
      api.channels({ params: { hostId: String(hostId) } }),
    ),
  /** 工作区详情：带候选表，对话框/定时表单的工作区下拉直接吃这份。 */
  workspaces: (hostId: number) =>
    load<BotWorkspaceDetail>(
      api.workspaces({ params: { hostId: String(hostId) } }),
    ),
  modelGrant: (hostId: number) =>
    load<{ grant: BotHostModelGrant | null }>(
      api.modelGrant({ params: { hostId: String(hostId) } }),
    ),
  saveModelGrant: (hostId: number, body: { channelId: number; model: string }) =>
    mutate<{ grant: BotHostModelGrant | null }>(
      api.saveModelGrant({ params: { hostId: String(hostId) }, body }),
    ),
  removeModelGrant: (hostId: number) =>
    mutate<{ removed: boolean }>(
      api.removeModelGrant({ params: { hostId: String(hostId) } }),
    ),

  conversation: (hostId: number) =>
    load<HostConversation>(
      api.conversation({ params: { hostId: String(hostId) } }),
    ),
  send: (
    hostId: number,
    body: {
      text: string;
      workspace?: string;
      mode?: string;
      timeoutSec?: number;
    },
  ) => mutate<{ command: BotCommandView }>(api.send({ params: { hostId: String(hostId) }, body })),
  cancel: (commandCode: string) =>
    mutate<{ canceled: boolean }>(
      api.cancel({ params: { commandCode } }),
    ),

  schedules: () => load<{ list: BotScheduleView[] }>(api.schedules({})),
  createSchedule: (body: Record<string, unknown>) =>
    mutate<{ schedule: BotScheduleView }>(api.createSchedule({ body })),
  updateSchedule: (id: number, body: Record<string, unknown>) =>
    mutate<{ schedule: BotScheduleView }>(
      api.updateSchedule({ params: { id: String(id) }, body }),
    ),
  removeSchedule: (id: number) =>
    mutate<{ removed: boolean }>(
      api.removeSchedule({ params: { id: String(id) } }),
    ),
  runSchedule: (id: number) =>
    mutate<{ command: BotCommandView }>(
      api.runSchedule({ params: { id: String(id) } }),
    ),
  scheduleRuns: (id: number) =>
    load<{ list: BotScheduleRunView[] }>(
      api.scheduleRuns({ params: { id: String(id) } }),
    ),
};

/** 主机摘要：系统与客户端版本。 */
export function hostHint(row: BotHostView) {
  const parts = [platformLabel(row.platform)];
  if (row.clientVersion) parts.push(`客户端 ${row.clientVersion}`);
  return parts.join(" · ");
}
