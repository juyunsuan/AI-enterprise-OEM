import {
  TAKEOUT_SHOP_STATUSES,
  type TakeoutShop,
  type TakeoutShopCreateBody,
  type TakeoutShopStatus,
  type TakeoutShopTradeBody,
  type TakeoutShopUpdateBody,
  type TakeoutTrade,
  type TakeoutConfig,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import {
  TAKEOUT_SCENE,
  clip,
  iso,
  normalizeConfig,
  normalizeTrade,
  shopStatus,
  takeoutShopCode,
} from './takeout.shared';

type ShopRow = {
  id: number;
  ownerUserId: string;
  name: string;
  shopCode: string;
  logo: string;
  slogan: string;
  servicePhone: string;
  themeColor: string;
  status: string;
  tradeJson: unknown;
  takeoutJson: unknown;
  scrmEnabled: boolean;
  supportSiteId: number;
  offReason: string;
  createdAt: Date;
};

export type TakeoutDeskSiteRef = {
  id: number;
  siteKey: string;
  name: string;
  enabled: boolean;
};

/** AI 客服站点钩子：与品牌商城同一套 service-desk，站点按外卖门店自动开通。 */
export type TakeoutDeskSiteHook = {
  view(ownerUserId: string, id: number): Promise<TakeoutDeskSiteRef | null>;
  ensure(ownerUserId: string, name: string): Promise<TakeoutDeskSiteRef>;
};

export type TakeoutShopView = ShopRow & {
  trade: TakeoutTrade;
  takeout: TakeoutConfig;
};

/**
 * 外卖门店服务：所有读写都以 `ownerUserId` 命中，未命中按不存在处理，
 * 不暴露「别人的门店存在」。公开通道只按 shopCode 取店，不回任何凭据。
 */
export class TakeoutShopService {
  deskSiteHook?: TakeoutDeskSiteHook;

  constructor(private readonly prisma: PrismaService) {}

  async deskSiteOf(shop: {
    ownerUserId: string;
    supportSiteId: number;
  }): Promise<TakeoutDeskSiteRef | null> {
    if (!this.deskSiteHook || shop.supportSiteId <= 0) return null;
    return this.deskSiteHook.view(shop.ownerUserId, shop.supportSiteId);
  }

  async ensureDeskSite(shop: {
    id: number;
    ownerUserId: string;
    name: string;
    supportSiteId: number;
  }): Promise<TakeoutDeskSiteRef | null> {
    if (!this.deskSiteHook) return null;
    const current = await this.deskSiteOf(shop);
    if (current) return current;
    const site = await this.deskSiteHook.ensure(
      shop.ownerUserId,
      `外卖·${shop.name}`,
    );
    await this.prisma.takeoutShop.update({
      where: { id: shop.id },
      data: { supportSiteId: site.id },
    });
    return site;
  }

  async scrmState(user: CurrentUser, shopId: number) {
    const shop = await this.requireShop(user, shopId);
    const [pending, sent, skipped, failed] = await Promise.all([
      this.prisma.takeoutScrmOutbox.count({
        where: { shopId: shop.id, status: 'PENDING' },
      }),
      this.prisma.takeoutScrmOutbox.count({
        where: { shopId: shop.id, status: 'SENT' },
      }),
      this.prisma.takeoutScrmOutbox.count({
        where: { shopId: shop.id, status: 'SKIPPED' },
      }),
      this.prisma.takeoutScrmOutbox.count({
        where: { shopId: shop.id, status: 'DEAD' },
      }),
    ]);
    return { enabled: shop.scrmEnabled, pending, sent, skipped, failed };
  }

  async setScrmEnabled(
    user: CurrentUser,
    shopId: number,
    enabled: boolean,
  ): Promise<TakeoutShop> {
    const shop = await this.requireShop(user, shopId);
    const row = await this.prisma.takeoutShop.update({
      where: { id: shop.id },
      data: { scrmEnabled: enabled === true },
    });
    return this.toShop(row);
  }

  private toView(row: ShopRow): TakeoutShopView {
    return {
      ...row,
      trade: normalizeTrade(row.tradeJson),
      takeout: normalizeConfig(row.takeoutJson),
    };
  }

  toShop(row: ShopRow): TakeoutShop {
    const view = this.toView(row);
    return {
      id: view.id,
      ownerUserId: view.ownerUserId,
      name: view.name,
      shopCode: view.shopCode,
      logo: view.logo,
      slogan: view.slogan,
      servicePhone: view.servicePhone,
      themeColor: view.themeColor,
      status: shopStatus(view.status),
      trade: view.trade,
      takeout: view.takeout,
      scrmEnabled: view.scrmEnabled,
      offReason: view.offReason,
      createdAt: iso(view.createdAt),
    };
  }

  async shops(user: CurrentUser): Promise<TakeoutShop[]> {
    const rows = await this.prisma.takeoutShop.findMany({
      where: { ownerUserId: user.userId },
      orderBy: { id: 'asc' },
      take: 50,
    });
    return rows.map((row) => this.toShop(row as unknown as ShopRow));
  }

  async create(
    user: CurrentUser,
    body: TakeoutShopCreateBody,
  ): Promise<TakeoutShop> {
    const shopCode = clip(body.shopCode, 16).toUpperCase();
    const dup = await this.prisma.takeoutShop.findUnique({
      where: { shopCode },
    });
    if (dup) {
      throw new BusinessException(ErrorCode.CONFLICT, '该店铺码已被占用');
    }
    const row = await this.prisma.takeoutShop.create({
      data: {
        ownerUserId: user.userId,
        name: clip(body.name, 30),
        shopCode: shopCode || takeoutShopCode(),
      },
    });
    await this.ensureDeskSite(row as unknown as ShopRow).catch(() => null);
    return this.toShop(row);
  }

  async requireShop(
    user: { userId: string },
    shopId: number,
  ): Promise<TakeoutShopView> {
    const row = await this.prisma.takeoutShop.findFirst({
      where: { id: Number(shopId), ownerUserId: user.userId },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '外卖门店不存在');
    return this.toView(row);
  }

  async detail(user: CurrentUser, shopId: number): Promise<TakeoutShop> {
    return this.toShop(await this.requireShop(user, shopId));
  }

  async update(
    user: CurrentUser,
    body: TakeoutShopUpdateBody,
  ): Promise<TakeoutShop> {
    const shop = await this.requireShop(user, body.shopId);
    const row = await this.prisma.takeoutShop.update({
      where: { id: shop.id },
      data: {
        name: clip(body.name, 30),
        logo: clip(body.logo, 500),
        slogan: clip(body.slogan, 60),
        servicePhone: clip(body.servicePhone, 32),
        themeColor: clip(body.themeColor, 16) || '#E64340',
      },
    });
    return this.toShop(row);
  }

  async saveTrade(
    user: CurrentUser,
    body: TakeoutShopTradeBody,
  ): Promise<TakeoutShop> {
    const shop = await this.requireShop(user, body.shopId);
    const trade = normalizeTrade(body.trade);
    const takeout = normalizeConfig(body.takeout);
    const row = await this.prisma.takeoutShop.update({
      where: { id: shop.id },
      data: {
        tradeJson: trade,
        takeoutJson: takeout,
      },
    });
    return this.toShop(row);
  }

  async setStatus(
    user: CurrentUser,
    shopId: number,
    status: 'ONLINE' | 'OFFLINE',
  ): Promise<TakeoutShop> {
    const shop = await this.requireShop(user, shopId);
    const next: TakeoutShopStatus = status === 'ONLINE' ? 'ONLINE' : 'DRAFT';
    if (!TAKEOUT_SHOP_STATUSES.includes(next)) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '门店状态不合法');
    }
    const row = await this.prisma.takeoutShop.update({
      where: { id: shop.id },
      data: { status: next },
    });
    return this.toShop(row);
  }

  /** 公开通道：按外卖店铺码取店，已关闭的店铺按不存在处理。 */
  async findByCode(code: string) {
    const normalized = clip(code, 16).toUpperCase();
    if (!normalized) return null;
    const row = await this.prisma.takeoutShop.findUnique({
      where: { shopCode: normalized },
    });
    if (!row || row.status === 'CLOSED') return null;
    return this.toView(row);
  }

  async findByAppId(appId: string) {
    const normalized = clip(appId, 64);
    if (!normalized) return null;
    const app = await this.prisma.miniProgramApp.findFirst({
      where: { scene: TAKEOUT_SCENE, appId: normalized },
      select: { shopId: true },
    });
    if (!app) return null;
    const row = await this.prisma.takeoutShop.findUnique({
      where: { id: app.shopId },
    });
    return row && row.status !== 'CLOSED' ? this.toView(row) : null;
  }

  async paySubject(shopId: number) {
    const shop = await this.prisma.takeoutShop.findFirst({
      where: { id: Number(shopId) },
      select: { id: true, ownerUserId: true, name: true },
    });
    if (!shop)
      throw new BusinessException(ErrorCode.NOT_FOUND, '外卖门店不存在');
    return {
      ownerUserId: shop.ownerUserId,
      scene: TAKEOUT_SCENE,
      shopId: shop.id,
      shopName: shop.name,
    };
  }
}
