import type {
  MpMarket,
  MpMarketCreateBody,
  MpMarketSaveBody,
  MpMarketStatusBody,
  MpOverview,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import type { MpMarket as MpMarketRow } from '../../generated/prisma';
import {
  iso,
  jsonObject,
  numberIn,
  themeColorOf,
  uniqueShopCode,
} from './mp.shared';

const WEEK_MS = 7 * 86400_000;

const DEFAULT_TRADE = { closeMinutes: 30 } as const;
const DEFAULT_SETTLE = { settleCycleDays: 7 } as const;

export type MpDeskSiteRef = {
  id: number;
  siteKey: string;
  name: string;
  enabled: boolean;
};

/** 客服站点由 service-desk 创建，商城只存 id；装配完成后再回填钩子避免循环依赖。 */
export type MpDeskSiteHook = {
  view(ownerUserId: string, id: number): Promise<MpDeskSiteRef | null>;
  ensure(ownerUserId: string, name: string): Promise<MpDeskSiteRef>;
};

/**
 * 市场实例：一个本站用户一个市场（`ownerUserId` 唯一）。
 * 市场是 B2B2C 的租户根，后面所有商户/店铺/类目读写都必须带 `marketId` 过滤。
 */
export class MpMarketService {
  deskSiteHook?: MpDeskSiteHook;

  constructor(private readonly prisma: PrismaService) {}

  find(ownerUserId: string) {
    return this.prisma.mpMarket.findUnique({ where: { ownerUserId } });
  }

  /** 市场绑定的客服站点：未绑定、被删或停用都返回 null，客服入口按「未开通」渲染。 */
  async deskSiteOf(market: {
    ownerUserId: string;
    supportSiteId: number;
  }): Promise<MpDeskSiteRef | null> {
    if (!this.deskSiteHook || market.supportSiteId <= 0) return null;
    return this.deskSiteHook.view(market.ownerUserId, market.supportSiteId);
  }

  /** 幂等确保市场有客服站点：已有且归属正确直接复用，被删后重建并回写 id。 */
  async ensureDeskSite(market: {
    id: number;
    ownerUserId: string;
    name: string;
    supportSiteId: number;
  }): Promise<MpDeskSiteRef | null> {
    if (!this.deskSiteHook) return null;
    const current = await this.deskSiteOf(market);
    if (current) return current;
    const site = await this.deskSiteHook.ensure(
      market.ownerUserId,
      market.name,
    );
    await this.prisma.mpMarket.update({
      where: { id: market.id },
      data: { supportSiteId: site.id },
    });
    return site;
  }

  async require(ownerUserId: string): Promise<MpMarketRow> {
    const market = await this.find(ownerUserId);
    if (!market) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '还没有创建多店铺商城平台，请先在概览页创建市场',
      );
    }
    return market;
  }

  async overview(ownerUserId: string): Promise<MpOverview> {
    const market = await this.find(ownerUserId);
    if (!market) {
      return {
        merchantTotal: 0,
        pendingMerchantTotal: 0,
        shopTotal: 0,
        onlineShopTotal: 0,
        categoryTotal: 0,
        weekMerchantTotal: 0,
      };
    }
    const since = new Date(Date.now() - WEEK_MS);
    const [
      merchantTotal,
      pendingMerchantTotal,
      shopTotal,
      onlineShopTotal,
      categoryTotal,
      weekMerchantTotal,
    ] = await Promise.all([
      this.prisma.mpMerchant.count({ where: { marketId: market.id } }),
      this.prisma.mpMerchant.count({
        where: { marketId: market.id, auditStatus: 'PENDING' },
      }),
      this.prisma.mpShop.count({ where: { marketId: market.id } }),
      this.prisma.mpShop.count({
        where: { marketId: market.id, status: 'ONLINE' },
      }),
      this.prisma.mpCategory.count({ where: { marketId: market.id } }),
      this.prisma.mpMerchant.count({
        where: { marketId: market.id, createdAt: { gte: since } },
      }),
    ]);
    return {
      merchantTotal,
      pendingMerchantTotal,
      shopTotal,
      onlineShopTotal,
      categoryTotal,
      weekMerchantTotal,
    };
  }

  async detail(ownerUserId: string): Promise<MpMarket | null> {
    const market = await this.find(ownerUserId);
    return market ? this.view(market) : null;
  }

  async view(market: MpMarketRow): Promise<MpMarket> {
    const [merchantTotal, pendingMerchantTotal, shopTotal, categoryTotal] =
      await Promise.all([
        this.prisma.mpMerchant.count({ where: { marketId: market.id } }),
        this.prisma.mpMerchant.count({
          where: { marketId: market.id, auditStatus: 'PENDING' },
        }),
        this.prisma.mpShop.count({ where: { marketId: market.id } }),
        this.prisma.mpCategory.count({ where: { marketId: market.id } }),
      ]);
    const trade = jsonObject(market.tradeJson);
    const settle = jsonObject(market.settleJson);
    return {
      id: market.id,
      shopCode: market.shopCode,
      name: market.name,
      logo: market.logo,
      description: market.description,
      themeColor: themeColorOf(market.themeJson),
      closeMinutes: numberIn(
        trade.closeMinutes,
        DEFAULT_TRADE.closeMinutes,
        5,
        1440,
      ),
      settleCycleDays: numberIn(
        settle.settleCycleDays,
        DEFAULT_SETTLE.settleCycleDays,
        1,
        90,
      ),
      status: market.status as MpMarket['status'],
      offReason: market.offReason,
      merchantTotal,
      pendingMerchantTotal,
      shopTotal,
      categoryTotal,
      createdAt: iso(market.createdAt),
      updatedAt: iso(market.updatedAt),
    };
  }

  async create(
    ownerUserId: string,
    body: MpMarketCreateBody,
  ): Promise<MpMarket> {
    const existing = await this.find(ownerUserId);
    if (existing) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '已创建过多店铺商城平台，一个账号只能运营一个市场',
      );
    }
    const shopCode = await uniqueShopCode(this.prisma, 'market');
    const market = await this.prisma.mpMarket.create({
      data: {
        ownerUserId,
        shopCode,
        name: body.name,
        logo: body.logo,
        description: body.description,
        themeJson: { themeColor: body.themeColor },
        tradeJson: { ...DEFAULT_TRADE },
        settleJson: { ...DEFAULT_SETTLE },
        status: 'DRAFT',
      },
    });
    // 客服用客服底座自己建的站点，开通失败不影响建市场（出包页会再尝试一次）
    await this.ensureDeskSite(market).catch(() => null);
    return this.view(market);
  }

  async save(ownerUserId: string, body: MpMarketSaveBody): Promise<MpMarket> {
    const market = await this.require(ownerUserId);
    const updated = await this.prisma.mpMarket.update({
      where: { id: market.id },
      data: {
        name: body.name,
        logo: body.logo,
        description: body.description,
        themeJson: {
          ...jsonObject(market.themeJson),
          themeColor: body.themeColor,
        },
        tradeJson: {
          ...jsonObject(market.tradeJson),
          closeMinutes: body.closeMinutes,
        },
        settleJson: {
          ...jsonObject(market.settleJson),
          settleCycleDays: body.settleCycleDays,
        },
      },
    });
    return this.view(updated);
  }

  async setStatus(
    ownerUserId: string,
    body: MpMarketStatusBody,
  ): Promise<MpMarket> {
    const market = await this.require(ownerUserId);
    if (market.status === 'SUSPENDED') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '市场已被平台停服，恢复营业需联系平台管理员',
      );
    }
    const updated = await this.prisma.mpMarket.update({
      where: { id: market.id },
      data: {
        status: body.status,
        offReason: body.status === 'ONLINE' ? '' : market.offReason,
      },
    });
    return this.view(updated);
  }
}
