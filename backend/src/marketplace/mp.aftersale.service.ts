import type {
  MpAfterSale,
  MpAfterSaleApplyItem,
  MpAfterSaleAuditBody,
  MpAfterSaleCreateBody,
  MpAfterSaleItem,
  MpAfterSaleReturnBody,
  MpPayRecord,
  MpRefund,
  MpRefundDetail,
  MpRefundEffectView,
  PageResponse,
} from '@enterprise/contracts';
import { pageParam } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import { parseCustomerToken } from '../private-mini/customer-token';
import { commerceOrderNo } from '../commerce-core/ident';
import { checkAftersaleAdmission } from '../commerce-core/aftersale';
import type {
  Prisma,
  MpAfterSale as MpAfterSaleRow,
  MpAfterSaleItem as MpAfterSaleItemRow,
  MpCustomer as MpCustomerRow,
  MpMarket as MpMarketRow,
  MpOrderItem as MpOrderItemRow,
  MpPayRecord as MpPayRecordRow,
  MpRefund as MpRefundRow,
  MpRefundEffect as MpRefundEffectRow,
  MpShopOrder as MpShopOrderRow,
} from '../../generated/prisma';
import type { MpMerchantTokenPayload } from './mp.token';
import type { MpMerchantService } from './mp.merchant.service';
import type { MpPayService } from './mp.pay.service';
import { noopMpScrmSink, type MpScrmSink } from './mp.scrm.service';
import { scrmCustomerLabel } from '../commerce-core/scrm-port';
import { decimalOf, iso, jsonObject, numberIn } from './mp.shared';
import { toolOpen } from '../tool-launch/tool-launch.holder';

type BuyerContext = { market: MpMarketRow; customer: MpCustomerRow };

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

const REFUND_EFFECTS = ['RESTORE_STOCK', 'REVOKE_COMMISSION'] as const;

/**
 * 多店铺商城·售后与退款（B2）。
 *
 * 状态机：PENDING（买家申请）→ AGREED（商户同意，退货单待买家寄回）
 * → REFUNDED（退款成功）；REJECTED / CANCELLED 为终态，买家可重新申请。
 *
 * 退款副作用走 `mp_refund_effects` 的唯一键 [refundId, effect] 幂等：
 * 微信退款失败重试时，已完成的那几步直接跳过，绝不二次回补库存。
 * 资金口径：退款只退商品金额，运费不参与按行分摊。
 */
export class MpAftersaleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly merchants: MpMerchantService,
    private readonly pay: MpPayService,
    private readonly scrm: MpScrmSink = noopMpScrmSink,
  ) {}

  // ------------------------------------------------------------ 买家

  async apply(
    token: string,
    body: MpAfterSaleCreateBody,
  ): Promise<MpAfterSale> {
    const { market, customer } = await this.buyer(token, true);
    const order = await this.prisma.mpShopOrder.findFirst({
      where: {
        id: body.shopOrderId,
        marketId: market.id,
        customerId: customer.id,
      },
    });
    if (!order) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    }
    const items = await this.prisma.mpOrderItem.findMany({
      where: { shopOrderId: order.id },
    });
    const requestedIds = new Set(body.items.map((item) => item.orderItemId));
    const requestedItems = items.filter((item) => requestedIds.has(item.id));
    const products = await this.prisma.mpProduct.findMany({
      where: { id: { in: requestedItems.map((item) => item.productId) } },
      select: { id: true, type: true },
    });
    const virtualIds = new Set(
      products.filter((row) => row.type === 'VIRTUAL').map((row) => row.id),
    );
    const admission = checkAftersaleAdmission({
      orderStatus: order.status,
      type: body.type,
      refundEnabled: jsonObject(market.tradeJson).refundEnabled !== false,
      daysLimit: numberIn(jsonObject(market.tradeJson).refundDays, 7, 0, 365),
      completedAt: order.completedAt,
      requiresShipping: requestedItems.some(
        (item) => !virtualIds.has(item.productId),
      ),
    });
    if (!admission.ok) {
      throw new BusinessException(ErrorCode.CONFLICT, admission.reason);
    }
    const lines = await this.applyLines(order, items, body.items);
    const amount = money(lines.reduce((sum, line) => sum + line.amount, 0));
    if (amount <= 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '退款金额必须大于 0');
    }
    if (amount > (decimalOf(order.payAmount) ?? 0)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '退款金额不能超过实付金额',
      );
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.mpAfterSale.create({
        data: {
          marketId: market.id,
          merchantId: order.merchantId,
          shopId: order.shopId,
          orderId: order.orderId,
          shopOrderId: order.id,
          customerId: customer.id,
          afterSaleNo: commerceOrderNo('AF'),
          type: body.type,
          reason: body.reason,
          description: body.description,
          images: body.images,
          amount,
          status: 'PENDING',
        },
      });
      for (const line of lines) {
        await tx.mpAfterSaleItem.create({
          data: { afterSaleId: row.id, marketId: market.id, ...line },
        });
        await tx.mpOrderItem.update({
          where: { id: line.orderItemId },
          data: { refundStatus: 'PENDING' },
        });
      }
      await tx.mpShopOrder.update({
        where: { id: order.id },
        data: { refundStatus: 'PENDING' },
      });
      await tx.mpOrderLog.create({
        data: {
          orderId: order.orderId,
          shopOrderId: order.id,
          marketId: market.id,
          shopId: order.shopId,
          operatorType: 'CUSTOMER',
          operatorId: String(customer.id),
          action: 'AFTER_SALE_APPLIED',
          content: `买家申请售后，金额 ${amount.toFixed(2)} 元`,
        },
      });
      return row;
    });
    return this.viewOf(created);
  }

  async list(
    token: string,
    query: { status?: string; page?: unknown; pageSize?: unknown },
  ): Promise<PageResponse<MpAfterSale>> {
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
      this.prisma.mpAfterSale.count({ where }),
      this.prisma.mpAfterSale.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    return { list: await this.viewsOf(rows), total, page, pageSize };
  }

  async detail(token: string, id: number): Promise<MpAfterSale> {
    const { market, customer } = await this.buyer(token);
    const row = await this.prisma.mpAfterSale.findFirst({
      where: { id, marketId: market.id, customerId: customer.id },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '售后单不存在');
    }
    return this.viewOf(row);
  }

  async cancel(token: string, id: number): Promise<MpAfterSale> {
    const { market, customer } = await this.buyer(token, true);
    const row = await this.prisma.mpAfterSale.findFirst({
      where: { id, marketId: market.id, customerId: customer.id },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '售后单不存在');
    }
    if (row.status !== 'PENDING') {
      throw new BusinessException(ErrorCode.CONFLICT, '商户已处理，不能撤销');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.mpAfterSale.update({
        where: { id: row.id },
        data: { status: 'CANCELLED' },
      });
      await this.releaseItems(tx, row);
      await tx.mpOrderLog.create({
        data: {
          orderId: row.orderId,
          shopOrderId: row.shopOrderId,
          marketId: row.marketId,
          shopId: row.shopId,
          operatorType: 'CUSTOMER',
          operatorId: String(customer.id),
          action: 'AFTER_SALE_CANCELLED',
          content: '买家撤销售后申请',
        },
      });
      return changed;
    });
    return this.viewOf(updated);
  }

  /** 退货单买家回填寄回物流（仅 AGREED 且 RETURN_REFUND）。 */
  async returnBack(
    token: string,
    body: MpAfterSaleReturnBody,
  ): Promise<MpAfterSale> {
    const { market, customer } = await this.buyer(token, true);
    const row = await this.prisma.mpAfterSale.findFirst({
      where: { id: body.id, marketId: market.id, customerId: customer.id },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '售后单不存在');
    }
    if (row.type !== 'RETURN_REFUND' || row.status !== 'AGREED') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '当前售后单不需要填写退货物流',
      );
    }
    const updated = await this.prisma.mpAfterSale.update({
      where: { id: row.id },
      data: {
        returnExpress: body.returnExpress,
        returnExpressNo: body.returnExpressNo,
      },
    });
    await this.prisma.mpOrderLog.create({
      data: {
        orderId: row.orderId,
        shopOrderId: row.shopOrderId,
        marketId: row.marketId,
        shopId: row.shopId,
        operatorType: 'CUSTOMER',
        operatorId: String(customer.id),
        action: 'AFTER_SALE_RETURNED',
        content: `买家寄回：${body.returnExpress} ${body.returnExpressNo}`,
      },
    });
    return this.viewOf(updated);
  }

  // ------------------------------------------------------------ 商户

  async merchantList(
    payload: MpMerchantTokenPayload,
    query: {
      status?: string;
      keyword?: string;
      page?: unknown;
      pageSize?: unknown;
    },
  ): Promise<PageResponse<MpAfterSale>> {
    const { market, merchant } = await this.merchants.session(payload);
    return this.managePage(market.id, { ...query, merchantId: merchant.id });
  }

  async merchantDetail(
    payload: MpMerchantTokenPayload,
    id: number,
  ): Promise<MpAfterSale> {
    const { market, merchant } = await this.merchants.session(payload);
    const row = await this.prisma.mpAfterSale.findFirst({
      where: { id, marketId: market.id, merchantId: merchant.id },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '售后单不存在');
    }
    return this.viewOf(row);
  }

  async merchantAudit(
    payload: MpMerchantTokenPayload,
    body: MpAfterSaleAuditBody,
  ): Promise<MpAfterSale> {
    const { market, merchant, user } = await this.merchants.session(
      payload,
      true,
    );
    const row = await this.prisma.mpAfterSale.findFirst({
      where: { id: body.id, marketId: market.id, merchantId: merchant.id },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '售后单不存在');
    }
    if (row.status !== 'PENDING') {
      throw new BusinessException(ErrorCode.CONFLICT, '售后单已处理');
    }
    if (body.action === 'REJECT') {
      if (!body.rejectReason.trim()) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写驳回原因');
      }
      const rejected = await this.prisma.$transaction(async (tx) => {
        const changed = await tx.mpAfterSale.update({
          where: { id: row.id },
          data: {
            status: 'REJECTED',
            rejectReason: body.rejectReason,
            merchantRemark: body.merchantRemark,
            auditedAt: new Date(),
          },
        });
        await this.rejectItems(tx, row);
        await tx.mpOrderLog.create({
          data: {
            orderId: row.orderId,
            shopOrderId: row.shopOrderId,
            marketId: row.marketId,
            shopId: row.shopId,
            operatorType: 'MERCHANT',
            operatorId: String(user.id),
            action: 'AFTER_SALE_REJECTED',
            content: `商户驳回售后：${body.rejectReason}`,
          },
        });
        return changed;
      });
      return this.viewOf(rejected);
    }
    const agreed = await this.prisma.mpAfterSale.update({
      where: { id: row.id },
      data: {
        status: 'AGREED',
        merchantRemark: body.merchantRemark,
        auditedAt: new Date(),
      },
    });
    await this.log(
      row,
      'MERCHANT',
      String(user.id),
      'AFTER_SALE_AGREED',
      '商户同意售后',
    );
    if (row.type === 'REFUND_ONLY') {
      return this.executeRefund(agreed, 'MERCHANT', String(user.id));
    }
    return this.viewOf(agreed);
  }

  /** 退货退款：商户确认收到退货后执行退款。 */
  async merchantReceive(
    payload: MpMerchantTokenPayload,
    body: { id: number; merchantRemark: string },
  ): Promise<MpAfterSale> {
    const { market, merchant, user } = await this.merchants.session(
      payload,
      true,
    );
    const row = await this.prisma.mpAfterSale.findFirst({
      where: { id: body.id, marketId: market.id, merchantId: merchant.id },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '售后单不存在');
    }
    if (row.type !== 'RETURN_REFUND' || row.status !== 'AGREED') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '当前售后单不在待收货状态',
      );
    }
    if (!row.returnExpressNo) {
      throw new BusinessException(ErrorCode.CONFLICT, '买家还未填写退货物流');
    }
    const updated = await this.prisma.mpAfterSale.update({
      where: { id: row.id },
      data: {
        merchantRemark: body.merchantRemark || row.merchantRemark,
      },
    });
    return this.executeRefund(updated, 'MERCHANT', String(user.id));
  }

  // ------------------------------------------------------------ 平台仲裁

  async marketList(
    ownerUserId: string,
    query: {
      status?: string;
      keyword?: string;
      page?: unknown;
      pageSize?: unknown;
    },
  ): Promise<PageResponse<MpAfterSale>> {
    const market = await this.requireMarket(ownerUserId);
    return this.managePage(market.id, query);
  }

  async marketDetail(ownerUserId: string, id: number): Promise<MpAfterSale> {
    const market = await this.requireMarket(ownerUserId);
    const row = await this.prisma.mpAfterSale.findFirst({
      where: { id, marketId: market.id },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '售后单不存在');
    }
    return this.viewOf(row);
  }

  async arbitrate(
    ownerUserId: string,
    username: string,
    body: { id: number; action: 'REFUND' | 'REJECT'; platformNote: string },
  ): Promise<MpAfterSale> {
    const market = await this.requireMarket(ownerUserId);
    const row = await this.prisma.mpAfterSale.findFirst({
      where: { id: body.id, marketId: market.id },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '售后单不存在');
    }
    if (row.status !== 'PENDING' && row.status !== 'REJECTED') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        row.status === 'REFUNDED' ? '该售后单已退款' : '该售后单当前不能仲裁',
      );
    }
    if (body.action === 'REJECT') {
      const rejected = await this.prisma.$transaction(async (tx) => {
        const changed = await tx.mpAfterSale.update({
          where: { id: row.id },
          data: {
            status: 'REJECTED',
            platformNote: body.platformNote,
            auditedAt: new Date(),
          },
        });
        await this.rejectItems(tx, row);
        return changed;
      });
      await this.log(
        row,
        'PLATFORM',
        username,
        'AFTER_SALE_ARBITRATED',
        `平台维持驳回：${body.platformNote}`,
      );
      return this.viewOf(rejected);
    }
    const forced = await this.prisma.mpAfterSale.update({
      where: { id: row.id },
      data: {
        status: 'AGREED',
        platformNote: body.platformNote,
        auditedAt: new Date(),
      },
    });
    await this.log(
      row,
      'PLATFORM',
      username,
      'AFTER_SALE_ARBITRATED',
      `平台裁定退款：${body.platformNote}`,
    );
    return this.executeRefund(forced, 'PLATFORM', username);
  }

  // ------------------------------------------------------------ 退款与支付流水

  async marketRefunds(
    ownerUserId: string,
    query: {
      status?: string;
      keyword?: string;
      page?: unknown;
      pageSize?: unknown;
    },
  ): Promise<PageResponse<MpRefund>> {
    const market = await this.requireMarket(ownerUserId);
    return this.refundPage(market.id, query);
  }

  async marketRefundDetail(
    ownerUserId: string,
    id: number,
  ): Promise<MpRefundDetail> {
    const market = await this.requireMarket(ownerUserId);
    const row = await this.prisma.mpRefund.findFirst({
      where: { id, marketId: market.id },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '退款单不存在');
    }
    return this.refundDetailOf(row);
  }

  async merchantRefunds(
    payload: MpMerchantTokenPayload,
    query: {
      status?: string;
      keyword?: string;
      page?: unknown;
      pageSize?: unknown;
    },
  ): Promise<PageResponse<MpRefund>> {
    const { market, merchant } = await this.merchants.session(payload);
    return this.refundPage(market.id, { ...query, merchantId: merchant.id });
  }

  async merchantRefundDetail(
    payload: MpMerchantTokenPayload,
    id: number,
  ): Promise<MpRefundDetail> {
    const { market, merchant } = await this.merchants.session(payload);
    const row = await this.prisma.mpRefund.findFirst({
      where: { id, marketId: market.id, merchantId: merchant.id },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '退款单不存在');
    }
    return this.refundDetailOf(row);
  }

  /** 渠道退款失败后重试：只重跑失败/未完成的链路，副作用按唯一键跳过。 */
  async retryRefund(
    payload: MpMerchantTokenPayload,
    id: number,
  ): Promise<MpRefund> {
    const { market, merchant, user } = await this.merchants.session(
      payload,
      true,
    );
    const row = await this.prisma.mpRefund.findFirst({
      where: { id, marketId: market.id, merchantId: merchant.id },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '退款单不存在');
    }
    if (row.status === 'SUCCESS') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该退款单已成功，无需重试',
      );
    }
    if (row.afterSaleId > 0) {
      const afterSale = await this.prisma.mpAfterSale.findFirst({
        where: { id: row.afterSaleId, marketId: market.id },
      });
      if (afterSale && afterSale.status !== 'REFUNDED') {
        const view = await this.executeRefund(
          afterSale,
          'MERCHANT',
          String(user.id),
        );
        const refundId = view.refundId;
        const refreshed = refundId
          ? await this.prisma.mpRefund.findUnique({ where: { id: refundId } })
          : null;
        if (refreshed) {
          const [shop, shopOrder] = await Promise.all([
            this.prisma.mpShop.findUnique({
              where: { id: refreshed.shopId },
              select: { name: true },
            }),
            this.prisma.mpShopOrder.findUnique({
              where: { id: refreshed.shopOrderId },
              select: { subOrderNo: true },
            }),
          ]);
          return this.refundView(
            refreshed,
            shop?.name ?? '',
            shopOrder?.subOrderNo ?? '',
          );
        }
      }
    }
    const [shop, shopOrder] = await Promise.all([
      this.prisma.mpShop.findUnique({
        where: { id: row.shopId },
        select: { name: true },
      }),
      this.prisma.mpShopOrder.findUnique({
        where: { id: row.shopOrderId },
        select: { subOrderNo: true },
      }),
    ]);
    return this.refundView(row, shop?.name ?? '', shopOrder?.subOrderNo ?? '');
  }

  async payRecords(
    ownerUserId: string,
    query: {
      merchantId?: number;
      shopId?: number;
      status?: string;
      keyword?: string;
      page?: unknown;
      pageSize?: unknown;
    },
  ): Promise<PageResponse<MpPayRecord>> {
    const market = await this.requireMarket(ownerUserId);
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
    );
    const status = String(query.status || '').trim();
    const keyword = String(query.keyword || '').trim();
    const where = {
      marketId: market.id,
      ...(query.merchantId ? { merchantId: Number(query.merchantId) } : {}),
      ...(status ? { status } : {}),
      ...(keyword
        ? {
            OR: [
              { subOrderNo: { contains: keyword } },
              { orderNo: { contains: keyword } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.mpPayRecord.count({ where }),
      this.prisma.mpPayRecord.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    return {
      list: rows.map((row) => this.payRecordView(row)),
      total,
      page,
      pageSize,
    };
  }

  // ------------------------------------------------------------ 退款执行

  private async executeRefund(
    row: MpAfterSaleRow,
    operatorType: 'MERCHANT' | 'PLATFORM',
    operatorId: string,
  ): Promise<MpAfterSale> {
    const market = await this.prisma.mpMarket.findUnique({
      where: { id: row.marketId },
    });
    if (!market) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '市场不存在');
    }
    const parent = await this.prisma.mpOrder.findUnique({
      where: { id: row.orderId },
    });
    if (!parent) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '父单不存在');
    }
    const payRecord = await this.prisma.mpPayRecord.findUnique({
      where: { shopOrderId: row.shopOrderId },
    });
    const online = Boolean(payRecord?.transactionId);
    const existing = row.refundId
      ? await this.prisma.mpRefund.findUnique({ where: { id: row.refundId } })
      : null;
    const refund =
      existing ??
      (await this.prisma.mpRefund.create({
        data: {
          marketId: row.marketId,
          merchantId: row.merchantId,
          shopId: row.shopId,
          refundNo: commerceOrderNo('RF'),
          afterSaleId: row.id,
          orderId: row.orderId,
          shopOrderId: row.shopOrderId,
          customerId: row.customerId,
          channel: online ? 'WECHAT' : 'OFFLINE',
          amount: row.amount,
          status: 'PENDING',
          reason: row.reason,
          transactionId: '',
          operatorType,
          operatorId,
        },
      }));
    if (!row.refundId) {
      await this.prisma.mpAfterSale.update({
        where: { id: row.id },
        data: { refundId: refund.id },
      });
    }
    if (refund.status === 'SUCCESS') {
      return this.viewOf(row);
    }
    try {
      let channelRefundId = '';
      if (refund.channel === 'WECHAT') {
        channelRefundId = await this.pay.refund({
          market,
          orderNo: parent.orderNo,
          refundNo: refund.refundNo,
          totalCents: Math.round(Number(parent.payAmount) * 100),
          refundCents: Math.round(Number(refund.amount) * 100),
          reason: row.reason || '买家申请退款',
        });
        if (!channelRefundId) {
          throw new BusinessException(
            ErrorCode.SERVICE_UNAVAILABLE,
            '微信退款未返回受理单号，请稍后重试',
          );
        }
      }
      await this.finalizeRefund(
        refund,
        operatorType,
        operatorId,
        channelRefundId,
      );
    } catch (error) {
      const message =
        error instanceof BusinessException
          ? error.message
          : '退款执行失败，请稍后重试';
      await this.prisma.mpRefund.update({
        where: { id: refund.id },
        data: { status: 'FAILED', error: message.slice(0, 200) },
      });
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        `${message}。售后单保留为「已同意」，可稍后在退款台账重试`,
      );
    }
    const refreshed = await this.prisma.mpAfterSale.findUnique({
      where: { id: row.id },
    });
    return this.viewOf(refreshed ?? row);
  }

  private async finalizeRefund(
    refund: MpRefundRow,
    operatorType: 'MERCHANT' | 'PLATFORM',
    operatorId: string,
    channelRefundId: string,
  ): Promise<void> {
    const now = new Date();
    const [lines, orderItems, shopOrder] = await Promise.all([
      this.prisma.mpAfterSaleItem.findMany({
        where: { afterSaleId: refund.afterSaleId },
      }),
      this.prisma.mpOrderItem.findMany({
        where: { shopOrderId: refund.shopOrderId },
      }),
      this.prisma.mpShopOrder.findUnique({
        where: { id: refund.shopOrderId },
      }),
    ]);
    await this.runEffects(refund, lines, shopOrder);
    await this.prisma.$transaction(async (tx) => {
      await tx.mpRefund.update({
        where: { id: refund.id },
        data: {
          status: 'SUCCESS',
          refundedAt: now,
          ...(channelRefundId ? { transactionId: channelRefundId } : {}),
        },
      });
      if (refund.afterSaleId > 0) {
        await tx.mpAfterSale.update({
          where: { id: refund.afterSaleId },
          data: { status: 'REFUNDED', refundedAt: now },
        });
      }
      for (const line of lines) {
        const item = orderItems.find((row) => row.id === line.orderItemId);
        if (!item) continue;
        const refunded =
          (decimalOf(item.refundedAmount) ?? 0) + (decimalOf(line.amount) ?? 0);
        // 只退部分数量时行保持可再次申请；退满整行才落 DONE。
        const done = refunded >= (decimalOf(item.totalPrice) ?? 0) - 0.005;
        await tx.mpOrderItem.update({
          where: { id: item.id },
          data: {
            refundStatus: done ? 'DONE' : 'NONE',
            refundedAmount: { increment: line.amount },
          },
        });
      }
      const refundedTotal =
        orderItems.reduce(
          (sum, item) => sum + (decimalOf(item.refundedAmount) ?? 0),
          0,
        ) + lines.reduce((sum, line) => sum + (decimalOf(line.amount) ?? 0), 0);
      const refundCap = shopOrder
        ? Math.min(
            decimalOf(shopOrder.goodsAmount) ?? 0,
            decimalOf(shopOrder.payAmount) ?? 0,
          )
        : Number.POSITIVE_INFINITY;
      const fullyRefunded =
        Number.isFinite(refundCap) && refundedTotal >= refundCap - 0.005;
      await tx.mpShopOrder.update({
        where: { id: refund.shopOrderId },
        data: {
          refundStatus: fullyRefunded ? 'DONE' : 'PARTIAL',
          ...(fullyRefunded ? { payStatus: 'REFUNDED' } : {}),
        },
      });
      if (fullyRefunded) {
        await tx.mpPayRecord.updateMany({
          where: { shopOrderId: refund.shopOrderId },
          data: { status: 'REFUNDED' },
        });
      }
      await tx.mpOrderLog.create({
        data: {
          orderId: refund.orderId,
          shopOrderId: refund.shopOrderId,
          marketId: refund.marketId,
          shopId: refund.shopId,
          operatorType,
          operatorId,
          action: 'REFUND_SUCCEEDED',
          content: `退款 ${Number(refund.amount).toFixed(2)} 元已完成（${refund.channel === 'WECHAT' ? '原路退回' : '线下退款'}）`,
        },
      });
    });
    // 退款对账完成后再补 SCRM 事件：与资金链路解耦，写不进 outbox 也不影响退款。
    const order = await this.prisma.mpOrder.findUnique({
      where: { id: refund.orderId },
      select: { orderNo: true, receiverPhone: true },
    });
    await this.scrm.enqueue({
      marketId: refund.marketId,
      merchantId: refund.merchantId,
      customerId: refund.customerId,
      kind: 'ORDER_REFUNDED',
      recordKey: refund.id,
      payload: {
        customerLabel: scrmCustomerLabel({ mobile: order?.receiverPhone }),
        orderNo: order?.orderNo || refund.refundNo,
        amountYuan: Number(refund.amount),
      },
    });
  }

  /** 幂等副作用：唯一键 [refundId, effect]；已完成的一律跳过。 */
  private async runEffects(
    refund: MpRefundRow,
    lines: MpAfterSaleItemRow[],
    shopOrder: MpShopOrderRow | null,
  ): Promise<void> {
    for (const effect of REFUND_EFFECTS) {
      const existing = await this.prisma.mpRefundEffect.findUnique({
        where: {
          refundId_effect: { refundId: refund.id, effect },
        },
      });
      if (existing?.status === 'DONE') continue;
      const row = existing
        ? await this.prisma.mpRefundEffect.update({
            where: { id: existing.id },
            data: { status: 'PENDING', error: '' },
          })
        : await this.prisma.mpRefundEffect.create({
            data: {
              marketId: refund.marketId,
              refundId: refund.id,
              effect,
              status: 'PENDING',
              detail: {},
            },
          });
      try {
        const detail =
          effect === 'RESTORE_STOCK'
            ? await this.restoreStock(refund, lines)
            : this.revokeCommission(refund, shopOrder);
        await this.prisma.mpRefundEffect.update({
          where: { id: row.id },
          data: {
            status: 'DONE',
            detail: detail as Prisma.InputJsonValue,
            finishedAt: new Date(),
          },
        });
      } catch (error) {
        await this.prisma.mpRefundEffect.update({
          where: { id: row.id },
          data: {
            status: 'FAILED',
            error: (error instanceof Error
              ? error.message
              : '副作用执行失败'
            ).slice(0, 200),
          },
        });
        throw error;
      }
    }
  }

  private async restoreStock(
    refund: MpRefundRow,
    lines: MpAfterSaleItemRow[],
  ): Promise<Record<string, unknown>> {
    const products = await this.prisma.mpProduct.findMany({
      where: { id: { in: lines.map((line) => line.productId) } },
      select: { id: true, type: true },
    });
    const virtualIds = new Set(
      products.filter((row) => row.type === 'VIRTUAL').map((row) => row.id),
    );
    const restored: Array<{
      productId: number;
      skuId: number;
      quantity: number;
    }> = [];
    for (const line of lines) {
      if (virtualIds.has(line.productId)) continue;
      if (line.skuId > 0) {
        await this.prisma.mpProductSku.updateMany({
          where: { id: line.skuId },
          data: {
            stock: { increment: line.quantity },
            sales: { decrement: line.quantity },
          },
        });
      }
      await this.prisma.mpProduct.updateMany({
        where: { id: line.productId },
        data: {
          stock: { increment: line.quantity },
          sales: { decrement: line.quantity },
        },
      });
      restored.push({
        productId: line.productId,
        skuId: line.skuId,
        quantity: line.quantity,
      });
    }
    return { refundId: refund.id, restored };
  }

  private revokeCommission(
    refund: MpRefundRow,
    shopOrder: MpShopOrderRow | null,
  ): Record<string, unknown> {
    const rate = decimalOf(shopOrder?.commissionRate) ?? 0;
    const amount = decimalOf(refund.amount) ?? 0;
    return {
      refundId: refund.id,
      rate,
      amount,
      commission: money((amount * rate) / 100),
      note: '结算按退款金额同比例冲销佣金',
    };
  }

  // ------------------------------------------------------------ 内部

  private async applyLines(
    order: MpShopOrderRow,
    items: MpOrderItemRow[],
    requested: MpAfterSaleApplyItem[],
  ): Promise<
    Array<{
      shopOrderId: number;
      orderItemId: number;
      productId: number;
      skuId: number;
      title: string;
      skuName: string;
      image: string;
      price: number;
      quantity: number;
      amount: number;
    }>
  > {
    const itemMap = new Map(items.map((item) => [item.id, item] as const));
    const active = await this.prisma.mpAfterSale.findMany({
      where: {
        shopOrderId: order.id,
        status: { in: ['PENDING', 'AGREED'] },
      },
      select: { id: true },
    });
    const activeItems = active.length
      ? await this.prisma.mpAfterSaleItem.findMany({
          where: { afterSaleId: { in: active.map((row) => row.id) } },
        })
      : [];
    const usedQty = new Map<number, number>();
    for (const line of activeItems) {
      usedQty.set(
        line.orderItemId,
        (usedQty.get(line.orderItemId) ?? 0) + line.quantity,
      );
    }
    const seen = new Set<number>();
    const lines = requested.map((request) => {
      const item = itemMap.get(request.orderItemId);
      if (!item) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '售后商品不在这张子单里，请刷新后重试',
        );
      }
      if (seen.has(item.id)) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '同一商品不要重复提交',
        );
      }
      seen.add(item.id);
      const refundedQty = Math.round(
        (decimalOf(item.refundedAmount) ?? 0) / (decimalOf(item.price) || 1),
      );
      const left = item.quantity - refundedQty - (usedQty.get(item.id) ?? 0);
      if (request.quantity > left) {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          `「${item.title}」最多还可申请 ${Math.max(0, left)} 件`,
        );
      }
      const price = decimalOf(item.price) ?? 0;
      return {
        shopOrderId: order.id,
        orderItemId: item.id,
        productId: item.productId,
        skuId: item.skuId,
        title: item.title,
        skuName: item.skuName,
        image: item.image,
        price,
        quantity: request.quantity,
        amount: money(price * request.quantity),
      };
    });
    return lines;
  }

  private async releaseItems(
    tx: Prisma.TransactionClient,
    row: MpAfterSaleRow,
  ): Promise<void> {
    const lines = await tx.mpAfterSaleItem.findMany({
      where: { afterSaleId: row.id },
    });
    for (const line of lines) {
      await tx.mpOrderItem.update({
        where: { id: line.orderItemId },
        data: { refundStatus: 'NONE' },
      });
    }
    const others = await tx.mpAfterSale.count({
      where: {
        shopOrderId: row.shopOrderId,
        id: { not: row.id },
        status: { in: ['PENDING', 'AGREED'] },
      },
    });
    await tx.mpShopOrder.update({
      where: { id: row.shopOrderId },
      data: { refundStatus: others > 0 ? 'PENDING' : 'NONE' },
    });
  }

  private async rejectItems(
    tx: Prisma.TransactionClient,
    row: MpAfterSaleRow,
  ): Promise<void> {
    const lines = await tx.mpAfterSaleItem.findMany({
      where: { afterSaleId: row.id },
    });
    for (const line of lines) {
      const item = await tx.mpOrderItem.findUnique({
        where: { id: line.orderItemId },
      });
      if (item && item.refundStatus === 'PENDING') {
        await tx.mpOrderItem.update({
          where: { id: item.id },
          data: { refundStatus: 'REJECTED' },
        });
      }
    }
    const others = await tx.mpAfterSale.count({
      where: {
        shopOrderId: row.shopOrderId,
        id: { not: row.id },
        status: { in: ['PENDING', 'AGREED'] },
      },
    });
    await tx.mpShopOrder.update({
      where: { id: row.shopOrderId },
      data: { refundStatus: others > 0 ? 'PENDING' : 'REJECTED' },
    });
  }

  private async log(
    row: MpAfterSaleRow,
    operatorType: 'MERCHANT' | 'PLATFORM',
    operatorId: string,
    action: string,
    content: string,
  ): Promise<void> {
    await this.prisma.mpOrderLog.create({
      data: {
        orderId: row.orderId,
        shopOrderId: row.shopOrderId,
        marketId: row.marketId,
        shopId: row.shopId,
        operatorType,
        operatorId,
        action,
        content,
      },
    });
  }

  private async managePage(
    marketId: number,
    query: {
      merchantId?: number;
      status?: string;
      keyword?: string;
      page?: unknown;
      pageSize?: unknown;
    },
  ): Promise<PageResponse<MpAfterSale>> {
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
    );
    const status = String(query.status || '').trim();
    const keyword = String(query.keyword || '').trim();
    const where = {
      marketId,
      ...(query.merchantId ? { merchantId: Number(query.merchantId) } : {}),
      ...(status ? { status } : {}),
      ...(keyword ? { afterSaleNo: { contains: keyword } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.mpAfterSale.count({ where }),
      this.prisma.mpAfterSale.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    return { list: await this.viewsOf(rows), total, page, pageSize };
  }

  private async viewsOf(rows: MpAfterSaleRow[]): Promise<MpAfterSale[]> {
    if (rows.length === 0) return [];
    const [items, shops, refunds] = await Promise.all([
      this.prisma.mpAfterSaleItem.findMany({
        where: { afterSaleId: { in: rows.map((row) => row.id) } },
      }),
      this.prisma.mpShop.findMany({
        where: { id: { in: [...new Set(rows.map((row) => row.shopId))] } },
        select: { id: true, name: true },
      }),
      this.prisma.mpRefund.findMany({
        where: {
          id: { in: rows.map((row) => row.refundId).filter((id) => id > 0) },
        },
      }),
    ]);
    const shopMap = new Map(shops.map((row) => [row.id, row.name] as const));
    const refundMap = new Map(refunds.map((row) => [row.id, row] as const));
    const orders = await this.prisma.mpShopOrder.findMany({
      where: { id: { in: [...new Set(rows.map((row) => row.shopOrderId))] } },
      select: { id: true, subOrderNo: true },
    });
    const orderMap = new Map(
      orders.map((row) => [row.id, row.subOrderNo] as const),
    );
    return rows.map((row) =>
      this.afterSaleView(
        row,
        items.filter((item) => item.afterSaleId === row.id),
        shopMap.get(row.shopId) ?? '',
        orderMap.get(row.shopOrderId) ?? '',
        refundMap.get(row.refundId) ?? null,
      ),
    );
  }

  private async viewOf(row: MpAfterSaleRow): Promise<MpAfterSale> {
    const [view] = await this.viewsOf([row]);
    return view;
  }

  private afterSaleView(
    row: MpAfterSaleRow,
    items: MpAfterSaleItemRow[],
    shopName: string,
    subOrderNo: string,
    refund: MpRefundRow | null,
  ): MpAfterSale {
    return {
      id: row.id,
      afterSaleNo: row.afterSaleNo,
      marketId: row.marketId,
      merchantId: row.merchantId,
      shopId: row.shopId,
      shopName,
      orderId: row.orderId,
      shopOrderId: row.shopOrderId,
      subOrderNo,
      customerId: row.customerId,
      type: row.type as MpAfterSale['type'],
      status: row.status as MpAfterSale['status'],
      reason: row.reason,
      description: row.description,
      images: this.strings(row.images),
      amount: decimalOf(row.amount) ?? 0,
      merchantRemark: row.merchantRemark,
      rejectReason: row.rejectReason,
      platformNote: row.platformNote,
      returnExpress: row.returnExpress,
      returnExpressNo: row.returnExpressNo,
      refundId: row.refundId,
      refundNo: refund?.refundNo ?? '',
      refundStatus: refund?.status ?? '',
      auditedAt: iso(row.auditedAt),
      refundedAt: iso(row.refundedAt),
      createdAt: iso(row.createdAt),
      items: items.map((item) => this.afterSaleItemView(item)),
    };
  }

  private afterSaleItemView(row: MpAfterSaleItemRow): MpAfterSaleItem {
    return {
      id: row.id,
      orderItemId: row.orderItemId,
      productId: row.productId,
      skuId: row.skuId,
      title: row.title,
      skuName: row.skuName,
      image: row.image,
      price: decimalOf(row.price) ?? 0,
      quantity: row.quantity,
      amount: decimalOf(row.amount) ?? 0,
    };
  }

  private async refundPage(
    marketId: number,
    query: {
      merchantId?: number;
      status?: string;
      keyword?: string;
      page?: unknown;
      pageSize?: unknown;
    },
  ): Promise<PageResponse<MpRefund>> {
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
    );
    const status = String(query.status || '').trim();
    const keyword = String(query.keyword || '').trim();
    const where = {
      marketId,
      ...(query.merchantId ? { merchantId: Number(query.merchantId) } : {}),
      ...(status ? { status } : {}),
      ...(keyword ? { refundNo: { contains: keyword } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.mpRefund.count({ where }),
      this.prisma.mpRefund.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const market = await this.prisma.mpMarket.findUnique({
      where: { id: marketId },
    });
    const [shops, orders] = await Promise.all([
      this.prisma.mpShop.findMany({
        where: { id: { in: [...new Set(rows.map((row) => row.shopId))] } },
        select: { id: true, name: true },
      }),
      this.prisma.mpShopOrder.findMany({
        where: { id: { in: rows.map((row) => row.shopOrderId) } },
        select: { id: true, subOrderNo: true },
      }),
    ]);
    const shopMap = new Map(shops.map((row) => [row.id, row.name] as const));
    const orderMap = new Map(
      orders.map((row) => [row.id, row.subOrderNo] as const),
    );
    void market;
    return {
      list: rows.map((row) =>
        this.refundView(
          row,
          shopMap.get(row.shopId) ?? '',
          orderMap.get(row.shopOrderId) ?? '',
        ),
      ),
      total,
      page,
      pageSize,
    };
  }

  private async refundDetailOf(row: MpRefundRow): Promise<MpRefundDetail> {
    const [shop, order, effects] = await Promise.all([
      this.prisma.mpShop.findUnique({
        where: { id: row.shopId },
        select: { name: true },
      }),
      this.prisma.mpShopOrder.findUnique({
        where: { id: row.shopOrderId },
        select: { subOrderNo: true },
      }),
      this.prisma.mpRefundEffect.findMany({
        where: { refundId: row.id },
        orderBy: { id: 'asc' },
      }),
    ]);
    return {
      refund: this.refundView(row, shop?.name ?? '', order?.subOrderNo ?? ''),
      effects: effects.map((effect) => this.effectView(effect)),
    };
  }

  private refundView(
    row: MpRefundRow,
    shopName: string,
    subOrderNo: string,
  ): MpRefund {
    return {
      id: row.id,
      refundNo: row.refundNo,
      marketId: row.marketId,
      merchantId: row.merchantId,
      shopId: row.shopId,
      shopName,
      afterSaleId: row.afterSaleId,
      orderId: row.orderId,
      shopOrderId: row.shopOrderId,
      subOrderNo,
      channel: row.channel as MpRefund['channel'],
      amount: decimalOf(row.amount) ?? 0,
      status: row.status as MpRefund['status'],
      reason: row.reason,
      transactionId: row.transactionId,
      error: row.error,
      operatorType: row.operatorType,
      refundedAt: iso(row.refundedAt),
      createdAt: iso(row.createdAt),
    };
  }

  private effectView(row: MpRefundEffectRow): MpRefundEffectView {
    return {
      id: row.id,
      refundId: row.refundId,
      effect: row.effect as MpRefundEffectView['effect'],
      status: row.status as MpRefundEffectView['status'],
      detail: jsonObject(row.detail),
      error: row.error,
      finishedAt: iso(row.finishedAt),
    };
  }

  private payRecordView(row: MpPayRecordRow): MpPayRecord {
    return {
      id: row.id,
      marketId: row.marketId,
      orderId: row.orderId,
      shopOrderId: row.shopOrderId,
      orderNo: row.orderNo,
      subOrderNo: row.subOrderNo,
      transactionId: row.transactionId,
      payType: row.payType as MpPayRecord['payType'],
      amount: decimalOf(row.amount) ?? 0,
      commissionAmount: decimalOf(row.commissionAmount) ?? 0,
      status: row.status as MpPayRecord['status'],
      paidAt: iso(row.paidAt),
      createdAt: iso(row.createdAt),
    };
  }

  private strings(value: unknown): string[] {
    let raw = value;
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch {
        raw = [];
      }
    }
    return Array.isArray(raw)
      ? raw.map((item) => String(item ?? '').trim()).filter(Boolean)
      : [];
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
    // 启动闸门：售后同为买家通道，与交易服务同一口径
    if (!(await toolOpen('marketplace', market.ownerUserId))) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该站点尚未启动（或已停服），请到「建站管理 → 启动设置」启动后重试',
      );
    }
    if (write && market.status !== 'ONLINE') {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '市场尚未营业，暂不可操作',
      );
    }
    return { market, customer };
  }

  private async requireMarket(ownerUserId: string): Promise<MpMarketRow> {
    const market = await this.prisma.mpMarket.findUnique({
      where: { ownerUserId },
    });
    if (!market) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '还没有创建多店铺商城平台，请先在概览页创建市场',
      );
    }
    return market;
  }
}
