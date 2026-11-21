import {
  CARD_SHOP_CARD_FORMAT_LABELS,
  CARD_SHOP_CARD_ORDER_LABELS,
  CARD_SHOP_CARD_STATUS_LABELS,
  CARD_SHOP_CONTACT_MODE_LABELS,
  CARD_SHOP_CONTENT_KIND_LABELS,
  CARD_SHOP_COUPON_KIND_LABELS,
  CARD_SHOP_COUPON_STATUS_LABELS,
  CARD_SHOP_DEFAULT_TOGGLES,
  CARD_SHOP_GOODS_STATUS_LABELS,
  CARD_SHOP_IMPORT_SPLITTER_LABELS,
  CARD_SHOP_ORDER_STATE_LABELS,
  CARD_SHOP_SITE_STATUS_LABELS,
  CARD_SHOP_STOCK_DISPLAY_LABELS,
  CARD_SHOP_STOCK_LEVEL_LABELS,
  CARD_SHOP_TAKE_CARD_MODE_LABELS,
  CARD_SHOP_TOGGLE_KEYS,
  CARD_SHOP_TOGGLE_LABELS,
  type CardShopContact,
  type CardShopMeta,
  type CardShopOverview,
  type CardShopSite,
  type CardShopSiteSaveBody,
  type CardShopToggles,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import { resolveSiteUrl } from '../common/site-url';
import type { PrismaService } from '../prisma/prisma.service';
import type { MiniAppService } from '../private-mini/mini-app.service';
import {
  CARD_SHOP_SCENE,
  amount,
  cardShopSiteCode,
  clip,
  intIn,
  iso,
  jsonInput,
  mergeJson,
  siteStatus,
  textOf,
} from './card-shop.shared';
import type { CardShopPlatformService } from './card-shop.platform.service';
import type { CardShopSiteContext } from './card-shop.site-context';

/** service-desk 嵌入页路径：小程序 web-view 打开它，会话数据全留在 service_desk_* 里。 */
export const CARD_SHOP_DESK_EMBED_PATH = '/embed/service-desk';

type SiteRow = {
  id: number;
  ownerUserId: string;
  enterpriseId: number;
  siteCode: string;
  name: string;
  logo: string;
  slogan: string;
  themeColor: string;
  notice: string;
  serviceContact: unknown;
  deskSiteKey: string;
  toggles: unknown;
  stockDisplayMode: string;
  cardOrderMode: string;
  lockMinutes: number;
  protocolText: string;
  status: string;
  offReason: string;
  createdAt: Date;
  updatedAt: Date;
};

const CONTACT_BASE: CardShopContact = {
  phone: '',
  qq: '',
  wechat: '',
  email: '',
};

/**
 * 卡密商城站点（＝一个店主的自动发货商店）与其元信息、概览。
 *
 * 越权口径：一律按 `ownerUserId` 命中，查不到就是 NOT_FOUND，不暴露「别人的站点存在」；
 * `siteId` 永不信任请求体，都由这里反查后下发给下游服务。
 */
export class CardShopSiteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly miniApp: MiniAppService,
    private readonly platform: CardShopPlatformService,
  ) {}

  async meta(): Promise<CardShopMeta> {
    const limits = await this.platform.limits();
    return {
      scene: CARD_SHOP_SCENE,
      siteStatusLabels: CARD_SHOP_SITE_STATUS_LABELS,
      goodsStatusLabels: CARD_SHOP_GOODS_STATUS_LABELS,
      cardStatusLabels: CARD_SHOP_CARD_STATUS_LABELS,
      orderStateLabels: CARD_SHOP_ORDER_STATE_LABELS,
      takeCardModeLabels: CARD_SHOP_TAKE_CARD_MODE_LABELS,
      contactModeLabels: CARD_SHOP_CONTACT_MODE_LABELS,
      cardFormatLabels: CARD_SHOP_CARD_FORMAT_LABELS,
      stockDisplayLabels: CARD_SHOP_STOCK_DISPLAY_LABELS,
      cardOrderLabels: CARD_SHOP_CARD_ORDER_LABELS,
      couponKindLabels: CARD_SHOP_COUPON_KIND_LABELS,
      couponStatusLabels: CARD_SHOP_COUPON_STATUS_LABELS,
      contentKindLabels: CARD_SHOP_CONTENT_KIND_LABELS,
      toggleLabels: { ...CARD_SHOP_TOGGLE_LABELS },
      toggleKeys: [...CARD_SHOP_TOGGLE_KEYS],
      splitterLabels: CARD_SHOP_IMPORT_SPLITTER_LABELS,
      stockLevelLabels: CARD_SHOP_STOCK_LEVEL_LABELS,
      limits: {
        goodsQuota: limits.goodsQuota,
        cardQuota: limits.cardQuota,
        importMaxLines: limits.importMaxLines,
        importMaxBytes: limits.importMaxBytes,
        payAllowed: limits.payAllowed,
        enabled: limits.enabled,
      },
    };
  }

  async sites(user: CurrentUser): Promise<CardShopSite[]> {
    const rows = await this.prisma.cardShopSite.findMany({
      where: { ownerUserId: user.userId },
      orderBy: [{ id: 'asc' }],
      take: 20,
    });
    return Promise.all(
      rows.map((row) => this.toSiteRow(row as unknown as SiteRow)),
    );
  }

  private async toSiteRow(row: SiteRow): Promise<CardShopSite> {
    const [goodsTotal, cardAvailableTotal, siteUrl, deskSiteName] =
      await Promise.all([
        this.prisma.cardShopProduct.count({
          where: { siteId: row.id, trashedAt: null },
        }),
        this.prisma.cardShopCard.count({
          where: { siteId: row.id, status: 'AVAILABLE', trashedAt: null },
        }),
        resolveSiteUrl(this.prisma),
        this.deskSiteName(row.deskSiteKey),
      ]);
    return {
      id: row.id,
      siteCode: row.siteCode,
      name: row.name,
      logo: row.logo,
      slogan: row.slogan,
      themeColor: row.themeColor,
      notice: row.notice,
      serviceContact: mergeJson<CardShopContact>(
        row.serviceContact,
        CONTACT_BASE,
      ),
      deskSiteKey: row.deskSiteKey,
      deskSiteName,
      toggles: mergeJson<CardShopToggles>(
        row.toggles,
        CARD_SHOP_DEFAULT_TOGGLES,
      ),
      stockDisplayMode: row.stockDisplayMode === 'ACTUAL' ? 'ACTUAL' : 'RANGE',
      cardOrderMode: normalizeCardOrder(row.cardOrderMode),
      lockMinutes: intIn(row.lockMinutes, 1, 1440, 15),
      protocolText: row.protocolText,
      status: siteStatus(row.status),
      offReason: row.offReason,
      siteUrl,
      goodsTotal,
      cardAvailableTotal,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  /** 绑定的 AI 客服服务站名称：只认同账号下的站点，跨账号的 siteKey 一律当未绑定。 */
  async deskSiteName(siteKey: string): Promise<string> {
    const key = clip(siteKey, 64);
    if (!key) return '';
    const desk = await this.prisma.serviceDeskSite.findUnique({
      where: { siteKey: key },
      select: { name: true },
    });
    return desk ? clip(desk.name, 80) : '';
  }

  /** 归属校验 + 下游服务要用的站点上下文。 */
  async requireSite(user: CurrentUser, id: string | number) {
    const siteId = Number(id);
    if (!Number.isInteger(siteId) || siteId <= 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '站点 id 不合法');
    }
    const row = await this.prisma.cardShopSite.findFirst({
      where: { id: siteId, ownerUserId: user.userId },
    });
    if (!row) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '卡密商城站点不存在或不属于当前账号',
      );
    }
    return {
      siteId: row.id,
      ownerUserId: row.ownerUserId,
      siteCode: row.siteCode,
      name: row.name,
      themeColor: row.themeColor,
      scene: CARD_SHOP_SCENE,
      status: siteStatus(row.status),
      toggles: mergeJson<CardShopToggles>(
        row.toggles,
        CARD_SHOP_DEFAULT_TOGGLES,
      ),
      deskSiteKey: row.deskSiteKey,
      stockDisplayMode: row.stockDisplayMode === 'ACTUAL' ? 'ACTUAL' : 'RANGE',
      cardOrderMode: normalizeCardOrder(row.cardOrderMode),
      lockMinutes: intIn(row.lockMinutes, 1, 1440, 15),
      serviceContact: mergeJson<CardShopContact>(
        row.serviceContact,
        CONTACT_BASE,
      ),
    };
  }

  /** 公开通道用：按站点码反查，已关闭的站点不再对外。 */
  async byCode(code: string) {
    const normalized = clip(code, 16).toUpperCase();
    if (!normalized) return null;
    const row = await this.prisma.cardShopSite.findUnique({
      where: { siteCode: normalized },
    });
    if (!row || row.status === 'CLOSED') return null;
    return row as unknown as SiteRow;
  }

  /** 公开通道用：按站点 id 取（订单已落 siteId，回调不再依赖站点码）。 */
  async byId(siteId: number) {
    const row = await this.prisma.cardShopSite.findUnique({
      where: { id: Number(siteId) },
    });
    return row ? (row as unknown as SiteRow) : null;
  }

  /**
   * C 端上下文：把站点行换成公开路由要用的形状，顺带算好 apiBase 与客服嵌入地址。
   * 关闭中的站点在这里一并挡掉——小程序拿不到半套配置。
   */
  async publicContext(row: SiteRow): Promise<CardShopSiteContext> {
    const apiBase = (await resolveSiteUrl(this.prisma)).replace(/\/+$/, '');
    const deskSiteKey = clip(row.deskSiteKey, 64);
    const toggles = mergeJson<CardShopToggles>(
      row.toggles,
      CARD_SHOP_DEFAULT_TOGGLES,
    );
    const protocolText = String(row.protocolText ?? '');
    return {
      siteId: row.id,
      ownerUserId: row.ownerUserId,
      siteCode: row.siteCode,
      name: row.name,
      logo: row.logo,
      slogan: row.slogan,
      themeColor: row.themeColor,
      notice: row.notice,
      status: siteStatus(row.status),
      offReason: row.offReason,
      toggles,
      stockDisplayMode: row.stockDisplayMode === 'ACTUAL' ? 'ACTUAL' : 'RANGE',
      cardOrderMode: normalizeCardOrder(row.cardOrderMode),
      lockMinutes: intIn(row.lockMinutes, 1, 1440, 15),
      serviceContact: mergeJson<CardShopContact>(
        row.serviceContact,
        CONTACT_BASE,
      ),
      deskSiteKey,
      deskEmbedUrl: deskSiteKey
        ? `${apiBase}${CARD_SHOP_DESK_EMBED_PATH}?key=${encodeURIComponent(deskSiteKey)}`
        : '',
      apiBase,
      // 开关开着但正文是空的，勾选就等于让买家同意一份看不见的协议——不算开启
      protocolEnabled:
        toggles.protocol !== false && Boolean(protocolText.trim()),
      protocolText: protocolText.slice(0, 200_000),
    };
  }

  /** 小程序扫码只带 AppID 时用它定位站点，与电商工具同一口径。 */
  async byAppId(appId: string) {
    const normalized = clip(appId, 64).trim();
    if (!normalized) return null;
    const app = await this.prisma.miniProgramApp.findFirst({
      where: { scene: CARD_SHOP_SCENE, appId: normalized },
      select: { shopId: true },
    });
    if (!app) return null;
    const row = await this.prisma.cardShopSite.findUnique({
      where: { id: app.shopId },
    });
    return row && row.status !== 'CLOSED' ? (row as unknown as SiteRow) : null;
  }

  /** 底座主体归属：凭据与出包台账按 scene + shopId 定位。 */
  subject(row: { id: number; ownerUserId: string; name: string }) {
    return {
      ownerUserId: row.ownerUserId,
      scene: CARD_SHOP_SCENE,
      shopId: row.id,
      shopName: row.name,
    };
  }

  async createSite(
    user: CurrentUser,
    body: CardShopSiteSaveBody,
  ): Promise<CardShopSite> {
    await this.platform.requireEnabled();
    const existing = await this.prisma.cardShopSite.count({
      where: { ownerUserId: user.userId },
    });
    if (existing > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '一个账号只能有一个卡密商城；现有商店可在「站点设置」里重新上线，确认不再使用后再彻底删除',
      );
    }
    const code = await this.uniqueCode();
    const created = await this.prisma.cardShopSite.create({
      data: {
        ownerUserId: user.userId,
        enterpriseId: 0,
        enterpriseUserId: '',
        siteCode: code,
        name: clip(body.name, 120),
        logo: clip(body.logo, 500),
        slogan: clip(body.slogan, 200),
        themeColor: normalizeTheme(body.themeColor),
        notice: clip(body.notice, 500),
        serviceContact: jsonInput(mergeJson(body.serviceContact, CONTACT_BASE)),
        deskSiteKey: await this.resolveDeskKey(user, body.deskSiteKey),
        toggles: jsonInput(mergeJson(body.toggles, CARD_SHOP_DEFAULT_TOGGLES)),
        stockDisplayMode:
          body.stockDisplayMode === 'ACTUAL' ? 'ACTUAL' : 'RANGE',
        cardOrderMode: normalizeCardOrder(body.cardOrderMode),
        lockMinutes: intIn(body.lockMinutes, 1, 1440, 15),
        protocolText: String(body.protocolText ?? '').slice(0, 200_000),
        status: 'DRAFT',
      },
    });
    // 建好站点就铺一个「默认分类」，用户进商品页就能直接录，不会面对空下拉
    await this.prisma.cardShopCategory.create({
      data: { siteId: created.id, name: '默认分类', sort: 100 },
    });
    return this.siteDetail(user, created.id);
  }

  async saveSite(
    user: CurrentUser,
    siteId: number,
    body: CardShopSiteSaveBody,
  ): Promise<CardShopSite> {
    const current = await this.requireSite(user, siteId);
    const nextDeskKey = await this.resolveDeskKey(user, body.deskSiteKey);
    await this.prisma.cardShopSite.update({
      where: { id: current.siteId },
      data: {
        name: clip(body.name, 120),
        logo: clip(body.logo, 500),
        slogan: clip(body.slogan, 200),
        themeColor: normalizeTheme(body.themeColor),
        notice: clip(body.notice, 500),
        serviceContact: jsonInput(mergeJson(body.serviceContact, CONTACT_BASE)),
        deskSiteKey: nextDeskKey,
        toggles: jsonInput(
          mergeJson(
            body.toggles,
            mergeJson(current.toggles, CARD_SHOP_DEFAULT_TOGGLES),
          ),
        ),
        stockDisplayMode:
          body.stockDisplayMode === 'ACTUAL' ? 'ACTUAL' : 'RANGE',
        cardOrderMode: normalizeCardOrder(body.cardOrderMode),
        lockMinutes: intIn(body.lockMinutes, 1, 1440, 15),
        protocolText: String(body.protocolText ?? '').slice(0, 200_000),
      },
    });
    return this.siteDetail(user, current.siteId);
  }

  /**
   * 绑定 AI 客服服务站：必须是本人账号下、且仍启用的服务站，否则视为未绑定。
   * 客服会话本身完全由 service-desk 负责，这里只存一个 siteKey 指向。
   */
  private async resolveDeskKey(
    user: CurrentUser,
    siteKey: unknown,
  ): Promise<string> {
    const key = clip(textOf(siteKey).trim(), 64);
    if (!key) return '';
    const desk = await this.prisma.serviceDeskSite.findFirst({
      where: { siteKey: key, ownerUserId: String(user.userId) },
      select: { enabled: true },
    });
    if (!desk) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '在线客服服务站不存在或不属于当前账号，请到「AI 客服」里新建后选择它',
      );
    }
    if (!desk.enabled) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该 AI 客服服务站已停用，请先在「AI 客服」里启用后再绑定',
      );
    }
    return key;
  }

  async siteDetail(user: CurrentUser, siteId: number): Promise<CardShopSite> {
    const row = await this.prisma.cardShopSite.findFirst({
      where: { id: siteId, ownerUserId: user.userId },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '卡密商城站点不存在');
    }
    return this.toSiteRow(row);
  }

  /**
   * 店主自助改营业状态：未上线（DRAFT）/ 营业中（ONLINE）/ 已关闭（CLOSED）。
   * 平台不介入单个店铺的审核与停服，关店与重新上线都由店主自己决定；
   * 关店只停买家端，商品、卡密与订单台账全部保留。
   */
  async setStatus(
    user: CurrentUser,
    siteId: number,
    status: string,
  ): Promise<CardShopSite> {
    const current = await this.requireSite(user, siteId);
    const next = String(status);
    if (next !== 'DRAFT' && next !== 'ONLINE' && next !== 'CLOSED') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '站点状态只能在「未上线 / 营业中 / 已关闭」之间切换',
      );
    }
    if (next === 'ONLINE') {
      const goodsTotal = await this.prisma.cardShopProduct.count({
        where: { siteId: current.siteId, status: 'ONLINE', trashedAt: null },
      });
      if (goodsTotal === 0) {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '还没有「销售中」的商品，小程序打开只会是空货架；请先上架至少一个商品',
        );
      }
      const configured = await this.miniApp.configured(
        this.subject({
          id: current.siteId,
          ownerUserId: current.ownerUserId,
          name: current.name,
        }),
      );
      if (!configured) {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '还没填写微信小程序 AppID 与密钥，站点上线后小程序无法启动；请到「发布」页补齐',
        );
      }
    }
    await this.prisma.cardShopSite.update({
      where: { id: current.siteId },
      data: {
        status: next,
        offBy: '',
        offReason: next === 'CLOSED' ? '店主主动关店' : '',
      },
    });
    return this.siteDetail(user, current.siteId);
  }

  /**
   * 删除站点：非空就硬拦。卡密是资产、订单是取证，绝不能跟着站点一起静默消失，
   * 只有关站（CLOSED）这一条路给还有数据的站点。
   */
  async removeSite(user: CurrentUser, siteId: number) {
    const current = await this.requireSite(user, siteId);
    const [goodsTotal, cardTotal, orderTotal] = await Promise.all([
      this.prisma.cardShopProduct.count({ where: { siteId: current.siteId } }),
      this.prisma.cardShopCard.count({ where: { siteId: current.siteId } }),
      this.prisma.cardShopOrder.count({ where: { siteId: current.siteId } }),
    ]);
    if (goodsTotal + cardTotal + orderTotal > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `站点内已有 ${goodsTotal} 个商品、${cardTotal} 张卡密、${orderTotal} 笔订单，不能直接删除；` +
          '请改用「关闭站点」保留数据，或先清空商品与卡密（订单会永久留痕，无法删除）',
      );
    }
    await this.prisma.cardShopSite.delete({ where: { id: current.siteId } });
    return { ok: true, message: '站点已删除' };
  }

  /** 概览：成交与库存两块——店主进来先看「今天卖了多少钱」和「哪个商品快没卡了」。 */
  async overview(user: CurrentUser, siteId: number): Promise<CardShopOverview> {
    const current = await this.requireSite(user, siteId);
    const site = await this.siteDetail(user, current.siteId);
    const dayStart = startOfDay(new Date());
    const weekStart = new Date(dayStart.getTime() - 6 * 86_400_000);
    const [
      todayAgg,
      totalAgg,
      pendingOrders,
      goodsTotal,
      onlineGoodsTotal,
      availableCards,
      customerTotal,
      onlineGoods,
      cardGroups,
      weekPaid,
    ] = await Promise.all([
      this.prisma.cardShopOrder.aggregate({
        _count: { _all: true },
        _sum: { totalAmount: true },
        where: {
          siteId: current.siteId,
          payState: 'PAID',
          paidAt: { gte: dayStart },
        },
      }),
      this.prisma.cardShopOrder.aggregate({
        _count: { _all: true },
        _sum: { totalAmount: true },
        where: { siteId: current.siteId, payState: 'PAID' },
      }),
      this.prisma.cardShopOrder.count({
        where: { siteId: current.siteId, payState: 'PENDING' },
      }),
      this.prisma.cardShopProduct.count({
        where: { siteId: current.siteId, trashedAt: null },
      }),
      this.prisma.cardShopProduct.count({
        where: { siteId: current.siteId, status: 'ONLINE', trashedAt: null },
      }),
      this.prisma.cardShopCard.count({
        where: { siteId: current.siteId, status: 'AVAILABLE', trashedAt: null },
      }),
      this.prisma.cardShopCustomer.count({ where: { siteId: current.siteId } }),
      this.prisma.cardShopProduct.findMany({
        where: { siteId: current.siteId, status: 'ONLINE', trashedAt: null },
        select: { id: true, name: true, stockWarn: true },
        orderBy: [{ sort: 'desc' }, { id: 'asc' }],
        take: 1000,
      }),
      this.prisma.cardShopCard.groupBy({
        by: ['goodsId', 'status'],
        where: { siteId: current.siteId, trashedAt: null },
        _count: { _all: true },
      }),
      this.prisma.cardShopOrder.findMany({
        where: {
          siteId: current.siteId,
          payState: 'PAID',
          paidAt: { gte: weekStart },
        },
        select: { totalAmount: true, paidAt: true },
        take: 20_000,
      }),
    ]);
    const availableByGoods = new Map<number, number>();
    for (const item of cardGroups) {
      if (item.status !== 'AVAILABLE') continue;
      availableByGoods.set(item.goodsId, item._count._all);
    }
    // 预警只列前 20 条：店主关心的是「卖得动的还没卡」，按 sort 顺序取即可
    const stockWarnings: CardShopOverview['stockWarnings'] = [];
    for (const goods of onlineGoods) {
      const available = availableByGoods.get(goods.id) ?? 0;
      const warn = Math.max(0, goods.stockWarn);
      if (available > 0 && (warn === 0 || available > warn)) continue;
      stockWarnings.push({ id: goods.id, name: goods.name, available });
      if (stockWarnings.length >= 20) break;
    }
    const daily = new Map<string, { amount: number; orders: number }>();
    for (let index = 0; index < 7; index += 1) {
      daily.set(dayKey(new Date(dayStart.getTime() - index * 86_400_000)), {
        amount: 0,
        orders: 0,
      });
    }
    for (const row of weekPaid) {
      if (!row.paidAt) continue;
      const bucket = daily.get(dayKey(row.paidAt));
      if (!bucket) continue;
      bucket.amount += amount(row.totalAmount);
      bucket.orders += 1;
    }
    const dailyTrend = [...daily.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, value]) => ({
        date,
        amount: Math.round(value.amount * 100) / 100,
        orders: value.orders,
      }));
    return {
      site,
      todayAmount: amount(todayAgg._sum.totalAmount),
      todayPaidOrders: todayAgg._count._all,
      pendingOrders,
      totalAmount: amount(totalAgg._sum.totalAmount),
      totalPaidOrders: totalAgg._count._all,
      goodsTotal,
      onlineGoodsTotal,
      availableCards,
      customerTotal,
      stockWarnings,
      dailyTrend,
    };
  }
  private async uniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = cardShopSiteCode();
      const taken = await this.prisma.cardShopSite.findUnique({
        where: { siteCode: code },
      });
      if (!taken) return code;
    }
    throw new BusinessException(
      ErrorCode.CONFLICT,
      '站点标识生成失败，请重试（8 位随机码连续冲突，属于极小概率）',
    );
  }
}

function normalizeCardOrder(value: unknown) {
  return value === 'NEWEST' || value === 'RANDOM' ? value : 'OLDEST';
}

function normalizeTheme(value: unknown): string {
  const text = clip(textOf(value).trim(), 16);
  return /^#[0-9A-Fa-f]{6}$/.test(text) ? text : '#3370FF';
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function dayKey(value: Date): string {
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}
