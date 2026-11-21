import {
  CARD_SHOP_ORDER_STATE_LABELS,
  type CardShopOrder,
  type CardShopOrderDetail,
  type CardShopPublicBootstrap,
  type CardShopPublicGoods,
  type CardShopPublicOrderCreateBody,
  type CardShopPublicOrderCreated,
  type CardShopPublicQueryResult,
} from '@enterprise/contracts';
import { pageOf, type PageResponse } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma';
import type { NotificationService } from '../notifications/notification.service';
import type { CardShopCouponService } from './card-shop.coupon.service';
import type { CardShopContentService } from './card-shop.content.service';
import type { CardShopCustomerService } from './card-shop.customer.service';
import {
  checkVisitPassword,
  normalizeTiers,
  pickUnitCents,
  type CardShopGoodsService,
} from './card-shop.goods.service';
import type { CardShopPayService } from './card-shop.pay.service';
import type { CardShopPlatformService } from './card-shop.platform.service';
import type { CardShopSiteContext } from './card-shop.site-context';
import type { CardShopSiteService } from './card-shop.site.service';
import {
  amount,
  cardFormat,
  cardOrderMode,
  cardShopNo,
  checkContact,
  clip,
  contactMode,
  dayRange,
  fromCents,
  hashSecret,
  intIn,
  iso,
  jsonList,
  mergeJson,
  pageArgs,
  takeCardMode,
  textOf,
  toCents,
  verifySecret,
} from './card-shop.shared';

type Db = PrismaService | Prisma.TransactionClient;

type OrderRow = {
  id: number;
  siteId: number;
  ownerUserId: string;
  orderNo: string;
  goodsId: number;
  goodsName: string;
  goodsCover: string;
  cardFormat: string;
  unitPrice: unknown;
  quantity: number;
  productAmount: unknown;
  couponId: number;
  discountAmount: unknown;
  totalAmount: unknown;
  notifyEmail: string;
  contact: string;
  takeCardPasswordHash: string;
  payState: string;
  transactionId: string;
  paidAt: Date | null;
  closedAt: Date | null;
  cardCount: number;
  customerId: number;
  openid: string;
  createIp: string;
  failReason: string;
  expireAt: Date | null;
  createdAt: Date;
};

type ProductRow = {
  id: number;
  siteId: number;
  categoryId: number;
  name: string;
  subtitle: string;
  coverImage: string;
  images: unknown;
  price: unknown;
  marketPrice: unknown;
  wholesaleTiers: unknown;
  limitQuantity: number;
  maxQuantity: number;
  stockWarn: number;
  couponEnabled: boolean;
  takeCardMode: string;
  visitPassword: string;
  contactMode: string;
  notifyFlags: unknown;
  cardFormat: string;
  intro: string;
  detail: string;
  remark: string;
  cardOrderMode: string;
  hot: boolean;
  sort: number;
  viewCount: number;
  soldCount: number;
  status: string;
};

/** 锁卡时多取的候选行数：并发下总有人先占掉几行，多取一点减少「明明有货却失败」的重试。 */
const LOCK_WINDOW_EXTRA = 50;
/** 随机出卡的候选池上限：几十万卡的站点整表取回再洗牌会直接把这条查询拖死。 */
const RANDOM_POOL_MAX = 500;
/** 一次锁卡最多取回的候选 id 数（只取 id 列，20 万行也就几 MB）。 */
const LOCK_QUERY_MAX = 200_000;
/** 单笔订单数量上限，与契约的 max(100000) 对齐。 */
const QUANTITY_MAX = 100_000;

/**
 * 订单域：下单锁卡 → 支付出卡 → 取卡，加店主侧的查单 / 关单 / 补发。
 *
 * 三条不让步的口径：
 *
 * 1. **绝不超卖**。库存的唯一真值是 `card_shop_cards` 的行，所以锁卡不计数、不加表锁：
 *    先按出卡顺序取候选 id，再用一条带 `status='AVAILABLE'` 的条件更新去占，
 *    占到的行数必须等于购买量，否则整个事务回滚。两个人抢最后一张卡时必然只成一单——
 *    `updateMany` 的 affectedRows 就是裁决结果。
 * 2. **卡密明文只出现在两处**：买家取卡页与店主订单详情；列表、通知、日志一律掩码。
 * 3. **0 元单不走支付**。券把金额抵到 0 时在同一事务里直接出卡——微信侧单笔最低 1 分，
 *    硬发只会得到一笔钱货两空的失败回调。
 */
export class CardShopOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: CardShopSiteService,
    private readonly platform: CardShopPlatformService,
    private readonly goods: CardShopGoodsService,
    private readonly contents: CardShopContentService,
    private readonly coupons: CardShopCouponService,
    private readonly customers: CardShopCustomerService,
    private readonly pay: CardShopPayService,
    private readonly notifications: NotificationService,
  ) {}

  // ================================================================ 店主侧

  async list(
    user: CurrentUser,
    siteId: number,
    query: Record<string, unknown>,
  ): Promise<PageResponse<CardShopOrder>> {
    await this.sites.requireSite(user, siteId);
    const { page, pageSize, offset } = pageArgs(query);
    const where = orderWhere(siteId, query);
    const [rows, total] = await Promise.all([
      this.prisma.cardShopOrder.findMany({
        where,
        orderBy: [{ id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.cardShopOrder.count({ where }),
    ]);
    return pageOf(
      (rows as unknown as OrderRow[]).map(toOrder),
      total,
      page,
      pageSize,
    );
  }

  /** 店主看单：这一页给卡密明文，所以只认同账号下的站点。 */
  async detail(
    user: CurrentUser,
    siteId: number,
    id: number,
  ): Promise<CardShopOrderDetail> {
    const site = await this.sites.requireSite(user, siteId);
    const row = (await this.prisma.cardShopOrder.findFirst({
      where: { id: Number(id), siteId: site.siteId },
    })) as unknown as OrderRow | null;
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    const [cards, goods] = await Promise.all([
      this.prisma.cardShopOrderCard.findMany({
        where: { orderId: row.id, siteId: site.siteId },
        orderBy: [{ sort: 'asc' }, { id: 'asc' }],
        take: QUANTITY_MAX,
      }),
      this.prisma.cardShopProduct.findFirst({
        where: { id: row.goodsId, siteId: site.siteId },
        select: { remark: true, takeCardMode: true },
      }),
    ]);
    return {
      ...toOrder(row),
      cards: cards.map(toOrderCard),
      goodsRemark: goods?.remark ?? '',
      takeCardMode: takeCardMode(goods?.takeCardMode),
    };
  }

  /**
   * 关单：只关未支付单，同时把占住的卡与券放回库存。
   * 已支付单不给关——卡已经发出去了，关掉只会让台账和真实发货不一致。
   */
  async close(
    user: CurrentUser,
    siteId: number,
    orderId: number,
    reason: string,
  ): Promise<{ ok: boolean; message: string }> {
    const site = await this.sites.requireSite(user, siteId);
    const row = await this.prisma.cardShopOrder.findFirst({
      where: { id: Number(orderId), siteId: site.siteId },
      select: { id: true, orderNo: true, payState: true, couponId: true },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    if (row.payState === 'PAID') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该订单已支付并已出卡，不能关闭；买家拿不到卡请用「补发」重新下发',
      );
    }
    if (row.payState === 'CLOSED') {
      return { ok: true, message: `订单 ${row.orderNo} 已经关闭过了` };
    }
    await this.closeOrder(
      this.prisma,
      site.siteId,
      row.id,
      row.couponId,
      clip(reason, 300) || '店主手动关闭',
    );
    return {
      ok: true,
      message: `订单 ${row.orderNo} 已关闭，占用的卡密已放回库存`,
    };
  }

  /**
   * 补发：买家换手机 / 误删导致拿不到卡时，把这单的出货快照重新下发一次。
   *
   * 快照表 `card_shop_order_cards` 是独立于卡密本体的副本，卡密后来被删被改都不影响它，
   * 所以补发不改状态、不改卡，只重新读快照并在站内通知里留痕。
   */
  async reissue(
    user: CurrentUser,
    siteId: number,
    orderId: number,
    email: string,
  ): Promise<{ ok: boolean; message: string }> {
    const site = await this.sites.requireSite(user, siteId);
    const row = (await this.prisma.cardShopOrder.findFirst({
      where: { id: Number(orderId), siteId: site.siteId },
    })) as unknown as OrderRow | null;
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    if (row.payState !== 'PAID') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `只有已支付并出货的订单才需要补发；这单现在是${
          CARD_SHOP_ORDER_STATE_LABELS[row.payState] || row.payState
        }`,
      );
    }
    const snapshot = await this.prisma.cardShopOrderCard.count({
      where: { orderId: row.id, siteId: site.siteId },
    });
    if (!snapshot) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '这单没有出货快照，补不了卡；请到订单详情核对是不是锁卡超时被系统收回了',
      );
    }
    const target = clip(email, 120).trim() || row.notifyEmail;
    void this.notifyOwner(
      site,
      row,
      '卡密商城补发',
      `买家索取补发，已重新下发 ${snapshot} 张卡密快照。下单联系方式 ${
        row.contact || '（未填）'
      }${target ? `，补发邮箱 ${target}` : ''}。买家凭单号 + 联系方式${
        row.takeCardPasswordHash ? ' + 取卡密码' : ''
      }在「订单查询」页即可再次看到卡密。`,
      'info',
    );
    return {
      ok: true,
      message: `已重新下发 ${snapshot} 张卡密，并留痕在站内通知`,
    };
  }

  /** 平台侧取证用：按单号 / 交易号跨站点查（管理员，不返回卡密明文）。 */
  async adminSearch(
    query: Record<string, unknown>,
  ): Promise<PageResponse<CardShopOrder>> {
    const { page, pageSize, offset } = pageArgs(query);
    const keyword = clip(query.keyword, 60).trim();
    const where = keyword
      ? {
          OR: [
            { orderNo: { contains: keyword } },
            { transactionId: { contains: keyword } },
            { contact: { contains: keyword } },
            { notifyEmail: { contains: keyword } },
          ],
        }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.cardShopOrder.findMany({
        where,
        orderBy: [{ id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.cardShopOrder.count({ where }),
    ]);
    return pageOf(
      (rows as unknown as OrderRow[]).map(toOrder),
      total,
      page,
      pageSize,
    );
  }

  // ================================================================ C 端目录

  /** 小程序 bootstrap：站点外观 + 分类 + 热门 + 公告，一次请求给齐首屏。 */
  async bootstrap(site: CardShopSiteContext): Promise<CardShopPublicBootstrap> {
    const [categories, hot, view] = await Promise.all([
      site.toggles.categoryPage === false
        ? Promise.resolve([])
        : this.prisma.cardShopCategory.findMany({
            where: { siteId: site.siteId, status: true },
            orderBy: [{ sort: 'desc' }, { id: 'asc' }],
            take: 100,
          }),
      site.toggles.indexHot === false
        ? Promise.resolve([])
        : this.prisma.cardShopProduct.findMany({
            where: {
              siteId: site.siteId,
              status: 'ONLINE',
              trashedAt: null,
              hot: true,
            },
            orderBy: [{ sort: 'desc' }, { id: 'desc' }],
            take: 20,
          }),
      site.toggles.indexNotice === false
        ? Promise.resolve({ notices: [], banners: [] })
        : this.contents.publicView(site.siteId, 5),
    ]);
    return {
      siteId: site.siteId,
      siteCode: site.siteCode,
      name: site.name,
      logo: site.logo,
      slogan: site.slogan,
      themeColor: site.themeColor,
      notice: site.notice,
      toggles: site.toggles,
      stockDisplayMode: site.stockDisplayMode,
      contact: site.serviceContact,
      deskSiteKey: site.deskSiteKey,
      deskEmbedUrl: site.deskEmbedUrl,
      protocolEnabled: site.protocolEnabled,
      protocolText: site.protocolText,
      categories: categories.map((row) => ({
        id: row.id,
        name: row.name,
        icon: row.icon,
      })),
      hotGoods: await this.toPublicGoods(site, hot),
      notices: view.notices,
      banners: site.toggles.indexBanner === false ? [] : view.banners,
    };
  }

  /** 买家侧商品列表：只给在售商品，价格与库存口径按站点设置。 */
  async goodsList(
    site: CardShopSiteContext,
    query: Record<string, unknown>,
  ): Promise<PageResponse<CardShopPublicGoods>> {
    const { page, pageSize, offset } = pageArgs(query);
    const where: Record<string, unknown> = {
      siteId: site.siteId,
      status: 'ONLINE',
      trashedAt: null,
    };
    const categoryId = Number(query.categoryId || 0);
    if (categoryId > 0) where.categoryId = categoryId;
    const keyword = clip(query.keyword, 60).trim();
    if (keyword) {
      if (site.toggles.search === false) {
        throw new BusinessException(
          ErrorCode.FEATURE_CLOSED,
          '该商店未开启搜索功能，请按分类浏览',
        );
      }
      where.OR = [
        { name: { contains: keyword } },
        { subtitle: { contains: keyword } },
      ];
    }
    const orderBy =
      query.sort === 'newest'
        ? [{ id: 'desc' as const }]
        : [{ sort: 'desc' as const }, { id: 'desc' as const }];
    const [rows, total] = await Promise.all([
      this.prisma.cardShopProduct.findMany({
        where,
        orderBy,
        skip: offset,
        take: pageSize,
      }),
      this.prisma.cardShopProduct.count({ where }),
    ]);
    return pageOf(
      await this.toPublicGoods(site, rows as unknown as ProductRow[]),
      total,
      page,
      pageSize,
    );
  }

  /**
   * 买家侧商品详情。
   * 访问密码在这里判定：设了密码又没通过时只回「需要密码」的空壳，连价格都不给。
   */
  async goodsDetail(
    site: CardShopSiteContext,
    goodsId: number,
    visitPassword: string,
  ): Promise<{
    goods: CardShopPublicGoods | null;
    needVisitPassword: boolean;
    message: string;
  }> {
    const row = (await this.prisma.cardShopProduct.findFirst({
      where: { id: Number(goodsId), siteId: site.siteId, trashedAt: null },
    })) as unknown as ProductRow | null;
    if (!row || row.status !== 'ONLINE') {
      return {
        goods: null,
        needVisitPassword: false,
        message: '商品已下架或不存在',
      };
    }
    if (
      !checkVisitPassword(site.siteId, row.id, row.visitPassword, visitPassword)
    ) {
      return {
        goods: null,
        needVisitPassword: true,
        message: clip(visitPassword, 64)
          ? '访问密码不正确'
          : '该商品需要访问密码',
      };
    }
    const [goods] = await this.toPublicGoods(site, [row]);
    await this.prisma.cardShopProduct.updateMany({
      where: { id: row.id, siteId: site.siteId },
      data: { viewCount: { increment: 1 } },
    });
    return {
      goods: { ...goods, viewCount: goods.viewCount + 1 },
      needVisitPassword: false,
      message: '',
    };
  }

  /**
   * 下单前试算：单价（按批发阶梯）+ 券码抵扣后的实付金额。
   * 只做报价，不锁卡不建单——确认页每改一次数量或券码就能重算。
   */
  async quote(
    site: CardShopSiteContext,
    args: { goodsId: number; quantity: number; couponCode: string },
  ): Promise<{
    unitPrice: number;
    productAmount: number;
    discountAmount: number;
    totalAmount: number;
    couponApplied: boolean;
    message: string;
  }> {
    const row = (await this.prisma.cardShopProduct.findFirst({
      where: { id: Number(args.goodsId), siteId: site.siteId, trashedAt: null },
    })) as unknown as ProductRow | null;
    if (!row || row.status !== 'ONLINE') {
      throw new BusinessException(ErrorCode.NOT_FOUND, '商品已下架或不存在');
    }
    const quantity = intIn(args.quantity, 1, QUANTITY_MAX, 1);
    const min = Number(row.limitQuantity || 0);
    if (min > 0 && quantity < min) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `该商品 ${min} 张起购`,
      );
    }
    const max = Number(row.maxQuantity || 0);
    if (max > 0 && quantity > max) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `该商品单笔最多买 ${max} 张，请拆成几单下单`,
      );
    }
    const price = amount(row.price);
    const unitCents = pickUnitCents(
      normalizeTiers(row.wholesaleTiers, price),
      price,
      quantity,
    );
    const productCents = unitCents * quantity;
    const code = clip(args.couponCode, 40).trim();
    let discountCents = 0;
    let couponApplied = false;
    if (code) {
      if (!row.couponEnabled || site.toggles.coupon === false) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '该商品不参与优惠券',
        );
      }
      const coupon = await this.coupons.evaluate(
        this.prisma,
        site.siteId,
        code,
        {
          categoryId: row.categoryId,
          productCents,
        },
      );
      if (coupon) {
        discountCents = Math.min(productCents, coupon.discountCents);
        couponApplied = true;
      }
    }
    const totalCents = Math.max(0, productCents - discountCents);
    return {
      unitPrice: fromCents(unitCents),
      productAmount: fromCents(productCents),
      discountAmount: fromCents(discountCents),
      totalAmount: fromCents(totalCents),
      couponApplied,
      message: couponApplied
        ? `券码已抵扣 ${fromCents(discountCents).toFixed(2)} 元`
        : '',
    };
  }

  // ================================================================ C 端下单

  /**
   * 下单：定价 → 建单 → 锁卡 → 占券，全在一个事务里。
   *
   * 未开通在线收款时同样建单锁卡，只是不下微信单——买家线下付款、店主自行放行或关单，
   * 行为与参考系统的「线下收款」一致，不会出现钱付了卡没锁的反例。
   */
  async create(
    site: CardShopSiteContext,
    body: CardShopPublicOrderCreateBody,
    context: { ip: string; openid: string; customerId: number },
  ): Promise<CardShopPublicOrderCreated> {
    await this.platform.requireEnabled();
    if (site.status !== 'ONLINE') {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        site.status === 'SUSPENDED'
          ? `该商店已暂停营业${site.offReason ? `（${site.offReason}）` : ''}，请联系店方处理`
          : '该商店尚未上线营业，暂时无法下单',
      );
    }
    const row = (await this.prisma.cardShopProduct.findFirst({
      where: { id: Number(body.goodsId), siteId: site.siteId, trashedAt: null },
    })) as unknown as ProductRow | null;
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '商品不存在或已被删除');
    if (row.status !== 'ONLINE') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '商品当前不在售，换一件试试',
      );
    }
    const quantity = intIn(body.quantity, 1, QUANTITY_MAX, 1);
    const min = Number(row.limitQuantity || 0);
    if (min > 0 && quantity < min) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `该商品 ${min} 张起购`,
      );
    }
    const max = Number(row.maxQuantity || 0);
    if (max > 0 && quantity > max) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `该商品单笔最多买 ${max} 张，请拆成几单下单`,
      );
    }
    const contactError = checkContact(
      contactMode(row.contactMode),
      String(body.contact ?? ''),
    );
    if (contactError)
      throw new BusinessException(ErrorCode.BAD_REQUEST, contactError);
    const email = clip(body.email, 120).trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '接收邮箱格式不正确');
    }
    const mode = takeCardMode(row.takeCardMode);
    const takeCardPassword = String(body.takeCardPassword ?? '').trim();
    if (mode === 'REQUIRED' && takeCardPassword.length < 4) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请设置 4-16 位取卡密码，查单时要用它确认是本人取卡',
      );
    }
    if (
      takeCardPassword &&
      (takeCardPassword.length < 4 || takeCardPassword.length > 16)
    ) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '取卡密码长度要在 4-16 位之间',
      );
    }
    if (site.protocolEnabled && body.agreed !== true) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请先阅读并勾选《购卡协议》再下单',
      );
    }
    const code = clip(body.couponCode, 40).trim();
    if (code && (!row.couponEnabled || site.toggles.coupon === false)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '该商品不参与优惠券，请把券码留空后再下单',
      );
    }

    const price = amount(row.price);
    const unitCents = pickUnitCents(
      normalizeTiers(row.wholesaleTiers, price),
      price,
      quantity,
    );
    const productCents = unitCents * quantity;
    const coupon = code
      ? await this.coupons.evaluate(this.prisma, site.siteId, code, {
          categoryId: row.categoryId,
          productCents,
        })
      : null;
    const discountCents = coupon
      ? Math.min(productCents, coupon.discountCents)
      : 0;
    const totalCents = Math.max(0, productCents - discountCents);
    const openid = clip(context.openid, 64).trim();
    const payEnabled =
      totalCents > 0 &&
      (await this.pay.available(site.siteId, site.ownerUserId));
    const customerId =
      Number(context.customerId || 0) ||
      (await this.customers.ensureForOrder(
        { id: site.siteId, ownerUserId: site.ownerUserId },
        openid,
      ));

    const expireAt = new Date(Date.now() + site.lockMinutes * 60_000);
    const order = await this.createWithLock({
      site,
      goods: row,
      quantity,
      unitCents,
      productCents,
      discountCents,
      totalCents,
      couponId: coupon?.couponId || 0,
      contact: clip(body.contact, 120).trim(),
      email,
      takeCardPassword,
      expireAt,
      ip: clip(context.ip, 64),
      openid,
      customerId,
    });

    let payParams: CardShopPublicOrderCreated['payParams'] = null;
    if (payEnabled && totalCents > 0) {
      // 下单已经成功（卡也锁住了），这里失败不能把整单带回滚：
      // 端上凭单号在「订单查询 / 重新支付」里再发起一次即可。
      payParams = await this.pay
        .prepay({
          siteId: site.siteId,
          ownerUserId: site.ownerUserId,
          orderNo: order.orderNo,
          amountCents: totalCents,
          description: `${site.name}·${row.name}`,
          openid,
        })
        .catch(() => null);
    }
    return {
      orderNo: order.orderNo,
      totalAmount: fromCents(totalCents),
      quantity,
      payEnabled: Boolean(payParams),
      payParams,
      message: payParams
        ? `请在 ${site.lockMinutes} 分钟内完成支付，超时订单自动关闭、卡密放回库存`
        : totalCents === 0
          ? '优惠券已抵扣全部金额，卡密已直接发放'
          : payEnabled
            ? '下单成功，但支付通道暂时不可用，请稍后用「订单查询」重新发起支付'
            : '该店暂未开通在线收款，请按页面提示联系店方完成付款',
    };
  }

  /** 待支付单重新发起支付（店主配好商户号后买家能接着付，不必重新下单锁卡）。 */
  async repay(
    site: CardShopSiteContext,
    args: { orderNo: string; contact: string; openid: string },
  ): Promise<CardShopPublicOrderCreated> {
    const row = (await this.prisma.cardShopOrder.findFirst({
      where: {
        siteId: site.siteId,
        orderNo: clip(args.orderNo, 40).trim().toUpperCase(),
      },
    })) as unknown as OrderRow | null;
    const contact = clip(args.contact, 120).trim();
    if (!row || (row.contact && contact !== row.contact)) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '订单不存在或联系方式不匹配，请核对单号后重试',
      );
    }
    if (row.payState !== 'PENDING') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `订单当前是${
          CARD_SHOP_ORDER_STATE_LABELS[row.payState] || row.payState
        }，不能重复支付`,
      );
    }
    if (row.expireAt && row.expireAt.getTime() <= Date.now()) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '订单已超过支付时限，请重新下单（卡密已放回库存）',
      );
    }
    const amountCents = toCents(row.totalAmount);
    const payEnabled = await this.pay.available(site.siteId, site.ownerUserId);
    const payParams =
      payEnabled && amountCents > 0
        ? await this.pay.prepay({
            siteId: site.siteId,
            ownerUserId: site.ownerUserId,
            orderNo: row.orderNo,
            amountCents,
            description: `${site.name}·${row.goodsName}`,
            openid: clip(args.openid, 64).trim(),
          })
        : null;
    return {
      orderNo: row.orderNo,
      totalAmount: amount(row.totalAmount),
      quantity: row.quantity,
      payEnabled: Boolean(payParams),
      payParams,
      message: payParams
        ? '请在小程序内完成支付'
        : amountCents === 0
          ? '该单已由优惠券全额抵扣，无需支付'
          : '该店暂未开通在线收款，请按页面提示联系店方',
    };
  }

  /**
   * 支付回调出卡。
   *
   * 幂等：`payState` 用条件更新推进，微信重复回调第二次就是 0 行——直接回「已处理」，不重复出卡。
   * 金额校验：回调的分必须等于订单应收，不等就拒绝出卡并通知店主核对商户号
   * （否则改单号撞别人的低额单就能白拿货）。
   *
   * `retryable` 是给公开通道回微信应答用的：只有「单号暂时查不到」这种可能自愈的情况才值得让
   * 微信继续重投；金额不符、单已关闭都是确定性结果，回 FAIL 只会换来一整天的无效重试。
   */
  async handlePaidNotify(
    site: CardShopSiteContext,
    notify: {
      outTradeNo: string;
      transactionId: string;
      tradeState: string;
      amountCents: number;
      mchId: string;
    },
    ip: string,
  ): Promise<{ handled: boolean; retryable?: boolean; message: string }> {
    if (notify.tradeState !== 'SUCCESS') {
      return {
        handled: false,
        retryable: false,
        message: `支付状态 ${notify.tradeState || '未知'}，暂不出卡`,
      };
    }
    const row = (await this.prisma.cardShopOrder.findFirst({
      where: {
        siteId: site.siteId,
        orderNo: clip(notify.outTradeNo, 40).trim().toUpperCase(),
      },
    })) as unknown as OrderRow | null;
    if (!row)
      return {
        handled: false,
        retryable: true,
        message: '回调对应的订单不存在',
      };
    if (row.payState === 'PAID') {
      return {
        handled: true,
        retryable: false,
        message: '订单已出卡，重复回调忽略',
      };
    }
    if (row.payState !== 'PENDING') {
      // 钱已进商户号但单被关掉（超时关单与回调竞速）：卡没发，必须让店主知道要退钱
      await this.prisma.cardShopOrder.updateMany({
        where: { id: row.id, siteId: site.siteId },
        data: {
          failReason: `订单${
            CARD_SHOP_ORDER_STATE_LABELS[row.payState] || row.payState
          }后收到支付回调（商户号 ${clip(notify.mchId, 32)}），请人工退款`,
        },
      });
      void this.notifyOwner(
        site,
        row,
        '已关闭的订单收到支付回调，请人工退款',
        `应收 ${amount(row.totalAmount).toFixed(2)} 元已由微信收进商户号，但订单状态是${
          CARD_SHOP_ORDER_STATE_LABELS[row.payState] || row.payState
        }，卡密未发放。`,
        'error',
      );
      return { handled: false, message: '订单已关闭，未出卡' };
    }
    if (notify.amountCents !== toCents(row.totalAmount)) {
      await this.prisma.cardShopOrder.updateMany({
        where: { id: row.id, siteId: site.siteId },
        data: {
          failReason: `回调金额 ${notify.amountCents} 分与订单应收 ${toCents(row.totalAmount)} 分不符`,
        },
      });
      void this.notifyOwner(
        site,
        row,
        '支付回调金额与订单不符，未出卡',
        `商户号 ${clip(notify.mchId, 32)} 回调 ${notify.amountCents} 分，订单应收 ${toCents(
          row.totalAmount,
        )} 分，请核对商户号与本站点的绑定关系。`,
        'error',
      );
      return { handled: false, message: '金额不一致，拒绝出卡' };
    }
    const delivered = await this.deliver(
      site,
      row,
      notify.transactionId,
      ip,
      '支付成功',
    );
    return {
      handled: true,
      message: delivered
        ? '已出卡'
        : '已标记支付成功，但可用卡密不足，已通知店主补卡',
    };
  }

  /**
   * 查单取卡：单号 + 联系方式（+ 取卡密码）。
   *
   * 「单号不存在」和「联系方式不对」给同一句话：能区分就等于给探测单号的人当 oracle。
   * 只有取卡密码错误单独提示——买家真的只会输错密码，而不是输错自己的联系方式。
   */
  async query(
    site: CardShopSiteContext,
    args: { orderNo: string; contact: string; takeCardPassword: string },
  ): Promise<CardShopPublicQueryResult> {
    const orderNo = clip(args.orderNo, 40).trim().toUpperCase();
    const notFound: CardShopPublicQueryResult = {
      found: false,
      payState: 'PENDING',
      payStateLabel: CARD_SHOP_ORDER_STATE_LABELS.PENDING,
      orderNo,
      goodsName: '',
      quantity: 0,
      totalAmount: 0,
      createdAt: '',
      paidAt: '',
      cards: [],
      remark: '',
      cardFormat: 'SINGLE',
      needTakeCardPassword: false,
      message: '没有查到这笔订单：请核对单号与下单时填写的联系方式',
    };
    if (!orderNo) return notFound;
    const row = (await this.prisma.cardShopOrder.findFirst({
      where: { siteId: site.siteId, orderNo },
    })) as unknown as OrderRow | null;
    if (!row) return notFound;
    const contact = clip(args.contact, 120).trim();
    if (row.contact && contact !== row.contact) return notFound;
    const goods = await this.prisma.cardShopProduct.findFirst({
      where: { id: row.goodsId, siteId: site.siteId },
      select: { remark: true, takeCardMode: true },
    });
    const base: CardShopPublicQueryResult = {
      found: true,
      payState: row.payState as CardShopPublicQueryResult['payState'],
      payStateLabel: CARD_SHOP_ORDER_STATE_LABELS[row.payState] || row.payState,
      orderNo: row.orderNo,
      goodsName: row.goodsName,
      quantity: row.quantity,
      totalAmount: amount(row.totalAmount),
      createdAt: iso(row.createdAt),
      paidAt: row.paidAt ? iso(row.paidAt) : '',
      cards: [],
      remark: goods?.remark ?? '',
      cardFormat: cardFormat(row.cardFormat),
      needTakeCardPassword: false,
      message: '',
    };
    if (row.payState !== 'PAID') {
      return {
        ...base,
        message:
          row.payState === 'PENDING'
            ? '订单还没支付，完成支付后即可看到卡密'
            : `订单${base.payStateLabel}，没有可取的卡密`,
      };
    }
    const input = String(args.takeCardPassword ?? '').trim();
    if (row.takeCardPasswordHash) {
      if (!input) {
        return {
          ...base,
          needTakeCardPassword: true,
          message: '该订单设置了取卡密码，请输入后查看卡密',
        };
      }
      if (!verifySecret(row.orderNo, input, row.takeCardPasswordHash)) {
        return {
          ...base,
          needTakeCardPassword: true,
          message: '取卡密码不正确，请再试一次或联系店方',
        };
      }
    } else if (takeCardMode(goods?.takeCardMode) === 'REQUIRED') {
      return {
        ...base,
        needTakeCardPassword: true,
        message: '该商品要求取卡密码，但这单下单时没有设置，请联系店方处理',
      };
    }
    const cards = await this.prisma.cardShopOrderCard.findMany({
      where: { orderId: row.id, siteId: site.siteId },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      take: QUANTITY_MAX,
    });
    return {
      ...base,
      cards: cards.map(toOrderCard),
      message: cards.length
        ? `共 ${cards.length} 张卡密，请立即保存；本页可凭单号 + 联系方式再次查询`
        : '订单已支付但还没有出货记录，请联系店方',
    };
  }

  /** 我的订单（微信登录的顾客）：只给状态与金额，卡密仍要回查询页过三要素。 */
  async myOrders(
    site: CardShopSiteContext,
    openid: string,
    query: Record<string, unknown>,
  ): Promise<PageResponse<CardShopOrder>> {
    const { page, pageSize, offset } = pageArgs(query);
    const normalized = clip(openid, 64).trim();
    if (!normalized) return pageOf([], 0, page, pageSize);
    const where: Record<string, unknown> = {
      siteId: site.siteId,
      openid: normalized,
    };
    const state = textOf(query.payState);
    if (isOrderState(state)) where.payState = state;
    const [rows, total] = await Promise.all([
      this.prisma.cardShopOrder.findMany({
        where,
        orderBy: [{ id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.cardShopOrder.count({ where }),
    ]);
    // 来源 IP 属于店主侧取证信息，不下发给买家
    return pageOf(
      (rows as unknown as OrderRow[]).map((row) => ({
        ...toOrder(row),
        createIp: '',
      })),
      total,
      page,
      pageSize,
    );
  }

  // ================================================================ 调度器

  /**
   * 释放超时锁卡：过期的 PENDING 单关单，卡与券放回库存。
   * 再兜一层「卡上锁已过期但订单已不是待支付」的残渣——回调与关单并发时会留下这种卡。
   */
  async releaseExpiredLocks(): Promise<{ orders: number; cards: number }> {
    const now = new Date();
    const stale = await this.prisma.cardShopOrder.findMany({
      where: { payState: 'PENDING', expireAt: { lt: now } },
      select: { id: true, siteId: true, couponId: true },
      take: 200,
    });
    let orders = 0;
    for (const row of stale) {
      try {
        await this.closeOrder(
          this.prisma,
          row.siteId,
          row.id,
          row.couponId,
          '超时未支付，系统自动关闭',
        );
        orders += 1;
      } catch {
        // 单笔失败不影响其它订单，下一轮再试
      }
    }
    const orphan = await this.prisma.cardShopCard.updateMany({
      where: { status: 'LOCKED', lockExpireAt: { lt: now } },
      data: { status: 'AVAILABLE', lockOrderId: 0, lockExpireAt: null },
    });
    return { orders, cards: orphan.count };
  }

  // ================================================================ 内部

  /**
   * 建单 + 锁卡 + 占券：一个事务，任何一步不成就整体回滚。
   * 单号撞唯一约束（P2002）时整笔重试，最多 3 次。
   */
  private async createWithLock(input: {
    site: CardShopSiteContext;
    goods: ProductRow;
    quantity: number;
    unitCents: number;
    productCents: number;
    discountCents: number;
    totalCents: number;
    couponId: number;
    contact: string;
    email: string;
    takeCardPassword: string;
    expireAt: Date;
    ip: string;
    openid: string;
    customerId: number;
  }): Promise<{ id: number; orderNo: string }> {
    const { site, goods } = input;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      // 单号在事务外先生成：取卡密码的盐就是它，所以必须在写库前定下来
      const orderNo = cardShopNo('CS');
      try {
        return await this.prisma.$transaction(async (tx) => {
          const created = await tx.cardShopOrder.create({
            data: {
              siteId: site.siteId,
              ownerUserId: site.ownerUserId,
              orderNo,
              goodsId: goods.id,
              goodsName: clip(goods.name, 200),
              goodsCover: clip(goods.coverImage, 500),
              cardFormat: cardFormat(goods.cardFormat),
              unitPrice: fromCents(input.unitCents),
              quantity: input.quantity,
              productAmount: fromCents(input.productCents),
              couponId: input.couponId,
              discountAmount: fromCents(input.discountCents),
              totalAmount: fromCents(input.totalCents),
              notifyEmail: input.email,
              contact: input.contact,
              // 取卡密码摘要用单号当盐：离线拿到库也撞不出买家自设的 4-16 位口令
              takeCardPasswordHash: input.takeCardPassword
                ? hashSecret(orderNo, input.takeCardPassword)
                : '',
              payState: 'PENDING',
              createIp: input.ip,
              openid: input.openid,
              customerId: input.customerId,
              expireAt: input.expireAt,
            },
          });
          if (
            !(await this.lockCards(
              tx,
              site,
              goods,
              input.quantity,
              created.id,
              input.expireAt,
            ))
          ) {
            throw new BusinessException(
              ErrorCode.CONFLICT,
              `库存不足：该商品可售卡密少于 ${input.quantity} 张，请减少数量或稍后再试`,
            );
          }
          if (input.couponId) {
            const held = await this.coupons.lock(
              tx,
              input.couponId,
              site.siteId,
              created.id,
            );
            if (!held) {
              throw new BusinessException(
                ErrorCode.CONFLICT,
                '优惠券刚被其它订单占用，请去掉券码重试',
              );
            }
          }
          if (input.totalCents === 0) {
            await this.deliverInside(
              tx,
              site,
              created.id,
              input.ip,
              '券全额抵扣，免支付出卡',
            );
            await tx.cardShopOrder.update({
              where: { id: created.id },
              data: {
                payState: 'PAID',
                paidAt: new Date(),
                transactionId: 'FREE',
                expireAt: null,
              },
            });
          }
          return { id: created.id, orderNo: created.orderNo };
        });
      } catch (error) {
        if (isUniqueViolation(error)) continue;
        throw error;
      }
    }
    throw new BusinessException(
      ErrorCode.CONFLICT,
      '订单号连续撞车，请稍后重试',
    );
  }

  /**
   * 条件更新占卡：取候选 id → 一条带 `status='AVAILABLE'` 的 updateMany → 看占到的行数。
   * 占不满购买量直接返回 false，由调用方回滚整个下单事务。
   */
  private async lockCards(
    db: Db,
    site: CardShopSiteContext,
    goods: Pick<ProductRow, 'id' | 'cardOrderMode'>,
    quantity: number,
    orderId: number,
    expireAt: Date,
  ): Promise<boolean> {
    const mode = cardOrderMode(goods.cardOrderMode || site.cardOrderMode);
    const random = mode === 'RANDOM' && quantity <= RANDOM_POOL_MAX;
    const take = Math.min(
      random
        ? Math.min(RANDOM_POOL_MAX, quantity + LOCK_WINDOW_EXTRA)
        : quantity + LOCK_WINDOW_EXTRA,
      LOCK_QUERY_MAX,
    );
    const candidates = await db.cardShopCard.findMany({
      where: {
        siteId: site.siteId,
        goodsId: goods.id,
        status: 'AVAILABLE',
        trashedAt: null,
      },
      select: { id: true },
      orderBy:
        mode === 'NEWEST'
          ? [{ seq: 'desc' }, { id: 'desc' }]
          : [{ seq: 'asc' }, { id: 'asc' }],
      take,
    });
    if (candidates.length < quantity) return false;
    const ids = random
      ? shuffle(candidates.map((row) => row.id)).slice(0, quantity)
      : candidates.slice(0, quantity).map((row) => row.id);
    const changed = await db.cardShopCard.updateMany({
      where: {
        id: { in: ids },
        siteId: site.siteId,
        goodsId: goods.id,
        status: 'AVAILABLE',
        trashedAt: null,
      },
      data: { status: 'LOCKED', lockOrderId: orderId, lockExpireAt: expireAt },
    });
    return changed.count === quantity;
  }

  /**
   * 出卡：推进订单状态（条件更新做幂等闸），再把本单锁住的卡改成已售、写快照。
   * 抢不到状态推进的事务把自己多占的卡放回库存，所以微信重复回调不会重复发货。
   */
  private async deliver(
    site: CardShopSiteContext,
    order: OrderRow,
    transactionId: string,
    ip: string,
    reason: string,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const paid = await tx.cardShopOrder.updateMany({
        where: { id: order.id, siteId: site.siteId, payState: 'PENDING' },
        data: {
          payState: 'PAID',
          paidAt: new Date(),
          transactionId: clip(transactionId, 64),
          expireAt: null,
        },
      });
      if (paid.count !== 1) return false;
      const complete = await this.deliverInside(tx, site, order.id, ip, reason);
      if (!complete) {
        void this.notifyOwner(
          site,
          order,
          '已收款但卡密不足',
          `应发 ${order.quantity} 张但库存不够，卡已部分或全部未发放。请到订单详情补卡后让买家重新查询；本单已标记为已支付，钱款已在您的商户号。`,
          'warning',
        );
      }
      void this.notifySold(site, order);
      return complete;
    });
  }

  /**
   * 真正写快照、把 LOCKED 卡改成 SOLD 的一步。
   * 返回 false 表示库存不够（部分出卡）：订单仍算已支付，缺口由店主补。
   */
  private async deliverInside(
    tx: Prisma.TransactionClient,
    site: CardShopSiteContext,
    orderId: number,
    ip: string,
    reason: string,
  ): Promise<boolean> {
    const order = await tx.cardShopOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        goodsId: true,
        quantity: true,
        couponId: true,
        customerId: true,
      },
    });
    if (!order) return false;
    const goods = await tx.cardShopProduct.findFirst({
      where: { id: order.goodsId, siteId: site.siteId },
      select: { id: true, cardOrderMode: true },
    });
    if (!goods) return false;
    const heldWhere = {
      siteId: site.siteId,
      lockOrderId: orderId,
      status: 'LOCKED',
    } as const;
    let held = (await tx.cardShopCard.findMany({
      where: heldWhere,
      select: { id: true, number: true, secret: true },
      take: QUANTITY_MAX,
    })) as unknown as Array<{ id: number; number: string; secret: string }>;
    if (held.length < order.quantity) {
      // 锁卡到期被调度器收回后钱才到的场景：按当前库存重新占够缺口
      await this.lockCards(
        tx,
        site,
        goods,
        order.quantity - held.length,
        orderId,
        new Date(),
      );
      held = await tx.cardShopCard.findMany({
        where: heldWhere,
        select: { id: true, number: true, secret: true },
        take: QUANTITY_MAX,
      });
    }
    if (!held.length) return false;
    const now = new Date();
    const sold = await tx.cardShopCard.updateMany({
      where: {
        id: { in: held.map((card) => card.id) },
        siteId: site.siteId,
        status: 'LOCKED',
      },
      data: {
        status: 'SOLD',
        soldOrderId: orderId,
        soldAt: now,
        soldIp: clip(ip, 64),
        lockExpireAt: null,
        lockOrderId: 0,
      },
    });
    await tx.cardShopOrderCard.createMany({
      data: held.map((card, index) => ({
        orderId,
        siteId: site.siteId,
        cardId: card.id,
        number: card.number,
        secret: card.secret,
        sort: index + 1,
      })),
    });
    await tx.cardShopOrder.update({
      where: { id: orderId },
      data: {
        cardCount: sold.count,
        failReason:
          sold.count < order.quantity
            ? `${reason}：应发 ${order.quantity} 张、实发 ${sold.count} 张，请店主补卡`
            : '',
      },
    });
    await tx.cardShopProduct.updateMany({
      where: { id: order.goodsId, siteId: site.siteId },
      data: { soldCount: { increment: sold.count } },
    });
    if (order.couponId) {
      await this.coupons.use(tx, order.couponId, site.siteId, orderId);
    }
    await this.customers.touchOrder(tx, site.siteId, order.customerId);
    return sold.count >= order.quantity;
  }

  /** 关单：卡回库存、券回未使用、订单置 CLOSED。 */
  private async closeOrder(
    db: Db,
    siteId: number,
    orderId: number,
    couponId: number,
    reason: string,
  ): Promise<void> {
    await db.cardShopCard.updateMany({
      where: { siteId, lockOrderId: orderId, status: 'LOCKED' },
      data: { status: 'AVAILABLE', lockOrderId: 0, lockExpireAt: null },
    });
    if (couponId) await this.coupons.release(db, couponId, siteId, orderId);
    await db.cardShopOrder.updateMany({
      where: { id: orderId, siteId, payState: 'PENDING' },
      data: {
        payState: 'CLOSED',
        closedAt: new Date(),
        failReason: clip(reason, 300),
        expireAt: null,
      },
    });
  }

  private notifyOwner(
    site: { siteId: number; ownerUserId: string },
    order: { id: number; orderNo: string },
    title: string,
    body: string,
    level: 'info' | 'warning' | 'error',
  ): void {
    void this.notifications
      .notify(site.ownerUserId, {
        category: 'biz',
        title: `卡密商城：${title}（订单 ${order.orderNo}）`,
        body,
        link: `/card-shop/order?siteId=${site.siteId}&id=${order.id}`,
        level,
        entityType: 'card_shop_order',
        entityId: order.id,
      })
      .catch(() => undefined);
  }

  /**
   * 售出通知：站内消息给店主（`notifyFlags.merchantStation` 显式关掉才不发）。
   * 邮件侧本期不做——平台没有面向买家的发信通道，硬开关只会让店主以为买家收到了。
   */
  private async notifySold(
    site: CardShopSiteContext,
    order: OrderRow,
  ): Promise<void> {
    const goods = await this.prisma.cardShopProduct.findFirst({
      where: { id: order.goodsId, siteId: site.siteId },
      select: { notifyFlags: true },
    });
    const flags = mergeJson<{ merchantStation?: boolean }>(goods?.notifyFlags, {
      merchantStation: true,
    });
    if (flags.merchantStation === false) return;
    void this.notifyOwner(
      site,
      order,
      '有新订单已支付出卡',
      `「${order.goodsName}」售出 ${order.quantity} 张，实收 ${amount(
        order.totalAmount,
      ).toFixed(2)} 元。`,
      'info',
    );
  }

  /** 买家可见商品行：成本、券本、卡密一律不出这扇门。 */
  private async toPublicGoods(
    site: CardShopSiteContext,
    rows: ProductRow[],
  ): Promise<CardShopPublicGoods[]> {
    if (!rows.length) return [];
    const stockMap = await this.goods.stockOf(
      site.siteId,
      rows.map((row) => row.id),
    );
    return rows.map((row) => {
      const counts = stockMap.get(row.id) ?? {
        available: 0,
        locked: 0,
        sold: 0,
      };
      const level = this.goods.buildStock(
        counts,
        site.stockDisplayMode,
        Number(row.stockWarn || 0),
      );
      const price = amount(row.price);
      return {
        id: row.id,
        categoryId: row.categoryId,
        name: row.name,
        subtitle: row.subtitle,
        coverImage: row.coverImage,
        images: jsonList<string>(row.images).map((url) => clip(url, 500)),
        price,
        marketPrice: amount(row.marketPrice),
        wholesaleTiers: normalizeTiers(row.wholesaleTiers, price),
        limitQuantity: Number(row.limitQuantity || 0),
        maxQuantity: Number(row.maxQuantity || 0),
        couponEnabled: row.couponEnabled && site.toggles.coupon !== false,
        takeCardMode: takeCardMode(row.takeCardMode),
        needVisitPassword: Boolean(row.visitPassword),
        contactMode: contactMode(row.contactMode),
        cardFormat: cardFormat(row.cardFormat),
        intro: row.intro,
        detail: row.detail,
        remark: row.remark,
        soldCount: Number(row.soldCount || 0),
        viewCount: Number(row.viewCount || 0),
        stock: level,
        // RANGE 口径不报数字：精确库存会教人挑时机抢购，也暴露店主的进货节奏
        stockCount: site.stockDisplayMode === 'ACTUAL' ? counts.available : 0,
      };
    });
  }
}

// ---------------------------------------------------------------- 纯函数

/** RANDOM 出卡用洗牌，其余口径直接按 seq 取前 N 行。 */
function shuffle<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'P2002'
  );
}

function isOrderState(value: string): boolean {
  return ['PENDING', 'PAID', 'CLOSED', 'REFUNDED'].includes(value);
}

function orderWhere(
  siteId: number,
  query: Record<string, unknown>,
): Record<string, unknown> {
  const where: Record<string, unknown> = { siteId };
  const state = textOf(query.payState);
  if (isOrderState(state)) where.payState = state;
  const goodsId = Number(query.goodsId || 0);
  if (goodsId > 0) where.goodsId = goodsId;
  const keyword = clip(query.keyword, 60).trim();
  if (keyword) {
    where.OR = [
      { orderNo: { contains: keyword } },
      { contact: { contains: keyword } },
      { goodsName: { contains: keyword } },
      { transactionId: { contains: keyword } },
    ];
  }
  const range = dayRange(query.from, query.to);
  if (range.gte || range.lte) {
    where.createdAt = {
      ...(range.gte ? { gte: range.gte } : {}),
      ...(range.lte ? { lte: range.lte } : {}),
    };
  }
  return where;
}

function toOrderCard(card: {
  id: number;
  number: string;
  secret: string;
  sort: number;
}): { id: number; number: string; secret: string; sort: number } {
  return {
    id: card.id,
    number: card.number,
    secret: card.secret,
    sort: card.sort,
  };
}

function toOrder(row: OrderRow): CardShopOrder {
  return {
    id: row.id,
    siteId: row.siteId,
    orderNo: row.orderNo,
    goodsId: row.goodsId,
    goodsName: row.goodsName,
    goodsCover: row.goodsCover,
    cardFormat: cardFormat(row.cardFormat),
    unitPrice: amount(row.unitPrice),
    quantity: row.quantity,
    productAmount: amount(row.productAmount),
    couponId: row.couponId,
    discountAmount: amount(row.discountAmount),
    totalAmount: amount(row.totalAmount),
    contact: row.contact,
    notifyEmail: row.notifyEmail,
    payState: row.payState as CardShopOrder['payState'],
    payStateLabel: CARD_SHOP_ORDER_STATE_LABELS[row.payState] || row.payState,
    transactionId: row.transactionId,
    paidAt: row.paidAt ? iso(row.paidAt) : null,
    closedAt: row.closedAt ? iso(row.closedAt) : null,
    expireAt: row.expireAt ? iso(row.expireAt) : null,
    cardCount: row.cardCount,
    customerId: row.customerId,
    openid: row.openid,
    createIp: row.createIp,
    failReason: row.failReason,
    createdAt: iso(row.createdAt),
  };
}
