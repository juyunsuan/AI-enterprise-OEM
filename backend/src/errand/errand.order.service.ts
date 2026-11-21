import {
  type ErrandOrder,
  type ErrandOrderActionBody,
  type ErrandOrderDetail,
  type ErrandOrderEvent,
  type ErrandOrderListQuery,
  type ErrandPublicOrder,
  type ErrandPublicOrderCreateBody,
  type ErrandPublicOrderCreated,
  type ErrandQuoteInput,
  type ErrandQuoteResult,
  type ErrandRiderActionBody,
  type ErrandRule,
} from '@enterprise/contracts';
import { pageOf, type PageResponse } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma';
import type {
  ErrandCustomerIdentity,
  ErrandCustomerService,
} from './errand.customer.service';
import type { ErrandPayService, ErrandPayNotify } from './errand.pay.service';
import type { ErrandMapService } from './errand.map.service';
import type { ErrandNotifyService } from './errand.notify.service';
import type { ErrandAgentService } from './errand.agent.service';
import type { ErrandRiderService } from './errand.rider.service';
import type { ErrandSiteService } from './errand.site.service';
import type { ErrandWalletService } from './errand.wallet.service';
import {
  amount,
  clip,
  dayRange,
  errandOrderNo,
  fromCents,
  iso,
  jsonInput,
  jsonList,
  orderState,
  pageArgs,
  partyOf,
  payState,
  quoteOrder,
  riderIncomeOf,
  toCents,
} from './errand.shared';

type OrderRow = {
  id: number;
  siteId: number;
  cityId: number;
  cityName: string;
  ownerUserId: string;
  orderNo: string;
  serviceType: string;
  status: string;
  payState: string;
  payMode: string;
  fromParty: unknown;
  toParty: unknown;
  goodsDesc: string;
  goodsAmount: unknown;
  weightKg: unknown;
  distanceKm: unknown;
  baseFee: unknown;
  distanceFee: unknown;
  weightFee: unknown;
  timeFee: unknown;
  goodsFee: unknown;
  tip: unknown;
  couponId: number;
  couponDiscount: unknown;
  pointsUsed: number;
  pointsDiscount: unknown;
  pointsEarned: number;
  totalAmount: unknown;
  riderIncomeAmount: unknown;
  agentId: number;
  agentIncomeAmount: unknown;
  purchaseAmount: unknown;
  purchaseReceipt: string;
  purchaseNote: string;
  changeAmount: unknown;
  extraAmount: unknown;
  extraPaidAt: Date | null;
  rating: number;
  ratingComment: string;
  ratedAt: Date | null;
  riderId: number;
  riderNo: string;
  riderName: string;
  customerId: number;
  openid: string;
  contactName: string;
  contactMobile: string;
  remark: string;
  photos: unknown;
  cancelReason: string;
  transactionId: string;
  prepayId: string;
  expireAt: Date | null;
  paidAt: Date | null;
  acceptedAt: Date | null;
  pickedAt: Date | null;
  deliveredAt: Date | null;
  completedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type EventRow = {
  id: number;
  status: string;
  note: string;
  operator: string;
  createdAt: Date;
};

/** 每个动作允许的前置状态；金额与最终状态都由服务端裁决，端上只说「做了什么」。 */
const ACTION_FROM: Record<string, readonly string[]> = {
  MARK_PAID: ['PENDING_PAY'],
  ASSIGN: ['PENDING_ACCEPT', 'ACCEPTED'],
  ACCEPT: ['PENDING_ACCEPT'],
  PICKUP: ['ACCEPTED'],
  DELIVER: ['PICKED_UP'],
  ARRIVE: ['DELIVERING'],
  COMPLETE: ['ARRIVED'],
  EXCEPTION: [
    'PENDING_ACCEPT',
    'ACCEPTED',
    'PICKED_UP',
    'DELIVERING',
    'ARRIVED',
  ],
  CANCEL: ['PENDING_PAY', 'PENDING_ACCEPT', 'ACCEPTED'],
  SETTLE_BUY: ['PICKED_UP', 'DELIVERING', 'ARRIVED'],
  REFUND: [
    'PENDING_PAY',
    'PENDING_ACCEPT',
    'ACCEPTED',
    'PICKED_UP',
    'DELIVERING',
    'ARRIVED',
    'COMPLETED',
    'EXCEPTION',
  ],
};

const ACTION_TO: Record<string, string> = {
  MARK_PAID: 'PENDING_ACCEPT',
  ASSIGN: 'ACCEPTED',
  ACCEPT: 'ACCEPTED',
  PICKUP: 'PICKED_UP',
  DELIVER: 'DELIVERING',
  ARRIVE: 'ARRIVED',
  COMPLETE: 'COMPLETED',
  EXCEPTION: 'EXCEPTION',
  CANCEL: 'CANCELLED',
  REFUND: 'CANCELLED',
};

const ACTION_NOTE: Record<string, string> = {
  MARK_PAID: '店主登记已收款',
  ASSIGN: '店主指派骑手',
  ACCEPT: '骑手接单',
  PICKUP: '骑手已取件',
  DELIVER: '骑手开始配送',
  ARRIVE: '骑手已送达',
  COMPLETE: '订单完成',
  EXCEPTION: '订单异常',
  CANCEL: '订单取消',
  REFUND: '订单退款',
};

const PAY_MINUTES = 30;

function eventView(row: EventRow): ErrandOrderEvent {
  return {
    id: row.id,
    status: row.status,
    note: row.note,
    operator: row.operator,
    createdAt: iso(row.createdAt),
  };
}

/**
 * 跑腿订单：报价、下单、支付、履约状态机与超时关单。
 *
 * 三条硬口径：
 * 1. 金额只由 `quoteOrder` 算，端上传的距离/重量是输入，任何金额字段都不采信；
 * 2. 支付成功后资金直接进店主的微信商户号，平台只改订单状态，不记账、不代扣、不代退；
 * 3. 履约只允许按 ACTION_FROM 的状态机前进，每步追加一条轨迹，不覆盖历史。
 */
export class ErrandOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: ErrandSiteService,
    private readonly customers: ErrandCustomerService,
    private readonly riders: ErrandRiderService,
    private readonly pay: ErrandPayService,
    private readonly wallet: ErrandWalletService,
    private readonly map: ErrandMapService,
    private readonly notify: ErrandNotifyService,
    private readonly agents: ErrandAgentService,
  ) {}

  toOrder(row: OrderRow): ErrandOrder {
    return {
      id: row.id,
      orderNo: row.orderNo,
      cityId: row.cityId,
      cityName: row.cityName,
      serviceType: row.serviceType === 'BUY' ? 'BUY' : 'SEND',
      status: orderState(row.status),
      payState: payState(row.payState),
      payMode: row.payMode === 'ONLINE' ? 'ONLINE' : 'OFFLINE',
      fromParty: partyOf(row.fromParty),
      toParty: partyOf(row.toParty),
      goodsDesc: row.goodsDesc,
      goodsAmount: amount(row.goodsAmount),
      weightKg: Number(row.weightKg) || 0,
      distanceKm: Number(row.distanceKm) || 0,
      baseFee: amount(row.baseFee),
      distanceFee: amount(row.distanceFee),
      weightFee: amount(row.weightFee),
      timeFee: amount(row.timeFee),
      goodsFee: amount(row.goodsFee),
      tip: amount(row.tip),
      couponId: row.couponId,
      couponDiscount: amount(row.couponDiscount),
      pointsUsed: row.pointsUsed,
      pointsDiscount: amount(row.pointsDiscount),
      pointsEarned: row.pointsEarned,
      totalAmount: amount(row.totalAmount),
      riderIncomeAmount: amount(row.riderIncomeAmount),
      agentId: row.agentId,
      agentIncomeAmount: amount(row.agentIncomeAmount),
      purchaseAmount: amount(row.purchaseAmount),
      purchaseReceipt: row.purchaseReceipt,
      purchaseNote: row.purchaseNote,
      changeAmount: amount(row.changeAmount),
      extraAmount: amount(row.extraAmount),
      extraPaidAt: iso(row.extraPaidAt),
      rating: Number(row.rating) || 0,
      ratingComment: row.ratingComment,
      ratedAt: iso(row.ratedAt),
      riderId: row.riderId,
      riderNo: row.riderNo,
      riderName: row.riderName,
      customerId: row.customerId,
      contactName: row.contactName,
      contactMobile: row.contactMobile,
      remark: row.remark,
      photos: jsonList<string>(row.photos).map((item) => clip(item, 500)),
      cancelReason: row.cancelReason,
      expireAt: iso(row.expireAt),
      paidAt: iso(row.paidAt),
      acceptedAt: iso(row.acceptedAt),
      pickedAt: iso(row.pickedAt),
      deliveredAt: iso(row.deliveredAt),
      completedAt: iso(row.completedAt),
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  private async eventsOf(orderId: number): Promise<ErrandOrderEvent[]> {
    const rows = await this.prisma.errandOrderEvent.findMany({
      where: { orderId },
      orderBy: [{ id: 'asc' }],
      take: 200,
    });
    return (rows as unknown as EventRow[]).map((row) => eventView(row));
  }

  private async detail(row: OrderRow): Promise<ErrandOrderDetail> {
    return { ...this.toOrder(row), events: await this.eventsOf(row.id) };
  }

  private async findForSite(siteId: number, id: number): Promise<OrderRow> {
    const row = (await this.prisma.errandOrder.findFirst({
      where: { id, siteId },
    })) as unknown as OrderRow | null;
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    return row;
  }

  // ---------------------------------------------------------------- 店主侧

  async list(
    user: CurrentUser,
    query: ErrandOrderListQuery,
  ): Promise<PageResponse<ErrandOrder>> {
    const ctx = await this.sites.require(user);
    const { page, pageSize, offset } = pageArgs(query);
    const where: Prisma.ErrandOrderWhereInput = { siteId: ctx.row.id };
    if (query.status) where.status = query.status;
    if (query.payState) where.payState = query.payState;
    if (query.serviceType) where.serviceType = query.serviceType;
    if (query.riderId) where.riderId = query.riderId;
    if (query.cityId) where.cityId = query.cityId;
    const range = dayRange(query.from, query.to);
    if (range.gte || range.lte) where.createdAt = range;
    const keyword = clip(query.keyword, 60).trim();
    if (keyword) {
      where.OR = [
        { orderNo: { contains: keyword } },
        { contactName: { contains: keyword } },
        { contactMobile: { contains: keyword } },
        { riderName: { contains: keyword } },
        { goodsDesc: { contains: keyword } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.errandOrder.findMany({
        where,
        orderBy: [{ id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.errandOrder.count({ where }),
    ]);
    return pageOf(
      (rows as unknown as OrderRow[]).map((row) => this.toOrder(row)),
      total,
      page,
      pageSize,
    );
  }

  async adminDetail(user: CurrentUser, id: number): Promise<ErrandOrderDetail> {
    const ctx = await this.sites.require(user);
    return this.detail(await this.findForSite(ctx.row.id, id));
  }

  async action(
    user: CurrentUser,
    body: ErrandOrderActionBody,
  ): Promise<ErrandOrderDetail> {
    const ctx = await this.sites.require(user);
    const row = await this.findForSite(ctx.row.id, body.id);
    return this.applyAction(row, {
      action: body.action,
      riderId: body.riderId,
      note: body.note,
      operator: `owner:${user.userId}`,
      purchaseAmount: body.purchaseAmount,
      purchaseReceipt: body.purchaseReceipt,
      purchaseNote: body.purchaseNote,
    });
  }

  // ---------------------------------------------------------------- 公开：报价 / 下单

  /** 匿名可报价；带顾客令牌时才会校验优惠券归属。 */
  async quote(
    ctx: {
      row: { id: number; ownerUserId: string; name: string };
      rule: ErrandRule;
      cityId: number;
    },
    input: ErrandQuoteInput,
    identity?: ErrandCustomerIdentity | null,
  ): Promise<ErrandQuoteResult> {
    const distance = await this.map.resolve(
      {
        ownerUserId: ctx.row.ownerUserId,
        scene: 'ERRAND',
        shopId: ctx.row.id,
        shopName: ctx.row.name,
      },
      {
        fromLng: input.fromLng,
        fromLat: input.fromLat,
        toLng: input.toLng,
        toLat: input.toLat,
        distanceKm: input.distanceKm,
      },
    );
    const normalized = {
      ...input,
      distanceKm: distance.kilometers,
      distanceSource: distance.source,
    };
    if (normalized.distanceKm > Number(ctx.rule.maxDistanceKm)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `配送距离超过本站上限 ${ctx.rule.maxDistanceKm} 公里，请拆分或选择更近的取送点`,
      );
    }
    if (normalized.weightKg > Number(ctx.rule.maxWeightKg)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `物品重量超过本站上限 ${ctx.rule.maxWeightKg} 公斤，请联系店主人工作业`,
      );
    }
    const pointsUsed = Math.max(0, Math.floor(normalized.pointsUsed || 0));
    if (pointsUsed > 0) {
      if (!identity) {
        throw new BusinessException(
          ErrorCode.UNAUTHORIZED,
          '使用积分抵扣需要先微信登录',
        );
      }
      const balance = await this.customers.pointsOf(identity);
      if (balance < pointsUsed) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          `积分不足：当前 ${balance} 分，最多可抵 ${balance} 分`,
        );
      }
    }
    let couponInfo: {
      type: 'FIXED' | 'PERCENT';
      discountValue: number;
      minAmount: number;
    } | null = null;
    if (normalized.couponId > 0) {
      if (!identity) {
        throw new BusinessException(
          ErrorCode.UNAUTHORIZED,
          '使用优惠券需要先微信登录',
        );
      }
      const reserved = await this.customers.reserveCoupon(
        identity,
        normalized.couponId,
        this.serviceCents(ctx.rule, normalized),
        normalized.serviceType,
        ctx.row.id,
        ctx.cityId,
      );
      if (reserved) {
        couponInfo = {
          type: reserved.type,
          discountValue: reserved.discountValue,
          minAmount: reserved.minAmount,
        };
      }
    }
    return quoteOrder(ctx.rule, {
      ...normalized,
      pointsUsed,
      coupon: couponInfo,
    });
  }

  private serviceCents(
    rule: ErrandRule,
    input: Pick<
      ErrandQuoteInput,
      'serviceType' | 'distanceKm' | 'weightKg' | 'goodsAmount' | 'tip'
    >,
  ): number {
    const base = quoteOrder(rule, { ...input, tip: 0, coupon: null });
    return (
      toCents(base.baseFee) +
      toCents(base.distanceFee) +
      toCents(base.weightFee) +
      toCents(base.timeFee) +
      toCents(base.goodsFee)
    );
  }

  async create(
    site: {
      id: number;
      ownerUserId: string;
      name: string;
      siteCode: string;
      cityId: number;
      cityName: string;
      protocolText: string;
      toggles: Record<string, boolean>;
    },
    rule: import('./errand.site.service').ErrandSiteContext['rule'],
    body: ErrandPublicOrderCreateBody,
    ctx: {
      ip: string;
      openid: string;
      customerId: number;
      identity: ErrandCustomerIdentity | null;
    },
  ): Promise<ErrandPublicOrderCreated> {
    await this.sites.ensureToolOpen(site.ownerUserId);
    if (
      site.toggles.protocol !== false &&
      site.protocolText &&
      body.protocolAccepted !== true
    ) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请先阅读并勾选下单协议',
      );
    }
    if (body.serviceType === 'BUY' && !site.toggles.buyService) {
      throw new BusinessException(
        ErrorCode.FEATURE_CLOSED,
        '本站暂未开通「帮我买」，请改用「帮我送」',
      );
    }
    const fromParty = partyOf(body.fromParty);
    const toParty = partyOf(body.toParty);
    if (!fromParty.address || !toParty.address) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请填写完整的取货地址与送达地址',
      );
    }
    if (!fromParty.mobile && !toParty.mobile && !body.contactMobile) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请至少留一个能联系到的手机号',
      );
    }
    const distance = await this.map.resolve(
      {
        ownerUserId: site.ownerUserId,
        scene: 'ERRAND',
        shopId: site.id,
        shopName: site.name,
      },
      {
        fromLng: fromParty.lng,
        fromLat: fromParty.lat,
        toLng: toParty.lng,
        toLat: toParty.lat,
        distanceKm: body.distanceKm,
      },
    );
    const distanceKm = distance.kilometers;
    if (distanceKm > Number(rule.maxDistanceKm)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `配送距离超过本站上限 ${rule.maxDistanceKm} 公里`,
      );
    }
    if (body.weightKg > Number(rule.maxWeightKg)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `物品重量超过本站上限 ${rule.maxWeightKg} 公斤`,
      );
    }
    if (body.serviceType === 'BUY' && body.goodsAmount <= 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '「帮我买」需要填写预估商品金额',
      );
    }
    const tip = site.toggles.tip ? Math.max(0, body.tip) : 0;

    let reservation = null as Awaited<
      ReturnType<ErrandCustomerService['reserveCoupon']>
    >;
    if (body.couponId > 0) {
      if (!ctx.identity) {
        throw new BusinessException(
          ErrorCode.UNAUTHORIZED,
          '使用优惠券需要先微信登录',
        );
      }
      reservation = await this.customers.reserveCoupon(
        ctx.identity,
        body.couponId,
        this.serviceCents(rule, {
          serviceType: body.serviceType,
          distanceKm,
          weightKg: body.weightKg,
          goodsAmount: body.goodsAmount,
          tip,
        }),
        body.serviceType,
        site.id,
        site.cityId,
      );
    }
    const coupon = reservation
      ? {
          type: reservation.type,
          discountValue: reservation.discountValue,
          minAmount: reservation.minAmount,
        }
      : null;
    const pointsUsed = Math.max(0, Math.floor(body.pointsUsed || 0));
    if (pointsUsed > 0 && !ctx.identity) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '使用积分抵扣需要先微信登录',
      );
    }
    const quote = quoteOrder(rule, {
      serviceType: body.serviceType,
      distanceKm,
      weightKg: body.weightKg,
      goodsAmount: body.goodsAmount,
      tip,
      coupon,
      pointsUsed,
      distanceSource: distance.source,
    });
    const online = await this.pay.online(site);
    if (online && !ctx.openid) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '本店支持微信在线支付，请先授权微信登录后再下单',
      );
    }
    const payMode = online ? 'ONLINE' : 'OFFLINE';
    const now = new Date();
    const expireAt = new Date(now.getTime() + PAY_MINUTES * 60_000);
    const customerId =
      ctx.customerId || (await this.customers.ensureForOrder(site, ctx.openid));
    const orderNo = errandOrderNo();

    const created = await this.prisma.$transaction(async (tx) => {
      const row = (await tx.errandOrder.create({
        data: {
          siteId: site.id,
          cityId: site.cityId,
          cityName: site.cityName,
          ownerUserId: site.ownerUserId,
          orderNo,
          serviceType: quote.serviceType,
          status: 'PENDING_PAY',
          payState: 'PENDING',
          payMode,
          fromParty: jsonInput(fromParty),
          toParty: jsonInput(toParty),
          goodsDesc: clip(body.goodsDesc, 300),
          goodsAmount: fromCents(toCents(body.goodsAmount)),
          weightKg: quote.weightKg,
          distanceKm: quote.distanceKm,
          baseFee: quote.baseFee,
          distanceFee: quote.distanceFee,
          weightFee: quote.weightFee,
          timeFee: quote.timeFee,
          goodsFee: quote.goodsFee,
          tip: quote.tip,
          couponId: reservation?.couponId ?? 0,
          couponDiscount: quote.couponDiscount,
          pointsUsed: quote.pointsUsed,
          pointsDiscount: quote.pointsDiscount,
          totalAmount: quote.totalAmount,
          customerId,
          openid: clip(ctx.openid, 64),
          contactName: clip(body.contactName || fromParty.name, 40),
          contactMobile: clip(body.contactMobile || fromParty.mobile, 20),
          remark: clip(body.remark, 300),
          photos: jsonInput(body.photos.slice(0, 6)),
          createIp: clip(ctx.ip, 64),
          expireAt,
        },
      })) as unknown as OrderRow;
      await tx.errandOrderEvent.create({
        data: {
          siteId: site.id,
          orderId: row.id,
          status: 'PENDING_PAY',
          note: online ? '订单已创建，等待微信支付' : '订单已创建，线下结算',
          operator: 'customer',
        },
      });
      await this.customers.touchOrder(tx, site.id, customerId);
      if (reservation) {
        await this.customers.markCouponUsed(
          tx,
          reservation.ticketId,
          site.id,
          row.id,
        );
      }
      if (quote.pointsUsed > 0 && ctx.identity) {
        await this.customers.consumePoints(
          tx,
          ctx.identity,
          quote.pointsUsed,
          row.id,
          row.orderNo,
        );
      }
      return row;
    });

    let payParams: ErrandPublicOrderCreated['payParams'] = null;
    let message = online
      ? '订单已创建，正在发起微信支付'
      : '订单已创建：本店当前为线下结算，请与店主确认收款后开始配送';
    if (online) {
      try {
        payParams = await this.pay.prepay({
          site,
          orderNo: created.orderNo,
          amountCents: toCents(created.totalAmount),
          description: `${created.serviceType === 'BUY' ? '帮买' : '帮送'} ${created.orderNo}`,
          openid: ctx.openid,
        });
        message = '订单已创建并拉起微信支付';
      } catch (error) {
        message = `订单已创建，但支付发起失败：${
          error instanceof Error ? error.message : '请到「我的订单」重新支付'
        }`;
      }
    }
    void this.notify.orderCreated(created);
    return {
      orderNo: created.orderNo,
      totalAmount: amount(created.totalAmount),
      payState: 'PENDING',
      expireAt: iso(expireAt),
      payParams,
      message,
    };
  }

  async repay(
    site: { id: number; ownerUserId: string; name: string; siteCode: string },
    body: { orderNo: string; openid: string; customerId: number },
  ): Promise<ErrandPublicOrderCreated> {
    const row = (await this.prisma.errandOrder.findFirst({
      where: { siteId: site.id, orderNo: clip(body.orderNo, 40) },
    })) as unknown as OrderRow | null;
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    if (row.payState === 'PAID') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '订单已支付，无需重复支付',
      );
    }
    if (
      row.status !== 'PENDING_PAY' ||
      (row.expireAt && row.expireAt <= new Date())
    ) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '订单已关闭或超时，请重新下单',
      );
    }
    if (!body.openid) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '请先微信登录后再支付',
      );
    }
    if (
      row.customerId &&
      body.customerId &&
      row.customerId !== body.customerId
    ) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '该订单不属于当前微信，不能代为支付',
      );
    }
    const online = await this.pay.online(site);
    if (!online) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '本店当前未开启在线收款，请与店主线下结算',
      );
    }
    const payParams = await this.pay.prepay({
      site,
      orderNo: row.orderNo,
      amountCents: toCents(row.totalAmount),
      description: `${row.serviceType === 'BUY' ? '帮买' : '帮送'} ${row.orderNo}`,
      openid: body.openid,
    });
    return {
      orderNo: row.orderNo,
      totalAmount: amount(row.totalAmount),
      payState: 'PENDING',
      expireAt: iso(row.expireAt),
      payParams,
      message: '已重新发起支付',
    };
  }

  /** 支付回调：金额与单号都核对，幂等（重复回调只补事件不改金额）。 */
  async handlePaid(siteId: number, notify: ErrandPayNotify): Promise<void> {
    if (notify.tradeState !== 'SUCCESS') return;
    if (notify.outTradeNo.startsWith('EX')) {
      await this.handleExtraPaid(siteId, notify);
      return;
    }
    const row = (await this.prisma.errandOrder.findFirst({
      where: { siteId, orderNo: notify.outTradeNo },
    })) as unknown as OrderRow | null;
    if (!row) return;
    if (row.payState === 'PAID') return;
    const expected = toCents(row.totalAmount);
    if (notify.amountCents > 0 && notify.amountCents !== expected) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `回调金额 ${amount(notify.amountCents)} 与订单金额 ${amount(expected)} 不一致，已拒绝入账`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.errandOrder.updateMany({
        where: { id: row.id, payState: 'PENDING' },
        data: {
          payState: 'PAID',
          status: 'PENDING_ACCEPT',
          transactionId: clip(notify.transactionId, 64),
          paidAt: new Date(),
        },
      });
      if (!updated.count) return;
      await tx.errandOrderEvent.create({
        data: {
          siteId,
          orderId: row.id,
          status: 'PENDING_ACCEPT',
          note: '微信支付成功，等待骑手接单',
          operator: 'wechat-pay',
        },
      });
      await this.customers.touchPaid(tx, siteId, row.customerId, expected);
    });
    const paid = await this.findForSite(siteId, row.id);
    void this.notify.paid(paid);
    await this.broadcastNewOrder(paid);
    await this.autoAssign(siteId, row.id);
  }

  /** 帮买补款回调：EX<订单号> 只标记补款完成，不改原订单金额与状态。 */
  private async handleExtraPaid(
    siteId: number,
    notify: ErrandPayNotify,
  ): Promise<void> {
    const orderNo = notify.outTradeNo.slice(2);
    const row = (await this.prisma.errandOrder.findFirst({
      where: { siteId, orderNo },
    })) as unknown as OrderRow | null;
    if (!row || row.extraPaidAt) return;
    if (row.payState !== 'PAID' || row.status === 'CANCELLED') return;
    const expected = toCents(row.extraAmount);
    if (expected <= 0) return;
    if (notify.amountCents > 0 && notify.amountCents !== expected) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `补款回调金额 ${amount(notify.amountCents)} 与应补 ${amount(expected)} 不一致，已拒绝入账`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.errandOrder.updateMany({
        where: { id: row.id, extraPaidAt: null },
        data: { extraPaidAt: new Date() },
      });
      if (!updated.count) return;
      await tx.errandOrderEvent.create({
        data: {
          siteId,
          orderId: row.id,
          status: row.status,
          note: `帮买补款 ${amount(expected)} 元已支付`,
          operator: 'wechat-pay',
        },
      });
    });
  }

  /** 顾客补付帮买差额：单独 EX 单号，不改变原订单金额。 */
  async payExtra(
    site: { id: number; ownerUserId: string; name: string; siteCode: string },
    body: { orderNo: string },
    openid: string,
  ): Promise<ErrandPublicOrderCreated> {
    const row = (await this.prisma.errandOrder.findFirst({
      where: { siteId: site.id, orderNo: clip(body.orderNo, 40) },
    })) as unknown as OrderRow | null;
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    if (row.serviceType !== 'BUY') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '只有帮买订单可以补款',
      );
    }
    if (row.extraPaidAt) {
      throw new BusinessException(ErrorCode.CONFLICT, '这笔补款已经支付过了');
    }
    const extraCents = toCents(row.extraAmount);
    if (extraCents <= 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '这笔订单没有需要补收的金额',
      );
    }
    if (row.payMode !== 'ONLINE' || row.payState !== 'PAID') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '原订单不是线上已支付，补款请线下结算',
      );
    }
    if (!openid) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '请先微信登录后再补款',
      );
    }
    const online = await this.pay.online(site);
    if (!online) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '本店当前未开启在线收款，请线下补款',
      );
    }
    const payParams = await this.pay.prepay({
      site,
      orderNo: `EX${row.orderNo}`,
      amountCents: extraCents,
      description: `帮买补款 ${row.orderNo}`,
      openid,
    });
    return {
      orderNo: row.orderNo,
      totalAmount: amount(extraCents),
      payState: 'PENDING',
      expireAt: iso(new Date(Date.now() + 30 * 60_000)),
      payParams,
      message: '已发起补款支付',
    };
  }

  async markPaidByOwner(
    siteId: number,
    orderId: number,
    operator: string,
  ): Promise<void> {
    const row = await this.findForSite(siteId, orderId);
    if (row.payState === 'PAID') return;
    if (row.status !== 'PENDING_PAY') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '只有待支付订单可以登记收款',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.errandOrder.update({
        where: { id: row.id },
        data: {
          payState: 'PAID',
          status: 'PENDING_ACCEPT',
          paidAt: new Date(),
        },
      });
      await tx.errandOrderEvent.create({
        data: {
          siteId,
          orderId: row.id,
          status: 'PENDING_ACCEPT',
          note: '店主登记已收款（线下结算）',
          operator,
        },
      });
      await this.customers.touchPaid(
        tx,
        siteId,
        row.customerId,
        toCents(row.totalAmount),
      );
    });
    const paid = await this.findForSite(siteId, row.id);
    void this.notify.paid(paid);
    if (!(await this.cityEnabled(siteId, row.cityId))) {
      void this.notify.ownerCityDisabled(paid);
      return;
    }
    await this.broadcastNewOrder(paid);
    await this.autoAssign(siteId, row.id);
  }

  /** 新单广播：给在线且接该服务类型的骑手发订阅消息（自动派单仍会再发一次结果）。 */
  private async broadcastNewOrder(order: OrderRow): Promise<void> {
    if (order.status !== 'PENDING_ACCEPT' || order.riderId) return;
    if (!(await this.cityEnabled(order.siteId, order.cityId))) return;
    const type = order.serviceType === 'BUY' ? 'BUY' : 'SEND';
    const riders = await this.prisma.errandRider.findMany({
      where: {
        siteId: order.siteId,
        cityId: order.cityId,
        status: 'APPROVED',
        online: true,
      },
      select: { id: true, openid: true, serviceTypes: true },
      take: 100,
    });
    for (const rider of riders) {
      const types = jsonList<unknown>(rider.serviceTypes).map((item) =>
        String(item),
      );
      if (types.length && !types.includes(type)) continue;
      void this.notify.riderNewOrder(order, rider);
    }
  }

  // ---------------------------------------------------------------- 公开：查询 / 取消 / 我的订单

  private canAccess(
    row: OrderRow,
    identity: ErrandCustomerIdentity | null,
    mobile: string,
  ): boolean {
    if (identity && row.customerId && identity.customerId === row.customerId)
      return true;
    const target = clip(mobile, 20).trim();
    if (!target) return false;
    return [
      row.contactMobile,
      partyOf(row.fromParty).mobile,
      partyOf(row.toParty).mobile,
    ].some((item) => item && item === target);
  }

  async query(
    siteId: number,
    query: { orderNo: string; mobile: string },
    identity: ErrandCustomerIdentity | null,
  ): Promise<ErrandPublicOrder> {
    const row = (await this.prisma.errandOrder.findFirst({
      where: { siteId, orderNo: clip(query.orderNo, 40) },
    })) as unknown as OrderRow | null;
    if (!row)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '订单不存在，请核对单号',
      );
    if (!this.canAccess(row, identity, query.mobile)) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '请用下单时的手机号或登录微信查询该订单',
      );
    }
    return { ...this.toOrder(row), events: await this.eventsOf(row.id) };
  }

  async myOrders(
    identity: ErrandCustomerIdentity,
    limit = 50,
  ): Promise<ErrandOrder[]> {
    const rows = await this.prisma.errandOrder.findMany({
      where: { siteId: identity.siteId, customerId: identity.customerId },
      orderBy: [{ id: 'desc' }],
      take: Math.min(100, Math.max(1, limit)),
    });
    return (rows as unknown as OrderRow[]).map((row) => this.toOrder(row));
  }

  async cancelPublic(
    siteId: number,
    body: { orderNo: string; mobile: string; reason: string },
    identity: ErrandCustomerIdentity | null,
  ): Promise<ErrandPublicOrder> {
    const row = (await this.prisma.errandOrder.findFirst({
      where: { siteId, orderNo: clip(body.orderNo, 40) },
    })) as unknown as OrderRow | null;
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    if (!this.canAccess(row, identity, body.mobile)) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '请用下单时的手机号或登录微信取消该订单',
      );
    }
    if (!['PENDING_PAY', 'PENDING_ACCEPT'].includes(row.status)) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '骑手已接单，不能自助取消；如需取消请联系店方客服',
      );
    }
    await this.applyAction(row, {
      action: 'CANCEL',
      riderId: 0,
      note: clip(body.reason, 300) || '顾客取消',
      operator: 'customer',
    });
    return this.query(
      siteId,
      { orderNo: row.orderNo, mobile: body.mobile },
      identity,
    );
  }

  /**
   * 自动派单：支付成功后按「骑手到取货点直线距离 + 评分」挑最近的在线骑手。
   * 只派一次且用 CAS 防并发；没有合适骑手就留在待接单，不阻塞订单。
   */
  private async cityEnabled(siteId: number, cityId: number): Promise<boolean> {
    const row = await this.prisma.errandCity.findFirst({
      where: { id: cityId, siteId, status: 'ENABLED' },
      select: { id: true },
    });
    return !!row;
  }

  private async autoAssign(siteId: number, orderId: number): Promise<void> {
    const order = await this.prisma.errandOrder.findFirst({
      where: { id: orderId, siteId },
    });
    if (!order) return;
    const rule = await this.prisma.errandRule.findUnique({
      where: { cityId: order.cityId },
    });
    if (!rule?.autoDispatch) return;
    if (!(await this.cityEnabled(siteId, order.cityId))) return;
    if (order.status !== 'PENDING_ACCEPT' || order.riderId) return;
    const pickup = partyOf(order.fromParty);
    const type = order.serviceType === 'BUY' ? 'BUY' : 'SEND';
    const radius = Number(rule.acceptRadiusKm) || 0;
    const riders = await this.prisma.errandRider.findMany({
      where: { siteId, cityId: order.cityId, status: 'APPROVED', online: true },
      take: 100,
    });
    if (!riders.length) return;
    const active = await this.prisma.errandOrder.groupBy({
      by: ['riderId'],
      where: {
        siteId,
        riderId: { in: riders.map((row) => row.id) },
        status: { in: ['ACCEPTED', 'PICKED_UP', 'DELIVERING', 'ARRIVED'] },
      },
      _count: { _all: true },
    });
    const activeMap = new Map(
      active.map((row) => [row.riderId, row._count._all]),
    );
    const candidates = riders
      .filter((rider) => {
        const types = jsonList<unknown>(rider.serviceTypes).map((item) =>
          String(item),
        );
        if (types.length && !types.includes(type)) return false;
        if (
          (activeMap.get(rider.id) ?? 0) >= (Number(rule.maxActiveOrders) || 3)
        )
          return false;
        return true;
      })
      .map((rider) => {
        const distance = this.map.riderToPickupKm(rider, {
          fromLng: pickup.lng,
          fromLat: pickup.lat,
        });
        return { rider, distance };
      })
      .filter(
        (item) =>
          item.distance !== null && (radius <= 0 || item.distance <= radius),
      )
      .sort((a, b) => {
        const diff = (a.distance ?? 0) - (b.distance ?? 0);
        return diff !== 0
          ? diff
          : Number(b.rider.rating) - Number(a.rider.rating);
      });
    for (const candidate of candidates.slice(0, 3)) {
      const rider = candidate.rider;
      const updated = await this.prisma.$transaction(async (tx) => {
        const result = await tx.errandOrder.updateMany({
          where: { id: order.id, siteId, status: 'PENDING_ACCEPT', riderId: 0 },
          data: {
            riderId: rider.id,
            riderNo: rider.riderNo,
            riderName: rider.name,
            status: 'ACCEPTED',
            acceptedAt: new Date(),
          },
        });
        if (!result.count) return false;
        await tx.errandOrderEvent.create({
          data: {
            siteId,
            orderId: order.id,
            status: 'ACCEPTED',
            note: `系统自动派单：${rider.name}（距取货点 ${candidate.distance ?? 0} 公里）`,
            operator: 'system',
          },
        });
        await tx.errandRider.update({
          where: { id: rider.id },
          data: { lastActiveAt: new Date() },
        });
        return true;
      });
      if (!updated) return;
      const assigned = await this.findForSite(siteId, order.id);
      void this.notify.accepted(assigned);
      void this.notify.riderNewOrder(assigned, rider);
      return;
    }
  }

  // ---------------------------------------------------------------- 骑手端

  async riderWorkbench(
    siteId: number,
    rider: {
      id: number;
      serviceTypes: unknown;
      status: string;
      online: boolean;
      cityId: number;
      lng?: number | null;
      lat?: number | null;
    },
  ) {
    const types = this.riderTypes(rider.serviceTypes);
    const [pending, active, completedToday, incomeToday] = await Promise.all([
      rider.online && rider.status === 'APPROVED'
        ? this.prisma.errandOrder.findMany({
            where: {
              siteId,
              status: 'PENDING_ACCEPT',
              riderId: 0,
              serviceType: { in: types },
              cityId: rider.cityId,
            },
            orderBy: [{ id: 'asc' }],
            take: 50,
          })
        : Promise.resolve([]),
      this.prisma.errandOrder.findMany({
        where: {
          siteId,
          riderId: rider.id,
          status: { in: ['ACCEPTED', 'PICKED_UP', 'DELIVERING', 'ARRIVED'] },
        },
        orderBy: [{ id: 'asc' }],
        take: 50,
      }),
      this.prisma.errandOrder.count({
        where: {
          siteId,
          riderId: rider.id,
          status: 'COMPLETED',
          completedAt: { gte: this.todayStart() },
        },
      }),
      this.prisma.errandWalletTx.aggregate({
        where: {
          siteId,
          riderId: rider.id,
          type: 'INCOME',
          createdAt: { gte: this.todayStart() },
        },
        _sum: { amount: true },
      }),
    ]);
    const rule = await this.prisma.errandRule.findUnique({
      where: { cityId: rider.cityId },
    });
    const cityEnabled = await this.cityEnabled(siteId, rider.cityId);
    const radius = Number(rule?.acceptRadiusKm) || 0;
    const riderLng = Number(rider.lng) || 0;
    const riderLat = Number(rider.lat) || 0;
    const pendingRows = cityEnabled
      ? (pending as unknown as OrderRow[]).filter((row) => {
          if (radius <= 0 || !rule) return true;
          const pickup = partyOf(row.fromParty);
          const distance = this.map.riderToPickupKm(
            { lng: riderLng, lat: riderLat },
            { fromLng: pickup.lng, fromLat: pickup.lat },
          );
          if (distance === null) return radius <= 0;
          return distance <= radius;
        })
      : [];
    return {
      pendingOrders: pendingRows.map((row) => this.toOrder(row)),
      activeOrders: (active as unknown as OrderRow[]).map((row) =>
        this.toOrder(row),
      ),
      completedToday,
      incomeToday: amount(incomeToday._sum.amount),
    };
  }

  private todayStart(): Date {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start;
  }

  private riderTypes(value: unknown): string[] {
    const list = jsonList<unknown>(value)
      .map((item) => String(item))
      .filter((item) => item === 'SEND' || item === 'BUY');
    return list.length ? list : ['SEND', 'BUY'];
  }

  /** 骑手接单：用 updateMany 做状态 CAS，手慢的请求会得到「已被接走」。 */
  async acceptOrder(
    siteId: number,
    riderId: number,
    orderId: number,
  ): Promise<ErrandOrderDetail> {
    const row = await this.findForSite(siteId, orderId);
    const type = row.serviceType === 'BUY' ? 'BUY' : 'SEND';
    const rider = await this.riders.requireAvailable(siteId, riderId, type);
    if (rider.cityId !== row.cityId) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '这单不在你的服务城市，不能接单',
      );
    }
    if (row.status !== 'PENDING_ACCEPT' || row.riderId) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '这单已经被其他骑手接走了',
      );
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.errandOrder.updateMany({
        where: { id: row.id, siteId, status: 'PENDING_ACCEPT', riderId: 0 },
        data: {
          riderId: rider.id,
          riderNo: rider.riderNo,
          riderName: rider.name,
          status: 'ACCEPTED',
          acceptedAt: new Date(),
        },
      });
      if (!result.count) {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '这单已经被其他骑手接走了',
        );
      }
      await tx.errandOrderEvent.create({
        data: {
          siteId,
          orderId: row.id,
          status: 'ACCEPTED',
          note: `骑手 ${rider.name} 接单`,
          operator: `rider:${rider.riderNo}`,
        },
      });
      await tx.errandRider.update({
        where: { id: rider.id },
        data: { lastActiveAt: new Date() },
      });
      return (await tx.errandOrder.findFirst({
        where: { id: row.id },
      })) as unknown as OrderRow;
    });
    void this.notify.accepted(updated);
    return this.detail(updated);
  }

  async riderAction(
    siteId: number,
    riderId: number,
    body: ErrandRiderActionBody,
  ): Promise<ErrandOrderDetail> {
    const row = await this.findForSite(siteId, body.orderId);
    if (row.riderId !== riderId) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '这不是你的订单，不能操作',
      );
    }
    if (body.action === 'ABANDON') {
      if (row.status !== 'ACCEPTED') {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '只有已接单、尚未取件的订单可以放弃；已取件请联系店主处理',
        );
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.errandOrder.update({
          where: { id: row.id },
          data: {
            status: 'PENDING_ACCEPT',
            riderId: 0,
            riderNo: '',
            riderName: '',
            acceptedAt: null,
          },
        });
        await tx.errandOrderEvent.create({
          data: {
            siteId,
            orderId: row.id,
            status: 'PENDING_ACCEPT',
            note: `骑手放弃接单${body.note ? `：${body.note}` : ''}`,
            operator: `rider:${riderId}`,
          },
        });
      });
      const abandoned = await this.findForSite(siteId, row.id);
      void this.notify.riderAbandoned(abandoned);
      await this.broadcastNewOrder(abandoned);
      return this.detail(abandoned);
    }
    const mapping: Record<string, string> = {
      ACCEPT: 'ACCEPT',
      PICKUP: 'PICKUP',
      DELIVER: 'DELIVER',
      ARRIVE: 'ARRIVE',
      COMPLETE: 'COMPLETE',
    };
    return this.applyAction(row, {
      action: mapping[body.action] || body.action,
      riderId,
      note: body.note,
      operator: `rider:${riderId}`,
    });
  }

  // ---------------------------------------------------------------- 状态机

  private async applyAction(
    row: OrderRow,
    input: {
      action: string;
      riderId: number;
      note: string;
      operator: string;
      purchaseAmount?: number;
      purchaseReceipt?: string;
      purchaseNote?: string;
    },
  ): Promise<ErrandOrderDetail> {
    const action = input.action;
    const from = ACTION_FROM[action];
    if (!from)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '未知的订单动作');
    if (!from.includes(row.status)) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `订单当前是「${row.status}」，不能执行该动作`,
      );
    }
    if (action === 'SETTLE_BUY') {
      if (row.serviceType !== 'BUY') {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '只有「帮我买」订单可以登记实付',
        );
      }
      const actual = Math.max(0, Number(input.purchaseAmount) || 0);
      if (actual <= 0) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '请填写实际采购金额',
        );
      }
      const estimated = amount(row.goodsAmount);
      const change = Math.max(0, Math.round((estimated - actual) * 100) / 100);
      const extra = Math.max(0, Math.round((actual - estimated) * 100) / 100);
      // 线上已付且应退差额：按部分退款原路退回；失败就让本次登记失败，便于用同一退款单号重试
      if (change > 0 && row.payMode === 'ONLINE' && row.payState === 'PAID') {
        const site = await this.prisma.errandSite.findUnique({
          where: { id: row.siteId },
          select: { id: true, ownerUserId: true, name: true },
        });
        if (!site)
          throw new BusinessException(ErrorCode.NOT_FOUND, '站点不存在');
        await this.pay.refund({
          site,
          orderNo: row.orderNo,
          amountCents: toCents(row.totalAmount),
          refundCents: toCents(change),
          outRefundNo: `ERC${row.orderNo}`,
          reason: '帮买实际金额低于预估价，退还差额',
        });
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.errandOrder.update({
          where: { id: row.id },
          data: {
            purchaseAmount: actual,
            purchaseReceipt: clip(input.purchaseReceipt, 500),
            purchaseNote: clip(input.purchaseNote, 300),
            changeAmount: change,
            extraAmount: extra,
          },
        });
        await tx.errandOrderEvent.create({
          data: {
            siteId: row.siteId,
            orderId: row.id,
            status: row.status,
            note: `帮买实付 ${actual} 元${
              change > 0
                ? row.payMode === 'ONLINE' && row.payState === 'PAID'
                  ? `，差额 ${change} 元已原路退回`
                  : `，应退顾客 ${change} 元（线下退还）`
                : ''
            }${extra > 0 ? `，需补收 ${extra} 元` : ''}`,
            operator: clip(input.operator, 64),
          },
        });
      });
      return this.detail(await this.findForSite(row.siteId, row.id));
    }
    if (action === 'MARK_PAID') {
      await this.markPaidByOwner(row.siteId, row.id, input.operator);
      return this.detail(await this.findForSite(row.siteId, row.id));
    }
    if (action === 'REFUND' && row.payState !== 'PAID') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '未支付订单不能登记退款，请直接取消',
      );
    }
    if (action === 'CANCEL' && row.payState === 'PAID') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '已支付订单请用「登记退款」结案',
      );
    }
    if (
      action === 'REFUND' &&
      row.payMode === 'ONLINE' &&
      row.payState === 'PAID'
    ) {
      const site = await this.prisma.errandSite.findUnique({
        where: { id: row.siteId },
        select: { id: true, ownerUserId: true, name: true },
      });
      if (!site) throw new BusinessException(ErrorCode.NOT_FOUND, '站点不存在');
      await this.pay.refund({
        site,
        orderNo: row.orderNo,
        amountCents: toCents(row.totalAmount),
        reason: clip(input.note, 80) || '跑腿订单退款',
      });
    }
    let riderId = row.riderId;
    let riderNo = row.riderNo;
    let riderName = row.riderName;
    if (action === 'ASSIGN' || action === 'ACCEPT') {
      const targetRiderId =
        action === 'ASSIGN' ? input.riderId : input.riderId || row.riderId;
      if (!targetRiderId) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '请选择要指派的骑手',
        );
      }
      const type = row.serviceType === 'BUY' ? 'BUY' : 'SEND';
      const rider = await this.riders.requireAvailable(
        row.siteId,
        targetRiderId,
        type,
      );
      if (rider.cityId !== row.cityId) {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '该骑手与订单不在同一服务城市，不能指派',
        );
      }
      if (!(await this.cityEnabled(row.siteId, row.cityId))) {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '该服务城市已停用，不能继续派单',
        );
      }
      const capacity = await this.prisma.errandRule.findUnique({
        where: { cityId: row.cityId },
        select: { maxActiveOrders: true },
      });
      const active = await this.prisma.errandOrder.count({
        where: {
          siteId: row.siteId,
          riderId: rider.id,
          status: { in: ['ACCEPTED', 'PICKED_UP', 'DELIVERING', 'ARRIVED'] },
        },
      });
      if (active >= (capacity?.maxActiveOrders ?? 3)) {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '该骑手在途单已满，请换一名骑手',
        );
      }
      riderId = rider.id;
      riderNo = rider.riderNo;
      riderName = rider.name;
    }
    const rule = await this.prisma.errandRule.findUnique({
      where: { cityId: row.cityId },
      select: { riderShareRate: true, pointsEarnRate: true },
    });
    const riderIncome =
      action === 'COMPLETE'
        ? riderIncomeOf(row, Number(rule?.riderShareRate ?? 1))
        : 0;
    const agent =
      action === 'COMPLETE'
        ? await this.agents.agentForCity(row.siteId, row.cityId)
        : null;
    const agentIncome = agent ? this.agents.commissionOf(row, agent) : 0;
    const earnRate =
      action === 'COMPLETE' ? Number(rule?.pointsEarnRate ?? 0) || 0 : 0;
    const pointsEarned =
      action === 'COMPLETE'
        ? Math.floor(amount(row.totalAmount) * earnRate)
        : 0;
    const next = ACTION_TO[action];
    const now = new Date();
    const data: Prisma.ErrandOrderUpdateInput = {
      status: next,
      ...(action === 'ASSIGN' || action === 'ACCEPT'
        ? { acceptedAt: now }
        : {}),
      ...(action === 'PICKUP' ? { pickedAt: now } : {}),
      ...(action === 'ARRIVE' ? { deliveredAt: now } : {}),
      ...(action === 'COMPLETE'
        ? {
            completedAt: now,
            riderIncomeAmount: riderIncome,
            agentId: agent?.id ?? 0,
            agentIncomeAmount: agentIncome,
            pointsEarned,
          }
        : {}),
      ...(action === 'CANCEL' || action === 'REFUND' ? { closedAt: now } : {}),
      ...(action === 'REFUND' ? { payState: 'REFUNDED' } : {}),
      ...(action === 'CANCEL' && row.payState !== 'PAID'
        ? { payState: 'CLOSED' }
        : {}),
      ...(action === 'CANCEL' || action === 'REFUND' || action === 'EXCEPTION'
        ? { cancelReason: clip(input.note, 300) }
        : {}),
      ...(action === 'EXCEPTION' && input.note
        ? { remark: clip(input.note, 300) }
        : {}),
      ...(action === 'ASSIGN' || action === 'ACCEPT'
        ? { riderId, riderNo, riderName }
        : {}),
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.errandOrder.update({ where: { id: row.id }, data });
      await tx.errandOrderEvent.create({
        data: {
          siteId: row.siteId,
          orderId: row.id,
          status: next,
          note:
            clip(input.note, 300) ||
            (action === 'ASSIGN' || action === 'ACCEPT'
              ? `${ACTION_NOTE[action]}：${riderName}`
              : ACTION_NOTE[action] || ''),
          operator: clip(input.operator, 64),
        },
      });
      if (action === 'COMPLETE') {
        await this.wallet.creditOnComplete(
          tx,
          {
            id: row.id,
            siteId: row.siteId,
            ownerUserId: row.ownerUserId,
            orderNo: row.orderNo,
            riderId,
            distanceFee: row.distanceFee,
            weightFee: row.weightFee,
            timeFee: row.timeFee,
            tip: row.tip,
          },
          riderIncome,
        );
        await this.customers.earnPoints(
          tx,
          row.siteId,
          row.customerId,
          pointsEarned,
          row.id,
          row.orderNo,
        );
        if (agent) {
          await this.agents.creditOnComplete(tx, row, agent, agentIncome);
        }
      }
      if (action === 'REFUND' && row.status === 'COMPLETED') {
        await this.wallet.reverseOnRefund(tx, {
          id: row.id,
          siteId: row.siteId,
          ownerUserId: row.ownerUserId,
          orderNo: row.orderNo,
          riderId,
          riderIncomeAmount: row.riderIncomeAmount,
        });
        await this.agents.reverseOnRefund(tx, {
          id: row.id,
          siteId: row.siteId,
          orderNo: row.orderNo,
          agentId: row.agentId,
          agentIncomeAmount: row.agentIncomeAmount,
        });
        await this.customers.clawbackPoints(
          tx,
          row.siteId,
          row.customerId,
          row.pointsEarned,
          row.id,
          row.orderNo,
        );
      }
      if (action === 'CANCEL' || action === 'REFUND') {
        await this.customers.refundPoints(
          tx,
          row.siteId,
          row.customerId,
          row.pointsUsed,
          row.id,
          row.orderNo,
        );
        // 订单结案要把券退回：券在创建订单时已核销
        const ticket = await tx.errandCustomerCoupon.findFirst({
          where: { orderId: row.id, siteId: row.siteId, status: 'USED' },
          select: { id: true },
        });
        if (ticket)
          await this.customers.releaseCoupon(tx, ticket.id, row.siteId);
      }
    });
    const updated = await this.findForSite(row.siteId, row.id);
    if (action === 'ASSIGN' || action === 'ACCEPT')
      void this.notify.accepted(updated);
    if (action === 'ARRIVE' || action === 'COMPLETE')
      void this.notify.arrived(updated);
    if (action === 'CANCEL' || action === 'REFUND')
      void this.notify.cancelled(updated);
    return this.detail(updated);
  }

  /** 顾客评价：只允许本人对已完成且未评价的订单评一次，同时回写骑手平均分。 */
  async rate(
    siteId: number,
    body: { orderNo: string; rating: number; comment: string },
    identity: ErrandCustomerIdentity,
  ): Promise<ErrandOrderDetail> {
    const row = await this.prisma.errandOrder.findFirst({
      where: { siteId, orderNo: clip(body.orderNo, 40) },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    if (row.customerId !== identity.customerId) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '只能评价自己的订单');
    }
    if (row.status !== 'COMPLETED') {
      throw new BusinessException(ErrorCode.CONFLICT, '订单完成后才能评价');
    }
    if (row.rating > 0) {
      throw new BusinessException(ErrorCode.CONFLICT, '这笔订单已经评价过了');
    }
    const rating = Math.min(5, Math.max(1, Math.round(body.rating)));
    await this.prisma.$transaction(async (tx) => {
      await tx.errandOrder.update({
        where: { id: row.id },
        data: {
          rating,
          ratingComment: clip(body.comment, 300),
          ratedAt: new Date(),
        },
      });
      if (row.riderId) {
        const agg = await tx.errandOrder.aggregate({
          where: { siteId, riderId: row.riderId, rating: { gt: 0 } },
          _avg: { rating: true },
        });
        const avg = Number(agg._avg.rating) || 5;
        await tx.errandRider.update({
          where: { id: row.riderId },
          data: { rating: Math.round(avg * 100) / 100 },
        });
      }
    });
    return this.detail(await this.findForSite(siteId, row.id));
  }

  // ---------------------------------------------------------------- 定时关单

  async releaseExpiredOrders(): Promise<{ orders: number }> {
    const now = new Date();
    const rows = await this.prisma.errandOrder.findMany({
      where: { status: 'PENDING_PAY', expireAt: { lte: now } },
      orderBy: [{ id: 'asc' }],
      take: 200,
    });
    let closed = 0;
    for (const row of rows) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const updated = await tx.errandOrder.updateMany({
            where: { id: row.id, status: 'PENDING_PAY' },
            data: {
              status: 'CANCELLED',
              payState: 'CLOSED',
              closedAt: now,
              cancelReason: '超时未支付，系统自动关闭',
            },
          });
          if (!updated.count) return;
          await tx.errandOrderEvent.create({
            data: {
              siteId: row.siteId,
              orderId: row.id,
              status: 'CANCELLED',
              note: '超过支付时限，系统自动关单',
              operator: 'system',
            },
          });
          const ticket = await tx.errandCustomerCoupon.findFirst({
            where: { orderId: row.id, siteId: row.siteId, status: 'USED' },
            select: { id: true },
          });
          if (ticket)
            await this.customers.releaseCoupon(tx, ticket.id, row.siteId);
        });
        closed += 1;
      } catch {
        // 单笔失败下一轮重试；关单是旁路任务，不打断其他订单
      }
    }
    return { orders: closed };
  }
}
