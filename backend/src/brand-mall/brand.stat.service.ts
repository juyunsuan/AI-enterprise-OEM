import type {
  BrandStatOverview,
  BrandStatProduct,
  BrandStatTrendPoint,
} from '@enterprise/contracts';
import { LIST_ALL_LIMIT } from '../common/api';
import type { CurrentUser } from '../auth/current-user';
import type { IdentityService } from '../identity/identity.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { BrandPlatformService } from './brand.platform.service';
import { amount, shopStatus } from './brand.shared';

const dayStart = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const dayKey = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/**
 * 经营看板。按天聚合在内存里分桶：跨库不用 `DATE()` / `to_char()` 这类方言函数，
 * 单店订单量在这个量级下扫得住，将来大了再上物化统计。
 */
export class BrandStatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
    private readonly platform: BrandPlatformService,
  ) {}

  async overview(
    user: CurrentUser,
    shopId: number,
  ): Promise<BrandStatOverview> {
    const today = dayStart(new Date());
    const [
      todayOrders,
      todayPaid,
      todayCustomers,
      pendingShip,
      pendingPayment,
      pendingRefund,
      onlineProducts,
      totalCustomers,
      totalOrders,
      amountAgg,
      paidOrders,
    ] = await Promise.all([
      this.prisma.brandOrder.count({
        where: { shopId, createdAt: { gte: today } },
      }),
      this.prisma.brandOrder.aggregate({
        where: {
          shopId,
          createdAt: { gte: today },
          payStatus: { in: ['PAID', 'REFUNDING'] },
        },
        _sum: { payAmount: true },
      }),
      this.prisma.brandCustomer.count({
        where: { shopId, createdAt: { gte: today } },
      }),
      this.prisma.brandOrder.count({ where: { shopId, status: 'PAID' } }),
      this.prisma.brandOrder.count({
        where: { shopId, status: 'PENDING_PAYMENT' },
      }),
      this.prisma.brandRefundOrder.count({
        where: { shopId, status: 'PENDING' },
      }),
      this.prisma.brandProduct.count({ where: { shopId, status: 'ONLINE' } }),
      this.prisma.brandCustomer.count({ where: { shopId } }),
      this.prisma.brandOrder.count({ where: { shopId } }),
      this.prisma.brandOrder.aggregate({
        where: { shopId, payStatus: { in: ['PAID', 'REFUNDING'] } },
        _sum: { payAmount: true },
      }),
      this.prisma.brandOrder.count({ where: { shopId, payStatus: 'PAID' } }),
    ]);
    void user;
    return {
      todayOrderCount: todayOrders,
      todayOrderAmount: amount(todayPaid._sum.payAmount),
      todayCustomerCount: todayCustomers,
      pendingShipCount: pendingShip,
      pendingPaymentCount: pendingPayment,
      pendingRefundCount: pendingRefund,
      onlineProductCount: onlineProducts,
      totalCustomerCount: totalCustomers,
      totalOrderCount: totalOrders,
      totalOrderAmount: amount(amountAgg._sum.payAmount),
      payConversionPercent:
        totalOrders > 0
          ? Math.round((paidOrders / totalOrders) * 10_000) / 100
          : 0,
    };
  }

  async trend(
    user: CurrentUser,
    shopId: number,
    days: number,
  ): Promise<BrandStatTrendPoint[]> {
    void user;
    const span = Math.min(90, Math.max(7, Math.round(days || 30)));
    const from = dayStart(new Date());
    from.setDate(from.getDate() - (span - 1));
    const [orders, customers] = await Promise.all([
      this.prisma.brandOrder.findMany({
        where: { shopId, createdAt: { gte: from } },
        select: { createdAt: true, payStatus: true, payAmount: true },
        take: 20_000,
      }),
      this.prisma.brandCustomer.findMany({
        where: { shopId, createdAt: { gte: from } },
        select: { createdAt: true },
        take: 20_000,
      }),
    ]);
    const buckets = new Map<string, BrandStatTrendPoint>();
    for (let offset = 0; offset < span; offset += 1) {
      const cursor = new Date(from);
      cursor.setDate(from.getDate() + offset);
      buckets.set(dayKey(cursor), {
        date: dayKey(cursor),
        orderCount: 0,
        orderAmount: 0,
        customerCount: 0,
      });
    }
    for (const row of orders) {
      const bucket = buckets.get(dayKey(row.createdAt));
      if (!bucket) continue;
      bucket.orderCount += 1;
      if (row.payStatus === 'PAID' || row.payStatus === 'REFUNDING') {
        bucket.orderAmount =
          Math.round((bucket.orderAmount + amount(row.payAmount)) * 100) / 100;
      }
    }
    for (const row of customers) {
      const bucket = buckets.get(dayKey(row.createdAt));
      if (bucket) bucket.customerCount += 1;
    }
    return [...buckets.values()];
  }

  async topProducts(
    user: CurrentUser,
    shopId: number,
    limit: number,
  ): Promise<BrandStatProduct[]> {
    void user;
    const rows = await this.prisma.brandProduct.findMany({
      where: { shopId, sales: { gt: 0 } },
      orderBy: [{ sales: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        title: true,
        coverImage: true,
        sales: true,
        price: true,
      },
      take: Math.min(20, Math.max(1, Math.round(limit || 10))),
    });
    return rows.map((row) => ({
      productId: row.id,
      title: row.title,
      coverImage: row.coverImage,
      sales: row.sales,
      amount: Math.round(amount(row.price) * row.sales * 100) / 100,
    }));
  }

  /** 平台侧总览：跨店铺量级，只给平台管理员。 */
  async adminOverview(user: CurrentUser) {
    this.identity.requireAdmin(user);
    const [
      shopTotal,
      onlineShopTotal,
      suspendedShopTotal,
      productTotal,
      orderTotal,
      orderAgg,
      customerTotal,
    ] = await Promise.all([
      this.prisma.brandShop.count({ where: { status: { not: 'CLOSED' } } }),
      this.prisma.brandShop.count({ where: { status: 'ONLINE' } }),
      this.prisma.brandShop.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.brandProduct.count(),
      this.prisma.brandOrder.count(),
      this.prisma.brandOrder.aggregate({
        where: { payStatus: { in: ['PAID', 'REFUNDING'] } },
        _sum: { payAmount: true },
      }),
      this.prisma.brandCustomer.count(),
    ]);
    return {
      shopTotal,
      onlineShopTotal,
      suspendedShopTotal,
      productTotal,
      orderTotal,
      orderAmountTotal: amount(orderAgg._sum.payAmount),
      customerTotal,
    };
  }

  /** 平台侧台账列表：所有店铺一行，带店主义名与量级。 */
  async adminShops(
    user: CurrentUser,
    query: {
      page?: number;
      pageSize?: number;
      keyword?: string;
      status?: string;
      payFilter?: string;
    },
  ) {
    this.identity.requireAdmin(user);
    const page = Math.max(1, Math.round(Number(query.page || 1)));
    const pageSize = Math.min(
      200,
      Math.max(1, Math.round(Number(query.pageSize || 20))),
    );
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    const keyword = String(query.keyword || '').trim();
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { shopCode: { contains: keyword.toUpperCase() } },
        { ownerUserId: { contains: keyword } },
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.brandShop.count({ where }),
      this.prisma.brandShop.findMany({
        where,
        orderBy: [{ id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    // userId 就是 accounts.id 的字符串形态（与 geo-site 台账同一口径）
    const accountIds = [
      ...new Set(
        rows
          .map((row) => Number(row.ownerUserId))
          .filter((value) => Number.isInteger(value) && value > 0),
      ),
    ].slice(0, LIST_ALL_LIMIT);
    const accounts = accountIds.length
      ? await this.prisma.account.findMany({
          where: { id: { in: accountIds } },
          select: { id: true, username: true },
        })
      : [];
    const nameMap = new Map(
      accounts.map((item) => [String(item.id), item.username]),
    );
    const shopIds = rows.map((row) => row.id);
    const [productCounts, customerCounts, orderCounts, apps] =
      await Promise.all([
        this.prisma.brandProduct.groupBy({
          by: ['shopId'],
          where: { shopId: { in: shopIds } },
          _count: { _all: true },
        }),
        this.prisma.brandCustomer.groupBy({
          by: ['shopId'],
          where: { shopId: { in: shopIds } },
          _count: { _all: true },
        }),
        this.prisma.brandOrder.groupBy({
          by: ['shopId'],
          where: { shopId: { in: shopIds } },
          _count: { _all: true },
          _sum: { payAmount: true },
        }),
        this.prisma.miniProgramApp.findMany({
          where: { scene: 'BRAND', shopId: { in: shopIds } },
          select: { shopId: true, appId: true, mchId: true, payEnabled: true },
        }),
      ]);
    const productMap = new Map(
      productCounts.map((row) => [row.shopId, row._count._all]),
    );
    const customerMap = new Map(
      customerCounts.map((row) => [row.shopId, row._count._all]),
    );
    const orderMap = new Map(orderCounts.map((row) => [row.shopId, row]));
    const appMap = new Map(apps.map((row) => [row.shopId, row]));

    const list = rows
      .map((row) => {
        const app = appMap.get(row.id);
        const order = orderMap.get(row.id);
        return {
          id: row.id,
          name: row.name,
          shopCode: row.shopCode,
          logo: row.logo,
          status: shopStatus(row.status),
          ownerUserId: row.ownerUserId,
          ownerName: nameMap.get(row.ownerUserId) || row.ownerUserId,
          appId: app?.appId || '',
          payEnabled: Number(app?.payEnabled || 0) === 1 && Boolean(app?.mchId),
          productCount: productMap.get(row.id) || 0,
          customerCount: customerMap.get(row.id) || 0,
          orderCount: order?._count._all || 0,
          orderAmount: amount(order?._sum.payAmount),
          offReason: row.offReason,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        };
      })
      .filter((row) =>
        query.payFilter === 'ENABLED'
          ? row.payEnabled
          : query.payFilter === 'DISABLED'
            ? !row.payEnabled
            : true,
      );
    return { list, total, page, pageSize };
  }

  /** 平台停服/恢复：数据全留，只把店铺挡在营业状态外。 */
  async suspend(user: CurrentUser, shopId: number, reason: string) {
    this.identity.requireAdmin(user);
    const row = await this.prisma.brandShop.findUnique({
      where: { id: shopId },
    });
    if (!row) {
      return { ok: false, message: '店铺不存在' };
    }
    await this.prisma.brandShop.update({
      where: { id: shopId },
      data: {
        status: 'SUSPENDED',
        offBy: String(user.userId),
        offReason: reason.slice(0, 500),
      },
    });
    return { ok: true, message: `已停服「${row.name}」，顾客端将提示暂停营业` };
  }

  async resume(user: CurrentUser, shopId: number) {
    this.identity.requireAdmin(user);
    const row = await this.prisma.brandShop.findUnique({
      where: { id: shopId },
    });
    if (!row) {
      return { ok: false, message: '店铺不存在' };
    }
    await this.prisma.brandShop.update({
      where: { id: shopId },
      data: { status: 'ONLINE', offBy: '', offReason: '' },
    });
    return { ok: true, message: `已恢复「${row.name}」营业` };
  }

  async adminSettings(user: CurrentUser) {
    this.identity.requireAdmin(user);
    return this.platform.settings();
  }
}
