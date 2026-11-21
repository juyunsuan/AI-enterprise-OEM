import { createSign, randomBytes } from 'node:crypto';
import type { Prisma } from '../../generated/prisma';
import type {
  OnsiteOrderDetail,
  OnsiteOrderRow,
  OnsiteTrade,
} from '@enterprise/contracts';
import { pageOf, pageParam, text } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { allocateNo } from '../common/document-number';
import { resolveSiteUrl } from '../common/site-url';
import type { CurrentUser } from '../auth/current-user';
import type {
  WechatPayClient,
  WechatCredentials,
} from '../points/wechat-pay.client';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { PrismaService } from '../prisma/prisma.service';
import { dayKey, startOfDay } from './onsite.money';
import {
  addonAmountCents,
  CLOSED_STATUSES,
  type OrderAction,
  priceOrder,
  transit,
} from './onsite.order.rules';
import type { OnsiteCityService } from './onsite.city.service';
import type { OnsiteCommissionService } from './onsite.commission.service';
import type { OnsiteMarketingService } from './onsite.marketing.service';
import type { OnsiteWalletService } from './onsite.wallet.service';
import type { OnsiteNotifyService } from './onsite.notify.service';
import type { OnsiteScheduleService } from './onsite.schedule.service';
import type { OnsiteShopService } from './onsite.shop.service';

/** 代客下单与 C 端下单共用的入参。 */
export type CreateOrderInput = {
  staffId: number;
  addressId: number;
  startAt: string;
  items: { serviceId: number; quantity: number }[];
  customerRemark?: string;
  /** 店主代客下单时可指定顾客手机号；匹配不到顾客则要求先建档 */
  customerPhone?: string;
  /** 用的券票 id（0 = 不用券）；Owner 代客下单同样可用 */
  couponTicketId?: number;
  /** 是否用店内余额抵扣 */
  useBalance?: boolean;
};

const roleOfUser = (user: CurrentUser) =>
  user.isAdmin() || user.role === 'PLATFORM_ADMIN' ? 'OWNER' : 'CUSTOMER';

/** 加钟单商户单号：`OA` + 加钟单 id。同一店铺同一商户号下唯一，支付回调按前缀分流。 */
const ADDON_TRADE_PREFIX = 'OA';
const addonTradeNo = (id: number) => `${ADDON_TRADE_PREFIX}${id}`;

/**
 * 上门服务订单：算价、下单、支付、履约打卡、加钟、换人、超时回收。
 *
 * 三道闸门每次都重新算，绝不信任前端传来的金额与「这档可约」：
 * 1. 排期：`schedule.assertBookable`（占用/缓冲/提前量/上限）；
 * 2. 算价：`priceOrder`（服务价含技师差异价 + 物料费 + 车费 − 券）；
 * 3. 状态：`transit`（角色 + 状态双校验，非法迁移直接 409）。
 */
export class OnsiteOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shops: OnsiteShopService,
    private readonly schedule: OnsiteScheduleService,
    private readonly cities: OnsiteCityService,
    private readonly miniApp: MiniAppService,
    private readonly pay: WechatPayClient,
    private readonly notify: OnsiteNotifyService,
    private readonly commission: OnsiteCommissionService,
    private readonly marketing: OnsiteMarketingService,
    private readonly wallet: OnsiteWalletService,
  ) {}

  // ---------- 读 ----------

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
    const where = {
      shopId: shop.shopId,
      ...(text(query.status, 'all') && text(query.status, 'all') !== 'all'
        ? { status: text(query.status, 'all') }
        : {}),
      ...(Number(query.staffId) ? { staffId: Number(query.staffId) } : {}),
      ...(text(query.keyword).trim()
        ? {
            OR: [
              {
                orderNo: { contains: text(query.keyword).trim().slice(0, 40) },
              },
              {
                customerPhone: {
                  contains: text(query.keyword).trim().slice(0, 40),
                },
              },
              {
                customerName: {
                  contains: text(query.keyword).trim().slice(0, 40),
                },
              },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.onsiteOrder.count({ where }),
      this.prisma.onsiteOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    return pageOf(
      await Promise.all(rows.map((row) => this.toRow(row))),
      total,
      page,
      pageSize,
    );
  }

  private async toRow(
    row: Prisma.OnsiteOrderGetPayload<Record<string, never>>,
  ): Promise<OnsiteOrderRow> {
    const items = await this.prisma.onsiteOrderItem.findMany({
      where: { orderId: row.id },
    });
    return {
      id: row.id,
      orderNo: row.orderNo,
      status: row.status,
      payStatus: row.payStatus,
      refundStatus: row.refundStatus,
      serviceMode: row.serviceMode,
      customerId: row.customerId,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      staffId: row.staffId,
      staffName: row.staffName,
      staffPhone: row.staffPhone,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      durationMinutes: row.durationMinutes,
      trueDurationMinutes: row.trueDurationMinutes,
      serviceFeeCents: Math.round(Number(row.serviceFee) * 100),
      travelFeeCents: Math.round(Number(row.travelFee) * 100),
      materialFeeCents: Math.round(Number(row.materialFee) * 100),
      discountCents: Math.round(Number(row.discount) * 100),
      couponAmountCents: Math.round(Number(row.couponAmount) * 100),
      balanceAmountCents: Math.round(Number(row.balanceAmount) * 100),
      payAmountCents: Math.round(Number(row.payAmount) * 100),
      payType: row.payType,
      paidAt: row.paidAt ? row.paidAt.toISOString() : '',
      expireAt: row.expireAt ? row.expireAt.toISOString() : '',
      acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : '',
      departedAt: row.departedAt ? row.departedAt.toISOString() : '',
      arrivedAt: row.arrivedAt ? row.arrivedAt.toISOString() : '',
      serviceStartedAt: row.serviceStartedAt
        ? row.serviceStartedAt.toISOString()
        : '',
      completedAt: row.completedAt ? row.completedAt.toISOString() : '',
      signedAt: row.signedAt ? row.signedAt.toISOString() : '',
      distanceMeters: row.distanceMeters,
      travelFeeSource: row.travelFeeSource,
      reviewed: row.reviewed,
      isAddon: row.isAddon,
      parentOrderId: row.parentOrderId,
      addonCount: row.addonCount,
      settlementStatus: row.settlementStatus,
      settleableAt: row.settleableAt ? row.settleableAt.toISOString() : '',
      ownerRemark: row.ownerRemark,
      customerRemark: row.customerRemark,
      items: items.map((item) => ({
        id: item.id,
        serviceId: item.serviceId,
        title: item.title,
        coverImage: item.coverImage,
        unitPriceCents: Math.round(Number(item.unitPrice) * 100),
        quantity: item.quantity,
        durationMinutes: item.durationMinutes,
        materialFeeCents: Math.round(Number(item.materialFee) * 100),
        payAmountCents: Math.round(Number(item.payAmount) * 100),
        refundableQuantity: item.refundableQuantity,
        refundedQuantity: item.refundedQuantity,
      })),
      createdAt: row.createdAt.toISOString(),
    };
  }

  async detail(user: CurrentUser, shopId: string, orderId: string) {
    const shop = await this.shops.requireShop(user, shopId);
    const row = await this.prisma.onsiteOrder.findFirst({
      where: { id: Number(orderId), shopId: shop.shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    const [base, address, logs, tracks, signature, changes] = await Promise.all(
      [
        this.toRow(row),
        this.prisma.onsiteOrderAddress.findFirst({
          where: { orderId: row.id },
        }),
        this.prisma.onsiteOrderStatusLog.findMany({
          where: { orderId: row.id },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.onsiteOrderTrack.findMany({
          where: { orderId: row.id },
          orderBy: { recordedAt: 'asc' },
        }),
        this.prisma.onsiteOrderSignature.findFirst({
          where: { orderId: row.id },
        }),
        this.prisma.onsiteStaffChange.findMany({
          where: { orderId: row.id },
          orderBy: { createdAt: 'asc' },
        }),
      ],
    );
    const detail: OnsiteOrderDetail = {
      ...base,
      address: address
        ? {
            contactName: address.contactName,
            phone: address.phone,
            province: address.province,
            city: address.city,
            district: address.district,
            detail: address.detail,
            lng: Number(address.lng),
            lat: Number(address.lat),
          }
        : null,
      signature: signature
        ? {
            image: signature.signatureImage,
            signedAt: signature.signedAt.toISOString(),
            confirmedBy: signature.confirmedBy,
          }
        : null,
      timeline: logs.map((log) => ({
        action: log.action,
        fromStatus: log.fromStatus,
        toStatus: log.toStatus,
        operatorRole: log.operatorRole,
        content: log.content,
        at: log.createdAt.toISOString(),
      })),
      tracks: tracks.map((track) => ({
        stage: track.stage,
        address: track.address,
        image: track.image,
        lng: Number(track.lng),
        lat: Number(track.lat),
        at: track.recordedAt.toISOString(),
      })),
      staffChanges: changes.map((item) => ({
        id: item.id,
        fromStaffName: item.fromStaffName,
        toStaffName: item.toStaffName,
        travelFeeDeltaCents: Math.round(Number(item.travelFeeDelta) * 100),
        remark: item.remark,
        at: item.createdAt.toISOString(),
      })),
    };
    return detail;
  }

  // ---------- 试算与下单 ----------

  /**
   * 试算：不写库，给完整金额拆解与可约校验结果。
   * C 端确认页与店主代客下单共用，保证两端看到的是同一份价。
   */
  async preview(
    shop: Awaited<ReturnType<OnsiteShopService['requireShop']>>,
    input: CreateOrderInput,
    /** 传了就必须同时命中 shopId + customerId：C 端不能借别人的地址下单 */
    customerId = 0,
  ) {
    const trade = shop.trade;
    const items = await this.resolveItems(
      shop.shopId,
      input.staffId,
      input.items,
    );
    const start = new Date(input.startAt);
    if (Number.isNaN(start.getTime())) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请选择预约上门时间（格式 2026-11-20T14:00:00）',
      );
    }
    const duration = items.reduce(
      (sum, item) => sum + item.durationMinutes * item.quantity,
      0,
    );
    const staff = input.staffId
      ? await this.schedule.assertBookable({
          shopId: shop.shopId,
          staffId: input.staffId,
          startAt: start,
          durationMinutes: duration,
          trade,
        })
      : null;
    const address = await this.prisma.onsiteCustomerAddress.findFirst({
      where: {
        id: input.addressId,
        shopId: shop.shopId,
        ...(customerId ? { customerId } : {}),
      },
    });
    if (!address) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请先选择服务地址（地址在小程序「我的 → 服务地址」里维护）',
      );
    }
    const fee = await this.cities.computeFee(
      {
        ownerUserId: shop.ownerUserId,
        scene: 'ONSITE',
        shopId: shop.shopId,
        shopName: shop.shopName,
      },
      {
        fromLng: staff ? Number(staff.lng) : 0,
        fromLat: staff ? Number(staff.lat) : 0,
        toLng: Number(address.lng),
        toLat: Number(address.lat),
        cityId: address.cityId || (staff ? staff.cityId : 0),
        serviceId: items[0]?.serviceId ?? 0,
        staffId: input.staffId || 0,
      },
    );
    // 券在这里（试算）先算一次给端上看减免；建单时还会再算一次，防止端上改价。
    // 分类作用域靠 service-category 关联表判断（服务可属多个分类）。
    let coupon: { discountCents: number; ticketId: number } = {
      discountCents: 0,
      ticketId: 0,
    };
    if (input.couponTicketId && customerId) {
      const links = await this.prisma.onsiteServiceCategoryLink.findMany({
        where: {
          shopId: shop.shopId,
          serviceId: { in: items.map((item) => item.serviceId) },
        },
      });
      const categoryOf = new Map(
        links.map((link) => [link.serviceId, link.categoryId]),
      );
      coupon = await this.marketing.quoteTicket(
        shop.shopId,
        customerId,
        Number(input.couponTicketId),
        items.map((item) => ({
          serviceId: item.serviceId,
          categoryId: categoryOf.get(item.serviceId) ?? 0,
          amountCents:
            (item.unitPriceCents + item.materialFeeCents) * item.quantity,
        })),
      );
    }
    const priced = priceOrder({
      items,
      travelFeeCents: trade.travelFeeEnabled ? fee.feeCents : 0,
      discountCents: coupon.discountCents,
    });
    // 余额最多抵到应付 0；不用余额或没登录（店主试算）时为 0
    let balanceCents = 0;
    if (input.useBalance && customerId) {
      const customer = await this.prisma.onsiteCustomer.findFirst({
        where: { id: customerId, shopId: shop.shopId },
      });
      balanceCents = Math.min(
        Math.round(Number(customer?.balance ?? 0) * 100),
        priced.payAmountCents,
      );
    }
    return {
      priced,
      coupon,
      balanceCents,
      durationMinutes: duration,
      startAt: start,
      endAt: new Date(start.getTime() + duration * 60_000),
      address,
      staff,
      fee,
    };
  }

  private async resolveItems(
    shopId: number,
    staffId: number,
    input: { serviceId: number; quantity: number }[],
  ) {
    const wanted = input
      .map((item) => ({
        serviceId: Number(item.serviceId) || 0,
        quantity: Math.min(20, Math.max(1, Math.round(item.quantity) || 1)),
      }))
      .filter((item) => item.serviceId > 0);
    if (!wanted.length) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请选择至少一个服务');
    }
    const services = await this.prisma.onsiteService.findMany({
      where: {
        id: { in: wanted.map((item) => item.serviceId) },
        shopId,
        status: 'ONLINE',
      },
    });
    const prices = staffId
      ? await this.prisma.onsiteServiceStaffPrice.findMany({
          where: {
            shopId,
            staffId,
            serviceId: { in: services.map((row) => row.id) },
          },
        })
      : [];
    const priceOf = new Map(prices.map((row) => [row.serviceId, row]));
    return wanted.map((item) => {
      const service = services.find((row) => row.id === item.serviceId);
      if (!service) {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          `所选服务已下架或不存在，请重新选择（#${item.serviceId}）`,
        );
      }
      const custom = priceOf.get(service.id);
      return {
        serviceId: service.id,
        title: service.title,
        coverImage: service.coverImage,
        quantity: item.quantity,
        unitPriceCents: custom
          ? Math.round(Number(custom.price) * 100)
          : Math.round(Number(service.price) * 100),
        materialFeeCents: Math.round(Number(service.materialFee) * 100),
        durationMinutes: custom?.durationMinutes || service.durationMinutes,
        addonEnabled: service.addonEnabled,
        addonUnitMinutes: service.addonUnitMinutes,
        addonRate: Number(service.addonRate ?? 100),
      };
    });
  }

  /** C 端与店主代客下单共用同一条建单路径，避免两套金额口径。 */
  async create(
    shop: Awaited<ReturnType<OnsiteShopService['requireShop']>>,
    customerId: number,
    input: CreateOrderInput,
    options: { role: string; operatorId: string; ip?: string },
  ) {
    const computed = await this.preview(shop, input, customerId);
    const customer = await this.prisma.onsiteCustomer.findFirst({
      where: { id: customerId, shopId: shop.shopId },
    });
    if (!customer) {
      throw new BusinessException(ErrorCode.UNAUTHORIZED, '请先登录小程序');
    }
    const priced = computed.priced;
    const balanceCents = computed.balanceCents;
    const wechatCents = Math.max(0, priced.payAmountCents - balanceCents);
    // 待支付也占档（见排期服务注释），所以超时关闭任务必须活着
    const expireMinutes = Math.max(1, shop.trade.autoCancelMinutes);
    const now = new Date();
    const order = await this.prisma.$transaction(async (tx) => {
      const orderNo = await allocateNo(tx, 'OS', now, {
        table: 'onsite_orders',
        column: 'order_no',
      });
      const created = await tx.onsiteOrder.create({
        data: {
          shopId: shop.shopId,
          orderNo,
          customerId,
          customerName: customer.nickname || '',
          customerPhone: customer.phone || input.customerPhone || '',
          staffId: computed.staff?.id ?? input.staffId ?? 0,
          staffName: computed.staff?.name ?? '',
          staffPhone: computed.staff?.phone ?? '',
          status: 'PENDING_PAYMENT',
          payStatus: 'UNPAID',
          serviceMode: 'DOOR',
          addressId: computed.address.id,
          startAt: computed.startAt,
          endAt: computed.endAt,
          durationMinutes: priced.durationMinutes,
          trueDurationMinutes: priced.durationMinutes,
          serviceFee: Number((priced.serviceFeeCents / 100).toFixed(2)),
          trueServiceFee: Number((priced.serviceFeeCents / 100).toFixed(2)),
          travelFee: Number((priced.travelFeeCents / 100).toFixed(2)),
          trueTravelFee: Number((priced.travelFeeCents / 100).toFixed(2)),
          materialFee: Number((priced.materialFeeCents / 100).toFixed(2)),
          discount: Number((priced.discountCents / 100).toFixed(2)),
          couponTicketId: computed.coupon.ticketId,
          couponAmount: Number((priced.discountCents / 100).toFixed(2)),
          balanceAmount: Number((balanceCents / 100).toFixed(2)),
          payAmount: Number((wechatCents / 100).toFixed(2)),
          payType:
            balanceCents === 0
              ? 'WECHAT'
              : wechatCents === 0
                ? 'BALANCE'
                : 'MIXED',
          expireAt: new Date(now.getTime() + expireMinutes * 60_000),
          distanceMeters: computed.fee.distanceMeters,
          travelFeeSource: computed.fee.source,
          travelFeeRuleNote: `${computed.fee.ruleHit}${
            computed.fee.note ? `｜${computed.fee.note}` : ''
          }`.slice(0, 300),
          cityId: computed.address.cityId || 0,
          customerRemark: String(input.customerRemark || '').slice(0, 300),
          createdIp: String(options.ip || '').slice(0, 64),
        },
      });
      await tx.onsiteOrderItem.createMany({
        data: priced.items.map((item) => ({
          orderId: created.id,
          shopId: shop.shopId,
          serviceId: item.serviceId,
          title: item.title ?? '',
          coverImage: item.coverImage ?? '',
          unitPrice: Number((item.unitPriceCents / 100).toFixed(2)),
          quantity: item.quantity,
          durationMinutes: item.durationMinutes,
          materialFee: Number((item.materialFeeCents / 100).toFixed(2)),
          couponDiscount: Number((item.couponDiscountCents / 100).toFixed(2)),
          payAmount: Number((item.payAmountCents / 100).toFixed(2)),
          refundableQuantity: item.quantity,
        })),
      });
      await tx.onsiteOrderAddress.create({
        data: {
          orderId: created.id,
          shopId: shop.shopId,
          contactName: computed.address.contactName,
          phone: computed.address.phone,
          province: computed.address.province,
          city: computed.address.city,
          district: computed.address.district,
          detail: computed.address.detail,
          lng: Number(computed.address.lng),
          lat: Number(computed.address.lat),
          cityId: computed.address.cityId || 0,
          staffLng: computed.staff ? Number(computed.staff.lng) : 0,
          staffLat: computed.staff ? Number(computed.staff.lat) : 0,
          staffAddress: computed.staff?.address ?? '',
        },
      });
      if (computed.coupon.ticketId) {
        // 券与订单同事务核销：券被并发用掉时这里直接报错，不会出现「订单生成了券没扣」
        await this.marketing.consumeTicket(tx, {
          shopId: shop.shopId,
          customerId,
          ticketId: computed.coupon.ticketId,
          orderId: created.id,
        });
      }
      if (balanceCents > 0) {
        await this.wallet.creditBalance(tx, {
          shopId: shop.shopId,
          customerId,
          changeCents: -balanceCents,
          type: 'ORDER_PAY',
          relatedOrderId: created.id,
          remark: `订单 ${orderNo} 余额抵扣`,
        });
      }
      await tx.onsiteOrderStatusLog.create({
        data: {
          orderId: created.id,
          shopId: shop.shopId,
          fromStatus: '',
          toStatus: 'PENDING_PAYMENT',
          operatorRole: options.role,
          operatorId: options.operatorId,
          action: 'create',
          content: `下单 ${priced.payAmountCents / 100} 元（含车费 ${
            priced.travelFeeCents / 100
          } 元）`,
        },
      });
      return created;
    });
    this.schedule.invalidate(computed.staff?.id ?? input.staffId);
    if (wechatCents === 0) {
      // 余额把应付抵到 0：直接走一次金额为 0 的支付回调，状态/佣金/邀请奖励与正常支付完全一致
      await this.markPaid(shop.shopId, {
        out_trade_no: order.orderNo,
        transaction_id: `BALANCE${order.id}`,
        trade_state: 'SUCCESS',
        amount: { total: 0 },
      });
    }
    // 下单即预生成 PENDING 佣金（支付才生效）；算佣失败不能拦住下单，店主可在台账里看到缺行
    try {
      await this.commission.generateForOrder(shop.shopId, order.id);
    } catch {
      // 忽略：佣金是运营账，订单才是钱
    }
    await this.notify.orderCreated(shop.shopId, order.id);
    return this.toRow(order);
  }

  /** 派单模式（未指定技师）下，店主把单派给具体技师：重新校验档期与车费差额。 */
  async dispatch(
    user: CurrentUser,
    shopId: string,
    orderId: number,
    staffId: number,
  ) {
    const shop = await this.shops.requireShop(user, shopId);
    return this.dispatchWithShop(shop, orderId, staffId, {
      role: 'OWNER',
      id: user.userId,
    });
  }

  /** 代理端改派：归属由代理令牌校验，这里只做与店主派单同一套算价与留痕。 */
  async dispatchWithShop(
    shop: {
      ownerUserId: string;
      shopId: number;
      shopName: string;
      trade: OnsiteTrade;
    },
    orderId: number,
    staffId: number,
    actor: { role: 'OWNER' | 'AGENT'; id: string },
  ) {
    const order = await this.prisma.onsiteOrder.findFirst({
      where: { id: orderId, shopId: shop.shopId },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    if (!['PENDING_PAYMENT', 'PAID'].includes(order.status)) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '只有待付款或待接单的订单可以派单，请先处理当前状态',
      );
    }
    const staff = await this.schedule.assertBookable({
      shopId: shop.shopId,
      staffId,
      startAt: order.startAt,
      durationMinutes: order.durationMinutes,
      trade: shop.trade,
    });
    const staffRow = await this.prisma.onsiteStaff.findUnique({
      where: { id: staff.id },
    });
    const address = await this.prisma.onsiteOrderAddress.findFirst({
      where: { orderId: order.id },
    });
    const fee = await this.cities.computeFee(
      {
        ownerUserId: shop.ownerUserId,
        scene: 'ONSITE',
        shopId: shop.shopId,
        shopName: shop.shopName,
      },
      {
        fromLng: Number(staffRow?.lng ?? 0),
        fromLat: Number(staffRow?.lat ?? 0),
        toLng: Number(address?.lng ?? 0),
        toLat: Number(address?.lat ?? 0),
        cityId: Number(address?.cityId ?? 0),
        serviceId: 0,
        staffId,
      },
    );
    const oldTravelCents = Math.round(Number(order.travelFee) * 100);
    const newTravelCents = shop.trade.travelFeeEnabled ? fee.feeCents : 0;
    const deltaCents = newTravelCents - oldTravelCents;
    const oldPayCents = Math.round(Number(order.payAmount) * 100);
    const updated = await this.prisma.onsiteOrder.update({
      where: { id: order.id },
      data: {
        staffId,
        staffName: staffRow?.name ?? '',
        staffPhone: staffRow?.phone ?? '',
        travelFee: Number((newTravelCents / 100).toFixed(2)),
        trueTravelFee: Number((newTravelCents / 100).toFixed(2)),
        payAmount: Number(
          (Math.max(0, oldPayCents + deltaCents) / 100).toFixed(2),
        ),
        distanceMeters: fee.distanceMeters,
        travelFeeSource: fee.source,
        travelFeeRuleNote:
          `${fee.ruleHit}｜派单重算${fee.note ? `（${fee.note}）` : ''}`.slice(
            0,
            300,
          ),
      },
    });
    await this.prisma.onsiteOrderStatusLog.create({
      data: {
        orderId: order.id,
        shopId: shop.shopId,
        fromStatus: order.status,
        toStatus: order.status,
        operatorRole: actor.role,
        operatorId: actor.id,
        action: 'dispatch',
        content: `派单给 ${staffRow?.name ?? staffId}，车费${
          deltaCents >= 0 ? '增加' : '减少'
        } ${Math.abs(deltaCents / 100).toFixed(2)} 元`,
      },
    });
    this.schedule.invalidate(staffId);
    await this.notify.orderDispatched(shop.shopId, order.id);
    return this.toRow(updated);
  }

  // ---------- 支付 ----------

  private async payCredentials(
    shopId: number,
  ): Promise<{ credentials: WechatCredentials | null; siteUrl: string }> {
    const siteUrl = await resolveSiteUrl(this.prisma);
    const runtime = await this.miniApp.payRuntime({
      ownerUserId: '',
      scene: 'ONSITE',
      shopId,
      shopName: '',
    });
    if (!runtime || !siteUrl) return { credentials: null, siteUrl };
    return {
      credentials: {
        appId: runtime.appId,
        mchId: runtime.mchId,
        apiv3Key: runtime.apiV3Key,
        certSerial: runtime.certSerial,
        privateKey: runtime.privateKey,
        notifyUrl: `${siteUrl}/api/public/onsite/pay/notify/${shopId}`,
        configured: true,
      },
      siteUrl,
    };
  }

  /**
   * 取支付参数：未配商户号或平台关了收款时返回 `payable:false`，
   * 端上据此显示「联系店铺付款」而不是报错——线下登记也是完整闭环。
   */
  async payParams(shopId: number, orderId: number, openid: string) {
    const order = await this.prisma.onsiteOrder.findFirst({
      where: { id: orderId, shopId },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    if (order.payStatus === 'PAID') {
      return { payable: false, reason: '该订单已支付', params: null };
    }
    if (CLOSED_STATUSES.includes(order.status)) {
      return { payable: false, reason: '订单已关闭，请重新下单', params: null };
    }
    const { credentials } = await this.payCredentials(shopId);
    if (!credentials) {
      return {
        payable: false,
        reason: '店铺尚未开通在线收款，请联系店铺确认后到店面付或转账',
        params: null,
      };
    }
    if (!openid) {
      return {
        payable: false,
        reason: '登录状态已失效，请重新进入小程序',
        params: null,
      };
    }
    return this.jsapiParams(credentials, {
      outTradeNo: order.orderNo,
      description: `上门服务-${order.orderNo.slice(-8)}`,
      amountCents: Math.round(Number(order.payAmount) * 100),
      openid,
    });
  }

  /** JSAPI 下单 + 调起签名：主单与加钟单共用，避免两处签名逻辑漂移。 */
  private async jsapiParams(
    credentials: WechatCredentials,
    input: {
      outTradeNo: string;
      description: string;
      amountCents: number;
      openid: string;
    },
  ) {
    const prepay = await this.pay.jsapi(credentials, {
      outTradeNo: input.outTradeNo,
      description: input.description,
      amountCents: input.amountCents,
      openid: input.openid,
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonceStr = randomBytes(16).toString('hex');
    const packageValue = `prepay_id=${prepay}`;
    // 微信支付 v3 JSAPI 调起签名：appId\n时间戳\n随机串\nprepay_id\n
    const signMessage = [
      credentials.appId,
      timestamp,
      nonceStr,
      packageValue,
      '',
    ].join('\n');
    const signer = createSign('RSA-SHA256');
    signer.update(signMessage);
    return {
      payable: true,
      reason: '',
      params: {
        timeStamp: timestamp,
        nonceStr,
        package: packageValue,
        signType: 'RSA',
        paySign: signer.sign(credentials.privateKey, 'base64'),
      },
    };
  }

  /** 微信回调落库：验签在调用方（public 路由）完成，这里只做幂等与金额核对。 */
  async markPaid(
    shopId: number,
    transaction: {
      out_trade_no?: string;
      transaction_id?: string;
      trade_state?: string;
      amount?: { total?: number };
    },
  ) {
    const orderNo = String(transaction.out_trade_no || '');
    if (!orderNo) return { handled: false, reason: '缺少商户订单号' };
    if (orderNo.startsWith(ADDON_TRADE_PREFIX))
      return this.markAddonPaid(shopId, orderNo, transaction);
    if (String(transaction.trade_state || '') !== 'SUCCESS') {
      return { handled: false, reason: `支付状态 ${transaction.trade_state}` };
    }
    const order = await this.prisma.onsiteOrder.findFirst({
      where: { shopId, orderNo },
    });
    if (!order) return { handled: false, reason: '订单不存在' };
    const totalCents = Number(transaction.amount?.total ?? 0);
    const expectCents = Math.round(Number(order.payAmount) * 100);
    if (totalCents !== expectCents) {
      // 金额不符只留痕不改状态：宁可漏更新，也不要把别人的钱记到这张单上
      await this.prisma.onsiteOrderStatusLog.create({
        data: {
          orderId: order.id,
          shopId,
          fromStatus: order.status,
          toStatus: order.status,
          operatorRole: 'SYSTEM',
          operatorId: '',
          action: 'payAmountMismatch',
          content: `回调金额 ${totalCents} 分与订单 ${expectCents} 分不符，未改状态`,
        },
      });
      return { handled: false, reason: '金额不符' };
    }
    if (order.payStatus === 'PAID')
      return { handled: true, reason: '重复回调' };
    const next = transit({
      action: 'pay',
      status: order.status,
      payStatus: order.payStatus,
      refundStatus: order.refundStatus,
      role: 'SYSTEM',
    });
    const flowNo = `PF${orderNo}`;
    await this.prisma.$transaction(async (tx) => {
      await tx.onsiteOrder.update({
        where: { id: order.id },
        data: {
          status: next.status,
          payStatus: next.payStatus,
          paidAt: new Date(),
          transactionId: String(transaction.transaction_id || '').slice(0, 64),
        },
      });
      // 收款台账幂等：同一 orderNo 只留一条，重复回调不再累加可退额度
      const existing = await tx.onsiteOrderPriceFlow.findFirst({
        where: { flowNo },
      });
      if (!existing) {
        await tx.onsiteOrderPriceFlow.create({
          data: {
            orderId: order.id,
            shopId,
            flowNo,
            type: 'ORDER',
            amount: Number((expectCents / 100).toFixed(2)),
            refundableAmount: Number((expectCents / 100).toFixed(2)),
            transactionId: String(transaction.transaction_id || '').slice(
              0,
              64,
            ),
            paidAt: new Date(),
          },
        });
      }
      await tx.onsiteOrderStatusLog.create({
        data: {
          orderId: order.id,
          shopId,
          fromStatus: order.status,
          toStatus: next.status,
          operatorRole: 'SYSTEM',
          operatorId: '',
          action: 'pay',
          content: `微信支付成功 ${(expectCents / 100).toFixed(2)} 元`,
        },
      });
    });
    this.schedule.invalidate(order.staffId);
    // 支付后两件事各自兜底：佣金生效失败可人工补，邀请奖励失败记录保持 PENDING 待补
    try {
      await this.commission.activate(order.id);
    } catch {
      // 忽略：佣金台账可补发
    }
    try {
      await this.marketing.rewardInvite(shopId, order.customerId);
    } catch {
      // 忽略：活动记录保持 PENDING
    }
    await this.notify.orderPaid(shopId, order.id);
    return { handled: true, reason: '已置为待接单' };
  }

  /**
   * 加钟单回调：金额核对与幂等口径同主单；加钟只改自己的收款状态，
   * 主单金额是成交快照不回溯，应收以「主单 + 加钟单」两张记录为准。
   */
  private async markAddonPaid(
    shopId: number,
    orderNo: string,
    transaction: {
      transaction_id?: string;
      trade_state?: string;
      amount?: { total?: number };
    },
  ) {
    if (String(transaction.trade_state || '') !== 'SUCCESS') {
      return { handled: false, reason: `支付状态 ${transaction.trade_state}` };
    }
    const addonId = Number(orderNo.slice(ADDON_TRADE_PREFIX.length));
    if (!Number.isInteger(addonId) || addonId <= 0)
      return { handled: false, reason: '加钟单号不合法' };
    const addon = await this.prisma.onsiteAddonOrder.findFirst({
      where: { id: addonId, shopId },
    });
    if (!addon) return { handled: false, reason: '加钟单不存在' };
    const totalCents = Number(transaction.amount?.total ?? 0);
    const expectCents = Math.round(Number(addon.payAmount) * 100);
    if (totalCents !== expectCents) {
      const parent = await this.prisma.onsiteOrder.findUnique({
        where: { id: addon.orderId },
        select: { status: true },
      });
      await this.prisma.onsiteOrderStatusLog.create({
        data: {
          orderId: addon.orderId,
          shopId,
          fromStatus: parent?.status ?? '',
          toStatus: parent?.status ?? '',
          operatorRole: 'SYSTEM',
          operatorId: '',
          action: 'addonPayAmountMismatch',
          content: `加钟回调金额 ${totalCents} 分与加钟单 ${expectCents} 分不符，未改状态`,
        },
      });
      return { handled: false, reason: '金额不符' };
    }
    if (addon.payStatus === 'PAID')
      return { handled: true, reason: '重复回调' };
    const paidAt = new Date();
    await this.prisma.$transaction([
      this.prisma.onsiteAddonOrder.update({
        where: { id: addon.id },
        data: {
          status: 'PAID',
          payStatus: 'PAID',
          paidAt,
          transactionId: String(transaction.transaction_id || '').slice(0, 64),
        },
      }),
      this.prisma.onsiteOrderStatusLog.create({
        data: {
          orderId: addon.orderId,
          shopId,
          fromStatus: '',
          toStatus: '',
          operatorRole: 'SYSTEM',
          operatorId: '',
          action: 'addonPaid',
          content: `加钟 ${addon.durationMinutes} 分钟，微信支付成功 ${(expectCents / 100).toFixed(2)} 元`,
        },
      }),
    ]);
    return { handled: true, reason: '加钟已支付' };
  }

  /** 代客下单时按手机号找顾客（找不到就要求先在小程序里进一次店）。 */
  async resolveCustomerByPhone(shopId: number, phone: string) {
    const value = String(phone || '').trim();
    if (!value) return 0;
    const row = await this.prisma.onsiteCustomer.findFirst({
      where: { shopId, phone: value },
      select: { id: true },
    });
    if (!row) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        `手机号 ${value} 还没有在本店下过单，请让对方先从小程序进入一次（自动建档）再代客下单`,
      );
    }
    return row.id;
  }

  /** 控制器取支付参数用：带出顾客 openid（C 端支付必须有）。 */
  async customerView(shopId: number, orderId: number) {
    const order = await this.prisma.onsiteOrder.findFirst({
      where: { id: orderId, shopId },
      select: { id: true, customerId: true },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    const customer = await this.prisma.onsiteCustomer.findUnique({
      where: { id: order.customerId },
      select: { openid: true },
    });
    return { id: order.id, openid: customer?.openid || '' };
  }

  /** 线下收款登记（没开通微信商户号时的闭环）。 */
  async markPaidOffline(
    user: CurrentUser,
    shopId: string,
    orderId: number,
    remark: string,
  ) {
    const shop = await this.shops.requireShop(user, shopId);
    const order = await this.prisma.onsiteOrder.findFirst({
      where: { id: orderId, shopId: shop.shopId },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    if (order.payStatus === 'PAID') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该订单已收款，无需重复登记',
      );
    }
    const cents = Math.round(Number(order.payAmount) * 100);
    const next = transit({
      action: 'pay',
      status: order.status,
      payStatus: order.payStatus,
      refundStatus: order.refundStatus,
      role: 'OWNER',
    });
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.onsiteOrder.update({
        where: { id: order.id },
        data: {
          status: next.status,
          payStatus: next.payStatus,
          payType: 'OFFLINE',
          paidAt: new Date(),
        },
      });
      await tx.onsiteOrderPriceFlow.create({
        data: {
          orderId: order.id,
          shopId: shop.shopId,
          flowNo: `PF${order.orderNo}`,
          type: 'OFFLINE',
          amount: Number((cents / 100).toFixed(2)),
          refundableAmount: Number((cents / 100).toFixed(2)),
          paidAt: new Date(),
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
          action: 'payOffline',
          content: `线下收款登记 ${(cents / 100).toFixed(2)} 元${remark ? `：${remark}` : ''}`,
        },
      });
      return row;
    });
    try {
      await this.commission.activate(order.id);
    } catch {
      // 忽略：佣金台账可补发
    }
    try {
      await this.marketing.rewardInvite(shop.shopId, order.customerId);
    } catch {
      // 忽略：活动记录保持 PENDING
    }
    await this.notify.orderPaid(shop.shopId, order.id);
    return this.toRow(updated);
  }

  // ---------- 履约 ----------

  /** 状态推进统一入口：打卡动作带坐标与照片，落 track + status log。 */
  async advance(
    user: CurrentUser,
    shopId: string,
    input: {
      orderId: number;
      action: OrderAction;
      content?: string;
      image?: string;
      lng?: number;
      lat?: number;
      address?: string;
    },
  ) {
    const shop = await this.shops.requireShop(user, shopId);
    const order = await this.prisma.onsiteOrder.findFirst({
      where: { id: input.orderId, shopId: shop.shopId },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    return this.applyTransition(
      shop.shopId,
      order,
      input.action,
      roleOfUser(user),
      user.userId,
      {
        content: input.content,
        image: input.image,
        lng: input.lng,
        lat: input.lat,
        address: input.address,
      },
    );
  }

  /** 免会话版本（C 端签收、技师端推进）共用。 */
  async applyTransition(
    shopId: number,
    order: Prisma.OnsiteOrderGetPayload<Record<string, never>>,
    action: OrderAction,
    role: string,
    operatorId: string,
    extra: {
      content?: string;
      image?: string;
      lng?: number;
      lat?: number;
      address?: string;
      restoreTo?: string;
    } = {},
  ) {
    if (action === 'arrive' && !extra.image) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '到达客户地址后请先拍照再确认（照片是服务开始时间与到场举证，纠纷时要用）',
      );
    }
    const next = transit({
      action,
      status: order.status,
      payStatus: order.payStatus,
      refundStatus: order.refundStatus,
      role,
      restoreTo: extra.restoreTo,
    });
    const stamp = next.stamp ?? { column: 'updatedAt', at: new Date() };
    const data: Record<string, unknown> = {
      status: next.status,
      payStatus: next.payStatus,
      refundStatus: next.refundStatus,
      [stamp.column]: stamp.at,
    };
    if (action === 'reject')
      data.rejectReason = String(extra.content || '').slice(0, 200);
    if (action === 'depart') {
      data.departedAddress = String(extra.address || '').slice(0, 200);
      data.departedLng = Number(extra.lng) || 0;
      data.departedLat = Number(extra.lat) || 0;
      data.tripStartAddress = String(extra.address || '').slice(0, 200);
    }
    if (action === 'arrive') {
      data.arrivalImage = String(extra.image || '').slice(0, 500);
      data.arrivalAddress = String(extra.address || '').slice(0, 200);
      data.tripEndAddress = String(extra.address || '').slice(0, 200);
    }
    if (action === 'complete') {
      data.leaveImage = String(extra.image || '').slice(0, 500);
      data.leaveAddress = String(extra.address || '').slice(0, 200);
      data.leaveLng = Number(extra.lng) || 0;
      data.leaveLat = Number(extra.lat) || 0;
      // 完成后进入「可提现等待期」，参考源码 can_tx_time 的语义
      const trade = await this.shops.tradeById(shopId);
      data.settleableAt = new Date(
        Date.now() + Math.max(0, trade.canTxHours) * 60 * 60 * 1000,
      );
      data.settlementStatus = 'NONE';
    }
    if (action === 'sign') data.signedAt = stamp.at;
    const updated = await this.prisma.onsiteOrder.update({
      where: { id: order.id },
      data,
    });
    await this.prisma.onsiteOrderStatusLog.create({
      data: {
        orderId: order.id,
        shopId,
        fromStatus: order.status,
        toStatus: next.status,
        operatorRole: role,
        operatorId,
        action,
        content: String(extra.content || '').slice(0, 500),
        images: extra.image ? [extra.image] : [],
      },
    });
    if (['depart', 'arrive', 'start', 'complete'].includes(action)) {
      await this.prisma.onsiteOrderTrack.create({
        data: {
          orderId: order.id,
          shopId,
          stage: action,
          lng: Number(extra.lng) || 0,
          lat: Number(extra.lat) || 0,
          address: String(extra.address || '').slice(0, 200),
          image: String(extra.image || '').slice(0, 500),
        },
      });
    }
    if (action === 'complete') {
      await this.settleWorklog(shopId, updated);
    }
    this.schedule.invalidate(order.staffId);
    await this.notify.statusChanged(shopId, updated.id, action);
    return this.toRow(updated);
  }

  /** 完成时记工时（真实时长按扣除退款后的时长算）。 */
  private async settleWorklog(
    shopId: number,
    order: Prisma.OnsiteOrderGetPayload<Record<string, never>>,
  ) {
    if (!order.staffId) return;
    const started = order.serviceStartedAt ?? order.completedAt ?? new Date();
    const minutes = Math.max(
      0,
      Math.round(
        (new Date(order.completedAt ?? new Date()).getTime() -
          started.getTime()) /
          60_000,
      ),
    );
    await this.prisma.onsiteStaffWorkLog
      .createMany({
        data: [
          {
            shopId,
            staffId: order.staffId,
            orderId: order.id,
            day: dayKey(order.startAt),
            minutes:
              order.trueDurationMinutes || order.durationMinutes || minutes,
            trueMinutes:
              order.trueDurationMinutes || order.durationMinutes || minutes,
            type: 'SERVICE',
          },
          {
            shopId,
            staffId: order.staffId,
            orderId: order.id,
            day: dayKey(order.startAt),
            minutes: Math.max(
              0,
              minutes - (order.trueDurationMinutes || order.durationMinutes),
            ),
            trueMinutes: 0,
            type: 'TRAVEL',
          },
        ],
      })
      .catch(() => undefined);
    await this.prisma.onsiteStaff
      .update({
        where: { id: order.staffId },
        data: { orderCountTrue: { increment: 1 } },
      })
      .catch(() => undefined);
    const items = await this.prisma.onsiteOrderItem.findMany({
      where: { orderId: order.id },
    });
    for (const item of items) {
      await this.prisma.onsiteService
        .update({
          where: { id: item.serviceId },
          data: { salesTrue: { increment: item.quantity } },
        })
        .catch(() => undefined);
    }
  }

  /** 手写签名（完工确认凭证）。 */
  async sign(
    shopId: number,
    orderId: number,
    input: { image: string; role: string; operatorId: string },
  ) {
    const order = await this.prisma.onsiteOrder.findFirst({
      where: { id: orderId, shopId },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    if (!input.image.trim()) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请先让客户手写签名后再提交',
      );
    }
    await this.prisma.onsiteOrderSignature.upsert({
      where: { orderId },
      create: {
        orderId,
        shopId,
        signatureImage: input.image.trim().slice(0, 500),
        confirmedBy: input.role === 'CUSTOMER' ? 'CUSTOMER' : 'STAFF',
      },
      update: {
        signatureImage: input.image.trim().slice(0, 500),
        signedAt: new Date(),
        confirmedBy: input.role === 'CUSTOMER' ? 'CUSTOMER' : 'STAFF',
      },
    });
    if (order.status === 'COMPLETED') {
      return this.applyTransition(
        shopId,
        order,
        'sign',
        input.role,
        input.operatorId,
        {
          content: '客户已签字确认服务完成',
        },
      );
    }
    return this.toRow(order);
  }

  /** 加钟：在原单时间段后顺加，金额按加钟费率，占用继续参与排期。 */
  async addon(
    shopId: number,
    orderId: number,
    input: {
      orderItemId: number;
      quantity: number;
      role: string;
      operatorId: string;
    },
  ) {
    const order = await this.prisma.onsiteOrder.findFirst({
      where: { id: orderId, shopId },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    if (
      !['ACCEPTED', 'EN_ROUTE', 'ON_SITE', 'SERVING'].includes(order.status)
    ) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '只有在途订单可以加钟（未派单或已完成请先处理订单状态）',
      );
    }
    const item = await this.prisma.onsiteOrderItem.findFirst({
      where: { id: input.orderItemId, orderId: order.id, shopId },
    });
    if (!item)
      throw new BusinessException(ErrorCode.NOT_FOUND, '加钟的服务明细不存在');
    // 能不能加钟看服务本身（明细行只存成交快照，不存能力位）
    const service = await this.prisma.onsiteService.findFirst({
      where: { id: item.serviceId, shopId },
    });
    if (!service?.addonEnabled) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `「${item.title}」不支持加钟，请到「服务目录」里打开加钟开关`,
      );
    }
    const quantity = Math.min(10, Math.max(1, Math.round(input.quantity) || 1));
    const trade = await this.shops.tradeById(shopId);
    const amountCents = addonAmountCents({
      unitPriceCents: Math.round(Number(item.unitPrice) * 100),
      quantity,
      addonRate: 100,
    });
    const duration = item.durationMinutes * quantity;
    const addonOrder = await this.prisma.onsiteAddonOrder.create({
      data: {
        shopId,
        orderId: order.id,
        orderItemId: item.id,
        customerId: order.customerId,
        staffId: order.staffId,
        quantity,
        durationMinutes: duration,
        amount: Number((amountCents / 100).toFixed(2)),
        payAmount: Number((amountCents / 100).toFixed(2)),
        status: 'PENDING_PAYMENT',
        payStatus: 'UNPAID',
        expireAt: new Date(
          Date.now() + Math.max(1, trade.autoCancelMinutes) * 60_000,
        ),
      },
    });
    const newEnd = new Date(order.endAt.getTime() + duration * 60_000);
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.onsiteOrder.update({
        where: { id: order.id },
        data: {
          endAt: newEnd,
          durationMinutes: order.durationMinutes + duration,
          trueDurationMinutes: order.trueDurationMinutes + duration,
          isAddon: true,
          addonCount: { increment: quantity },
        },
      });
      await tx.onsiteOrderStatusLog.create({
        data: {
          orderId: order.id,
          shopId,
          fromStatus: order.status,
          toStatus: order.status,
          operatorRole: input.role,
          operatorId: input.operatorId,
          action: 'addon',
          content: `加钟 ${duration} 分钟，金额 ${(amountCents / 100).toFixed(2)} 元（待付）`,
        },
      });
      return row;
    });
    this.schedule.invalidate(order.staffId);
    return {
      addonId: addonOrder.id,
      endAt: newEnd.toISOString(),
      order: await this.toRow(updated),
    };
  }

  /** 顾客取消（仅未付款）与超时回收。 */
  async cancel(
    user: CurrentUser,
    shopId: string,
    orderId: number,
    reason: string,
  ) {
    const shop = await this.shops.requireShop(user, shopId);
    const order = await this.prisma.onsiteOrder.findFirst({
      where: { id: orderId, shopId: shop.shopId },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    const next = transit({
      action: 'cancel',
      status: order.status,
      payStatus: order.payStatus,
      refundStatus: order.refundStatus,
      role: roleOfUser(user),
    });
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.onsiteOrder.update({
        where: { id: order.id },
        data: { status: next.status },
      });
      await tx.onsiteOrderStatusLog.create({
        data: {
          orderId: order.id,
          shopId: shop.shopId,
          fromStatus: order.status,
          toStatus: next.status,
          operatorRole: roleOfUser(user),
          operatorId: user.userId,
          action: 'cancel',
          content: reason.slice(0, 200) || '顾客取消',
        },
      });
      return row;
    });
    this.schedule.invalidate(order.staffId);
    return this.toRow(updated);
  }

  // ---------- C 端视图（一律按 shopId + customerId 双条件）----------

  /** 确认页试算：只回金额与档期结论，不回地址全文（端上本来就有）。 */
  async publicPreview(
    shop: Awaited<ReturnType<OnsiteShopService['requireShop']>>,
    customerId: number,
    input: Omit<CreateOrderInput, 'customerPhone'>,
  ) {
    const computed = await this.preview(
      shop,
      { ...input, customerPhone: '' },
      customerId,
    );
    return {
      items: computed.priced.items.map((item) => ({
        serviceId: item.serviceId,
        title: item.title ?? '',
        unitPriceCents: item.unitPriceCents,
        quantity: item.quantity,
        durationMinutes: item.durationMinutes,
        materialFeeCents: item.materialFeeCents,
        couponDiscountCents: item.couponDiscountCents,
        payAmountCents: item.payAmountCents,
      })),
      serviceFeeCents: computed.priced.serviceFeeCents,
      materialFeeCents: computed.priced.materialFeeCents,
      travelFeeCents: computed.priced.travelFeeCents,
      discountCents: computed.priced.discountCents,
      payAmountCents: computed.priced.payAmountCents,
      durationMinutes: computed.priced.durationMinutes,
      startAt: computed.startAt.toISOString(),
      endAt: computed.endAt.toISOString(),
      distanceMeters: computed.fee.distanceMeters,
      travelFeeSource: computed.fee.source,
      travelFeeNote: computed.fee.note,
      staffName: computed.staff?.name ?? '由店铺派单',
    };
  }

  async publicList(
    shopId: number,
    customerId: number,
    page: number,
    pageSize: number,
  ) {
    const where = { shopId, customerId };
    const [total, rows] = await Promise.all([
      this.prisma.onsiteOrder.count({ where }),
      this.prisma.onsiteOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const list = [];
    for (const row of rows) list.push(await this.toRow(row));
    return { list, total, page, pageSize };
  }

  async publicDetail(shopId: number, customerId: number, orderId: number) {
    const row = await this.prisma.onsiteOrder.findFirst({
      where: { id: orderId, shopId, customerId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    const [base, address, signature, tracks, addons] = await Promise.all([
      this.toRow(row),
      this.prisma.onsiteOrderAddress.findFirst({ where: { orderId: row.id } }),
      this.prisma.onsiteOrderSignature.findFirst({
        where: { orderId: row.id },
      }),
      this.prisma.onsiteOrderTrack.findMany({
        where: { orderId: row.id },
        orderBy: { recordedAt: 'asc' },
      }),
      this.prisma.onsiteAddonOrder.findMany({
        where: { orderId: row.id },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      ...base,
      address: address
        ? {
            contactName: address.contactName,
            phone: address.phone,
            province: address.province,
            city: address.city,
            district: address.district,
            detail: address.detail,
            lng: Number(address.lng),
            lat: Number(address.lat),
          }
        : null,
      signature: signature
        ? {
            image: signature.signatureImage,
            signedAt: signature.signedAt.toISOString(),
          }
        : null,
      // 加钟记录：待付的由端上给「去支付」，已付的只做金额回显
      addons: addons.map((addon) => ({
        id: addon.id,
        quantity: addon.quantity,
        durationMinutes: addon.durationMinutes,
        amountCents: Math.round(Number(addon.payAmount) * 100),
        status: addon.status,
        payStatus: addon.payStatus,
        expireAt: addon.expireAt ? addon.expireAt.toISOString() : '',
        paidAt: addon.paidAt ? addon.paidAt.toISOString() : '',
        createdAt: addon.createdAt.toISOString(),
      })),
      // 履约轨迹（出发/到达/开始/完成）带坐标与现场照片，是纠纷举证用的原始凭证
      tracks: tracks.map((track) => ({
        stage: track.stage,
        address: track.address,
        image: track.image,
        lng: Number(track.lng),
        lat: Number(track.lat),
        recordedAt: track.recordedAt.toISOString(),
      })),
      // 端上按钮直接按这个列表渲染，避免小程序里再抄一份状态判断
      actions: this.availableActions(row.status, row.payStatus),
    };
  }

  private availableActions(status: string, payStatus: string) {
    const actions: string[] = [];
    if (status === 'PENDING_PAYMENT') actions.push('pay', 'cancel');
    if (['ACCEPTED', 'EN_ROUTE', 'ON_SITE', 'SERVING'].includes(status))
      actions.push('addon');
    if (status === 'COMPLETED') actions.push('sign');
    if (
      ['COMPLETED', 'SIGNED', 'REVIEWED'].includes(status) &&
      payStatus === 'PAID'
    ) {
      actions.push('review', 'refund');
    }
    if (status === 'REFUND_PENDING') actions.push('refundDetail');
    return actions;
  }

  private async ownedOrder(
    shopId: number,
    customerId: number,
    orderId: number,
  ) {
    const row = await this.prisma.onsiteOrder.findFirst({
      where: { id: orderId, shopId, customerId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    return row;
  }

  async publicCancel(
    shopId: number,
    customerId: number,
    orderId: number,
    reason: string,
  ) {
    const order = await this.ownedOrder(shopId, customerId, orderId);
    const next = transit({
      action: 'cancel',
      status: order.status,
      payStatus: order.payStatus,
      refundStatus: order.refundStatus,
      role: 'CUSTOMER',
    });
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.onsiteOrder.update({
        where: { id: order.id },
        data: { status: next.status },
      });
      await tx.onsiteOrderStatusLog.create({
        data: {
          orderId: order.id,
          shopId,
          fromStatus: order.status,
          toStatus: next.status,
          operatorRole: 'CUSTOMER',
          operatorId: String(customerId),
          action: 'cancel',
          content: reason.slice(0, 200) || '顾客取消',
        },
      });
      return row;
    });
    this.schedule.invalidate(order.staffId);
    return this.toRow(updated);
  }

  async publicPayParams(
    shopId: number,
    customerId: number,
    orderId: number,
    openid: string,
  ) {
    const order = await this.ownedOrder(shopId, customerId, orderId);
    return this.payParams(shopId, order.id, openid);
  }

  /**
   * 加钟单支付：加钟是独立待付记录（不改主单金额），所以单独取参数；
   * 商户单号用 `OA+加钟单 id`，回调在 `markPaid` 里按前缀分流。
   */
  async publicAddonPayParams(
    shopId: number,
    customerId: number,
    addonId: number,
    openid: string,
  ) {
    const addon = await this.prisma.onsiteAddonOrder.findFirst({
      where: { id: addonId, shopId, customerId },
    });
    if (!addon)
      throw new BusinessException(ErrorCode.NOT_FOUND, '加钟记录不存在');
    if (addon.payStatus === 'PAID') {
      return { payable: false, reason: '该加钟单已支付', params: null };
    }
    if (
      addon.status !== 'PENDING_PAYMENT' ||
      (addon.expireAt && addon.expireAt.getTime() <= Date.now())
    ) {
      return {
        payable: false,
        reason: '加钟单已超时关闭，请联系店铺重新登记',
        params: null,
      };
    }
    const { credentials } = await this.payCredentials(shopId);
    if (!credentials) {
      return {
        payable: false,
        reason: '店铺尚未开通在线收款，请联系店铺确认后到店面付或转账',
        params: null,
      };
    }
    if (!openid) {
      return {
        payable: false,
        reason: '登录状态已失效，请重新进入小程序',
        params: null,
      };
    }
    const parent = await this.prisma.onsiteOrder.findUnique({
      where: { id: addon.orderId },
      select: { orderNo: true },
    });
    return this.jsapiParams(credentials, {
      outTradeNo: addonTradeNo(addon.id),
      description: `上门服务加钟-${(parent?.orderNo ?? '').slice(-8) || addon.id}`,
      amountCents: Math.round(Number(addon.payAmount) * 100),
      openid,
    });
  }

  async publicSign(
    shopId: number,
    customerId: number,
    orderId: number,
    image: string,
    operatorId: string,
  ) {
    const order = await this.ownedOrder(shopId, customerId, orderId);
    return this.sign(shopId, order.id, { image, role: 'CUSTOMER', operatorId });
  }

  async publicAddon(
    shopId: number,
    customerId: number,
    input: { orderId: number; orderItemId: number; quantity: number },
  ) {
    const order = await this.ownedOrder(shopId, customerId, input.orderId);
    return this.addon(shopId, order.id, {
      orderItemId: input.orderItemId,
      quantity: input.quantity,
      role: 'CUSTOMER',
      operatorId: String(customerId),
    });
  }

  /** 支付回调用：按店铺取商户凭据，未配置回 null（由回调侧拒掉让微信重试）。 */
  async notifyCredentials(shopId: number): Promise<WechatCredentials | null> {
    const { credentials } = await this.payCredentials(shopId);
    return credentials;
  }

  /** 定时任务：超时未付款自动关闭并释放档期。 */
  async sweepExpired(limit = 200) {
    const due = await this.prisma.onsiteOrder.findMany({
      where: {
        status: 'PENDING_PAYMENT',
        expireAt: { lte: new Date() },
      },
      take: limit,
    });
    let closed = 0;
    for (const order of due) {
      try {
        const next = transit({
          action: 'expire',
          status: order.status,
          payStatus: order.payStatus,
          refundStatus: order.refundStatus,
          role: 'SYSTEM',
        });
        await this.prisma.$transaction([
          this.prisma.onsiteOrder.update({
            where: { id: order.id },
            data: { status: next.status },
          }),
          this.prisma.onsiteOrderStatusLog.create({
            data: {
              orderId: order.id,
              shopId: order.shopId,
              fromStatus: order.status,
              toStatus: next.status,
              operatorRole: 'SYSTEM',
              operatorId: '',
              action: 'expire',
              content: '超时未付款，系统自动关闭并释放档期',
            },
          }),
        ]);
        this.schedule.invalidate(order.staffId);
        closed += 1;
      } catch {
        // 状态已被并发修改：跳过这一单，下一轮再看
      }
    }
    return { closed };
  }

  /** 店主备注（不影响金额，只留台账）。 */
  async remark(
    user: CurrentUser,
    shopId: string,
    orderId: number,
    note: string,
  ) {
    const shop = await this.shops.requireShop(user, shopId);
    const order = await this.prisma.onsiteOrder.findFirst({
      where: { id: orderId, shopId: shop.shopId },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    const updated = await this.prisma.onsiteOrder.update({
      where: { id: order.id },
      data: { ownerRemark: note.slice(0, 300) },
    });
    return this.toRow(updated);
  }

  /** 概览页要的当日经营数（不额外开接口）。 */
  async todayStats(shopId: number) {
    const from = startOfDay(new Date());
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    const [pending, serving, completed, paid] = await Promise.all([
      this.prisma.onsiteOrder.count({ where: { shopId, status: 'PAID' } }),
      this.prisma.onsiteOrder.count({
        where: {
          shopId,
          status: { in: ['ACCEPTED', 'EN_ROUTE', 'ON_SITE', 'SERVING'] },
        },
      }),
      this.prisma.onsiteOrder.count({
        where: {
          shopId,
          status: { in: ['COMPLETED', 'SIGNED', 'REVIEWED'] },
          completedAt: { gte: from, lt: to },
        },
      }),
      this.prisma.onsiteOrder.aggregate({
        _sum: { payAmount: true },
        where: { shopId, payStatus: 'PAID', paidAt: { gte: from, lt: to } },
      }),
    ]);
    return {
      awaitingAccept: pending,
      serving,
      completedToday: completed,
      amountTodayCents: Math.round(Number(paid._sum.payAmount ?? 0) * 100),
    };
  }
}
