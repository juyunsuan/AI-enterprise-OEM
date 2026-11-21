import type { Prisma } from '../../generated/prisma';
import type {
  OnsiteRefundDetail,
  OnsiteRefundRow,
} from '@enterprise/contracts';
import { pageOf, pageParam, text } from '../common/api';
import type { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { allocateNo } from '../common/document-number';
import { stringArray } from './onsite.money';
import type {
  WechatPayClient,
  WechatCredentials,
} from '../points/wechat-pay.client';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { OnsiteNotifyService } from './onsite.notify.service';
import { refundableCents, transit } from './onsite.order.rules';
import type { OnsiteScheduleService } from './onsite.schedule.service';
import type { OnsiteCommissionService } from './onsite.commission.service';
import type { OnsiteShopService } from './onsite.shop.service';

/** C 端可筛选的退款状态（与 onsite_refunds.status 注释一致，未知值直接忽略）。 */
const PUBLIC_REFUND_STATUSES: string[] = [
  'PENDING',
  'AGREED',
  'REFUNDED',
  'REJECTED',
  'CANCELLED',
];

/**
 * 售后退款。
 *
 * 参考源码把退款做成「整单申请 + 一张闲置的按行明细表」，实际按服务份数退不了；
 * 本实现把**可退上限来自收款台账的剩余可退额**（一单可能含原单 + 多次加钟），
 * 并按明细行的份数拆金额，退完回写订单的真实时长与真实服务费（分账与工时都按它算）。
 *
 * 三条不可让的口径：
 * 1. 金额全程整数分，末行兜底，Σ行退款 = 退款单金额；
 * 2. 微信退款用固定 `out_refund_no`（= 退款单号），重试天然幂等；
 * 3. 驳回退款要回到**申请前的状态**，不是硬写「已完成」。
 */
export class OnsiteRefundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shops: OnsiteShopService,
    private readonly miniApp: MiniAppService,
    private readonly pay: WechatPayClient,
    private readonly schedule: OnsiteScheduleService,
    private readonly notify: OnsiteNotifyService,
    private readonly commission: OnsiteCommissionService,
  ) {}

  private toRow(
    row: Prisma.OnsiteRefundGetPayload<Record<string, never>>,
    orderNo = '',
  ): OnsiteRefundRow {
    return {
      id: row.id,
      refundNo: row.refundNo,
      orderId: row.orderId,
      orderNo,
      customerId: row.customerId,
      staffId: row.staffId,
      applyAmountCents: Math.round(Number(row.applyAmount) * 100),
      refundAmountCents: Math.round(Number(row.refundAmount) * 100),
      reason: row.reason,
      description: row.description,
      evidenceImages: stringArray(row.evidenceImages),
      status: row.status,
      auditRemark: row.auditRemark,
      refundTransactionId: row.refundTransactionId,
      refundedAt: row.refundedAt ? row.refundedAt.toISOString() : '',
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** 可退上限与已退明细：C 端申请页与店主代申请共用。 */
  async quote(shopId: number, orderId: number, customerId = 0) {
    const order = await this.prisma.onsiteOrder.findFirst({
      where: { id: orderId, shopId, ...(customerId ? { customerId } : {}) },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    const [flows, items, pending] = await Promise.all([
      this.prisma.onsiteOrderPriceFlow.findMany({
        where: { orderId: order.id },
      }),
      this.prisma.onsiteOrderItem.findMany({ where: { orderId: order.id } }),
      this.prisma.onsiteRefund.count({
        where: { orderId: order.id, status: { in: ['PENDING', 'AGREED'] } },
      }),
    ]);
    return {
      orderNo: order.orderNo,
      status: order.status,
      refundableCents: refundableCents(
        flows.map((flow) => ({
          refundableAmountCents: Math.round(
            Number(flow.refundableAmount) * 100,
          ),
        })),
      ),
      pendingRefund: pending > 0,
      items: items.map((item) => ({
        id: item.id,
        title: item.title,
        quantity: item.quantity,
        refundableQuantity: item.refundableQuantity - item.refundedQuantity,
        unitPriceCents: Math.round(Number(item.unitPrice) * 100),
        materialFeeCents: Math.round(Number(item.materialFee) * 100),
        durationMinutes: item.durationMinutes,
      })),
    };
  }

  async apply(
    shop: Awaited<ReturnType<OnsiteShopService['requireShop']>>,
    input: {
      orderId: number;
      /** C 端必传自己的顾客 id（越权防线）；店主代申请传 0，按店铺维度校验即可。 */
      customerId: number;
      reason: string;
      description?: string;
      evidenceImages?: string[];
      items: { orderItemId: number; quantity: number }[];
      role: string;
      operatorId: string;
    },
  ): Promise<OnsiteRefundRow> {
    const order = await this.prisma.onsiteOrder.findFirst({
      where: {
        id: input.orderId,
        shopId: shop.shopId,
        ...(input.customerId ? { customerId: input.customerId } : {}),
      },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    if (order.payStatus !== 'PAID') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '未付款订单不需要退款，请直接取消订单',
      );
    }
    if (
      ['CANCELLED', 'EXPIRED', 'REJECTED', 'REFUNDED'].includes(order.status)
    ) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该订单已结束，不能再申请退款',
      );
    }
    if (order.refundStatus === 'PENDING') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '已有一笔退款正在处理中，请先让店主处理完再申请',
      );
    }
    const quote = await this.quote(shop.shopId, order.id);
    if (quote.pendingRefund) {
      throw new BusinessException(ErrorCode.CONFLICT, '已有退款单待处理');
    }
    const lines = await this.prisma.onsiteOrderItem.findMany({
      where: { orderId: order.id, shopId: shop.shopId },
    });
    const picked = input.items
      .map((item) => {
        const line = lines.find((row) => row.id === item.orderItemId);
        const quantity = Math.max(0, Math.min(20, Math.round(item.quantity)));
        if (!line || quantity <= 0) return null;
        const refundable = line.refundableQuantity - line.refundedQuantity;
        if (quantity > refundable) {
          throw new BusinessException(
            ErrorCode.BAD_REQUEST,
            `「${line.title}」最多还能退 ${refundable} 份，请调整退款份数`,
          );
        }
        return {
          line,
          quantity,
          amountCents:
            Math.round(Number(line.unitPrice) * 100) * quantity +
            Math.round(Number(line.materialFee) * 100) * quantity,
          durationMinutes: line.durationMinutes * quantity,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (!picked.length) {
      // 没选明细行 = 整单剩余可退全退（顾客最常见的「全单退」）
      const remaining = lines.filter(
        (line) => line.refundableQuantity - line.refundedQuantity > 0,
      );
      if (!remaining.length) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '请选择要退的服务份数',
        );
      }
      for (const line of remaining) {
        const quantity = line.refundableQuantity - line.refundedQuantity;
        picked.push({
          line,
          quantity,
          amountCents:
            Math.round(Number(line.unitPrice) * 100) * quantity +
            Math.round(Number(line.materialFee) * 100) * quantity,
          durationMinutes: line.durationMinutes * quantity,
        });
      }
    }
    const applyCents = picked.reduce((sum, item) => sum + item.amountCents, 0);
    if (applyCents > quote.refundableCents) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `退款金额 ${(applyCents / 100).toFixed(2)} 元超过可退 ${(
          quote.refundableCents / 100
        ).toFixed(2)} 元（含加钟收款），请减少份数`,
      );
    }
    const next = transit({
      action: 'refundApply',
      status: order.status,
      payStatus: order.payStatus,
      refundStatus: order.refundStatus,
      role: input.role,
    });
    const refund = await this.prisma.$transaction(async (tx) => {
      const refundNo = await allocateNo(tx, 'OSR', new Date(), {
        table: 'onsite_refunds',
        column: 'refund_no',
      });
      const created = await tx.onsiteRefund.create({
        data: {
          shopId: shop.shopId,
          refundNo,
          orderId: order.id,
          customerId: order.customerId,
          staffId: order.staffId,
          applyAmount: Number((applyCents / 100).toFixed(2)),
          reason: String(input.reason || '').slice(0, 200),
          description: String(input.description || '').slice(0, 4000),
          evidenceImages: (input.evidenceImages || []).slice(0, 9),
          status: 'PENDING',
          durationMinutes: picked.reduce(
            (sum, item) => sum + item.durationMinutes,
            0,
          ),
          travelFee: 0,
          materialFee: Number(
            (
              picked.reduce(
                (sum, item) =>
                  sum +
                  Math.round(Number(item.line.materialFee) * 100) *
                    item.quantity,
                0,
              ) / 100
            ).toFixed(2),
          ),
        },
      });
      await tx.onsiteRefundItem.createMany({
        data: picked.map((item) => ({
          refundId: created.id,
          orderId: order.id,
          orderItemId: item.line.id,
          shopId: shop.shopId,
          quantity: item.quantity,
          amount: Number((item.amountCents / 100).toFixed(2)),
          materialFee: Number(
            (
              (Math.round(Number(item.line.materialFee) * 100) *
                item.quantity) /
              100
            ).toFixed(2),
          ),
        })),
      });
      await tx.onsiteOrder.update({
        where: { id: order.id },
        data: { status: next.status, refundStatus: next.refundStatus },
      });
      await tx.onsiteOrderStatusLog.create({
        data: {
          orderId: order.id,
          shopId: shop.shopId,
          fromStatus: order.status,
          toStatus: next.status,
          operatorRole: input.role,
          operatorId: input.operatorId,
          action: 'refundApply',
          content: `申请退款 ${(applyCents / 100).toFixed(2)} 元：${String(
            input.reason || '',
          ).slice(0, 120)}`,
        },
      });
      return created;
    });
    await this.prisma.onsiteShop
      .findUnique({ where: { id: shop.shopId } })
      .then((row) =>
        this.notify.refundRequested({
          shopId: shop.shopId,
          ownerUserId: row?.ownerUserId || '',
          orderNo: order.orderNo,
          refundNo: refund.refundNo,
          amountCents: applyCents,
          reason: refund.reason,
        }),
      )
      .catch(() => undefined);
    return this.toRow(refund, order.orderNo);
  }

  async list(
    user: CurrentUser,
    shopId: string,
    query: Record<string, unknown>,
  ) {
    const shop = await this.shops.requireShop(user, shopId);
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
      20,
    );
    const status = text(query.status, 'all');
    const where = {
      shopId: shop.shopId,
      ...(status && status !== 'all' ? { status } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.onsiteRefund.count({ where }),
      this.prisma.onsiteRefund.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const orders = await this.prisma.onsiteOrder.findMany({
      where: { id: { in: rows.map((row) => row.orderId) } },
      select: { id: true, orderNo: true },
    });
    const noOf = new Map(orders.map((row) => [row.id, row.orderNo]));
    return pageOf(
      rows.map((row) => this.toRow(row, noOf.get(row.orderId) ?? '')),
      total,
      page,
      pageSize,
    );
  }

  /** C 端只列本人产生的退款单：`shopId + customerId` 双条件，不给越权留口子。 */
  async publicList(
    shopId: number,
    customerId: number,
    page: number,
    pageSize: number,
    status = '',
  ) {
    const { offset } = pageParam(page, pageSize, 10);
    const where = {
      shopId,
      customerId,
      ...(PUBLIC_REFUND_STATUSES.includes(status) ? { status } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.onsiteRefund.count({ where }),
      this.prisma.onsiteRefund.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const orders = await this.prisma.onsiteOrder.findMany({
      where: { id: { in: rows.map((row) => row.orderId) } },
      select: { id: true, orderNo: true },
    });
    const noOf = new Map(orders.map((row) => [row.id, row.orderNo]));
    return pageOf(
      rows.map((row) => this.toRow(row, noOf.get(row.orderId) ?? '')),
      total,
      page,
      pageSize,
    );
  }

  /** C 端退款详单：归属按 `shopId + customerId` 校验，明文口径与店主侧一致。 */
  async publicDetail(shopId: number, customerId: number, refundId: number) {
    if (!refundId)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '缺少退款单号');
    const row = await this.prisma.onsiteRefund.findFirst({
      where: { id: refundId, shopId, customerId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '退款单不存在');
    const [order, items, orderItems] = await Promise.all([
      this.prisma.onsiteOrder.findUnique({ where: { id: row.orderId } }),
      this.prisma.onsiteRefundItem.findMany({ where: { refundId: row.id } }),
      this.prisma.onsiteOrderItem.findMany({
        where: { orderId: row.orderId },
        select: { id: true, title: true },
      }),
    ]);
    const titleOf = new Map(orderItems.map((item) => [item.id, item.title]));
    return {
      ...this.toRow(row, order?.orderNo ?? ''),
      orderStatus: order?.status ?? '',
      payType: order?.payType ?? '',
      // 端上直接展示「退了哪几份」，带服务名比只给明细行 id 有用
      lines: items.map((item) => ({
        orderItemId: item.orderItemId,
        title: titleOf.get(item.orderItemId) ?? '',
        quantity: item.quantity,
        amountCents: Math.round(Number(item.amount) * 100),
        materialFeeCents: Math.round(Number(item.materialFee) * 100),
      })),
    };
  }

  async detail(user: CurrentUser, shopId: string, refundId: string) {
    const shop = await this.shops.requireShop(user, shopId);
    const row = await this.prisma.onsiteRefund.findFirst({
      where: { id: Number(refundId), shopId: shop.shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '退款单不存在');
    const [order, items] = await Promise.all([
      this.prisma.onsiteOrder.findUnique({ where: { id: row.orderId } }),
      this.prisma.onsiteRefundItem.findMany({ where: { refundId: row.id } }),
    ]);
    const detail: OnsiteRefundDetail = {
      ...this.toRow(row, order?.orderNo ?? ''),
      orderStatus: order?.status ?? '',
      payType: order?.payType ?? '',
      lines: items.map((item) => ({
        orderItemId: item.orderItemId,
        quantity: item.quantity,
        amountCents: Math.round(Number(item.amount) * 100),
        materialFeeCents: Math.round(Number(item.materialFee) * 100),
      })),
    };
    return detail;
  }

  /**
   * 同意退款。`offline=true` 走线下已退登记（顾客到店退现），
   * 否则必须该店配了自己的微信商户号；两条路径写回账目的逻辑完全一致。
   */
  async agree(
    user: CurrentUser,
    shopId: string,
    input: { refundId: number; remark?: string; offline?: boolean },
  ) {
    const shop = await this.shops.requireShop(user, shopId);
    const refund = await this.prisma.onsiteRefund.findFirst({
      where: { id: input.refundId, shopId: shop.shopId },
    });
    if (!refund)
      throw new BusinessException(ErrorCode.NOT_FOUND, '退款单不存在');
    if (refund.status !== 'PENDING') {
      throw new BusinessException(ErrorCode.CONFLICT, '该退款单已处理过');
    }
    const order = await this.prisma.onsiteOrder.findUnique({
      where: { id: refund.orderId },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    const refundCents = Math.round(Number(refund.applyAmount) * 100);
    let transactionId = '';
    if (!input.offline) {
      const credentials = await this.credentials(shop.shopId);
      if (!credentials) {
        throw new BusinessException(
          ErrorCode.SERVICE_UNAVAILABLE,
          '该店铺未配置微信支付商户号，无法原路退款。请勾选「线下已退」，或到「微信凭据」补齐商户号与 APIv3 密钥',
        );
      }
      const result = await this.pay.refund(credentials, {
        outTradeNo: order.orderNo,
        outRefundNo: refund.refundNo,
        reason: refund.reason || '服务退款',
        totalCents: Math.round(Number(order.payAmount) * 100),
        refundCents,
      });
      transactionId = result.refundId;
    }
    const next = transit({
      action: 'refundAgree',
      status: order.status,
      payStatus: order.payStatus,
      refundStatus: order.refundStatus,
      role: 'OWNER',
    });
    const lines = await this.prisma.onsiteRefundItem.findMany({
      where: { refundId: refund.id },
    });
    // 先在事务外把要写的值算完：事务里再发查询容易把连接占满，也让回写顺序难以核对
    const orderItems = await this.prisma.onsiteOrderItem.findMany({
      where: { orderId: order.id },
    });
    const itemOf = new Map(orderItems.map((item) => [item.id, item]));
    const lineWrites = lines.map((line) => {
      const item = itemOf.get(line.orderItemId);
      const amountCents = Math.round(Number(line.amount) * 100);
      const materialCents = Math.round(Number(line.materialFee) * 100);
      return {
        orderItemId: line.orderItemId,
        quantity: line.quantity,
        durationMinutes: (item?.durationMinutes ?? 0) * line.quantity,
        refundedQuantity: (item?.refundedQuantity ?? 0) + line.quantity,
        refundedAmountCents:
          Math.round(Number(item?.refundedAmount ?? 0) * 100) + amountCents,
        amountCents,
        materialCents,
      };
    });
    const flows = await this.prisma.onsiteOrderPriceFlow.findMany({
      where: { orderId: order.id },
      orderBy: { paidAt: 'asc' },
    });
    const flowWrites: { id: number; refundableAmount: number }[] = [];
    let left = refundCents;
    for (const flow of flows) {
      const available = Math.round(Number(flow.refundableAmount) * 100);
      if (available <= 0 || left <= 0) continue;
      const take = Math.min(available, left);
      left -= take;
      flowWrites.push({
        id: flow.id,
        refundableAmount: Number(((available - take) / 100).toFixed(2)),
      });
    }
    if (left > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `可退余额不足，还差 ${(left / 100).toFixed(2)} 元（收款台账已被其它退款扣减），请核对退款单金额`,
      );
    }
    const refundedDuration = lineWrites.reduce(
      (sum, item) => sum + item.durationMinutes,
      0,
    );
    // 服务费真实值只扣「不含物料」的部分：物料费是已发生的耗材，不随退款退回服务时长
    const serviceRefundCents =
      refundCents - Math.round(Number(refund.materialFee) * 100);
    const nextServiceFeeCents = Math.max(
      0,
      Math.round(Number(order.trueServiceFee) * 100) - serviceRefundCents,
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.onsiteRefund.update({
        where: { id: refund.id },
        data: {
          status: 'REFUNDED',
          refundAmount: Number((refundCents / 100).toFixed(2)),
          auditRemark: String(input.remark || '').slice(0, 300),
          refundTransactionId: transactionId.slice(0, 64),
          auditedAt: new Date(),
          refundedAt: new Date(),
        },
      });
      for (const item of lineWrites) {
        await tx.onsiteOrderItem.update({
          where: { id: item.orderItemId },
          data: {
            refundedQuantity: item.refundedQuantity,
            refundedAmount: Number((item.refundedAmountCents / 100).toFixed(2)),
          },
        });
      }
      for (const flow of flowWrites) {
        await tx.onsiteOrderPriceFlow.update({
          where: { id: flow.id },
          data: { refundableAmount: flow.refundableAmount },
        });
      }
      const row = await tx.onsiteOrder.update({
        where: { id: order.id },
        data: {
          status: next.status,
          payStatus: next.payStatus,
          refundStatus: next.refundStatus,
          trueDurationMinutes: Math.max(
            0,
            order.trueDurationMinutes - refundedDuration,
          ),
          trueServiceFee: Number((nextServiceFeeCents / 100).toFixed(2)),
        },
      });
      await tx.onsiteOrderStatusLog.create({
        data: {
          orderId: order.id,
          shopId: shop.shopId,
          fromStatus: order.status,
          toStatus: next.status,
          operatorRole: 'OWNER',
          operatorId: user.userId,
          action: 'refundAgree',
          content: `${input.offline ? '线下已退' : '微信原路退款'} ${(
            refundCents / 100
          ).toFixed(
            2,
          )} 元${transactionId ? `（退款单 ${transactionId}）` : ''}`,
        },
      });
      return row;
    });
    this.schedule.invalidate(order.staffId);
    // 分账冲销：按行按比例反冲已生效佣金；冲销失败只影响台账，钱已经退给顾客了
    try {
      await this.commission.reverse(
        order.id,
        lineWrites.map((item) => ({
          orderItemId: item.orderItemId,
          refundBaseCents: Math.max(0, item.amountCents - item.materialCents),
        })),
      );
    } catch {
      // 忽略：店主可在佣金台账里人工核对
    }
    await this.notify.refundDone(shop.shopId, order.id, refundCents);
    return this.toRow(await this.rowOf(refund.id), updated.orderNo);
  }

  /** 驳回退款：回到申请前的状态（快照在状态流水里，不靠人猜）。 */
  async reject(
    user: CurrentUser,
    shopId: string,
    input: { refundId: number; remark: string },
  ) {
    const shop = await this.shops.requireShop(user, shopId);
    const refund = await this.prisma.onsiteRefund.findFirst({
      where: { id: input.refundId, shopId: shop.shopId },
    });
    if (!refund)
      throw new BusinessException(ErrorCode.NOT_FOUND, '退款单不存在');
    if (refund.status !== 'PENDING') {
      throw new BusinessException(ErrorCode.CONFLICT, '该退款单已处理过');
    }
    const order = await this.prisma.onsiteOrder.findUnique({
      where: { id: refund.orderId },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    // 申请前的状态从状态流水倒查第一条 refundApply 的 fromStatus，比在退款单里冗余一列可靠
    const applied = await this.prisma.onsiteOrderStatusLog.findFirst({
      where: { orderId: order.id, action: 'refundApply' },
      orderBy: { createdAt: 'asc' },
    });
    const restoreTo = applied?.fromStatus || order.status;
    const next = transit({
      action: 'refundReject',
      status: order.status,
      payStatus: order.payStatus,
      refundStatus: order.refundStatus,
      role: 'OWNER',
      restoreTo,
    });
    await this.prisma.$transaction([
      this.prisma.onsiteRefund.update({
        where: { id: refund.id },
        data: {
          status: 'REJECTED',
          auditRemark: String(input.remark || '').slice(0, 300),
          auditedAt: new Date(),
        },
      }),
      this.prisma.onsiteOrder.update({
        where: { id: order.id },
        data: { status: next.status, refundStatus: next.refundStatus },
      }),
      this.prisma.onsiteOrderStatusLog.create({
        data: {
          orderId: order.id,
          shopId: shop.shopId,
          fromStatus: order.status,
          toStatus: next.status,
          operatorRole: 'OWNER',
          operatorId: user.userId,
          action: 'refundReject',
          content: `驳回退款：${String(input.remark || '').slice(0, 160)}`,
        },
      }),
    ]);
    await this.notify.refundRejected(shop.shopId, order.id, input.remark);
    return this.toRow(await this.rowOf(refund.id), order.orderNo);
  }

  /** 事务后回读退款单（状态与金额都以库里的终值为准，不拿内存里的旧对象）。 */
  private async rowOf(id: number) {
    const row = await this.prisma.onsiteRefund.findUnique({ where: { id } });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '退款单不存在');
    return row;
  }

  /** 顾客撤销退款申请（未处理前）。 */
  async cancel(shopId: number, customerId: number, refundId: number) {
    const refund = await this.prisma.onsiteRefund.findFirst({
      where: { id: refundId, shopId, customerId },
    });
    if (!refund)
      throw new BusinessException(ErrorCode.NOT_FOUND, '退款单不存在');
    if (refund.status !== 'PENDING') {
      throw new BusinessException(ErrorCode.CONFLICT, '退款已处理，无法撤销');
    }
    const order = await this.prisma.onsiteOrder.findUnique({
      where: { id: refund.orderId },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    const applied = await this.prisma.onsiteOrderStatusLog.findFirst({
      where: { orderId: order.id, action: 'refundApply' },
      orderBy: { createdAt: 'asc' },
    });
    const restoreTo = applied?.fromStatus || 'COMPLETED';
    await this.prisma.$transaction([
      this.prisma.onsiteRefund.update({
        where: { id: refund.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      }),
      this.prisma.onsiteOrder.update({
        where: { id: order.id },
        data: { status: restoreTo, refundStatus: 'NONE' },
      }),
      this.prisma.onsiteOrderStatusLog.create({
        data: {
          orderId: order.id,
          shopId,
          fromStatus: order.status,
          toStatus: restoreTo,
          operatorRole: 'CUSTOMER',
          operatorId: String(customerId),
          action: 'refundCancel',
          content: '顾客撤销退款申请',
        },
      }),
    ]);
    return { cancelled: true };
  }

  private async credentials(shopId: number): Promise<WechatCredentials | null> {
    const { resolveSiteUrl } = await import('../common/site-url');
    const siteUrl = await resolveSiteUrl(this.prisma);
    const runtime = await this.miniApp.payRuntime({
      ownerUserId: '',
      scene: 'ONSITE',
      shopId,
      shopName: '',
    });
    // 站点域名只决定回调地址，不决定能不能退款：域名没配的店主也必须能原路退款
    if (!runtime) return null;
    return {
      appId: runtime.appId,
      mchId: runtime.mchId,
      apiv3Key: runtime.apiV3Key,
      certSerial: runtime.certSerial,
      privateKey: runtime.privateKey,
      notifyUrl: siteUrl
        ? `${siteUrl}/api/public/onsite/pay/notify/${shopId}`
        : '',
      configured: true,
    };
  }
}
