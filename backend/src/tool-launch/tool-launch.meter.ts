import type { PrismaService } from '../prisma/prisma.service';
import type { ToolCode } from './tool-launch.catalog';

/**
 * 计量落库：一行一个「站主 + 工具 + 自然日」，PV / 响应流量 / 订单数都记在这一行。
 *
 * 只计量不出账：真正扣费时才写 `usage_events`（见 `tool-launch.settle.ts`）。
 * 「本工具本日用了多少」必须只有一个事实源，否则计量表和事件表两处数字将来要对账。
 * 访问与流量是按量出账前必须的观察数据；订单数为「按订单数计额度」预留——
 * 交易型订单的资金不经平台，所以这一列只做看板与额度，永不直接扣积分。
 *
 * 计数失败绝不能打断顾客的浏览与下单，因此本类吞掉一切异常。
 */
export type ToolCounters = {
  pv?: number;
  /** 帖子详情浏览量（去重后由业务侧上报），按浏览量口径出账时使用。 */
  views?: number;
  bytes?: number;
  orders?: number;
};

type CountRow = Record<string, unknown> & { _count?: { _all?: number } };

/** 聚合行里的归属键只可能是字符串或数字；别把对象 `String()` 成 [object Object] 当成站主。 */
function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

/** groupBy/findMany 的模型名是运行期拼出来的，这里只声明本类真正用到的那一小片接口。 */
type GroupByDelegate = {
  groupBy: (args: {
    by: string[];
    where: Record<string, unknown>;
    _count: { _all: boolean };
  }) => Promise<CountRow[]>;
};
type ParentDelegate = {
  findMany: (args: {
    where: Record<string, unknown>;
    select: Record<string, boolean>;
  }) => Promise<CountRow[]>;
};

/** 订单数快照的取数来源：订单表自带站主字段就直取，只有 shopId/siteId/marketId 时回查父实体。 */
type OrderSource = {
  code: ToolCode;
  model:
    | 'brandOrder'
    | 'cardShopOrder'
    | 'kuaidiOrder'
    | 'knowledgePayOrder'
    | 'mpShopOrder'
    | 'healthOrder'
    | 'onsiteOrder'
    | 'digitalHumanOrder'
    | 'errandOrder';
  ownerField?: 'ownerUserId' | 'userId';
  via?: {
    key: 'shopId' | 'siteId' | 'marketId';
    parent: 'mpMarket' | 'healthShop' | 'onsiteShop' | 'digitalHumanSite';
    ownerField: 'ownerUserId' | 'userId';
  };
};

const ORDER_SOURCES: OrderSource[] = [
  { code: 'brand-mall', model: 'brandOrder', ownerField: 'ownerUserId' },
  { code: 'card-shop', model: 'cardShopOrder', ownerField: 'ownerUserId' },
  { code: 'kuaidi', model: 'kuaidiOrder', ownerField: 'ownerUserId' },
  { code: 'errand', model: 'errandOrder', ownerField: 'ownerUserId' },
  { code: 'knowledge-pay', model: 'knowledgePayOrder', ownerField: 'userId' },
  // 多店铺平台按「商户子单」计：一次跨店下单会形成多份履约工作量
  {
    code: 'marketplace',
    model: 'mpShopOrder',
    via: { key: 'marketId', parent: 'mpMarket', ownerField: 'ownerUserId' },
  },
  {
    code: 'health',
    model: 'healthOrder',
    via: { key: 'shopId', parent: 'healthShop', ownerField: 'ownerUserId' },
  },
  {
    code: 'onsite',
    model: 'onsiteOrder',
    via: { key: 'shopId', parent: 'onsiteShop', ownerField: 'ownerUserId' },
  },
  {
    code: 'digital-human',
    model: 'digitalHumanOrder',
    via: { key: 'siteId', parent: 'digitalHumanSite', ownerField: 'userId' },
  },
];

export class ToolLaunchMeterService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    code: ToolCode,
    userId: string,
    counters: ToolCounters = {},
  ): Promise<void> {
    if (!userId) return;
    const pv = Math.max(0, Math.floor(counters.pv ?? 0));
    const views = Math.max(0, Math.floor(counters.views ?? 0));
    const orders = Math.max(0, Math.floor(counters.orders ?? 0));
    const bytes = BigInt(Math.max(0, Math.floor(counters.bytes ?? 0)));
    if (!pv && !views && !orders && bytes === BigInt(0)) return;
    const now = new Date();
    // 按「本站本地日历日」归行：直接塞本地零点会被 Prisma 按 UTC 序列化，跨时区少一天
    const day = new Date(
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
    );
    try {
      await this.prisma.toolUsageDaily.upsert({
        where: { userId_toolCode_day: { userId, toolCode: code, day } },
        update: {
          pv: { increment: pv },
          views: { increment: views },
          bytes: { increment: bytes },
          orders: { increment: orders },
        },
        create: { userId, toolCode: code, day, pv, views, bytes, orders },
      });
    } catch {
      // 旁路计量：库忙、竞态、溢出都不回滚业务
    }
  }

  /** 请求侧：一次访问 +1，响应字节一并累计。 */
  hit(code: ToolCode, userId: string, bytes = 0): Promise<void> {
    return this.record(code, userId, { pv: 1, bytes });
  }

  /** 内容侧：一次去重后的内容浏览 +1（不重复计 PV）。 */
  view(code: ToolCode, userId: string): Promise<void> {
    return this.record(code, userId, { views: 1 });
  }

  /**
   * 订单数快照：按（站主, 工具, 自然日）**重算并覆盖**，而不是在下单热路径里逐条累加。
   *
   * 为什么不埋点在 8 个域的下单事务里：那等于给每条订单链路加一行与业务无关的写，
   * 还会在同一 (站主, 日) 行上制造锁竞争；快照式聚合天然幂等（set 而非 increment），
   * 跑几次都是同一个数，也和存储计量 `snapshotStorage()` 的既有范式一致。
   * 每天同步「今天 + 昨天」两个窗口，跨零点不漏账；历史回填按需另跑。
   */
  async syncOrderSnapshot(
    now = new Date(),
  ): Promise<{ rows: number; orders: number }> {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const windows = [from, new Date(from.getTime() - 86400_000)];
    let rows = 0;
    let orders = 0;
    for (const start of windows) {
      const end = new Date(start.getTime() + 86400_000);
      for (const source of ORDER_SOURCES) {
        const counts = await this.countByOwner(source, start, end);
        for (const [ownerUserId, count] of counts) {
          if (!ownerUserId || count <= 0) continue;
          await this.setOrders(source.code, ownerUserId, start, count);
          rows += 1;
          orders += count;
        }
      }
    }
    return { rows, orders };
  }

  private async countByOwner(
    source: OrderSource,
    from: Date,
    to: Date,
  ): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    const where = { createdAt: { gte: from, lt: to } };
    if (source.ownerField) {
      const rows = await this.groupBy(source.model, [source.ownerField], where);
      for (const row of rows) {
        const owner = textOf(row[source.ownerField]);
        out.set(owner, (out.get(owner) ?? 0) + Number(row._count?._all ?? 0));
      }
      return out;
    }
    // 订单表只有 shopId/siteId/marketId：先按中间键聚合，再一次查回站主
    const key = source.via!.key;
    const rows = await this.groupBy(source.model, [key], where);
    const ids = rows
      .map((row) => Number(row[key]))
      .filter((id) => Number.isFinite(id) && id > 0);
    if (!ids.length) return out;
    const parentDelegate = this.prisma[
      source.via!.parent
    ] as unknown as ParentDelegate;
    const parents = await parentDelegate
      .findMany({
        where: { id: { in: ids } },
        select: { id: true, [source.via!.ownerField]: true },
      })
      .catch(() => [] as CountRow[]);
    const ownerByKey = new Map(
      parents.map((row) => [
        Number(row.id),
        textOf(row[source.via!.ownerField]),
      ]),
    );
    for (const row of rows) {
      const owner = ownerByKey.get(Number(row[key])) ?? '';
      out.set(owner, (out.get(owner) ?? 0) + Number(row._count?._all ?? 0));
    }
    return out;
  }

  private groupBy(
    model: OrderSource['model'],
    by: string[],
    where: Record<string, unknown>,
  ): Promise<CountRow[]> {
    const delegate = this.prisma[model] as unknown as GroupByDelegate;
    return delegate
      .groupBy({ by, where, _count: { _all: true } })
      .catch(() => [] as CountRow[]);
  }

  private async setOrders(
    code: ToolCode,
    userId: string,
    day: Date,
    count: number,
  ): Promise<void> {
    const key = new Date(
      Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()),
    );
    try {
      await this.prisma.toolUsageDaily.upsert({
        where: { userId_toolCode_day: { userId, toolCode: code, day: key } },
        update: { orders: count },
        create: {
          userId,
          toolCode: code,
          day: key,
          pv: 0,
          bytes: BigInt(0),
          orders: count,
        },
      });
    } catch {
      // 快照失败下一轮自愈：计数不进账本，不值得为它抛错
    }
  }
}
