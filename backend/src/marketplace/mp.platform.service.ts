import type {
  MpAdminMarketRow,
  MpAdminMarketStatusBody,
} from '@enterprise/contracts';
import { pageParam } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import { iso } from './mp.shared';

/**
 * 平台管理员侧台账：跨市场只读概览 + 停服/恢复。
 * 平台管理员不代运营方改商户数据（那是运营方与商户的合同关系），只做板块级治理。
 */
export class MpPlatformService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const [
      marketTotal,
      onlineMarketTotal,
      merchantTotal,
      pendingMerchantTotal,
      shopTotal,
    ] = await Promise.all([
      this.prisma.mpMarket.count(),
      this.prisma.mpMarket.count({ where: { status: 'ONLINE' } }),
      this.prisma.mpMerchant.count(),
      this.prisma.mpMerchant.count({ where: { auditStatus: 'PENDING' } }),
      this.prisma.mpShop.count(),
    ]);
    return {
      marketTotal,
      onlineMarketTotal,
      merchantTotal,
      pendingMerchantTotal,
      shopTotal,
    };
  }

  async markets(query: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    status?: string;
  }): Promise<{
    list: MpAdminMarketRow[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const { page, pageSize, offset } = pageParam(query.page, query.pageSize);
    const keyword = String(query.keyword || '').trim();
    const where = {
      ...(query.status ? { status: String(query.status) } : {}),
      ...(keyword
        ? {
            OR: [
              { name: { contains: keyword } },
              { shopCode: { contains: keyword } },
              { ownerUserId: { contains: keyword } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.mpMarket.count({ where }),
      this.prisma.mpMarket.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
    ]);
    const ids = rows.map((row) => row.id);
    const [merchantCounts, shopCounts, owners] = await Promise.all([
      ids.length
        ? this.prisma.mpMerchant.groupBy({
            by: ['marketId'],
            where: { marketId: { in: ids } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      ids.length
        ? this.prisma.mpShop.groupBy({
            by: ['marketId'],
            where: { marketId: { in: ids } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      this.prisma.account.findMany({
        where: {
          id: {
            in: rows
              .map((row) => Number(row.ownerUserId))
              .filter(Number.isInteger),
          },
        },
        select: { id: true, username: true },
      }),
    ]);
    const merchantMap = new Map(
      merchantCounts.map((row) => [row.marketId, row._count._all] as const),
    );
    const shopMap = new Map(
      shopCounts.map((row) => [row.marketId, row._count._all] as const),
    );
    const ownerMap = new Map(
      owners.map((row) => [String(row.id), row.username] as const),
    );
    return {
      list: rows.map((row) => ({
        id: row.id,
        ownerUserId: row.ownerUserId,
        ownerName: ownerMap.get(row.ownerUserId) ?? '',
        shopCode: row.shopCode,
        name: row.name,
        status: row.status as MpAdminMarketRow['status'],
        merchantTotal: merchantMap.get(row.id) ?? 0,
        shopTotal: shopMap.get(row.id) ?? 0,
        offReason: row.offReason,
        createdAt: iso(row.createdAt),
      })),
      total,
      page,
      pageSize,
    };
  }

  async setStatus(body: MpAdminMarketStatusBody): Promise<MpAdminMarketRow> {
    const market = await this.prisma.mpMarket.findUnique({
      where: { id: body.id },
    });
    if (!market) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '市场不存在');
    }
    const updated = await this.prisma.mpMarket.update({
      where: { id: market.id },
      data: {
        status: body.status,
        offReason:
          body.status === 'SUSPENDED'
            ? body.reason || '平台停服'
            : body.status === 'ONLINE'
              ? ''
              : market.offReason,
      },
    });
    const [merchantTotal, shopTotal, owner] = await Promise.all([
      this.prisma.mpMerchant.count({ where: { marketId: market.id } }),
      this.prisma.mpShop.count({ where: { marketId: market.id } }),
      this.prisma.account.findUnique({
        where: { id: Number(market.ownerUserId) },
        select: { username: true },
      }),
    ]);
    return {
      id: updated.id,
      ownerUserId: updated.ownerUserId,
      ownerName: owner?.username ?? '',
      shopCode: updated.shopCode,
      name: updated.name,
      status: updated.status as MpAdminMarketRow['status'],
      merchantTotal,
      shopTotal,
      offReason: updated.offReason,
      createdAt: iso(updated.createdAt),
    };
  }
}
