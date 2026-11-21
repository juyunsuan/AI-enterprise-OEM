import {
  KUAIDI_ORDER_STATE_LABELS,
  type KuaidiOrder,
  type KuaidiOrderAction,
  type KuaidiOrderActionBody,
  type KuaidiOrderDetail,
  type KuaidiOrderEvent,
  type KuaidiOrderListQuery,
  type KuaidiPublicBootstrap,
  type KuaidiPublicOrder,
  type KuaidiPublicOrderCreateBody,
  type KuaidiPublicOrderCreated,
  type KuaidiQuoteInput,
  type KuaidiQuoteResult,
} from '@enterprise/contracts';
import { pageOf, type PageResponse } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { KuaidiCompanyService } from './kuaidi.company.service';
import type { KuaidiCustomerService } from './kuaidi.customer.service';
import type { KuaidiPayService } from './kuaidi.pay.service';
import type {
  KuaidiSiteService,
  KuaidiSiteContext,
} from './kuaidi.site.service';
import {
  KUAIDI_CONTACT_BASE,
  amount,
  clip,
  dayRange,
  fromCents,
  intIn,
  iso,
  jsonInput,
  kuaidiNo,
  numberIn,
  orderState,
  pageArgs,
  partyOf,
  payState,
  quoteFees,
  quoteItem,
  requireSiteId,
  toCents,
} from './kuaidi.shared';

type OrderRow = {
  id: number;
  siteId: number;
  ownerUserId: string;
  orderNo: string;
  companyId: number;
  companyName: string;
  sender: unknown;
  receiver: unknown;
  itemName: string;
  itemWeightKg: unknown;
  itemCount: number;
  length: unknown;
  width: unknown;
  height: unknown;
  volumeWeightKg: unknown;
  chargeWeightKg: unknown;
  insuredValue: unknown;
  baseFee: unknown;
  extraFee: unknown;
  remoteFee: unknown;
  insuranceFee: unknown;
  totalAmount: unknown;
  payMode: string;
  payAccountId: number;
  payState: string;
  status: string;
  pickupSlot: string;
  remark: string;
  trackingNo: string;
  cancelReason: string;
  customerId: number;
  openid: string;
  paidAt: Date | null;
  closedAt: Date | null;
  refundedAt: Date | null;
  expireAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** 每个动作允许的前置状态；金额与最终状态都由服务端裁决，端上只说「做了什么」。 */
const ACTION_FROM: Record<KuaidiOrderAction, readonly string[]> = {
  MARK_PAID: [],
  ACCEPT: ['PENDING_PICKUP'],
  PICKUP: ['PENDING_PICKUP', 'ACCEPTED'],
  TRANSIT: ['ACCEPTED', 'PICKED_UP'],
  DELIVER: ['PICKED_UP', 'IN_TRANSIT'],
  COMPLETE: ['IN_TRANSIT', 'DELIVERED'],
  EXCEPTION: [
    'PENDING_PICKUP',
    'ACCEPTED',
    'PICKED_UP',
    'IN_TRANSIT',
    'DELIVERED',
  ],
  CANCEL: ['PENDING_PICKUP', 'ACCEPTED', 'EXCEPTION'],
  REFUND: [
    'PENDING_PICKUP',
    'ACCEPTED',
    'PICKED_UP',
    'IN_TRANSIT',
    'DELIVERED',
    'COMPLETED',
    'EXCEPTION',
  ],
};

const ACTION_TO: Record<KuaidiOrderAction, string> = {
  MARK_PAID: 'PENDING_PICKUP',
  ACCEPT: 'ACCEPTED',
  PICKUP: 'PICKED_UP',
  TRANSIT: 'IN_TRANSIT',
  DELIVER: 'DELIVERED',
  COMPLETE: 'COMPLETED',
  EXCEPTION: 'EXCEPTION',
  CANCEL: 'CANCELLED',
  REFUND: 'CANCELLED',
};

/**
 * 快递寄件订单：报价、下单、支付、履约状态机与超时关单。
 *
 * 三条硬口径：
 * 1. 金额只由 `quoteFees` 算，端上传的重量尺寸是输入，任何金额字段都不采信；
 * 2. 支付成功后资金直接进店主的微信商户号，平台只改订单状态，不记账、不代扣、不代退；
 * 3. 履约只允许按 ACTION_FROM 的状态机前进，每步追加一条轨迹，不覆盖历史。
 */
export class KuaidiOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: KuaidiSiteService,
    private readonly customers: KuaidiCustomerService,
    private readonly pay: KuaidiPayService,
    private readonly companies: KuaidiCompanyService,
  ) {}

  // ---------------------------------------------------------------- 映射

  private toRow(row: OrderRow): KuaidiOrder {
    return {
      id: row.id,
      siteId: row.siteId,
      orderNo: row.orderNo,
      companyId: row.companyId,
      companyName: row.companyName,
      sender: partyOf(row.sender),
      receiver: partyOf(row.receiver),
      itemName: row.itemName,
      itemWeightKg: numberIn(row.itemWeightKg, 0, 1000, 0),
      itemCount: row.itemCount,
      length: amount(row.length),
      width: amount(row.width),
      height: amount(row.height),
      volumeWeightKg: amount(row.volumeWeightKg),
      chargeWeightKg: amount(row.chargeWeightKg),
      insuredValue: amount(row.insuredValue),
      baseFee: amount(row.baseFee),
      extraFee: amount(row.extraFee),
      remoteFee: amount(row.remoteFee),
      insuranceFee: amount(row.insuranceFee),
      totalAmount: amount(row.totalAmount),
      payState: payState(row.payState),
      payMode: row.payMode === 'ONLINE' ? 'ONLINE' : 'OFFLINE',
      status: orderState(row.status),
      pickupSlot: row.pickupSlot,
      remark: row.remark,
      trackingNo: row.trackingNo,
      cancelReason: row.cancelReason,
      customerId: row.customerId,
      openid: row.openid,
      paidAt: iso(row.paidAt),
      closedAt: iso(row.closedAt),
      refundedAt: iso(row.refundedAt),
      expireAt: iso(row.expireAt),
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  private toEvent(row: {
    id: number;
    status: string;
    note: string;
    operator: string;
    createdAt: Date;
  }): KuaidiOrderEvent {
    return {
      id: row.id,
      status: orderState(row.status),
      statusLabel: KUAIDI_ORDER_STATE_LABELS[row.status] || row.status,
      note: row.note,
      operator: row.operator,
      at: iso(row.createdAt),
    };
  }

  // ---------------------------------------------------------------- 公开：配置与报价

  /** bootstrap：外观 + 开关 + 启用的快递报价；匿名可读，绝不带凭据。 */
  async bootstrap(site: KuaidiSiteContext): Promise<KuaidiPublicBootstrap> {
    this.assertOpen(site);
    const rules = await this.companies.enabledRules(site.siteId);
    return {
      siteId: site.siteId,
      siteCode: site.siteCode,
      name: site.name,
      logo: site.logo,
      slogan: site.slogan,
      themeColor: site.themeColor,
      notice: site.notice,
      addressLine: site.addressLine,
      businessHours: site.businessHours,
      phone: site.phone,
      pickupNote: site.pickupNote,
      toggles: site.toggles,
      contact: site.serviceContact || KUAIDI_CONTACT_BASE,
      deskSiteKey: site.deskSiteKey,
      deskEmbedUrl: site.deskEmbedUrl,
      protocolEnabled: site.protocolEnabled,
      protocolText: site.protocolText,
      insuranceEnabled: site.insuranceEnabled,
      insuranceRate: site.insuranceRate,
      insuranceMax: site.insuranceMax,
      maxWeightKg: site.maxWeightKg,
      pickupSlots: site.pickupSlots,
      companies: rules.map((rule) => ({
        companyId: rule.companyId,
        code: rule.code,
        name: rule.name,
        logo: rule.logo,
        deliveryDays: rule.deliveryDays,
        firstWeightKg: rule.firstWeightKg,
        firstPrice: rule.firstPrice,
        extraWeightKg: rule.extraWeightKg,
        extraPrice: rule.extraPrice,
        remoteProvinces: rule.remoteProvinces,
        remoteExtra: rule.remoteExtra,
        remark: rule.remark,
      })),
    };
  }

  /** 报价：列出所有启用公司的运费，companyId=0 时全部返回。 */
  async quote(
    site: KuaidiSiteContext,
    input: KuaidiQuoteInput,
  ): Promise<KuaidiQuoteResult> {
    this.assertOpen(site);
    const rules = await this.companies.enabledRules(site.siteId);
    if (!rules.length) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '店方还没有启用任何快递公司报价，暂时无法寄件',
      );
    }
    const feeSite = {
      insuranceEnabled: site.insuranceEnabled,
      insuranceRate: site.insuranceRate,
      insuranceMax: site.insuranceMax,
    };
    const selected =
      input.companyId > 0
        ? rules.filter((rule) => rule.companyId === input.companyId)
        : rules;
    if (!selected.length) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '该快递公司已停用或不存在',
      );
    }
    const base = {
      weightKg: input.weightKg,
      length: input.length,
      width: input.width,
      height: input.height,
      insuredValue: clampInsured(site, input.insuredValue),
      province: input.province,
    };
    const quotes = selected.map((rule) =>
      quoteItem(rule, quoteFees(feeSite, rule, base)),
    );
    const chargeWeightKg = quotes[0]?.chargeWeightKg ?? 0;
    if (chargeWeightKg > site.maxWeightKg) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `计费重量 ${chargeWeightKg}kg 超过店方单件上限 ${site.maxWeightKg}kg，请拆分成多件或联系店方`,
      );
    }
    return {
      actualWeightKg: Math.max(0, Number(input.weightKg) || 0),
      volumeWeightKg: quotes[0]?.chargeWeightKg ? volumetricOf(base) : 0,
      chargeWeightKg,
      insuranceEnabled: site.insuranceEnabled,
      insuranceRate: site.insuranceRate,
      insuranceMax: site.insuranceMax,
      maxWeightKg: site.maxWeightKg,
      quotes,
    };
  }

  // ---------------------------------------------------------------- 公开：下单与支付

  async create(
    site: KuaidiSiteContext,
    body: KuaidiPublicOrderCreateBody,
    buyer: { ip: string; openid: string; customerId: number },
  ): Promise<KuaidiPublicOrderCreated> {
    this.assertOpen(site);
    if (site.protocolEnabled && !body.agreed) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请先阅读并勾选寄件协议',
      );
    }
    if (
      body.pickupSlot &&
      site.pickupSlots.length &&
      !site.pickupSlots.includes(body.pickupSlot)
    ) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '所选取件时段已失效，请重新选择',
      );
    }
    const rules = await this.companies.enabledRules(site.siteId);
    const rule = rules.find((item) => item.companyId === body.companyId);
    if (!rule) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '该快递公司已停用，请刷新页面后重新选择',
      );
    }
    const sender = partyOf(body.sender);
    const receiver = partyOf(body.receiver);
    if (!sender.name || !sender.mobile || !sender.address) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '寄件人信息不完整');
    }
    if (!receiver.name || !receiver.mobile || !receiver.address) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '收件人信息不完整');
    }
    const insuredValue = clampInsured(site, body.insuredValue);
    const fees = quoteFees(
      {
        insuranceEnabled: site.insuranceEnabled,
        insuranceRate: site.insuranceRate,
        insuranceMax: site.insuranceMax,
      },
      rule,
      {
        weightKg: body.itemWeightKg,
        length: body.length,
        width: body.width,
        height: body.height,
        insuredValue,
        province: receiver.province,
      },
    );
    if (fees.chargeWeightKg > site.maxWeightKg) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `计费重量 ${fees.chargeWeightKg}kg 超过店方单件上限 ${site.maxWeightKg}kg，请拆分成多件或联系店方`,
      );
    }
    const customerId =
      buyer.customerId ||
      (await this.customers.ensureForOrder(
        { id: site.siteId, ownerUserId: site.ownerUserId },
        buyer.openid,
      ));
    // 在线收款 = 平台闸门 + 账号下有可用收款账户；解析出的账户随订单落库，回调按它验账
    const payRuntime = await this.pay.online(site.siteId, site.ownerUserId);
    const online = Boolean(payRuntime);
    const payMode = online ? 'ONLINE' : 'OFFLINE';
    const now = new Date();
    const expireAt = new Date(now.getTime() + site.payMinutes * 60_000);
    const orderNo = await this.uniqueOrderNo(site.siteId);
    const totalCents =
      toCents(fees.baseFee) +
      toCents(fees.extraFee) +
      toCents(fees.remoteFee) +
      toCents(fees.insuranceFee);
    const created = await this.prisma.kuaidiOrder.create({
      data: {
        siteId: site.siteId,
        ownerUserId: site.ownerUserId,
        orderNo,
        companyId: rule.companyId,
        companyName: rule.name,
        sender: jsonInput(sender),
        receiver: jsonInput(receiver),
        itemName: clip(body.itemName, 80),
        itemWeightKg: numberIn(body.itemWeightKg, 0.1, 1000, 1),
        itemCount: intIn(body.itemCount, 1, 999, 1),
        length: numberIn(body.length, 0, 300, 0),
        width: numberIn(body.width, 0, 300, 0),
        height: numberIn(body.height, 0, 300, 0),
        volumeWeightKg: numberIn(
          volumetricOf({
            length: body.length,
            width: body.width,
            height: body.height,
          }),
          0,
          1000,
          0,
        ),
        chargeWeightKg: fees.chargeWeightKg,
        insuredValue: fromCents(toCents(insuredValue)),
        baseFee: fees.baseFee,
        extraFee: fees.extraFee,
        remoteFee: fees.remoteFee,
        insuranceFee: fees.insuranceFee,
        totalAmount: fromCents(totalCents),
        payMode,
        payAccountId: payRuntime?.accountId ?? 0,
        payState: 'PENDING',
        status: 'PENDING_PICKUP',
        pickupSlot: clip(body.pickupSlot, 40),
        remark: clip(body.remark, 300),
        customerId,
        openid: clip(buyer.openid, 64),
        createIp: clip(buyer.ip, 64),
        expireAt,
      },
    });
    await this.prisma.kuaidiOrderEvent.create({
      data: {
        siteId: site.siteId,
        orderId: created.id,
        status: 'PENDING_PICKUP',
        note: online ? '下单成功，等待支付运费' : '下单成功，等待店方确认收款',
        operator: '买家',
      },
    });
    if (customerId) {
      await this.customers.touchOrder(this.prisma, site.siteId, customerId);
    }
    let payParams: KuaidiPublicOrderCreated['payParams'] = null;
    if (online) {
      payParams = await this.pay.prepay({
        siteId: site.siteId,
        ownerUserId: site.ownerUserId,
        payAccountId: payRuntime?.accountId ?? 0,
        orderNo: created.orderNo,
        amountCents: totalCents,
        description: `快递寄件 ${rule.name} ${created.orderNo}`,
        openid: buyer.openid,
      });
    }
    return {
      orderNo: created.orderNo,
      totalAmount: fromCents(totalCents),
      payMode,
      payParams,
      expireAt: expireAt.toISOString(),
      message: online
        ? '订单已创建，请完成微信支付'
        : '订单已创建，请按店方指引线下支付运费，店方确认后安排取件',
    };
  }

  /**
   * 重新拉起支付：只认「待支付 + 仍在线 + 未过期」的单。
   * 查验凭单号 + 手机号（寄件人或收件人任一），避免被单号枚举拿去试付。
   */
  async repay(
    site: KuaidiSiteContext,
    input: { orderNo: string; mobile: string; openid: string },
  ): Promise<KuaidiPublicOrderCreated> {
    this.assertOpen(site);
    const order = await this.findPublicOrder(site, input.orderNo, input.mobile);
    if (order.payState !== 'PENDING') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        order.payState === 'PAID'
          ? '该订单已支付，无需重复付款'
          : '该订单已关闭，请重新下单',
      );
    }
    if (order.expireAt && order.expireAt.getTime() <= Date.now()) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '订单已超过支付时限，请重新下单',
      );
    }
    if (order.payMode !== 'ONLINE') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '该订单为线下收款，请联系店方确认收款，不支持在线支付',
      );
    }
    if (!input.openid) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请先在小程序内用微信登录后再支付',
      );
    }
    const payParams = await this.pay.prepay({
      siteId: site.siteId,
      ownerUserId: site.ownerUserId,
      payAccountId: order.payAccountId,
      orderNo: order.orderNo,
      amountCents: toCents(order.totalAmount),
      description: `快递寄件 ${order.companyName} ${order.orderNo}`,
      openid: input.openid,
    });
    return {
      orderNo: order.orderNo,
      totalAmount: amount(order.totalAmount),
      payMode: 'ONLINE',
      payParams,
      expireAt: iso(order.expireAt),
      message: '订单已恢复，请完成微信支付',
    };
  }

  /** 单号 + 手机号查单：寄件人/收件人任一手机号均可。 */
  async query(
    site: KuaidiSiteContext,
    input: { orderNo: string; mobile: string },
  ): Promise<KuaidiPublicOrder> {
    const order = await this.findPublicOrder(site, input.orderNo, input.mobile);
    const events = await this.prisma.kuaidiOrderEvent.findMany({
      where: { orderId: order.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 100,
    });
    return {
      ...this.toRow(order),
      events: events.map((row) => this.toEvent(row)),
    };
  }

  /** 买家取消：只允许未支付单；已支付必须联系店方登记退款。 */
  async cancel(
    site: KuaidiSiteContext,
    input: { orderNo: string; mobile: string },
  ) {
    const order = await this.findPublicOrder(site, input.orderNo, input.mobile);
    if (order.payState !== 'PENDING') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '订单已支付或已关闭，不能自助取消；如需取消请联系店方客服',
      );
    }
    await this.prisma.$transaction([
      this.prisma.kuaidiOrder.update({
        where: { id: order.id },
        data: {
          payState: 'CLOSED',
          status: 'CANCELLED',
          cancelReason: '买家取消',
          closedAt: new Date(),
          expireAt: null,
        },
      }),
      this.prisma.kuaidiOrderEvent.create({
        data: {
          siteId: site.siteId,
          orderId: order.id,
          status: 'CANCELLED',
          note: '买家取消未支付订单',
          operator: '买家',
        },
      }),
    ]);
    return { ok: true, message: '订单已取消' };
  }

  /** 「我的订单」：按顾客令牌归属，不认端上传的 openid。 */
  async myOrders(
    site: KuaidiSiteContext,
    openid: string,
    query: { page?: number; pageSize?: number; payState?: string },
  ): Promise<PageResponse<KuaidiOrder>> {
    const page = intIn(query.page, 1, 100_000, 1);
    const pageSize = intIn(query.pageSize, 1, 50, 10);
    const where: Record<string, unknown> = {
      siteId: site.siteId,
      openid: openid || '—',
    };
    if (query.payState) where.payState = String(query.payState);
    const [rows, total] = await Promise.all([
      this.prisma.kuaidiOrder.findMany({
        where,
        orderBy: [{ id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.kuaidiOrder.count({ where }),
    ]);
    return pageOf(
      (rows as unknown as OrderRow[]).map((row) => this.toRow(row)),
      total,
      page,
      pageSize,
    );
  }

  // ---------------------------------------------------------------- 公开：支付回调

  /**
   * 支付成功回调：只认「本账号收款账户 + 待支付 + SUCCESS + 金额一致」。
   * 单号全表唯一（账号级小程序一个订单号只属于一个寄件点），查不到才让微信继续重投；
   * 金额不符、单已关闭、账户不符都是确定性结果，不重试。
   */
  async handlePaidNotify(
    input: {
      accountId: number;
      outTradeNo: string;
      transactionId: string;
      tradeState: string;
      amountCents: number;
      mchId: string;
    },
    _ip: string,
  ): Promise<{ handled: boolean; retryable: boolean; message: string }> {
    void _ip;
    const order = await this.prisma.kuaidiOrder.findUnique({
      where: { orderNo: clip(input.outTradeNo, 40) },
    });
    if (!order) {
      return { handled: false, retryable: true, message: '订单暂时查不到' };
    }
    if (order.payAccountId <= 0) {
      return {
        handled: false,
        retryable: false,
        message: '订单未绑定收款账户，拒绝回调，请人工核对',
      };
    }
    if (order.payAccountId !== input.accountId) {
      await this.prisma.kuaidiOrderEvent.create({
        data: {
          siteId: order.siteId,
          orderId: order.id,
          status: order.status,
          note: `支付回调账户不符：订单绑定收款账户 ${order.payAccountId}，回调来自 ${input.accountId}，请人工核对`,
          operator: '微信支付',
        },
      });
      return {
        handled: true,
        retryable: false,
        message: '回调账户与订单不一致',
      };
    }
    if (order.payState === 'PAID') {
      return { handled: true, retryable: false, message: '订单已支付' };
    }
    if (order.payState !== 'PENDING') {
      return {
        handled: true,
        retryable: false,
        message: '订单已关闭，忽略本次回调',
      };
    }
    if (input.tradeState !== 'SUCCESS') {
      return {
        handled: true,
        retryable: false,
        message: `微信支付状态 ${input.tradeState}`,
      };
    }
    const expected = toCents(order.totalAmount);
    if (Math.round(input.amountCents) !== expected) {
      await this.prisma.kuaidiOrderEvent.create({
        data: {
          siteId: order.siteId,
          orderId: order.id,
          status: order.status,
          note: `支付回调金额不符：应付 ${fromCents(expected)} 元，实收 ${fromCents(input.amountCents)} 元，请人工核对`,
          operator: '微信支付',
        },
      });
      return {
        handled: true,
        retryable: false,
        message: '回调金额与订单金额不一致',
      };
    }
    const paidAt = new Date();
    await this.prisma.$transaction([
      this.prisma.kuaidiOrder.update({
        where: { id: order.id },
        data: {
          payState: 'PAID',
          payMode: 'ONLINE',
          transactionId: clip(input.transactionId, 64),
          paidAt,
          expireAt: null,
        },
      }),
      this.prisma.kuaidiOrderEvent.create({
        data: {
          siteId: order.siteId,
          orderId: order.id,
          status: order.status,
          note: `微信支付成功（${fromCents(expected)} 元），等待店方取件`,
          operator: '微信支付',
        },
      }),
    ]);
    if (order.customerId) {
      await this.customers.touchPaid(
        this.prisma,
        order.siteId,
        order.customerId,
        expected,
      );
    }
    return { handled: true, retryable: false, message: '已入账' };
  }

  // ---------------------------------------------------------------- 店主侧

  async list(
    user: CurrentUser,
    siteId: number,
    query: KuaidiOrderListQuery | Record<string, unknown>,
  ): Promise<PageResponse<KuaidiOrder>> {
    const site = await this.sites.requireSite(user, siteId);
    const { page, pageSize, offset } = pageArgs(query);
    const raw = query as Record<string, unknown>;
    const where: Record<string, unknown> = { siteId: site.siteId };
    if (typeof raw.status === 'string') where.status = raw.status;
    if (typeof raw.payState === 'string') where.payState = raw.payState;
    const range = dayRange(raw.from, raw.to);
    if (range.gte || range.lte) where.createdAt = range;
    const keyword = clip(raw.keyword, 60).trim();
    if (keyword) {
      where.OR = [
        { orderNo: { contains: keyword.toUpperCase() } },
        { trackingNo: { contains: keyword } },
        { companyName: { contains: keyword } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.kuaidiOrder.findMany({
        where,
        orderBy: [{ id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.kuaidiOrder.count({ where }),
    ]);
    return pageOf(
      (rows as unknown as OrderRow[]).map((row) => this.toRow(row)),
      total,
      page,
      pageSize,
    );
  }

  async detail(
    user: CurrentUser,
    siteId: number,
    id: number,
  ): Promise<KuaidiOrderDetail> {
    const site = await this.sites.requireSite(user, requireSiteId(siteId));
    const row = await this.prisma.kuaidiOrder.findFirst({
      where: { id: Number(id), siteId: site.siteId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    const [events, customer] = await Promise.all([
      this.prisma.kuaidiOrderEvent.findMany({
        where: { orderId: row.id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 200,
      }),
      row.customerId
        ? this.prisma.kuaidiCustomer.findFirst({
            where: { id: row.customerId, siteId: site.siteId },
            select: { nickname: true },
          })
        : Promise.resolve(null),
    ]);
    return {
      ...this.toRow(row),
      events: events.map((item) => this.toEvent(item)),
      customerNickname: customer?.nickname || '',
    };
  }

  /**
   * 店主动作：支付登记、取件、运输、签收、完成、异常、取消、退款登记。
   * 所有状态推进都在事务里写订单 + 追加轨迹，失败不留半条账。
   */
  async action(user: CurrentUser, body: KuaidiOrderActionBody) {
    const site = await this.sites.requireSite(user, requireSiteId(body.siteId));
    const row = await this.prisma.kuaidiOrder.findFirst({
      where: { id: Number(body.id), siteId: site.siteId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    const order = row as unknown as OrderRow;
    const action = body.action;
    const note = clip(body.note, 300).trim();
    const trackingNo = clip(body.trackingNo, 64).trim();
    const now = new Date();
    const currentPay = payState(order.payState);
    const currentStatus = orderState(order.status);

    if (action === 'MARK_PAID') {
      if (currentPay !== 'PENDING') {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '只有待支付订单可以登记收款',
        );
      }
      if (!note) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '登记线下收款请填写收款方式或凭证说明',
        );
      }
      await this.prisma.$transaction([
        this.prisma.kuaidiOrder.update({
          where: { id: order.id },
          data: { payState: 'PAID', paidAt: now, expireAt: null },
        }),
        this.prisma.kuaidiOrderEvent.create({
          data: {
            siteId: site.siteId,
            orderId: order.id,
            status: currentStatus,
            note: `店方登记线下收款：${note}`,
            operator: String(user.userId),
          },
        }),
      ]);
      if (order.customerId) {
        await this.customers.touchPaid(
          this.prisma,
          site.siteId,
          order.customerId,
          toCents(order.totalAmount),
        );
      }
      return this.actionResult(user, site.siteId, order.id, '已登记收款');
    }

    if (action === 'REFUND') {
      if (currentPay !== 'PAID') {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '只有已支付订单可以登记退款',
        );
      }
      await this.prisma.$transaction([
        this.prisma.kuaidiOrder.update({
          where: { id: order.id },
          data: {
            payState: 'REFUNDED',
            status: 'CANCELLED',
            refundedAt: now,
            cancelReason: note || '店方登记退款',
          },
        }),
        this.prisma.kuaidiOrderEvent.create({
          data: {
            siteId: site.siteId,
            orderId: order.id,
            status: 'CANCELLED',
            note: `店方在微信商户平台退款后登记${note ? `：${note}` : ''}（平台不经手资金）`,
            operator: String(user.userId),
          },
        }),
      ]);
      return this.actionResult(
        user,
        site.siteId,
        order.id,
        '退款已登记，请确认微信商户平台退款已完成',
      );
    }

    if (action === 'CANCEL') {
      if (currentPay !== 'PENDING') {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '已支付订单请先登记退款再取消，不能直接取消',
        );
      }
      await this.prisma.$transaction([
        this.prisma.kuaidiOrder.update({
          where: { id: order.id },
          data: {
            payState: 'CLOSED',
            status: 'CANCELLED',
            cancelReason: note || '店方取消',
            closedAt: now,
            expireAt: null,
          },
        }),
        this.prisma.kuaidiOrderEvent.create({
          data: {
            siteId: site.siteId,
            orderId: order.id,
            status: 'CANCELLED',
            note: note || '店方取消未支付订单',
            operator: String(user.userId),
          },
        }),
      ]);
      return this.actionResult(user, site.siteId, order.id, '订单已取消');
    }

    if (currentPay !== 'PAID') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '订单还未收款，请先登记收款或确认微信支付成功后再推进履约',
      );
    }
    const allowed = ACTION_FROM[action];
    if (!allowed.includes(currentStatus)) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `当前状态「${KUAIDI_ORDER_STATE_LABELS[currentStatus] || currentStatus}」不能执行「${actionLabel(action)}」`,
      );
    }
    if (action === 'EXCEPTION' && !note) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '标记异常请填写原因，便于买家与客服跟进',
      );
    }
    if (
      (action === 'PICKUP' || action === 'TRANSIT') &&
      !trackingNo &&
      !order.trackingNo
    ) {
      // 单号不是硬前置：同城/自送也会没有单号，但要提醒店主买家端看不到轨迹
    }
    const nextStatus = ACTION_TO[action];
    const data: Record<string, unknown> = { status: nextStatus };
    if (trackingNo) data.trackingNo = trackingNo;
    await this.prisma.$transaction([
      this.prisma.kuaidiOrder.update({ where: { id: order.id }, data }),
      this.prisma.kuaidiOrderEvent.create({
        data: {
          siteId: site.siteId,
          orderId: order.id,
          status: nextStatus,
          note: note || (trackingNo ? `运单号 ${trackingNo}` : ''),
          operator: String(user.userId),
        },
      }),
    ]);
    return this.actionResult(
      user,
      site.siteId,
      order.id,
      `已更新为「${KUAIDI_ORDER_STATE_LABELS[nextStatus] || nextStatus}」`,
    );
  }

  private async actionResult(
    user: CurrentUser,
    siteId: number,
    orderId: number,
    message: string,
  ) {
    const detail = await this.detail(user, siteId, orderId);
    return {
      ok: true,
      message,
      order: {
        ...detail,
      } as KuaidiOrder,
    };
  }

  /** 超时未付关单：调度器每 60 秒扫一次。 */
  async releaseExpiredOrders() {
    const now = new Date();
    const expired = await this.prisma.kuaidiOrder.findMany({
      where: { payState: 'PENDING', expireAt: { lte: now } },
      select: { id: true, siteId: true },
      take: 500,
    });
    let closed = 0;
    for (const item of expired) {
      const result = await this.prisma.kuaidiOrder.updateMany({
        where: { id: item.id, payState: 'PENDING' },
        data: {
          payState: 'CLOSED',
          status: 'CANCELLED',
          cancelReason: '超时未支付',
          closedAt: now,
          expireAt: null,
        },
      });
      if (!result.count) continue;
      closed += 1;
      await this.prisma.kuaidiOrderEvent
        .create({
          data: {
            siteId: item.siteId,
            orderId: item.id,
            status: 'CANCELLED',
            note: '超过支付时限，系统自动关闭',
            operator: '系统',
          },
        })
        .catch(() => undefined);
    }
    return { orders: closed };
  }

  // ---------------------------------------------------------------- 内部

  private assertOpen(site: KuaidiSiteContext) {
    if (site.status !== 'ONLINE') {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该寄件平台尚未上线营业，暂时无法下单',
      );
    }
  }

  private async findPublicOrder(
    site: KuaidiSiteContext,
    orderNo: string,
    mobile: string,
  ): Promise<OrderRow> {
    const no = clip(orderNo, 40).trim().toUpperCase();
    const phone = clip(mobile, 20).trim();
    if (!no) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写订单号');
    }
    const row = await this.prisma.kuaidiOrder.findFirst({
      where: { siteId: site.siteId, orderNo: no },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    const sender = partyOf(row.sender);
    const receiver = partyOf(row.receiver);
    if (!phone || (sender.mobile !== phone && receiver.mobile !== phone)) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '手机号与订单不符：请输入寄件人或收件人的手机号',
      );
    }
    return row;
  }

  private async uniqueOrderNo(siteId: number): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const orderNo = kuaidiNo();
      const taken = await this.prisma.kuaidiOrder.findFirst({
        where: { siteId, orderNo },
        select: { id: true },
      });
      if (!taken) return orderNo;
    }
    throw new BusinessException(ErrorCode.CONFLICT, '订单号生成失败，请重试');
  }
}

function actionLabel(action: KuaidiOrderAction): string {
  const labels: Record<KuaidiOrderAction, string> = {
    MARK_PAID: '登记已收款',
    ACCEPT: '接单',
    PICKUP: '已取件',
    TRANSIT: '运输中',
    DELIVER: '已签收',
    COMPLETE: '完成订单',
    EXCEPTION: '标记异常',
    CANCEL: '取消订单',
    REFUND: '登记退款',
  };
  return labels[action];
}

/** 保价金额按站点上限截断：买家填 5 万但店方只承保 2 万时，按 2 万计费与承保。 */
function clampInsured(site: KuaidiSiteContext, value: unknown): number {
  const insured = Math.max(0, amount(value));
  if (!site.insuranceEnabled) return 0;
  return site.insuranceMax > 0 ? Math.min(insured, site.insuranceMax) : insured;
}

/** 体积重（cm³/kg）：与 quoteFees 同口径，仅用于落库展示。 */
function volumetricOf(input: {
  length: number;
  width: number;
  height: number;
}): number {
  const volume =
    (Math.max(0, Number(input.length) || 0) *
      Math.max(0, Number(input.width) || 0) *
      Math.max(0, Number(input.height) || 0)) /
    6000;
  return Math.round(volume * 100) / 100;
}
