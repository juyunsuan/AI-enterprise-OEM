import type {
  TakeoutOrderCreateBody,
  TakeoutOrderDetail,
  TakeoutOrderItem,
  TakeoutOrderMode,
  TakeoutOrderRow,
  TakeoutPreviewBody,
} from '@enterprise/contracts';
import { pageOf, pageParam } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import { priceOrder, type CouponSpec } from '../commerce-core/pricing';
import type { TakeoutCouponService } from './takeout.coupon.service';
import type { TakeoutCustomerService } from './takeout.customer.service';
import type { TakeoutPayService } from './takeout.pay.service';
import type { TakeoutScrmService } from './takeout.scrm.service';
import type { TakeoutShopService } from './takeout.shop.service';
import {
  amountOut,
  clip,
  commerceRulesOf,
  fromCents,
  iso,
  orderModeOf,
  orderStatus,
  payStatusOf,
  payTypeOf,
  pickupCodeOf,
  takeoutOrderNo,
  toCents,
} from './takeout.shared';

type Buyer = {
  shopId: number;
  customerId: number;
  ownerUserId: string;
  openid: string;
};

type Seller = { ownerUserId: string; shopId: number };

type Line = {
  productId: number;
  skuId: number;
  quantity: number;
  title: string;
  skuName: string;
  image: string;
  priceCents: number;
  stock: number;
  categoryId: number;
  valid: boolean;
  invalidReason: string;
};

type OrderLike = {
  id: number;
  shopId: number;
  orderNo: string;
  customerId: number;
  status: string;
  payStatus: string;
  orderMode: string;
  payType: string;
  tableNo: string;
  pickupCode: string;
  expectedAt: Date | null;
  goodsAmount: unknown;
  deliveryFee: unknown;
  discountAmount: unknown;
  payAmount: unknown;
  pointsDeduct: number;
  couponName: string;
  buyerRemark: string;
  sellerRemark: string;
  receiverName: string;
  receiverPhone: string;
  receiverProvince: string;
  receiverCity: string;
  receiverDistrict: string;
  receiverDetail: string;
  transactionId: string;
  createdAt: Date;
  paidAt: Date | null;
  shippedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  expireAt: Date | null;
};

type ItemLike = {
  id: number;
  productId: number;
  skuId: number;
  title: string;
  skuName: string;
  image: string;
  price: unknown;
  quantity: number;
  totalPrice: unknown;
};

const round2 = fromCents;

/**
 * 外卖订单：与商城订单表物理隔离。
 *
 * 算价、券、积分、库存扣减、支付回写与 SCRM 事件都复用公共服务，
 * 但每一条 SQL 只落在 `takeout_*` 表上，不会读到商城数据。
 */
export class TakeoutOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shops: TakeoutShopService,
    private readonly customers: TakeoutCustomerService,
    private readonly coupons: TakeoutCouponService,
    private readonly pay: TakeoutPayService,
    private readonly scrm: TakeoutScrmService,
  ) {}

  // ---------------------------------------------------------------- 算价

  private async linesOf(
    buyer: Buyer,
    items: Array<{ productId: number; skuId: number; quantity: number }>,
    fromCart: boolean,
  ): Promise<Line[]> {
    const wanted = fromCart
      ? (
          await this.prisma.takeoutCartItem.findMany({
            where: {
              shopId: buyer.shopId,
              customerId: buyer.customerId,
              selected: true,
            },
            select: { productId: true, skuId: true, quantity: true },
            take: 50,
          })
        ).map((row) => ({
          productId: row.productId,
          skuId: row.skuId,
          quantity: row.quantity,
        }))
      : items.slice(0, 50);
    if (!wanted.length) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '购物车里没有勾选的菜品',
      );
    }
    const productIds = [...new Set(wanted.map((row) => row.productId))];
    const skuIds = wanted.map((row) => row.skuId).filter((id) => id > 0);
    const [products, skus] = await Promise.all([
      this.prisma.takeoutProduct.findMany({
        where: { shopId: buyer.shopId, id: { in: productIds } },
        select: {
          id: true,
          categoryId: true,
          title: true,
          coverImage: true,
          price: true,
          stock: true,
          status: true,
        },
      }),
      skuIds.length
        ? this.prisma.takeoutProductSku.findMany({
            where: { shopId: buyer.shopId, id: { in: skuIds } },
            select: {
              id: true,
              productId: true,
              skuName: true,
              image: true,
              price: true,
              stock: true,
              enabled: true,
            },
          })
        : Promise.resolve([]),
    ]);
    const productMap = new Map(products.map((row) => [row.id, row]));
    const skuMap = new Map(skus.map((row) => [row.id, row]));
    return wanted.map((row) => {
      const product = productMap.get(row.productId);
      const sku = row.skuId ? skuMap.get(row.skuId) : undefined;
      const stock = sku ? sku.stock : Number(product?.stock || 0);
      const valid =
        Boolean(product) &&
        product?.status === 'ONLINE' &&
        (sku ? sku.enabled === true : true) &&
        stock >= row.quantity;
      return {
        productId: row.productId,
        skuId: row.skuId,
        quantity: row.quantity,
        title: product?.title || '（菜品已下架）',
        skuName: sku?.skuName || '',
        image: sku?.image || product?.coverImage || '',
        priceCents: toCents(sku?.price ?? product?.price),
        stock,
        categoryId: product?.categoryId || 0,
        valid,
        invalidReason: valid
          ? ''
          : product?.status !== 'ONLINE'
            ? '已下架'
            : stock <= 0
              ? '已售罄'
              : '库存不足',
      };
    });
  }

  private async price(
    buyer: Buyer,
    items: Array<{ productId: number; skuId: number; quantity: number }>,
    options: {
      fromCart: boolean;
      addressId: number;
      couponTicketId: number;
      usePoints: number;
      orderMode: TakeoutOrderMode;
    },
  ) {
    const shop = await this.shops.requireShop(
      { userId: buyer.ownerUserId },
      buyer.shopId,
    );
    const trade = shop.trade;
    const lines = await this.linesOf(buyer, items, options.fromCart);
    const invalid = lines.filter((line) => !line.valid);
    if (invalid.length) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `无法结算：${invalid.map((line) => `${line.title}（${line.invalidReason}）`).join('；')}`,
      );
    }
    let coupon: CouponSpec | null = null;
    if (options.couponTicketId > 0) {
      const resolved = await this.coupons.specOf(
        buyer.shopId,
        options.couponTicketId,
      );
      if (!resolved.spec) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          `优惠券不可用：${resolved.reason}`,
        );
      }
      coupon = resolved.spec;
    }
    let pointsOwned = 0;
    if (
      trade.pointsEnabled &&
      trade.pointsPerYuan > 0 &&
      trade.pointsDeductMaxPercent > 0
    ) {
      const customer = await this.prisma.takeoutCustomer.findFirst({
        where: { id: buyer.customerId, shopId: buyer.shopId },
        select: { points: true },
      });
      pointsOwned = Math.max(0, Number(customer?.points || 0));
    }
    const delivery = options.orderMode === 'DELIVERY';
    const address =
      delivery && options.addressId > 0
        ? await this.prisma.takeoutCustomerAddress.findFirst({
            where: {
              id: options.addressId,
              shopId: buyer.shopId,
              customerId: buyer.customerId,
            },
            select: { province: true, city: true, district: true },
          })
        : null;
    const priced = priceOrder({
      lines: lines.map((line) => ({
        productId: line.productId,
        skuId: line.skuId,
        quantity: line.quantity,
        title: line.title,
        skuName: line.skuName,
        image: line.image,
        unitCents: line.priceCents,
        stock: line.stock,
        productType: 'NORMAL',
        categoryId: line.categoryId,
        requiresShipping: delivery,
        splitKey: '',
        valid: line.valid,
        invalidReason: line.invalidReason,
      })),
      rules: commerceRulesOf(trade),
      coupon,
      region: address
        ? {
            province: address.province || '',
            city: address.city || '',
            district: address.district || '',
          }
        : null,
      pointsOwned,
      pointsRequested: options.usePoints,
      addressSelected: delivery && options.addressId > 0,
    });
    return { shop, trade, lines, priced, delivery };
  }

  async preview(buyer: Buyer, body: TakeoutPreviewBody) {
    const { lines, priced, delivery, trade } = await this.price(
      buyer,
      body.items,
      {
        fromCart: body.fromCart,
        addressId: body.addressId,
        couponTicketId: body.couponTicketId,
        usePoints: body.usePoints,
        orderMode: body.orderMode,
      },
    );
    const address = delivery
      ? body.addressId
        ? await this.prisma.takeoutCustomerAddress.findFirst({
            where: {
              id: body.addressId,
              shopId: buyer.shopId,
              customerId: buyer.customerId,
            },
          })
        : await this.prisma.takeoutCustomerAddress.findFirst({
            where: {
              shopId: buyer.shopId,
              customerId: buyer.customerId,
              isDefault: true,
            },
          })
      : null;
    const coupons = await this.coupons.availableFor(
      buyer.shopId,
      buyer.customerId,
      lines.map((line) => ({
        productId: line.productId,
        categoryId: line.categoryId,
        totalPrice: round2(line.priceCents * line.quantity),
      })),
    );
    return {
      lines: lines.map((line) => ({
        productId: line.productId,
        skuId: line.skuId,
        title: line.title,
        skuName: line.skuName,
        image: line.image,
        price: round2(line.priceCents),
        quantity: line.quantity,
        totalPrice: round2(line.priceCents * line.quantity),
        stock: line.stock,
        valid: line.valid,
        invalidReason: line.invalidReason,
      })),
      goodsAmount: round2(priced.goodsCents),
      freightAmount: round2(priced.freightCents),
      deliveryFee: round2(priced.freightCents),
      deliveryAmount: round2(priced.freightCents),
      discountAmount: round2(priced.couponDiscountCents),
      pointsDeduct: priced.pointsDeduct,
      pointsDeductAmount: round2(priced.pointsDiscountCents),
      payAmount: round2(priced.payCents),
      coupons,
      maxUsablePoints: priced.maxUsablePoints,
      receiver: address
        ? {
            name: address.realName,
            phone: address.phone,
            province: address.province,
            city: address.city,
            district: address.district,
            detail: address.detail,
          }
        : null,
      orderMode: body.orderMode,
      minOrderAmount: trade.minOrderAmount,
      blockReason: priced.blockReason,
    };
  }

  // ---------------------------------------------------------------- 下单

  async create(
    buyer: Buyer,
    body: TakeoutOrderCreateBody,
  ): Promise<{
    orderId: number;
    orderNo: string;
    payAmount: number;
    expireAt: string;
    orderMode: TakeoutOrderMode;
    pickupCode: string;
    payParams: {
      timeStamp: string;
      nonceStr: string;
      package: string;
      signType: string;
      paySign: string;
    } | null;
  }> {
    const { trade, lines, priced, delivery } = await this.price(
      buyer,
      body.items,
      {
        fromCart: body.fromCart,
        addressId: body.addressId,
        couponTicketId: body.couponTicketId,
        usePoints: body.usePoints,
        orderMode: body.orderMode,
      },
    );
    if (priced.blockReason) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, priced.blockReason);
    }
    const address = delivery
      ? await this.prisma.takeoutCustomerAddress.findFirst({
          where: {
            id: body.addressId,
            shopId: buyer.shopId,
            customerId: buyer.customerId,
          },
        })
      : null;
    if (delivery && !address) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '外卖配送需要收货地址，请到「我的-收货地址」重新选择',
      );
    }
    const needPay = priced.payCents > 0;
    if (needPay && body.payType !== 'WECHAT') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '该门店未开通其他收款方式，请使用微信支付',
      );
    }
    if (needPay && !(await this.pay.available(buyer.shopId))) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '该门店未配置可用的微信支付商户号，请联系门店',
      );
    }
    const expectedAt = expectedTime(body.expectedAt);
    const deducted: Line[] = [];
    for (const line of lines) {
      if (!(await this.deductStock(buyer.shopId, line))) {
        for (const done of deducted)
          await this.restoreStock(buyer.shopId, done);
        throw new BusinessException(
          ErrorCode.CONFLICT,
          `「${line.title}」库存不足，请调整数量后重试`,
        );
      }
      deducted.push(line);
    }
    let orderNo = takeoutOrderNo();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const dup = await this.prisma.takeoutOrder.findUnique({
        where: { orderNo },
      });
      if (!dup) break;
      orderNo = takeoutOrderNo();
    }
    const pickupCode =
      body.orderMode === 'DELIVERY' ? '' : pickupCodeOf(orderNo);
    let orderId = 0;
    try {
      const order = await this.prisma.takeoutOrder.create({
        data: {
          shopId: buyer.shopId,
          ownerUserId: buyer.ownerUserId,
          orderNo,
          customerId: buyer.customerId,
          status: needPay ? 'PENDING_PAYMENT' : 'PAID',
          payStatus: needPay ? 'UNPAID' : 'PAID',
          orderMode: body.orderMode,
          tableNo: clip(body.tableNo, 20),
          pickupCode,
          expectedAt,
          goodsAmount: round2(priced.goodsCents),
          deliveryFee: round2(priced.freightCents),
          discountAmount: round2(priced.couponDiscountCents),
          payAmount: round2(priced.payCents),
          pointsDeduct: priced.pointsDeduct,
          pointsReturn: priced.pointsReturn,
          couponTicketId: body.couponTicketId,
          couponName: priced.couponName,
          payType: needPay ? 'WECHAT' : 'OFFLINE',
          receiverName: address?.realName || '',
          receiverPhone: address?.phone || '',
          receiverProvince: address?.province || '',
          receiverCity: address?.city || '',
          receiverDistrict: address?.district || '',
          receiverDetail: address?.detail || '',
          buyerRemark: trade.buyerMessageEnabled
            ? clip(body.buyerRemark, 200)
            : '',
          paidAt: needPay ? null : new Date(),
          expireAt: needPay
            ? new Date(Date.now() + trade.autoCancelMinutes * 60_000)
            : null,
        },
      });
      orderId = order.id;
      for (const line of lines) {
        await this.prisma.takeoutOrderItem.create({
          data: {
            orderId: order.id,
            shopId: buyer.shopId,
            customerId: buyer.customerId,
            productId: line.productId,
            skuId: line.skuId,
            title: line.title,
            skuName: line.skuName,
            image: line.image,
            price: round2(line.priceCents),
            quantity: line.quantity,
            totalPrice: round2(line.priceCents * line.quantity),
          },
        });
        await this.prisma.takeoutProduct.updateMany({
          where: { id: line.productId, shopId: buyer.shopId },
          data: { sales: { increment: line.quantity } },
        });
      }
      await this.prisma.takeoutOrderLog.create({
        data: {
          orderId: order.id,
          shopId: buyer.shopId,
          operatorType: 'CUSTOMER',
          operatorId: String(buyer.customerId),
          action: 'CREATE',
          content: `顾客提交订单，应付 ${round2(priced.payCents)} 元`,
        },
      });
      if (body.couponTicketId > 0) {
        const consumed = await this.coupons.consume(
          buyer.shopId,
          body.couponTicketId,
          order.id,
        );
        if (!consumed) {
          throw new BusinessException(
            ErrorCode.CONFLICT,
            '优惠券已被使用，请重新选择',
          );
        }
      }
      if (priced.pointsDeduct > 0) {
        const ok = await this.customers.addPoints(
          buyer.shopId,
          buyer.customerId,
          -priced.pointsDeduct,
          'POINT_USE',
          { type: 'ORDER', id: order.id },
          `订单 ${orderNo} 积分抵扣`,
        );
        if (!ok) {
          throw new BusinessException(
            ErrorCode.CONFLICT,
            '积分不足或已被使用，请重新结算',
          );
        }
      }
      if (body.fromCart) {
        await this.prisma.takeoutCartItem.deleteMany({
          where: {
            shopId: buyer.shopId,
            customerId: buyer.customerId,
            selected: true,
          },
        });
      }
      if (!needPay) {
        await this.markPaidEffects(order, buyer);
      }
    } catch (error) {
      for (const line of deducted) await this.restoreStock(buyer.shopId, line);
      if (orderId > 0) {
        await this.cancelInternal(buyer.shopId, orderId, '下单过程失败回滚');
      }
      throw error;
    }
    const saved = await this.prisma.takeoutOrder.findUnique({
      where: { id: orderId },
    });
    if (!saved) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '订单创建失败，请重试');
    }
    let payParams = null as {
      timeStamp: string;
      nonceStr: string;
      package: string;
      signType: string;
      paySign: string;
    } | null;
    if (needPay) {
      payParams = await this.pay.prepay({
        shopId: buyer.shopId,
        orderNo: saved.orderNo,
        amountCents: priced.payCents,
        description: lines[0]?.title || '外卖订单',
        openid: buyer.openid,
      });
    }
    return {
      orderId: saved.id,
      orderNo: saved.orderNo,
      payAmount: round2(priced.payCents),
      expireAt: saved.expireAt ? saved.expireAt.toISOString() : '',
      orderMode: body.orderMode,
      pickupCode: saved.pickupCode,
      payParams,
    };
  }

  private async markPaidEffects(
    order: {
      id: number;
      shopId: number;
      customerId: number;
      orderNo: string;
      pointsReturn: number;
      payAmount: unknown;
    },
    buyer: Buyer,
  ) {
    if (order.pointsReturn > 0) {
      await this.customers.addPoints(
        order.shopId,
        order.customerId,
        order.pointsReturn,
        'POINT_EARN',
        { type: 'ORDER', id: order.id },
        `订单 ${order.orderNo} 消费返积分`,
      );
    }
    await this.scrm.enqueue({
      shopId: order.shopId,
      ownerUserId: buyer.ownerUserId,
      customerId: order.customerId,
      kind: 'ORDER_PAID',
      recordKey: order.id,
      payload: {
        orderNo: order.orderNo,
        amountYuan: Number(order.payAmount),
      },
    });
  }

  // ---------------------------------------------------------------- 支付回写

  async markPaid(
    shopId: number,
    orderNo: string,
    transactionId: string,
    expectCents: number,
  ): Promise<{ ok: boolean; message: string }> {
    const order = await this.prisma.takeoutOrder.findFirst({
      where: { shopId, orderNo },
    });
    if (!order) return { ok: false, message: `订单 ${orderNo} 不存在` };
    if (order.payStatus === 'PAID' || order.payStatus === 'REFUNDED') {
      return { ok: true, message: '订单已是已付状态，忽略重复回调' };
    }
    if (toCents(order.payAmount) !== Math.round(expectCents)) {
      await this.prisma.takeoutOrderLog.create({
        data: {
          orderId: order.id,
          shopId,
          operatorType: 'SYSTEM',
          operatorId: '',
          action: 'PAY_AMOUNT_MISMATCH',
          content: `回调金额 ${fromCents(expectCents)} 与应付 ${amountOut(order.payAmount)} 不一致，已忽略`,
        },
      });
      return {
        ok: false,
        message: '回调金额与订单应付不一致，已记录待人工核对',
      };
    }
    const changed = await this.prisma.takeoutOrder.updateMany({
      where: { id: order.id, shopId, payStatus: 'UNPAID' },
      data: {
        payStatus: 'PAID',
        status: 'PAID',
        paidAt: new Date(),
        transactionId: clip(transactionId, 64),
        expireAt: null,
      },
    });
    if (changed.count === 0) {
      return { ok: true, message: '并发回调，已由其他请求处理' };
    }
    const shop = await this.prisma.takeoutShop.findUnique({
      where: { id: shopId },
      select: { ownerUserId: true },
    });
    await this.markPaidEffects(
      {
        id: order.id,
        shopId,
        customerId: order.customerId,
        orderNo: order.orderNo,
        pointsReturn: order.pointsReturn,
        payAmount: order.payAmount,
      },
      {
        shopId,
        customerId: order.customerId,
        ownerUserId: shop?.ownerUserId || order.ownerUserId,
        openid: '',
      },
    );
    await this.prisma.takeoutOrderLog.create({
      data: {
        orderId: order.id,
        shopId,
        operatorType: 'SYSTEM',
        operatorId: '',
        action: 'PAID',
        content: `支付成功，流水号 ${clip(transactionId, 64)}`,
      },
    });
    return { ok: true, message: '已置为已付款' };
  }

  // ---------------------------------------------------------------- 取消

  private async cancelInternal(
    shopId: number,
    orderId: number,
    reason: string,
  ) {
    const order = await this.prisma.takeoutOrder.findFirst({
      where: { id: orderId, shopId },
    });
    if (!order || order.status !== 'PENDING_PAYMENT') return false;
    const changed = await this.prisma.takeoutOrder.updateMany({
      where: { id: orderId, shopId, status: 'PENDING_PAYMENT' },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: clip(reason, 200),
        expireAt: null,
      },
    });
    if (changed.count === 0) return false;
    const items = await this.prisma.takeoutOrderItem.findMany({
      where: { orderId, shopId },
    });
    for (const item of items) {
      await this.restoreStock(shopId, {
        productId: item.productId,
        skuId: item.skuId,
        quantity: item.quantity,
      });
    }
    if (order.couponTicketId > 0) {
      await this.prisma.takeoutCouponTicket.updateMany({
        where: { id: order.couponTicketId, shopId, status: 'USED' },
        data: { status: 'UNUSED', orderId: 0, usedAt: null },
      });
      const ticket = await this.prisma.takeoutCouponTicket.findUnique({
        where: { id: order.couponTicketId },
        select: { couponId: true },
      });
      if (ticket) {
        await this.prisma.takeoutCoupon.updateMany({
          where: { id: ticket.couponId, usedCount: { gt: 0 } },
          data: { usedCount: { decrement: 1 } },
        });
      }
    }
    if (order.pointsDeduct > 0) {
      await this.customers.addPoints(
        shopId,
        order.customerId,
        order.pointsDeduct,
        'POINT_EARN',
        { type: 'ORDER', id: order.id },
        `订单 ${order.orderNo} 取消返还积分`,
      );
    }
    await this.prisma.takeoutOrderLog.create({
      data: {
        orderId,
        shopId,
        operatorType: 'CUSTOMER',
        operatorId: String(order.customerId),
        action: 'CANCEL',
        content: clip(reason, 200),
      },
    });
    return true;
  }

  async cancelByCustomer(shopId: number, customerId: number, orderId: number) {
    const order = await this.prisma.takeoutOrder.findFirst({
      where: { id: orderId, shopId, customerId },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    const shop = await this.prisma.takeoutShop.findUnique({
      where: { id: shopId },
      select: { tradeJson: true },
    });
    const trade = (shop?.tradeJson || {}) as { selfCancelEnabled?: boolean };
    if (trade.selfCancelEnabled === false) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '该门店不允许自助取消，如需取消请联系门店',
      );
    }
    if (order.status !== 'PENDING_PAYMENT') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '只有待付款订单可以取消',
      );
    }
    const done = await this.cancelInternal(shopId, order.id, '顾客主动取消');
    if (!done) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '订单状态已变化，请刷新后重试',
      );
    }
    return { ok: true, message: '订单已取消' };
  }

  async autoCancelExpired(limit = 200) {
    const rows = await this.prisma.takeoutOrder.findMany({
      where: { status: 'PENDING_PAYMENT', expireAt: { lt: new Date() } },
      select: { id: true, shopId: true },
      take: limit,
    });
    let count = 0;
    for (const row of rows) {
      if (
        await this.cancelInternal(
          row.shopId,
          row.id,
          '超时未付款，系统自动取消',
        )
      ) {
        count += 1;
      }
    }
    return count;
  }

  // ---------------------------------------------------------------- C 端读

  async publicList(
    shopId: number,
    customerId: number,
    status: string,
    page: number,
    pageSize: number,
  ) {
    const { page: pageNo, pageSize: size, offset } = pageParam(page, pageSize);
    const where: Record<string, unknown> = { shopId, customerId };
    if (status && status !== 'ALL') where.status = status;
    const [rows, total] = await Promise.all([
      this.prisma.takeoutOrder.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: size,
      }),
      this.prisma.takeoutOrder.count({ where }),
    ]);
    const ids = rows.map((row) => row.id);
    const items = ids.length
      ? await this.prisma.takeoutOrderItem.findMany({
          where: { orderId: { in: ids }, shopId },
        })
      : [];
    const grouped = new Map<number, typeof items>();
    for (const item of items) {
      const list = grouped.get(item.orderId) || [];
      list.push(item);
      grouped.set(item.orderId, list);
    }
    const list = rows.map((row) => {
      const own = grouped.get(row.id) || [];
      return {
        ...this.publicRow(row),
        itemCount: own.length,
        itemSummary: own
          .map(
            (item) =>
              `${item.title}${item.skuName ? ` / ${item.skuName}` : ''} ×${item.quantity}`,
          )
          .join('；'),
        coverImage: own[0]?.image || '',
        items: own.map(itemMap),
      };
    });
    return pageOf(list, total, pageNo, size);
  }

  async publicDetail(
    shopId: number,
    customerId: number,
    orderId: number,
  ): Promise<TakeoutOrderDetail & { items: TakeoutOrderItem[] }> {
    const row = await this.prisma.takeoutOrder.findFirst({
      where: { id: orderId, shopId, customerId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    const [items, logs] = await Promise.all([
      this.prisma.takeoutOrderItem.findMany({
        where: { orderId, shopId },
        orderBy: { id: 'asc' },
      }),
      this.prisma.takeoutOrderLog.findMany({
        where: { orderId, shopId },
        orderBy: { id: 'asc' },
      }),
    ]);
    return {
      ...this.publicRow(row),
      itemCount: items.length,
      itemSummary: items
        .map((item) => `${item.title} ×${item.quantity}`)
        .join('；'),
      coverImage: items[0]?.image || '',
      items: items.map(itemMap),
      logs: logs.map((log) => ({
        id: log.id,
        operatorType: log.operatorType,
        operatorId: log.operatorId,
        action: log.action,
        content: log.content,
        createdAt: iso(log.createdAt),
      })),
      receiver: {
        name: row.receiverName,
        phone: row.receiverPhone,
        province: row.receiverProvince,
        city: row.receiverCity,
        district: row.receiverDistrict,
        detail: row.receiverDetail,
      },
      transactionId: row.transactionId,
    };
  }

  async receive(shopId: number, customerId: number, orderId: number) {
    const order = await this.prisma.takeoutOrder.findFirst({
      where: { id: orderId, shopId, customerId },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    if (order.status !== 'SHIPPED') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '只有待取餐/配送中的订单可以确认完成',
      );
    }
    const now = new Date();
    await this.prisma.takeoutOrder.update({
      where: { id: order.id },
      data: { status: 'COMPLETED', completedAt: now },
    });
    await this.prisma.takeoutOrderLog.create({
      data: {
        orderId: order.id,
        shopId,
        operatorType: 'CUSTOMER',
        operatorId: String(customerId),
        action: 'RECEIVE',
        content:
          order.orderMode === 'DELIVERY' ? '顾客确认收到餐品' : '顾客确认取餐',
      },
    });
    await this.scrm.enqueue({
      shopId,
      ownerUserId: order.ownerUserId,
      customerId,
      kind: 'ORDER_COMPLETED',
      recordKey: order.id,
      payload: {
        orderNo: order.orderNo,
        amountYuan: Number(order.payAmount),
      },
    });
    return { ok: true, message: '订单已完成' };
  }

  async repayParams(input: {
    shopId: number;
    customerId: number;
    ownerUserId: string;
    orderId: number;
    openid: string;
  }) {
    const order = await this.prisma.takeoutOrder.findFirst({
      where: {
        id: Number(input.orderId),
        shopId: input.shopId,
        customerId: input.customerId,
      },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    if (order.payStatus === 'PAID') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该订单已支付，无需重复付款',
      );
    }
    if (order.status !== 'PENDING_PAYMENT') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '该订单已取消或已不可支付，请重新下单',
      );
    }
    const payParams = await this.pay.prepay({
      shopId: input.shopId,
      orderNo: order.orderNo,
      amountCents: toCents(order.payAmount),
      description: order.couponName || '外卖订单',
      openid: input.openid,
    });
    return {
      orderId: order.id,
      orderNo: order.orderNo,
      payAmount: amountOut(order.payAmount),
      expireAt: iso(order.expireAt),
      payParams,
    };
  }

  // ---------------------------------------------------------------- 商家侧

  async list(seller: Seller, query: Record<string, unknown>) {
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
    );
    const where: Record<string, unknown> = { shopId: seller.shopId };
    const status = typeof query.status === 'string' ? query.status : '';
    if (status) where.status = status;
    const orderMode =
      typeof query.orderMode === 'string' ? query.orderMode : '';
    if (orderMode) where.orderMode = orderMode;
    const keyword = clip(query.keyword, 60).trim();
    if (keyword) {
      where.OR = [
        { orderNo: { contains: keyword } },
        { receiverName: { contains: keyword } },
        { receiverPhone: { contains: keyword } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.takeoutOrder.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      this.prisma.takeoutOrder.count({ where }),
    ]);
    const ids = rows.map((row) => row.id);
    const items = ids.length
      ? await this.prisma.takeoutOrderItem.findMany({
          where: { orderId: { in: ids }, shopId: seller.shopId },
        })
      : [];
    const itemMap = new Map<number, typeof items>();
    for (const item of items) {
      const list = itemMap.get(item.orderId) || [];
      list.push(item);
      itemMap.set(item.orderId, list);
    }
    const customers = await this.prisma.takeoutCustomer.findMany({
      where: {
        shopId: seller.shopId,
        id: { in: [...new Set(rows.map((row) => row.customerId))] },
      },
      select: { id: true, nickname: true, avatar: true, phone: true },
    });
    const customerMap = new Map(customers.map((row) => [row.id, row]));
    const list = rows.map((row) => {
      const own = itemMap.get(row.id) || [];
      const buyer = customerMap.get(row.customerId);
      return {
        ...this.publicRow(row, buyer),
        itemCount: own.length,
        itemSummary: own
          .map(
            (item) =>
              `${item.title}${item.skuName ? ` / ${item.skuName}` : ''} ×${item.quantity}`,
          )
          .join('；'),
        coverImage: own[0]?.image || '',
      };
    });
    return pageOf(list, total, page, pageSize);
  }

  async detail(seller: Seller, orderId: number): Promise<TakeoutOrderDetail> {
    const row = await this.prisma.takeoutOrder.findFirst({
      where: { id: orderId, shopId: seller.shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    const [items, logs, customer] = await Promise.all([
      this.prisma.takeoutOrderItem.findMany({
        where: { orderId, shopId: seller.shopId },
        orderBy: { id: 'asc' },
      }),
      this.prisma.takeoutOrderLog.findMany({
        where: { orderId, shopId: seller.shopId },
        orderBy: { id: 'asc' },
      }),
      this.prisma.takeoutCustomer.findFirst({
        where: { id: row.customerId, shopId: seller.shopId },
        select: { nickname: true, avatar: true, phone: true },
      }),
    ]);
    return {
      ...this.publicRow(row, customer || undefined),
      itemCount: items.length,
      itemSummary: items
        .map((item) => `${item.title} ×${item.quantity}`)
        .join('；'),
      coverImage: items[0]?.image || '',
      items: items.map(itemMap),
      logs: logs.map((log) => ({
        id: log.id,
        operatorType: log.operatorType,
        operatorId: log.operatorId,
        action: log.action,
        content: log.content,
        createdAt: iso(log.createdAt),
      })),
      receiver: {
        name: row.receiverName,
        phone: row.receiverPhone,
        province: row.receiverProvince,
        city: row.receiverCity,
        district: row.receiverDistrict,
        detail: row.receiverDetail,
      },
      transactionId: row.transactionId,
    };
  }

  async remark(seller: Seller, orderId: number, sellerRemark: string) {
    const order = await this.prisma.takeoutOrder.findFirst({
      where: { id: orderId, shopId: seller.shopId },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    await this.prisma.takeoutOrder.update({
      where: { id: order.id },
      data: { sellerRemark: clip(sellerRemark, 500) },
    });
    return this.detail(seller, order.id);
  }

  async advance(seller: Seller, orderId: number, action: 'READY') {
    const order = await this.prisma.takeoutOrder.findFirst({
      where: { id: orderId, shopId: seller.shopId },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    if (action !== 'READY') {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '不支持的履约动作');
    }
    if (order.status !== 'PAID') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        order.status === 'SHIPPED'
          ? '该订单已出餐'
          : `当前状态（${order.status}）不能出餐，需先等顾客付款`,
      );
    }
    const now = new Date();
    await this.prisma.takeoutOrder.update({
      where: { id: order.id },
      data: { status: 'SHIPPED', shippedAt: now },
    });
    await this.prisma.takeoutOrderLog.create({
      data: {
        orderId: order.id,
        shopId: seller.shopId,
        operatorType: 'OWNER',
        operatorId: seller.ownerUserId,
        action: 'TAKEOUT_READY',
        content:
          order.orderMode === 'PICKUP'
            ? '餐品已出餐，等待顾客到店取餐'
            : order.orderMode === 'DINEIN'
              ? '餐品已出餐'
              : '餐品已出餐，等待配送',
      },
    });
    return this.detail(seller, order.id);
  }

  async finish(seller: Seller, orderId: number) {
    const order = await this.prisma.takeoutOrder.findFirst({
      where: { id: orderId, shopId: seller.shopId },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    if (order.status !== 'SHIPPED') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '只有待取餐/配送中的订单可以标记完成',
      );
    }
    const now = new Date();
    await this.prisma.takeoutOrder.update({
      where: { id: order.id },
      data: { status: 'COMPLETED', completedAt: now },
    });
    await this.prisma.takeoutOrderLog.create({
      data: {
        orderId: order.id,
        shopId: seller.shopId,
        operatorType: 'OWNER',
        operatorId: seller.ownerUserId,
        action: 'FINISH',
        content: '商家标记订单完成',
      },
    });
    await this.scrm.enqueue({
      shopId: seller.shopId,
      ownerUserId: seller.ownerUserId,
      customerId: order.customerId,
      kind: 'ORDER_COMPLETED',
      recordKey: order.id,
      payload: {
        orderNo: order.orderNo,
        amountYuan: Number(order.payAmount),
      },
    });
    return this.detail(seller, order.id);
  }

  /** 线下已收款：把待支付订单标记为已付，避免线下单卡在待支付。 */
  async markOfflinePaid(seller: Seller, orderId: number) {
    const order = await this.prisma.takeoutOrder.findFirst({
      where: { id: orderId, shopId: seller.shopId },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    if (order.payStatus === 'PAID') return this.detail(seller, order.id);
    const changed = await this.prisma.takeoutOrder.updateMany({
      where: { id: order.id, shopId: seller.shopId, payStatus: 'UNPAID' },
      data: {
        payStatus: 'PAID',
        status: 'PAID',
        paidAt: new Date(),
        payType: 'OFFLINE',
        expireAt: null,
      },
    });
    if (changed.count === 0) {
      throw new BusinessException(ErrorCode.CONFLICT, '订单状态已变化，请刷新');
    }
    await this.markPaidEffects(
      {
        id: order.id,
        shopId: seller.shopId,
        customerId: order.customerId,
        orderNo: order.orderNo,
        pointsReturn: order.pointsReturn,
        payAmount: order.payAmount,
      },
      {
        shopId: seller.shopId,
        customerId: order.customerId,
        ownerUserId: seller.ownerUserId,
        openid: '',
      },
    );
    await this.prisma.takeoutOrderLog.create({
      data: {
        orderId: order.id,
        shopId: seller.shopId,
        operatorType: 'OWNER',
        operatorId: seller.ownerUserId,
        action: 'OFFLINE_PAID',
        content: '商家确认已线下收款',
      },
    });
    return this.detail(seller, order.id);
  }

  // ---------------------------------------------------------------- 工具

  private publicRow(
    row: OrderLike,
    buyer?: { nickname: string; avatar: string; phone: string },
  ): TakeoutOrderRow {
    return {
      id: row.id,
      orderNo: row.orderNo,
      customerId: row.customerId,
      nickname: buyer?.nickname || '微信顾客',
      avatar: buyer?.avatar || '',
      customerPhone: buyer?.phone || '',
      status: orderStatus(row.status),
      payStatus: payStatusOf(row.payStatus),
      orderMode: orderModeOf(row.orderMode),
      payType: payTypeOf(row.payType),
      tableNo: row.tableNo,
      pickupCode: row.pickupCode,
      expectedAt: iso(row.expectedAt),
      goodsAmount: amountOut(row.goodsAmount),
      deliveryFee: amountOut(row.deliveryFee),
      discountAmount: amountOut(row.discountAmount),
      payAmount: amountOut(row.payAmount),
      pointsDeduct: row.pointsDeduct,
      couponName: row.couponName,
      buyerRemark: row.buyerRemark,
      sellerRemark: row.sellerRemark,
      itemCount: 0,
      itemSummary: '',
      coverImage: '',
      createdAt: iso(row.createdAt),
      paidAt: iso(row.paidAt),
      shippedAt: iso(row.shippedAt),
      completedAt: iso(row.completedAt),
      cancelledAt: iso(row.cancelledAt),
      expireAt: iso(row.expireAt),
    };
  }

  private async deductStock(shopId: number, line: Line): Promise<boolean> {
    if (line.skuId > 0) {
      const hit = await this.prisma.takeoutProductSku.updateMany({
        where: {
          id: line.skuId,
          shopId,
          stock: { gte: line.quantity },
        },
        data: { stock: { decrement: line.quantity } },
      });
      if (hit.count === 0) return false;
    }
    const productHit = await this.prisma.takeoutProduct.updateMany({
      where: {
        id: line.productId,
        shopId,
        stock: { gte: line.quantity },
      },
      data: { stock: { decrement: line.quantity } },
    });
    if (productHit.count === 0 && line.skuId > 0) {
      await this.prisma.takeoutProductSku.updateMany({
        where: { id: line.skuId, shopId },
        data: { stock: { increment: line.quantity } },
      });
    }
    return productHit.count > 0;
  }

  private async restoreStock(
    shopId: number,
    line: Pick<Line, 'productId' | 'skuId' | 'quantity'>,
  ) {
    if (line.skuId > 0) {
      await this.prisma.takeoutProductSku.updateMany({
        where: { id: line.skuId, shopId },
        data: { stock: { increment: line.quantity } },
      });
    }
    await this.prisma.takeoutProduct.updateMany({
      where: { id: line.productId, shopId },
      data: { stock: { increment: line.quantity } },
    });
  }
}

function itemMap(item: ItemLike): TakeoutOrderItem {
  return {
    id: item.id,
    productId: item.productId,
    skuId: item.skuId,
    title: item.title,
    skuName: item.skuName,
    image: item.image,
    price: amountOut(item.price),
    quantity: item.quantity,
    totalPrice: amountOut(item.totalPrice),
  };
}

function expectedTime(value: string): Date | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  const now = Date.now();
  if (time < now - 60_000 || time > now + 7 * 86_400_000) return null;
  return new Date(time);
}
