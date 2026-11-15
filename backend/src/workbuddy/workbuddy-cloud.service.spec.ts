import { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { PrismaService } from '../prisma/prisma.service';
import { stub } from '../../test/doubles';
import { WorkbuddyCloudService } from './workbuddy-cloud.service';
import type { WorkbuddyAccountService } from './workbuddy-account.service';

/**
 * 企业云改版的三条硬约束：账号归属隔离、定时先推排期再跑、失败只留痕不外抛。
 * 用内存替身钉住，避免改派发链路时把隔离或收口弄丢。
 */

type Row = Record<string, unknown>;

const user = new CurrentUser('u1', 'owner', 'user');

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

function setup(input: {
  accounts?: Row[];
  schedules?: Row[];
  commands?: Row[];
}) {
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
  return {
    service: new WorkbuddyCloudService(prisma, accounts),
    workbuddyCloudSchedule,
    workbuddyCloudScheduleRun,
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
