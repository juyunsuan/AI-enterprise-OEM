import type { PrismaService } from '../prisma/prisma.service';
import type { ScrmBridge } from '../commerce-core/scrm-port';
import { BrandScrmService } from './brand.scrm.service';
import { stub } from '../../test/doubles';

/**
 * 松耦合的代码级保证点：交易主链路只写 outbox，SCRM 不可用时只顺延，
 * 匹配不到只跳过。这里逐条钉住，任何一条破掉都会变成「SCRM 挂了商城跟着挂」。
 */
const outboxRow = (patch: Record<string, unknown> = {}) => ({
  id: 1,
  shopId: 5,
  customerId: 9,
  eventKind: 'ORDER_PAID',
  payloadJson: { orderNo: 'A001', amountYuan: 88.5 },
  attempts: 0,
  nextAt: null,
  createdAt: new Date(),
  ...patch,
});

function doubles(rows: ReturnType<typeof outboxRow>[] = []) {
  const shopFindUnique = jest.fn(() => Promise.resolve(null)) as jest.Mock;
  const createMany = jest.fn(() => Promise.resolve({ count: 1 })) as jest.Mock;
  // 第一次取组织列表（distinct ownerUserId），之后取本组织的待发行
  const outboxFindMany = jest.fn((args?: { distinct?: string[] }) =>
    Promise.resolve(args?.distinct ? [{ ownerUserId: 'u1' }] : rows),
  ) as jest.Mock;
  const updateMany = jest.fn(() => Promise.resolve({ count: 0 })) as jest.Mock;
  const outboxUpdate = jest.fn(() => Promise.resolve({})) as jest.Mock;
  const bindingFindUnique = jest.fn(() => Promise.resolve(null)) as jest.Mock;
  const customerFindUnique = jest.fn(() => Promise.resolve(null)) as jest.Mock;

  const prisma = stub<PrismaService>({
    brandShop: {
      findUnique: shopFindUnique,
      findMany: jest.fn(async () => [{ id: 5, name: '小王家' }]),
    },
    brandScrmOutbox: {
      createMany,
      findMany: outboxFindMany,
      updateMany,
      update: outboxUpdate,
      count: jest.fn(async () => 0),
      findFirst: jest.fn(async () => null),
      groupBy: jest.fn(async () => []),
    },
    brandScrmBinding: {
      findUnique: bindingFindUnique,
      upsert: jest.fn(async () => ({})),
      groupBy: jest.fn(async () => []),
    },
    brandCustomer: { findUnique: customerFindUnique },
    scrmCorp: { findUnique: jest.fn(async () => ({ id: 7 })) },
  });
  const status = jest.fn(async () => ({ ok: true, reason: 'OK', hint: '' }));
  const appendTimeline = jest.fn(async () => undefined);
  const bridge = stub<ScrmBridge>({
    status,
    matchContact: jest.fn(async () => null),
    appendTimeline,
    pushFields: jest.fn(async () => ({ written: 0 })),
    readProfiles: jest.fn(async () => new Map()),
  });
  return {
    service: new BrandScrmService(prisma, bridge),
    mocks: {
      shopFindUnique,
      createMany,
      updateMany,
      outboxUpdate,
      bindingFindUnique,
      customerFindUnique,
      status,
      appendTimeline,
    },
  };
}

describe('BrandScrmService · 事件生产', () => {
  it('店铺没开 SCRM 时不产生任何外发行', async () => {
    const { service, mocks } = doubles();
    mocks.shopFindUnique.mockResolvedValue({
      scrmEnabled: false,
      name: '小王家',
      ownerUserId: 'u1',
    });

    await service.enqueue({
      shopId: 5,
      customerId: 9,
      kind: 'ORDER_PAID',
      recordKey: 1,
    });

    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it('开启后写一行且幂等键按店铺+事件+业务号生成', async () => {
    const { service, mocks } = doubles();
    mocks.shopFindUnique.mockResolvedValue({
      scrmEnabled: true,
      name: '小王家',
      ownerUserId: 'u1',
    });

    await service.enqueue({
      shopId: 5,
      customerId: 9,
      kind: 'ORDER_PAID',
      recordKey: 88,
      payload: { orderNo: 'A001' },
    });

    expect(mocks.createMany).toHaveBeenCalledWith({
      skipDuplicates: true,
      data: [
        {
          shopId: 5,
          customerId: 9,
          ownerUserId: 'u1',
          eventKind: 'ORDER_PAID',
          dedupeKey: 'brand:5:ORDER_PAID:88',
          payloadJson: { shopName: '小王家', orderNo: 'A001' },
        },
      ],
    });
  });

  it('写 outbox 抛错也不冒泡到交易主链路', async () => {
    const { service, mocks } = doubles();
    mocks.shopFindUnique.mockResolvedValue({
      scrmEnabled: true,
      name: '小王家',
      ownerUserId: 'u1',
    });
    mocks.createMany.mockRejectedValue(new Error('db down'));

    await expect(
      service.enqueue({
        shopId: 5,
        customerId: 9,
        kind: 'ORDER_PAID',
        recordKey: 1,
      }),
    ).resolves.toBeUndefined();
  });
});

describe('BrandScrmService · 投递', () => {
  it('SCRM 不可用时整轮顺延，且不消耗 attempts', async () => {
    const { service, mocks } = doubles([
      outboxRow({ id: 1 }),
      outboxRow({ id: 2 }),
    ]);
    mocks.status.mockResolvedValue({
      ok: false,
      reason: 'FEATURE_CLOSED',
      hint: '',
    });

    const result = await service.drain();

    expect(result.deferred).toBe(2);
    expect(result.sent).toBe(0);
    const update = mocks.updateMany.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(update.data).toHaveProperty('nextAt');
    expect(update.data).not.toHaveProperty('attempts');
    expect(mocks.outboxUpdate).not.toHaveBeenCalled();
    expect(mocks.appendTimeline).not.toHaveBeenCalled();
  });

  it('有绑定就直接用 contactId 写时间线，成功后落 SENT', async () => {
    const { service, mocks } = doubles([outboxRow()]);
    mocks.bindingFindUnique.mockResolvedValue({
      status: 'BOUND',
      contactId: 55,
      bindSource: 'MANUAL',
    });

    const result = await service.drain();

    expect(result.sent).toBe(1);
    expect(mocks.appendTimeline).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        contactId: 55,
        title: expect.stringContaining('订单付款'),
      }),
    );
    expect(mocks.outboxUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SENT', attempts: 1 }),
      }),
    );
  });

  it('匹配不到客户只记 SKIPPED，不新建企微客户也不判失败', async () => {
    const { service, mocks } = doubles([outboxRow()]);
    mocks.customerFindUnique.mockResolvedValue({
      id: 9,
      unionId: 'union-9',
      phone: '',
      nickname: '顾客',
    });

    const result = await service.drain();

    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
    expect(mocks.outboxUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SKIPPED',
          lastError: expect.stringContaining('match-miss'),
        }),
      }),
    );
  });

  it('桥调用失败按退避重排，回来仍失败到第 5 次才落 DEAD', async () => {
    const { service, mocks } = doubles([outboxRow({ attempts: 4 })]);
    mocks.bindingFindUnique.mockResolvedValue({
      status: 'BOUND',
      contactId: 55,
    });
    mocks.appendTimeline.mockRejectedValue(new Error('boom'));

    const result = await service.drain();

    expect(result.failed).toBe(1);
    expect(mocks.outboxUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DEAD', attempts: 5 }),
      }),
    );
  });

  it('冷却期内熔断整组织：只顺延，不把事件打成失败', async () => {
    const { service, mocks } = doubles([
      outboxRow({ id: 1, attempts: 4, nextAt: new Date(Date.now() + 300_000) }),
      outboxRow({ id: 2 }),
    ]);
    mocks.bindingFindUnique.mockResolvedValue({
      status: 'BOUND',
      contactId: 55,
    });

    const result = await service.drain();

    expect(result.deferred).toBe(2);
    expect(result.failed).toBe(0);
    expect(mocks.appendTimeline).not.toHaveBeenCalled();
  });
});
