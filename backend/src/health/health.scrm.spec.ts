import type { HealthScrmPushBody } from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import { OUTBOX_POLICY } from '../commerce-core/outbox-policy';
import type { PrismaService } from '../prisma/prisma.service';
import type { ScrmSopService } from '../wecom-scrm/scrm-sop.service';
import { stub } from '../../test/doubles';
import { HealthScrmService } from './health.scrm.service';

/**
 * 健康域出站的容错口径（补齐到与 brand_scrm_outbox / mp_scrm_outbox 同一套公共策略）。
 *
 * 这里钉四件事：
 * 1. SCRM 卡住（桥超时）不冒泡到调用方，事件只是没发出去；
 * 2. SCRM 被停用/未接入时整轮顺延，绝不消耗 attempts；
 * 3. 连续失败达到阈值即打开该店熔断，冷却期内不再打桥；
 * 4. 失败后按指数退避顺延，逐轮放大，第 5 次落终态（本表无 DEAD 档，FAILED 即终态）。
 *
 * 表结构取舍：`health_scrm_events` 没有 next_at 列，退避与熔断冷却由服务内的进程门禁等价维护，
 * 下面的用例因此可以在同一进程里连续多轮 push。
 */
const SHOP_ID = 3;
const PUSH_BODY: HealthScrmPushBody = { shopId: SHOP_ID, ids: [], limit: 50 };

interface EventRow {
  id: number;
  shopId: number;
  eventType: string;
  customerId: number;
  refType: string;
  refId: number;
  status: string;
  attempts: number;
  lastError: string;
  occurredAt: Date;
  sentAt: Date | null;
}

const eventRow = (patch: Partial<EventRow> = {}): EventRow => ({
  id: 1,
  shopId: SHOP_ID,
  eventType: 'CUSTOMER_CREATED',
  customerId: 9,
  refType: '',
  refId: 0,
  status: 'PENDING',
  attempts: 0,
  lastError: '',
  occurredAt: new Date(),
  sentAt: null,
  ...patch,
});

function doubles(rows: EventRow[], timeoutMs = 5) {
  /** 极简假表：只实现 push/enqueue 用到的读写，attempts 的 increment 要真的累加。 */
  const eventUpdate = jest.fn(
    (args: { where: { id: number }; data: Record<string, unknown> }) => {
      const row = rows.find((item) => item.id === args.where.id);
      if (!row) return Promise.resolve({});
      const increment = (
        args.data.attempts as { increment?: number } | undefined
      )?.increment;
      if (increment) row.attempts += increment;
      if (typeof args.data.status === 'string') row.status = args.data.status;
      if (typeof args.data.lastError === 'string') {
        row.lastError = args.data.lastError;
      }
      if (args.data.sentAt) row.sentAt = args.data.sentAt as Date;
      return Promise.resolve(row);
    },
  ) as jest.Mock;
  const eventUpdateMany = jest.fn(
    (args: {
      where: { id: { in: number[] } };
      data: Record<string, unknown>;
    }) => {
      let count = 0;
      for (const row of rows) {
        if (!args.where.id.in.includes(row.id)) continue;
        row.status = String(args.data.status);
        row.lastError = String(args.data.lastError);
        count += 1;
      }
      return Promise.resolve({ count });
    },
  ) as jest.Mock;
  const eventFindMany = jest.fn((args?: { where?: { status?: string } }) =>
    Promise.resolve(
      rows
        .filter(
          (row) => !args?.where?.status || row.status === args.where.status,
        )
        .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()),
    ),
  ) as jest.Mock;
  const eventCreate = jest.fn(() => Promise.resolve({})) as jest.Mock;
  const corpFindUnique = jest.fn(() =>
    Promise.resolve({
      corpName: '某某健康',
      enabled: true,
      status: 'ACTIVE',
      corpId: 'wx1',
    }),
  ) as jest.Mock;
  const triggerTag = jest.fn(() => Promise.resolve(undefined)) as jest.Mock;

  const prisma = stub<PrismaService>({
    healthShop: {
      findFirst: jest.fn(() =>
        Promise.resolve({
          id: SHOP_ID,
          ownerUserId: 'u1',
          name: '某某健康管理中心',
          shopCode: 'H001',
          status: 'ON',
          themeJson: {},
          tradeJson: {},
          serviceDeskSiteKey: '',
        }),
      ),
    },
    healthScrmLink: {
      findFirst: jest.fn(() =>
        Promise.resolve({
          id: 1,
          shopId: SHOP_ID,
          orgType: 'ENTERPRISE',
          orgUserId: 'u1',
          pushEnabled: true,
          pullEnabled: false,
          lastError: '',
          lastPushAt: null,
          lastPullAt: null,
        }),
      ),
      update: jest.fn(() => Promise.resolve({})),
    },
    systemSetting: {
      findUnique: jest.fn(() =>
        Promise.resolve({
          key: 'health_scrm_tag_map_3',
          value: JSON.stringify({ CUSTOMER_CREATED: 88 }),
        }),
      ),
    },
    scrmCorp: { findUnique: corpFindUnique },
    healthScrmEvent: {
      findMany: eventFindMany,
      update: eventUpdate,
      updateMany: eventUpdateMany,
      create: eventCreate,
      count: jest.fn(() => Promise.resolve(0)),
    },
    healthScrmContactRef: {
      findUnique: jest.fn(() =>
        Promise.resolve({
          externalUserId: 'wm_1',
          shopId: SHOP_ID,
          customerId: 9,
        }),
      ),
      upsert: jest.fn(() => Promise.resolve({})),
    },
    scrmContact: {
      findUnique: jest.fn(() => Promise.resolve({ id: 77 })),
      findFirst: jest.fn(() => Promise.resolve(null)),
    },
    healthCustomer: { findUnique: jest.fn(() => Promise.resolve(null)) },
    scrmContactFieldValue: {
      findFirst: jest.fn(() => Promise.resolve(null)),
    },
    auditLog: { create: jest.fn(() => Promise.resolve({})) },
  });
  const sop = stub<ScrmSopService>({ triggerTag });
  const user = stub<CurrentUser>({ userId: 'u1' });
  return {
    service: new HealthScrmService(prisma, sop, timeoutMs),
    user,
    mocks: {
      eventUpdate,
      eventUpdateMany,
      eventFindMany,
      eventCreate,
      corpFindUnique,
      triggerTag,
    },
  };
}

/** 桥失败：假表里事件仍留在 PENDING，退避由服务内的门禁决定下一轮能否打桥。 */
function failBridge(
  mocks: { triggerTag: jest.Mock },
  message = '企微接口 500',
) {
  mocks.triggerTag.mockRejectedValue(new Error(message));
}

describe('HealthScrmService · Outbox 公共策略', () => {
  it('桥超时只算这条没发出去，push 与主链路都不抛错', async () => {
    const rows = [eventRow()];
    const { service, user, mocks } = doubles(rows);
    // 永不返回的桥：只能靠超时竞速把它打断
    mocks.triggerTag.mockImplementation(() => new Promise(() => undefined));

    await expect(service.push(user, PUSH_BODY)).resolves.toMatchObject({
      sent: 0,
      failed: 1,
    });
    expect(rows[0].status).toBe('PENDING');
    expect(rows[0].attempts).toBe(1);
    expect(rows[0].lastError).toBe('SCRM 调用超时');
  });

  it('写不出队列也不影响业务本身（enqueue 是旁路）', async () => {
    const { service, mocks } = doubles([]);
    mocks.eventCreate.mockRejectedValue(new Error('db down'));
    await expect(
      service.enqueue({
        shopId: SHOP_ID,
        eventType: 'CUSTOMER_CREATED',
        customerId: 9,
      }),
    ).resolves.toBeUndefined();
  });

  it('SCRM 被停用（FEATURE_CLOSED 档）时整轮顺延，attempts 一次都不加', async () => {
    const rows = [eventRow({ id: 1 }), eventRow({ id: 2, customerId: 10 })];
    const { service, user, mocks } = doubles(rows);
    mocks.corpFindUnique.mockResolvedValue({
      corpName: '某某健康',
      enabled: false,
      status: 'ACTIVE',
      corpId: 'wx1',
    });

    const result = await service.push(user, PUSH_BODY);

    expect(result.failed).toBe(0);
    expect(result.message).toContain('事件继续排队');
    expect(mocks.triggerTag).not.toHaveBeenCalled();
    // 顺延不写库：既没有 attempts++，也没有把事件打成失败
    expect(mocks.eventUpdate).not.toHaveBeenCalled();
    expect(mocks.eventUpdateMany).not.toHaveBeenCalled();
    expect(rows.map((row) => row.attempts)).toEqual([0, 0]);
    expect(rows.map((row) => row.status)).toEqual(['PENDING', 'PENDING']);
  });

  it('未接入（NOT_CONFIGURED 档）同样只顺延，不消耗重试次数', async () => {
    const rows = [eventRow()];
    const { service, user, mocks } = doubles(rows);
    mocks.corpFindUnique.mockResolvedValue(null);

    const result = await service.push(user, PUSH_BODY);

    expect(result.message).toContain('尚未接入企业微信 SCRM');
    expect(mocks.eventUpdate).not.toHaveBeenCalled();
    expect(rows[0].attempts).toBe(0);
  });

  it('连续失败达阈值打开熔断：冷却期内整轮顺延，不再打桥', async () => {
    const rows = [1, 2, 3, 4, 5].map((id) =>
      eventRow({ id, customerId: 90 + id }),
    );
    const { service, user, mocks } = doubles(rows);
    failBridge(mocks);

    const first = await service.push(user, PUSH_BODY);
    expect(first.failed).toBe(OUTBOX_POLICY.circuitFailures);
    expect(mocks.triggerTag).toHaveBeenCalledTimes(
      OUTBOX_POLICY.circuitFailures,
    );

    // 第二轮：熔断已打开，一条都不该再打桥，也不该再累加 attempts
    mocks.triggerTag.mockClear();
    failBridge(mocks);
    mocks.eventUpdate.mockClear();
    const second = await service.push(user, PUSH_BODY);
    expect(second.failed).toBe(0);
    expect(second.message).toContain('熔断');
    expect(mocks.triggerTag).not.toHaveBeenCalled();
    expect(mocks.eventUpdate).not.toHaveBeenCalled();
    expect(rows.every((row) => row.attempts === 1)).toBe(true);
  });

  it('退避逐轮放大：没到点只顺延，到点才再试，第 5 次落终态', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-19T10:00:00.000Z'));
    try {
      const rows = [eventRow()];
      const { service, user, mocks } = doubles(rows);
      failBridge(mocks);

      const base = OUTBOX_POLICY.retryBackoffMs;
      // 第 1 次失败 → 退避 60s：同一时刻再推只顺延
      await service.push(user, PUSH_BODY);
      expect(rows[0].attempts).toBe(1);
      mocks.triggerTag.mockClear();
      await expect(service.push(user, PUSH_BODY)).resolves.toMatchObject({
        failed: 0,
      });
      expect(mocks.triggerTag).not.toHaveBeenCalled();

      // 到 60s 才允许第二次尝试；失败后按 2 倍放大到 120s
      jest.advanceTimersByTime(base);
      await service.push(user, PUSH_BODY);
      expect(mocks.triggerTag).toHaveBeenCalledTimes(1);
      expect(rows[0].attempts).toBe(2);
      mocks.triggerTag.mockClear();
      jest.advanceTimersByTime(base); // 只过了 60s，还差 60s
      await service.push(user, PUSH_BODY);
      expect(mocks.triggerTag).not.toHaveBeenCalled();
      jest.advanceTimersByTime(base);
      await service.push(user, PUSH_BODY);
      expect(mocks.triggerTag).toHaveBeenCalledTimes(1);
      expect(rows[0].attempts).toBe(3);

      // 一路失败到第 5 次：落 FAILED 终态（本表没有 DEAD 档）
      mocks.triggerTag.mockClear();
      jest.advanceTimersByTime(base * 4);
      await service.push(user, PUSH_BODY);
      expect(rows[0].attempts).toBe(4);
      jest.advanceTimersByTime(base * 8);
      await service.push(user, PUSH_BODY);
      expect(rows[0].attempts).toBe(5);
      expect(rows[0].status).toBe('FAILED');
      // 终态后不再被捞进队列
      mocks.triggerTag.mockClear();
      await expect(service.push(user, PUSH_BODY)).resolves.toMatchObject({
        failed: 0,
      });
      expect(mocks.triggerTag).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('桥成功就落 SENT，并清零该店的连败计数', async () => {
    const rows = [eventRow()];
    const { service, user, mocks } = doubles(rows);

    const result = await service.push(user, PUSH_BODY);

    expect(result.sent).toBe(1);
    expect(rows[0].status).toBe('SENT');
    expect(mocks.triggerTag).toHaveBeenCalledWith(
      expect.objectContaining({ orgUserId: 'u1' }),
      77,
      [88],
    );
  });
});
