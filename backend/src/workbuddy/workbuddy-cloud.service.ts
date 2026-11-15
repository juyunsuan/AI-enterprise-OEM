import { Prisma } from '../../generated/prisma';
import { text } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { toJsonInput } from '../common/json-input';
import {
  computeNextOccurrence,
  readScheduleFields,
  scheduleConfigOf,
} from '../common/schedule';
import { CurrentUser } from '../auth/current-user';
import { PrismaService } from '../prisma/prisma.service';
import { WorkbuddyAccountService } from './workbuddy-account.service';
import { randomUUID } from 'node:crypto';
import {
  wbAgentTaskGet,
  wbCreateAgentSession,
  wbDescribeMessageEventList,
  wbDescribeUserAccessToken,
  wbPushInstruction,
  type WbCreds,
} from './workbuddy-client';
import { shorten } from './workbuddy-shared';

/** 云端指令的终态；非终态由同步任务继续追。 */
const TERMINAL_COMMAND = ['DONE', 'FAILED', 'CANCELED', 'TIMEOUT'];
const MAX_EVENT_PAGES = 10;

/** 独立的云端定时配置；所有读取及写入均限定当前用户和账号。 */
export class WorkbuddyCloudService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: WorkbuddyAccountService,
  ) {}

  async commands(user: CurrentUser, accountId: number) {
    await this.accounts.loadOwned(user, accountId);
    const rows = await this.prisma.workbuddyCloudCommand.findMany({
      where: { userId: user.userId, accountId },
      orderBy: { id: 'desc' },
      take: 200,
    });
    return rows.map((row) => this.visible(row));
  }

  async sendCommand(
    user: CurrentUser,
    accountId: number,
    body: Record<string, unknown>,
  ) {
    const { creds } = await this.accounts.credsOf(user, accountId);
    const instruction =
      typeof body.instruction === 'string' ? body.instruction.trim() : '';
    const agentId = typeof body.agentId === 'string' ? body.agentId.trim() : '';
    const versionId =
      typeof body.versionId === 'string' ? body.versionId.trim() : '';
    if (
      !instruction ||
      instruction.length > 20000 ||
      !agentId ||
      agentId.length > 64 ||
      versionId.length > 64
    )
      this.fail('Agent、版本或指令无效');
    let previous: {
      sessionId: string;
      endpoint: string;
      agentId: string;
      versionId: string;
      conversationId: number;
    } | null = null;
    if (body.previousCommandId !== undefined) {
      const id = body.previousCommandId;
      if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0)
        this.fail('历史指令 ID 无效');
      previous = await this.prisma.workbuddyCloudCommand.findFirst({
        where: { id, userId: user.userId, accountId, agentId, versionId },
        select: {
          sessionId: true,
          endpoint: true,
          agentId: true,
          versionId: true,
          conversationId: true,
        },
      });
      if (!previous?.sessionId || !previous.endpoint)
        this.fail('历史会话不存在或不可用');
    }
    // 同一段对话共用一个 conversationId：续聊沿用上一轮的，开新对话才递增。
    const conversationId = previous
      ? previous.conversationId || (await this.nextConversationId(accountId))
      : await this.nextConversationId(accountId);
    const command = await this.prisma.workbuddyCloudCommand.create({
      data: {
        userId: user.userId,
        accountId,
        agentId,
        versionId,
        conversationId,
        commandCode: randomUUID(),
        title: instruction.slice(0, 200),
        payload: { instruction },
        status: 'PENDING',
      },
    });
    let sessionId = previous?.sessionId || '';
    let endpoint = previous?.endpoint || '';
    try {
      if (!sessionId || !endpoint) {
        const session = await wbCreateAgentSession(creds, {
          agentId,
          versionId: versionId || undefined,
        });
        sessionId = String(session.SessionId || '');
        endpoint = String(session.EndpointSet?.[0]?.Url || '');
        if (
          !sessionId ||
          !endpoint ||
          sessionId.length > 128 ||
          endpoint.length > 500
        )
          this.fail('腾讯云未返回有效的会话或接入点');
      }
      await this.prisma.workbuddyCloudCommand.update({
        where: { id: command.id },
        data: { sessionId, endpoint, dispatchedAt: new Date() },
      });
      const { token } = await wbDescribeUserAccessToken(creds);
      if (!token) this.fail('腾讯云未返回会话访问令牌');
      const pushed = await wbPushInstruction({
        endpoint,
        token,
        sessionId,
        instruction,
      });
      const saved = await this.prisma.workbuddyCloudCommand.update({
        where: { id: command.id },
        data: {
          status: 'DISPATCHED',
          result: toJsonInput(pushSummary(pushed.payload)),
        },
      });
      return this.visible(saved);
    } catch (error) {
      const reason =
        error instanceof BusinessException ? error.message : reasonOf(error);
      await this.prisma.workbuddyCloudCommand.update({
        where: { id: command.id },
        data: {
          sessionId,
          endpoint,
          status: 'FAILED',
          error: shorten(reason),
          finishedAt: new Date(),
        },
      });
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        `云端会话调用失败：${shorten(reason)}`,
      );
    }
  }

  /** 账号级对话的补全：追 A2A 任务态并补拉新消息，供前端轮询。 */
  async syncCommand(user: CurrentUser, commandId: number) {
    const row = await this.prisma.workbuddyCloudCommand.findFirst({
      where: { id: commandId, userId: user.userId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '指令不存在');
    await this.accounts.loadOwned(user, row.accountId);
    if (TERMINAL_COMMAND.includes(row.status)) return this.visible(row);
    const { creds } = await this.accounts.credsOf(user, row.accountId);
    const { token } = await wbDescribeUserAccessToken(creds);
    if (!token)
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '腾讯云未返回会话访问令牌',
      );
    const saved = await this.syncOne(row, creds, token);
    return this.visible(saved);
  }

  /** 调度器与轮询共用的单条追平：先看任务态，再补消息事件。 */
  private async syncOne(
    row: Prisma.WorkbuddyCloudCommandGetPayload<object>,
    creds: WbCreds,
    token: string,
  ) {
    let status = row.status;
    let error = row.error;
    let result = toJsonObject(row.result);
    const remoteId = text(result.a2aTaskId).trim();
    if (remoteId && row.endpoint) {
      const current = await wbAgentTaskGet({
        rpcUrl: row.endpoint,
        token,
        taskId: remoteId,
      });
      const remote =
        current?.result && typeof current.result === 'object'
          ? (current.result as Record<string, unknown>)
          : {};
      const state = text(
        (remote.status as Record<string, unknown> | undefined)?.state,
      )
        .trim()
        .toLowerCase();
      if (state === 'completed') status = 'DONE';
      else if (state === 'failed' || state === 'rejected') {
        status = 'FAILED';
        error = shorten(state || 'Agent 返回失败');
      } else if (state === 'canceled' || state === 'cancelled')
        status = 'CANCELED';
      result = { ...result, state: state || null, remote: remote };
    }
    let progress = '';
    if (row.sessionId && row.agentId) {
      progress = await this.collectText(creds, row);
    }
    return this.prisma.workbuddyCloudCommand.update({
      where: { id: row.id },
      data: {
        status,
        error,
        progressText: progress || row.progressText,
        result: toJsonInput(result),
        ...(TERMINAL_COMMAND.includes(status)
          ? { finishedAt: row.finishedAt || new Date() }
          : {}),
      },
    });
  }

  private async collectText(
    creds: WbCreds,
    row: { agentId: string; sessionId: string },
  ) {
    const parts: string[] = [];
    for (let page = 0; page < MAX_EVENT_PAGES; page += 1) {
      const response = await wbDescribeMessageEventList(creds, {
        sessionId: row.sessionId,
        agentId: row.agentId,
        offset: page * 100,
        limit: 100,
      });
      const batch = Array.isArray(response.MessageEventSet)
        ? response.MessageEventSet
        : [];
      if (!batch.length) break;
      for (const event of batch) {
        const type = text(event.EventType).trim().toLowerCase();
        const content = text(event.Message?.Content).trim();
        if (!content) continue;
        if (type === 'assistant' || type === 'user') {
          parts.push(`${type === 'user' ? '我' : 'Agent'}：${content}`);
        }
      }
      const total = Number(response.TotalCount || 0);
      if (total && (page + 1) * 100 >= total) break;
      if (batch.length < 100) break;
    }
    return parts.join('\n\n').slice(-20000);
  }

  /** 内部口径：接入点只留在库内，下发给浏览器的一律剥掉。 */
  private visible<T extends { endpoint?: unknown }>(
    row: T,
  ): Omit<T, 'endpoint'> {
    const copy = { ...row };
    delete copy.endpoint;
    return copy;
  }

  private fail(message: string): never {
    throw new BusinessException(ErrorCode.BAD_REQUEST, message);
  }

  /** 会话号：同一账号下递增，用来把多轮指令归到一段对话里。 */
  private async nextConversationId(accountId: number) {
    const last = await this.prisma.workbuddyCloudCommand.findFirst({
      where: { accountId },
      orderBy: { conversationId: 'desc' },
      select: { conversationId: true },
    });
    return (last?.conversationId || 0) + 1;
  }

  /**
   * 调度器入口：把到点的云端定时各跑一轮。
   * 先把下一次执行时刻推走再跑（避免同一轮被下个 tick 重复接走），
   * 一次性的跑完即置空；错过不补跑，失败只留痕。
   */
  async advanceDue() {
    const now = new Date();
    const due = await this.prisma.workbuddyCloudSchedule.findMany({
      where: { status: 'enabled', scheduledAt: { lte: now } },
      orderBy: { scheduledAt: 'asc' },
      take: 20,
    });
    for (const row of due) {
      const nextAt =
        row.scheduleType === 'recurring'
          ? computeNextOccurrence(scheduleConfigOf(row.scheduleConfig), now)
          : null;
      await this.prisma.workbuddyCloudSchedule.update({
        where: { id: row.id },
        data: { scheduledAt: nextAt },
      });
      await this.runSchedule(row);
    }
    return due.length;
  }

  /** 一轮执行：落运行记录，再按账号实际下发；任何失败都记成 failed，不抛出。 */
  private async runSchedule(
    row: Prisma.WorkbuddyCloudScheduleGetPayload<object>,
  ) {
    const run = await this.prisma.workbuddyCloudScheduleRun.create({
      data: {
        scheduleId: row.id,
        accountId: row.accountId,
        userId: row.userId,
        status: 'dispatched',
        startedAt: new Date(),
      },
    });
    try {
      const account = await this.prisma.workbuddyAccount.findFirst({
        where: { id: row.accountId, createdBy: row.userId },
      });
      if (!account) throw new Error('所属 Workbuddy 账号已不存在');
      if (account.status !== 'active')
        throw new Error('所属 Workbuddy 账号已停用');
      const payload = toJsonObject(row.payload);
      const agentId = text(payload.agentId).trim();
      const versionId = text(payload.versionId).trim();
      if (!agentId) throw new Error('定时任务缺少 Agent');
      const creds = this.accounts.creds(account);
      const session = await wbCreateAgentSession(creds, {
        agentId,
        versionId: versionId || undefined,
      });
      const sessionId = String(session.SessionId || '');
      const endpoint = String(session.EndpointSet?.[0]?.Url || '');
      if (!sessionId || !endpoint)
        throw new Error('腾讯云未返回有效的会话或接入点');
      const command = await this.prisma.workbuddyCloudCommand.create({
        data: {
          userId: row.userId,
          accountId: row.accountId,
          agentId,
          versionId,
          sessionId,
          endpoint,
          commandCode: randomUUID(),
          kind: 'schedule',
          title: row.title,
          payload: toJsonInput({ instruction: row.instruction }),
          scheduleId: row.id,
        },
      });
      const { token } = await wbDescribeUserAccessToken(creds);
      if (!token) throw new Error('腾讯云未返回会话访问令牌');
      const pushed = await wbPushInstruction({
        endpoint,
        token,
        sessionId,
        instruction: row.instruction,
      });
      await this.prisma.workbuddyCloudCommand.update({
        where: { id: command.id },
        data: {
          status: 'DISPATCHED',
          dispatchedAt: new Date(),
          result: toJsonInput(pushSummary(pushed.payload)),
        },
      });
      await this.prisma.workbuddyCloudScheduleRun.update({
        where: { id: run.id },
        data: {
          status: 'succeeded',
          commandCode: command.commandCode,
          finishedAt: new Date(),
        },
      });
      await this.prisma.workbuddyCloudSchedule.update({
        where: { id: row.id },
        data: {
          lastRunAt: new Date(),
          lastStatus: 'succeeded',
          lastError: '',
          runCount: { increment: 1 },
        },
      });
    } catch (error) {
      const reason = shorten(reasonOf(error));
      await this.prisma.workbuddyCloudScheduleRun.update({
        where: { id: run.id },
        data: { status: 'failed', error: reason, finishedAt: new Date() },
      });
      await this.prisma.workbuddyCloudSchedule.update({
        where: { id: row.id },
        data: {
          lastRunAt: new Date(),
          lastStatus: 'failed',
          lastError: reason,
          runCount: { increment: 1 },
        },
      });
    }
  }

  /** 定时里的「立即跑一次」：不推进排期，只补一条手动运行记录。 */
  async runNow(user: CurrentUser, id: number) {
    const row = await this.owned(user, id);
    await this.runSchedule(row);
    const fresh = await this.prisma.workbuddyCloudSchedule.findUnique({
      where: { id },
    });
    return fresh || row;
  }

  private async owned(user: CurrentUser, id: number) {
    const row = await this.prisma.workbuddyCloudSchedule.findFirst({
      where: { id, userId: user.userId },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '定时任务不存在');
    await this.accounts.loadOwned(user, row.accountId);
    return row;
  }
  async list(user: CurrentUser, accountId: number) {
    await this.accounts.loadOwned(user, accountId);
    return this.prisma.workbuddyCloudSchedule.findMany({
      where: { userId: user.userId, accountId },
      orderBy: { id: 'desc' },
      take: 200,
    });
  }
  async get(user: CurrentUser, id: number) {
    return this.owned(user, id);
  }
  async create(
    user: CurrentUser,
    accountId: number,
    body: Record<string, unknown>,
  ) {
    await this.accounts.loadOwned(user, accountId);
    const data = this.validate(body);
    return this.prisma.workbuddyCloudSchedule.create({
      data: { ...data, userId: user.userId, accountId },
    });
  }
  async update(user: CurrentUser, id: number, body: Record<string, unknown>) {
    const row = await this.owned(user, id);
    const data = this.validate({ ...row, ...body });
    return this.prisma.workbuddyCloudSchedule.update({ where: { id }, data });
  }
  async remove(user: CurrentUser, id: number) {
    await this.owned(user, id);
    await this.prisma.workbuddyCloudSchedule.delete({ where: { id } });
    return { id };
  }
  async runs(user: CurrentUser, id: number) {
    const row = await this.owned(user, id);
    return this.prisma.workbuddyCloudScheduleRun.findMany({
      where: { scheduleId: id, userId: user.userId, accountId: row.accountId },
      orderBy: { id: 'desc' },
      take: 200,
    });
  }

  /** 入参口径与 Bot 主机一致：定时一次 / 周期重复，复用统一的排期推算。 */
  private validate(body: Record<string, unknown>) {
    const title = text(body.title).trim();
    const instruction = text(body.instruction).trim();
    if (
      !title ||
      title.length > 80 ||
      !instruction ||
      instruction.length > 20000
    )
      this.fail('标题或指令无效');
    const payload =
      body.payload &&
      typeof body.payload === 'object' &&
      !Array.isArray(body.payload)
        ? (body.payload as Record<string, unknown>)
        : {};
    const agentId = (text(payload.agentId) || text(body.agentId)).trim();
    const versionId = (text(payload.versionId) || text(body.versionId)).trim();
    if (!agentId || agentId.length > 64 || versionId.length > 64)
      this.fail('请选择要执行的云端 Agent');
    const fields = readScheduleFields(body);
    const scheduleType = text(fields.scheduleType).trim();
    if (scheduleType !== 'scheduled' && scheduleType !== 'recurring')
      this.fail('定时任务要么「定时一次」，要么「周期重复」');
    const now = new Date();
    const scheduledAt =
      scheduleType === 'recurring'
        ? computeNextOccurrence(scheduleConfigOf(fields.scheduleConfig), now)
        : (fields.scheduledAt ?? null);
    if (!scheduledAt) this.fail('排期算不出下一次执行时刻，请检查时间与频率');
    const status =
      body.status === 'paused' || body.status === 'disabled'
        ? 'paused'
        : 'enabled';
    return {
      title,
      instruction,
      scheduleType,
      status,
      scheduledAt,
      scheduleConfig: fields.scheduleConfig ?? {},
      payload: toJsonInput({ agentId, versionId }),
    };
  }
}

function toJsonObject(
  value: Prisma.JsonValue | null | undefined,
): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function reasonOf(error: unknown) {
  if (error instanceof Error) return error.message;
  const raw = text(error).trim();
  return raw || '未知异常';
}

/** 回包里取任务号与状态，整包不进库（避免把接入点等内容重复存一份）。 */
function pushSummary(payload: Record<string, unknown>) {
  const result =
    payload?.result && typeof payload.result === 'object'
      ? (payload.result as Record<string, unknown>)
      : {};
  return {
    a2aTaskId: text(result.id).trim() || null,
    state:
      text(
        (result.status as Record<string, unknown> | undefined)?.state,
      ).trim() || null,
  };
}
