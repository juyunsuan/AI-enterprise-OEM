import { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { PrismaService } from '../prisma/prisma.service';
import { stub } from '../../test/doubles';
import { WorkbuddyCloudService } from './workbuddy-cloud.service';
import type { WorkbuddyAccountService } from './workbuddy-account.service';
import {
  wbAgentTaskGet,
  wbCreateAgentSession,
  wbDescribeAgentList,
  wbDescribeMessageEventList,
  wbDescribeUserAccessToken,
  wbPushInstruction,
} from './workbuddy-client';

/**
 * 企业云改版的三条硬约束：账号归属隔离、定时先推排期再跑、失败只留痕不外抛。
 * 群控并入后（方案 §4.7）再加四条：Agent 派单要标来源、Agent 省略时按最近用过回落、
 * 取消要说清「停止跟踪」、终态必须走与设备同一条站内信出口。
 * 用内存替身钉住，避免改派发链路时把隔离或收口弄丢。
 */

jest.mock('./workbuddy-client', () => ({
  wbAgentTaskGet: jest.fn(),
  wbCreateAgentSession: jest.fn(),
  wbDescribeAgentList: jest.fn(),
  wbDescribeMessageEventList: jest.fn(),
  wbDescribeUserAccessToken: jest.fn(),
  wbPushInstruction: jest.fn(),
}));

const remote = {
  createSession: wbCreateAgentSession as jest.Mock,
  agentList: wbDescribeAgentList as jest.Mock,
  token: wbDescribeUserAccessToken as jest.Mock,
  push: wbPushInstruction as jest.Mock,
  taskGet: wbAgentTaskGet as jest.Mock,
  events: wbDescribeMessageEventList as jest.Mock,
};

function mockCloud(
  input: {
    agents?: { AgentId: string; AgentName: string; LatestVersionId?: string }[];
  } = {},
) {
  remote.agentList.mockResolvedValue({
    TotalCount: (input.agents ?? []).length,
    AgentSet: input.agents ?? [
      { AgentId: 'agent-1', AgentName: '数字员工甲', LatestVersionId: 'v1' },
      { AgentId: 'agent-2', AgentName: '数字员工乙', LatestVersionId: 'v2' },
    ],
  });
  remote.createSession.mockResolvedValue({
    SessionId: 'sess-1',
    EndpointSet: [{ Url: 'https://a2a.example/rpc' }],
  });
  remote.token.mockResolvedValue({ token: 'tok-1' });
  remote.push.mockResolvedValue({
    payload: { result: { id: 'task-1', status: { state: 'working' } } },
  });
}

type Row = Record<string, unknown>;

const user = new CurrentUser('u1', 'owner', 'user');

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    // OR / AND：群控扫尾的 where 用到，条件本身是数组。
    if (Array.isArray(cond) && key === 'OR') {
      return (cond as Row[]).some((item) => matches(row, item));
    }
    if (Array.isArray(cond) && key === 'AND') {
      return (cond as Row[]).every((item) => matches(row, item));
    }
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      const bag = cond as Row;
      if ('in' in bag) return (bag['in'] as unknown[]).includes(row[key]);
      if ('notIn' in bag)
        return !(bag['notIn'] as unknown[]).includes(row[key]);
      if ('not' in bag) return row[key] !== bag['not'];
      if ('lte' in bag) {
        const value = row[key];
        return (
          value instanceof Date &&
          value.getTime() <= (bag['lte'] as Date).getTime()
        );
      }
      if ('lt' in bag) {
        const value = row[key];
        return (
          value instanceof Date &&
          value.getTime() < (bag['lt'] as Date).getTime()
        );
      }
      if ('equals' in bag) return row[key] === bag['equals'];
      return true;
    }
    return row[key] === cond;
  });
}

function whereOf(opts: Row): Row {
  return (opts['where'] as Row) || opts;
}

function applyData(row: Row, data: Row) {
  for (const [key, value] of Object.entries(data)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'increment' in (value as Row)
    ) {
      row[key] = Number(row[key] || 0) + Number((value as Row)['increment']);
    } else {
      row[key] = value;
    }
  }
  row['updatedAt'] = new Date();
}

function table(seed: Row[] = [], defaults: Row = {}) {
  let seq = 1000;
  return {
    rows: seed,
    findFirst: (opts: Row) => {
      const row = seed.find((item) => matches(item, whereOf(opts)));
      return Promise.resolve(row ? { ...row } : null);
    },
    findUnique: (opts: Row) => {
      const row = seed.find((item) => matches(item, whereOf(opts)));
      return Promise.resolve(row ? { ...row } : null);
    },
    findMany: (opts: Row = {}) => {
      let rows = seed.filter((item) => matches(item, whereOf(opts)));
      if (opts['take'] !== undefined)
        rows = rows.slice(0, Number(opts['take']));
      return Promise.resolve(rows.map((row) => ({ ...row })));
    },
    count: (opts: Row = {}) =>
      Promise.resolve(
        seed.filter((item) => matches(item, whereOf(opts))).length,
      ),
    create: ({ data }: { data: Row }) => {
      const row: Row = {
        id: (seq += 1),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...defaults,
        ...data,
      };
      seed.push(row);
      return Promise.resolve({ ...row });
    },
    update: ({ where, data }: { where: Row; data: Row }) => {
      const row = seed.find((item) => matches(item, where));
      if (!row) throw new Error('row not found');
      applyData(row, data);
      return Promise.resolve({ ...row });
    },
    deleteMany: ({ where }: { where: Row }) => {
      const kept = seed.filter((row) => !matches(row, where));
      const count = seed.length - kept.length;
      seed.length = 0;
      seed.push(...kept);
      return Promise.resolve({ count });
    },
  };
}

const accountRow = {
  id: 7,
  createdBy: 'u1',
  name: '主账号',
  secretIdCipher: 'sid',
  secretKeyCipher: 'skey',
  region: 'ap-guangzhou',
  status: 'active',
};

function scheduleRow(overrides: Row = {}): Row {
  return {
    id: 3,
    userId: 'u1',
    accountId: 7,
    title: '每天整理',
    instruction: '整理今天的线索',
    payload: { agentId: 'agent-1' },
    scheduleType: 'recurring',
    scheduleConfig: { freq: 'daily', time: '09:00' },
    scheduledAt: new Date(Date.now() - 60_000),
    status: 'enabled',
    lastRunAt: null,
    lastStatus: '',
    lastError: '',
    runCount: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

function setup(
  input: {
    accounts?: Row[];
    schedules?: Row[];
    commands?: Row[];
  } = {},
) {
  const workbuddyAccount = table(input.accounts ?? [accountRow]);
  const workbuddyCloudSchedule = table(input.schedules ?? []);
  const workbuddyCloudScheduleRun = table([]);
  const workbuddyCloudCommand = table(input.commands ?? []);
  const prisma = stub<PrismaService>({
    workbuddyAccount,
    workbuddyCloudSchedule,
    workbuddyCloudScheduleRun,
    workbuddyCloudCommand,
  });
  // 替身只实现被调用的分支：归属与启停校验按真实服务口径复刻。
  const loadOwned = (u: CurrentUser, id: number) => {
    const row = workbuddyAccount.rows.find((item) => item['id'] === id);
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '账号不存在');
    if (row['createdBy'] !== u.userId)
      throw new BusinessException(ErrorCode.ROLE_MISMATCH, '归他人所有');
    return Promise.resolve(row);
  };
  const credsOf = (u: CurrentUser, id: number) => {
    const row = workbuddyAccount.rows.find((item) => item['id'] === id);
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '账号不存在');
    if (row['createdBy'] !== u.userId)
      throw new BusinessException(ErrorCode.ROLE_MISMATCH, '归他人所有');
    if (row['status'] !== 'active')
      throw new BusinessException(ErrorCode.BAD_REQUEST, '凭据已停用');
    return Promise.resolve({
      row,
      creds: { secretId: 's', secretKey: 'k', region: 'ap-guangzhou' },
    });
  };
  const accounts = stub<WorkbuddyAccountService>({
    loadOwned,
    credsOf,
    creds: () => ({ secretId: 's', secretKey: 'k', region: 'ap-guangzhou' }),
  });
  const service = new WorkbuddyCloudService(prisma, accounts);
  type NoticePayload = Parameters<
    NonNullable<WorkbuddyCloudService['terminalNotice']>
  >[1];
  const notice = jest.fn<Promise<void>, [string, NoticePayload]>(() =>
    Promise.resolve(),
  );
  service.terminalNotice = notice;
  return {
    service,
    notice,
    workbuddyAccount,
    workbuddyCloudCommand,
    workbuddyCloudSchedule,
    workbuddyCloudScheduleRun,
  };
}

function commandRow(overrides: Row = {}): Row {
  return {
    id: 21,
    userId: 'u1',
    accountId: 7,
    agentId: 'agent-1',
    versionId: 'v1',
    conversationId: 1,
    sessionId: 'sess-1',
    endpoint: 'https://a2a.example/rpc',
    commandCode: 'cloud-cmd-1',
    kind: 'prompt',
    title: '整理今天的线索',
    payload: { instruction: '整理今天的线索' },
    status: 'DISPATCHED',
    progressText: '',
    result: { a2aTaskId: 'task-1', state: 'working' },
    error: '',
    cancelRequested: false,
    source: 'AGENT',
    agentConversationId: 42,
    scheduleId: 0,
    dispatchedAt: new Date(),
    finishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('WorkbuddyCloudService', () => {
  it('列出定时任务只返回当前账号的行', async () => {
    const { service } = setup({
      schedules: [
        scheduleRow({ id: 3, accountId: 7, userId: 'u1' }),
        scheduleRow({ id: 4, accountId: 9, userId: 'u2' }),
      ],
    });
    const rows = await service.list(user, 7);
    expect(rows).toHaveLength(1);
    expect(rows[0]['id']).toBe(3);
  });

  it('别人的定时任务读不到', async () => {
    const { service } = setup({
      schedules: [scheduleRow({ id: 5, accountId: 9, userId: 'u2' })],
    });
    await expect(service.get(user, 5)).rejects.toBeTruthy();
  });

  it('到点先推进排期再跑，失败只留痕不抛出', async () => {
    const { service, workbuddyCloudSchedule, workbuddyCloudScheduleRun } =
      setup({
        schedules: [scheduleRow()],
        accounts: [{ ...accountRow, status: 'disabled' }],
      });
    const count = await service.advanceDue();
    expect(count).toBe(1);
    // 排期已推到未来（错过不补跑）
    const next = workbuddyCloudSchedule.rows[0]['scheduledAt'] as Date;
    expect(next.getTime()).toBeGreaterThan(Date.now());
    // 停用账号：运行记录 failure + 定时行 lastStatus failed
    expect(workbuddyCloudScheduleRun.rows[0]['status']).toBe('failed');
    expect(workbuddyCloudSchedule.rows[0]['lastStatus']).toBe('failed');
    expect(String(workbuddyCloudSchedule.rows[0]['lastError'])).toContain(
      '停用',
    );
  });

  it('定时一次跑完不再有下一次', async () => {
    const { service, workbuddyCloudSchedule } = setup({
      schedules: [
        scheduleRow({ scheduleType: 'scheduled', scheduleConfig: {} }),
      ],
      accounts: [{ ...accountRow, status: 'disabled' }],
    });
    await service.advanceDue();
    expect(workbuddyCloudSchedule.rows[0]['scheduledAt']).toBeNull();
  });

  it('停用账号不允许下发指令', async () => {
    const { service } = setup({
      accounts: [{ ...accountRow, status: 'disabled' }],
    });
    await expect(
      service.sendCommand(user, 7, { agentId: 'a1', instruction: '做点事' }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.BAD_REQUEST });
  });
});

describe('WorkbuddyCloudService 群控派单（方案 §4.7）', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCloud();
  });

  it('Agent 派单标来源与会话，省略 Agent 时按清单第一个回落', async () => {
    const { service, workbuddyCloudCommand } = setup();
    const result = await service.dispatchAsAgent(user, {
      accountId: 7,
      instruction: '把今天的线索汇总成表',
      scope: ['WORKBUDDY'],
      agentConversationId: 42,
    });
    expect(result.agent.agentId).toBe('agent-1');
    expect(result.command).toMatchObject({
      agentId: 'agent-1',
      versionId: 'v1',
      status: 'DISPATCHED',
    });
    const row = workbuddyCloudCommand.rows[0];
    expect(row).toMatchObject({
      source: 'AGENT',
      agentConversationId: 42,
      userId: 'u1',
      accountId: 7,
    });
    expect(remote.push).toHaveBeenCalled();
  });

  it('本轮没勾企云就不下发，且提示去哪儿补勾', async () => {
    const { service, workbuddyCloudCommand } = setup();
    await expect(
      service.dispatchAsAgent(user, {
        accountId: 7,
        instruction: '做点事',
        scope: ['DESKTOP'],
        agentConversationId: 1,
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.BAD_REQUEST });
    expect(workbuddyCloudCommand.rows).toHaveLength(0);
    expect(remote.push).not.toHaveBeenCalled();
  });

  it('显式指定的 Agent 不在该账号清单里时拒绝，并把可用清单回给模型', async () => {
    const { service } = setup();
    await expect(
      service.dispatchAsAgent(user, {
        accountId: 7,
        instruction: '做点事',
        agentId: 'agent-9',
        scope: ['WORKBUDDY'],
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.BAD_REQUEST,
      message: expect.stringContaining('数字员工甲'),
    });
  });

  it('账号里一个 Agent 都没有时给出企云账号入口，不编一个 Agent 出来', async () => {
    remote.agentList.mockResolvedValue({ TotalCount: 0, AgentSet: [] });
    const { service } = setup();
    await expect(
      service.dispatchAsAgent(user, {
        accountId: 7,
        instruction: '做点事',
        scope: ['WORKBUDDY'],
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.BAD_REQUEST,
      message: expect.stringContaining('没有可见的 Agent'),
    });
  });

  it('Agent 清单按账号缓存 60 秒，台账反复刷新不重复敲腾讯云', async () => {
    const { service } = setup();
    await service.agentsFor(user, 7);
    await service.agentsFor(user, 7);
    expect(remote.agentList).toHaveBeenCalledTimes(1);
    await service.agentsFor(user, 7, true);
    expect(remote.agentList).toHaveBeenCalledTimes(2);
  });

  it('已推进会话的取消是「停止跟踪」，文案必须如实说明', async () => {
    const { service, workbuddyCloudCommand } = setup({
      commands: [commandRow({ status: 'DISPATCHED' })],
    });
    const result = await service.cancelAsAgent(user, 'cloud-cmd-1');
    expect(result.stopped).toBe(true);
    expect(workbuddyCloudCommand.rows[0]).toMatchObject({
      status: 'CANCELED',
      cancelRequested: true,
    });
    expect(String(workbuddyCloudCommand.rows[0]['error'])).toContain(
      '腾讯云侧会话不中止',
    );
  });

  it('调度器追平：腾讯云任务完成后落终态并发站内信，出口与设备同口径', async () => {
    const { service, notice, workbuddyCloudCommand } = setup({
      commands: [commandRow()],
    });
    remote.taskGet.mockResolvedValue({
      result: { status: { state: 'completed' } },
    });
    remote.events.mockResolvedValue({
      TotalCount: 1,
      MessageEventSet: [
        {
          EventType: 'assistant',
          Message: { Content: '线索已汇总，共 12 条。C:\\Users\\a\\out.xlsx' },
        },
      ],
    });
    expect(await service.sweepUnfinished()).toBe(1);
    expect(workbuddyCloudCommand.rows[0]).toMatchObject({ status: 'DONE' });
    expect(notice).toHaveBeenCalledTimes(1);
    const [userId, message] = notice.mock.calls[0];
    expect(userId).toBe('u1');
    expect(message).toMatchObject({
      title: '群控任务已完成：整理今天的线索',
      level: 'info',
      entityType: 'cloud_command',
      commandCode: 'cloud-cmd-1',
    });
    expect(message.body).toContain('主账号 · 普通任务');
    // 本地路径不能进站内信正文
    expect(message.body).toContain('（本地路径已隐藏）');
  });

  it('Agent 建的云端定时：跑出来的每一轮都继承群控来源，台账与站内信都认它', async () => {
    const { service, workbuddyCloudCommand } = setup({
      schedules: [scheduleRow({ source: 'AGENT', agentConversationId: 42 })],
    });
    expect(await service.advanceDue()).toBe(1);
    expect(workbuddyCloudCommand.rows[0]).toMatchObject({
      kind: 'schedule',
      source: 'AGENT',
      agentConversationId: 42,
      status: 'DISPATCHED',
      scheduleId: 3,
    });
  });

  it('手动下发的云端指令不发站内信（用户正盯着结果）', async () => {
    const { service, notice } = setup({
      commands: [commandRow({ source: 'UI', agentConversationId: 0 })],
    });
    remote.taskGet.mockResolvedValue({
      result: { status: { state: 'completed' } },
    });
    remote.events.mockResolvedValue({ TotalCount: 0, MessageEventSet: [] });
    await service.sweepUnfinished();
    expect(notice).not.toHaveBeenCalled();
  });

  it('凭据失效的云端行按失败收口并提醒，不会永远卡在非终态', async () => {
    const { service, notice, workbuddyCloudCommand } = setup({
      commands: [commandRow({ title: '跑个周报' })],
      accounts: [{ ...accountRow, status: 'disabled' }],
    });
    expect(await service.sweepUnfinished()).toBe(1);
    expect(workbuddyCloudCommand.rows[0]).toMatchObject({ status: 'FAILED' });
    expect(notice).toHaveBeenCalledTimes(1);
    expect(notice.mock.calls[0][1]).toMatchObject({
      level: 'error',
      title: '群控任务执行失败：跑个周报',
    });
    expect(notice.mock.calls[0][1].body).toContain('账号凭据');
  });
});
