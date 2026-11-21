import type { PrismaService } from '../prisma/prisma.service';
import { ToolLaunchMeterService } from './tool-launch.meter';
import { stub } from '../../test/doubles';

/**
 * 订单数快照的用例。
 *
 * 守两条性质：
 * 1) **set 语义**——同一 (站主, 工具, 日) 反复跑结果一致，不会像 increment 那样越跑越多；
 * 2) **归属正确**——订单表没有站主字段时（health/onsite/dh/marketplace），
 *    必须经父实体回查，错一个键就会把别人的订单记到本站主头上。
 */

type CountRow = Record<string, unknown> & { _count?: { _all?: number } };

function groupRows(rows: CountRow[]) {
  return { groupBy: async () => rows };
}

function parentRows(rows: CountRow[]) {
  return {
    findMany: async ({ where }: { where: { id: { in: number[] } } }) =>
      rows.filter((row) => where.id.in.includes(Number(row.id))),
  };
}

function setup(options: {
  brandOrders?: CountRow[];
  healthOrders?: CountRow[];
  mpShopOrders?: CountRow[];
  healthShops?: CountRow[];
  mpMarkets?: CountRow[];
}) {
  const upserts: { where: unknown; data: Record<string, unknown> }[] = [];
  const prisma = stub<PrismaService>({
    brandOrder: groupRows(options.brandOrders ?? []),
    cardShopOrder: groupRows([]),
    kuaidiOrder: groupRows([]),
    errandOrder: groupRows([]),
    knowledgePayOrder: groupRows([]),
    mpShopOrder: groupRows(options.mpShopOrders ?? []),
    healthOrder: groupRows(options.healthOrders ?? []),
    onsiteOrder: groupRows([]),
    digitalHumanOrder: groupRows([]),
    healthShop: parentRows(options.healthShops ?? []),
    mpMarket: parentRows(options.mpMarkets ?? []),
    digitalHumanSite: parentRows([]),
    onsiteShop: parentRows([]),
    toolUsageDaily: {
      upsert: async (args: {
        where: unknown;
        update: Record<string, unknown>;
        create: Record<string, unknown>;
      }) => {
        upserts.push({
          where: args.where,
          data: { ...args.create, ...args.update },
        });
        return args.create;
      },
    },
  });
  return { meter: new ToolLaunchMeterService(prisma), upserts };
}

const at = (day: number) =>
  new Date(`2026-11-${String(day).padStart(2, '0')}T09:00:00`);

describe('ToolLaunchMeterService.syncOrderSnapshot', () => {
  it('订单表自带站主：按站主聚合写入当日订单数', async () => {
    const { meter, upserts } = setup({
      brandOrders: [
        { ownerUserId: 'u1', _count: { _all: 4 } },
        { ownerUserId: 'u2', _count: { _all: 1 } },
      ],
    });
    const result = await meter.syncOrderSnapshot(at(18));
    const u1 = upserts.find(
      (row) =>
        (row.where as { userId_toolCode_day: { userId: string } })
          .userId_toolCode_day.userId === 'u1',
    );
    expect(u1?.data).toMatchObject({ toolCode: 'brand-mall', orders: 4 });
    expect(result.orders).toBeGreaterThanOrEqual(5);
  });

  it('订单表只有 shopId：经父实体回查站主，绝不记到别人头上', async () => {
    const { meter, upserts } = setup({
      healthOrders: [
        { shopId: 7, _count: { _all: 3 } },
        { shopId: 9, _count: { _all: 2 } },
      ],
      healthShops: [
        { id: 7, ownerUserId: 'ownerA' },
        { id: 9, ownerUserId: 'ownerB' },
      ],
    });
    await meter.syncOrderSnapshot(at(18));
    const map = new Map(
      upserts.map((row) => [
        (row.where as { userId_toolCode_day: { userId: string } })
          .userId_toolCode_day.userId,
        row.data.orders,
      ]),
    );
    expect(map.get('ownerA')).toBe(3);
    expect(map.get('ownerB')).toBe(2);
  });

  it('同一日重复跑是覆盖而不是累加（快照幂等）', async () => {
    const { meter, upserts } = setup({
      mpShopOrders: [{ marketId: 2, _count: { _all: 6 } }],
      mpMarkets: [{ id: 2, ownerUserId: 'ownerM' }],
    });
    await meter.syncOrderSnapshot(at(18));
    await meter.syncOrderSnapshot(at(18));
    expect(upserts).toHaveLength(4); // 今天 + 昨天 两个窗口 × 两轮
    expect(
      upserts.every(
        (row) =>
          (row.where as { userId_toolCode_day: { userId: string } })
            .userId_toolCode_day.userId === 'ownerM' && row.data.orders === 6,
      ),
    ).toBe(true);
  });

  it('零订单与空站主不落行，避免台账被无意义记录淹掉', async () => {
    const { meter, upserts } = setup({
      brandOrders: [
        { ownerUserId: 'u1', _count: { _all: 0 } },
        { ownerUserId: '', _count: { _all: 5 } },
      ],
    });
    await meter.syncOrderSnapshot(at(18));
    expect(upserts).toHaveLength(0);
  });

  it('groupBy 或父实体查询报错时静默跳过，计量失败绝不影响调度主流程', async () => {
    const prisma = stub<PrismaService>({
      brandOrder: {
        groupBy: async () => {
          throw new Error('库忙');
        },
      },
      cardShopOrder: groupRows([]),
      kuaidiOrder: groupRows([]),
      errandOrder: groupRows([]),
      knowledgePayOrder: groupRows([]),
      mpShopOrder: groupRows([]),
      healthOrder: groupRows([]),
      onsiteOrder: groupRows([]),
      digitalHumanOrder: groupRows([]),
      healthShop: parentRows([]),
      mpMarket: parentRows([]),
      onsiteShop: parentRows([]),
      digitalHumanSite: parentRows([]),
      toolUsageDaily: { upsert: async () => ({}) },
    });
    const meter = new ToolLaunchMeterService(prisma);
    await expect(meter.syncOrderSnapshot(at(18))).resolves.toMatchObject({
      orders: 0,
    });
  });
});
