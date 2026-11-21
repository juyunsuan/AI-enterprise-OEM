import {
  BOT_COMMAND_DEFAULT_TIMEOUT_SEC,
  BOT_HEARTBEAT_BATCH,
  BOT_PENDING_QUEUE_LIMIT,
} from '@enterprise/contracts';
import { CurrentUser } from '../auth/current-user';
import { ErrorCode } from '../common/error-code';
import type { HrmScopeService } from '../hrm/hrm.scope';
import { PrismaService } from '../prisma/prisma.service';
import { stub } from '../../test/doubles';
import { BotHostService } from './bot-host.service';

/**
 * Bot 主机调度侧五条硬约束（docs/Agent-Bot方案.md）：
 * 队列满不再收、终态回执幂等、领走不回话要判超时、定时只推进下一轮、心跳漏带自报字段不清空登记值。
 * 用内存替身把这五条钉住，避免真机联调时才发现收不了尾。
 */

type Row = Record<string, unknown>;

const user = new CurrentUser('u1', 'owner', 'user');
const hostPrincipal = {
  id: 1,
  userId: 'u1',
  name: 'PC',
  clientKind: 'DESKTOP' as const,
};

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      const bag = cond as Row;
      if ('in' in bag) return (bag['in'] as unknown[]).includes(row[key]);
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
      return true;
    }
    return row[key] === cond;
  });
}

function whereOf(opts: Row): Row {
  const where = opts['where'];
  return where && typeof where === 'object' ? (where as Row) : {};
}

function applyData(row: Row, data: Row) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && 'increment' in value) {
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
      if (opts['take'] !== undefined) {
        rows = rows.slice(0, Number(opts['take']));
      }
      return Promise.resolve(rows.map((row) => ({ ...row })));
    },
    count: (opts: Row = {}) =>
      Promise.resolve(
        seed.filter((item) => matches(item, whereOf(opts))).length,
      ),
    groupBy: (opts: Row = {}) => {
      const by = Array.isArray(opts['by']) ? (opts['by'] as string[]) : [];
      const groups = new Map<string, { row: Row; count: number }>();
      for (const item of seed.filter((row) => matches(row, whereOf(opts)))) {
        const key = by.map((field) => String(item[field])).join('|');
        const current = groups.get(key);
        if (current) current.count += 1;
        else groups.set(key, { row: item, count: 1 });
      }
      return Promise.resolve(
        [...groups.values()].map(({ row, count }) => ({
          ...by.reduce<Row>((acc, field) => {
            acc[field] = row[field];
            return acc;
          }, {}),
          _count: { _all: count },
        })),
      );
    },
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
    updateMany: ({ where, data }: { where: Row; data: Row }) => {
      const rows = seed.filter((item) => matches(item, where));
      rows.forEach((row) => applyData(row, data));
      return Promise.resolve({ count: rows.length });
    },
    deleteMany: ({ where }: { where: Row }) => {
      const kept = seed.filter((row) => !matches(row, where));
      const count = seed.length - kept.length;
      seed.length = 0;
      seed.push(...kept);
      return Promise.resolve({ count });
    },
    upsert: ({
      where,
      create,
      update,
    }: {
      where: Row;
      create: Row;
      update: Row;
    }) => {
      const row = seed.find((item) => matches(item, where));
      if (row) {
        applyData(row, update);
        return Promise.resolve({ ...row });
      }
      const created: Row = {
        id: (seq += 1),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...defaults,
        ...where,
        ...create,
      };
      seed.push(created);
      return Promise.resolve({ ...created });
    },
  };
}

function setup(input: {
  hosts?: Row[];
  commands?: Row[];
  schedules?: Row[];
  runs?: Row[];
  standing?: boolean;
}) {
  const workbuddyHost = table(input.hosts ?? []);
  const workbuddyHostCommand = table(input.commands ?? [], {
    result: {},
    error: '',
    cancelRequested: false,
    progressText: '',
    acpSessionId: '',
    scheduleId: 0,
    source: 'UI',
    agentConversationId: 0,
    dispatchedAt: null,
    finishedAt: null,
  });
  const workbuddyHostSchedule = table(input.schedules ?? [], {
    lastRunAt: null,
    lastStatus: '',
    lastError: '',
    runCount: 0,
  });
  const workbuddyHostScheduleRun = table(input.runs ?? []);
  const workbuddyHostConversation = table([]);
  const workbuddyHostChannel = table([]);
  const workbuddyHostPairCode = table([], {
    usedAt: null,
    hostId: 0,
    issuedToken: '',
    deviceInfo: {},
  });
  // 心跳会查平台模型授权；默认没有授权（各用例不关心时就是「没下发」）。
  const workbuddyHostModelGrant = table([]);
  // 没有独立授权时主机跟随平台「模型设置 → 文本」默认槽位；缺省就是「平台没配默认模型」。
  const contentModelSlot = table([]);
  const contentModelChannel = table([]);
  // 渠道算力开关与平台 AIPDD Key 都挂在 system_settings 上；缺省行＝全部支持、平台没配 Key。
  const systemSetting = table([]);
  const contentAgentConversation = table([]);
  const contentAgentMessage = table([]);
  const prisma = stub<PrismaService>({
    workbuddyHost,
    workbuddyHostCommand,
    workbuddyHostSchedule,
    workbuddyHostScheduleRun,
    workbuddyHostConversation,
    workbuddyHostChannel,
    workbuddyHostPairCode,
    workbuddyHostModelGrant,
    contentModelSlot,
    contentModelChannel,
    systemSetting,
    contentAgentConversation,
    contentAgentMessage,
  });
  // 配对幂等用事务包住「占码 + 建主机」；单测里直接复用同一份内存替身。
  (
    prisma as unknown as {
      $transaction: <T>(run: (tx: PrismaService) => Promise<T>) => Promise<T>;
    }
  ).$transaction = (run) => run(prisma);
  const scope = stub<HrmScopeService>({
    isStanding: () => Promise.resolve(input.standing !== false),
  });
  const service = new BotHostService(prisma, scope);
  return {
    service,
    workbuddyHost,
    workbuddyHostCommand,
    workbuddyHostSchedule,
    workbuddyHostPairCode,
    workbuddyHostModelGrant,
    contentModelSlot,
    contentAgentMessage,
  };
}

const hostRow = {
  id: 1,
  userId: 'u1',
  name: 'PC',
  platform: 'win',
  clientKind: 'DESKTOP',
  tokenHash: '',
  tokenPrefix: 'bot_abc',
  status: 'ONLINE',
  lastSeenAt: new Date(),
  lastIp: '',
  clientVersion: '',
  caps: {
    agent: {
      state: 'READY',
      version: '1.0.0',
      channel: '内网网关',
      model: 'deepseek-chat',
      skillCount: 3,
      personaCount: 2,
      workspace: '/workspace',
      workspaces: [{ path: '/workspace', label: 'workspace' }],
    },
  },
  workingDir: '/workspace',
  heartbeatIntervalSec: 5,
  enabled: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

/** 只改 caps 里的 Agent 快照，其余保持在线主机的口径。 */
function hostWith(agent: Row, overrides: Row = {}): Row {
  return { ...hostRow, caps: { agent }, ...overrides };
}

function commandRow(overrides: Row = {}): Row {
  return {
    id: 11,
    userId: 'u1',
    hostId: 1,
    conversationId: 0,
    commandCode: 'wbcmd1',
    kind: 'prompt',
    title: '整理周报',
    payload: { instruction: '整理周报', cwd: '/workspace', timeoutSec: 300 },
    status: 'PENDING',
    result: {},
    error: '',
    cancelRequested: false,
    progressText: '',
    acpSessionId: '',
    scheduleId: 0,
    source: 'UI',
    agentConversationId: 0,
    dispatchedAt: null,
    finishedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('BotHostService', () => {
  it('待执行队列达到上限时拒绝新指令，且不入库', async () => {
    const commands = Array.from({ length: BOT_PENDING_QUEUE_LIMIT }, (_, i) =>
      commandRow({ id: i + 1, commandCode: `c${i}` }),
    );
    const { service, workbuddyHostCommand } = setup({
      hosts: [hostRow],
      commands,
    });

    await expect(
      service.send(user, '1', { text: '再跑一个' }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });
    expect(workbuddyHostCommand.rows).toHaveLength(BOT_PENDING_QUEUE_LIMIT);
  });

  it('下发时 cwd 缺省回落主机登记的工作区，并落一条用户气泡', async () => {
    const { service, workbuddyHostCommand, contentAgentMessage } = setup({
      hosts: [hostRow],
    });

    const { command } = await service.send(user, '1', { text: '整理周报' });

    expect(command.status).toBe('PENDING');
    expect(command.instruction).toBe('整理周报');
    expect(workbuddyHostCommand.rows[0]['payload']).toMatchObject({
      cwd: '/workspace',
      timeoutSec: BOT_COMMAND_DEFAULT_TIMEOUT_SEC,
    });
    expect(contentAgentMessage.rows[0]).toMatchObject({
      role: 'user',
      content: '整理周报',
    });
  });

  it('终态回执幂等：重复回执不重复写库', async () => {
    const { service, contentAgentMessage } = setup({
      hosts: [hostRow],
      commands: [commandRow({ status: 'DONE' })],
    });

    const reply = await service.result(hostPrincipal, {
      commandCode: 'wbcmd1',
      ok: true,
      text: '完成',
    });

    expect(reply).toEqual({ received: true, duplicate: true });
    expect(contentAgentMessage.rows).toHaveLength(0);
  });

  it('取消标记优先于 ok：回执一律折成 CANCELED，定时运行记 skipped', async () => {
    const run = {
      id: 21,
      scheduleId: 5,
      commandCode: 'wbcmd1',
      status: 'queued',
    };
    const schedule = {
      id: 5,
      userId: 'u1',
      status: 'enabled',
      scheduledAt: null,
    };
    const { service, workbuddyHostCommand, workbuddyHostSchedule } = setup({
      hosts: [hostRow],
      commands: [
        commandRow({
          status: 'DISPATCHED',
          cancelRequested: true,
          scheduleId: 5,
        }),
      ],
      schedules: [schedule],
      runs: [run],
    });

    const reply = await service.result(hostPrincipal, {
      commandCode: 'wbcmd1',
      ok: true,
      text: '跑到一半被叫停',
    });

    expect(reply.duplicate).toBe(false);
    expect(workbuddyHostCommand.rows[0]['status']).toBe('CANCELED');
    expect(workbuddyHostSchedule.rows[0]['lastStatus']).toBe('failed');
  });

  it('领走不回话：超时宽限内不动，越过 timeoutSec + 3 分钟才判 TIMEOUT', async () => {
    const now = Date.now();
    const { service, workbuddyHostCommand, contentAgentMessage } = setup({
      hosts: [hostRow],
      commands: [
        commandRow({
          id: 11,
          commandCode: 'fresh',
          status: 'DISPATCHED',
          dispatchedAt: new Date(now - 120_000),
        }),
        commandRow({
          id: 12,
          commandCode: 'stale',
          status: 'DISPATCHED',
          dispatchedAt: new Date(now - 600_000),
        }),
      ],
    });

    const swept = await service.sweepTimeouts();

    expect(swept).toBe(1);
    expect(workbuddyHostCommand.rows[0]['status']).toBe('DISPATCHED');
    expect(workbuddyHostCommand.rows[1]['status']).toBe('TIMEOUT');
    expect(contentAgentMessage.rows).toHaveLength(0);
  });

  it('定时推进：recurring 算出下一次，once 跑完置空', async () => {
    const past = new Date(Date.now() - 60_000);
    const { service, workbuddyHostSchedule } = setup({
      hosts: [hostRow],
      schedules: [
        {
          id: 5,
          userId: 'u1',
          hostId: 1,
          title: '周报',
          instruction: '生成上周销售周报',
          payload: { cwd: '', timeoutSec: 300 },
          scheduleType: 'recurring',
          scheduleConfig: { freq: 'daily', time: '09:00' },
          scheduledAt: past,
          status: 'enabled',
          runCount: 0,
        },
        {
          id: 6,
          userId: 'u1',
          hostId: 1,
          title: '一次性',
          instruction: '跑一次',
          payload: { cwd: '', timeoutSec: 300 },
          scheduleType: 'scheduled',
          scheduleConfig: {},
          scheduledAt: past,
          status: 'enabled',
          runCount: 0,
        },
      ],
    });

    const advanced = await service.advanceDue();

    expect(advanced).toBe(2);
    const recurring = workbuddyHostSchedule.rows.find((row) => row['id'] === 5);
    const once = workbuddyHostSchedule.rows.find((row) => row['id'] === 6);
    expect(recurring?.['scheduledAt']).toBeInstanceOf(Date);
    expect(once?.['scheduledAt']).toBeNull();
  });

  it('心跳漏带自报字段不清空登记的工作区，并顺带领取 PENDING 指令', async () => {
    const { service, workbuddyHostCommand } = setup({
      hosts: [hostRow],
      commands: [
        commandRow({ id: 11, commandCode: 'a' }),
        commandRow({ id: 12, commandCode: 'b' }),
        commandRow({ id: 13, commandCode: 'c' }),
      ],
    });

    const reply = await service.heartbeat(hostPrincipal, {}, '10.0.0.8');

    expect(reply.commands.map((item) => item.commandCode)).toEqual(
      ['a', 'b', 'c'].slice(0, BOT_HEARTBEAT_BATCH),
    );
    expect(reply.commands[0]).toMatchObject({
      instruction: '整理周报',
      cwd: '/workspace',
      timeoutSec: 300,
    });
    expect(
      workbuddyHostCommand.rows.every((row) => row['status'] === 'DISPATCHED'),
    ).toBe(true);
  });

  it('本机模型状态不设闸：客户端没上报、没配模型都照常入队', async () => {
    // 模型、技能、数字分身都归客户端本地，平台不看不拦；跑不起来由客户端回执失败。
    const absent = setup({
      hosts: [{ ...hostRow, caps: {} }],
    });
    const absentResult = await absent.service.send(user, '1', {
      text: '跑一下',
    });
    expect(absentResult.command.status).toBe('PENDING');
    expect(absentResult.command.workspace).toBe('/workspace');

    const unconfigured = setup({
      hosts: [hostWith({ state: 'UNCONFIGURED', failReason: 'NO_MODEL' })],
    });
    const unconfiguredResult = await unconfigured.service.send(user, '1', {
      text: '跑一下',
    });
    expect(unconfiguredResult.command.status).toBe('PENDING');
  });

  it('工作区白名单：命中才下发，未命中直接拒，空则回落客户端默认工作区', async () => {
    const hosts = [
      hostWith({
        state: 'READY',
        workspace: '/repo',
        workspaces: [
          { path: '/repo', label: 'repo' },
          { path: '/repo/docs', label: 'docs' },
        ],
      }),
    ];
    const { service, workbuddyHostCommand } = setup({ hosts });

    await expect(
      service.send(user, '1', { text: '改文档', workspace: '/etc' }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.WORKSPACE_NOT_ALLOWED });

    const { command } = await service.send(user, '1', {
      text: '改文档',
      workspace: '/repo/docs',
    });
    expect(command.workspace).toBe('/repo/docs');
    expect(workbuddyHostCommand.rows[0]['payload']).toMatchObject({
      cwd: '/repo/docs',
    });

    const fallback = await service.send(user, '1', { text: '看看仓库' });
    expect(fallback.command.workspace).toBe('/repo');

    // 尾分隔符/大小写不敏感，与客户端 resolveWorkspace 同口径
    const trailing = await service.send(user, '1', {
      text: '改文档',
      workspace: '/repo/Docs/',
    });
    expect(trailing.command.workspace).toBe('/repo/Docs/');
  });

  it('定时任务到点重校验：工作区已不在白名单记 skipped 并抛错，不入队', async () => {
    const { service, workbuddyHostCommand, workbuddyHostSchedule } = setup({
      hosts: [
        hostWith({
          workspace: '/workspace',
          workspaces: [{ path: '/workspace' }],
        }),
      ],
      schedules: [
        {
          id: 5,
          userId: 'u1',
          hostId: 1,
          title: '周报',
          instruction: '生成周报',
          payload: { cwd: '/gone', timeoutSec: 300 },
          scheduleType: 'recurring',
          scheduleConfig: { freq: 'daily', time: '09:00' },
          scheduledAt: new Date(Date.now() - 60_000),
          status: 'enabled',
          runCount: 0,
        },
      ],
    });

    await expect(service.advanceDue()).resolves.toBe(1);
    expect(workbuddyHostCommand.rows).toHaveLength(0);
    const schedule = workbuddyHostSchedule.rows[0];
    expect(schedule['lastStatus']).toBe('skipped');
    expect(String(schedule['lastError'])).toContain('不在这台主机的白名单里');
  });

  it('工作区详情：只回默认目录与候选表，不带客户端本地模型与技能', async () => {
    const { service } = setup({
      hosts: [
        hostWith({
          state: 'READY',
          version: '1.0.0',
          channel: '内网网关',
          model: 'deepseek-chat',
          skillCount: 3,
          personaCount: 2,
          workspace: '/repo',
          workspaces: [
            { path: '/repo', label: 'repo', isGit: true },
            { path: '/repo/docs', label: 'docs' },
          ],
        }),
      ],
    });

    const detail = await service.workspaces(user, '1');
    expect(detail).toEqual({
      defaultPath: '/repo',
      count: 2,
      list: [
        expect.objectContaining({ path: '/repo', isGit: true }),
        expect.objectContaining({ path: '/repo/docs' }),
      ],
    });
    expect(JSON.stringify(detail)).not.toContain('deepseek-chat');
  });

  it('主机离线时指令照落队列，等主机上线再领', async () => {
    const { service } = setup({
      hosts: [
        hostWith(
          {
            state: 'READY',
            workspace: '/workspace',
          },
          { lastSeenAt: new Date(Date.now() - 600_000) },
        ),
      ],
    });

    const { command } = await service.send(user, '1', { text: '跑一下' });
    expect(command.status).toBe('PENDING');
  });

  it('平台模型授权：没默认模型时心跳不下发；AIPDD 默认模型用平台 Key 自动下发', async () => {
    const { service } = setup({ hosts: [hostRow] });
    const beat = await service.heartbeat(
      { id: 1, userId: 'u1', name: '测试主机', clientKind: 'DESKTOP' },
      { caps: {} },
      '127.0.0.1',
    );
    expect(beat.modelGrant).toBeNull();

    const env = {
      platform: process.env.AIPDD_PLATFORM_KEY,
      credKey: process.env.EXTERNAL_CRED_KEY,
    };
    process.env.AIPDD_PLATFORM_KEY = 'sk-platform-test';
    // AccountCrypto 构造函数要求 EXTERNAL_CRED_KEY，缺了连 AipddKeyService 都建不出来。
    process.env.EXTERNAL_CRED_KEY = 'unit-test-cred-key';
    try {
      const { service: withSlot, contentModelSlot: slots } = setup({
        hosts: [hostRow],
      });
      slots.rows.push({
        id: 1,
        userId: 'u1',
        mediaType: 'text',
        channelId: 0,
        model: 'ap-deepseek-v4-flash',
      });
      const granted = await withSlot.heartbeat(
        { id: 1, userId: 'u1', name: '测试主机', clientKind: 'DESKTOP' },
        { caps: {} },
        '127.0.0.1',
      );
      expect(granted.modelGrant).toMatchObject({
        channelId: 0,
        source: 'default',
        protocol: 'openai',
        model: 'ap-deepseek-v4-flash',
        apiKey: 'sk-platform-test',
      });
      expect(String(granted.modelGrant?.baseUrl || '')).toContain('http');

      // 内容相同的第二次心跳只发「未变化」标记，客户端据此跳过，不再重复建渠道。
      const again = await withSlot.heartbeat(
        { id: 1, userId: 'u1', name: '测试主机', clientKind: 'DESKTOP' },
        { caps: {} },
        '127.0.0.1',
      );
      expect(again.modelGrant).toBeNull();
      expect(again.grantUnchanged).toBe(true);

      // 客户端没写成功会带 needGrant：内容没变也要再发一次，否则手机永远配不上模型。
      const retried = await withSlot.heartbeat(
        { id: 1, userId: 'u1', name: '测试主机', clientKind: 'DESKTOP' },
        { caps: {}, needGrant: true },
        '127.0.0.1',
      );
      expect(retried.modelGrant).toMatchObject({
        model: 'ap-deepseek-v4-flash',
        apiKey: 'sk-platform-test',
      });
      expect(retried.grantUnchanged).toBe(false);
    } finally {
      if (env.platform === undefined) delete process.env.AIPDD_PLATFORM_KEY;
      else process.env.AIPDD_PLATFORM_KEY = env.platform;
      if (env.credKey === undefined) delete process.env.EXTERNAL_CRED_KEY;
      else process.env.EXTERNAL_CRED_KEY = env.credKey;
    }
  });

  it('模型授权保存：channelId=0 没可用 Key 时给可执行提示，配好平台 Key 后可保存', async () => {
    const { service } = setup({ hosts: [hostRow] });
    await expect(
      service.saveModelGrant(user, '1', {
        channelId: 0,
        model: 'ap-deepseek-v4-flash',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.BAD_REQUEST });

    const env = {
      platform: process.env.AIPDD_PLATFORM_KEY,
      credKey: process.env.EXTERNAL_CRED_KEY,
    };
    process.env.AIPDD_PLATFORM_KEY = 'sk-platform-test';
    process.env.EXTERNAL_CRED_KEY = 'unit-test-cred-key';
    try {
      await expect(
        service.saveModelGrant(user, '1', {
          channelId: 0,
          model: 'ap-deepseek-v4-flash',
        }),
      ).resolves.toMatchObject({
        grant: {
          channelId: 0,
          source: 'platform',
          model: 'ap-deepseek-v4-flash',
        },
      });
    } finally {
      if (env.platform === undefined) delete process.env.AIPDD_PLATFORM_KEY;
      else process.env.AIPDD_PLATFORM_KEY = env.platform;
      if (env.credKey === undefined) delete process.env.EXTERNAL_CRED_KEY;
      else process.env.EXTERNAL_CRED_KEY = env.credKey;
    }
  });

  it('连接码绑账号：客户端用哪个账号登录就归哪个账号，别的账号轮询直接拒', async () => {
    const { service, workbuddyHostPairCode } = setup({ hosts: [hostRow] });

    const opened = await service.requestPairCode(user, { deviceInfo: {} });
    expect(workbuddyHostPairCode.rows[0]).toMatchObject({
      code: opened.code,
      userId: 'u1',
    });

    const other = new CurrentUser('u2', 'other', 'user');
    await expect(
      service.pollPairCode(other, { code: opened.code }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });

    const pending = await service.pollPairCode(user, { code: opened.code });
    expect(pending).toMatchObject({ paired: false, token: '' });
  });

  it('扫码配对：站内出码，手机免登录兑换，旧 6 位码不能走兑换', async () => {
    const { service, workbuddyHostPairCode } = setup({ hosts: [] });

    const created = await service.createPairQr(user, {
      name: '工位机',
      siteUrl: 'https://a.example.com',
    });
    expect(created.code).toMatch(/^QR[A-Z2-9]{10}$/);
    expect(created.payload).toContain('"type":"awbot-pair"');
    expect(created.image.startsWith('data:image/png;base64,')).toBe(true);
    expect(workbuddyHostPairCode.rows[0]).toMatchObject({
      code: created.code,
      clientKind: 'AWBOT',
      userId: 'u1',
    });

    const redeemed = await service.redeemPairQr({
      code: created.code,
      deviceInfo: { platform: 'android' },
    });
    expect(redeemed).toMatchObject({
      paired: true,
      hostName: '工位机',
    });
    expect(redeemed.token.startsWith('awb_')).toBe(true);

    await expect(
      service.redeemPairQr({ code: created.code }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });

    const legacy = await service.requestPairCode(user, {
      clientKind: 'AWBOT',
    });
    await expect(
      service.redeemPairQr({ code: legacy.code }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.BAD_REQUEST });
  });

  it('平台下发的指令能经心跳交给手机，并接收进度与结果', async () => {
    const { service } = setup({ hosts: [] });
    const created = await service.createPairQr(user, {
      name: '手机',
      siteUrl: 'https://a.example.com',
    });
    const paired = await service.redeemPairQr({ code: created.code });
    const host = {
      id: paired.hostId,
      userId: 'u1',
      name: paired.hostName,
      clientKind: 'AWBOT' as const,
    };

    const sent = await service.send(user, String(host.id), {
      text: '在手机上执行这件事',
    });

    const beat = await service.heartbeat(
      host,
      { caps: {}, platform: 'android' },
      '127.0.0.1',
    );
    expect(beat.commands).toHaveLength(1);
    expect(beat.commands[0]).toMatchObject({
      commandCode: sent.command.commandCode,
      instruction: '在手机上执行这件事',
    });

    await expect(
      service.progress(host, {
        commandCode: sent.command.commandCode,
        text: '做到一半',
      }),
    ).resolves.toMatchObject({ cancelRequested: false });

    await expect(
      service.result(host, {
        commandCode: sent.command.commandCode,
        ok: true,
        text: '做完了',
      }),
    ).resolves.toMatchObject({ received: true });

    const after = await service.conversation(user, String(host.id));
    expect(
      after.commands.find(
        (row) => row.commandCode === sent.command.commandCode,
      ),
    ).toMatchObject({ status: 'DONE', resultText: '做完了' });
  });

  it('模型设置来源：客户端同步的覆盖项可见，清掉后回到跟随平台默认文本模型', async () => {
    const { service, workbuddyHostModelGrant, contentModelSlot } = setup({
      hosts: [hostRow],
      commands: [],
    });
    contentModelSlot.rows.push({
      id: 1,
      userId: 'u1',
      mediaType: 'text',
      channelId: -1,
      model: 'platform-default',
    });

    const inherited = await service.modelGrant(user, '1');
    expect(inherited.grant).toMatchObject({
      source: 'default',
      model: 'platform-default',
    });

    workbuddyHostModelGrant.rows.push({
      id: 1,
      userId: 'u1',
      hostId: 1,
      channelId: 7,
      model: 'local-choice',
      enabled: true,
      source: 'client',
      updatedAt: new Date(),
    });
    const overridden = await service.modelGrant(user, '1');
    expect(overridden.grant).toMatchObject({
      source: 'client',
      model: 'local-choice',
    });

    const principal = {
      id: 1,
      userId: 'u1',
      name: 'PC',
      clientKind: 'DESKTOP' as const,
    };
    await expect(service.clearClientModel(principal)).resolves.toEqual({
      removed: true,
    });
    const back = await service.modelGrant(user, '1');
    expect(back.grant).toMatchObject({
      source: 'default',
      model: 'platform-default',
    });
  });

  it('令牌鉴权：前缀不符直接拒绝；账号不在册则吊销主机令牌', async () => {
    const disabled = setup({
      hosts: [{ ...hostRow, tokenHash: 'hash', enabled: false }],
    });
    await expect(
      disabled.service.hostByToken('bearer-not-host'),
    ).resolves.toBeNull();
    await expect(disabled.service.hostByToken('bot_token')).resolves.toBeNull();

    const { createHash } = await import('node:crypto');
    const token = 'bot_live';
    const revoked = setup({
      hosts: [
        {
          ...hostRow,
          tokenHash: createHash('sha256').update(token).digest('hex'),
        },
      ],
      standing: false,
    });
    await expect(revoked.service.hostByToken(token)).resolves.toBeNull();
    expect(revoked.workbuddyHost.rows[0]).toMatchObject({
      enabled: false,
      status: 'DISABLED',
      tokenHash: '',
    });
  });
  it('AWBot 与桌面主机按 clientKind 隔离，不互相串台', async () => {
    const awbotRow = {
      ...hostRow,
      id: 2,
      name: 'AWBot 手机',
      platform: 'android',
      clientKind: 'AWBOT',
      tokenPrefix: 'awb_abc',
    };
    const { service } = setup({ hosts: [hostRow, awbotRow] });

    const desktops = await service.list(user);
    expect(desktops.list.map((row) => row.id)).toEqual([1]);
    expect(desktops.list[0].clientKind).toBe('DESKTOP');
    expect(desktops.list[0].awbot).toBeNull();

    const awbots = await service.list(user, 'AWBOT');
    expect(awbots.list.map((row) => row.id)).toEqual([2]);
    expect(awbots.list[0].clientKind).toBe('AWBOT');
    expect(awbots.list[0].awbot).toMatchObject({
      battery: 0,
      charging: false,
    });
  });

  it('AWBot 配对码：按 kind 申请与认领，签发 awb_ 令牌，桌面页不能认领', async () => {
    const { service, workbuddyHostPairCode, workbuddyHost } = setup({});
    const issued = await service.requestPairCode(user, {
      clientKind: 'AWBOT',
      deviceInfo: { hostname: 'Pixel', os: 'android' },
    });
    expect(workbuddyHostPairCode.rows[0]).toMatchObject({
      clientKind: 'AWBOT',
      userId: 'u1',
    });

    await expect(
      service.pair(user, { code: issued.code, clientKind: 'DESKTOP' }),
    ).rejects.toThrow('AWBot 手机');

    const paired = await service.pair(user, {
      code: issued.code,
      clientKind: 'AWBOT',
      name: '我的手机',
    });
    expect(paired.token.startsWith('awb_')).toBe(true);
    expect(paired.host.clientKind).toBe('AWBOT');
    expect(workbuddyHost.rows[0]).toMatchObject({
      clientKind: 'AWBOT',
      name: '我的手机',
      platform: 'android',
    });

    const polled = await service.pollPairCode(user, { code: issued.code });
    expect(polled).toMatchObject({ paired: true, hostId: paired.host.id });
    expect(polled.token.startsWith('awb_')).toBe(true);
  });

  it('配对码一次性：同一码第二次认领直接 CONFLICT，且不会多建主机', async () => {
    const { service, workbuddyHost } = setup({});
    const issued = await service.requestPairCode(user, {
      clientKind: 'DESKTOP',
    });
    const first = await service.pair(user, {
      code: issued.code,
      name: '我的电脑',
    });
    expect(first.token.startsWith('bot_')).toBe(true);
    expect(workbuddyHost.rows).toHaveLength(1);

    await expect(
      service.pair(user, { code: issued.code, name: '我的电脑 2' }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });
    expect(workbuddyHost.rows).toHaveLength(1);
  });

  it('认领后轮询仍能取回一次性令牌，第二次轮询不再重复签发', async () => {
    const { service } = setup({});
    const issued = await service.requestPairCode(user, {
      clientKind: 'DESKTOP',
    });
    const paired = await service.pair(user, {
      code: issued.code,
      name: '我的电脑',
    });
    const firstPoll = await service.pollPairCode(user, { code: issued.code });
    expect(firstPoll).toMatchObject({
      paired: true,
      hostId: paired.host.id,
      token: paired.token,
    });
    const secondPoll = await service.pollPairCode(user, { code: issued.code });
    expect(secondPoll).toMatchObject({ paired: false, token: '' });
  });

  it('AWBot 向手机下发指令时不携带桌面工作区或执行模式', async () => {
    const { service } = setup({
      hosts: [
        {
          ...hostRow,
          id: 2,
          clientKind: 'AWBOT',
          platform: 'android',
          caps: {
            defaultPath: '/should-not-leak',
            list: [{ path: '/should-not-leak' }],
          },
        },
      ],
    });
    const { command } = await service.send(user, '2', {
      text: '你好',
      workspace: '/should-not-leak',
      mode: 'danger-full-access',
    });
    expect(command.workspace).toBe('');
    expect(command.mode).toBe('');
  });
});

/**
 * Agent 群控写侧（docs/Agent群控（替换插件页签）产品设计方案.md §4.2、§8）：
 * 派单入口与设备页面手动下发同源，但多了三道闸——启用状态、本轮勾选的设备类型、来源留痕；
 * 回给工具层的设备摘要绝不能带配对令牌。
 */
describe('BotHostService 受控派单（Agent 群控）', () => {
  const intruder = new CurrentUser('u9', 'stealer', 'user');

  it('按 AGENT 来源与对话编号落库，设备摘要只给编号/名称/在线态', async () => {
    const { service, workbuddyHostCommand } = setup({
      hosts: [{ ...hostRow, tokenHash: 'secret-hash' }],
    });

    const { command, host } = await service.dispatchAsAgent(user, {
      hostId: 1,
      instruction: '把这份周报发出去',
      title: '周报投递',
      scope: ['DESKTOP'],
      agentConversationId: 42,
    });

    expect(command.instruction).toBe('把这份周报发出去');
    expect(command.status).toBe('PENDING');
    expect(workbuddyHostCommand.rows[0]).toMatchObject({
      source: 'AGENT',
      agentConversationId: 42,
      title: '周报投递',
    });
    expect(host).toEqual({
      id: 1,
      name: 'PC',
      clientKind: 'DESKTOP',
      status: 'ONLINE',
    });
  });

  it('设备离线照样入队，状态回成 OFFLINE 让模型告知用户排队', async () => {
    const { service } = setup({
      hosts: [{ ...hostRow, lastSeenAt: new Date(Date.now() - 600_000) }],
    });

    const { command, host } = await service.dispatchAsAgent(user, {
      hostId: 1,
      instruction: '跑一下',
      scope: ['DESKTOP'],
      agentConversationId: 7,
    });

    expect(host.status).toBe('OFFLINE');
    expect(command.status).toBe('PENDING');
  });

  it('已停用设备不能被 Agent 派发，界面手动下发口径保持不变', async () => {
    const { service, workbuddyHostCommand } = setup({
      hosts: [{ ...hostRow, enabled: false, status: 'DISABLED' }],
    });

    await expect(
      service.dispatchAsAgent(user, {
        hostId: 1,
        instruction: '跑一下',
        scope: ['DESKTOP'],
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.BAD_REQUEST,
      message: expect.stringContaining('已停用'),
    });
    expect(workbuddyHostCommand.rows).toHaveLength(0);

    await expect(
      service.send(user, '1', { text: '手动下发' }),
    ).resolves.toBeTruthy();
  });

  it('设备类型不在本轮勾选的群控范围内时拒派', async () => {
    const { service, workbuddyHostCommand } = setup({
      hosts: [{ ...hostRow, id: 2, clientKind: 'AWBOT', platform: 'android' }],
    });

    await expect(
      service.dispatchAsAgent(user, {
        hostId: 2,
        instruction: '拍一张',
        scope: ['DESKTOP'],
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.BAD_REQUEST,
      message: expect.stringContaining('不在本轮勾选的群控范围'),
    });
    expect(workbuddyHostCommand.rows).toHaveLength(0);
  });

  it('别人的设备按不存在处理，不泄露设备是否存在', async () => {
    const { service } = setup({ hosts: [hostRow] });

    await expect(
      service.dispatchAsAgent(intruder, {
        hostId: 1,
        instruction: '跑一下',
        scope: ['DESKTOP'],
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.NOT_FOUND });
  });

  it('Agent 建的设备定时任务继承来源，补跑一轮生成的指令仍是 AGENT', async () => {
    const { service, workbuddyHostSchedule, workbuddyHostCommand } = setup({
      hosts: [hostRow],
    });

    const { schedule } = await service.createScheduleAsAgent(user, {
      hostId: 1,
      title: '每天早报',
      instruction: '汇总昨天的销量',
      scheduleType: 'scheduled',
      scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
      scope: ['DESKTOP'],
      agentConversationId: 43,
    });

    expect(workbuddyHostSchedule.rows[0]).toMatchObject({
      source: 'AGENT',
      agentConversationId: 43,
      scheduleType: 'scheduled',
    });

    await service.runSchedule(user, String(schedule.id));

    expect(workbuddyHostCommand.rows[0]).toMatchObject({
      source: 'AGENT',
      agentConversationId: 43,
      kind: 'prompt',
      scheduleId: schedule.id,
    });
  });
});

/**
 * 群控任务终态的站内信（方案 §4.4）：Agent 派单与设备侧定时到点必须主动告知，
 * 用户在设备页面手动下的指令不打扰；提醒只是旁路，出口缺席或出错都不能带崩设备回执。
 */
describe('BotHostService 终态站内信', () => {
  type NoticePayload = Parameters<
    NonNullable<BotHostService['terminalNotice']>
  >[1];

  function withNotice(input: { hosts?: Row[]; commands?: Row[] }) {
    const env = setup(input);
    const notice = jest.fn<Promise<void>, [string, NoticePayload]>(() =>
      Promise.resolve(),
    );
    env.service.terminalNotice = notice;
    return { ...env, notice };
  }

  it('Agent 派单跑完：发 info 级消息，正文带设备名与指令码且遮掉本地路径', async () => {
    const { service, notice, workbuddyHostCommand } = withNotice({
      hosts: [hostRow],
      commands: [
        commandRow({
          status: 'DISPATCHED',
          source: 'AGENT',
          agentConversationId: 43,
          dispatchedAt: new Date(),
        }),
      ],
    });
    const receipt = await service.result(hostPrincipal, {
      commandCode: 'wbcmd1',
      ok: true,
      text: '结果文件在 C:\\Users\\a\\report.docx\n第二段',
      elapsedMs: 4200,
    });
    expect(receipt).toMatchObject({ received: true, duplicate: false });
    expect(workbuddyHostCommand.rows[0].status).toBe('DONE');
    expect(notice).toHaveBeenCalledTimes(1);
    const [userId, message] = notice.mock.calls[0];
    expect(userId).toBe('u1');
    expect(message.title).toBe('群控任务已完成：整理周报');
    expect(message.level).toBe('info');
    expect(message.commandCode).toBe('wbcmd1');
    expect(message.body).toContain('PC · 普通任务');
    expect(message.body).toContain('指令码 wbcmd1');
    expect(message.body).toContain('（本地路径已隐藏）');
    expect(message.body).not.toContain('report.docx');
  });

  it('用户在设备页面手下的指令跑完不发信', async () => {
    const { service, notice } = withNotice({
      hosts: [hostRow],
      commands: [
        commandRow({ status: 'DISPATCHED', dispatchedAt: new Date() }),
      ],
    });
    await service.result(hostPrincipal, {
      commandCode: 'wbcmd1',
      ok: true,
      text: '已完成',
    });
    expect(notice).not.toHaveBeenCalled();
  });

  it('设备侧定时任务到点跑完也通知，正文标注定时任务', async () => {
    const { service, notice } = withNotice({
      hosts: [hostRow],
      commands: [
        commandRow({
          kind: 'schedule',
          status: 'DISPATCHED',
          scheduleId: 7,
          dispatchedAt: new Date(),
        }),
      ],
    });
    await service.result(hostPrincipal, {
      commandCode: 'wbcmd1',
      ok: true,
      text: '早报已汇总',
    });
    expect(notice).toHaveBeenCalledTimes(1);
    const [, message] = notice.mock.calls[0];
    expect(message.title).toBe('群控任务已完成：整理周报');
    expect(message.body).toContain('定时任务');
  });

  it('执行失败按 error 级，正文给失败原因与重新派单指引', async () => {
    const { service, notice } = withNotice({
      hosts: [hostRow],
      commands: [
        commandRow({
          status: 'DISPATCHED',
          source: 'AGENT',
          dispatchedAt: new Date(),
        }),
      ],
    });
    await service.result(hostPrincipal, {
      commandCode: 'wbcmd1',
      ok: false,
      errorMessage: '工作区不存在',
    });
    expect(notice).toHaveBeenCalledTimes(1);
    const [, message] = notice.mock.calls[0];
    expect(message.level).toBe('error');
    expect(message.title).toBe('群控任务执行失败：整理周报');
    expect(message.body).toContain('工作区不存在');
    expect(message.body).toContain('重新派单');
  });

  it('超时收口同样通知；取消不发信', async () => {
    const { service, notice } = withNotice({
      hosts: [hostRow],
      commands: [
        commandRow({
          status: 'DISPATCHED',
          source: 'AGENT',
          dispatchedAt: new Date(Date.now() - 40 * 60_000),
          payload: {
            instruction: '整理周报',
            cwd: '/workspace',
            timeoutSec: 60,
          },
        }),
        commandRow({
          id: 12,
          commandCode: 'wbcmd2',
          status: 'DISPATCHED',
          source: 'AGENT',
          dispatchedAt: new Date(),
          cancelRequested: true,
        }),
      ],
    });
    expect(await service.sweepTimeouts()).toBe(1);
    expect(notice).toHaveBeenCalledTimes(1);
    const [, timeout] = notice.mock.calls[0];
    expect(timeout.title).toBe('群控任务超时未回传：整理周报');
    expect(timeout.level).toBe('error');

    notice.mockClear();
    await service.result(hostPrincipal, {
      commandCode: 'wbcmd2',
      ok: true,
      text: '跑完了',
      canceled: true,
    });
    expect(notice).not.toHaveBeenCalled();
  });

  it('出口没装配或抛错都不影响设备回执落库', async () => {
    const plain = setup({
      hosts: [hostRow],
      commands: [
        commandRow({
          status: 'DISPATCHED',
          source: 'AGENT',
          dispatchedAt: new Date(),
        }),
      ],
    });
    await expect(
      plain.service.result(hostPrincipal, {
        commandCode: 'wbcmd1',
        ok: true,
        text: '已完成',
      }),
    ).resolves.toMatchObject({ received: true });
    expect(plain.workbuddyHostCommand.rows[0].status).toBe('DONE');

    const broken = withNotice({
      hosts: [hostRow],
      commands: [
        commandRow({
          status: 'DISPATCHED',
          source: 'AGENT',
          commandCode: 'wbcmd3',
          dispatchedAt: new Date(),
        }),
      ],
    });
    broken.service.terminalNotice = () =>
      Promise.reject(new Error('站内信写失败'));
    await expect(
      broken.service.result(hostPrincipal, {
        commandCode: 'wbcmd3',
        ok: true,
        text: '已完成',
      }),
    ).resolves.toMatchObject({ received: true });
    expect(broken.workbuddyHostCommand.rows[0].status).toBe('DONE');
  });
});
