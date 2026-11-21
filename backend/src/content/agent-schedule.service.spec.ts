import * as bcrypt from 'bcryptjs';
import { CurrentUser } from '../auth/current-user';
import { ContentAgentScheduleService } from './agent-schedule.service';
import { PrismaService } from '../prisma/prisma.service';
import { IdentityService } from '../identity/identity.service';
import { UserLookupService } from '../directory/user-lookup.service';
import { HrmScopeService } from '../hrm/hrm.scope';
import { ContentAgentService } from './agent.service';
import { ContentAgentExpertService } from './agent-experts.service';
import { stub } from '../../test/doubles';

/**
 * 定时任务的「允许自动执行写动作」：默认关，且只有从关到开要验本站登录密码。
 * 这一层是无人值守加固的入口——开关一旦被顺手打开，半夜那轮对话就能改数据、发消息。
 */
const user = new CurrentUser('9200', 'tester', 'user');
const HASH = bcrypt.hashSync('hunter2-hunter', 4);

const stored = {
  id: 1,
  userId: '9200',
  preset: '',
  title: '每日简报',
  instruction: '每天汇总要闻',
  conversationId: 0,
  expertId: 0,
  personaId: 0,
  skillIds: [],
  libraryIds: [],
  connectorIds: [],
  mailboxIds: [],
  allowWrite: false,
  references: [],
  channelId: 3,
  model: 'gpt-test',
  scheduleType: 'recurring',
  scheduleConfig: { freq: 'daily', time: '09:00' },
  scheduledAt: new Date('2026-11-05T01:00:00Z'),
  status: 'enabled',
  lastRunAt: null,
  lastStatus: '',
  lastError: '',
  runCount: 0,
  createdAt: new Date('2026-11-04T00:00:00Z'),
  updatedAt: new Date('2026-11-04T00:00:00Z'),
};

function build(account: unknown = { passwordHash: HASH, status: 'ACTIVE' }) {
  const create = jest
    .fn()
    .mockImplementation(({ data }) => Promise.resolve({ ...stored, ...data }));
  const findUnique = jest.fn().mockResolvedValue(account);
  const prisma = stub<PrismaService>({
    account: { findUnique },
    contentAgentSchedule: { create },
    contentAgentMcpConnector: { count: jest.fn() },
    mailAccount: { count: jest.fn() },
  });
  const identity = stub<IdentityService>({ audit: jest.fn() });
  const experts = stub<ContentAgentExpertService>({ bindable: jest.fn() });
  const scope = stub<HrmScopeService>({
    isStanding: jest.fn(async () => true),
  });
  return {
    service: new ContentAgentScheduleService(
      prisma,
      identity,
      stub<UserLookupService>(),
      scope,
      stub<ContentAgentService>(),
      experts,
    ),
    create,
    findUnique,
  };
}

const body = (extra: Record<string, unknown>) => ({
  title: '每日简报',
  instruction: '每天汇总要闻',
  scheduleType: 'recurring',
  scheduleConfig: { freq: 'daily', time: '09:00' },
  channelId: 3,
  model: 'gpt-test',
  ...extra,
});

describe('ContentAgentScheduleService.save 的写动作开关', () => {
  it('不带 allowWrite 时入库就是关，而且不必查密码', async () => {
    const { service, create, findUnique } = build();
    await service.save(user, body({}));
    expect(create.mock.calls[0][0].data.allowWrite).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('界面把开关传成字符串也不算放开', async () => {
    const { service, create } = build();
    await service.save(user, body({ allowWrite: 'true' }));
    expect(create.mock.calls[0][0].data.allowWrite).toBe(false);
  });

  it('要放开却没验密：直接拒，任务不落库', async () => {
    const { service, create } = build();
    await expect(
      service.save(user, body({ allowWrite: true })),
    ).rejects.toThrow('需要输入本站登录密码');
    expect(create).not.toHaveBeenCalled();
  });

  it('密码不对同样拒，不透露账号状态', async () => {
    const { service, create } = build();
    await expect(
      service.save(user, body({ allowWrite: true, password: 'wrong-pass' })),
    ).rejects.toThrow('不能开启「允许自动执行写动作」');
    expect(create).not.toHaveBeenCalled();
  });

  it('账号被封时密码对也开不了', async () => {
    const { service, create } = build({
      passwordHash: HASH,
      status: 'BANNED',
    });
    await expect(
      service.save(
        user,
        body({ allowWrite: true, password: 'hunter2-hunter' }),
      ),
    ).rejects.toThrow('不能开启「允许自动执行写动作」');
    expect(create).not.toHaveBeenCalled();
  });

  it('验密通过才把开关写成开', async () => {
    const { service, create } = build();
    await service.save(
      user,
      body({ allowWrite: true, password: 'hunter2-hunter' }),
    );
    expect(create.mock.calls[0][0].data.allowWrite).toBe(true);
  });
});

describe('定时执行前的在册复核', () => {
  function buildDue(standing: boolean) {
    const update = jest.fn().mockResolvedValue({});
    const prisma = stub<PrismaService>({
      contentAgentSchedule: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ ...stored, status: 'enabled' }]),
        update,
      },
    });
    const users = stub<UserLookupService>({
      lookup: jest.fn().mockResolvedValue([{ id: '9200', username: 'tester' }]),
    });
    const service = new ContentAgentScheduleService(
      prisma,
      stub<IdentityService>({ audit: jest.fn() }),
      users,
      stub<HrmScopeService>({
        isStanding: jest.fn().mockResolvedValue(standing),
      }),
      stub<ContentAgentService>({}),
      stub<ContentAgentExpertService>({}),
    );
    const execute = jest.fn().mockResolvedValue(undefined);
    Object.assign(service, { execute });
    return { service, update, execute };
  }

  it('账号已停用：不执行，任务自动暂停并清空下次时间', async () => {
    const { service, update, execute } = buildDue(false);
    await service.advanceDue();
    expect(execute).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({
        status: 'paused',
        scheduledAt: null,
        lastStatus: 'skipped',
      }),
    });
  });

  it('账号在册：照常安排下一轮并执行', async () => {
    const { service, execute } = buildDue(true);
    await service.advanceDue();
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

/**
 * 群控范围（M4）：定时任务把「到点这一轮可以指挥哪些设备」固定在自己配置里，
 * 落库要归一、编辑不传不能顺手清空、到点必须原样交给那一轮对话。
 */
const storedScope = { ...stored, dispatchScope: ['DESKTOP'] };

function buildScope(row: Record<string, unknown> = storedScope) {
  const runRow = {
    id: 9,
    scheduleId: 1,
    trigger: 'manual',
    status: 'running',
    conversationId: 77,
    messageId: 0,
    summary: '',
    error: '',
    startedAt: new Date('2026-11-17T01:00:00Z'),
    finishedAt: null,
  };
  const create = jest
    .fn()
    .mockImplementation(({ data }) =>
      Promise.resolve({ ...stored, id: 5, ...data }),
    );
  const update = jest
    .fn()
    .mockImplementation(({ data }) => Promise.resolve({ ...row, ...data }));
  const runSilent = jest
    .fn()
    .mockResolvedValue({ text: '已把这周的内容派给在线的主机', messageId: 88 });
  const prisma = stub<PrismaService>({
    account: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ passwordHash: HASH, status: 'ACTIVE' }),
    },
    contentAgentSchedule: {
      create,
      update,
      findFirst: jest.fn().mockResolvedValue({ ...row }),
      findMany: jest.fn().mockResolvedValue([{ ...row }]),
    },
    contentAgentConversation: {
      create: jest.fn().mockResolvedValue({ id: 77, expertId: 0 }),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    },
    contentAgentScheduleRun: {
      create: jest.fn().mockResolvedValue({ ...runRow }),
      update: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ ...runRow, ...data }),
        ),
    },
    contentAgentMcpConnector: { count: jest.fn() },
    mailAccount: { count: jest.fn(), findMany: jest.fn() },
  });
  const service = new ContentAgentScheduleService(
    prisma,
    stub<IdentityService>({ audit: jest.fn() }),
    stub<UserLookupService>({
      lookup: jest.fn().mockResolvedValue([{ id: '9200', username: 'tester' }]),
    }),
    stub<HrmScopeService>({ isStanding: jest.fn(async () => true) }),
    stub<ContentAgentService>({ runSilent }),
    stub<ContentAgentExpertService>({ bindable: jest.fn() }),
  );
  return { service, create, update, runSilent };
}

describe('定时任务的群控范围', () => {
  it('新建时把勾选范围归一后入库，回读也带着它', async () => {
    const { service, create } = buildScope();
    const view = await service.save(
      user,
      body({ dispatchScope: ['desktop', 'AWBOT', 'DESKTOP', 'bogus', null] }),
    );
    expect(create.mock.calls[0][0].data.dispatchScope).toEqual([
      'DESKTOP',
      'AWBOT',
    ]);
    expect(view?.dispatchScope).toEqual(['DESKTOP', 'AWBOT']);
  });

  it('没勾选就是空数组：到点这一轮不开群控', async () => {
    const { service, create } = buildScope();
    const view = await service.save(user, body({}));
    expect(create.mock.calls[0][0].data.dispatchScope).toEqual([]);
    expect(view?.dispatchScope).toEqual([]);
  });

  it('编辑没传范围时不许顺手清空，传了才改写', async () => {
    const { service, update } = buildScope();
    await service.update(user, '1', { title: '每日要闻' });
    expect(update.mock.calls[0][0].data.dispatchScope).toBeUndefined();
    await service.update(user, '1', { dispatchScope: ['AWBOT'] });
    expect(update.mock.calls[1][0].data.dispatchScope).toEqual(['AWBOT']);
  });

  it('到点执行把范围交给这一轮对话', async () => {
    const { service, runSilent } = buildScope({
      ...storedScope,
      dispatchScope: ['DESKTOP', 'AWBOT'],
    });
    await service.runNow(user, '1', 'token');
    expect(runSilent).toHaveBeenCalledTimes(1);
    expect(runSilent.mock.calls[0][4].dispatchScope).toEqual([
      'DESKTOP',
      'AWBOT',
    ]);
  });
});
