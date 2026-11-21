import type { BotClientKind, BotHostView } from '@enterprise/contracts';
import { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { PrismaService } from '../prisma/prisma.service';
import {
  runAgentTool,
  type AgentActor,
  type AgentToolContext,
} from '../content/agent-tools';
import { runWithAgentScope } from '../content/agent-scope';
import { stub } from '../../test/doubles';
import { AgentDispatchService } from './agent-dispatch.service';
import { BotHostService } from './bot-host.service';
import type { WorkbuddyCloudService } from '../workbuddy/workbuddy-cloud.service';

/**
 * Agent 群控只读视图的四条口径（docs/Agent群控（替换插件页签）产品设计方案.md）：
 * 设备总览借 BotHostService（在线判定只有一个实现点）、台账默认只算 Agent 派单、
 * 两类行合并后按创建时间倒序分页、越权与非法状态一律挡掉。
 * 用内存替身钉住，免得真机联调才发现台账口径串了。
 */

type Row = Record<string, unknown>;

const user = new CurrentUser('u1', 'owner', 'user');
const other = new CurrentUser('u2', 'stealer', 'user');

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      const bag = cond as Row;
      if ('in' in bag) return (bag['in'] as unknown[]).includes(row[key]);
      return true;
    }
    return row[key] === cond;
  });
}

function table(seed: Row[] = []) {
  const sorted = (rows: Row[], opts: Row) => {
    const orderBy = (opts['orderBy'] || {}) as Row;
    const keys = Object.keys(orderBy);
    if (!keys.length) return rows;
    const key = keys[0];
    const dir = orderBy[key] === 'asc' ? 1 : -1;
    return [...rows].sort(
      (a, b) => dir * (Number(a[key]) - Number(b[key]) || 0),
    );
  };
  return {
    rows: seed,
    findMany: (opts: Row = {}) => {
      let rows = sorted(
        seed.filter((item) => matches(item, (opts['where'] || {}) as Row)),
        opts,
      );
      if (opts['take'] !== undefined) {
        rows = rows.slice(0, Number(opts['take']));
      }
      return Promise.resolve(rows.map((row) => ({ ...row })));
    },
    count: (opts: Row = {}) =>
      Promise.resolve(
        seed.filter((item) => matches(item, (opts['where'] || {}) as Row))
          .length,
      ),
    findFirst: (opts: Row = {}) => {
      const rows = sorted(
        seed.filter((item) => matches(item, (opts['where'] || {}) as Row)),
        opts,
      );
      return Promise.resolve(rows.length ? { ...rows[0] } : null);
    },
    update: ({ where, data }: { where: Row; data: Row }) => {
      const row = seed.find((item) => matches(item, where));
      if (!row) throw new Error('row not found');
      Object.assign(row, data);
      return Promise.resolve({ ...row });
    },
  };
}

const HOSTS = [
  {
    id: 7,
    userId: 'u1',
    name: '桌面主机',
    clientKind: 'DESKTOP',
    workingDir: 'C:/work',
  },
  { id: 8, userId: 'u1', name: '测试手机', clientKind: 'AWBOT' },
];

/** 企云账号：编号与设备表刻意重排（#7 既是主机也是凭据），台账与工具必须按 kind 路由。 */
const ACCOUNTS = [
  { id: 7, createdBy: 'u1', name: '主账号', status: 'active' },
  { id: 9, createdBy: 'u1', name: 'A 组加速', status: 'disabled' },
];

function commandRow(row: Row): Row {
  return {
    id: 0,
    userId: 'u1',
    commandCode: 'cmd',
    hostId: 7,
    title: '跑一下',
    payload: { instruction: '把这份周报发出去', cwd: 'C:/work' },
    result: { text: '已发送' },
    progressText: '',
    error: '',
    status: 'DONE',
    source: 'AGENT',
    agentConversationId: 42,
    createdAt: new Date('2026-11-17T02:00:00.000Z'),
    finishedAt: new Date('2026-11-17T02:01:00.000Z'),
    ...row,
  };
}

function scheduleRow(row: Row): Row {
  return {
    id: 1,
    userId: 'u1',
    hostId: 8,
    title: '每天早报',
    instruction: '汇总昨天的销量',
    payload: { cwd: '' },
    status: 'enabled',
    lastStatus: 'ok',
    lastError: '',
    source: 'AGENT',
    agentConversationId: 43,
    scheduledAt: new Date('2026-11-18T01:00:00.000Z'),
    runCount: 3,
    createdAt: new Date('2026-11-16T02:00:00.000Z'),
    ...row,
  };
}

function cloudCommandRow(row: Row = {}): Row {
  return {
    id: 0,
    userId: 'u1',
    accountId: 7,
    agentId: 'agent-1',
    versionId: 'v1',
    commandCode: 'cloud-cmd',
    kind: 'prompt',
    title: '云端跑一下',
    payload: { instruction: '把这份分析跑完' },
    status: 'DONE',
    error: '',
    progressText: 'Agent：分析完成，共 3 条线索',
    source: 'AGENT',
    agentConversationId: 42,
    scheduleId: 0,
    createdAt: new Date('2026-11-17T02:30:00.000Z'),
    finishedAt: new Date('2026-11-17T02:40:00.000Z'),
    ...row,
  };
}

function cloudScheduleRow(row: Row = {}): Row {
  return {
    id: 1,
    userId: 'u1',
    accountId: 7,
    title: '每天云端早报',
    instruction: '汇总昨天的线索',
    status: 'enabled',
    lastStatus: 'succeeded',
    lastError: '',
    source: 'AGENT',
    agentConversationId: 43,
    scheduledAt: new Date('2026-11-18T01:00:00.000Z'),
    runCount: 2,
    payload: { agentId: 'agent-1', versionId: 'v1' },
    createdAt: new Date('2026-11-16T02:00:00.000Z'),
    ...row,
  };
}

function cloudStub(
  input: { targets?: Row[]; syncResult?: Row; syncError?: Error } = {},
) {
  return stub<WorkbuddyCloudService>({
    dispatchTargets: () => Promise.resolve((input.targets ?? []) as never[]),
    syncCommand: (_user: CurrentUser, id: number) =>
      input.syncError
        ? Promise.reject(input.syncError)
        : Promise.resolve({
            ...(input.syncResult ?? {}),
            id,
            accountId: 7,
            commandCode: 'cloud-cmd-1',
            agentId: 'agent-1',
            versionId: 'v1',
            kind: 'prompt',
            title: '云端跑一下',
            payload: { instruction: '把这份分析跑完' },
            status: 'DONE',
            error: '',
            progressText: 'Agent：已完成',
            source: 'AGENT',
            agentConversationId: 42,
            createdAt: new Date('2026-11-17T02:30:00.000Z'),
            finishedAt: new Date('2026-11-17T02:40:00.000Z'),
          } as never),
    dispatchAsAgent: () => Promise.resolve({} as never),
    createScheduleAsAgent: () => Promise.resolve({} as never),
    cancelAsAgent: () => Promise.resolve({ row: {}, stopped: false } as never),
  });
}

function service(input: {
  commands?: Row[];
  schedules?: Row[];
  hosts?: Row[];
  lists?: Record<string, Row[]>;
  cloudCommands?: Row[];
  cloudSchedules?: Row[];
  accounts?: Row[];
  cloudTargets?: Row[];
}) {
  const prisma = stub<PrismaService>({
    workbuddyHost: table(input.hosts || HOSTS),
    workbuddyHostCommand: table(input.commands || []),
    workbuddyHostSchedule: table(input.schedules || []),
    workbuddyCloudCommand: table(input.cloudCommands || []),
    workbuddyCloudSchedule: table(input.cloudSchedules || []),
    workbuddyAccount: table(input.accounts || ACCOUNTS),
  });
  const hosts = stub<BotHostService>({
    list: (_user: CurrentUser, kind: string) =>
      Promise.resolve({ list: (input.lists?.[kind] ?? []) as never[] }),
  });
  return new AgentDispatchService(
    prisma,
    hosts,
    cloudStub({ targets: input.cloudTargets }),
  );
}

describe('AgentDispatchService.devices', () => {
  it('合并两类设备并按在线优先排序', async () => {
    const svc = service({
      lists: {
        DESKTOP: [
          { id: 7, clientKind: 'DESKTOP', online: false },
          { id: 9, clientKind: 'DESKTOP', online: true },
        ],
        AWBOT: [{ id: 8, clientKind: 'AWBOT', online: true }],
      },
    });
    const { list } = await svc.devices(user);
    expect(list.map((row) => row.id)).toEqual([8, 9, 7]);
  });

  it('企云账号作为第三种目标进清单：没有队列、带 Agent 摘要', async () => {
    const svc = service({
      lists: { DESKTOP: [{ id: 7, clientKind: 'DESKTOP', online: false }] },
      cloudTargets: [
        {
          id: 7,
          name: '主账号',
          status: 'active',
          online: true,
          lastVerifiedAt: new Date('2026-11-17T01:00:00.000Z'),
          agents: [{ agentId: 'agent-1', versionId: 'v1', name: '数字员工甲' }],
        },
        {
          id: 9,
          name: 'A 组加速',
          status: 'disabled',
          online: false,
          lastVerifiedAt: null,
          agents: [],
        },
      ],
    });
    const { list } = await svc.devices(user);
    expect(list.map((row) => `${row.clientKind}:${row.id}`)).toEqual([
      'WORKBUDDY:7',
      'DESKTOP:7',
      'WORKBUDDY:9',
    ]);
    expect(list[0]).toMatchObject({
      kindLabel: 'WorkBuddy 企业云',
      queueable: false,
      pendingCount: 0,
      workspacePath: '',
      modelLabel: expect.stringContaining('不计积分'),
    });
    expect(list[1]).toMatchObject({ queueable: true, agents: [] });
    expect(list[2]).toMatchObject({ statusLabel: '已停用' });
  });

  it('kind=WORKBUDDY 时不查设备表，只列企云账号', async () => {
    const asked: string[] = [];
    const svc = new AgentDispatchService(
      stub<PrismaService>({}),
      stub<BotHostService>({
        list: (_user: CurrentUser, kind: string) => {
          asked.push(kind);
          return Promise.resolve({ list: [] as never[] });
        },
      }),
      cloudStub({
        targets: [
          {
            id: 7,
            name: '主账号',
            status: 'active',
            online: true,
            lastVerifiedAt: null,
            agents: [],
          },
        ],
      }),
    );
    const { list } = await svc.devices(user, { kind: 'WORKBUDDY' });
    expect(asked).toEqual([]);
    expect(list.map((row) => row.clientKind)).toEqual(['WORKBUDDY']);
  });

  it('传 kind 时只问那一类设备', async () => {
    const asked: string[] = [];
    const prisma = stub<PrismaService>({ workbuddyHost: table(HOSTS) });
    const hosts = stub<BotHostService>({
      list: (_user: CurrentUser, kind: string) => {
        asked.push(kind);
        return Promise.resolve({ list: [] as never[] });
      },
    });
    const svc = new AgentDispatchService(prisma, hosts, cloudStub());
    await svc.devices(user, { kind: 'AWBOT' });
    expect(asked).toEqual(['AWBOT']);
  });
});

describe('AgentDispatchService.tasks', () => {
  it('默认只算 Agent 派单，ALL 才把手动下发一起列出来', async () => {
    const svc = service({
      commands: [
        commandRow({ id: 11, source: 'AGENT' }),
        commandRow({ id: 12, source: 'UI', agentConversationId: 0 }),
      ],
    });
    expect((await svc.tasks(user)).list.map((row) => row.id)).toEqual([11]);
    const all = await svc.tasks(user, { source: 'ALL' });
    expect(all.list.map((row) => row.id)).toEqual([12, 11]);
    expect(all.total).toBe(2);
  });

  it('指令与定时任务合并后按创建时间倒序，分页窗口不串位', async () => {
    const svc = service({
      commands: [
        commandRow({ id: 21, createdAt: new Date('2026-11-17T05:00:00.000Z') }),
        commandRow({ id: 22, createdAt: new Date('2026-11-17T01:00:00.000Z') }),
      ],
      schedules: [
        scheduleRow({
          id: 5,
          createdAt: new Date('2026-11-17T03:00:00.000Z'),
        }),
      ],
    });
    const first = await svc.tasks(user, { pageSize: 2 });
    expect(first.list.map((row) => `${row.type}:${row.id}`)).toEqual([
      'command:21',
      'schedule:5',
    ]);
    expect(first.total).toBe(3);
    const second = await svc.tasks(user, { page: 2, pageSize: 2 });
    expect(second.list.map((row) => `${row.type}:${row.id}`)).toEqual([
      'command:22',
    ]);
  });

  it('type 只留一类行，来源与设备名照样带上', async () => {
    const svc = service({
      commands: [commandRow({ id: 31 })],
      schedules: [scheduleRow({ id: 6, hostId: 8 })],
    });
    const onlySchedules = await svc.tasks(user, { type: 'schedule' });
    expect(onlySchedules.list).toHaveLength(1);
    expect(onlySchedules.list[0]).toMatchObject({
      type: 'schedule',
      hostName: '测试手机',
      clientKind: 'AWBOT',
      taskKey: 'sch_6',
      statusLabel: '启用中',
      source: 'AGENT',
      agentConversationId: 43,
    });
  });
});

describe('AgentDispatchService 台账四源合并（方案 §4.7 第 3 条）', () => {
  it('设备指令 / 设备定时 / 云端指令 / 云端定时一起按时间倒序，行不串表', async () => {
    const svc = service({
      commands: [
        commandRow({ id: 21, createdAt: new Date('2026-11-17T05:00:00.000Z') }),
      ],
      schedules: [
        scheduleRow({
          id: 5,
          createdAt: new Date('2026-11-17T03:00:00.000Z'),
        }),
      ],
      cloudCommands: [
        cloudCommandRow({
          id: 21,
          commandCode: 'cloud-21',
          createdAt: new Date('2026-11-17T04:00:00.000Z'),
        }),
      ],
      cloudSchedules: [
        cloudScheduleRow({
          id: 5,
          createdAt: new Date('2026-11-17T06:00:00.000Z'),
        }),
      ],
    });
    const page = await svc.tasks(user, { source: 'ALL' });
    // 编号在两张表里都会重复（这里刻意都取 21 / 5），只有 clientKind 能分开
    expect(
      page.list.map((row) => `${row.clientKind}:${row.type}:${row.id}`),
    ).toEqual([
      'WORKBUDDY:schedule:5',
      'DESKTOP:command:21',
      'WORKBUDDY:command:21',
      'AWBOT:schedule:5',
    ]);
    expect(page.total).toBe(4);
    expect(page.list[1]).toMatchObject({ hostName: '桌面主机' });
    expect(page.list[2]).toMatchObject({ hostName: '主账号' });
    expect(page.list[0].taskKey).toBe('csch_5');
    expect(page.list[3].taskKey).toBe('sch_5');
  });

  it('云端行的指令正文取 payload，摘要取轮询累积的对话', async () => {
    const svc = service({
      cloudCommands: [
        cloudCommandRow({
          progressText: 'Agent：线索已汇总\n我：继续',
          status: 'DONE',
        }),
      ],
    });
    const { list } = await svc.tasks(user);
    expect(list[0]).toMatchObject({
      clientKind: 'WORKBUDDY',
      instruction: '把这份分析跑完',
      statusLabel: '已完成',
      resultSummary: 'Agent：线索已汇总\n我：继续',
    });
  });
});

describe('AgentDispatchService.taskDetail', () => {
  it('定时任务详情取最近一轮指令的进度', async () => {
    const svc = service({
      schedules: [scheduleRow({ id: 9 })],
      commands: [
        commandRow({ id: 40, scheduleId: 8, progressText: '旧的一轮' }),
        commandRow({ id: 41, scheduleId: 9, progressText: '最新进度' }),
      ],
    });
    const detail = await svc.taskDetail(user, '9', { type: 'schedule' });
    expect(detail).toMatchObject({
      type: 'schedule',
      progressText: '最新进度',
      workspace: '',
    });
  });

  it('云端详情先向腾讯云追一次状态，设备表里的同号行不会被误读', async () => {
    const svc = service({
      commands: [commandRow({ id: 61, title: '同号的设备任务' })],
      cloudCommands: [cloudCommandRow({ id: 61, status: 'DISPATCHED' })],
    });
    const detail = await svc.taskDetail(user, '61', { kind: 'WORKBUDDY' });
    expect(detail).toMatchObject({
      clientKind: 'WORKBUDDY',
      hostName: '主账号',
      status: 'DONE',
      workspace: '',
    });
    // 不带 kind 仍按设备口径读，历史行为不变
    const device = await svc.taskDetail(user, '61');
    expect(device).toMatchObject({ clientKind: 'DESKTOP', id: 61 });
  });

  it('云端定时详情取最近一轮云端指令', async () => {
    const svc = service({
      cloudSchedules: [cloudScheduleRow({ id: 8 })],
      cloudCommands: [
        cloudCommandRow({ id: 30, scheduleId: 8, progressText: '最新一轮' }),
      ],
    });
    const detail = await svc.taskDetail(user, '8', {
      type: 'schedule',
      kind: 'WORKBUDDY',
    });
    expect(detail).toMatchObject({
      clientKind: 'WORKBUDDY',
      taskKey: 'csch_8',
      progressText: '最新一轮',
    });
  });

  it('别人的任务查不到，按不存在处理', async () => {
    const svc = service({ commands: [commandRow({ id: 51 })] });
    await expect(svc.taskDetail(other, '51')).rejects.toMatchObject({
      errorCode: ErrorCode.NOT_FOUND,
    });
  });
});

describe('AgentDispatchService.scheduleStatus', () => {
  it('只改状态，回到台账形状', async () => {
    const svc = service({ schedules: [scheduleRow({ id: 7, hostId: 7 })] });
    const row = await svc.scheduleStatus(user, '7', { status: 'paused' });
    expect(row).toMatchObject({ type: 'schedule', status: 'paused' });
  });

  it('kind=WORKBUDDY 改的是云端定时表，设备同号定时行不动', async () => {
    const cloudSchedules = [cloudScheduleRow({ id: 7 })];
    const svc = service({
      schedules: [scheduleRow({ id: 7, hostId: 7 })],
      cloudSchedules,
    });
    const row = await svc.scheduleStatus(user, '7', {
      status: 'paused',
      kind: 'WORKBUDDY',
    });
    expect(row).toMatchObject({
      clientKind: 'WORKBUDDY',
      status: 'paused',
      taskKey: 'csch_7',
    });
    expect(cloudSchedules[0]['status']).toBe('paused');
  });

  it('非法状态直接挡，越权按不存在处理', async () => {
    const svc = service({ schedules: [scheduleRow({ id: 8 })] });
    await expect(
      svc.scheduleStatus(user, '8', { status: 'stop' }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.BAD_REQUEST });
    await expect(
      svc.scheduleStatus(other, '8', { status: 'paused' }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.NOT_FOUND });
  });
});

/**
 * Agent 群控工具层（M3，方案 §4.2 / §8）：模型能看到的文案要同时说清「谁能派、
 * 离线怎么办、结果去哪查」，写侧一律收口到 BotHostService 的受控方法并在智能体记忆留痕；
 * 没勾选群控范围或未放开写动作的回合连发起都不允许。
 */

function deviceView(row: Row): BotHostView {
  return {
    id: 7,
    name: '办公机',
    platform: 'win',
    status: 'ONLINE',
    statusLabel: '在线',
    online: true,
    lastSeenAt: '2026-11-17T02:00:00.000Z',
    lastIp: '',
    clientVersion: '1.7.0',
    tokenPrefix: 'bot_abc',
    pendingCount: 0,
    channelCount: 0,
    clientKind: 'DESKTOP',
    awbot: null,
    workspace: { defaultPath: 'C:/work', count: 1 },
    fingerprint: { count: 0 },
    modelGrant: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...row,
  } as unknown as BotHostView;
}

function toolSetup(
  input: {
    lists?: Record<string, BotHostView[]>;
    commands?: Row[];
    schedules?: Row[];
    cloudCommands?: Row[];
    cloudSchedules?: Row[];
    accounts?: Row[];
    cloudTargets?: Row[];
    dispatchResult?: Row;
    dispatchError?: Error;
    scheduleResult?: Row;
    cloudDispatchResult?: Row;
    cloudDispatchError?: Error;
    cloudScheduleResult?: Row;
    cloudCancelResult?: Row;
    cloudSyncResult?: Row;
  } = {},
) {
  const prisma = stub<PrismaService>({
    workbuddyHost: table(HOSTS),
    workbuddyHostCommand: table(input.commands || []),
    workbuddyHostSchedule: table(input.schedules || []),
    workbuddyCloudCommand: table(input.cloudCommands || []),
    workbuddyCloudSchedule: table(input.cloudSchedules || []),
    workbuddyAccount: table(input.accounts ?? ACCOUNTS),
  });
  const calls = {
    dispatch: [] as Row[],
    schedule: [] as Row[],
    cancel: [] as string[],
    listed: [] as string[],
    cloudDispatch: [] as Row[],
    cloudSchedule: [] as Row[],
    cloudCancel: [] as string[],
    cloudSync: [] as number[],
  };
  const memory = { record: jest.fn(() => Promise.resolve()) };
  const hosts = stub<BotHostService>({
    list: (_user: CurrentUser, kind: string) => {
      calls.listed.push(kind);
      return Promise.resolve({ list: (input.lists?.[kind] ?? []) as never[] });
    },
    dispatchAsAgent: (_user: CurrentUser, body: Row) =>
      input.dispatchError
        ? Promise.reject(input.dispatchError)
        : Promise.resolve(
            (input.dispatchResult ?? {
              command: {
                commandCode: 'wb_20261117_1',
                status: 'PENDING',
                statusLabel: '待执行',
              },
              host: {
                id: 7,
                name: '办公机',
                clientKind: 'DESKTOP',
                status: 'ONLINE',
              },
            }) as never,
          ).then((result) => {
            calls.dispatch.push(body);
            return result;
          }),
    createScheduleAsAgent: (_user: CurrentUser, body: Row) => {
      calls.schedule.push(body);
      return Promise.resolve(
        (input.scheduleResult ?? {
          schedule: {
            id: 12,
            hostId: 7,
            title: '每天早报',
            scheduleType: 'recurring',
            scheduleTypeLabel: '周期重复',
            scheduledAt: '2026-11-18T01:00:00.000Z',
          },
        }) as never,
      );
    },
    cancel: (_user: CurrentUser, commandCode: string) => {
      calls.cancel.push(commandCode);
      return Promise.resolve({} as never);
    },
  });
  const cloud = stub<WorkbuddyCloudService>({
    dispatchTargets: () =>
      Promise.resolve(
        (input.cloudTargets ??
          ACCOUNTS.map((row) => ({
            id: Number(row.id),
            name: String(row.name),
            status: String(row.status),
            online: row.status === 'active',
            lastVerifiedAt: new Date('2026-11-17T01:00:00.000Z'),
            lastError: '',
            agents: [
              { agentId: 'agent-1', versionId: 'v1', name: '数字员工甲' },
            ],
          }))) as never[],
      ),
    dispatchAsAgent: (_user: CurrentUser, body: Row) => {
      calls.cloudDispatch.push(body);
      return input.cloudDispatchError
        ? Promise.reject(input.cloudDispatchError)
        : Promise.resolve(
            (input.cloudDispatchResult ?? {
              command: { commandCode: 'cloud-uuid', status: 'DISPATCHED' },
              account: { id: 7, name: '主账号' },
              agent: {
                agentId: 'agent-1',
                versionId: 'v1',
                name: '数字员工甲',
              },
            }) as never,
          );
    },
    createScheduleAsAgent: (_user: CurrentUser, body: Row) => {
      calls.cloudSchedule.push(body);
      return Promise.resolve(
        (input.cloudScheduleResult ?? {
          schedule: {
            id: 3,
            accountId: 7,
            title: '每天云端早报',
            scheduledAt: null,
          },
          account: { id: 7, name: '主账号' },
          agent: {
            agentId: 'agent-1',
            versionId: 'v1',
            name: '数字员工甲',
          },
        }) as never,
      );
    },
    cancelAsAgent: (_user: CurrentUser, commandCode: string) => {
      calls.cloudCancel.push(commandCode);
      return Promise.resolve(
        (input.cloudCancelResult ?? { row: {}, stopped: true }) as never,
      );
    },
    syncCommand: (_user: CurrentUser, id: number) => {
      calls.cloudSync.push(id);
      // 真实实现是「按 id 追平后回原行」，替身也按这条口径：找得到就用种子行。
      const seed = (input.cloudCommands || []).find(
        (item) => item['id'] === id,
      );
      return Promise.resolve({
        ...(seed ?? cloudCommandRow()),
        ...(input.cloudSyncResult ?? {}),
      } as never);
    },
  });
  return {
    svc: new AgentDispatchService(prisma, hosts, cloud, memory),
    calls,
    memory,
  };
}

describe('AgentDispatchService.toolDevices', () => {
  it('类型不在本轮勾选范围内时不查设备，直接告诉模型去哪儿补勾', async () => {
    const { svc, calls } = toolSetup();
    const text = await svc.toolDevices(user, ['DESKTOP'], { kind: 'AWBOT' });
    expect(text).toContain('本轮群控只勾选了 Bot 主机');
    expect(calls.listed).toEqual([]);
  });

  it('没有设备时给出配对入口，而不是回一句空清单', async () => {
    const { svc } = toolSetup({ lists: { DESKTOP: [] } });
    const text = await svc.toolDevices(user, ['DESKTOP'], {});
    expect(text).toContain('还没有');
    expect(text).toContain('Agent-Bot');
  });

  it('设备行按在线优先、负载低排前，并把工作区/电量/停用说清', async () => {
    const { svc, calls } = toolSetup({
      lists: {
        DESKTOP: [
          deviceView({
            id: 9,
            name: '离线机',
            status: 'OFFLINE',
            statusLabel: '离线',
            online: false,
            pendingCount: 4,
          }),
          deviceView({ id: 7, name: '办公机', online: true, pendingCount: 1 }),
          deviceView({
            id: 10,
            name: '停用机',
            status: 'DISABLED',
            statusLabel: '已停用',
            online: false,
            enabled: false,
          }),
        ],
        AWBOT: [
          deviceView({
            id: 8,
            name: '测试手机',
            clientKind: 'AWBOT',
            platform: 'android',
            awbot: { battery: 82, charging: true, network: 'wifi' },
          }),
        ],
      },
    });
    const text = await svc.toolDevices(user, ['DESKTOP', 'AWBOT'], {});
    const ids = [...text.matchAll(/设备 #(\d+)/g)].map((m) => Number(m[1]));
    expect(ids).toEqual([8, 7, 10, 9]);
    expect(text).toContain('默认工作区 C:/work');
    expect(text).toContain('电量 82%（充电中）');
    expect(text).toContain('已停用');
    expect(text).toContain('派单前请先给出分配方案');
    expect(calls.listed).toEqual(['DESKTOP', 'AWBOT']);
  });
});

describe('AgentDispatchService.toolDispatchTask', () => {
  it('把范围与对话编号透传给受控派单，并按在线/离线给不同口径', async () => {
    const { svc, calls, memory } = toolSetup();
    const text = await svc.toolDispatchTask(
      user,
      ['DESKTOP'],
      { host_id: 7, instruction: '整理周报', cwd: 'C:/work', title: '周报' },
      42,
    );
    expect(calls.dispatch[0]).toMatchObject({
      hostId: 7,
      instruction: '整理周报',
      workspace: 'C:/work',
      title: '周报',
      scope: ['DESKTOP'],
      agentConversationId: 42,
    });
    expect(text).toContain('指令码 wb_20261117_1');
    expect(text).toContain('设备在线');
    expect(memory.record).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'agent_dispatch',
        action: 'Agent_dispatchTask',
        targetId: 'wb_20261117_1',
        outcome: 'ok',
      }),
    );
  });

  it('离线设备要提醒模型告知用户排队', async () => {
    const { svc } = toolSetup({
      dispatchResult: {
        command: { commandCode: 'wb_2', status: 'PENDING' },
        host: {
          id: 7,
          name: '办公机',
          clientKind: 'DESKTOP',
          status: 'OFFLINE',
        },
      },
    });
    const text = await svc.toolDispatchTask(
      user,
      ['DESKTOP'],
      { host_id: 7, instruction: '整理周报' },
      0,
    );
    expect(text).toContain('离线');
    expect(text).toContain('上线自动执行');
  });

  it('派单被闸门挡下时留痕 failed 并把原始错误交回模型', async () => {
    const { svc, memory } = toolSetup({
      dispatchError: new BusinessException(
        ErrorCode.BAD_REQUEST,
        '「办公机」已停用，请先在 Agent-Bot 设备页启用后再派发',
      ),
    });
    await expect(
      svc.toolDispatchTask(
        user,
        ['DESKTOP'],
        { host_id: 7, instruction: '整理周报' },
        42,
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCode.BAD_REQUEST });
    expect(memory.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'Agent_dispatchTask',
        outcome: 'failed',
        errorMessage: expect.stringContaining('已停用'),
      }),
    );
  });

  it('编号同时是设备和企云账号时不猜，要求模型补 kind', async () => {
    const { svc, calls } = toolSetup();
    const text = await svc.toolDispatchTask(
      user,
      ['DESKTOP', 'WORKBUDDY'],
      { host_id: 7, instruction: '整理周报' },
      42,
    );
    expect(text).toContain('请同时给 kind');
    expect(calls.dispatch).toEqual([]);
    expect(calls.cloudDispatch).toEqual([]);
  });

  it('派给企云时说清「同步推给腾讯云、没有队列、不计积分」', async () => {
    const { svc, calls, memory } = toolSetup();
    const text = await svc.toolDispatchTask(
      user,
      ['WORKBUDDY'],
      {
        host_id: 9,
        kind: 'WORKBUDDY',
        instruction: '跑一遍竞品分析',
        agent_id: 'agent-1',
      },
      44,
    );
    expect(calls.cloudDispatch[0]).toMatchObject({
      accountId: 9,
      agentId: 'agent-1',
      scope: ['WORKBUDDY'],
      agentConversationId: 44,
    });
    expect(calls.dispatch).toEqual([]);
    expect(text).toContain('指令码 cloud-uuid');
    expect(text).toContain('没有队列');
    expect(text).toContain('不计积分');
    expect(memory.record).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: 'cloud_command',
        targetId: 'cloud-uuid',
      }),
    );
  });

  it('本轮只勾了主机就不能派企云账号', async () => {
    const { svc, calls } = toolSetup();
    const text = await svc.toolDispatchTask(
      user,
      ['DESKTOP'],
      { host_id: 9, kind: 'WORKBUDDY', instruction: '跑一遍竞品分析' },
      44,
    );
    expect(text).toContain('没有勾选「WorkBuddy 企业云」');
    expect(calls.cloudDispatch).toEqual([]);
  });

  it('缺 host_id / instruction 时不发请求', async () => {
    const { svc, calls } = toolSetup();
    expect(await svc.toolDispatchTask(user, ['DESKTOP'], {}, 1)).toContain(
      '缺少 host_id',
    );
    expect(
      await svc.toolDispatchTask(
        user,
        ['DESKTOP'],
        { host_id: 7, instruction: '  ' },
        1,
      ),
    ).toContain('缺少 instruction');
    expect(calls.dispatch).toEqual([]);
  });
});

describe('AgentDispatchService.toolCreateSchedule', () => {
  it('建设备定时任务回任务号并提醒执行时刻需在线', async () => {
    const { svc, calls, memory } = toolSetup();
    const text = await svc.toolCreateSchedule(
      user,
      ['DESKTOP'],
      { host_id: 7, title: '每天早报', instruction: '汇总昨天的销量' },
      43,
    );
    expect(calls.schedule[0]).toMatchObject({
      hostId: 7,
      scheduleType: 'recurring',
      scope: ['DESKTOP'],
      agentConversationId: 43,
    });
    expect(text).toContain('任务号 sch_12');
    expect(text).toContain('需在线');
    expect(memory.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'Agent_createSchedule' }),
    );
  });
  it('建企云定时任务回 csch 任务号，并说明到点由平台下发', async () => {
    const { svc, calls, memory } = toolSetup();
    const text = await svc.toolCreateSchedule(
      user,
      ['WORKBUDDY'],
      {
        host_id: 9,
        kind: 'WORKBUDDY',
        title: '每天云端早报',
        instruction: '汇总昨天的线索',
        schedule_type: 'recurring',
      },
      45,
    );
    expect(calls.cloudSchedule[0]).toMatchObject({
      accountId: 9,
      scope: ['WORKBUDDY'],
      agentConversationId: 45,
    });
    expect(text).toContain('任务号 csch_3');
    expect(text).toContain('腾讯云');
    expect(memory.record).toHaveBeenCalledWith(
      expect.objectContaining({ targetType: 'cloud_schedule' }),
    );
  });
});

describe('AgentDispatchService.toolTasks', () => {
  it('按指令码查单条：状态、过程与结果摘要一次说清', async () => {
    const { svc } = toolSetup({
      commands: [
        commandRow({
          commandCode: 'wb_done',
          progressText: '第 1 步\n第 2 步\n第 3 步\n第 4 步',
        }),
      ],
    });
    const text = await svc.toolTasks(user, { command_code: 'wb_done' });
    expect(text).toContain('指令 wb_done');
    expect(text).toContain('已完成');
    expect(text).toContain('第 2 步 / 第 3 步 / 第 4 步');
    expect(text).toContain('结果摘要：已发送');
  });

  it('指令码不是这个账号的就回找不到，不泄露别人的任务', async () => {
    const { svc } = toolSetup({ commands: [commandRow({})] });
    expect(await svc.toolTasks(other, { command_code: 'cmd' })).toContain(
      '没有找到指令码',
    );
  });

  it('云端指令码查单条：先向腾讯云追状态，再回往来摘要', async () => {
    const { svc, calls } = toolSetup({
      cloudCommands: [
        cloudCommandRow({
          id: 33,
          commandCode: 'cloud_p',
          status: 'DISPATCHED',
        }),
      ],
    });
    const text = await svc.toolTasks(user, { command_code: 'cloud_p' });
    // 云端状态只有被问才会变：查一条必须现问一次腾讯云
    expect(calls.cloudSync).toEqual([33]);
    expect(text).toContain('云端指令 cloud_p');
    expect(text).toContain('主账号');
    expect(text).toContain('未跑完时可稍后再查这条指令码');
  });

  it('不带指令码时先追平未终态的云端行再回台账', async () => {
    const { svc, calls } = toolSetup({
      commands: [commandRow({ id: 21, commandCode: 'wb_a' })],
      cloudCommands: [
        cloudCommandRow({
          id: 31,
          commandCode: 'cloud_a',
          createdAt: new Date('2026-11-17T06:00:00.000Z'),
          status: 'DISPATCHED',
        }),
      ],
    });
    const text = await svc.toolTasks(user, {});
    expect(calls.cloudSync).toEqual([31]);
    expect(text).toContain('cloud_a');
    expect(text).toContain('WorkBuddy 企业云');
  });

  it('不带指令码时只看 Agent 派单台账', async () => {
    const { svc } = toolSetup({
      commands: [
        commandRow({ id: 21, commandCode: 'wb_a' }),
        commandRow({ id: 22, commandCode: 'wb_b', source: 'UI' }),
      ],
    });
    const text = await svc.toolTasks(user, {});
    expect(text).toContain('wb_a');
    expect(text).not.toContain('wb_b');
  });
});

describe('AgentDispatchService.toolCancel', () => {
  it('排队中的指令直接取消并留痕', async () => {
    const { svc, calls, memory } = toolSetup({
      commands: [commandRow({ commandCode: 'wb_p', status: 'PENDING' })],
    });
    const text = await svc.toolCancel(user, { command_code: 'wb_p' });
    expect(calls.cancel).toEqual(['wb_p']);
    expect(text).toContain('已取消排队中');
    expect(memory.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'Agent_cancelDispatchTask' }),
    );
  });

  it('云端已下发的指令只能说「停止跟踪」，不能承诺中止腾讯云会话', async () => {
    const { svc, calls, memory } = toolSetup({
      cloudCommands: [
        cloudCommandRow({ commandCode: 'cloud_r', status: 'DISPATCHED' }),
      ],
    });
    const text = await svc.toolCancel(user, { command_code: 'cloud_r' });
    expect(calls.cloudCancel).toEqual(['cloud_r']);
    expect(calls.cancel).toEqual([]);
    expect(text).toContain('停止跟踪');
    expect(text).toContain('中止不了');
    expect(memory.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'Agent_cancelDispatchTask',
        targetType: 'cloud_command',
      }),
    );
  });

  it('执行中只下发取消请求，终态与别人的指令不动手', async () => {
    const running = toolSetup({
      commands: [commandRow({ commandCode: 'wb_r', status: 'DISPATCHED' })],
    });
    expect(
      await running.svc.toolCancel(user, { command_code: 'wb_r' }),
    ).toContain('取消请求已下发');

    const done = toolSetup({ commands: [commandRow({ commandCode: 'wb_d' })] });
    expect(await done.svc.toolCancel(user, { command_code: 'wb_d' })).toContain(
      '已经是终态',
    );
    expect(done.calls.cancel).toEqual([]);

    const foreign = toolSetup({
      commands: [commandRow({ commandCode: 'wb_f' })],
    });
    expect(
      await foreign.svc.toolCancel(other, { command_code: 'wb_f' }),
    ).toContain('没有找到指令码');
    expect(foreign.calls.cancel).toEqual([]);

    expect(await done.svc.toolCancel(user, {})).toContain('缺少 command_code');
  });
});

describe('runAgentTool 的群控闸口', () => {
  function context(dispatch: unknown) {
    return stub<AgentToolContext>({ dispatch });
  }
  const runner = {
    toolDevices: () => Promise.resolve('设备清单'),
    toolDispatchTask: () => Promise.resolve('已派发'),
    toolCreateSchedule: () => Promise.resolve('已建定时'),
    toolTasks: () => Promise.resolve('台账'),
    toolCancel: () => Promise.resolve('已取消'),
  };
  const scope = {
    connectorIds: [],
    mailboxIds: [],
    trigger: 'chat' as const,
    allowWrite: true,
  };

  it('本轮没勾选群控范围时拒绝指挥设备', async () => {
    const result = await runWithAgentScope(scope, () =>
      runAgentTool(
        'list_dispatch_devices',
        {},
        context(runner),
        stub<AgentActor>({ user, token: undefined }),
      ),
    );
    expect(result.text).toContain('没有勾选');
  });

  it('只读/无人值守回合不执行派单，只出方案', async () => {
    const result = await runWithAgentScope(
      { ...scope, allowWrite: false },
      () =>
        runAgentTool(
          'dispatch_device_task',
          { host_id: 7, instruction: '整理周报' },
          context(runner),
          stub<AgentActor>({
            user,
            token: undefined,
            dispatchScope: ['DESKTOP'],
            conversationId: 42,
          }),
        ),
    );
    expect(result.text).toContain('只读/无人值守');
  });

  it('放开写动作后按对话编号落到工具层', async () => {
    let seen: { conversationId: number } | null = null;
    const result = await runWithAgentScope(scope, () =>
      runAgentTool(
        'dispatch_device_task',
        { host_id: 7, instruction: '整理周报' },
        context({
          ...runner,
          toolDispatchTask: (
            _u: CurrentUser,
            _scope: BotClientKind[],
            _args: Row,
            conversationId: number,
          ) => {
            seen = { conversationId };
            return Promise.resolve('已派发');
          },
        }),
        stub<AgentActor>({
          user,
          token: undefined,
          dispatchScope: ['DESKTOP'],
          conversationId: 42,
        }),
      ),
    );
    expect(result.text).toBe('已派发');
    expect(seen).toEqual({ conversationId: 42 });
  });
});
