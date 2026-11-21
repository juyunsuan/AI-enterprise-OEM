import {
  type BrandOrderDetail,
  type BrandPublicOrderCreated,
  type BrandPublicOrderRow,
  type BrandPublicPreview,
  type BrandPublicPreviewLine,
  type BrandPublicRefundCreateBody,
  type BrandRefund,
} from '@enterprise/contracts';
import { pageOf, pageParam } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { BrandCouponService } from './brand.coupon.service';
import type { BrandCustomerService } from './brand.customer.service';
import {
  orderDetail,
  orderRow,
  publicOrderRow,
  refundRow,
} from './brand.order.mapper';
import type { BrandPayService } from './brand.pay.service';
import type { BrandShippingService } from './brand.shipping.service';
import type { BrandShopService } from './brand.shop.service';
import { noopScrmSink, type BrandScrmSink } from './brand.scrm.service';
import {
  amount,
  clip,
  commerceRulesOf,
  fromCents,
  brandOrderNo,
  pageArgs,
  toCents,
} from './brand.shared';
import { priceOrder, type CouponSpec } from '../commerce-core/pricing';

type Buyer = { shopId: number; customerId: number; ownerUserId: string };
type Seller = { ownerUserId: string; shopId: number };

/** 查询串里的日期只认字符串，对象/数组一律当没填（避免拼出 [object Object] 的日期）。 */
const dayOf = (value: unknown): string =>
  typeof value === 'string' ? value : '';

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
  productType: string;
  /** 商品选用的运费模板 id；0 = 店铺统一运费 */
  freightTemplateId: number;
  valid: boolean;
  invalidReason: string;
};

const round2 = fromCents;

/**
 * 交易域：算价 → 下单 → 支付回写 → 发货收货 → 售后退款。
 *
 * 四条必须坚持的口径：
 * 1. **算价只有一套实现**：试算与下单都走 `price()`，端上传的金额一律不信；
 * 2. 金额全程走「分」的整数，只在出入口转 number；
 * 3. 库存与券都用带条件的 `updateMany` 扣减，靠影响行数判并发，不靠先查后写；
 * 4. 支付回调幂等：同一 transactionId 重复回调只生效一次，且必须校验金额一致。
 */
export class BrandOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shops: BrandShopService,
    private readonly customers: BrandCustomerService,
    private readonly coupons: BrandCouponService,
    private readonly pay: BrandPayService,
    private readonly shipping: BrandShippingService,
    private readonly scrm: BrandScrmSink = noopScrmSink,
  ) {}

  // ---------------------------------------------------------------- 算价

  /** 组装购物行：商品/SKU 都按 shopId 双条件查，失效行标记出来而不是直接报错。 */
  private async linesOf(
    buyer: Buyer,
    items: Array<{ productId: number; skuId: number; quantity: number }>,
    fromCart: boolean,
  ): Promise<Line[]> {
    const wanted = fromCart
      ? (
          await this.prisma.brandCartItem.findMany({
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
    if (wanted.length === 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '购物车里没有勾选的商品',
      );
    }
    const productIds = [...new Set(wanted.map((row) => row.productId))];
    const skuIds = wanted.map((row) => row.skuId).filter((id) => id > 0);
    const [products, skus] = await Promise.all([
      this.prisma.brandProduct.findMany({
        where: { shopId: buyer.shopId, id: { in: productIds } },
        select: {
          id: true,
          categoryId: true,
          title: true,
          coverImage: true,
          images: true,
          price: true,
          stock: true,
          status: true,
          type: true,
          freightTemplateId: true,
        },
      }),
      skuIds.length
        ? this.prisma.brandProductSku.findMany({
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
      const quantity = Math.max(
        1,
        Math.min(999, Math.round(row.quantity || 1)),
      );
      const priceCents = toCents(sku ? sku.price : (product?.price ?? 0));
      const stock = sku ? sku.stock : Number(product?.stock || 0);
      let invalidReason = '';
      if (!product) invalidReason = '商品已下架或删除';
      else if (product.status !== 'ONLINE') invalidReason = '商品已下架';
      else if (row.skuId && !sku) invalidReason = '所选规格已下架';
      else if (sku && !sku.enabled) invalidReason = '所选规格已下架';
      else if (product.type !== 'VIRTUAL' && stock < quantity) {
        invalidReason = stock > 0 ? `库存不足，仅剩 ${stock} 件` : '库存不足';
      }
      const images = Array.isArray(product?.images)
        ? (product.images as unknown[])
        : [];
      const firstImage = typeof images[0] === 'string' ? images[0] : '';
      return {
        productId: row.productId,
        skuId: row.skuId,
        quantity,
        title: product?.title || '（商品已删除）',
        skuName: sku?.skuName || '',
        image: sku?.image || product?.coverImage || firstImage || '',
        priceCents,
        stock: product?.type === 'VIRTUAL' ? 9999 : stock,
        categoryId: product?.categoryId || 0,
        productType: product?.type || 'NORMAL',
        freightTemplateId: Number(product?.freightTemplateId || 0),
        valid: invalidReason === '',
        invalidReason,
      };
    });
  }

  /**
   * 唯一算价入口：算价本体在 `commerce-core/pricing`，这里只负责查数据。
   *
   * 分工：券的「能不能用」（领取状态/过期/券下架）要查库，留在券服务；
   * 门槛、适用范围、抵扣额、运费、积分抵扣与返分全部由引擎一次算完，
   * 试算与下单同一条链路，端上传的金额一律不信。
   */
  private async price(
    buyer: Buyer,
    items: Array<{ productId: number; skuId: number; quantity: number }>,
    options: {
      fromCart: boolean;
      addressId: number;
      couponTicketId: number;
      usePoints: number;
    },
  ): Promise<{
    lines: Line[];
    goodsCents: number;
    freightCents: number;
    freightReason: string;
    discountCents: number;
    pointsDeduct: number;
    pointsAmountCents: number;
    pointsReturn: number;
    payCents: number;
    couponName: string;
    couponReason: string;
    maxUsablePoints: number;
    blockReason: string;
    trade: Awaited<ReturnType<BrandShopService['requireShop']>>['trade'];
  }> {
    const shop = await this.shops.requireShop(
      { userId: buyer.ownerUserId } as CurrentUser,
      buyer.shopId,
    );
    const trade = shop.trade;
    const lines = await this.linesOf(buyer, items, options.fromCart);
    const invalid = lines.filter((line) => !line.valid);
    if (invalid.length > 0) {
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
      const customer = await this.prisma.brandCustomer.findFirst({
        where: { id: buyer.customerId, shopId: buyer.shopId },
        select: { points: true },
      });
      pointsOwned = Math.max(0, Number(customer?.points || 0));
    }
    const address =
      options.addressId > 0
        ? await this.prisma.brandCustomerAddress.findFirst({
            where: {
              id: options.addressId,
              shopId: buyer.shopId,
              customerId: buyer.customerId,
            },
            select: { province: true, city: true, district: true },
          })
        : null;
    const zonesByTemplate = await this.shipping.zonesOf(
      buyer.shopId,
      lines.map((line) => line.freightTemplateId),
    );
    const priced = priceOrder({
      lines: lines.map((line) => ({
        ...line,
        unitCents: line.priceCents,
        requiresShipping: line.productType !== 'VIRTUAL',
        splitKey: '',
      })),
      rules: commerceRulesOf(trade),
      coupon,
      zonesByTemplate,
      region: address
        ? {
            province: address.province || '',
            city: address.city || '',
            district: address.district || '',
          }
        : null,
      pointsOwned,
      pointsRequested: options.usePoints,
      addressSelected: options.addressId > 0,
    });
    return {
      lines,
      goodsCents: priced.goodsCents,
      freightCents: priced.freightCents,
      freightReason: priced.freightReason,
      discountCents: priced.discountCents,
      pointsDeduct: priced.pointsDeduct,
      pointsAmountCents: priced.pointsDiscountCents,
      pointsReturn: priced.pointsReturn,
      payCents: priced.payCents,
      couponName: priced.couponName,
      couponReason: priced.couponReason,
      maxUsablePoints: priced.maxUsablePoints,
      blockReason: priced.blockReason,
      trade,
    };
  }

  async preview(
    buyer: Buyer,
    body: {
      items: Array<{ productId: number; skuId: number; quantity: number }>;
      fromCart: boolean;
      addressId: number;
      couponTicketId: number;
      usePoints: number;
    },
  ): Promise<BrandPublicPreview> {
    const priced = await this.price(buyer, body.items, {
      fromCart: body.fromCart,
      addressId: body.addressId,
      couponTicketId: body.couponTicketId,
      usePoints: body.usePoints,
    });
    const address = body.addressId
      ? await this.prisma.brandCustomerAddress.findFirst({
          where: {
            id: body.addressId,
            shopId: buyer.shopId,
            customerId: buyer.customerId,
          },
        })
      : await this.prisma.brandCustomerAddress.findFirst({
          where: {
            shopId: buyer.shopId,
            customerId: buyer.customerId,
            isDefault: true,
          },
        });
    const coupons = await this.coupons.availableFor(
      buyer.shopId,
      buyer.customerId,
      priced.lines.map((line) => ({
        productId: line.productId,
        categoryId: line.categoryId,
        totalPrice: round2(line.priceCents * line.quantity),
      })),
    );
    return {
      lines: priced.lines.map((line): BrandPublicPreviewLine => ({
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
      discountAmount: round2(priced.discountCents),
      pointsDeduct: priced.pointsDeduct,
      pointsDeductAmount: round2(priced.pointsAmountCents),
      payAmount: round2(priced.payCents),
      coupons: coupons.map((item) => ({
        ticketId: item.ticketId,
        name: item.name,
        type: item.type,
        value: item.value,
        threshold: item.threshold,
        usable: item.usable,
        reason: item.reason,
      })),
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
      blockReason: priced.blockReason,
    };
  }

  // ---------------------------------------------------------------- 下单

  async create(
    buyer: Buyer,
    body: {
      items: Array<{ productId: number; skuId: number; quantity: number }>;
      fromCart: boolean;
      addressId: number;
      couponTicketId: number;
      usePoints: number;
      buyerRemark: string;
      payType: 'WECHAT' | 'BALANCE' | 'OFFLINE';
    },
    clientIp: string,
    openid: string,
  ): Promise<BrandPublicOrderCreated> {
    const priced = await this.price(buyer, body.items, {
      fromCart: body.fromCart,
      addressId: body.addressId,
      couponTicketId: body.couponTicketId,
      usePoints: body.usePoints,
    });
    if (priced.blockReason) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, priced.blockReason);
    }
    const address = await this.prisma.brandCustomerAddress.findFirst({
      where: {
        id: body.addressId,
        shopId: buyer.shopId,
        customerId: buyer.customerId,
      },
    });
    if (!address) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '收货地址不存在，请到「我的-收货地址」重新选择',
      );
    }
    if (priced.payCents <= 0 && priced.goodsCents > 0) {
      // 全额抵扣（券 + 积分）时不再拉支付通道，直接按线下已付处理
      priced.payCents = 0;
    }
    const needPay = priced.payCents > 0;
    const payType = needPay ? body.payType : 'OFFLINE';
    if (payType === 'WECHAT') {
      const payReady = await this.pay.available(
        buyer.shopId,
        buyer.ownerUserId,
      );
      if (!payReady) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '该商城还没开通在线收款，请选择线下支付或联系商家',
        );
      }
    }
    const shop = await this.shops.requireShop(
      { userId: buyer.ownerUserId } as CurrentUser,
      buyer.shopId,
    );

    // 先扣库存：任一行失败就把已扣的回滚，避免半单成功
    const deducted: Line[] = [];
    for (const line of priced.lines) {
      if (line.productType === 'VIRTUAL') continue;
      const stockLeft = await this.deductStock(buyer.shopId, line);
      if (!stockLeft) {
        for (const done of deducted)
          await this.restoreStock(buyer.shopId, done);
        throw new BusinessException(
          ErrorCode.CONFLICT,
          `「${line.title}」库存不足，请调整数量后重试`,
        );
      }
      deducted.push(line);
    }

    let orderNo = brandOrderNo('MD');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const dup = await this.prisma.brandOrder.findUnique({
        where: { orderNo },
      });
      if (!dup) break;
      orderNo = brandOrderNo('MD');
    }
    let orderId = 0;
    try {
      const order = await this.prisma.brandOrder.create({
        data: {
          shopId: buyer.shopId,
          ownerUserId: buyer.ownerUserId,
          orderNo,
          customerId: buyer.customerId,
          status: needPay ? 'PENDING_PAYMENT' : 'PAID',
          payStatus: needPay ? 'UNPAID' : 'PAID',
          refundStatus: 'NONE',
          goodsAmount: round2(priced.goodsCents),
          freightAmount: round2(priced.freightCents),
          discountAmount: round2(priced.discountCents),
          payAmount: round2(priced.payCents),
          pointsDeduct: priced.pointsDeduct,
          pointsReturn: priced.pointsReturn,
          couponTicketId: body.couponTicketId,
          couponName: priced.couponName,
          payType,
          receiverName: address.realName,
          receiverPhone: address.phone,
          receiverProvince: address.province,
          receiverCity: address.city,
          receiverDistrict: address.district,
          receiverDetail: address.detail,
          buyerRemark: clip(body.buyerRemark, 200),
          expireAt: needPay
            ? new Date(Date.now() + shop.trade.autoCancelMinutes * 60_000)
            : null,
          clientIp: clip(clientIp, 64),
        },
      });
      orderId = order.id;
      for (const line of priced.lines) {
        await this.prisma.brandOrderItem.create({
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
        await this.prisma.brandProduct.updateMany({
          where: { id: line.productId, shopId: buyer.shopId },
          data: { sales: { increment: line.quantity } },
        });
      }
      await this.prisma.brandOrderLog.create({
        data: {
          orderId: order.id,
          shopId: buyer.shopId,
          operatorType: 'CUSTOMER',
          operatorId: String(buyer.customerId),
          action: 'CREATE',
          content: `买家提交订单，应付 ${round2(priced.payCents)} 元`,
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
        await this.prisma.brandCartItem.deleteMany({
          where: {
            shopId: buyer.shopId,
            customerId: buyer.customerId,
            selected: true,
          },
        });
      }
      if (!needPay) {
        await this.prisma.brandOrder.update({
          where: { id: order.id },
          data: { paidAt: new Date() },
        });
        await this.emitScrm(
          'ORDER_PAID',
          order.id,
          buyer.shopId,
          buyer.customerId,
          {
            orderNo,
            amountYuan: fromCents(priced.payCents),
          },
        );
      }
      if (shop.trade.buyerMessageEnabled === false && body.buyerRemark) {
        // 店主关了买家留言：静默丢弃即可，不因此拒单
      }
    } catch (error) {
      for (const line of deducted) await this.restoreStock(buyer.shopId, line);
      if (orderId > 0)
        await this.cancelInternal(buyer.shopId, orderId, '下单过程失败回滚');
      throw error;
    }

    const saved = await this.prisma.brandOrder.findUnique({
      where: { id: orderId },
    });
    if (!saved) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '订单创建失败，请重试');
    }
    let payParams: BrandPublicOrderCreated['payParams'] = null;
    if (needPay && payType === 'WECHAT') {
      payParams = await this.pay.prepay({
        shopId: buyer.shopId,
        ownerUserId: buyer.ownerUserId,
        orderNo: saved.orderNo,
        amountCents: priced.payCents,
        description: priced.lines[0]?.title.slice(0, 60) || '商品订单',
        openid,
      });
    }
    return {
      orderId: saved.id,
      orderNo: saved.orderNo,
      payAmount: round2(priced.payCents),
      expireAt: saved.expireAt ? saved.expireAt.toISOString() : '',
      payParams,
    };
  }

  private async deductStock(shopId: number, line: Line): Promise<boolean> {
    const where =
      line.skuId > 0
        ? { id: line.skuId, shopId, stock: { gte: line.quantity } }
        : { productId: line.productId, shopId, stock: { gte: line.quantity } };
    const skuHit =
      line.skuId > 0
        ? await this.prisma.brandProductSku.updateMany({
            where,
            data: {
              stock: { decrement: line.quantity },
              sales: { increment: line.quantity },
            },
          })
        : null;
    if (line.skuId > 0 && skuHit?.count === 0) return false;
    const productHit = await this.prisma.brandProduct.updateMany({
      where: { id: line.productId, shopId, stock: { gte: line.quantity } },
      data: { stock: { decrement: line.quantity } },
    });
    return productHit.count > 0;
  }

  private async restoreStock(shopId: number, line: Line) {
    if (line.skuId > 0) {
      await this.prisma.brandProductSku.updateMany({
        where: { id: line.skuId, shopId },
        data: {
          stock: { increment: line.quantity },
          sales: { decrement: line.quantity },
        },
      });
    }
    await this.prisma.brandProduct.updateMany({
      where: { id: line.productId, shopId },
      data: {
        stock: { increment: line.quantity },
        sales: { decrement: line.quantity },
      },
    });
  }

  // ---------------------------------------------------------------- 取消与回补

  private async cancelInternal(
    shopId: number,
    orderId: number,
    reason: string,
  ) {
    const order = await this.prisma.brandOrder.findFirst({
      where: { id: orderId, shopId },
    });
    if (!order || order.status !== 'PENDING_PAYMENT') return false;
    const changed = await this.prisma.brandOrder.updateMany({
      // 只允许从「待付款」取消，支付回调与取消并发时以回调为准
      where: { id: orderId, shopId, status: 'PENDING_PAYMENT' },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: clip(reason, 200),
        expireAt: null,
      },
    });
    if (changed.count === 0) return false;
    const items = await this.prisma.brandOrderItem.findMany({
      where: { orderId, shopId },
    });
    for (const item of items) {
      const line: Line = {
        productId: item.productId,
        skuId: item.skuId,
        quantity: item.quantity,
        title: item.title,
        skuName: '',
        image: '',
        priceCents: toCents(item.price),
        stock: 0,
        categoryId: 0,
        productType: 'NORMAL',
        freightTemplateId: 0,
        valid: true,
        invalidReason: '',
      };
      await this.restoreStock(shopId, line);
    }
    if (order.couponTicketId > 0) {
      await this.coupons.release(shopId, order.couponTicketId);
      await this.prisma.brandOrder.update({
        where: { id: orderId },
        data: { couponTicketId: 0 },
      });
    }
    if (order.pointsDeduct > 0) {
      await this.customers.addPoints(
        shopId,
        order.customerId,
        order.pointsDeduct,
        'POINT_EARN',
        { type: 'ORDER', id: orderId },
        `订单 ${order.orderNo} 取消，积分退回`,
      );
    }
    await this.prisma.brandOrderLog.create({
      data: {
        orderId,
        shopId,
        operatorType: 'SYSTEM',
        operatorId: '',
        action: 'CANCEL',
        content: clip(reason, 500) || '订单已取消',
      },
    });
    return true;
  }

  async cancelByCustomer(shopId: number, customerId: number, orderId: number) {
    const order = await this.prisma.brandOrder.findFirst({
      where: { id: orderId, shopId, customerId },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    const shop = await this.prisma.brandShop.findUnique({
      where: { id: shopId },
    });
    if (shop) {
      const { normalizeTrade } = await import('./brand.shop.service');
      if (!normalizeTrade(shop.tradeJson).selfCancelEnabled) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '该商城不允许自助取消，如需取消请联系商家',
        );
      }
    }
    if (order.status !== 'PENDING_PAYMENT') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '只有待付款订单可以取消',
      );
    }
    const done = await this.cancelInternal(shopId, order.id, '买家主动取消');
    if (!done) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '订单状态已变化，请刷新后重试',
      );
    }
    return { ok: true, message: '订单已取消' };
  }

  /** 定时任务用：超时未付款自动取消。 */
  async autoCancelExpired(limit = 200) {
    const rows = await this.prisma.brandOrder.findMany({
      where: { status: 'PENDING_PAYMENT', expireAt: { lt: new Date() } },
      select: { id: true, shopId: true },
      take: limit,
    });
    let count = 0;
    for (const row of rows) {
      const done = await this.cancelInternal(
        row.shopId,
        row.id,
        '超时未付款，系统自动取消',
      );
      if (done) count += 1;
    }
    return count;
  }

  // ---------------------------------------------------------------- 支付回写

  /**
   * 支付成功回写（幂等）。`expectCents` 来自微信回调里的金额，
   * 与订单应付不一致时**只记日志不改状态**：宁可漏一单人工处理，
   * 也不能让伪造或错金额的回调把订单置成已付。
   */
  async markPaid(
    shopId: number,
    orderNo: string,
    transactionId: string,
    expectCents: number,
  ): Promise<{ ok: boolean; message: string }> {
    const order = await this.prisma.brandOrder.findFirst({
      where: { shopId, orderNo },
    });
    if (!order) return { ok: false, message: `订单 ${orderNo} 不存在` };
    if (order.payStatus === 'PAID' || order.payStatus === 'REFUNDED') {
      return { ok: true, message: '订单已是已付状态，忽略重复回调' };
    }
    if (toCents(order.payAmount) !== Math.round(expectCents)) {
      await this.prisma.brandOrderLog.create({
        data: {
          orderId: order.id,
          shopId,
          operatorType: 'SYSTEM',
          operatorId: '',
          action: 'PAY_AMOUNT_MISMATCH',
          content: `回调金额 ${fromCents(expectCents)} 与应付 ${amount(order.payAmount)} 不一致，已忽略`,
        },
      });
      return {
        ok: false,
        message: '回调金额与订单应付不一致，已记录待人工核对',
      };
    }
    const changed = await this.prisma.brandOrder.updateMany({
      where: { id: order.id, shopId, payStatus: 'UNPAID' },
      data: {
        payStatus: 'PAID',
        status: 'PAID',
        paidAt: new Date(),
        transactionId: clip(transactionId, 64),
        expireAt: null,
      },
    });
    if (changed.count === 0)
      return { ok: true, message: '并发回调，已由其他请求处理' };
    // 整单都是虚拟商品时付款即完成，不需要发货
    const items = await this.prisma.brandOrderItem.findMany({
      where: { orderId: order.id, shopId },
    });
    const products = await this.prisma.brandProduct.findMany({
      where: { shopId, id: { in: items.map((item) => item.productId) } },
      select: { id: true, type: true },
    });
    const typeMap = new Map(products.map((row) => [row.id, row.type]));
    const allVirtual =
      items.length > 0 &&
      items.every((item) => typeMap.get(item.productId) === 'VIRTUAL');
    if (allVirtual) {
      await this.prisma.brandOrder.update({
        where: { id: order.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          receivedAt: new Date(),
        },
      });
    }
    if (order.pointsReturn > 0) {
      await this.customers.addPoints(
        shopId,
        order.customerId,
        order.pointsReturn,
        'POINT_EARN',
        { type: 'ORDER', id: order.id },
        `订单 ${order.orderNo} 消费返积分`,
      );
    }
    await this.prisma.brandOrderLog.create({
      data: {
        orderId: order.id,
        shopId,
        operatorType: 'SYSTEM',
        operatorId: '',
        action: 'PAID',
        content: `支付成功，流水号 ${clip(transactionId, 64)}`,
      },
    });
    await this.emitScrm('ORDER_PAID', order.id, shopId, order.customerId, {
      orderNo: order.orderNo,
      amountYuan: Number(order.payAmount),
    });
    return { ok: true, message: '已置为已付款' };
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
      this.prisma.brandOrder.findMany({
        where,
        orderBy: [{ id: 'desc' }],
        skip: offset,
        take: size,
      }),
      this.prisma.brandOrder.count({ where }),
    ]);
    const ids = rows.map((row) => row.id);
    const items = ids.length
      ? await this.prisma.brandOrderItem.findMany({
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
      const base = publicOrderRow(row);
      return {
        ...base,
        itemCount: own.length,
        coverImage: own[0]?.image || '',
        items: own.map((item) => ({
          productId: item.productId,
          skuId: item.skuId,
          title: item.title,
          skuName: item.skuName,
          image: item.image,
          price: Number(item.price),
          quantity: item.quantity,
          reviewed: item.reviewed,
        })),
      };
    });
    return pageOf<BrandPublicOrderRow & { items: unknown[] }>(
      list,
      total,
      pageNo,
      size,
    );
  }

  async publicDetail(
    shopId: number,
    customerId: number,
    orderId: number,
  ): Promise<BrandOrderDetail> {
    return this.detail({ shopId, ownerUserId: '' }, orderId, customerId);
  }

  async receive(shopId: number, customerId: number, orderId: number) {
    const order = await this.prisma.brandOrder.findFirst({
      where: { id: orderId, shopId, customerId },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    if (order.status !== 'SHIPPED') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '只有待收货订单可以确认收货',
      );
    }
    await this.prisma.brandOrder.update({
      where: { id: order.id },
      data: {
        status: 'COMPLETED',
        receivedAt: new Date(),
        completedAt: new Date(),
      },
    });
    await this.prisma.brandOrderLog.create({
      data: {
        orderId: order.id,
        shopId,
        operatorType: 'CUSTOMER',
        operatorId: String(customerId),
        action: 'RECEIVE',
        content: '买家确认收货',
      },
    });
    await this.emitScrm('ORDER_COMPLETED', order.id, shopId, customerId, {
      orderNo: order.orderNo,
      amountYuan: Number(order.payAmount),
    });
    return { ok: true, message: '已确认收货，可以去评价了' };
  }

  // ---------------------------------------------------------------- 店主侧

  async list(seller: Seller, query: Record<string, unknown>) {
    const { page, pageSize, offset } = pageArgs(query);
    const where: Record<string, unknown> = { shopId: seller.shopId };
    if (query.status) where.status = query.status;
    if (query.refundStatus) where.refundStatus = query.refundStatus;
    if (query.payType) where.payType = query.payType;
    if (query.customerId) where.customerId = Number(query.customerId);
    if (query.dateFrom || query.dateTo) {
      const range: Record<string, Date> = {};
      if (query.dateFrom)
        range.gte = new Date(`${dayOf(query.dateFrom)}T00:00:00`);
      if (query.dateTo) range.lte = new Date(`${dayOf(query.dateTo)}T23:59:59`);
      where.createdAt = range;
    }
    const keyword = clip(query.keyword, 60).trim();
    if (keyword) {
      const customers = await this.prisma.brandCustomer.findMany({
        where: {
          shopId: seller.shopId,
          OR: [
            { nickname: { contains: keyword } },
            { phone: { contains: keyword } },
          ],
        },
        select: { id: true },
        take: 500,
      });
      where.OR = [
        { orderNo: { contains: keyword } },
        { receiverName: { contains: keyword } },
        { receiverPhone: { contains: keyword } },
        { customerId: { in: customers.map((row) => row.id) } },
      ];
    }
    const [rows, total, grouped] = await Promise.all([
      this.prisma.brandOrder.findMany({
        where,
        orderBy: [{ id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.brandOrder.count({ where }),
      this.statusCounts(seller.shopId, query),
    ]);
    const ids = rows.map((row) => row.id);
    const [items, customers] = await Promise.all([
      ids.length
        ? this.prisma.brandOrderItem.findMany({
            where: { orderId: { in: ids }, shopId: seller.shopId },
          })
        : Promise.resolve([]),
      this.prisma.brandCustomer.findMany({
        where: {
          shopId: seller.shopId,
          id: { in: [...new Set(rows.map((row) => row.customerId))] },
        },
        select: { id: true, nickname: true, avatar: true, phone: true },
      }),
    ]);
    const itemMap = new Map<number, typeof items>();
    for (const item of items) {
      const list = itemMap.get(item.orderId) || [];
      list.push(item);
      itemMap.set(item.orderId, list);
    }
    const customerMap = new Map(customers.map((row) => [row.id, row]));
    const list = rows.map((row) => {
      const own = itemMap.get(row.id) || [];
      const buyer = customerMap.get(row.customerId);
      return orderRow(row, {
        nickname: buyer?.nickname,
        avatar: buyer?.avatar,
        customerPhone: buyer?.phone,
        itemCount: own.length,
        itemSummary: own
          .map(
            (item) =>
              `${item.title}${item.skuName ? ` / ${item.skuName}` : ''} ×${item.quantity}`,
          )
          .join('；'),
        coverImage: own[0]?.image || '',
      });
    });
    return { ...pageOf(list, total, page, pageSize), statusCounts: grouped };
  }

  private async statusCounts(shopId: number, query: Record<string, unknown>) {
    const base: Record<string, unknown> = { shopId };
    const keyword = clip(query.keyword, 60).trim();
    if (keyword) base.orderNo = { contains: keyword };
    if (query.dateFrom) {
      base.createdAt = {
        ...(base.createdAt as object),
        gte: new Date(`${dayOf(query.dateFrom)}T00:00:00`),
      };
    }
    if (query.dateTo) {
      base.createdAt = {
        ...(base.createdAt as object),
        lte: new Date(`${dayOf(query.dateTo)}T23:59:59`),
      };
    }
    const rows = await this.prisma.brandOrder.groupBy({
      by: ['status'],
      where: base,
      _count: { _all: true },
    });
    const counts: Record<string, number> = { ALL: 0, REFUNDING: 0 };
    for (const row of rows) {
      counts[row.status] = row._count._all;
      counts.ALL += row._count._all;
    }
    // 前端「售后中」页签按 AFTER_SALE 取数；REFUNDING 作为别名一并给出，避免两个会话各猜一个键
    const afterSale = await this.prisma.brandOrder.count({
      where: { shopId, refundStatus: 'PENDING' },
    });
    counts.AFTER_SALE = afterSale;
    counts.REFUNDING = afterSale;
    return counts;
  }

  async detail(
    seller: { shopId: number; ownerUserId: string },
    orderId: number,
    customerId?: number,
  ): Promise<BrandOrderDetail> {
    const where: Record<string, unknown> = {
      id: Number(orderId),
      shopId: seller.shopId,
    };
    if (customerId) where.customerId = customerId;
    const order = await this.prisma.brandOrder.findFirst({ where });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    const [items, logs, refunds, buyer] = await Promise.all([
      this.prisma.brandOrderItem.findMany({
        where: { orderId: order.id, shopId: order.shopId },
      }),
      this.prisma.brandOrderLog.findMany({
        where: { orderId: order.id, shopId: order.shopId },
        orderBy: [{ id: 'asc' }],
        take: 100,
      }),
      this.prisma.brandRefundOrder.findMany({
        where: { orderId: order.id, shopId: order.shopId },
        orderBy: [{ id: 'desc' }],
      }),
      this.prisma.brandCustomer.findFirst({
        where: { id: order.customerId, shopId: order.shopId },
        select: { nickname: true, avatar: true, phone: true },
      }),
    ]);
    const productIds = [...new Set(refunds.map((row) => row.productId))];
    const products = productIds.length
      ? await this.prisma.brandProduct.findMany({
          where: { id: { in: productIds } },
          select: { id: true, title: true },
        })
      : [];
    const titleMap = new Map(products.map((row) => [row.id, row.title]));
    const detail = orderDetail(
      order,
      items,
      logs,
      refunds.map((row) => ({
        ...row,
        title: titleMap.get(row.productId) || '',
      })),
      buyer || undefined,
    );
    return detail;
  }

  async remark(seller: Seller, orderId: number, sellerRemark: string) {
    const order = await this.prisma.brandOrder.findFirst({
      where: { id: orderId, shopId: seller.shopId },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    await this.prisma.brandOrder.update({
      where: { id: order.id },
      data: { sellerRemark: clip(sellerRemark, 500) },
    });
    return this.detail(
      { shopId: seller.shopId, ownerUserId: seller.ownerUserId },
      order.id,
    );
  }

  async ship(
    seller: Seller,
    orderId: number,
    expressCompany: string,
    expressNo: string,
    remark: string,
  ) {
    const order = await this.prisma.brandOrder.findFirst({
      where: { id: orderId, shopId: seller.shopId },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    if (order.status !== 'PAID') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        order.status === 'SHIPPED'
          ? '该订单已发货'
          : `当前状态（${order.status}）不能发货，需先等买家付款`,
      );
    }
    const company = clip(expressCompany, 40).trim();
    const number = clip(expressNo, 60).trim();
    if (!company || !number) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '快递公司与快递单号都必填',
      );
    }
    await this.prisma.brandOrder.update({
      where: { id: order.id },
      data: {
        status: 'SHIPPED',
        expressCompany: company,
        expressNo: number,
        shippedAt: new Date(),
        sellerRemark: remark ? clip(remark, 500) : order.sellerRemark,
      },
    });
    await this.prisma.brandOrderLog.create({
      data: {
        orderId: order.id,
        shopId: seller.shopId,
        operatorType: 'OWNER',
        operatorId: seller.ownerUserId,
        action: 'SHIP',
        content: `${company} ${number}`,
      },
    });
    return this.detail(
      { shopId: seller.shopId, ownerUserId: seller.ownerUserId },
      order.id,
    );
  }

  async finish(seller: Seller, orderId: number) {
    const order = await this.prisma.brandOrder.findFirst({
      where: { id: orderId, shopId: seller.shopId },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    if (order.status !== 'SHIPPED') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '只有待收货订单可以标记完成',
      );
    }
    const now = new Date();
    await this.prisma.brandOrder.update({
      where: { id: order.id },
      data: { status: 'COMPLETED', receivedAt: now, completedAt: now },
    });
    await this.prisma.brandOrderLog.create({
      data: {
        orderId: order.id,
        shopId: seller.shopId,
        operatorType: 'OWNER',
        operatorId: seller.ownerUserId,
        action: 'FINISH',
        content: '商家标记订单完成',
      },
    });
    await this.emitScrm(
      'ORDER_COMPLETED',
      order.id,
      seller.shopId,
      order.customerId,
      {
        orderNo: order.orderNo,
        amountYuan: Number(order.payAmount),
      },
    );
    return this.detail(
      { shopId: seller.shopId, ownerUserId: seller.ownerUserId },
      order.id,
    );
  }

  async close(seller: Seller, orderId: number, reason: string) {
    const order = await this.prisma.brandOrder.findFirst({
      where: { id: orderId, shopId: seller.shopId },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    if (order.status !== 'PENDING_PAYMENT') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '只有待付款订单可以直接关闭；已付款请在售后里退款',
      );
    }
    const done = await this.cancelInternal(
      seller.shopId,
      order.id,
      clip(reason, 200) || '商家关闭订单',
    );
    if (!done) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '订单状态已变化，请刷新后重试',
      );
    }
    return this.detail(
      { shopId: seller.shopId, ownerUserId: seller.ownerUserId },
      order.id,
    );
  }

  // ---------------------------------------------------------------- 售后

  async refundCreate(
    buyer: Buyer,
    body: BrandPublicRefundCreateBody,
  ): Promise<BrandRefund> {
    const order = await this.prisma.brandOrder.findFirst({
      where: {
        id: body.orderId,
        shopId: buyer.shopId,
        customerId: buyer.customerId,
      },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    if (!['PAID', 'SHIPPED', 'COMPLETED'].includes(order.status)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '该订单当前不能申请售后',
      );
    }
    const item = await this.prisma.brandOrderItem.findFirst({
      where: { id: body.orderItemId, orderId: order.id, shopId: buyer.shopId },
    });
    if (!item)
      throw new BusinessException(ErrorCode.NOT_FOUND, '订单商品不存在');
    if (item.refundStatus !== 'NONE') {
      throw new BusinessException(ErrorCode.CONFLICT, '该商品已在售后流程中');
    }
    const shop = await this.prisma.brandShop.findUnique({
      where: { id: buyer.shopId },
    });
    if (shop) {
      const { normalizeTrade } = await import('./brand.shop.service');
      const trade = normalizeTrade(shop.tradeJson);
      if (!trade.refundEnabled) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '该商城未开启售后，请联系商家',
        );
      }
      if (
        trade.refundDaysLimit > 0 &&
        order.completedAt &&
        Date.now() - order.completedAt.getTime() >
          trade.refundDaysLimit * 86_400_000
      ) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          `确认收货超过 ${trade.refundDaysLimit} 天，已超出售后时限`,
        );
      }
    }
    const requestCents = toCents(body.amount);
    const leftCents = toCents(item.totalPrice) - toCents(item.refundedAmount);
    if (requestCents <= 0 || requestCents > leftCents) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `退款金额需在 0 到 ${round2(leftCents)} 元之间`,
      );
    }
    const refund = await this.prisma.brandRefundOrder.create({
      data: {
        shopId: buyer.shopId,
        refundNo: brandOrderNo('RF'),
        orderId: order.id,
        orderItemId: item.id,
        customerId: buyer.customerId,
        productId: item.productId,
        type: body.type,
        reason: clip(body.reason, 100),
        description: clip(body.desc, 500),
        images: (body.images || []).slice(0, 9) as never,
        amount: round2(requestCents),
        status: 'PENDING',
      },
    });
    await this.prisma.brandOrder.update({
      where: { id: order.id },
      data: { refundStatus: 'PENDING' },
    });
    await this.prisma.brandOrderItem.update({
      where: { id: item.id },
      data: { refundStatus: 'PENDING' },
    });
    await this.prisma.brandOrderLog.create({
      data: {
        orderId: order.id,
        shopId: buyer.shopId,
        operatorType: 'CUSTOMER',
        operatorId: String(buyer.customerId),
        action: 'REFUND_APPLY',
        content: `申请退款 ${round2(requestCents)} 元：${clip(body.reason, 100)}`,
      },
    });
    return this.refundView(buyer.shopId, refund.id);
  }

  async refundList(seller: Seller, query: Record<string, unknown>) {
    const { page, pageSize, offset } = pageArgs(query);
    const where: Record<string, unknown> = { shopId: seller.shopId };
    if (query.status) where.status = query.status;
    const keyword = clip(query.keyword, 60).trim();
    if (keyword) {
      const orders = await this.prisma.brandOrder.findMany({
        where: { shopId: seller.shopId, orderNo: { contains: keyword } },
        select: { id: true },
        take: 200,
      });
      where.OR = [
        { refundNo: { contains: keyword } },
        { orderId: { in: orders.map((row) => row.id) } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.brandRefundOrder.findMany({
        where,
        orderBy: [{ id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.brandRefundOrder.count({ where }),
    ]);
    const orderIds = [...new Set(rows.map((row) => row.orderId))];
    const orders = orderIds.length
      ? await this.prisma.brandOrder.findMany({
          where: { id: { in: orderIds } },
          select: { id: true, orderNo: true, payAmount: true },
        })
      : [];
    const orderMap = new Map(orders.map((row) => [row.id, row]));
    const customerIds = [...new Set(rows.map((row) => row.customerId))];
    const buyers = customerIds.length
      ? await this.prisma.brandCustomer.findMany({
          where: { id: { in: customerIds }, shopId: seller.shopId },
          select: { id: true, nickname: true, phone: true },
        })
      : [];
    const buyerMap = new Map(buyers.map((row) => [row.id, row]));
    const itemIds = [...new Set(rows.map((row) => row.orderItemId))];
    const items = itemIds.length
      ? await this.prisma.brandOrderItem.findMany({
          where: { id: { in: itemIds } },
          select: {
            id: true,
            title: true,
            skuName: true,
            image: true,
            quantity: true,
          },
        })
      : [];
    const itemMap = new Map(items.map((row) => [row.id, row]));
    const list = rows.map((row) => {
      const order = orderMap.get(row.orderId);
      const item = itemMap.get(row.orderItemId);
      const buyer = buyerMap.get(row.customerId);
      return refundRow(row, {
        orderNo: order?.orderNo || '',
        orderPayAmount: Number(order?.payAmount || 0),
        title: item?.title || '',
        skuName: item?.skuName || '',
        image: item?.image || '',
        quantity: item?.quantity || 0,
        nickname: buyer?.nickname,
        customerPhone: buyer?.phone,
      });
    });
    const statusRows = await this.prisma.brandRefundOrder.groupBy({
      by: ['status'],
      where: { shopId: seller.shopId },
      _count: { _all: true },
    });
    const statusCounts: Record<string, number> = {};
    for (const row of statusRows) statusCounts[row.status] = row._count._all;
    return { ...pageOf(list, total, page, pageSize), statusCounts };
  }

  async refundDetail(seller: Seller, id: number): Promise<BrandRefund> {
    const row = await this.prisma.brandRefundOrder.findFirst({
      where: { id: Number(id), shopId: seller.shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '售后单不存在');
    return this.refundView(seller.shopId, row.id);
  }

  private async refundView(shopId: number, id: number): Promise<BrandRefund> {
    const row = await this.prisma.brandRefundOrder.findFirst({
      where: { id, shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '售后单不存在');
    const [order, item, buyer] = await Promise.all([
      this.prisma.brandOrder.findUnique({
        where: { id: row.orderId },
        select: { orderNo: true, payAmount: true },
      }),
      row.orderItemId
        ? this.prisma.brandOrderItem.findUnique({
            where: { id: row.orderItemId },
            select: { title: true, skuName: true, image: true, quantity: true },
          })
        : Promise.resolve(null),
      this.prisma.brandCustomer.findUnique({
        where: { id: row.customerId },
        select: { nickname: true, phone: true },
      }),
    ]);
    return refundRow(row, {
      orderNo: order?.orderNo || '',
      orderPayAmount: Number(order?.payAmount || 0),
      title: item?.title || '',
      skuName: item?.skuName || '',
      image: item?.image || '',
      quantity: item?.quantity || 0,
      nickname: buyer?.nickname,
      customerPhone: buyer?.phone,
    });
  }

  /** 同意退款：先落 AGREED，再调商户号退款；资金原路退回买家的微信。 */
  async refundAgree(
    seller: Seller,
    id: number,
    adminRemark: string,
  ): Promise<BrandRefund> {
    const row = await this.prisma.brandRefundOrder.findFirst({
      where: { id: Number(id), shopId: seller.shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '售后单不存在');
    if (row.status !== 'PENDING') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该售后单已处理，请勿重复操作',
      );
    }
    const changed = await this.prisma.brandRefundOrder.updateMany({
      where: { id: row.id, shopId: seller.shopId, status: 'PENDING' },
      data: { status: 'AGREED', adminRemark: clip(adminRemark, 200) },
    });
    if (changed.count === 0) {
      throw new BusinessException(ErrorCode.CONFLICT, '该售后单已被处理');
    }
    const order = await this.prisma.brandOrder.findUnique({
      where: { id: row.orderId },
    });
    let refundId = '';
    if (order && order.payType === 'WECHAT' && order.transactionId) {
      refundId = await this.pay.refund({
        shopId: seller.shopId,
        ownerUserId: seller.ownerUserId,
        orderNo: order.orderNo,
        refundNo: row.refundNo,
        totalCents: toCents(order.payAmount),
        refundCents: toCents(row.amount),
        reason: clip(row.reason, 80),
      });
    }
    const now = new Date();
    await this.prisma.brandRefundOrder.update({
      where: { id: row.id },
      data: {
        status: 'REFUNDED',
        refundedAt: now,
        refundTransactionId: clip(refundId, 64),
      },
    });
    await this.prisma.brandOrderItem.updateMany({
      where: { id: row.orderItemId, shopId: seller.shopId },
      data: {
        refundStatus: 'DONE',
        refundedAmount: { increment: Number(row.amount) },
      },
    });
    const stillPending = await this.prisma.brandRefundOrder.count({
      where: {
        shopId: seller.shopId,
        orderId: row.orderId,
        status: { in: ['PENDING', 'AGREED'] },
      },
    });
    if (order) {
      const alreadyRefunded = await this.prisma.brandRefundOrder.aggregate({
        where: { shopId: seller.shopId, orderId: order.id, status: 'REFUNDED' },
        _sum: { amount: true },
      });
      const allRefunded =
        toCents(alreadyRefunded._sum.amount) >= toCents(order.payAmount);
      await this.prisma.brandOrder.update({
        where: { id: order.id },
        data: {
          refundStatus: stillPending > 0 ? 'PENDING' : 'DONE',
          payStatus: allRefunded ? 'REFUNDED' : order.payStatus,
        },
      });
    }
    await this.prisma.brandOrderLog.create({
      data: {
        orderId: row.orderId,
        shopId: seller.shopId,
        operatorType: 'OWNER',
        operatorId: seller.ownerUserId,
        action: 'REFUND_AGREE',
        content: `同意退款 ${amount(row.amount)} 元${refundId ? `，微信退款单号 ${refundId}` : '（线下退款）'}`,
      },
    });
    // 资金已退回，副作用单独走幂等台账；任一步失败不回溯退款，由调度重试补做
    await this.applyRefundEffects(seller.shopId, row.id);
    await this.emitScrm(
      'ORDER_REFUNDED',
      row.id,
      seller.shopId,
      row.customerId,
      {
        orderNo: order?.orderNo || '',
        amountYuan: Number(row.amount),
      },
    );
    return this.refundView(seller.shopId, row.id);
  }

  /**
   * 退款副作用幂等执行：退货回库、整单退券、退回抵扣积分、扣回赠分。
   * 每一步先落一行台账再执行，唯一键 [refundId, effect] 保证重跑不会二次扣补；
   * 失败只标记 FAILED，不影响已完成的退款。
   */
  async applyRefundEffects(shopId: number, refundId: number): Promise<void> {
    const refund = await this.prisma.brandRefundOrder.findFirst({
      where: { id: refundId, shopId },
    });
    if (!refund || refund.status !== 'REFUNDED') return;
    const order = await this.prisma.brandOrder.findUnique({
      where: { id: refund.orderId },
    });
    if (!order) return;
    const required = await this.requiredEffectKeys(shopId, refund, order);
    for (const effect of required) {
      await this.runRefundEffect(shopId, refund, order, effect);
    }
  }

  private async requiredEffectKeys(
    shopId: number,
    refund: { id: number; orderId: number; type: string },
    order: {
      id: number;
      payAmount: unknown;
      couponTicketId: number;
      pointsDeduct: number;
      pointsReturn: number;
    },
  ): Promise<string[]> {
    const refunded = await this.prisma.brandRefundOrder.aggregate({
      where: { shopId, orderId: order.id, status: 'REFUNDED' },
      _sum: { amount: true },
    });
    const fullyRefunded =
      toCents(refunded._sum.amount) >= toCents(order.payAmount);
    const required: string[] = [];
    if (refund.type === 'RETURN_REFUND') required.push('RESTORE_STOCK');
    if (fullyRefunded && order.couponTicketId > 0)
      required.push('RELEASE_COUPON');
    if (fullyRefunded && order.pointsDeduct > 0) required.push('RETURN_POINTS');
    if (fullyRefunded && order.pointsReturn > 0) required.push('REVOKE_POINTS');
    return required;
  }

  /** 调度补偿：扫最近已退款单，只补没完成的副作用。 */
  async reconcileRefundEffects(limit = 50): Promise<number> {
    const refunds = await this.prisma.brandRefundOrder.findMany({
      where: { status: 'REFUNDED' },
      orderBy: { id: 'desc' },
      take: Math.min(200, Math.max(1, limit)),
      select: { id: true, shopId: true, orderId: true, type: true },
    });
    let fixed = 0;
    for (const refund of refunds) {
      const order = await this.prisma.brandOrder.findUnique({
        where: { id: refund.orderId },
        select: {
          id: true,
          payAmount: true,
          couponTicketId: true,
          pointsDeduct: true,
          pointsReturn: true,
        },
      });
      if (!order) continue;
      const required = await this.requiredEffectKeys(
        refund.shopId,
        refund,
        order,
      );
      if (required.length === 0) continue;
      const done = await this.prisma.brandRefundEffect.count({
        where: {
          shopId: refund.shopId,
          refundId: refund.id,
          status: 'DONE',
          effect: { in: required },
        },
      });
      if (done >= required.length) continue;
      await this.applyRefundEffects(refund.shopId, refund.id);
      fixed += 1;
    }
    return fixed;
  }

  private async runRefundEffect(
    shopId: number,
    refund: { id: number; orderId: number; orderItemId: number; type: string },
    order: {
      id: number;
      customerId: number;
      couponTicketId: number;
      pointsDeduct: number;
      pointsReturn: number;
    },
    effect: string,
  ): Promise<void> {
    const key = { refundId_effect: { refundId: refund.id, effect } };
    const existing = await this.prisma.brandRefundEffect.findUnique({
      where: key,
    });
    if (existing?.status === 'DONE') return;
    const detail = (existing?.detail ?? {}) as Record<string, unknown>;
    const attempts = Math.max(0, Number(detail.attempts || 0));
    if (existing && attempts >= 5) return;
    if (existing) {
      await this.prisma.brandRefundEffect.update({
        where: { id: existing.id },
        data: {
          status: 'PENDING',
          error: '',
          detail: { attempts: attempts + 1 },
        },
      });
    } else {
      try {
        await this.prisma.brandRefundEffect.create({
          data: {
            shopId,
            refundId: refund.id,
            effect,
            status: 'PENDING',
            detail: { attempts: 1 },
          },
        });
      } catch (error) {
        // 并发重入时另一路已建行，让那一份执行即可
        if ((error as { code?: string }).code === 'P2002') return;
        throw error;
      }
    }
    try {
      const result = await this.execRefundEffect(shopId, refund, order, effect);
      await this.prisma.brandRefundEffect.update({
        where: key,
        data: {
          status: 'DONE',
          error: '',
          detail: { ...result, attempts: attempts + 1 },
          finishedAt: new Date(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.brandRefundEffect.update({
        where: key,
        data: {
          status: 'FAILED',
          error: clip(message, 200),
          detail: { attempts: attempts + 1 },
        },
      });
    }
  }

  private async execRefundEffect(
    shopId: number,
    refund: { id: number; orderId: number; orderItemId: number; type: string },
    order: {
      id: number;
      customerId: number;
      couponTicketId: number;
      pointsDeduct: number;
      pointsReturn: number;
    },
    effect: string,
  ): Promise<Record<string, unknown>> {
    if (effect === 'RESTORE_STOCK') {
      const item = await this.prisma.brandOrderItem.findFirst({
        where: { id: refund.orderItemId, orderId: order.id, shopId },
      });
      if (!item) return { skipped: '订单明细不存在' };
      await this.restoreStock(shopId, {
        productId: item.productId,
        skuId: item.skuId,
        quantity: item.quantity,
        title: item.title,
        skuName: '',
        image: '',
        priceCents: toCents(item.price),
        stock: 0,
        categoryId: 0,
        productType: 'NORMAL',
        freightTemplateId: 0,
        valid: true,
        invalidReason: '',
      });
      return {
        quantity: item.quantity,
        productId: item.productId,
        skuId: item.skuId,
      };
    }
    if (effect === 'RELEASE_COUPON') {
      if (!order.couponTicketId) return { skipped: '本单未使用优惠券' };
      await this.coupons.release(shopId, order.couponTicketId);
      await this.prisma.brandOrder.update({
        where: { id: order.id },
        data: { couponTicketId: 0 },
      });
      return { ticketId: order.couponTicketId };
    }
    if (effect === 'RETURN_POINTS') {
      const points = Math.max(0, Math.round(order.pointsDeduct || 0));
      if (points === 0) return { skipped: '本单未抵扣积分' };
      const ok = await this.customers.addPoints(
        shopId,
        order.customerId,
        points,
        'POINT_EARN',
        { type: 'REFUND', id: refund.id },
        `售后退款退回抵扣积分 ${points}`,
      );
      if (!ok) throw new Error('退回抵扣积分失败：顾客不存在或余额异常');
      return { points };
    }
    if (effect === 'REVOKE_POINTS') {
      const earned = Math.max(0, Math.round(order.pointsReturn || 0));
      if (earned === 0) return { skipped: '本单未返积分' };
      const customer = await this.prisma.brandCustomer.findFirst({
        where: { id: order.customerId, shopId },
        select: { points: true },
      });
      // 赠分可能已被花掉：按现有余额扣回，不把余额打成负数
      const deduct = Math.min(
        earned,
        Math.max(0, Number(customer?.points || 0)),
      );
      if (deduct > 0) {
        const ok = await this.customers.addPoints(
          shopId,
          order.customerId,
          -deduct,
          'POINT_USE',
          { type: 'REFUND', id: refund.id },
          `售后退款扣回赠分 ${deduct}`,
        );
        if (!ok) throw new Error('扣回赠分失败：顾客余额已变化');
      }
      return { points: deduct, skippedPoints: earned - deduct };
    }
    return { skipped: `未知副作用 ${effect}` };
  }

  async refundReject(
    seller: Seller,
    id: number,
    rejectReason: string,
  ): Promise<BrandRefund> {
    const row = await this.prisma.brandRefundOrder.findFirst({
      where: { id: Number(id), shopId: seller.shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '售后单不存在');
    if (row.status !== 'PENDING') {
      throw new BusinessException(ErrorCode.CONFLICT, '该售后单已处理');
    }
    const reason = clip(rejectReason, 200).trim();
    if (!reason) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '拒绝售后必须写明理由，买家会看到',
      );
    }
    await this.prisma.brandRefundOrder.update({
      where: { id: row.id },
      data: { status: 'REJECTED', rejectReason: reason },
    });
    await this.prisma.brandOrderItem.updateMany({
      where: { id: row.orderItemId, shopId: seller.shopId },
      data: { refundStatus: 'REJECTED' },
    });
    const stillPending = await this.prisma.brandRefundOrder.count({
      where: { shopId: seller.shopId, orderId: row.orderId, status: 'PENDING' },
    });
    await this.prisma.brandOrder.update({
      where: { id: row.orderId },
      data: { refundStatus: stillPending > 0 ? 'PENDING' : 'REJECTED' },
    });
    await this.prisma.brandOrderLog.create({
      data: {
        orderId: row.orderId,
        shopId: seller.shopId,
        operatorType: 'OWNER',
        operatorId: seller.ownerUserId,
        action: 'REFUND_REJECT',
        content: `驳回售后：${reason}`,
      },
    });
    return this.refundView(seller.shopId, row.id);
  }

  /** 重新拉起支付：待付款且走微信的单才给参数。 */
  async repayParams(input: {
    shopId: number;
    customerId: number;
    ownerUserId: string;
    orderId: number;
    openid: string;
  }) {
    const order = await this.prisma.brandOrder.findFirst({
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
      ownerUserId: input.ownerUserId,
      orderNo: order.orderNo,
      amountCents: toCents(order.payAmount),
      description: order.couponName || '商品订单',
      openid: input.openid,
    });
    return {
      orderId: order.id,
      orderNo: order.orderNo,
      payAmount: Number(order.payAmount),
      expireAt: order.expireAt ? order.expireAt.toISOString() : '',
      payParams,
    };
  }

  /** 我的售后单（C 端）。 */
  async myRefunds(shopId: number, customerId: number) {
    const rows = await this.prisma.brandRefundOrder.findMany({
      where: { shopId, customerId },
      orderBy: [{ id: 'desc' }],
      take: 50,
    });
    const items = rows.length
      ? await this.prisma.brandOrderItem.findMany({
          where: { id: { in: rows.map((row) => row.orderItemId) }, shopId },
          select: {
            id: true,
            title: true,
            skuName: true,
            image: true,
            quantity: true,
          },
        })
      : [];
    const itemMap = new Map(items.map((row) => [row.id, row]));
    return rows.map((row) => {
      const item = itemMap.get(row.orderItemId);
      return {
        id: row.id,
        refundNo: row.refundNo,
        orderId: row.orderId,
        type: row.type,
        status: row.status,
        amount: Number(row.amount),
        reason: row.reason,
        rejectReason: row.rejectReason,
        adminRemark: row.adminRemark,
        title: item?.title || '',
        skuName: item?.skuName || '',
        image: item?.image || '',
        quantity: item?.quantity || 0,
        createdAt: row.createdAt.toISOString(),
        refundedAt: row.refundedAt ? row.refundedAt.toISOString() : '',
      };
    });
  }

  /** C 端申请入口需要的可退余额。 */
  async refundableCents(shopId: number, orderItemId: number): Promise<number> {
    const item = await this.prisma.brandOrderItem.findFirst({
      where: { id: orderItemId, shopId },
      select: { totalPrice: true, refundedAmount: true },
    });
    if (!item) return 0;
    return Math.max(0, toCents(item.totalPrice) - toCents(item.refundedAmount));
  }

  /** 交易事件只写 outbox 一行：不查 SCRM、不调桥、失败也不影响主流程。 */
  private async emitScrm(
    kind: 'ORDER_PAID' | 'ORDER_COMPLETED' | 'ORDER_REFUNDED',
    recordKey: number,
    shopId: number,
    customerId: number,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.scrm.enqueue({ shopId, customerId, kind, recordKey, payload });
  }
}
