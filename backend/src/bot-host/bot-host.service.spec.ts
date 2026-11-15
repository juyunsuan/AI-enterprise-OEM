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
const hostPrincipal = { id: 1, userId: 'u1', name: 'PC' };

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
  const workbuddyHostPairCode = table([]);
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
      { id: 1, userId: 'u1', name: '测试主机' },
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
        { id: 1, userId: 'u1', name: '测试主机' },
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

    const principal = { id: 1, userId: 'u1', name: 'PC' };
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
});
