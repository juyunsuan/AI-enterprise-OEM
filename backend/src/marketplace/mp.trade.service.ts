import type {
  MpAddress,
  MpAddressSaveBody,
  MpCartAddBody,
  MpCartItem,
  MpCustomer,
  MpCustomerLoginBody,
  MpCustomerLoginResult,
  MpOrder,
  MpOrderCreateBody,
  MpOrderCreated,
  MpPublicBootstrap,
  MpPublicProduct,
  MpPublicProductDetail,
  MpShopOrder,
  MpShopOrderItem,
  MpShopOrderShipBody,
  MpSettlePreview,
  MpSettleShop,
  PageResponse,
} from '@enterprise/contracts';
import { pageParam } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { resolveSiteUrl } from '../common/site-url';
import type { PrismaService } from '../prisma/prisma.service';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { MiniProgramClient } from '../miniprogram/miniprogram.client';
import type { MpFinanceService } from './mp.finance.service';
import type {
  MpCouponService,
  MpCouponUsage,
  MpCouponLine,
} from './mp.coupon.service';
import type { MpDiyService } from './mp.diy.service';
import type { MpFollowService } from './mp.follow.service';
import {
  issueCustomerToken,
  parseCustomerToken,
} from '../private-mini/customer-token';
import { commerceOrderNo } from '../commerce-core/ident';
import type {
  MpCartItem as MpCartRow,
  MpCustomer as MpCustomerRow,
  MpCustomerAddress as MpAddressRow,
  MpMarket as MpMarketRow,
  MpOrder as MpOrderRow,
  MpOrderItem as MpOrderItemRow,
  MpProduct as MpProductRow,
  MpProductSku as MpProductSkuRow,
  MpShop as MpShopRow,
  MpShopOrder as MpShopOrderRow,
} from '../../generated/prisma';
import type { MpMerchantTokenPayload } from './mp.token';
import type { MpMerchantService } from './mp.merchant.service';
import type { MpPayService } from './mp.pay.service';
import { noopMpScrmSink, type MpScrmSink } from './mp.scrm.service';
import { scrmCustomerLabel } from '../commerce-core/scrm-port';
import { toolOpen } from '../tool-launch/tool-launch.holder';
import {
  decimalOf,
  iso,
  jsonObject,
  numberIn,
  textOf,
  themeColorOf,
} from './mp.shared';

type BuyerContext = {
  market: MpMarketRow;
  customer: MpCustomerRow;
  openid: string;
};

type CartLine = {
  cart: MpCartRow;
  product: MpProductRow;
  sku: MpProductSkuRow | null;
  shop: MpShopRow;
  price: number;
  quantity: number;
  totalPrice: number;
  freight: number;
};

type PricedShop = {
  shop: MpShopRow;
  rate: number;
  lines: CartLine[];
  goodsAmount: number;
  freightAmount: number;
  discountAmount: number;
  payAmount: number;
  commissionAmount: number;
};

const DEFAULT_CLOSE_MINUTES = 30;

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function addressText(row: {
  receiverProvince: string;
  receiverCity: string;
  receiverDistrict: string;
  receiverDetail: string;
}): string {
  return `${row.receiverProvince}${row.receiverCity}${row.receiverDistrict}${row.receiverDetail}`;
}

/**
 * 多店铺商城·买家交易链路。
 *
 * 一次结算拆成「父单 + N 张商户子单」：
 * - 父单只承载支付与整体状态，钱一次进市场运营方商户号；
 * - 子单是商户发货、售后、结算的单位，抽佣比例在下单瞬间快照；
 * - 购物车行、下单、取消、履约都带 `marketId + customerId` 双条件，跨市场不可见。
 */
export class MpTradeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly merchants: MpMerchantService,
    private readonly miniApp: MiniAppService,
    private readonly client: MiniProgramClient,
    private readonly pay: MpPayService,
    private readonly finance: MpFinanceService,
    private readonly diy: MpDiyService,
    private readonly coupons: MpCouponService,
    private readonly follows: MpFollowService,
    private readonly scrm: MpScrmSink = noopMpScrmSink,
  ) {}

  // ------------------------------------------------------------ 公开浏览

  async bootstrap(
    marketCode: string,
    customerId = 0,
  ): Promise<MpPublicBootstrap> {
    const market = await this.marketByCode(marketCode);
    const [categories, shops, home, desk] = await Promise.all([
      this.prisma.mpCategory.findMany({
        where: { marketId: market.id, status: 'ONLINE' },
        orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.mpShop.findMany({
        where: { marketId: market.id, status: 'ONLINE' },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
      this.diy.marketHome(market.id),
      market.supportSiteId > 0
        ? this.prisma.serviceDeskSite.findFirst({
            where: {
              id: market.supportSiteId,
              ownerUserId: market.ownerUserId,
              enabled: true,
            },
            select: { siteKey: true },
          })
        : Promise.resolve(null),
    ]);
    const apiBase = desk
      ? (await resolveSiteUrl(this.prisma)).replace(/\/+$/, '')
      : '';
    const followed = customerId
      ? await this.follows.followedShopIds(
          market.id,
          customerId,
          shops.map((row) => row.id),
        )
      : new Set<number>();
    return {
      market: {
        id: market.id,
        name: market.name,
        logo: market.logo,
        description: market.description,
        themeColor: themeColorOf(market.themeJson),
        shopCode: market.shopCode,
        home,
        deskSiteKey: desk ? desk.siteKey : '',
        deskEmbedUrl:
          desk && apiBase
            ? `${apiBase}/embed/service-desk?key=${encodeURIComponent(desk.siteKey)}`
            : '',
      },
      categories: categories.map((row) => ({
        id: row.id,
        parentId: row.parentId,
        name: row.name,
        icon: row.icon,
        sortOrder: row.sortOrder,
      })),
      shops: shops.map((row) => this.publicShop(row, followed.has(row.id))),
    };
  }

  /** 店铺首页装修：店铺必须在线；未发布过回 null，端上回落默认店铺页。 */
  async shopDiy(marketCode: string, shopId: number) {
    const market = await this.marketByCode(marketCode);
    const shop = await this.prisma.mpShop.findFirst({
      where: { id: shopId, marketId: market.id, status: 'ONLINE' },
      select: { id: true },
    });
    if (!shop) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '店铺不存在或已停业');
    }
    return this.diy.shopHome(market.id, shop.id);
  }

  /** 供券 / 关注等买家侧服务复用身份校验（令牌里的 marketId 只作入口）。 */
  requireBuyer(token: string, write = false) {
    return this.buyer(token, write);
  }

  requireMarket(code: string) {
    return this.marketByCode(code);
  }

  /** 公开 bootstrap 用：令牌无效不报错，仅视为未登录（游客浏览不受影响）。 */
  optionalCustomerId(token: string): number {
    if (!token) return 0;
    try {
      const payload = parseCustomerToken(token);
      return payload.scene === 'MARKET' ? payload.customerId : 0;
    } catch {
      return 0;
    }
  }

  async products(query: {
    marketCode: string;
    keyword?: string;
    shopId?: number;
    categoryId?: number;
    page?: unknown;
    pageSize?: unknown;
  }): Promise<PageResponse<MpPublicProduct>> {
    const market = await this.marketByCode(query.marketCode);
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
    );
    const keyword = String(query.keyword || '').trim();
    const shopId = Number(query.shopId || 0);
    const categoryId = Number(query.categoryId || 0);
    const where = {
      marketId: market.id,
      status: 'ONLINE',
      ...(shopId > 0 ? { shopId } : {}),
      ...(categoryId > 0 ? { categoryId } : {}),
      ...(keyword ? { title: { contains: keyword } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.mpProduct.count({ where }),
      this.prisma.mpProduct.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
    ]);
    const shopMap = await this.shopNames(rows.map((row) => row.shopId));
    return {
      list: rows.map((row) =>
        this.publicProduct(row, shopMap.get(row.shopId) ?? ''),
      ),
      total,
      page,
      pageSize,
    };
  }

  async productDetail(
    marketCode: string,
    id: number,
  ): Promise<MpPublicProductDetail> {
    const market = await this.marketByCode(marketCode);
    const product = await this.prisma.mpProduct.findFirst({
      where: { id, marketId: market.id, status: 'ONLINE' },
    });
    if (!product) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '商品不存在或已下架');
    }
    const [shop, skus] = await Promise.all([
      this.prisma.mpShop.findFirst({ where: { id: product.shopId } }),
      this.prisma.mpProductSku.findMany({
        where: { productId: product.id, enabled: true },
        orderBy: { id: 'asc' },
      }),
    ]);
    if (!shop || shop.status !== 'ONLINE') {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '店铺休息中，暂时无法购买',
      );
    }
    return {
      product: this.publicProduct(product, shop.name),
      detail: product.detail,
      images: this.strings(product.images),
      specs: this.specs(product.specs),
      guarantee: this.strings(product.guarantee),
      skus: skus.map((sku) => ({
        id: sku.id,
        skuName: sku.skuName,
        image: sku.image,
        uniqueId: sku.uniqueId,
        specValues: Object.fromEntries(
          Object.entries(jsonObject(sku.specValues)).map(([key, value]) => [
            key,
            textOf(value),
          ]),
        ),
        price: decimalOf(sku.price) ?? 0,
        marketPrice: decimalOf(sku.marketPrice) ?? 0,
        costPrice: 0,
        stock: sku.stock,
        sales: sku.sales,
        weight: Number(sku.weight),
        barcode: sku.barcode,
        enabled: sku.enabled,
      })),
      shop: this.publicShop(shop),
    };
  }

  // ------------------------------------------------------------ 顾客会话

  async login(body: MpCustomerLoginBody): Promise<MpCustomerLoginResult> {
    const market = await this.marketByCode(body.marketCode);
    if (market.status !== 'ONLINE') {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该市场尚未营业，暂时无法登录',
      );
    }
    const runtime = await this.miniApp.requireRuntime({
      ownerUserId: market.ownerUserId,
      scene: 'MARKET',
      shopId: market.id,
      shopName: market.name,
    });
    const session = await this.client.code2Session(runtime, body.code);
    const row = await this.prisma.mpCustomer.upsert({
      where: {
        marketId_openid: { marketId: market.id, openid: session.openId },
      },
      create: {
        marketId: market.id,
        openid: session.openId,
        unionId: session.unionId || '',
        nickname: body.nickname,
        avatar: body.avatar,
        source: 'MINIPROGRAM',
        lastLoginAt: new Date(),
      },
      update: {
        ...(session.unionId ? { unionId: session.unionId } : {}),
        ...(body.nickname ? { nickname: body.nickname } : {}),
        ...(body.avatar ? { avatar: body.avatar } : {}),
        lastLoginAt: new Date(),
      },
    });
    if (row.status !== 'ACTIVE') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '账号已被市场限制下单，请联系市场客服',
      );
    }
    return {
      token: issueCustomerToken({
        scene: 'MARKET',
        shopId: market.id,
        customerId: row.id,
        openid: row.openid,
      }),
      customer: this.customerView(row, market),
    };
  }

  async profile(token: string): Promise<MpCustomer> {
    const { market, customer } = await this.buyer(token);
    return this.customerView(customer, market);
  }

  // ------------------------------------------------------------ 地址

  async addresses(token: string): Promise<MpAddress[]> {
    const { market, customer } = await this.buyer(token);
    const rows = await this.prisma.mpCustomerAddress.findMany({
      where: { marketId: market.id, customerId: customer.id },
      orderBy: [{ isDefault: 'desc' }, { id: 'desc' }],
    });
    return rows.map((row) => this.addressView(row));
  }

  async addressSave(
    token: string,
    body: MpAddressSaveBody,
  ): Promise<MpAddress> {
    const { market, customer } = await this.buyer(token, true);
    const existing =
      body.id > 0
        ? await this.prisma.mpCustomerAddress.findFirst({
            where: {
              id: body.id,
              marketId: market.id,
              customerId: customer.id,
            },
          })
        : null;
    if (body.id > 0 && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '地址不存在');
    }
    const row = await this.prisma.$transaction(async (tx) => {
      if (body.isDefault) {
        await tx.mpCustomerAddress.updateMany({
          where: { marketId: market.id, customerId: customer.id },
          data: { isDefault: false },
        });
      }
      const data = {
        marketId: market.id,
        customerId: customer.id,
        realName: body.realName,
        phone: body.phone,
        province: body.province,
        city: body.city,
        district: body.district,
        detail: body.detail,
        postalCode: body.postalCode,
        isDefault: body.isDefault,
        tag: body.tag,
      };
      return existing
        ? tx.mpCustomerAddress.update({ where: { id: existing.id }, data })
        : tx.mpCustomerAddress.create({ data });
    });
    return this.addressView(row);
  }

  async addressRemove(token: string, id: number) {
    const { market, customer } = await this.buyer(token, true);
    const result = await this.prisma.mpCustomerAddress.deleteMany({
      where: { id, marketId: market.id, customerId: customer.id },
    });
    if (result.count === 0) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '地址不存在');
    }
    return { ok: true, message: '地址已删除' };
  }

  // ------------------------------------------------------------ 购物车

  async cart(token: string): Promise<MpCartItem[]> {
    const { market, customer } = await this.buyer(token);
    const rows = await this.prisma.mpCartItem.findMany({
      where: { marketId: market.id, customerId: customer.id },
      orderBy: { id: 'desc' },
    });
    if (rows.length === 0) return [];
    const [products, skus, shops] = await Promise.all([
      this.prisma.mpProduct.findMany({
        where: { id: { in: rows.map((row) => row.productId) } },
      }),
      this.prisma.mpProductSku.findMany({
        where: {
          id: { in: rows.map((row) => row.skuId).filter((id) => id > 0) },
        },
      }),
      this.prisma.mpShop.findMany({
        where: { id: { in: rows.map((row) => row.shopId) } },
      }),
    ]);
    const productMap = new Map(products.map((row) => [row.id, row] as const));
    const skuMap = new Map(skus.map((row) => [row.id, row] as const));
    const shopMap = new Map(shops.map((row) => [row.id, row] as const));
    return rows.map((row) => {
      const product = productMap.get(row.productId);
      const sku = row.skuId > 0 ? skuMap.get(row.skuId) : null;
      const shop = shopMap.get(row.shopId);
      const invalidReason = !product
        ? '商品已删除'
        : product.status !== 'ONLINE'
          ? '商品已下架'
          : !shop || shop.status !== 'ONLINE'
            ? '店铺休息中'
            : row.skuId > 0 && (!sku || !sku.enabled)
              ? '该规格已停售'
              : '';
      return {
        id: row.id,
        shopId: row.shopId,
        shopName: shop?.name ?? '',
        productId: row.productId,
        skuId: row.skuId,
        title: product?.title ?? '商品已删除',
        skuName: sku?.skuName ?? '',
        image: sku?.image || product?.coverImage || '',
        price: decimalOf(sku?.price ?? product?.price) ?? 0,
        quantity: row.quantity,
        stock: sku?.stock ?? product?.stock ?? 0,
        selected: row.selected && !invalidReason,
        invalidReason,
      };
    });
  }

  async cartAdd(token: string, body: MpCartAddBody): Promise<MpCartItem[]> {
    const { market, customer } = await this.buyer(token, true);
    const product = await this.prisma.mpProduct.findFirst({
      where: { id: body.productId, marketId: market.id },
    });
    if (!product || product.status !== 'ONLINE') {
      throw new BusinessException(ErrorCode.NOT_FOUND, '商品不存在或已下架');
    }
    const shop = await this.prisma.mpShop.findFirst({
      where: { id: product.shopId, marketId: market.id },
    });
    if (!shop || shop.status !== 'ONLINE') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '店铺休息中，暂时无法购买',
      );
    }
    const sku =
      body.skuId > 0
        ? await this.prisma.mpProductSku.findFirst({
            where: { id: body.skuId, productId: product.id, enabled: true },
          })
        : null;
    if (body.skuId > 0 && !sku) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '该规格已停售，请重新选择',
      );
    }
    const stock = sku?.stock ?? product.stock;
    if (stock < body.quantity) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '库存不足，请减少购买数量',
      );
    }
    await this.prisma.mpCartItem.upsert({
      where: {
        marketId_customerId_productId_skuId: {
          marketId: market.id,
          customerId: customer.id,
          productId: product.id,
          skuId: sku?.id ?? 0,
        },
      },
      create: {
        marketId: market.id,
        customerId: customer.id,
        shopId: product.shopId,
        productId: product.id,
        skuId: sku?.id ?? 0,
        quantity: body.quantity,
      },
      update: { quantity: { increment: body.quantity }, selected: true },
    });
    return this.cart(token);
  }

  async cartQuantity(token: string, id: number, quantity: number) {
    const { market, customer } = await this.buyer(token, true);
    const row = await this.prisma.mpCartItem.findFirst({
      where: { id, marketId: market.id, customerId: customer.id },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '购物车记录不存在');
    }
    await this.prisma.mpCartItem.update({
      where: { id: row.id },
      data: { quantity },
    });
    return this.cart(token);
  }

  async cartSelect(token: string, id: number, selected: boolean) {
    const { market, customer } = await this.buyer(token, true);
    await this.prisma.mpCartItem.updateMany({
      where: {
        marketId: market.id,
        customerId: customer.id,
        ...(id > 0 ? { id } : {}),
      },
      data: { selected },
    });
    return this.cart(token);
  }

  async cartRemove(token: string, ids: number[]) {
    const { market, customer } = await this.buyer(token, true);
    await this.prisma.mpCartItem.deleteMany({
      where: { id: { in: ids }, marketId: market.id, customerId: customer.id },
    });
    return this.cart(token);
  }

  // ------------------------------------------------------------ 结算与下单

  async settle(
    token: string,
    cartIds: number[],
    couponTicketId = 0,
  ): Promise<MpSettlePreview> {
    const { market, customer } = await this.buyer(token);
    const priced = await this.price(market, customer, cartIds);
    const lines = this.couponLines(priced);
    const [coupons, usage] = await Promise.all([
      this.coupons.options(market.id, customer.id, lines),
      couponTicketId > 0
        ? this.coupons.use(market.id, customer.id, couponTicketId, lines)
        : Promise.resolve(null),
    ]);
    if (usage) this.applyCoupon(priced, usage);
    const goodsAmount = money(
      priced.reduce((sum, row) => sum + row.goodsAmount, 0),
    );
    const freightAmount = money(
      priced.reduce((sum, row) => sum + row.freightAmount, 0),
    );
    const discountAmount = money((usage?.discountCents ?? 0) / 100);
    const address = await this.prisma.mpCustomerAddress.findFirst({
      where: { marketId: market.id, customerId: customer.id },
      orderBy: [{ isDefault: 'desc' }, { id: 'desc' }],
    });
    return {
      marketId: market.id,
      shops: priced.map((group) => this.settleShopView(group)),
      goodsAmount,
      freightAmount,
      discountAmount,
      payAmount: money(goodsAmount + freightAmount - discountAmount),
      couponTicketId: usage?.ticketId ?? 0,
      couponName: usage?.name ?? '',
      couponDiscount: discountAmount,
      coupons,
      address: address ? this.addressView(address) : null,
    };
  }

  async createOrder(
    token: string,
    body: MpOrderCreateBody,
  ): Promise<MpOrderCreated> {
    const { market, customer, openid } = await this.buyer(token, true);
    const address = await this.prisma.mpCustomerAddress.findFirst({
      where: {
        id: body.addressId,
        marketId: market.id,
        customerId: customer.id,
      },
    });
    if (!address) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请选择有效的收货地址',
      );
    }
    const priced = await this.price(market, customer, body.cartIds);
    const usage =
      body.couponTicketId > 0
        ? await this.coupons.use(
            market.id,
            customer.id,
            body.couponTicketId,
            this.couponLines(priced),
          )
        : null;
    if (usage) this.applyCoupon(priced, usage);
    const goodsAmount = money(
      priced.reduce((sum, row) => sum + row.goodsAmount, 0),
    );
    const freightAmount = money(
      priced.reduce((sum, row) => sum + row.freightAmount, 0),
    );
    const discountAmount = money((usage?.discountCents ?? 0) / 100);
    const payAmount = money(goodsAmount + freightAmount - discountAmount);
    if (payAmount <= 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '订单金额必须大于 0');
    }
    const closeMinutes = numberIn(
      jsonObject(market.tradeJson).closeMinutes,
      DEFAULT_CLOSE_MINUTES,
      5,
      1440,
    );
    const orderNo = commerceOrderNo('MP');
    const receiver = {
      receiverName: address.realName,
      receiverPhone: address.phone,
      receiverProvince: address.province,
      receiverCity: address.city,
      receiverDistrict: address.district,
      receiverDetail: address.detail,
    };
    const order = await this.prisma.$transaction(async (tx) => {
      const parent = await tx.mpOrder.create({
        data: {
          marketId: market.id,
          ownerUserId: market.ownerUserId,
          orderNo,
          customerId: customer.id,
          status: 'PENDING_PAYMENT',
          payStatus: 'UNPAID',
          goodsAmount,
          freightAmount,
          discountAmount,
          payAmount,
          couponTicketId: usage?.ticketId ?? 0,
          couponName: usage?.name ?? '',
          shopOrderCount: priced.length,
          ...receiver,
          buyerRemark: body.buyerRemark,
          expireAt: new Date(Date.now() + closeMinutes * 60_000),
        },
      });
      for (const [index, group] of priced.entries()) {
        const child = await tx.mpShopOrder.create({
          data: {
            orderId: parent.id,
            marketId: market.id,
            merchantId: group.shop.merchantId,
            shopId: group.shop.id,
            customerId: customer.id,
            subOrderNo: `${orderNo}-${String(index + 1).padStart(2, '0')}`,
            status: 'PENDING_PAYMENT',
            payStatus: 'UNPAID',
            goodsAmount: money(group.goodsAmount),
            freightAmount: money(group.freightAmount),
            discountAmount: money(group.discountAmount),
            payAmount: money(group.payAmount),
            commissionRate: group.rate,
            commissionAmount: money(group.commissionAmount),
            ...receiver,
            buyerRemark: body.buyerRemark,
          },
        });
        for (const line of group.lines) {
          await tx.mpOrderItem.create({
            data: {
              orderId: parent.id,
              shopOrderId: child.id,
              marketId: market.id,
              merchantId: group.shop.merchantId,
              shopId: group.shop.id,
              customerId: customer.id,
              productId: line.product.id,
              skuId: line.sku?.id ?? 0,
              title: line.product.title,
              skuName: line.sku?.skuName ?? '',
              image: line.sku?.image || line.product.coverImage,
              price: line.price,
              quantity: line.quantity,
              totalPrice: line.totalPrice,
              commissionRate: group.rate,
              commissionAmount: money((line.totalPrice * group.rate) / 100),
            },
          });
          if (line.product.type !== 'VIRTUAL') {
            if (line.sku) {
              const changed = await tx.mpProductSku.updateMany({
                where: { id: line.sku.id, stock: { gte: line.quantity } },
                data: {
                  stock: { decrement: line.quantity },
                  sales: { increment: line.quantity },
                },
              });
              if (changed.count === 0) {
                throw new BusinessException(
                  ErrorCode.CONFLICT,
                  `「${line.product.title}」库存不足，请调整数量后重试`,
                );
              }
            }
            const changed = await tx.mpProduct.updateMany({
              where: { id: line.product.id, stock: { gte: line.quantity } },
              data: {
                stock: { decrement: line.quantity },
                sales: { increment: line.quantity },
              },
            });
            if (changed.count === 0) {
              throw new BusinessException(
                ErrorCode.CONFLICT,
                `「${line.product.title}」库存不足，请调整数量后重试`,
              );
            }
          }
        }
        await tx.mpOrderLog.create({
          data: {
            orderId: parent.id,
            shopOrderId: child.id,
            marketId: market.id,
            shopId: child.shopId,
            operatorType: 'CUSTOMER',
            operatorId: String(customer.id),
            action: 'ORDER_CREATED',
            content: `子单 ${child.subOrderNo} 已生成，等待付款`,
          },
        });
      }
      if (usage) {
        const consumed = await tx.mpCouponTicket.updateMany({
          where: { id: usage.ticketId, status: 'UNUSED' },
          data: { status: 'USED', orderId: parent.id, usedAt: new Date() },
        });
        if (consumed.count === 0) {
          throw new BusinessException(
            ErrorCode.CONFLICT,
            '优惠券已被使用，请返回结算页重新选择',
          );
        }
        await tx.mpCoupon.update({
          where: { id: usage.couponId },
          data: { usedCount: { increment: 1 } },
        });
      }
      await tx.mpOrderLog.create({
        data: {
          orderId: parent.id,
          marketId: market.id,
          operatorType: 'CUSTOMER',
          operatorId: String(customer.id),
          action: 'ORDER_CREATED',
          content: `订单 ${orderNo} 提交，拆为 ${priced.length} 张商户子单`,
        },
      });
      await tx.mpCartItem.deleteMany({
        where: {
          id: { in: body.cartIds },
          marketId: market.id,
          customerId: customer.id,
        },
      });
      return parent;
    });
    return this.withPayParams(market, order, openid);
  }

  async repay(token: string, id: number): Promise<MpOrderCreated> {
    const { market, customer, openid } = await this.buyer(token, true);
    const order = await this.prisma.mpOrder.findFirst({
      where: { id, marketId: market.id, customerId: customer.id },
    });
    if (!order) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    }
    if (order.payStatus !== 'UNPAID' || order.status !== 'PENDING_PAYMENT') {
      throw new BusinessException(ErrorCode.CONFLICT, '订单已支付或已关闭');
    }
    if (order.expireAt && order.expireAt.getTime() < Date.now()) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '订单已超时关闭，请重新下单',
      );
    }
    return this.withPayParams(market, order, openid);
  }

  // ------------------------------------------------------------ 订单（买家）

  async orders(
    token: string,
    query: { status?: string; page?: unknown; pageSize?: unknown },
  ): Promise<PageResponse<MpOrder>> {
    const { market, customer } = await this.buyer(token);
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
    );
    const status = String(query.status || '').trim();
    const where = {
      marketId: market.id,
      customerId: customer.id,
      ...(status ? { status } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.mpOrder.count({ where }),
      this.prisma.mpOrder.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    return {
      list: await this.orderViews(market, rows),
      total,
      page,
      pageSize,
    };
  }

  async orderDetail(token: string, id: number): Promise<MpOrder> {
    const { market, customer } = await this.buyer(token);
    const row = await this.prisma.mpOrder.findFirst({
      where: { id, marketId: market.id, customerId: customer.id },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    }
    const [view] = await this.orderViews(market, [row]);
    return view;
  }

  async cancel(token: string, id: number) {
    const { market, customer } = await this.buyer(token, true);
    const order = await this.prisma.mpOrder.findFirst({
      where: { id, marketId: market.id, customerId: customer.id },
    });
    if (!order) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    }
    if (order.status !== 'PENDING_PAYMENT' || order.payStatus !== 'UNPAID') {
      throw new BusinessException(ErrorCode.CONFLICT, '订单已支付，不能取消');
    }
    const items = await this.prisma.mpOrderItem.findMany({
      where: { orderId: order.id },
    });
    await this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        if (item.skuId > 0) {
          await tx.mpProductSku.updateMany({
            where: { id: item.skuId },
            data: {
              stock: { increment: item.quantity },
              sales: { decrement: item.quantity },
            },
          });
        }
        await tx.mpProduct.updateMany({
          where: { id: item.productId },
          data: {
            stock: { increment: item.quantity },
            sales: { decrement: item.quantity },
          },
        });
      }
      await tx.mpOrder.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: '买家取消',
        },
      });
      await tx.mpShopOrder.updateMany({
        where: { orderId: order.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      if (order.couponTicketId > 0) {
        const ticket = await tx.mpCouponTicket.findUnique({
          where: { id: order.couponTicketId },
          select: { couponId: true, orderId: true, status: true },
        });
        if (ticket && ticket.orderId === order.id && ticket.status === 'USED') {
          await tx.mpCouponTicket.update({
            where: { id: order.couponTicketId },
            data: { status: 'UNUSED', orderId: 0, usedAt: null },
          });
          await tx.mpCoupon.updateMany({
            where: { id: ticket.couponId, usedCount: { gt: 0 } },
            data: { usedCount: { decrement: 1 } },
          });
        }
      }
      await tx.mpOrderLog.create({
        data: {
          orderId: order.id,
          marketId: market.id,
          operatorType: 'CUSTOMER',
          operatorId: String(customer.id),
          action: 'ORDER_CANCELLED',
          content: '买家取消订单，库存已回补',
        },
      });
    });
    return this.orderDetail(token, order.id);
  }

  async confirm(token: string, id: number): Promise<MpOrder> {
    const { market, customer } = await this.buyer(token, true);
    const order = await this.prisma.mpOrder.findFirst({
      where: { id, marketId: market.id, customerId: customer.id },
    });
    if (!order) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    }
    const children = await this.prisma.mpShopOrder.findMany({
      where: { orderId: order.id },
    });
    if (children.some((child) => child.status === 'PENDING_PAYMENT')) {
      throw new BusinessException(ErrorCode.CONFLICT, '订单还未支付');
    }
    if (children.some((child) => child.status === 'PAID')) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '还有商品未发货，暂不能确认收货',
      );
    }
    if (children.some((child) => child.status === 'CANCELLED')) {
      throw new BusinessException(ErrorCode.CONFLICT, '订单包含已取消的子单');
    }
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.mpShopOrder.updateMany({
        where: { orderId: order.id, status: 'SHIPPED' },
        data: { status: 'COMPLETED', completedAt: now },
      }),
      this.prisma.mpOrder.update({
        where: { id: order.id },
        data: { status: 'COMPLETED', completedAt: now },
      }),
      this.prisma.mpOrderLog.create({
        data: {
          orderId: order.id,
          marketId: market.id,
          operatorType: 'CUSTOMER',
          operatorId: String(customer.id),
          action: 'ORDER_COMPLETED',
          content: '买家确认收货，订单完成',
        },
      }),
    ]);
    const customerLabel = scrmCustomerLabel({ mobile: order.receiverPhone });
    for (const child of children) {
      await this.scrm.enqueue({
        marketId: market.id,
        merchantId: child.merchantId,
        customerId: child.customerId,
        kind: 'ORDER_COMPLETED',
        recordKey: child.id,
        payload: {
          customerLabel,
          orderNo: child.subOrderNo,
          amountYuan: Number(child.payAmount),
        },
      });
    }
    return this.orderDetail(token, order.id);
  }

  // ------------------------------------------------------------ 支付回调

  async payNotify(
    marketId: number,
    resource: { ciphertext: string; nonce: string; associated_data?: string },
  ): Promise<{ ok: boolean }> {
    const market = await this.prisma.mpMarket.findUnique({
      where: { id: marketId },
    });
    if (!market) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '市场不存在');
    }
    const notify = await this.pay.decryptNotify(market, resource);
    if (notify.tradeState !== 'SUCCESS') {
      return { ok: true };
    }
    const order = await this.prisma.mpOrder.findFirst({
      where: { orderNo: notify.outTradeNo, marketId: market.id },
    });
    if (!order) {
      return { ok: true };
    }
    if (order.payStatus === 'PAID') {
      return { ok: true };
    }
    const expected = Math.round(Number(order.payAmount) * 100);
    if (notify.amountCents > 0 && notify.amountCents < expected) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '支付金额与订单金额不一致',
      );
    }
    const now = new Date();
    const customerLabel = scrmCustomerLabel({ mobile: order.receiverPhone });
    // 支付回调后按商户维度补发 SCRM 事件：事务内只收口状态，外发在旁路进行。
    const paidChildren: {
      id: number;
      merchantId: number;
      customerId: number;
      subOrderNo: string;
      payAmount: number;
      completed: boolean;
    }[] = [];
    await this.prisma.$transaction(async (tx) => {
      const paid = await tx.mpOrder.updateMany({
        where: { id: order.id, payStatus: 'UNPAID' },
        data: {
          payStatus: 'PAID',
          status: 'PAID',
          payType: 'WECHAT',
          transactionId: notify.transactionId,
          paidAt: now,
        },
      });
      if (paid.count === 0) return;
      const children = await tx.mpShopOrder.findMany({
        where: { orderId: order.id },
      });
      const virtualShopIds = new Set<number>();
      const items = await tx.mpOrderItem.findMany({
        where: { orderId: order.id },
        select: { shopOrderId: true, productId: true },
      });
      const virtualProducts = await tx.mpProduct.findMany({
        where: {
          id: { in: [...new Set(items.map((item) => item.productId))] },
          type: 'VIRTUAL',
        },
        select: { id: true },
      });
      const virtualProductIds = new Set(virtualProducts.map((row) => row.id));
      for (const child of children) {
        const childItems = items.filter(
          (item) => item.shopOrderId === child.id,
        );
        if (
          childItems.length > 0 &&
          childItems.every((item) => virtualProductIds.has(item.productId))
        ) {
          virtualShopIds.add(child.id);
        }
      }
      for (const child of children) {
        const done = virtualShopIds.has(child.id);
        await tx.mpShopOrder.update({
          where: { id: child.id },
          data: {
            payStatus: 'PAID',
            status: done ? 'COMPLETED' : 'PAID',
            ...(done ? { completedAt: now } : {}),
          },
        });
        // 父单一次支付，按子单拆流水：结算对账与退款渠道判定都读这张表。
        await tx.mpPayRecord.upsert({
          where: { shopOrderId: child.id },
          create: {
            marketId: market.id,
            orderId: order.id,
            shopOrderId: child.id,
            orderNo: order.orderNo,
            subOrderNo: child.subOrderNo,
            transactionId: notify.transactionId,
            payType: 'WECHAT',
            amount: child.payAmount,
            commissionAmount: child.commissionAmount,
            status: 'PAID',
            paidAt: now,
          },
          update: {
            transactionId: notify.transactionId,
            status: 'PAID',
            paidAt: now,
          },
        });
        await tx.mpOrderLog.create({
          data: {
            orderId: order.id,
            shopOrderId: child.id,
            marketId: market.id,
            shopId: child.shopId,
            operatorType: 'SYSTEM',
            action: done ? 'ORDER_COMPLETED' : 'ORDER_PAID',
            content: done
              ? '虚拟商品支付成功，已自动完成'
              : '支付成功，等待商户发货',
          },
        });
        paidChildren.push({
          id: child.id,
          merchantId: child.merchantId,
          customerId: child.customerId,
          subOrderNo: child.subOrderNo,
          payAmount: Number(child.payAmount),
          completed: done,
        });
      }
      await tx.mpOrderLog.create({
        data: {
          orderId: order.id,
          marketId: market.id,
          operatorType: 'SYSTEM',
          action: 'ORDER_PAID',
          content: `父单支付成功，微信单号 ${notify.transactionId}`,
        },
      });
      if (virtualShopIds.size === children.length && children.length > 0) {
        await tx.mpOrder.update({
          where: { id: order.id },
          data: { status: 'COMPLETED', completedAt: now },
        });
      }
    });
    for (const child of paidChildren) {
      await this.scrm.enqueue({
        marketId: market.id,
        merchantId: child.merchantId,
        customerId: child.customerId,
        kind: 'ORDER_PAID',
        recordKey: child.id,
        payload: {
          customerLabel,
          orderNo: child.subOrderNo,
          amountYuan: child.payAmount,
        },
      });
      if (child.completed) {
        await this.scrm.enqueue({
          marketId: market.id,
          merchantId: child.merchantId,
          customerId: child.customerId,
          kind: 'ORDER_COMPLETED',
          recordKey: child.id,
          payload: {
            customerLabel,
            orderNo: child.subOrderNo,
            amountYuan: child.payAmount,
          },
        });
      }
    }
    return { ok: true };
  }

  // ------------------------------------------------------------ 商户端订单

  async merchantOrders(
    payload: MpMerchantTokenPayload,
    query: { status?: string; page?: unknown; pageSize?: unknown },
  ): Promise<PageResponse<MpShopOrder>> {
    const { merchant, market } = await this.merchants.session(payload);
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
    );
    const status = String(query.status || '').trim();
    const where = {
      marketId: market.id,
      merchantId: merchant.id,
      ...(status ? { status } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.mpShopOrder.count({ where }),
      this.prisma.mpShopOrder.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const items = await this.prisma.mpOrderItem.findMany({
      where: { shopOrderId: { in: rows.map((row) => row.id) } },
      orderBy: { id: 'asc' },
    });
    const shopMap = await this.shopNames(rows.map((row) => row.shopId));
    return {
      list: rows.map((row) =>
        this.shopOrderView(
          row,
          items.filter((item) => item.shopOrderId === row.id),
          shopMap.get(row.shopId) ?? '',
        ),
      ),
      total,
      page,
      pageSize,
    };
  }

  async merchantOrderDetail(
    payload: MpMerchantTokenPayload,
    id: number,
  ): Promise<MpShopOrder> {
    const { merchant, market } = await this.merchants.session(payload);
    const row = await this.prisma.mpShopOrder.findFirst({
      where: { id, marketId: market.id, merchantId: merchant.id },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    }
    const [items, shop] = await Promise.all([
      this.prisma.mpOrderItem.findMany({
        where: { shopOrderId: row.id },
        orderBy: { id: 'asc' },
      }),
      this.prisma.mpShop.findUnique({ where: { id: row.shopId } }),
    ]);
    return this.shopOrderView(row, items, shop?.name ?? '');
  }

  async ship(
    payload: MpMerchantTokenPayload,
    body: MpShopOrderShipBody,
  ): Promise<MpShopOrder> {
    const { merchant, market, user } = await this.merchants.session(
      payload,
      true,
    );
    const row = await this.prisma.mpShopOrder.findFirst({
      where: { id: body.id, marketId: market.id, merchantId: merchant.id },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    }
    if (row.status !== 'PAID') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        row.status === 'PENDING_PAYMENT'
          ? '买家还未付款'
          : '该订单当前不能发货',
      );
    }
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const child = await tx.mpShopOrder.update({
        where: { id: row.id },
        data: {
          status: 'SHIPPED',
          expressCompany: body.expressCompany,
          expressNo: body.expressNo,
          shippedAt: now,
        },
      });
      await tx.mpOrderLog.create({
        data: {
          orderId: row.orderId,
          shopOrderId: row.id,
          marketId: market.id,
          shopId: row.shopId,
          operatorType: 'MERCHANT',
          operatorId: String(user.id),
          action: 'ORDER_SHIPPED',
          content: `${body.expressCompany} ${body.expressNo}`,
        },
      });
      const siblings = await tx.mpShopOrder.findMany({
        where: { orderId: row.orderId },
        select: { status: true },
      });
      const allShipped = siblings.every(
        (sibling) =>
          sibling.status === 'SHIPPED' || sibling.status === 'COMPLETED',
      );
      const allCompleted = siblings.every(
        (sibling) => sibling.status === 'COMPLETED',
      );
      if (allShipped) {
        await tx.mpOrder.update({
          where: { id: row.orderId },
          data: {
            status: allCompleted ? 'COMPLETED' : 'SHIPPED',
            ...(allCompleted ? { completedAt: now } : {}),
          },
        });
      }
      return child;
    });
    const items = await this.prisma.mpOrderItem.findMany({
      where: { shopOrderId: updated.id },
      orderBy: { id: 'asc' },
    });
    const shop = await this.prisma.mpShop.findUnique({
      where: { id: updated.shopId },
    });
    return this.shopOrderView(updated, items, shop?.name ?? '');
  }

  async remark(
    payload: MpMerchantTokenPayload,
    id: number,
    sellerRemark: string,
  ): Promise<MpShopOrder> {
    const { merchant, market } = await this.merchants.session(payload, true);
    const row = await this.prisma.mpShopOrder.findFirst({
      where: { id, marketId: market.id, merchantId: merchant.id },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    }
    const updated = await this.prisma.mpShopOrder.update({
      where: { id: row.id },
      data: { sellerRemark },
    });
    return this.merchantOrderDetail(payload, updated.id);
  }

  // ------------------------------------------------------------ 内部

  private async marketByCode(code: string): Promise<MpMarketRow> {
    const market = await this.prisma.mpMarket.findUnique({
      where: { shopCode: code },
    });
    if (!market) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '市场编号不存在');
    }
    if (market.status === 'CLOSED') {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该市场已关闭',
      );
    }
    if (market.status === 'SUSPENDED') {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该市场暂停服务中',
      );
    }
    if (market.status !== 'ONLINE') {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该市场尚未营业',
      );
    }
    // 启动闸门：工具未启动/欠费/平台停服，沿用同一停服响应（bootstrap 等公开读全走这里）
    if (!(await toolOpen('marketplace', market.ownerUserId))) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该站点尚未启动（或已停服），请到「建站管理 → 启动设置」启动后重试',
      );
    }
    return market;
  }

  private async buyer(token: string, write = false): Promise<BuyerContext> {
    const payload = parseCustomerToken(token);
    if (payload.scene !== 'MARKET') {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '登录状态无效，请重新登录',
      );
    }
    const market = await this.prisma.mpMarket.findUnique({
      where: { id: payload.shopId },
    });
    if (!market) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '市场不存在，请重新登录',
      );
    }
    const customer = await this.prisma.mpCustomer.findFirst({
      where: { id: payload.customerId, marketId: market.id },
    });
    if (!customer || customer.status !== 'ACTIVE') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '账号不可用，请联系市场客服',
      );
    }
    if (market.status === 'CLOSED' || market.status === 'SUSPENDED') {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '市场暂停服务中',
      );
    }
    // 启动闸门：买家令牌通道与公开浏览同一口径
    if (!(await toolOpen('marketplace', market.ownerUserId))) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该站点尚未启动（或已停服），请到「建站管理 → 启动设置」启动后重试',
      );
    }
    if (write && market.status !== 'ONLINE') {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '市场尚未营业，暂不可下单',
      );
    }
    return { market, customer, openid: payload.openid };
  }

  /** 统一计价：购物车行 → 按店铺分组，运费用「商品单件运费 × 数量」，全店为 0 时回落市场默认运费。 */
  private async price(
    market: MpMarketRow,
    customer: MpCustomerRow,
    cartIds: number[],
  ): Promise<PricedShop[]> {
    const rows = await this.prisma.mpCartItem.findMany({
      where: {
        id: { in: cartIds },
        marketId: market.id,
        customerId: customer.id,
      },
      orderBy: { id: 'asc' },
    });
    if (rows.length !== cartIds.length) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '购物车已变化，请刷新后重新结算',
      );
    }
    const [products, skus, shops, merchants] = await Promise.all([
      this.prisma.mpProduct.findMany({
        where: {
          id: { in: rows.map((row) => row.productId) },
          marketId: market.id,
        },
      }),
      this.prisma.mpProductSku.findMany({
        where: {
          id: { in: rows.map((row) => row.skuId).filter((id) => id > 0) },
        },
      }),
      this.prisma.mpShop.findMany({
        where: {
          id: { in: rows.map((row) => row.shopId) },
          marketId: market.id,
        },
      }),
      this.prisma.mpMerchant.findMany({
        where: { marketId: market.id },
      }),
    ]);
    const productMap = new Map(products.map((row) => [row.id, row] as const));
    const skuMap = new Map(skus.map((row) => [row.id, row] as const));
    const shopMap = new Map(shops.map((row) => [row.id, row] as const));
    const merchantMap = new Map(merchants.map((row) => [row.id, row] as const));
    // 费率按「商户专属 > 类目 > 平台默认」解析，与结算/台账读的是同一套规则。
    const rates = await this.finance.resolveRates(market, [
      ...merchantMap.keys(),
    ]);
    const defaultRate = numberIn(
      jsonObject(market.settleJson).defaultCommissionRate,
      0,
      0,
      100,
    );
    const defaultFreight = numberIn(
      jsonObject(market.tradeJson).defaultFreight,
      0,
      0,
      9999,
    );
    const groups = new Map<number, PricedShop>();
    for (const row of rows) {
      const product = productMap.get(row.productId);
      const shop = shopMap.get(row.shopId);
      if (!product || product.status !== 'ONLINE') {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '商品已下架，请刷新购物车',
        );
      }
      if (!shop || shop.status !== 'ONLINE') {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '店铺休息中，请稍后再试',
        );
      }
      const sku = row.skuId > 0 ? skuMap.get(row.skuId) : null;
      if (row.skuId > 0 && (!sku || !sku.enabled)) {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '该规格已停售，请重新选择',
        );
      }
      const stock = sku?.stock ?? product.stock;
      if (stock < row.quantity && product.type !== 'VIRTUAL') {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          `「${product.title}」库存不足，仅剩 ${stock} 件`,
        );
      }
      const merchant = merchantMap.get(shop.merchantId);
      if (
        !merchant ||
        merchant.auditStatus !== 'APPROVED' ||
        merchant.status !== 'ACTIVE'
      ) {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '商户暂停营业，请稍后再试',
        );
      }
      const price = decimalOf(sku?.price ?? product.price) ?? 0;
      const group =
        groups.get(shop.id) ??
        ({
          shop,
          rate: rates.get(merchant.id)?.rate ?? defaultRate,
          lines: [],
          goodsAmount: 0,
          freightAmount: 0,
          discountAmount: 0,
          payAmount: 0,
          commissionAmount: 0,
        } satisfies PricedShop);
      group.lines.push({
        cart: row,
        product,
        sku: sku ?? null,
        shop,
        price,
        quantity: row.quantity,
        totalPrice: money(price * row.quantity),
        freight: money((decimalOf(product.freightAmount) ?? 0) * row.quantity),
      });
      group.goodsAmount += money(price * row.quantity);
      group.freightAmount += money(
        (decimalOf(product.freightAmount) ?? 0) * row.quantity,
      );
      groups.set(shop.id, group);
    }
    return [...groups.values()].map((group) => {
      const freightAmount =
        group.freightAmount > 0
          ? money(group.freightAmount)
          : money(defaultFreight);
      const payAmount = money(group.goodsAmount + freightAmount);
      return {
        ...group,
        goodsAmount: money(group.goodsAmount),
        freightAmount,
        discountAmount: 0,
        payAmount,
        commissionAmount: money((payAmount * group.rate) / 100),
      };
    });
  }

  /** 券判定行摘要：按购物车行取店铺/类目/商品与行金额（分）。 */
  private couponLines(priced: PricedShop[]): MpCouponLine[] {
    return priced.flatMap((group) =>
      group.lines.map((line) => ({
        shopId: group.shop.id,
        productId: line.product.id,
        categoryId: line.product.categoryId,
        totalCents: Math.round(line.totalPrice * 100),
      })),
    );
  }

  /**
   * 券抵扣落到子单：discountAmount 由券服务按命中商品额比例分摊，
   * 子单实付与抽佣都按「商品 + 运费 − 抵扣」重算，避免按原价多抽佣。
   */
  private applyCoupon(priced: PricedShop[], usage: MpCouponUsage) {
    for (const group of priced) {
      const discount = (usage.allocations.get(group.shop.id) ?? 0) / 100;
      group.discountAmount = money(discount);
      group.payAmount = money(
        group.goodsAmount + group.freightAmount - discount,
      );
      group.commissionAmount = money((group.payAmount * group.rate) / 100);
    }
  }

  private async withPayParams(
    market: MpMarketRow,
    order: MpOrderRow,
    openid: string,
  ): Promise<MpOrderCreated> {
    const [view] = await this.orderViews(market, [order]);
    const available = await this.pay.available(market);
    if (!available) {
      return {
        order: view,
        payParams: null,
        payHint: '市场尚未配置微信支付商户号，请联系运营方线下付款',
      };
    }
    try {
      const notifyUrl = await this.pay.notifyUrl(market.id);
      const payParams = await this.pay.prepay({
        market,
        orderNo: order.orderNo,
        amountCents: Math.round(Number(order.payAmount) * 100),
        description: `多店铺商城订单 ${order.orderNo}`,
        openid,
        notifyUrl,
      });
      return { order: view, payParams, payHint: '' };
    } catch (error) {
      return {
        order: view,
        payParams: null,
        payHint:
          error instanceof BusinessException
            ? error.message
            : '微信支付暂不可用，请稍后重试',
      };
    }
  }

  private async orderViews(
    market: MpMarketRow,
    rows: MpOrderRow[],
  ): Promise<MpOrder[]> {
    if (rows.length === 0) return [];
    const children = await this.prisma.mpShopOrder.findMany({
      where: { orderId: { in: rows.map((row) => row.id) } },
      orderBy: { id: 'asc' },
    });
    const [items, shopMap] = await Promise.all([
      this.prisma.mpOrderItem.findMany({
        where: { orderId: { in: rows.map((row) => row.id) } },
        orderBy: { id: 'asc' },
      }),
      this.shopNames(children.map((child) => child.shopId)),
    ]);
    return rows.map((row) => ({
      id: row.id,
      orderNo: row.orderNo,
      marketId: market.id,
      status: row.status as MpOrder['status'],
      payStatus: row.payStatus,
      goodsAmount: decimalOf(row.goodsAmount) ?? 0,
      freightAmount: decimalOf(row.freightAmount) ?? 0,
      discountAmount: decimalOf(row.discountAmount) ?? 0,
      payAmount: decimalOf(row.payAmount) ?? 0,
      couponName: row.couponName,
      shopOrderCount: row.shopOrderCount,
      receiverName: row.receiverName,
      receiverPhone: row.receiverPhone,
      receiverAddress: addressText(row),
      buyerRemark: row.buyerRemark,
      paidAt: iso(row.paidAt),
      expireAt: iso(row.expireAt),
      createdAt: iso(row.createdAt),
      shopOrders: children
        .filter((child) => child.orderId === row.id)
        .map((child) =>
          this.shopOrderView(
            child,
            items.filter((item) => item.shopOrderId === child.id),
            shopMap.get(child.shopId) ?? '',
          ),
        ),
    }));
  }

  private shopOrderView(
    row: MpShopOrderRow,
    items: MpOrderItemRow[],
    shopName: string,
  ): MpShopOrder {
    return {
      id: row.id,
      orderId: row.orderId,
      subOrderNo: row.subOrderNo,
      marketId: row.marketId,
      merchantId: row.merchantId,
      shopId: row.shopId,
      shopName,
      status: row.status as MpShopOrder['status'],
      payStatus: row.payStatus,
      refundStatus: row.refundStatus,
      goodsAmount: decimalOf(row.goodsAmount) ?? 0,
      freightAmount: decimalOf(row.freightAmount) ?? 0,
      discountAmount: decimalOf(row.discountAmount) ?? 0,
      payAmount: decimalOf(row.payAmount) ?? 0,
      commissionRate: decimalOf(row.commissionRate) ?? 0,
      commissionAmount: decimalOf(row.commissionAmount) ?? 0,
      receiverName: row.receiverName,
      receiverPhone: row.receiverPhone,
      receiverAddress: addressText(row),
      buyerRemark: row.buyerRemark,
      sellerRemark: row.sellerRemark,
      expressCompany: row.expressCompany,
      expressNo: row.expressNo,
      shippedAt: iso(row.shippedAt),
      completedAt: iso(row.completedAt),
      createdAt: iso(row.createdAt),
      items: items.map((item) => this.itemView(item)),
    };
  }

  private itemView(row: MpOrderItemRow): MpShopOrderItem {
    return {
      id: row.id,
      productId: row.productId,
      skuId: row.skuId,
      title: row.title,
      skuName: row.skuName,
      image: row.image,
      price: decimalOf(row.price) ?? 0,
      quantity: row.quantity,
      totalPrice: decimalOf(row.totalPrice) ?? 0,
      refundStatus: row.refundStatus,
      reviewed: row.reviewed,
    };
  }

  private settleShopView(group: PricedShop): MpSettleShop {
    return {
      shopId: group.shop.id,
      shopName: group.shop.name,
      merchantId: group.shop.merchantId,
      goodsAmount: money(group.goodsAmount),
      freightAmount: money(group.freightAmount),
      discountAmount: money(group.discountAmount),
      payAmount: money(group.payAmount),
      commissionRate: group.rate,
      commissionAmount: money(group.commissionAmount),
      items: group.lines.map((line) => ({
        cartId: line.cart.id,
        productId: line.product.id,
        skuId: line.sku?.id ?? 0,
        title: line.product.title,
        skuName: line.sku?.skuName ?? '',
        image: line.sku?.image || line.product.coverImage,
        price: line.price,
        quantity: line.quantity,
        totalPrice: line.totalPrice,
      })),
    };
  }

  private customerView(row: MpCustomerRow, market: MpMarketRow): MpCustomer {
    void market;
    return {
      id: row.id,
      marketId: row.marketId,
      nickname: row.nickname,
      avatar: row.avatar,
      phone: row.phone,
      gender: row.gender,
      level: row.level,
      points: row.points,
      balance: decimalOf(row.balance) ?? 0,
      status: row.status,
      createdAt: iso(row.createdAt),
    };
  }

  private addressView(row: MpAddressRow): MpAddress {
    return {
      id: row.id,
      realName: row.realName,
      phone: row.phone,
      province: row.province,
      city: row.city,
      district: row.district,
      detail: row.detail,
      postalCode: row.postalCode,
      isDefault: row.isDefault,
      tag: row.tag,
    };
  }

  private publicProduct(row: MpProductRow, shopName: string): MpPublicProduct {
    return {
      id: row.id,
      shopId: row.shopId,
      shopName,
      categoryId: row.categoryId,
      title: row.title,
      subtitle: row.subtitle,
      coverImage: row.coverImage,
      price: decimalOf(row.price) ?? 0,
      marketPrice: decimalOf(row.marketPrice) ?? 0,
      stock: row.stock,
      sales: row.sales,
      unit: row.unit,
      isHot: row.isHot,
      isNew: row.isNew,
      reviewCount: row.reviewCount,
    };
  }

  private publicShop(row: MpShopRow, followed = false) {
    return {
      id: row.id,
      name: row.name,
      logo: row.logo,
      intro: row.intro,
      shopCode: row.shopCode,
      sortOrder: row.sortOrder,
      themeColor: themeColorOf(row.themeJson),
      followed,
    };
  }

  private async shopNames(shopIds: number[]) {
    const ids = [...new Set(shopIds)];
    const rows =
      ids.length > 0
        ? await this.prisma.mpShop.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
          })
        : [];
    return new Map(rows.map((row) => [row.id, row.name] as const));
  }

  private strings(value: unknown): string[] {
    return Array.isArray(value)
      ? value.map((item) => String(item || '')).filter(Boolean)
      : [];
  }

  private specs(value: unknown): Array<{ name: string; values: string[] }> {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => {
        const record = jsonObject(item);
        return {
          name: textOf(record.name),
          values: Array.isArray(record.values)
            ? record.values.map((v) => String(v || ''))
            : [],
        };
      })
      .filter((item) => item.name && item.values.length > 0);
  }
}
