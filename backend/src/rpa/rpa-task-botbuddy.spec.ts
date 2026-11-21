import { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { stub } from '../../test/doubles';
import type { IdentityService } from '../identity/identity.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RpaAccountService } from './rpa-account.service';
import type { RpaChromeDeviceService } from './chrome-device.service';
import type { RpaScriptService } from './rpa-script.service';
import type { RpaSettingService } from './rpa-setting.service';
import { RpaTaskService } from './rpa-task.service';

/**
 * RPA「AWBotDSH 浏览器」设备：这条链路上最容易出错的是三条口径——
 *   1) PC 与 AWBotDSH 共用同一份 Automa JSON，但别的脚本类型不能互换（否则执行端拿到跑不了的正文）；
 *   2) 任务必须落到一台在线主机上，窗口只认客户端上报的候选（平台不替用户建窗口）；
 *   3) 领取要么原子抢单成功、要么把任务原样退回待执行，不能留下永远「执行中」的任务。
 */

const user = new CurrentUser('9001', 'owner', 'user');
const HOST_ID = 31;
const ONLINE_SEEN = new Date();
const STALE_SEEN = new Date(Date.now() - 10 * 60 * 1000);

type Row = Record<string, unknown>;

function script(over: Partial<Row>): Row {
  return {
    id: 11,
    createdBy: user.userId,
    name: '竞品采集',
    deviceType: 'pc',
    fileType: 'automa_json',
    vendorFlowId: '',
    status: 'published',
    paramsSchema: {},
    content: JSON.stringify({
      id: 'wf-1',
      name: '竞品采集',
      drawflow: {
        nodes: [
          { id: 'trigger', label: 'trigger', data: { type: 'manual' } },
          {
            id: 'new-tab-1',
            label: 'new-tab',
            data: { url: 'https://example.com' },
          },
        ],
        edges: [],
      },
    }),
    ...over,
  };
}

function host(over: Partial<Row>): Row {
  return {
    id: HOST_ID,
    userId: user.userId,
    name: '办公室主机',
    clientKind: 'DESKTOP',
    status: 'ONLINE',
    lastSeenAt: ONLINE_SEEN,
    caps: {
      agent: {
        fingerprint: {
          defaultId: 'fpA',
          windows: [
            { id: 'fpA', name: '店铺 A' },
            { id: 'fpB', name: '店铺 B' },
          ],
        },
      },
    },
    ...over,
  };
}

function setup(options: { scripts?: Row[]; hosts?: Row[] } = {}) {
  const scripts = options.scripts ?? [script({})];
  const hosts = options.hosts ?? [host({})];
  const tasks: Row[] = [];
  const executions: Row[] = [];
  let taskSeq = 500;
  let execSeq = 900;

  const prisma = {
    rpaScript: {
      findUnique: jest.fn(
        async ({ where }: { where: { id: number } }) =>
          scripts.find((item) => item.id === where.id) ?? null,
      ),
      findMany: jest.fn(async () => scripts),
    },
    workbuddyHost: {
      findFirst: jest.fn(
        async ({ where }: { where: { id: number; userId: string } }) =>
          hosts.find(
            (item) => item.id === where.id && item.userId === where.userId,
          ) ?? null,
      ),
    },
    rpaTask: {
      create: jest.fn(async ({ data }: { data: Row }) => {
        const row = {
          id: (taskSeq += 1),
          createdBy: user.userId,
          chromeClientId: '',
          botHostId: null,
          fpProfileId: '',
          accountIds: [],
          params: {},
          scheduleConfig: {},
          scheduledAt: null,
          startedAt: null,
          completedAt: null,
          lastRunAt: null,
          lastError: '',
          status: 'pending',
          phoneFinishAction: 'keep',
          maxRetries: 0,
          timeoutSeconds: 3600,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        tasks.push(row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: { where: { id: number } }) => {
        const row = tasks.find((item) => item.id === where.id);
        if (!row) throw new Error(`库里没有任务 #${where.id}`);
        return row;
      }),
      findMany: jest.fn(async ({ where }: { where?: Row } = {}) =>
        tasks.filter((row) => {
          if (!where) return true;
          if (
            where.createdBy !== undefined &&
            row.createdBy !== where.createdBy
          )
            return false;
          if (where.status !== undefined && row.status !== where.status)
            return false;
          const device = where.deviceType as Row | string | undefined;
          if (typeof device === 'string') return row.deviceType === device;
          if (device && Array.isArray(device.notIn)) {
            return !device.notIn.includes(row.deviceType);
          }
          return true;
        }),
      ),
      update: jest.fn(
        async ({ where, data }: { where: { id: number }; data: Row }) => {
          const row = tasks.find((item) => item.id === where.id);
          if (!row) throw new Error(`库里没有任务 #${where.id}`);
          Object.assign(row, data);
          return row;
        },
      ),
      updateMany: jest.fn(
        async ({ where, data }: { where: Row; data: Row }) => {
          const hits = tasks.filter(
            (row) =>
              row.id === where.id &&
              (where.status === undefined || row.status === where.status),
          );
          hits.forEach((row) => Object.assign(row, data));
          return { count: hits.length };
        },
      ),
    },
    rpaTaskExecution: {
      count: jest.fn(async () => executions.length),
      // 超时自愈会先扫一遍「还在 running」的执行记录
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: { data: Row }) => {
        const row = {
          id: (execSeq += 1),
          createdBy: user.userId,
          status: 'running',
          attempt: 1,
          startedAt: new Date(),
          finishedAt: null,
          ...data,
        };
        executions.push(row);
        return row;
      }),
    },
    rpaAccount: {
      findMany: jest.fn(async () => []),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
  };

  const service = new RpaTaskService(
    stub<PrismaService>(prisma),
    stub<IdentityService>({
      audit: jest.fn(async () => undefined),
      isPlatformAdmin: () => false,
    }),
    stub<RpaScriptService>({
      loadOwned: jest.fn(async (_u: CurrentUser, id: number) => {
        const row = scripts.find((item) => item.id === id);
        if (!row) throw new Error('脚本不存在');
        return row;
      }),
    }),
    stub<RpaAccountService>({
      loadOwned: jest.fn(async (_u: CurrentUser, id: number) => ({
        id,
        envType: 1,
      })),
    }),
    stub<RpaSettingService>({
      get: jest.fn(async () => ({
        bitbrowserApiEndpoint: '',
        bitbrowserGroupId: '',
      })),
    }),
    stub<RpaChromeDeviceService>({
      requireOnlineDevice: jest.fn(async () => ({ clientId: 'chrome-1' })),
      deviceOnline: jest.fn(async () => true),
    }),
  );
  return { service, prisma, tasks, executions };
}

async function expectMessage(work: Promise<unknown>, fragment: string) {
  const error: unknown = await work
    .then(() => null)
    .catch((err: unknown) => err);
  expect(error).toBeInstanceOf(BusinessException);
  const message = error instanceof Error ? error.message : '';
  expect(message).toContain(fragment);
  return message;
}

describe('RPA 设备与脚本的可执行组合', () => {
  it('PC 的 Automa 脚本可以建成 AWBotDSH 浏览器任务，并落主机与窗口', async () => {
    const { service, prisma } = setup();
    const created = await service.create(user, {
      name: '每早采集竞品价格',
      scriptId: 11,
      deviceType: 'botbuddy',
      botHostId: HOST_ID,
      fpProfileId: 'fpB',
    });
    expect(created.deviceType).toBe('botbuddy');
    const data = prisma.rpaTask.create.mock.calls[0][0];
    expect(data.data.botHostId).toBe(HOST_ID);
    expect(data.data.fpProfileId).toBe('fpB');
    // AWBotDSH 跑在用户自己机器、本人登录态下：不要求 RPA 账号
    expect(data.data.accountIds).toEqual([]);
  });

  it('反向也成立：AWBotDSH 的 Automa 脚本可以建成 PC 任务', async () => {
    const { service } = setup({
      scripts: [script({ deviceType: 'botbuddy', name: '窗口流程' })],
    });
    const created = await service.create(user, {
      name: '同流程改跑比特浏览器',
      scriptId: 11,
      deviceType: 'pc',
      accountIds: [7],
    });
    expect(created.deviceType).toBe('pc');
  });

  it('云手机脚本不能声明成 AWBotDSH 浏览器', async () => {
    const { service } = setup({
      scripts: [script({ deviceType: 'android', fileType: 'bitphone_json' })],
    });
    await expectMessage(
      service.create(user, { name: 'x', scriptId: 11, deviceType: 'botbuddy' }),
      '任务设备跟随绑定脚本',
    );
  });

  it('PC 的 JS 脚本换到 AWBotDSH 浏览器时要按脚本类型拒绝', async () => {
    const { service } = setup({
      scripts: [script({ fileType: 'javascript' })],
    });
    const message = await expectMessage(
      service.create(user, { name: 'x', scriptId: 11, deviceType: 'botbuddy' }),
      '跑不了',
    );
    expect(message).toContain('JSON（Automa 脚本）');
  });
});

describe('RPA AWBotDSH 任务的设备位校验', () => {
  it('没选主机时给出可操作的下一步', async () => {
    const { service } = setup();
    const message = await expectMessage(
      service.create(user, { name: 'x', scriptId: 11, deviceType: 'botbuddy' }),
      'AWBotDSH 浏览器任务要选定一台 AWBotDSH 主机',
    );
    expect(message).toContain('配对');
  });

  it('主机离线不允许保存（离线机器领不到任务）', async () => {
    const { service } = setup({ hosts: [host({ lastSeenAt: STALE_SEEN })] });
    await expectMessage(
      service.create(user, {
        name: 'x',
        scriptId: 11,
        deviceType: 'botbuddy',
        botHostId: HOST_ID,
      }),
      '当前离线',
    );
  });

  it('窗口必须在客户端上报的候选里，报错要列出候选名', async () => {
    const { service } = setup();
    const message = await expectMessage(
      service.create(user, {
        name: 'x',
        scriptId: 11,
        deviceType: 'botbuddy',
        botHostId: HOST_ID,
        fpProfileId: 'fpMissing',
      }),
      '上报的候选里',
    );
    expect(message).toContain('店铺 A');
    expect(message).toContain('店铺 B');
  });

  it('AWBot 手机不是浏览器设备：按 clientKind 拒绝', async () => {
    const { service } = setup({ hosts: [host({ clientKind: 'AWBOT' })] });
    await expectMessage(
      service.create(user, {
        name: 'x',
        scriptId: 11,
        deviceType: 'botbuddy',
        botHostId: HOST_ID,
      }),
      '不是 AWBotDSH 浏览器',
    );
  });
});

describe('RPA AWBotDSH 主机通道的领取与回传', () => {
  async function createdTask(service: RpaTaskService, over: Row = {}) {
    const created = await service.create(user, {
      name: '每早采集竞品价格',
      scriptId: 11,
      deviceType: 'botbuddy',
      botHostId: HOST_ID,
      fpProfileId: 'fpA',
      ...over,
    });
    return Number(created.id);
  }

  it('领取把 Automa 工作流正文与窗口一起给客户端，并落一条执行记录', async () => {
    const { service, tasks, executions } = setup();
    const taskId = await createdTask(service);
    const claimed = await service.claimBotBuddy(user.userId, HOST_ID, taskId);
    expect(claimed.workflow).toBeInstanceOf(Object);
    expect((claimed.workflow as Row).id).toBe('wf-1');
    expect(claimed.profileId).toBe('fpA');
    expect(executions[0]).toMatchObject({
      deviceType: 'botbuddy',
      status: 'running',
    });
    expect(String(executions[0].executor)).toBe(`botbuddy:${HOST_ID}`);
    expect(tasks.find((row) => row.id === taskId)?.status).toBe('running');
  });

  it('任务绑了别的主机时本机领不到', async () => {
    const { service } = setup({
      hosts: [host({}), host({ id: 32, name: '家里主机' })],
    });
    const taskId = await createdTask(service);
    await expectMessage(
      service.claimBotBuddy(user.userId, 32, taskId),
      '绑定的是另一台',
    );
  });

  it('没绑过主机的任务由第一台来领的主机定下来', async () => {
    const { service, prisma, tasks } = setup();
    const taskId = await createdTask(service);
    // 建任务时主机是必填的，这条模拟「绑定规则之前入库的存量任务」：botHostId 为空
    const row = tasks.find((item) => item.id === taskId);
    if (!row) throw new Error('样例任务没入库');
    row.botHostId = null;
    prisma.rpaTask.update.mockClear();
    await service.claimBotBuddy(user.userId, HOST_ID, taskId);
    const bound = prisma.rpaTask.update.mock.calls.some(
      ([call]) => call.data.botHostId === HOST_ID,
    );
    expect(bound).toBe(true);
  });

  it('正文不是 Automa JSON 时拒绝派发，并把任务退回待执行', async () => {
    const { service, tasks } = setup({ scripts: [script({ content: '[]' })] });
    const taskId = await createdTask(service);
    await expectMessage(
      service.claimBotBuddy(user.userId, HOST_ID, taskId),
      'JSON 对象',
    );
    // 派发失败不能留下永远「执行中」的任务，否则超时自愈扫不到它就永久卡住
    expect(tasks.find((row) => row.id === taskId)?.status).toBe('pending');
  });

  it('非 AWBotDSH 任务不能从主机通道领', async () => {
    const { service } = setup();
    const taskId = await createdTask(service, {
      deviceType: 'pc',
      accountIds: [7],
    });
    await expectMessage(
      service.claimBotBuddy(user.userId, HOST_ID, taskId),
      '不是 AWBotDSH 浏览器任务',
    );
  });

  it('队列里没有任务时给「去新建任务」的指引', async () => {
    const { service } = setup();
    await expectMessage(
      service.claimBotBuddy(user.userId, HOST_ID),
      '没有待执行的任务',
    );
  });

  it('比特浏览器机器通道不派 AWBotDSH 任务（各走自己的通道）', async () => {
    const { service, prisma, tasks } = setup();
    const taskId = await createdTask(service);
    // 声明 botbuddy 的执行端（拿 API Key 的比特浏览器侧）直接被拒
    await expectMessage(
      service.claim(user, { deviceType: 'botbuddy' }),
      '不通过 API Key 通道认领',
    );
    // 不声明设备时，候选扫描也要把这类任务排除掉（否则 PC 执行端会抢到跑不了的正文）
    const row = tasks.find((item) => item.id === taskId);
    if (!row) throw new Error('样例任务没入库');
    row.status = 'cancelled';
    await expectMessage(service.claim(user, {}), '暂无可执行');
    const scanned = prisma.rpaTask.findMany.mock.calls
      .map(
        ([arg]) => (arg as { where?: { deviceType?: Row } }).where?.deviceType,
      )
      .filter((deviceType): deviceType is Row =>
        Boolean(deviceType && !Array.isArray(deviceType)),
      );
    const notInOf = (deviceType: Row): unknown[] =>
      Array.isArray(deviceType.notIn) ? deviceType.notIn : [];
    expect(
      scanned.some((deviceType) => notInOf(deviceType).includes('botbuddy')),
    ).toBe(true);
  });
});
