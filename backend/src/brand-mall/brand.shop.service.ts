import {
  BRAND_DEFAULT_TRADE,
  type BrandMeta,
  type BrandShop,
  type BrandShopCheck,
  type BrandShopCreateBody,
  type BrandShopDetail,
  type BrandShopStatus,
  type BrandTradeConfig,
  type MiniTemplateInfo,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { MiniAppService } from '../private-mini/mini-app.service';
import { BRAND_DIY_WIDGET_CATALOG } from './brand.diy-widgets';
import type { BrandPlatformService } from './brand.platform.service';
import { normalizeDefaultTrade } from './brand.platform.service';
import {
  clip,
  intIn,
  iso,
  jsonInput,
  brandShopCode,
  BRAND_SCENE,
  shopStatus,
} from './brand.shared';

type ShopRow = {
  id: number;
  ownerUserId: string;
  enterpriseId: number;
  enterpriseUserId: string;
  name: string;
  shopCode: string;
  logo: string;
  slogan: string;
  servicePhone: string;
  themeColor: string;
  status: string;
  tradeJson: unknown;
  scrmEnabled: boolean;
  supportSiteId: number;
  shareImage: string;
  offReason: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * 交易参数一律从库里脏值收敛：库里存的是 JSON，历史写入或手工改库都可能越界，
 * 而这些数字直接进下单算价（运费、积分抵扣、自动取消），不能信。
 */
export function normalizeTrade(value: unknown): BrandTradeConfig {
  const merged = {
    ...BRAND_DEFAULT_TRADE,
    ...(asObject(value) as Partial<BrandTradeConfig>),
  };
  const pointsPerYuan = intIn(merged.pointsPerYuan, 0, 100000, 0);
  return {
    autoCancelMinutes: intIn(merged.autoCancelMinutes, 5, 10080, 30),
    freightAmount: money(merged.freightAmount),
    freeFreightAmount: money(merged.freeFreightAmount),
    minOrderAmount: money(merged.minOrderAmount),
    refundEnabled: merged.refundEnabled !== false,
    refundDaysLimit: intIn(merged.refundDaysLimit, 0, 365, 7),
    buyerMessageEnabled: merged.buyerMessageEnabled !== false,
    pointsEnabled: merged.pointsEnabled === true,
    pointsReturnRate: rate(merged.pointsReturnRate, 1000),
    // 1 元需要 0 积分 = 不允许抵扣，与 pointsDeductMaxPercent=0 同义，这里保持一处判定
    pointsPerYuan,
    pointsDeductMaxPercent:
      pointsPerYuan > 0 ? intIn(merged.pointsDeductMaxPercent, 0, 100, 0) : 0,
    selfCancelEnabled: merged.selfCancelEnabled !== false,
  };
}

function asObject(value: unknown): Record<string, unknown> {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

/** 比率类参数：与契约的 0..max 同界，库里脏值不能变成天量积分。 */
function rate(value: unknown, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(max, Math.round(parsed * 100) / 100);
}

function money(value: unknown): number {
  return Math.max(0, Math.round(Number(value) * 100) / 100 || 0);
}

/**
 * 电商小程序工具·店铺（= 一个用户自营的商城实例）。
 *
 * 越权口径：一律按 `ownerUserId` 命中，查不到就是 NOT_FOUND，
 * 不暴露「别人的店铺存在」；`shopId` 永不信任请求体，都由这里反查后下发。
 */
export type BrandDeskSiteRef = {
  id: number;
  siteKey: string;
  name: string;
  enabled: boolean;
};

/**
 * AI 客服站点钩子（services.ts 装配）：客服模块晚于商城构建，用钩子避免装配顺序耦合。
 * 站点由商城自动开通并独占维护，店主不需要也不允许手工挑站点。
 */
export type BrandDeskSiteHook = {
  view(ownerUserId: string, id: number): Promise<BrandDeskSiteRef | null>;
  ensure(ownerUserId: string, name: string): Promise<BrandDeskSiteRef>;
};

export class BrandShopService {
  deskSiteHook?: BrandDeskSiteHook;

  constructor(
    private readonly prisma: PrismaService,
    private readonly miniApp: MiniAppService,
    private readonly platform: BrandPlatformService,
  ) {}

  /** 当前客服站点：被删或账号不符时返回 null，页面据此提示重新开通。 */
  async deskSiteOf(shop: {
    ownerUserId: string;
    supportSiteId: number;
  }): Promise<BrandDeskSiteRef | null> {
    if (!this.deskSiteHook || shop.supportSiteId <= 0) return null;
    return this.deskSiteHook.view(shop.ownerUserId, shop.supportSiteId);
  }

  /**
   * 幂等确保店铺有客服站点：已有且归属正确直接复用；
   * 没有（首建或店主在「AI 客服」里删了）就新开一个并回写 supportSiteId。
   */
  async ensureDeskSite(shop: {
    id: number;
    ownerUserId: string;
    name: string;
    supportSiteId: number;
  }): Promise<BrandDeskSiteRef | null> {
    if (!this.deskSiteHook) return null;
    const current = await this.deskSiteOf(shop);
    if (current) return current;
    const site = await this.deskSiteHook.ensure(shop.ownerUserId, shop.name);
    await this.prisma.brandShop.update({
      where: { id: shop.id },
      data: { supportSiteId: site.id },
    });
    return site;
  }

  private subject(row: { id: number; ownerUserId: string; name: string }) {
    return {
      ownerUserId: row.ownerUserId,
      scene: BRAND_SCENE,
      shopId: row.id,
      shopName: row.name,
    };
  }

  /** 归属校验 + 底座主体信息：所有业务服务都从这里拿过滤条件。 */
  async requireShop(user: CurrentUser, id: string | number) {
    const shopId = Number(id);
    if (!Number.isInteger(shopId) || shopId <= 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '店铺 id 不合法');
    }
    const row = await this.prisma.brandShop.findFirst({
      where: { id: shopId, ownerUserId: user.userId },
    });
    if (!row) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '店铺不存在或不属于当前账号',
      );
    }
    const [appConfigured, payEnabled] = await Promise.all([
      this.miniApp.configured(this.subject(row)),
      this.miniApp.payEnabled(this.subject(row)),
    ]);
    return {
      ownerUserId: row.ownerUserId,
      shopId: row.id,
      shopName: row.name,
      shopCode: row.shopCode,
      scene: BRAND_SCENE,
      status: shopStatus(row.status),
      themeColor: row.themeColor,
      trade: normalizeTrade(row.tradeJson),
      appConfigured,
      payEnabled,
      supportSiteId: row.supportSiteId,
    };
  }

  /** 公开通道（含支付回调）用：按 id 取店铺，不做账号归属判定。 */
  async byId(shopId: number) {
    const row = await this.prisma.brandShop.findUnique({
      where: { id: Number(shopId) },
    });
    return row ? (row as unknown as ShopRow) : null;
  }

  /** 公开通道用：按店铺码反查，只回可公开字段。 */
  async findByCode(code: string) {
    const normalized = clip(code, 16).toUpperCase();
    if (!normalized) return null;
    const row = await this.prisma.brandShop.findUnique({
      where: { shopCode: normalized },
    });
    if (!row || row.status === 'CLOSED') return null;
    return row as ShopRow & { status: string };
  }

  /** 公开通道用：扫码直接进店时端上只有 AppID，没有店铺码。 */
  async findByAppId(appId: string) {
    const normalized = clip(appId, 64).trim();
    if (!normalized) return null;
    const app = await this.prisma.miniProgramApp.findFirst({
      where: { scene: BRAND_SCENE, appId: normalized },
      select: { shopId: true },
    });
    if (!app) return null;
    const row = await this.prisma.brandShop.findUnique({
      where: { id: app.shopId },
    });
    return row && row.status !== 'CLOSED' ? (row as unknown as ShopRow) : null;
  }

  /** 公开通道用：只下发顾客端要用的交易参数，不带任何店主侧配置。 */
  async publicTrade(shopId: number): Promise<BrandTradeConfig> {
    const row = await this.prisma.brandShop.findUnique({
      where: { id: shopId },
      select: { tradeJson: true },
    });
    return normalizeTrade(row?.tradeJson);
  }

  async shops(user: CurrentUser): Promise<BrandShop[]> {
    const rows = await this.prisma.brandShop.findMany({
      where: { ownerUserId: user.userId },
      orderBy: [{ id: 'asc' }],
      take: 50,
    });
    return Promise.all(rows.map((row) => this.toShopRow(row)));
  }

  private async toShopRow(row: ShopRow): Promise<BrandShop> {
    const subject = this.subject(row);
    const [
      appView,
      payEnabled,
      productCount,
      onlineProductCount,
      customerCount,
      pendingShipCount,
    ] = await Promise.all([
      this.miniApp.view(subject),
      this.miniApp.payEnabled(subject),
      this.prisma.brandProduct.count({ where: { shopId: row.id } }),
      this.prisma.brandProduct.count({
        where: { shopId: row.id, status: 'ONLINE' },
      }),
      this.prisma.brandCustomer.count({ where: { shopId: row.id } }),
      this.prisma.brandOrder.count({
        where: { shopId: row.id, status: 'PAID' },
      }),
    ]);
    return {
      id: row.id,
      name: row.name,
      shopCode: row.shopCode,
      logo: row.logo,
      slogan: row.slogan,
      servicePhone: row.servicePhone,
      status: shopStatus(row.status),
      offReason: row.offReason,
      productCount,
      onlineProductCount,
      customerCount,
      pendingShipCount,
      themeColor: row.themeColor,
      wechatReady: appView.configured,
      payReady: payEnabled,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  async createShop(
    user: CurrentUser,
    body: BrandShopCreateBody,
  ): Promise<BrandShopDetail> {
    const limits = await this.platform.requireEnabled();
    const existing = await this.prisma.brandShop.count({
      where: { ownerUserId: user.userId, status: { not: 'CLOSED' } },
    });
    if (existing >= limits.shopQuota) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `最多可开 ${limits.shopQuota} 个商城，当前已有 ${existing} 个；如需更多请联系平台管理员调整配额`,
      );
    }
    const requested = clip(body.shopCode || '', 16).toUpperCase();
    const code = requested || (await this.uniqueCode());
    if (requested && !/^[A-Z0-9]{4,16}$/.test(requested)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '店铺标识只能用 4-16 位字母或数字（自动转大写）',
      );
    }
    const taken = await this.prisma.brandShop.findUnique({
      where: { shopCode: code },
    });
    if (taken) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `店铺标识 ${code} 已被占用，请换一个`,
      );
    }
    const created = await this.prisma.brandShop.create({
      data: {
        ownerUserId: user.userId,
        enterpriseId: 0,
        enterpriseUserId: '',
        name: clip(body.name, 120),
        shopCode: code,
        logo: clip(body.logo, 500),
        slogan: clip(body.slogan, 120),
        servicePhone: clip(body.servicePhone, 32),
        themeColor: /^#[0-9A-Fa-f]{6}$/.test(body.themeColor || '')
          ? body.themeColor
          : '#FA3534',
        status: 'DRAFT',
        tradeJson: normalizeDefaultTrade(limits.defaultTrade),
        shareImage: '',
      },
    });
    // 三个主页面随店铺建好，用户进装修页就能直接改，不会面对空列表
    await this.seedDiyPages(created.id);
    // 客服站点随店铺自动开通；配额用尽时不在开店这一步挡住，发布页会给可操作提示
    await this.ensureDeskSite(created).catch(() => null);
    return this.shopDetail(user, created.id);
  }

  private async uniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = brandShopCode();
      const taken = await this.prisma.brandShop.findUnique({
        where: { shopCode: code },
      });
      if (!taken) return code;
    }
    throw new BusinessException(
      ErrorCode.CONFLICT,
      '店铺标识生成冲突，请稍后重试或自行指定一个',
    );
  }

  private async seedDiyPages(shopId: number) {
    const seeds: Array<{ type: string; name: string; sort: number }> = [
      { type: 'HOME', name: '商城首页', sort: 30 },
      { type: 'CATEGORY', name: '分类页', sort: 20 },
      { type: 'MINE', name: '个人中心', sort: 10 },
    ];
    for (const seed of seeds) {
      const existing = await this.prisma.brandDiyPage.findFirst({
        where: { shopId, type: seed.type, isDefault: true },
        select: { id: true },
      });
      if (existing) continue;
      await this.prisma.brandDiyPage.create({
        data: {
          shopId,
          name: seed.name,
          type: seed.type,
          components: jsonInput(this.defaultComponents(seed.type)),
          styles: jsonInput({}),
          isDefault: true,
          status: 'DRAFT',
          sortOrder: seed.sort,
        },
      });
    }
  }

  private defaultComponents(type: string): unknown[] {
    if (type === 'HOME') {
      return [
        { id: 'home-search', type: 'searchBar', props: {} },
        { id: 'home-ads', type: 'imageAds', props: {} },
        { id: 'home-nav', type: 'nav', props: {} },
        { id: 'home-title', type: 'title', props: { main: '推荐商品' } },
        { id: 'home-goods', type: 'goodsList', props: { source: 'RECOMMEND' } },
      ];
    }
    if (type === 'CATEGORY') {
      return [
        { id: 'cate-search', type: 'searchBar', props: {} },
        { id: 'cate-line', type: 'categoryLine', props: {} },
        { id: 'cate-goods', type: 'goodsList', props: { source: 'ALL' } },
      ];
    }
    return [
      { id: 'mine-head', type: 'storeHead', props: {} },
      { id: 'mine-coupon', type: 'coupon', props: {} },
      { id: 'mine-assist', type: 'assist', props: {} },
    ];
  }

  async shopDetail(
    user: CurrentUser,
    id: string | number,
  ): Promise<BrandShopDetail> {
    const shop = await this.prisma.brandShop.findFirst({
      where: { id: Number(id), ownerUserId: user.userId },
    });
    if (!shop) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '店铺不存在或不属于当前账号',
      );
    }
    const base = await this.toShopRow(shop);
    const desk = await this.deskSiteOf(shop);
    return {
      ...base,
      trade: normalizeTrade(shop.tradeJson),
      checks: await this.checks(shop.id, base),
      supportSiteId: shop.supportSiteId,
      deskSiteKey: desk?.siteKey ?? '',
      deskSiteName: desk ? clip(desk.name, 80) : '',
      deskReady: Boolean(desk?.enabled),
    };
  }

  /**
   * 上线自检：每一项失败都要给可点的下一步入口，
   * 不能只告诉用户「还不能用」。
   */
  private async checks(
    shopId: number,
    base: BrandShop,
  ): Promise<BrandShopCheck[]> {
    const [home, onlineProducts, limits] = await Promise.all([
      this.prisma.brandDiyPage.findFirst({
        where: { shopId, type: 'HOME', status: 'PUBLISHED' },
        select: { id: true },
      }),
      this.prisma.brandProduct.count({ where: { shopId, status: 'ONLINE' } }),
      this.platform.limits(),
    ]);
    return [
      {
        key: 'appConfig',
        label: '绑定小程序 AppID',
        ok: base.wechatReady,
        hint: base.wechatReady
          ? `AppID 已配置${base.shopCode ? `，店铺码 ${base.shopCode}` : ''}`
          : '还没填自己的小程序 AppID / AppSecret，顾客端无法登录',
        action: base.wechatReady ? '' : `/brand-mall/publish?shopId=${shopId}`,
      },
      {
        key: 'payConfig',
        label: '开通在线收款',
        ok: !limits.payAllowed || base.payReady,
        hint: !limits.payAllowed
          ? '平台已关闭在线收款，下单走线下标记'
          : base.payReady
            ? '微信支付商户号可用'
            : '未配置自己的微信商户号，顾客只能提交订单无法在线支付',
        action:
          base.payReady || !limits.payAllowed
            ? ''
            : `/brand-mall/publish?shopId=${shopId}`,
      },
      {
        key: 'diyHome',
        label: '发布首页装修',
        ok: Boolean(home),
        hint: home ? '首页已发布' : '首页还没发布，顾客打开小程序会看到空白',
        action: home ? '' : `/brand-mall/decorate?shopId=${shopId}`,
      },
      {
        key: 'product',
        label: '上架商品',
        ok: onlineProducts > 0,
        hint:
          onlineProducts > 0
            ? `已上架 ${onlineProducts} 个商品`
            : '还没有销售中的商品',
        action: onlineProducts > 0 ? '' : `/brand-mall/goods?shopId=${shopId}`,
      },
      {
        key: 'release',
        label: '生成并上传代码包',
        ok: base.status === 'ONLINE' ? true : false,
        hint: '出包与直传在发布页完成；上传只生成微信开发版，提审与发布在你自己的小程序后台操作',
        action: `/brand-mall/publish?shopId=${shopId}`,
      },
    ];
  }

  async updateShop(
    user: CurrentUser,
    id: string | number,
    body: Partial<BrandShopCreateBody>,
  ): Promise<BrandShopDetail> {
    const shop = await this.prisma.brandShop.findFirst({
      where: { id: Number(id), ownerUserId: user.userId },
    });
    if (!shop) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '店铺不存在或不属于当前账号',
      );
    }
    const data: Record<string, unknown> = {};
    if (typeof body.name === 'string' && body.name.trim()) {
      data.name = clip(body.name.trim(), 120);
    }
    if (typeof body.logo === 'string') data.logo = clip(body.logo, 500);
    if (typeof body.slogan === 'string') data.slogan = clip(body.slogan, 120);
    if (typeof body.servicePhone === 'string') {
      data.servicePhone = clip(body.servicePhone, 32);
    }
    if (
      typeof body.themeColor === 'string' &&
      /^#[0-9A-Fa-f]{6}$/.test(body.themeColor)
    ) {
      data.themeColor = body.themeColor;
    }
    if (Object.keys(data).length > 0) {
      await this.prisma.brandShop.update({ where: { id: shop.id }, data });
    }
    return this.shopDetail(user, shop.id);
  }

  /**
   * 店铺状态迁移。上线有硬前置：没有 AppID 或首页没发布就打开，
   * 顾客扫码进来只会看到一个坏掉的商城，所以在这里挡住并回可操作入口。
   */
  async setStatus(
    user: CurrentUser,
    id: string | number,
    status: string,
  ): Promise<BrandShopDetail> {
    const next = status as BrandShopStatus;
    if (!['DRAFT', 'ONLINE', 'CLOSED'].includes(next)) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '店铺状态不合法');
    }
    const shop = await this.prisma.brandShop.findFirst({
      where: { id: Number(id), ownerUserId: user.userId },
    });
    if (!shop) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '店铺不存在或不属于当前账号',
      );
    }
    if (next === 'ONLINE') {
      const [appConfigured, home, products] = await Promise.all([
        this.miniApp.configured(this.subject(shop)),
        this.prisma.brandDiyPage.count({
          where: { shopId: shop.id, type: 'HOME', status: 'PUBLISHED' },
        }),
        this.prisma.brandProduct.count({
          where: { shopId: shop.id, status: 'ONLINE' },
        }),
      ]);
      const missing: string[] = [];
      if (!appConfigured)
        missing.push('在发布页绑定自己的小程序 AppID 与 AppSecret');
      if (home === 0) missing.push('在装修页发布首页');
      if (products === 0) missing.push('至少上架 1 个商品');
      if (missing.length > 0) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          `商城还不能上线，请先完成：${missing.join('；')}。完成后回到本页点「上线」`,
        );
      }
    }
    await this.prisma.brandShop.update({
      where: { id: shop.id },
      data: {
        status: next,
        offReason: next === 'ONLINE' ? shop.offReason : '',
      },
    });
    return this.shopDetail(user, shop.id);
  }

  async saveTrade(
    user: CurrentUser,
    id: string | number,
    trade: BrandTradeConfig,
  ): Promise<BrandShopDetail> {
    const shop = await this.prisma.brandShop.findFirst({
      where: { id: Number(id), ownerUserId: user.userId },
    });
    if (!shop) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '店铺不存在或不属于当前账号',
      );
    }
    if (trade.pointsEnabled === true && !(trade.pointsPerYuan > 0)) {
      // 返分但不给抵扣比例是常见误配：不阻断保存，只把抵扣上限压回 0
      trade = { ...trade, pointsDeductMaxPercent: 0 };
    }
    await this.prisma.brandShop.update({
      where: { id: shop.id },
      data: { tradeJson: normalizeTrade(trade) },
    });
    return this.shopDetail(user, shop.id);
  }

  /** 删店：只有关闭态的店能删，且有未完成订单时挡住，避免顾客的单没人管。 */
  async removeShop(
    user: CurrentUser,
    id: string | number,
  ): Promise<{ ok: boolean; message: string }> {
    const shop = await this.prisma.brandShop.findFirst({
      where: { id: Number(id), ownerUserId: user.userId },
    });
    if (!shop) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '店铺不存在或不属于当前账号',
      );
    }
    const openOrders = await this.prisma.brandOrder.count({
      where: {
        shopId: shop.id,
        status: { in: ['PENDING_PAYMENT', 'PAID', 'SHIPPED'] },
      },
    });
    if (openOrders > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `还有 ${openOrders} 笔订单未完结，请先处理完再删除店铺`,
      );
    }
    await this.prisma.brandShop.delete({ where: { id: shop.id } });
    await Promise.all([
      this.prisma.brandProduct.deleteMany({ where: { shopId: shop.id } }),
      this.prisma.brandProductSku.deleteMany({ where: { shopId: shop.id } }),
      this.prisma.brandCategory.deleteMany({ where: { shopId: shop.id } }),
      this.prisma.brandDiyPage.deleteMany({ where: { shopId: shop.id } }),
      this.prisma.brandCoupon.deleteMany({ where: { shopId: shop.id } }),
      this.prisma.brandCouponTicket.deleteMany({ where: { shopId: shop.id } }),
      this.prisma.brandCartItem.deleteMany({ where: { shopId: shop.id } }),
      this.prisma.brandCustomerAddress.deleteMany({
        where: { shopId: shop.id },
      }),
      this.prisma.brandCustomerBill.deleteMany({ where: { shopId: shop.id } }),
      this.prisma.brandCustomer.deleteMany({ where: { shopId: shop.id } }),
      this.prisma.brandOrderItem.deleteMany({ where: { shopId: shop.id } }),
      this.prisma.brandOrderLog.deleteMany({ where: { shopId: shop.id } }),
      this.prisma.brandRefundOrder.deleteMany({ where: { shopId: shop.id } }),
      this.prisma.brandOrder.deleteMany({ where: { shopId: shop.id } }),
      this.miniApp.removeForShop(this.subject(shop)),
    ]);
    return { ok: true, message: '店铺及其商品、装修与顾客数据已删除' };
  }

  async meta(user: CurrentUser): Promise<BrandMeta> {
    const [shops, limits, expressPresets] = await Promise.all([
      this.shops(user),
      this.platform.limits(),
      this.platform.ensureExpressPresets(),
    ]);
    return {
      statusLabels: {
        DRAFT: '未上线',
        ONLINE: '营业中',
        SUSPENDED: '平台停服',
        CLOSED: '已关闭',
      },
      productStatusLabels: {
        DRAFT: '草稿',
        OFFLINE: '已下架',
        ONLINE: '销售中',
      },
      orderStatusLabels: {
        PENDING_PAYMENT: '待付款',
        PAID: '待发货',
        SHIPPED: '待收货',
        COMPLETED: '已完成',
        CANCELLED: '已取消',
      },
      payStatusLabels: {
        UNPAID: '未支付',
        PAID: '已支付',
        REFUNDING: '退款中',
        REFUNDED: '已退款',
      },
      refundStatusLabels: {
        NONE: '无售后',
        PENDING: '待处理',
        APPROVED: '待买家退货',
        REJECTED: '售后驳回',
        DONE: '已退款',
      },
      payTypeLabels: {
        WECHAT: '微信支付',
        BALANCE: '余额支付',
        OFFLINE: '线下支付',
      },
      returnTypeLabels: { REFUND_ONLY: '仅退款', RETURN_REFUND: '退货退款' },
      refundTicketStatusLabels: {
        PENDING: '待处理',
        AGREED: '已同意',
        REJECTED: '已拒绝',
        REFUNDED: '已退款',
        CANCELLED: '已取消',
      },
      customerSourceLabels: {
        MINIPROGRAM: '小程序',
        H5: 'H5',
        QR: '推广码',
        MANUAL: '后台录入',
      },
      couponTypeLabels: { FULL_REDUCE: '满减券', DISCOUNT: '折扣券' },
      couponScopeLabels: {
        ALL: '全场通用',
        CATEGORY: '指定分类',
        PRODUCT: '指定商品',
      },
      couponStatusLabels: {
        ONLINE: '发放中',
        OFFLINE: '已停发',
        ENDED: '已结束',
      },
      ticketStatusLabels: {
        UNUSED: '未使用',
        USED: '已使用',
        EXPIRED: '已过期',
      },
      diyPageTypeLabels: {
        HOME: '首页',
        CATEGORY: '分类页',
        MINE: '个人中心',
        ACTIVITY: '活动页',
      },
      uploadStatusLabels: {
        NONE: '未上传',
        UPLOADING: '上传中',
        SUCCESS: '已传微信',
        FAILED: '上传失败',
      },
      reviewStatusLabels: {
        '': '未提审',
        SUBMITTED: '已提审',
        APPROVED: '审核通过',
        REJECTED: '审核驳回',
      },
      releaseChannelLabels: { STABLE: '稳定版', BETA: '预览版' },
      widgets: BRAND_DIY_WIDGET_CATALOG,
      shopQuota: limits.shopQuota,
      productQuota: limits.productQuota,
      shopCount: shops.length,
      payAllowed: limits.payAllowed,
      expressPresets,
    };
  }

  /** 看板与首页共用：没店铺时也要能进页面（走开通引导），所以这里不抛错。 */
  async overview(user: CurrentUser) {
    const [shops, limits, template] = await Promise.all([
      this.shops(user),
      this.platform.limits(),
      this.templateInfo(),
    ]);
    return { shops, limits, template };
  }

  async templateInfo(): Promise<MiniTemplateInfo> {
    return this.platform.template();
  }
}
