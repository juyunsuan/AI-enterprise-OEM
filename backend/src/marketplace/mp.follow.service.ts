import type { MpFollowShop, MpFollowState } from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import { iso } from './mp.shared';

/**
 * 店铺关注：只存「顾客 × 店铺」关系，店铺资料读时现查。
 *
 * 关注是私域复访的入口，不复制店铺名称/Logo 快照——店主改名后
 * 「我的关注」必须立刻跟着变，否则同名不同图会误导顾客。
 */
export class MpFollowService {
  constructor(private readonly prisma: PrismaService) {}

  async follow(
    marketId: number,
    customerId: number,
    shopId: number,
  ): Promise<MpFollowState> {
    const shop = await this.prisma.mpShop.findFirst({
      where: { id: shopId, marketId, status: 'ONLINE' },
      select: { id: true },
    });
    if (!shop) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '店铺不存在或已停业');
    }
    await this.prisma.mpCustomerFollow.upsert({
      where: { shopId_customerId: { shopId, customerId } },
      create: { marketId, shopId, customerId },
      update: {},
    });
    return this.state(marketId, customerId, shopId);
  }

  async unfollow(
    marketId: number,
    customerId: number,
    shopId: number,
  ): Promise<MpFollowState> {
    await this.prisma.mpCustomerFollow.deleteMany({
      where: { marketId, shopId, customerId },
    });
    return this.state(marketId, customerId, shopId);
  }

  async state(
    marketId: number,
    customerId: number,
    shopId: number,
  ): Promise<MpFollowState> {
    const [follow, followerCount] = await Promise.all([
      this.prisma.mpCustomerFollow.findUnique({
        where: { shopId_customerId: { shopId, customerId } },
        select: { id: true },
      }),
      this.prisma.mpCustomerFollow.count({ where: { marketId, shopId } }),
    ]);
    return { followed: Boolean(follow), followerCount };
  }

  async list(marketId: number, customerId: number): Promise<MpFollowShop[]> {
    const rows = await this.prisma.mpCustomerFollow.findMany({
      where: { marketId, customerId },
      orderBy: { id: 'desc' },
      take: 200,
    });
    if (rows.length === 0) return [];
    const shops = await this.prisma.mpShop.findMany({
      where: { id: { in: rows.map((row) => row.shopId) }, marketId },
    });
    const shopMap = new Map(shops.map((shop) => [shop.id, shop] as const));
    return rows.flatMap((row) => {
      const shop = shopMap.get(row.shopId);
      if (!shop) return [];
      return [
        {
          shopId: shop.id,
          name: shop.name,
          logo: shop.logo,
          shopCode: shop.shopCode,
          followedAt: iso(row.createdAt),
        },
      ];
    });
  }

  async followedShopIds(
    marketId: number,
    customerId: number,
    shopIds: number[],
  ): Promise<Set<number>> {
    if (shopIds.length === 0) return new Set();
    const rows = await this.prisma.mpCustomerFollow.findMany({
      where: { marketId, customerId, shopId: { in: shopIds } },
      select: { shopId: true },
    });
    return new Set(rows.map((row) => row.shopId));
  }
}
