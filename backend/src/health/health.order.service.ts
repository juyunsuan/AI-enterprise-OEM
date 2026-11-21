import { randomUUID } from 'node:crypto';
import {
  HEALTH_ORDER_BIZ_TYPES,
  type HealthDeliverBody,
  type HealthOrderActionBody,
  type HealthOrderDetail,
  type HealthOrderRow,
  type HealthOrderStats,
  type HealthOrderShareRow,
  type HealthShipmentRow,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { resolveSiteUrl } from '../common/site-url';
import type { SystemAssetService } from '../system-asset/system-asset.service';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { PrismaService } from '../prisma/prisma.service';
import type {
  WechatCredentials,
  WechatPayClient,
} from '../points/wechat-pay.client';
import type { HealthCareService } from './health.care.service';
import type { HealthClinicService } from './health.clinic.service';
import type { HealthMallService } from './health.mall.service';
import type { HealthMarketingService } from './health.marketing.service';
import { resolveTransition, settleableAtOf } from './health.order.rules';
import {
  audit,
  clip,
  intIn,
  jsonArr,
  makeNo,
  normalizeTrade,
  requireShop,
  requireShopWritable,
  strOf,
  toIso,
  yuan,
} from './health.shared';
import { orderRowsOf } from './health.views';

const CSV_BOM = String.fromCharCode(0xfeff);
const EXPORT_MAX_ROWS = 5000;

const numOf = (value: unknown): number => {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
};

const dateOf = (text: string, endOfDay = false): Date | null => {
  const value = String(text || '').trim();
  if (!value) return null;
  const parsed = new Date(
    value.length <= 10
      ? `${value}T${endOfDay ? '23:59:59' : '00:00:00'}`
      : value,
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

function csvRow(cells: string[]): string {
  return cells
    .map((cell) => {
      const value = String(cell ?? '');
      return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    })
    .join(',');
}

const safeFileName = (name: string): string => name.replace(/[^\w.-]+/g, '_');

/**
 * 统一订单（C9 商品 / C11 交易与资金）的店主侧实现。
 *
 * 口径：
 * 1. 状态推进全部走 `health.order.rules.ts`，非法转换直接拒绝；
 * 2. 退款按「实付 − 已退」封顶，商品退款回补库存、按交易参数决定是否回补号源，
 *    分账行按退款比例生成负数冲销行（原行保留，便于对账）；
 * 3. 微信退款走店铺自有商户号；未配商户号时按线下退款记账，不阻断流程。
 */
export class HealthOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: SystemAssetService,
    private readonly miniApp: MiniAppService,
    private readonly wechatPay: WechatPayClient,
    private readonly mall: HealthMallService,
    private readonly clinic: HealthClinicService,
    private readonly care: HealthCareService,
    private readonly marketing: HealthMarketingService,
  ) {}

  private pager(query: Record<string, unknown>) {
    const page = intIn(query.page, 1, 10_000, 1);
    const pageSize = intIn(query.pageSize, 1, 200, 20);
    return { page, pageSize, skip: (page - 1) * pageSize };
  }

  private async whereOf(shopId: number, query: Record<string, unknown>) {
    const bizType = strOf(query.bizType, 24, 'all');
    const status = strOf(query.status, 24, 'all');
    const payStatus = strOf(query.payStatus, 24, 'all');
    const practitionerId = intIn(query.practitionerId, 0, 1_000_000_000, 0);
    const organId = intIn(query.organId, 0, 1_000_000_000, 0);
    const patientId = intIn(query.patientId, 0, 1_000_000_000, 0);
    const keyword = clip(query.keyword, 60);
    const from = dateOf(strOf(query.from, 32));
    const to = dateOf(strOf(query.to, 32), true);
    const where: Record<string, unknown> = { shopId };
    if (bizType && bizType !== 'all') where.orderType = bizType;
    if (status && status !== 'all') where.status = status;
    if (payStatus && payStatus !== 'all') where.payStatus = payStatus;
    if (patientId > 0) where.patientIdsJson = { array_contains: patientId };
    if (practitionerId > 0) {
      const items = await this.prisma.healthOrderItem.findMany({
        where: { shopId, practitionerId },
        select: { orderId: true },
        distinct: ['orderId'],
      });
      where.id = { in: items.map((item) => item.orderId) };
    }
    if (organId > 0) {
      const practitioners = await this.prisma.healthPractitioner.findMany({
        where: { shopId, organId },
        select: { id: true },
      });
      const items = practitioners.length
        ? await this.prisma.healthOrderItem.findMany({
            where: {
              shopId,
              practitionerId: { in: practitioners.map((row) => row.id) },
            },
            select: { orderId: true },
            distinct: ['orderId'],
          })
        : [];
      where.id = { in: items.map((item) => item.orderId) };
    }
    if (keyword) {
      const customers = await this.prisma.healthCustomer.findMany({
        where: {
          shopId,
          OR: [
            { nickname: { contains: keyword } },
            { phone: { contains: keyword } },
          ],
        },
        select: { id: true },
      });
      where.OR = [
        { orderNo: { contains: keyword } },
        ...(customers.length
          ? [{ customerId: { in: customers.map((row) => row.id) } }]
          : []),
      ];
    }
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }
    return where;
  }

  async orders(user: CurrentUser, query: Record<string, unknown>) {
    const { page, pageSize, skip } = this.pager(query);
    const ctx = await requireShop(this.prisma, user, query.shopId, 'orders');
    const where = await this.whereOf(ctx.shop.id, query);
    const [rows, total] = await Promise.all([
      this.prisma.healthOrder.findMany({
        where: where as never,
        orderBy: { id: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.healthOrder.count({ where: where as never }),
    ]);
    return {
      list: await orderRowsOf(this.prisma, ctx.shop.id, rows),
      total,
      page,
      pageSize,
    };
  }

  async detail(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthOrderDetail> {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'orders');
    const id = intIn(query.id, 1, 1_000_000_000, 0);
    const order = await this.prisma.healthOrder.findFirst({
      where: { id, shopId: ctx.shop.id },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    const [row] = await orderRowsOf(this.prisma, ctx.shop.id, [order]);
    const [
      items,
      priceFlows,
      statusLogs,
      shipments,
      aftersales,
      shares,
      consult,
      prescription,
    ] = await Promise.all([
      this.prisma.healthOrderItem.findMany({
        where: { shopId: ctx.shop.id, orderId: id },
        orderBy: { id: 'asc' },
      }),
      this.prisma.healthOrderPriceFlow.findMany({
        where: { shopId: ctx.shop.id, orderId: id },
        orderBy: { id: 'asc' },
      }),
      this.prisma.healthOrderStatusLog.findMany({
        where: { shopId: ctx.shop.id, orderId: id },
        orderBy: { id: 'asc' },
      }),
      this.prisma.healthOrderShipment.findMany({
        where: { shopId: ctx.shop.id, orderId: id },
        orderBy: { id: 'asc' },
      }),
      this.mall.aftersaleRows(
        ctx.shop.id,
        await this.prisma.healthAftersale.findMany({
          where: { shopId: ctx.shop.id, orderId: id },
          orderBy: { id: 'desc' },
        }),
      ),
      this.prisma.healthOrderShare.findMany({
        where: { shopId: ctx.shop.id, orderId: id },
        orderBy: { id: 'asc' },
      }),
      order.consultId > 0
        ? this.clinic.consultById(ctx.shop.id, order.consultId)
        : null,
      order.prescriptionId > 0
        ? this.care.prescriptionById(ctx.shop.id, order.prescriptionId)
        : null,
    ]);
    // shares 这份查询结果没被用到：返回体里的 shares 走的是下面 shareRows（带权益展开）。
    // 保持 Promise.all 的位置不动，只是明确说明它不是漏用。
    void shares;
    return {
      order: row,
      items: items.map((item) => ({
        id: item.id,
        productId: item.refId,
        productName: item.name,
        skuName: item.specText,
        cover: item.coverImage,
        quantity: item.quantity,
        unitPriceCents: item.priceCents,
        amountCents: item.amountCents,
        refType: item.itemType,
        refId: item.refId,
        refLabel: item.patientId > 0 ? `就诊人 ${item.patientId}` : '',
      })),
      priceFlows: priceFlows.map((flow) => ({
        step: flow.step,
        label: flow.label,
        amountCents: flow.amountCents,
        refLabel: flow.refLabel,
        createdAt: toIso(flow.createdAt),
      })),
      statusLogs: statusLogs.map((log) => ({
        from: log.fromStatus,
        to: log.toStatus,
        note: log.note,
        operator: log.operatorName,
        createdAt: toIso(log.createdAt),
      })),
      shipments: shipments.map((shipment) =>
        this.shipmentRow(order.orderNo, shipment),
      ),
      aftersales,
      shares: await this.shareRows(ctx.shop.id, [order]),
      consult,
      prescription,
      review: null,
    };
  }

  private shipmentRow(
    orderNo: string,
    row: {
      id: number;
      orderId: number;
      expressName: string;
      trackingNo: string;
      itemsJson: unknown;
      tracesJson: unknown;
      shippedAt: Date | null;
      receivedAt: Date | null;
    },
  ): HealthShipmentRow {
    return {
      id: row.id,
      orderId: row.orderId,
      orderNo,
      expressCompanyName: row.expressName,
      expressCode: '',
      trackingNo: row.trackingNo,
      items: jsonArr<{ name?: string; quantity?: number }>(row.itemsJson).map(
        (item) => ({
          name: String(item.name ?? ''),
          quantity: numOf(item.quantity),
        }),
      ),
      remark: '',
      shippedAt: toIso(row.shippedAt),
      receivedAt: toIso(row.receivedAt),
      traces: [],
      traceMessage: row.trackingNo ? '' : '未填写运单号',
    };
  }

  private async shareRows(
    shopId: number,
    orders: { id: number; orderNo: string; payAmountCents: number }[],
  ): Promise<HealthOrderShareRow[]> {
    if (!orders.length) return [];
    const rows = await this.prisma.healthOrderShare.findMany({
      where: { shopId, orderId: { in: orders.map((order) => order.id) } },
      orderBy: { id: 'asc' },
    });
    const orderMap = new Map(orders.map((order) => [order.id, order]));
    const names = await this.earnerNames(shopId, rows);
    return rows.map((row) => {
      const reversed = row.status === 'REVERSED' || row.shareCents < 0;
      return {
        id: row.id,
        orderId: row.orderId,
        orderNo: orderMap.get(row.orderId)?.orderNo ?? '',
        earnerKind: row.earnerKind as HealthOrderShareRow['earnerKind'],
        earnerId: row.earnerId,
        earnerName:
          names.get(`${row.earnerKind}:${row.earnerId}`) ?? row.earnerName,
        percent: row.ratePercent,
        baseCents: row.baseCents,
        shareCents: Math.abs(row.shareCents),
        deductedCents: reversed ? Math.abs(row.shareCents) : 0,
        actualCents: reversed ? 0 : row.shareCents,
        settleableAt: toIso(row.settleableAt),
        settled: Boolean(row.settleableAt && row.settleableAt <= new Date()),
      };
    });
  }

  private async earnerNames(
    shopId: number,
    rows: { earnerKind: string; earnerId: number }[],
  ): Promise<Map<string, string>> {
    const practitionerIds = [
      ...new Set(
        rows
          .filter((row) => row.earnerKind === 'PRACTITIONER')
          .map((row) => row.earnerId),
      ),
    ];
    const organIds = [
      ...new Set(
        rows
          .filter((row) => row.earnerKind === 'ORGAN')
          .map((row) => row.earnerId),
      ),
    ];
    const promoterIds = [
      ...new Set(
        rows
          .filter((row) => row.earnerKind === 'PROMOTER')
          .map((row) => row.earnerId),
      ),
    ];
    const teamIds = [
      ...new Set(
        rows
          .filter((row) => row.earnerKind === 'TEAM')
          .map((row) => row.earnerId),
      ),
    ];
    const [practitioners, organs, promoters, teams] = await Promise.all([
      practitionerIds.length
        ? this.prisma.healthPractitioner.findMany({
            where: { shopId, id: { in: practitionerIds } },
            select: { id: true, name: true },
          })
        : [],
      organIds.length
        ? this.prisma.healthOrgan.findMany({
            where: { shopId, id: { in: organIds } },
            select: { id: true, name: true },
          })
        : [],
      promoterIds.length
        ? this.prisma.healthPromoter.findMany({
            where: { shopId, id: { in: promoterIds } },
            select: { id: true, name: true },
          })
        : [],
      teamIds.length
        ? this.prisma.healthTeam.findMany({
            where: { shopId, id: { in: teamIds } },
            select: { id: true, name: true },
          })
        : [],
    ]);
    const out = new Map<string, string>();
    for (const row of practitioners)
      out.set(`PRACTITIONER:${row.id}`, row.name);
    for (const row of organs) out.set(`ORGAN:${row.id}`, row.name);
    for (const row of promoters) out.set(`PROMOTER:${row.id}`, row.name);
    for (const row of teams) out.set(`TEAM:${row.id}`, row.name);
    return out;
  }

  async action(
    user: CurrentUser,
    body: HealthOrderActionBody,
  ): Promise<HealthOrderRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'orders');
    await requireShopWritable(ctx);
    const order = await this.prisma.healthOrder.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    const action = body.action;
    if (action === 'VERIFY') {
      const code = await this.prisma.healthVerifyCode.findFirst({
        where: { shopId: ctx.shop.id, orderId: order.id, status: 'UNUSED' },
      });
      if (!code)
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '该订单没有可用的核销码',
        );
      const result = await this.marketing.verify(user, {
        shopId: ctx.shop.id,
        code: code.code,
        practitionerId: body.practitionerId,
      });
      if (!result.ok)
        throw new BusinessException(ErrorCode.CONFLICT, result.message);
      return result.order as HealthOrderRow;
    }
    if (action === 'REMARK') {
      const updated = await this.prisma.healthOrder.update({
        where: { id: order.id },
        data: { auditNote: body.note },
      });
      await audit(
        this.prisma,
        user.userId,
        'health.order.remark',
        `shop=${ctx.shop.id} order=${order.id}`,
      );
      const [mapped] = await orderRowsOf(this.prisma, ctx.shop.id, [updated]);
      return mapped;
    }
    if (action === 'ASSIGN' && body.practitionerId <= 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '派单需要选择接单医护',
      );
    }
    const target = resolveTransition(
      action,
      order.status as never,
      order.orderType,
    );
    const now = new Date();
    const trade = normalizeTrade(ctx.shop.tradeJson);
    const data: Record<string, unknown> = { status: target };
    if (action === 'COMPLETE') data.finishedAt = now;

    if (action === 'REFUND_APPROVE') {
      await this.withRefund(user, order, body, data, trade.canTxHours);
    } else if (action === 'CANCEL' && order.status === 'PENDING_PAYMENT') {
      data.closedAt = now;
      data.cancelReason = body.note || '店主取消';
      await this.restoreGoodsStock(ctx.shop.id, order.id);
      if (trade.refundReleaseSlot)
        await this.releaseSlot(ctx.shop.id, order.slotId);
    } else if (action === 'ASSIGN') {
      await this.prisma.healthOrderItem.updateMany({
        where: { shopId: ctx.shop.id, orderId: order.id, practitionerId: 0 },
        data: { practitionerId: body.practitionerId },
      });
      data.auditNote = body.note || order.auditNote;
    }

    const updated = await this.prisma.healthOrder.update({
      where: { id: order.id },
      data: data as never,
    });
    await this.prisma.healthOrderStatusLog.create({
      data: {
        shopId: ctx.shop.id,
        orderId: order.id,
        fromStatus: order.status,
        toStatus: String(data.status),
        action,
        operatorType: 'STAFF',
        operatorName: user.username ?? String(user.userId),
        note: body.note,
      },
    });
    if (action === 'COMPLETE' && body.note === '' && order.auditNote) {
      // 完成时保留原备注，不改写
    }
    if (action === 'COMPLETE') {
      await this.prisma.healthOrderShare.updateMany({
        where: { shopId: ctx.shop.id, orderId: order.id, status: 'SETTLED' },
        data: { settleableAt: settleableAtOf(now, trade.canTxHours) },
      });
    }
    await audit(
      this.prisma,
      user.userId,
      `health.order.${action.toLowerCase()}`,
      `shop=${ctx.shop.id} order=${order.id} ${order.status}->${String(data.status)}`,
    );
    const [mapped] = await orderRowsOf(this.prisma, ctx.shop.id, [updated]);
    return mapped;
  }

  /**
   * 商品订单发货：先落发货单（一单多包裹），再把订单推进到 DELIVERED。
   *
   * 运单号必填；快递公司可从本店维护的公司里选，也可直接填名称。
   * 状态校验仍走 `resolveTransition`，非商品或状态不符直接拒绝。
   */
  async deliver(
    user: CurrentUser,
    body: HealthDeliverBody,
  ): Promise<HealthOrderRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'orders');
    await requireShopWritable(ctx);
    const order = await this.prisma.healthOrder.findFirst({
      where: { id: body.orderId, shopId: ctx.shop.id },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    const target = resolveTransition(
      'SHIP',
      order.status as never,
      order.orderType,
    );
    const trackingNo = body.trackingNo.trim();
    if (!trackingNo)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写运单号');
    const company =
      body.expressCompanyId > 0
        ? await this.prisma.healthExpressCompany.findFirst({
            where: { id: body.expressCompanyId, shopId: ctx.shop.id },
          })
        : null;
    const expressName = company?.name || body.expressCompanyName.trim();
    if (!expressName)
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请选择或填写快递公司',
      );

    const items = await this.prisma.healthOrderItem.findMany({
      where: { shopId: ctx.shop.id, orderId: order.id },
      orderBy: { id: 'asc' },
    });
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.healthOrderShipment.create({
        data: {
          shopId: ctx.shop.id,
          orderId: order.id,
          expressCompanyId: body.expressCompanyId,
          expressName,
          trackingNo,
          itemsJson: items.map((item) => ({
            name: item.specText
              ? `${item.name}（${item.specText}）`
              : item.name,
            quantity: item.quantity,
          })) as never,
          shippedAt: now,
          status: 'SHIPPED',
        },
      }),
      this.prisma.healthOrder.update({
        where: { id: order.id },
        data: { status: target },
      }),
      this.prisma.healthOrderStatusLog.create({
        data: {
          shopId: ctx.shop.id,
          orderId: order.id,
          fromStatus: order.status,
          toStatus: target,
          action: 'SHIP',
          operatorType: 'STAFF',
          operatorName: user.username ?? String(user.userId),
          note: `${expressName} ${trackingNo}${body.remark ? ` ${body.remark}` : ''}`,
        },
      }),
    ]);
    await audit(
      this.prisma,
      user.userId,
      'health.order.deliver',
      `shop=${ctx.shop.id} order=${order.id} ${order.status}->${target} tracking=${trackingNo}`,
    );
    const fresh = await this.prisma.healthOrder.findFirst({
      where: { id: order.id },
    });
    const [updated] = await orderRowsOf(
      this.prisma,
      ctx.shop.id,
      fresh ? [fresh] : [],
    );
    return updated;
  }

  /** 退款审批：微信退款（配了商户号）或线下记账，随后回补库存/号源并冲销分账。 */
  private async withRefund(
    user: CurrentUser,
    order: {
      id: number;
      orderNo: string;
      shopId: number;
      status: string;
      payWay: string;
      payStatus: string;
      payAmountCents: number;
      refundAmountCents: number;
      slotId: number;
    },
    body: HealthOrderActionBody,
    data: Record<string, unknown>,
    canTxHours: number,
  ): Promise<void> {
    const refundable = Math.max(
      0,
      order.payAmountCents - order.refundAmountCents,
    );
    const refundCents =
      body.refundAmountCents > 0 ? body.refundAmountCents : refundable;
    if (refundCents <= 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '该订单没有可退金额');
    }
    if (refundCents > refundable) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `退款金额不能超过可退金额 ${(refundable / 100).toFixed(2)} 元`,
      );
    }
    const now = new Date();
    const refundNo = order.orderNo.startsWith('RF')
      ? order.orderNo
      : makeNo('RF');
    let channel = 'MANUAL';
    if (order.payWay === 'WECHAT' && order.payStatus === 'PAID') {
      const credentials = await this.payCredentials(order.shopId);
      if (credentials) {
        await this.wechatPay.refund(credentials, {
          outTradeNo: order.orderNo,
          outRefundNo: refundNo,
          reason: body.note || '订单退款',
          totalCents: order.payAmountCents,
          refundCents,
        });
        channel = 'WECHAT';
      }
    }
    const totalRefund = order.refundAmountCents + refundCents;
    data.refundAmountCents = totalRefund;
    data.refundNo = refundNo;
    data.refundedAt = now;
    data.payStatus = totalRefund >= order.payAmountCents ? 'REFUNDED' : 'PAID';
    if (body.note) data.auditNote = body.note;

    await this.restoreGoodsStock(order.shopId, order.id);
    const trade = normalizeTrade(
      (
        await this.prisma.healthShop.findUnique({
          where: { id: order.shopId },
          select: { tradeJson: true },
        })
      )?.tradeJson,
    );
    if (trade.refundReleaseSlot)
      await this.releaseSlot(order.shopId, order.slotId);

    const shares = await this.prisma.healthOrderShare.findMany({
      where: { shopId: order.shopId, orderId: order.id, status: 'SETTLED' },
    });
    for (const share of shares) {
      const reversed = Math.min(
        share.shareCents,
        Math.round(
          (share.shareCents * refundCents) / Math.max(1, order.payAmountCents),
        ),
      );
      if (reversed <= 0) continue;
      await this.prisma.healthOrderShare.create({
        data: {
          shopId: order.shopId,
          orderId: order.id,
          earnerKind: share.earnerKind,
          earnerId: share.earnerId,
          earnerName: share.earnerName,
          baseCents: -reversed,
          ratePercent: share.ratePercent,
          shareCents: -reversed,
          status: 'REVERSED',
          settleableAt: share.settleableAt,
          relatedShareId: share.id,
          note: `退款 ${refundNo} 冲销`,
        },
      });
    }
    // 钱包支付的退款回充余额
    if (order.payWay === 'WALLET') {
      const full = await this.prisma.healthOrder.findUnique({
        where: { id: order.id },
      });
      const customer = full
        ? await this.prisma.healthCustomer.findFirst({
            where: { id: full.customerId, shopId: order.shopId },
          })
        : null;
      if (customer) {
        const balance =
          Math.round(numOf(customer.walletAmount) * 100) + refundCents;
        await this.prisma.$transaction([
          this.prisma.healthCustomer.update({
            where: { id: customer.id },
            data: { walletAmount: yuan(balance) },
          }),
          this.prisma.healthWalletLog.create({
            data: {
              shopId: order.shopId,
              customerId: customer.id,
              kind: 'REFUND',
              amountCents: refundCents,
              balanceCents: balance,
              orderId: order.id,
              note: `订单退款 ${refundNo}`,
            },
          }),
        ]);
      }
    }
    await audit(
      this.prisma,
      user.userId,
      'health.order.refund',
      `shop=${order.shopId} order=${order.id} amount=${refundCents} channel=${channel} settleable=${canTxHours}h`,
    );
  }

  private async payCredentials(
    shopId: number,
  ): Promise<WechatCredentials | null> {
    const siteUrl = await resolveSiteUrl(this.prisma);
    const shop = await this.prisma.healthShop.findUnique({
      where: { id: shopId },
      select: { ownerUserId: true, name: true },
    });
    // 站点域名只决定回调地址：缺域名时若返回 null，退款会掉进「手工退」分支——
    // 账上写成已退、顾客那边钱没动，是最难查的一种分叉
    if (!shop) return null;
    const runtime = await this.miniApp.payRuntime({
      ownerUserId: shop.ownerUserId,
      scene: 'HEALTH',
      shopId,
      shopName: shop.name,
    });
    if (!runtime) return null;
    return {
      appId: runtime.appId,
      mchId: runtime.mchId,
      apiv3Key: runtime.apiV3Key,
      certSerial: runtime.certSerial,
      privateKey: runtime.privateKey,
      notifyUrl: siteUrl
        ? `${siteUrl}/api/public/health/pay/notify/${shopId}`
        : '',
      configured: true,
    };
  }

  private async restoreGoodsStock(
    shopId: number,
    orderId: number,
  ): Promise<void> {
    const items = await this.prisma.healthOrderItem.findMany({
      where: { shopId, orderId, itemType: 'GOODS' },
    });
    for (const item of items) {
      if (item.refId <= 0) continue;
      await this.prisma.healthGoods.updateMany({
        where: { id: item.refId, shopId },
        data: { stock: { increment: item.quantity } },
      });
    }
  }

  private async releaseSlot(shopId: number, slotId: number): Promise<void> {
    if (slotId <= 0) return;
    await this.prisma.healthSlot.updateMany({
      where: { id: slotId, shopId, occupied: { gt: 0 } },
      data: { occupied: { decrement: 1 } },
    });
  }

  async orderStats(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthOrderStats> {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'orders');
    const days = intIn(query.days, 1, 365, 30);
    const shopId = ctx.shop.id;
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const trendStart = new Date(todayStart.getTime() - (days - 1) * 86_400_000);
    const [
      totalCount,
      pendingPayCount,
      servingCount,
      pendingShipCount,
      aftersaleCount,
      todayCount,
      todayPaid,
      monthPaid,
      refunds,
      byBizType,
      trendOrders,
      pendingAftersales,
    ] = await Promise.all([
      this.prisma.healthOrder.count({ where: { shopId } }),
      this.prisma.healthOrder.count({
        where: { shopId, status: 'PENDING_PAYMENT' },
      }),
      this.prisma.healthOrder.count({
        where: { shopId, status: { in: ['ACCEPTED', 'ASSIGNED', 'SERVING'] } },
      }),
      this.prisma.healthOrder.count({
        where: {
          shopId,
          orderType: 'GOODS',
          status: { in: ['PAID', 'ACCEPTED'] },
        },
      }),
      this.prisma.healthAftersale.count({
        where: { shopId, status: { in: ['PENDING', 'APPROVED', 'RETURNING'] } },
      }),
      this.prisma.healthOrder.count({
        where: { shopId, createdAt: { gte: todayStart } },
      }),
      this.prisma.healthOrder.aggregate({
        where: { shopId, paidAt: { gte: todayStart }, payStatus: 'PAID' },
        _sum: { payAmountCents: true },
      }),
      this.prisma.healthOrder.aggregate({
        where: { shopId, paidAt: { gte: monthStart }, payStatus: 'PAID' },
        _sum: { payAmountCents: true },
      }),
      this.prisma.healthOrder.aggregate({
        where: { shopId, refundedAt: { not: null } },
        _sum: { refundAmountCents: true },
      }),
      this.prisma.healthOrder.groupBy({
        by: ['orderType'],
        where: { shopId },
        _count: { _all: true },
        _sum: { payAmountCents: true },
      }),
      this.prisma.healthOrder.findMany({
        where: { shopId, createdAt: { gte: trendStart } },
        select: { createdAt: true, payAmountCents: true, payStatus: true },
      }),
      this.prisma.healthAftersale.count({
        where: { shopId, status: 'PENDING' },
      }),
    ]);
    const bizMap = new Map(
      byBizType.map((row) => [
        row.orderType,
        { count: row._count._all, payCents: numOf(row._sum.payAmountCents) },
      ]),
    );
    const trendMap = new Map<string, { count: number; payCents: number }>();
    for (let offset = 0; offset < days; offset += 1) {
      const day = new Date(trendStart.getTime() + offset * 86_400_000);
      trendMap.set(day.toISOString().slice(0, 10), { count: 0, payCents: 0 });
    }
    for (const order of trendOrders) {
      const key = order.createdAt.toISOString().slice(0, 10);
      const bucket = trendMap.get(key);
      if (!bucket) continue;
      bucket.count += 1;
      if (order.payStatus === 'PAID') bucket.payCents += order.payAmountCents;
    }
    return {
      totalCount,
      pendingPayCount,
      servingCount,
      pendingShipCount,
      aftersaleCount: aftersaleCount + pendingAftersales,
      todayCount,
      todayPayCents: numOf(todayPaid._sum.payAmountCents),
      monthPayCents: numOf(monthPaid._sum.payAmountCents),
      refundCents: numOf(refunds._sum.refundAmountCents),
      byBizType: HEALTH_ORDER_BIZ_TYPES.map((bizType) => ({
        bizType,
        count: bizMap.get(bizType)?.count ?? 0,
        payCents: bizMap.get(bizType)?.payCents ?? 0,
      })),
      trend: [...trendMap.entries()].map(([day, bucket]) => ({
        day,
        ...bucket,
      })),
    };
  }

  async orderExport(user: CurrentUser, query: Record<string, unknown>) {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'orders');
    const where = await this.whereOf(ctx.shop.id, query);
    const rows = await this.prisma.healthOrder.findMany({
      where: where as never,
      orderBy: { id: 'desc' },
      take: EXPORT_MAX_ROWS + 1,
    });
    const limited =
      rows.length > EXPORT_MAX_ROWS ? rows.slice(0, EXPORT_MAX_ROWS) : rows;
    const mapped = await orderRowsOf(this.prisma, ctx.shop.id, limited);
    const header = [
      '订单号',
      '业务类型',
      '状态',
      '顾客',
      '手机号(脱敏)',
      '就诊人',
      '医护',
      '商品金额(元)',
      '优惠(元)',
      '运费(元)',
      '实付(元)',
      '退款(元)',
      '支付方式',
      '支付时间',
      '下单时间',
    ];
    const lines = mapped.map((row) => [
      row.orderNo,
      row.bizTypeLabel,
      row.status,
      row.customerName,
      row.customerPhoneMasked,
      row.patientName,
      row.practitionerName,
      yuan(row.goodsAmountCents + row.serviceAmountCents),
      yuan(row.discountCents),
      yuan(row.shippingCents),
      yuan(row.payAmountCents),
      yuan(row.refundAmountCents),
      row.payType,
      row.paidAt ? row.paidAt.slice(0, 19).replace('T', ' ') : '',
      row.createdAt.slice(0, 19).replace('T', ' '),
    ]);
    const csv = CSV_BOM + [header, ...lines].map(csvRow).join('\r\n');
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const fileName = `health-orders-${ctx.shop.id}-${stamp}-${mapped.length}.csv`;
    // 导出件入账到店主名下：订单 CSV 计入店铺存储用量与费用
    const uploaded = await this.assets.put({
      ownerUserId: ctx.shop.ownerUserId,
      path: `health/export/${ctx.shop.id}/${randomUUID()}/${safeFileName(fileName)}`,
      bytes: Buffer.from(csv, 'utf8'),
      name: fileName,
      bizRef: `health-shop:${ctx.shop.id}`,
    });
    await audit(
      this.prisma,
      user.userId,
      'health.order.export',
      `shop=${ctx.shop.id} count=${mapped.length}`,
    );
    return {
      url: this.assets.urlOf(uploaded.key),
      fileName,
      count: mapped.length,
      message:
        rows.length > EXPORT_MAX_ROWS
          ? `单次最多导出 ${EXPORT_MAX_ROWS} 条订单，本次已截断，请缩小筛选范围`
          : `已导出 ${mapped.length} 条订单（手机号已脱敏）`,
    };
  }
}
