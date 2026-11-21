import {
  BOT_CLIENT_KIND_LABELS,
  BOT_CLIENT_KINDS,
  BOT_COMMAND_STATUS_LABELS,
  BOT_CLOUD_SCHEDULE_KEY_PREFIX,
  BOT_DISPATCH_TARGET_KIND_LABELS,
  BOT_HOST_STATUS_LABELS,
  BOT_SCHEDULE_KEY_PREFIX,
  BOT_SCHEDULE_LAST_STATUS_LABELS,
  BOT_SCHEDULE_STATUS_LABELS,
  BOT_TERMINAL_COMMAND_STATUSES,
  type BotClientKind,
  type BotDispatchDevice,
  type BotDispatchSource,
  type BotDispatchTargetKind,
  type BotDispatchTask,
  type BotDispatchTaskDetail,
  type BotDispatchTaskType,
  type BotHostView,
} from '@enterprise/contracts';
import { CurrentUser } from '../auth/current-user';
import { text } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { parseId } from '../common/parse-id';
import { PrismaService } from '../prisma/prisma.service';
import { toJsonObject } from '../shared/json-value';
import type { AgentIntentDraft } from '../agent-memory/agent-memory.service';
import { BotHostService } from './bot-host.service';
import type { WorkbuddyCloudService } from '../workbuddy/workbuddy-cloud.service';

/**
 * Agent 群控（docs/Agent群控（替换插件页签）产品设计方案.md）的视图与工具层：
 * 三条通道（AWBotDSH 主机 / AWBot 手机 / WorkBuddy 企业云）各自的读取口径仍留在各自服务里，
 * 这里只把它们归一成同一形状的目标清单与派单台账，页签与 Agent 工具共用。
 * 写侧派单不在这里落库——设备走 BotHostService、云端走 WorkbuddyCloudService 的受控方法
 * （归属复权、队列上限、长度上限、启用状态都在那边校验），保证与界面手动下发同一套安全口径。
 */

/** 台账里的结果摘要只做导览，全文去执行位对话里看。 */
const RESULT_SUMMARY_MAX = 200;
const DEFAULT_PAGE_SIZE = 20;
/** 终态指令：取消没有意义，直接回文案。 */
const TERMINAL_COMMAND_STATUS = new Set<string>(BOT_TERMINAL_COMMAND_STATUSES);
/** 企云是第三种目标，但设备表只有两值，清单按这个集合筛。 */
const DEVICE_KINDS = BOT_CLIENT_KINDS as readonly string[];

type CommandRow = {
  id: number;
  commandCode: string;
  hostId: number;
  kind: string;
  title: string;
  payload: unknown;
  status: string;
  error: string;
  result: unknown;
  progressText: string;
  source: string;
  agentConversationId: number;
  createdAt: Date;
  finishedAt: Date | null;
};

type ScheduleRow = {
  id: number;
  hostId: number;
  title: string;
  instruction: string;
  status: string;
  lastStatus: string;
  lastError: string;
  source: string;
  agentConversationId: number;
  scheduledAt: Date | null;
  runCount: number;
  createdAt: Date;
};

/** 云端指令行：与设备指令同状态机，差别只在归属是企云账号、进度靠平台轮询。 */
type CloudCommandRow = {
  id: number;
  commandCode: string;
  accountId: number;
  agentId: string;
  versionId: string;
  kind: string;
  title: string;
  payload: unknown;
  status: string;
  error: string;
  progressText: string;
  source: string;
  agentConversationId: number;
  createdAt: Date;
  finishedAt: Date | null;
};

type CloudScheduleRow = {
  id: number;
  accountId: number;
  title: string;
  instruction: string;
  status: string;
  lastStatus: string;
  lastError: string;
  source: string;
  agentConversationId: number;
  scheduledAt: Date | null;
  runCount: number;
  payload: unknown;
  createdAt: Date;
};

type HostRow = { id: number; name: string; clientKind: string };
type AccountRow = { id: number; name: string };

function clip(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function sourceOf(value: string): BotDispatchSource {
  return value === 'AGENT' ? 'AGENT' : 'UI';
}

/** 工具参数里的编号：模型填 0 / 小数 / 字符串一律当没填。 */
function positiveId(raw: unknown) {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

/** 设备侧排期按服务器本地时间推算，回给模型的时间也按同一口径渲染，免得模型自己换算时区。 */
function localTime(value: Date | string | null | undefined) {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 目标类型入参归一：不认识的值当作「不筛」，三类一起给。 */
function targetKindsOf(kind?: string): BotDispatchTargetKind[] {
  const raw = text(kind).trim().toUpperCase();
  const all = Object.keys(
    BOT_DISPATCH_TARGET_KIND_LABELS,
  ) as BotDispatchTargetKind[];
  return all.includes(raw as BotDispatchTargetKind)
    ? [raw as BotDispatchTargetKind]
    : all;
}

/** 设备行降维成群控目标行：只留「能不能派、适合派什么」，其余仍回 Agent-Bot 页面看。 */
function hostTarget(row: BotHostView): BotDispatchDevice {
  const kind = row.clientKind;
  return {
    id: row.id,
    name: row.name || `${BOT_CLIENT_KIND_LABELS[kind]} #${row.id}`,
    clientKind: kind,
    kindLabel: BOT_DISPATCH_TARGET_KIND_LABELS[kind] || kind,
    platform: row.platform,
    status: row.status,
    statusLabel: row.statusLabel,
    online: row.online,
    // 靠心跳领指令的机器才有队列；已停用的设备不能派，也就不排队。
    queueable: row.status !== 'DISABLED',
    pendingCount: row.pendingCount,
    lastSeenAt: row.lastSeenAt,
    workspacePath: kind === 'DESKTOP' ? row.workspace?.defaultPath || '' : '',
    battery: row.awbot?.battery ?? null,
    charging: row.awbot?.charging ?? false,
    network: row.awbot?.network || '',
    modelLabel: row.modelGrant
      ? `${row.modelGrant.channelName}${row.modelGrant.model ? ` / ${row.modelGrant.model}` : ''}`
      : '跟随平台默认渠道',
    agents: [],
  };
}

/** 企云账号行：在线＝凭据可用，没有队列，可派算力是账号下的 Agent 清单。 */
function cloudTarget(row: {
  id: number;
  name: string;
  status: string;
  lastVerifiedAt: Date | null;
  agents: BotDispatchDevice['agents'];
}): BotDispatchDevice {
  const enabled = row.status === 'active';
  return {
    id: row.id,
    name: row.name || `企云账号 #${row.id}`,
    clientKind: 'WORKBUDDY',
    kindLabel: BOT_DISPATCH_TARGET_KIND_LABELS.WORKBUDDY,
    platform: '腾讯云 WorkBuddy',
    status: row.status,
    statusLabel: enabled ? '凭据可用' : '已停用',
    online: enabled,
    queueable: false,
    pendingCount: 0,
    lastSeenAt: iso(row.lastVerifiedAt),
    workspacePath: '',
    battery: null,
    charging: false,
    network: '',
    modelLabel: '算力在你自己的腾讯云 WorkBuddy 账号里，本站不计积分',
    agents: row.agents,
  };
}

function targetLine(row: BotDispatchDevice) {
  const isCloud = row.clientKind === 'WORKBUDDY';
  const parts = [
    `- ${isCloud ? '企云账号' : '设备'} #${row.id}「${row.name}」${row.kindLabel}${row.platform ? `（${row.platform}）` : ''}`,
    isCloud
      ? row.online
        ? '凭据可用，随时可发（没有队列，也不能排队）'
        : '已停用（要派先去「Agent-Bot → 企云账号」启用）'
      : row.status === 'DISABLED'
        ? '已停用（要派先得在 Agent-Bot 设备页启用）'
        : `${row.statusLabel}${row.online ? '' : `，最后心跳 ${localTime(row.lastSeenAt) || '无'}`}`,
  ];
  if (!isCloud) parts.push(`待执行 ${row.pendingCount} 条`);
  if (row.workspacePath) parts.push(`默认工作区 ${row.workspacePath}`);
  if (row.clientKind === 'DESKTOP' && !row.workspacePath) {
    parts.push('客户端还没上报工作区（需要指定目录的活别派这台）');
  }
  if (row.battery !== null) {
    parts.push(
      `电量 ${row.battery}%${row.charging ? '（充电中）' : ''}、网络 ${row.network || '未知'}`,
    );
  }
  parts.push(
    isCloud
      ? row.agents.length
        ? `可派 Agent ${row.agents.length} 个：${row.agents
            .slice(0, 5)
            .map((item) => `${item.name}(${item.agentId})`)
            .join('、')}`
        : '读不到该账号的 Agent 清单（派单前先校验凭据）'
      : `模型 ${row.modelLabel}`,
  );
  return parts.join(' · ');
}

/** 操作流留痕出口（智能体记忆）：装配顺序晚于本服务，故用可选注入。 */
type MemoryRecorder = { record(draft: AgentIntentDraft): Promise<void> };

export class AgentDispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hosts: BotHostService,
    private readonly cloud: WorkbuddyCloudService,
    private readonly memory?: MemoryRecorder,
  ) {}

  private async hostMap(user: CurrentUser, hostIds: number[]) {
    if (!hostIds.length) return new Map<number, HostRow>();
    const rows = await this.prisma.workbuddyHost.findMany({
      where: { userId: user.userId, id: { in: hostIds } },
      select: { id: true, name: true, clientKind: true },
    });
    return new Map(rows.map((row) => [row.id, row]));
  }

  private async accountMap(user: CurrentUser, accountIds: number[]) {
    if (!accountIds.length) return new Map<number, AccountRow>();
    const rows = await this.prisma.workbuddyAccount.findMany({
      where: { createdBy: user.userId, id: { in: accountIds } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row]));
  }

  private commandTask(row: CommandRow, host?: HostRow): BotDispatchTask {
    const payload = toJsonObject(row.payload);
    const result = toJsonObject(row.result);
    const clientKind =
      (host?.clientKind || 'DESKTOP') === 'AWBOT' ? 'AWBOT' : 'DESKTOP';
    return {
      type: 'command',
      id: row.id,
      taskKey: row.commandCode,
      hostId: row.hostId,
      hostName: host?.name || `设备 #${row.hostId}`,
      clientKind,
      title: row.title,
      instruction: text(payload.instruction),
      status: row.status,
      statusLabel: BOT_COMMAND_STATUS_LABELS[row.status] || row.status,
      source: sourceOf(row.source),
      agentConversationId: row.agentConversationId,
      resultSummary: clip(text(result.text), RESULT_SUMMARY_MAX),
      error: row.error,
      createdAt: row.createdAt.toISOString(),
      finishedAt: iso(row.finishedAt),
      // 指令没有「下一轮」，一次性任务用 null 与定时行区分。
      scheduledAt: null,
      runCount: 0,
    };
  }

  private scheduleTask(row: ScheduleRow, host?: HostRow): BotDispatchTask {
    const clientKind =
      (host?.clientKind || 'DESKTOP') === 'AWBOT' ? 'AWBOT' : 'DESKTOP';
    const lastLabel = BOT_SCHEDULE_LAST_STATUS_LABELS[row.lastStatus] || '';
    return {
      type: 'schedule',
      id: row.id,
      taskKey: `${BOT_SCHEDULE_KEY_PREFIX}${row.id}`,
      hostId: row.hostId,
      hostName: host?.name || `设备 #${row.hostId}`,
      clientKind,
      title: row.title,
      instruction: row.instruction,
      status: row.status,
      statusLabel: BOT_SCHEDULE_STATUS_LABELS[row.status] || row.status,
      source: sourceOf(row.source),
      agentConversationId: row.agentConversationId,
      resultSummary: row.lastStatus
        ? `最近一轮：${lastLabel || row.lastStatus}`
        : '',
      error: row.lastError,
      createdAt: row.createdAt.toISOString(),
      finishedAt: null,
      scheduledAt: iso(row.scheduledAt),
      runCount: row.runCount,
    };
  }

  /** 云端指令行：结果摘要取轮询累积的对话文本（云端回包里没有正文）。 */
  private cloudCommandTask(row: CloudCommandRow, account?: AccountRow) {
    return {
      type: 'command' as const,
      id: row.id,
      taskKey: row.commandCode,
      hostId: row.accountId,
      hostName: account?.name || `企云账号 #${row.accountId}`,
      clientKind: 'WORKBUDDY' as const,
      title: row.title,
      instruction: text(toJsonObject(row.payload).instruction),
      status: row.status,
      statusLabel: BOT_COMMAND_STATUS_LABELS[row.status] || row.status,
      source: sourceOf(row.source),
      agentConversationId: row.agentConversationId,
      resultSummary: clip(row.progressText, RESULT_SUMMARY_MAX),
      error: row.error,
      createdAt: row.createdAt.toISOString(),
      finishedAt: iso(row.finishedAt),
      scheduledAt: null,
      runCount: 0,
    };
  }

  /** 云端定时行：taskKey 前缀与设备定时分开，两张表的编号会重复。 */
  private cloudScheduleTask(row: CloudScheduleRow, account?: AccountRow) {
    const lastLabel = BOT_SCHEDULE_LAST_STATUS_LABELS[row.lastStatus] || '';
    return {
      type: 'schedule' as const,
      id: row.id,
      taskKey: `${BOT_CLOUD_SCHEDULE_KEY_PREFIX}${row.id}`,
      hostId: row.accountId,
      hostName: account?.name || `企云账号 #${row.accountId}`,
      clientKind: 'WORKBUDDY' as const,
      title: row.title,
      instruction: row.instruction,
      status: row.status,
      statusLabel: BOT_SCHEDULE_STATUS_LABELS[row.status] || row.status,
      source: sourceOf(row.source),
      agentConversationId: row.agentConversationId,
      resultSummary: row.lastStatus
        ? `最近一轮：${lastLabel || row.lastStatus}`
        : '',
      error: row.lastError,
      createdAt: row.createdAt.toISOString(),
      finishedAt: null,
      scheduledAt: iso(row.scheduledAt),
      runCount: row.runCount,
    };
  }

  /** 按目标类型取清单：只查勾选到的通道，没勾企云就不去敲腾讯云的门。 */
  private async targetsFor(
    user: CurrentUser,
    kinds: BotDispatchTargetKind[],
  ): Promise<BotDispatchDevice[]> {
    const deviceKinds = kinds.filter((item) =>
      DEVICE_KINDS.includes(item),
    ) as BotClientKind[];
    const groups = await Promise.all(
      deviceKinds.map((kind) => this.hosts.list(user, kind)),
    );
    const list = groups.flatMap((group) => group.list.map(hostTarget));
    if (kinds.includes('WORKBUDDY')) {
      const targets = await this.cloud.dispatchTargets(user);
      list.push(...targets.map(cloudTarget));
    }
    list.sort((a, b) => Number(b.online) - Number(a.online) || a.id - b.id);
    return list;
  }

  async devices(
    user: CurrentUser,
    query: { kind?: string } = {},
  ): Promise<{ list: BotDispatchDevice[] }> {
    return { list: await this.targetsFor(user, targetKindsOf(query.kind)) };
  }

  async tasks(
    user: CurrentUser,
    query: {
      type?: string;
      source?: string;
      status?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    const page = Math.max(1, Math.floor(Number(query.page || 1)) || 1);
    const pageSize = Math.min(
      50,
      Math.max(
        1,
        Math.floor(Number(query.pageSize || DEFAULT_PAGE_SIZE)) ||
          DEFAULT_PAGE_SIZE,
      ),
    );
    // 群控台账默认只看 Agent 派单；ALL 才把设备 / 企云页面手动下发一起列进来。
    const source =
      query.source === 'ALL'
        ? undefined
        : query.source === 'UI' || query.source === 'AGENT'
          ? query.source
          : 'AGENT';
    const status = text(query.status).trim().slice(0, 16);
    const withCommands = query.type !== 'schedule';
    const withSchedules = query.type !== 'command';
    // 状态只在指令口径里有意义（定时行是 enabled/paused）；两类行一起取时按各自字典各取所需。
    const commandWhere = {
      userId: user.userId,
      ...(source ? { source } : {}),
      ...(status ? { status } : {}),
    };
    const scheduleWhere = {
      userId: user.userId,
      ...(source ? { source } : {}),
      ...(status ? { status } : {}),
    };
    // 四类行（设备指令 / 设备定时 / 云端指令 / 云端定时）合并分页：
    // 各取前 page*pageSize 条再按创建时间倒序切窗口，避免 N+1 计数翻页错位。
    const windowSize = page * pageSize;
    const empty = <T>(): Promise<T[]> => Promise.resolve([] as T[]);
    const [
      commandRows,
      scheduleRows,
      cloudCommandRows,
      cloudScheduleRows,
      commandTotal,
      scheduleTotal,
      cloudCommandTotal,
      cloudScheduleTotal,
    ] = await Promise.all([
      withCommands
        ? this.prisma.workbuddyHostCommand.findMany({
            where: commandWhere,
            orderBy: { id: 'desc' },
            take: windowSize,
          })
        : empty<CommandRow>(),
      withSchedules
        ? this.prisma.workbuddyHostSchedule.findMany({
            where: scheduleWhere,
            orderBy: { id: 'desc' },
            take: windowSize,
          })
        : empty<ScheduleRow>(),
      withCommands
        ? this.prisma.workbuddyCloudCommand.findMany({
            where: commandWhere,
            orderBy: { id: 'desc' },
            take: windowSize,
          })
        : empty<CloudCommandRow>(),
      withSchedules
        ? this.prisma.workbuddyCloudSchedule.findMany({
            where: scheduleWhere,
            orderBy: { id: 'desc' },
            take: windowSize,
          })
        : empty<CloudScheduleRow>(),
      withCommands
        ? this.prisma.workbuddyHostCommand.count({ where: commandWhere })
        : Promise.resolve(0),
      withSchedules
        ? this.prisma.workbuddyHostSchedule.count({ where: scheduleWhere })
        : Promise.resolve(0),
      withCommands
        ? this.prisma.workbuddyCloudCommand.count({ where: commandWhere })
        : Promise.resolve(0),
      withSchedules
        ? this.prisma.workbuddyCloudSchedule.count({ where: scheduleWhere })
        : Promise.resolve(0),
    ]);

    const hosts = await this.hostMap(user, [
      ...new Set([...commandRows, ...scheduleRows].map((row) => row.hostId)),
    ]);
    const accounts = await this.accountMap(user, [
      ...new Set(
        [...cloudCommandRows, ...cloudScheduleRows].map((row) => row.accountId),
      ),
    ]);
    const merged: BotDispatchTask[] = [
      ...commandRows.map((row) => this.commandTask(row, hosts.get(row.hostId))),
      ...scheduleRows.map((row) =>
        this.scheduleTask(row, hosts.get(row.hostId)),
      ),
      ...cloudCommandRows.map((row) =>
        this.cloudCommandTask(row, accounts.get(row.accountId)),
      ),
      ...cloudScheduleRows.map((row) =>
        this.cloudScheduleTask(row, accounts.get(row.accountId)),
      ),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);

    return {
      list: merged.slice((page - 1) * pageSize, page * pageSize),
      total:
        commandTotal + scheduleTotal + cloudCommandTotal + cloudScheduleTotal,
      page,
      pageSize,
    };
  }

  async taskDetail(
    user: CurrentUser,
    idRaw: unknown,
    query: {
      type?: BotDispatchTaskType;
      kind?: BotDispatchTargetKind;
    } = {},
  ): Promise<BotDispatchTaskDetail> {
    const id = parseId(idRaw, '任务 ID');
    const isCloud = query.kind === 'WORKBUDDY';
    if (isCloud && query.type === 'schedule') {
      const row = await this.prisma.workbuddyCloudSchedule.findFirst({
        where: { userId: user.userId, id },
      });
      if (!row)
        throw new BusinessException(ErrorCode.NOT_FOUND, '群控任务不存在');
      const accounts = await this.accountMap(user, [row.accountId]);
      // 云端定时详情看最近一轮指令的累积对话，没跑过就是空进度。
      const latest = await this.prisma.workbuddyCloudCommand.findFirst({
        where: { userId: user.userId, scheduleId: row.id },
        orderBy: { id: 'desc' },
      });
      return {
        ...this.cloudScheduleTask(row, accounts.get(row.accountId)),
        progressText: latest?.progressText || '',
        workspace: '',
      };
    }
    if (isCloud) {
      // 云端状态不会自己变：开详情先补一次同步，拿到的是腾讯云此刻的任务态。
      const synced = await this.cloud.syncCommand(user, id).catch(() => null);
      const row =
        synced ||
        (await this.prisma.workbuddyCloudCommand.findFirst({
          where: { userId: user.userId, id },
        }));
      if (!row)
        throw new BusinessException(ErrorCode.NOT_FOUND, '群控任务不存在');
      const accounts = await this.accountMap(user, [row.accountId]);
      return {
        ...this.cloudCommandTask(row, accounts.get(row.accountId)),
        progressText: row.progressText,
        workspace: '',
      };
    }
    if (query.type === 'schedule') {
      const row = await this.prisma.workbuddyHostSchedule.findFirst({
        where: { userId: user.userId, id },
      });
      if (!row)
        throw new BusinessException(ErrorCode.NOT_FOUND, '群控任务不存在');
      const hosts = await this.hostMap(user, [row.hostId]);
      // 定时任务详情看最近一轮指令的进度，没有跑过就是空进度。
      const latest = await this.prisma.workbuddyHostCommand.findFirst({
        where: { userId: user.userId, scheduleId: row.id },
        orderBy: { id: 'desc' },
      });
      return {
        ...this.scheduleTask(row, hosts.get(row.hostId)),
        progressText: latest?.progressText || '',
        workspace: text(toJsonObject(row.payload).cwd),
      };
    }
    const row = await this.prisma.workbuddyHostCommand.findFirst({
      where: { userId: user.userId, id },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '群控任务不存在');
    const hosts = await this.hostMap(user, [row.hostId]);
    const host = hosts.get(row.hostId);
    return {
      ...this.commandTask(row, host),
      progressText: row.progressText,
      workspace: text(toJsonObject(row.payload).cwd),
    };
  }

  /** 暂停 / 恢复 Agent 创建的定时任务；设备与云端两张定时表按 kind 路由。 */
  async scheduleStatus(
    user: CurrentUser,
    idRaw: unknown,
    body: { status?: string; kind?: BotDispatchTargetKind } = {},
  ): Promise<BotDispatchTask> {
    const id = parseId(idRaw, '定时任务 ID');
    const status =
      body.status === 'paused'
        ? 'paused'
        : body.status === 'enabled'
          ? 'enabled'
          : '';
    if (!status) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '定时任务状态只能是启用或暂停',
      );
    }
    if (body.kind === 'WORKBUDDY') {
      const row = await this.prisma.workbuddyCloudSchedule.findFirst({
        where: { userId: user.userId, id },
      });
      if (!row)
        throw new BusinessException(ErrorCode.NOT_FOUND, '群控任务不存在');
      const updated = await this.prisma.workbuddyCloudSchedule.update({
        where: { id: row.id },
        data: { status },
      });
      const accounts = await this.accountMap(user, [row.accountId]);
      return this.cloudScheduleTask(updated, accounts.get(row.accountId));
    }
    const row = await this.prisma.workbuddyHostSchedule.findFirst({
      where: { userId: user.userId, id },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '群控任务不存在');
    const updated = await this.prisma.workbuddyHostSchedule.update({
      where: { id: row.id },
      data: { status },
    });
    const hosts = await this.hostMap(user, [row.hostId]);
    return this.scheduleTask(updated, hosts.get(row.hostId));
  }

  // -------------------------------------------------------------- Agent 群控工具

  /**
   * `list_dispatch_devices`：Agent 判断「这活派给谁」的唯一数据来源，
   * 只列本轮勾选的目标类型（scope），在线/负载/电量/工作区/Agent 清单一次说清。
   */
  async toolDevices(
    user: CurrentUser,
    scope: BotDispatchTargetKind[],
    args: Record<string, unknown>,
  ): Promise<string> {
    const kind = text(args.kind).trim().toUpperCase();
    if (kind && !(scope as readonly string[]).includes(kind)) {
      return `本轮群控只勾选了 ${this.scopeLabel(scope)}，不能看 ${BOT_DISPATCH_TARGET_KIND_LABELS[kind] || kind}；要换范围请让用户在输入框「+ → Agent 群控任务」里补勾。`;
    }
    const kinds = kind ? [kind] : scope;
    if (!kinds.length) {
      return '这一轮没有勾选群控范围（主机 / 手机 / 企业云），无法列出目标。';
    }
    const list = await this.targetsFor(user, kinds as BotDispatchTargetKind[]);
    const targets = list
      .filter((row) => (kinds as readonly string[]).includes(row.clientKind))
      .sort(
        (a, b) =>
          Number(b.online) - Number(a.online) ||
          a.pendingCount - b.pendingCount,
      );
    if (!targets.length) {
      return `这个账号下还没有${kinds.map((item) => BOT_DISPATCH_TARGET_KIND_LABELS[item] || item).join('、')}可派目标：主机 / 手机请让用户先到「Agent-Bot → 主机 / 手机」完成配对，企业云请到「Agent-Bot → 企云账号」绑定腾讯云凭据。`;
    }
    return [
      `可派发目标（本轮范围：${this.scopeLabel(scope)}；在线优先、负载低的排前面）：`,
      ...targets.map(targetLine),
      '',
      '派单前请先给出分配方案并让用户确认；离线设备可以派发但会排队到上线后执行，已停用设备不能派发。',
      '企业云没有队列：凭据停用或读不到 Agent 就直接派单失败，指令是同步推给腾讯云会话的。',
    ].join('\n');
  }

  /**
   * `dispatch_device_task`：向一个目标派发一次性任务。
   * 设备走 BotHostService、云端走 WorkbuddyCloudService 的受控方法，校验与界面手动下发同源，
   * 这里只负责路由、文案与留痕。
   */
  async toolDispatchTask(
    user: CurrentUser,
    scope: BotDispatchTargetKind[],
    args: Record<string, unknown>,
    conversationId: number,
  ): Promise<string> {
    const targetId = positiveId(args.host_id ?? args.hostId);
    const instruction = text(args.instruction).trim();
    if (!targetId)
      return '缺少 host_id：请先用 list_dispatch_devices 找到目标编号（设备或企云账号都用它）。';
    if (!instruction) return '缺少 instruction：要交给目标做的事情不能为空。';
    const routed = await this.resolveKind(user, targetId, args, scope);
    if (routed.error) return routed.error;
    if (routed.kind === 'WORKBUDDY') {
      return this.dispatchCloudTask(user, scope, args, conversationId, {
        targetId,
        instruction,
      });
    }
    const title = text(args.title).trim().slice(0, 80);
    try {
      const { command, host } = await this.hosts.dispatchAsAgent(user, {
        hostId: targetId,
        instruction,
        workspace: text(args.cwd).trim(),
        timeoutSec: args.timeout_sec ?? args.timeoutSec,
        title,
        scope,
        agentConversationId: conversationId,
      });
      await this.audit(user, {
        action: 'Agent_dispatchTask',
        targetType: 'host_command',
        targetId: command.commandCode,
        targetLabel: title || instruction.slice(0, 60),
        params: { hostId: targetId, instruction: instruction.slice(0, 200) },
        outcome: 'ok',
      });
      const queueNote =
        command.status !== 'PENDING'
          ? `当前状态：${command.statusLabel || command.status}。`
          : host.status === 'ONLINE'
            ? '设备在线，下一次心跳（约 5 秒）就会领取执行。'
            : `设备当前${BOT_HOST_STATUS_LABELS[host.status] || '离线'}，指令已入队，等它上线自动执行——这句要告诉用户。`;
      return [
        `已向「${host.name}」派发任务，指令码 ${command.commandCode}。`,
        queueNote,
        '结果摘要会进「Agent 群控」页签的派单台账，跑完或失败会发站内通知；用户问进度时用 list_dispatch_tasks 查这条指令码。',
      ].join('\n');
    } catch (error) {
      await this.audit(user, {
        action: 'Agent_dispatchTask',
        targetType: 'host_command',
        targetId: String(targetId),
        targetLabel: title || instruction.slice(0, 60),
        params: { hostId: targetId, instruction: instruction.slice(0, 200) },
        outcome: 'failed',
        errorMessage: error instanceof Error ? error.message : '派单失败',
      });
      throw error;
    }
  }

  /** 云端派单单独成段：文案要说清「同步推给腾讯云、没有队列、不计积分」。 */
  private async dispatchCloudTask(
    user: CurrentUser,
    scope: BotDispatchTargetKind[],
    args: Record<string, unknown>,
    conversationId: number,
    input: { targetId: number; instruction: string },
  ) {
    const title = text(args.title).trim().slice(0, 80);
    try {
      const { command, account, agent } = await this.cloud.dispatchAsAgent(
        user,
        {
          accountId: input.targetId,
          instruction: input.instruction,
          agentId: args.agent_id ?? args.agentId,
          versionId: args.version_id ?? args.versionId,
          title,
          scope,
          agentConversationId: conversationId,
        },
      );
      await this.audit(user, {
        action: 'Agent_dispatchTask',
        targetType: 'cloud_command',
        targetId: command.commandCode,
        targetLabel: title || input.instruction.slice(0, 60),
        params: {
          accountId: input.targetId,
          agentId: agent.agentId,
          instruction: input.instruction.slice(0, 200),
        },
        outcome: 'ok',
      });
      return [
        `已向企云账号「${account.name}」上的 Agent「${agent.name}」派发任务，指令码 ${command.commandCode}。`,
        `指令已同步推给腾讯云会话（当前状态：${BOT_COMMAND_STATUS_LABELS[command.status] || command.status}），企业云没有队列，也不走本站模型网关、不计积分。`,
        '进度由平台按轮次拉取，跑完或失败会发站内通知；用户问进度时用 list_dispatch_tasks 查这条指令码。',
      ].join('\n');
    } catch (error) {
      await this.audit(user, {
        action: 'Agent_dispatchTask',
        targetType: 'cloud_command',
        targetId: String(input.targetId),
        targetLabel: title || input.instruction.slice(0, 60),
        params: { accountId: input.targetId },
        outcome: 'failed',
        errorMessage: error instanceof Error ? error.message : '云端派单失败',
      });
      throw error;
    }
  }

  /** `create_device_schedule`：在一个目标上建定时任务（到点由该通道自己执行固定指令）。 */
  async toolCreateSchedule(
    user: CurrentUser,
    scope: BotDispatchTargetKind[],
    args: Record<string, unknown>,
    conversationId: number,
  ): Promise<string> {
    const targetId = positiveId(args.host_id ?? args.hostId);
    const instruction = text(args.instruction).trim();
    const title = text(args.title).trim().slice(0, 80);
    if (!targetId)
      return '缺少 host_id：请先用 list_dispatch_devices 找到目标编号。';
    if (!title) return '缺少 title：给这个定时任务起个名字。';
    if (!instruction) return '缺少 instruction：每轮要交给目标做的事不能为空。';
    const routed = await this.resolveKind(user, targetId, args, scope);
    if (routed.error) return routed.error;
    const scheduleType = text(args.schedule_type).trim() || 'recurring';
    const scheduleConfig = args.schedule_config ?? args.scheduleConfig;
    const scheduledAt = args.scheduled_at ?? args.scheduledAt;
    if (routed.kind === 'WORKBUDDY') {
      try {
        const { schedule, agent } = await this.cloud.createScheduleAsAgent(
          user,
          {
            accountId: targetId,
            title,
            instruction,
            agentId: args.agent_id ?? args.agentId,
            versionId: args.version_id ?? args.versionId,
            scheduleType,
            scheduleConfig,
            scheduledAt,
            scope,
            agentConversationId: conversationId,
          },
        );
        await this.audit(user, {
          action: 'Agent_createSchedule',
          targetType: 'cloud_schedule',
          targetId: String(schedule.id),
          targetLabel: schedule.title,
          params: { accountId: targetId, agentId: agent.agentId },
          outcome: 'ok',
        });
        const next = localTime(schedule.scheduledAt);
        return [
          `已创建企业云定时任务「${schedule.title}」（任务号 ${BOT_CLOUD_SCHEDULE_KEY_PREFIX}${schedule.id}，Agent「${agent.name}」${next ? `，下一次 ${next}` : ''}），目标账号编号 ${targetId}。`,
          '到点由本站调度器向腾讯云下发一轮指令，账号凭据失效会直接失败并在台账留痕——这句要提醒用户。',
          '暂停 / 恢复在「Agent 群控」页签的定时任务里。',
        ].join('\n');
      } catch (error) {
        await this.audit(user, {
          action: 'Agent_createSchedule',
          targetType: 'cloud_schedule',
          targetId: String(targetId),
          targetLabel: title,
          params: { accountId: targetId },
          outcome: 'failed',
          errorMessage:
            error instanceof Error ? error.message : '创建云端定时任务失败',
        });
        throw error;
      }
    }
    try {
      const { schedule } = await this.hosts.createScheduleAsAgent(user, {
        hostId: targetId,
        title,
        instruction,
        scheduleType,
        scheduleConfig,
        scheduledAt,
        workspace: text(args.cwd).trim(),
        scope,
        agentConversationId: conversationId,
      });
      await this.audit(user, {
        action: 'Agent_createSchedule',
        targetType: 'host_schedule',
        targetId: String(schedule.id),
        targetLabel: schedule.title,
        params: { hostId: targetId, scheduleType: schedule.scheduleType },
        outcome: 'ok',
      });
      const next = localTime(schedule.scheduledAt);
      return [
        `已创建设备定时任务「${schedule.title}」（任务号 ${BOT_SCHEDULE_KEY_PREFIX}${schedule.id}，${schedule.scheduleTypeLabel}${next ? `，下一次 ${next}` : ''}），目标设备编号 ${schedule.hostId}。`,
        '到点由这台设备的客户端直接执行指令，执行时刻设备需在线，否则会排队顺延——这句要提醒用户。',
        '暂停/恢复在「Agent 群控」页签的设备定时任务里。',
      ].join('\n');
    } catch (error) {
      await this.audit(user, {
        action: 'Agent_createSchedule',
        targetType: 'host_schedule',
        targetId: String(targetId),
        targetLabel: title,
        params: { hostId: targetId },
        outcome: 'failed',
        errorMessage:
          error instanceof Error ? error.message : '创建定时任务失败',
      });
      throw error;
    }
  }

  /** `list_dispatch_tasks`：查已派发任务的状态与结果摘要（用户问「刚才那个活干完没」）。 */
  async toolTasks(
    user: CurrentUser,
    args: Record<string, unknown>,
  ): Promise<string> {
    const commandCode = text(args.command_code ?? args.commandCode)
      .trim()
      .slice(0, 40);
    if (commandCode) {
      const row = await this.prisma.workbuddyHostCommand.findFirst({
        where: { userId: user.userId, commandCode },
      });
      if (row) {
        const hosts = await this.hostMap(user, [row.hostId]);
        return this.commandText(row, hosts.get(row.hostId));
      }
      const cloudRow = await this.prisma.workbuddyCloudCommand.findFirst({
        where: { userId: user.userId, commandCode },
      });
      if (!cloudRow) {
        return `没有找到指令码 ${commandCode}：请确认是本轮账号派出去的任务。`;
      }
      // 云端状态只有轮询才会变：查一条就是现在问腾讯云，不能让模型拿到过期状态。
      const synced = await this.cloud
        .syncCommand(user, cloudRow.id)
        .catch(() => cloudRow);
      const accounts = await this.accountMap(user, [cloudRow.accountId]);
      return this.cloudCommandText(synced, accounts.get(cloudRow.accountId));
    }
    const targetId = positiveId(args.host_id ?? args.hostId);
    const limit = Math.min(20, Math.max(1, positiveId(args.limit) || 10));
    let result = await this.tasks(user, { source: 'AGENT', pageSize: limit });
    // 云端行只有被轮询才会变状态：本轮里有未终态的企云指令就先追一次再重新取台账。
    const unfinished = result.list.filter(
      (row) =>
        row.clientKind === 'WORKBUDDY' &&
        row.type === 'command' &&
        !TERMINAL_COMMAND_STATUS.has(row.status),
    );
    if (unfinished.length) {
      await Promise.all(
        unfinished.map((row) =>
          this.cloud.syncCommand(user, row.id).catch(() => null),
        ),
      );
      result = await this.tasks(user, { source: 'AGENT', pageSize: limit });
    }
    const rows = targetId
      ? result.list.filter((row) => row.hostId === targetId)
      : result.list;
    if (!rows.length) {
      return '还没有 Agent 派单记录：先用 list_dispatch_devices 看清目标，再和用户确认分配方案。';
    }
    return [
      `最近的群控派单（共 ${result.total} 条，这里列 ${rows.length} 条）：`,
      ...rows.map(
        (row) =>
          `- ${row.type === 'schedule' ? '定时任务' : '派单'}「${row.title}」→ ${row.hostName}（${BOT_DISPATCH_TARGET_KIND_LABELS[row.clientKind] || row.clientKind}）：${row.statusLabel}${row.resultSummary ? ` · ${row.resultSummary}` : ''}${row.error ? ` · 失败原因：${row.error}` : ''}（${row.taskKey}）`,
      ),
    ].join('\n');
  }

  /** `cancel_dispatch_task`：设备只碰本账号指令；云端已下发的会话停不了，只能停止跟踪。 */
  async toolCancel(
    user: CurrentUser,
    args: Record<string, unknown>,
  ): Promise<string> {
    const commandCode = text(args.command_code ?? args.commandCode)
      .trim()
      .slice(0, 40);
    if (!commandCode) return '缺少 command_code：要取消哪条派单？';
    const row = await this.prisma.workbuddyHostCommand.findFirst({
      where: { userId: user.userId, commandCode },
    });
    if (!row) {
      const cloudRow = await this.prisma.workbuddyCloudCommand.findFirst({
        where: { userId: user.userId, commandCode },
      });
      if (!cloudRow) {
        return `没有找到指令码 ${commandCode}：只能取消这个账号自己派出去的任务。`;
      }
      if (TERMINAL_COMMAND_STATUS.has(cloudRow.status)) {
        return `指令 ${commandCode} 已经是终态（${BOT_COMMAND_STATUS_LABELS[cloudRow.status] || cloudRow.status}），不需要取消。`;
      }
      const { stopped } = await this.cloud.cancelAsAgent(user, commandCode);
      await this.audit(user, {
        action: 'Agent_cancelDispatchTask',
        targetType: 'cloud_command',
        targetId: commandCode,
        targetLabel: cloudRow.title,
        params: { accountId: cloudRow.accountId },
        outcome: 'ok',
      });
      return stopped
        ? `指令 ${commandCode} 已经推给腾讯云会话，平台中止不了它：已停止跟踪并从台账里按「已取消」收口，云端那一轮仍会跑完，结果可在「Agent-Bot → 企云账号」的对话里看——这句要如实告诉用户。`
        : `已取消还没推出去的云端指令 ${commandCode}。`;
    }
    if (TERMINAL_COMMAND_STATUS.has(row.status)) {
      return `指令 ${commandCode} 已经是终态（${BOT_COMMAND_STATUS_LABELS[row.status] || row.status}），不需要取消。`;
    }
    await this.hosts.cancel(user, commandCode);
    await this.audit(user, {
      action: 'Agent_cancelDispatchTask',
      targetType: 'host_command',
      targetId: commandCode,
      targetLabel: row.title,
      params: { hostId: row.hostId },
      outcome: 'ok',
    });
    return row.status === 'PENDING'
      ? `已取消排队中的指令 ${commandCode}，设备不会再执行它。`
      : `指令 ${commandCode} 已经在设备上执行，取消请求已下发：客户端下一次回传时会中断，期间仍可能产生结果。`;
  }

  /**
   * 目标编号在设备表与企云账号表里会重复，因此工具入参要么显式给 kind，
   * 要么由两侧唯一命中推断；两侧都命中时回一条可操作提示，不猜。
   */
  private async resolveKind(
    user: CurrentUser,
    targetId: number,
    args: Record<string, unknown>,
    scope: BotDispatchTargetKind[],
  ): Promise<{ kind: BotDispatchTargetKind | ''; error: string }> {
    if (!scope.length) {
      return {
        kind: '',
        error:
          '这一轮没有勾选群控范围（主机 / 手机 / 企业云）：请让用户在输入框「+ → Agent 群控任务」里勾选后再派。',
      };
    }
    const asked = text(args.kind).trim().toUpperCase();
    if (asked) {
      if (!(scope as readonly string[]).includes(asked)) {
        return {
          kind: '',
          error: `本轮群控没有勾选「${BOT_DISPATCH_TARGET_KIND_LABELS[asked] || asked}」，要派这类目标请让用户在「+ → Agent 群控任务」里补勾。`,
        };
      }
      return { kind: asked as BotDispatchTargetKind, error: '' };
    }
    // 编号在设备表与企云账号表里会重复：先看本轮勾选了哪几类，再按命中情况决定，不猜。
    const wantsDevice = scope.some((item) => DEVICE_KINDS.includes(item));
    const wantsCloud = scope.includes('WORKBUDDY');
    const hostHit = wantsDevice
      ? await this.prisma.workbuddyHost.count({
          where: { userId: user.userId, id: targetId },
        })
      : 0;
    const cloudHit = wantsCloud
      ? await this.prisma.workbuddyAccount.count({
          where: { createdBy: user.userId, id: targetId },
        })
      : 0;
    if (hostHit && cloudHit) {
      return {
        kind: '',
        error: `编号 ${targetId} 在这个账号里既是一台设备也是一把企云凭据：派单时请同时给 kind（DESKTOP / AWBOT / WORKBUDDY）。`,
      };
    }
    if (cloudHit) return { kind: 'WORKBUDDY', error: '' };
    if (hostHit) return { kind: 'DESKTOP', error: '' };
    return {
      kind: '',
      error: `编号 ${targetId} 在这个账号下既不是${wantsDevice ? '设备' : '本轮勾选的设备类型'}，也不是${wantsCloud ? '企云凭据' : '本轮勾选的企云账号'}：请用 list_dispatch_devices 确认目标，或让用户补勾群控范围。`,
    };
  }

  private scopeLabel(scope: BotDispatchTargetKind[]) {
    return scope.length
      ? scope
          .map((item) => BOT_DISPATCH_TARGET_KIND_LABELS[item] || item)
          .join(' + ')
      : '（未勾选）';
  }

  private commandText(
    row: {
      commandCode: string;
      hostId: number;
      title: string;
      status: string;
      error: string;
      result: unknown;
      progressText: string;
      payload: unknown;
      finishedAt: Date | null;
      createdAt: Date;
    },
    host?: HostRow,
  ) {
    const summary = text(toJsonObject(row.result).text).slice(0, 600);
    const progress = row.progressText.trim().split('\n').slice(-3).join(' / ');
    return [
      `指令 ${row.commandCode}「${row.title}」→ ${host?.name || `设备 #${row.hostId}`}：${BOT_COMMAND_STATUS_LABELS[row.status] || row.status}`,
      `派发时间 ${localTime(row.createdAt)}${row.finishedAt ? `，结束 ${localTime(row.finishedAt)}` : ''}`,
      progress ? `最近过程：${progress}` : '',
      summary ? `结果摘要：${summary}` : '',
      row.error ? `失败原因：${row.error}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  /** 云端指令给模型的口径：进度累积就是这段会话的完整往来，结果摘要取最后一条 Agent 回复。 */
  private cloudCommandText(
    row: {
      commandCode: string;
      accountId: number;
      agentId: string;
      title: string;
      status: string;
      error: string;
      progressText: string;
      finishedAt: Date | null;
      createdAt: Date;
    },
    account?: AccountRow,
  ) {
    const progress = row.progressText.trim().split('\n').slice(-6).join('\n');
    return [
      `云端指令 ${row.commandCode}「${row.title}」→ ${account?.name || `企云账号 #${row.accountId}`}${row.agentId ? ` · Agent ${row.agentId}` : ''}：${BOT_COMMAND_STATUS_LABELS[row.status] || row.status}`,
      `派发时间 ${localTime(row.createdAt)}${row.finishedAt ? `，结束 ${localTime(row.finishedAt)}` : ''}`,
      progress ? `最近往来：${clip(progress, 1200)}` : '',
      row.error ? `失败原因：${row.error}` : '',
      TERMINAL_COMMAND_STATUS.has(row.status)
        ? ''
        : '未跑完时可稍后再查这条指令码；企业云跑在用户自己的腾讯云账号里，本站不计积分。',
    ]
      .filter(Boolean)
      .join('\n');
  }

  /** 派单动作在「智能体记忆」操作流按写操作留痕；记忆是旁路，不能把业务带下水。 */
  private async audit(
    user: CurrentUser,
    draft: {
      action: string;
      targetType: string;
      targetId: string;
      targetLabel: string;
      params: Record<string, unknown>;
      outcome: 'ok' | 'failed' | 'blocked';
      errorMessage?: string;
    },
  ) {
    await this.memory
      ?.record({
        userId: user.userId,
        domain: 'agent_dispatch',
        method: 'POST',
        path: '/agent-dispatch/tools',
        errorCode: '',
        errorMessage: draft.errorMessage || '',
        channel: 'web',
        ...draft,
      })
      .catch(() => undefined);
  }
}
