import {
  type ErrandAddress,
  type ErrandAddressSaveBody,
  type ErrandCouponType,
  type ErrandCustomer,
  type ErrandPublicCouponClaimBody,
  type ErrandPublicCustomerCoupon,
  type ErrandPublicLoginBody,
  type ErrandPublicLoginResult,
} from '@enterprise/contracts';
import { pageOf, type PageResponse } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma';
import type { MiniProgramClient } from '../miniprogram/miniprogram.client';
import type { MiniAppService } from '../private-mini/mini-app.service';
import {
  issueCustomerToken,
  parseCustomerToken,
} from '../private-mini/customer-token';
import type { ErrandSiteService } from './errand.site.service';
import { toolOpen } from '../tool-launch/tool-launch.holder';
import {
  ERRAND_SCENE,
  amount,
  clip,
  fromCents,
  iso,
  jsonList,
  pageArgs,
  toCents,
} from './errand.shared';

type CustomerRow = {
  id: number;
  siteId: number;
  ownerUserId: string;
  openid: string;
  unionid: string;
  nickname: string;
  avatar: string;
  orderCount: number;
  paidOrderCount: number;
  totalAmount: unknown;
  points: number;
  lastOrderAt: Date | null;
  status: boolean;
  createdAt: Date;
};

type AddressRow = {
  id: number;
  siteId: number;
  type: string;
  name: string;
  mobile: string;
  province: string;
  city: string;
  district: string;
  address: string;
  lng: number;
  lat: number;
  isDefault: boolean;
};

export type ErrandCustomerIdentity = {
  siteId: number;
  customerId: number;
  openid: string;
  ownerUserId: string;
};

export type ErrandCouponReservation = {
  ticketId: number;
  couponId: number;
  type: ErrandCouponType;
  discountValue: number;
  minAmount: number;
};

/**
 * C 端顾客：小程序微信登录建档 + 店主侧顾客台账 + 地址簿 + 优惠券领取。
 *
 * 顾客令牌按 scene(=ERRAND)+siteId+customerId 签发，进不了 `/enterprise/**`；
 * 反向的店主查询也一律带 `siteId` 双条件，互不越权。匿名下单不建档。
 */
export class ErrandCustomerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: ErrandSiteService,
    private readonly client: MiniProgramClient,
    private readonly miniApp: MiniAppService,
  ) {}

  // ---------- 店主侧台账 ----------

  async list(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<PageResponse<ErrandCustomer>> {
    const ctx = await this.sites.require(user);
    const { page, pageSize, offset } = pageArgs(query);
    const where: Prisma.ErrandCustomerWhereInput = { siteId: ctx.row.id };
    const keyword = clip(query.keyword, 60).trim();
    if (keyword) {
      where.OR = [
        { nickname: { contains: keyword } },
        { openid: { contains: keyword } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.errandCustomer.findMany({
        where,
        orderBy: [{ id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.errandCustomer.count({ where }),
    ]);
    return pageOf(
      (rows as unknown as CustomerRow[]).map((row) => ({
        id: row.id,
        openid: row.openid,
        nickname: row.nickname,
        avatar: row.avatar,
        orderCount: row.orderCount,
        paidOrderCount: row.paidOrderCount,
        totalAmount: amount(row.totalAmount),
        points: row.points,
        lastOrderAt: row.lastOrderAt ? iso(row.lastOrderAt) : '',
        status: row.status,
        createdAt: iso(row.createdAt),
      })),
      total,
      page,
      pageSize,
    );
  }

  /** 停用顾客：只挡后续登录与下单，历史订单不受影响。 */
  async setStatus(user: CurrentUser, id: number, status: boolean) {
    const ctx = await this.sites.require(user);
    const row = await this.prisma.errandCustomer.findFirst({
      where: { id: Number(id), siteId: ctx.row.id },
      select: { id: true },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '顾客不存在');
    await this.prisma.errandCustomer.update({
      where: { id: row.id },
      data: { status },
    });
    return {
      ok: true,
      message: status
        ? '已恢复该顾客的登录与下单'
        : '已停用该顾客：不能再用微信登录下单，历史订单不受影响',
    };
  }

  // ---------- C 端登录 ----------

  private async siteForLogin(siteCode: string) {
    const found = await this.sites.byCode(siteCode);
    if (!found) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '跑腿站点不存在或已关闭，请返回首页重新进入',
      );
    }
    await this.sites.ensureToolOpen(found.row.ownerUserId);
    return found;
  }

  /** wx.login 的 code → openid → 建档 → 顾客令牌。 */
  async loginByCode(
    body: ErrandPublicLoginBody,
  ): Promise<ErrandPublicLoginResult> {
    const code = clip(body.code, 128).trim();
    if (!code) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '缺少微信登录 code');
    }
    const { row: site } = await this.siteForLogin(body.site);
    const runtime = await this.miniApp.requireRuntime(this.sites.subject(site));
    const session = await this.client.code2Session(runtime, code);
    const row = await this.prisma.errandCustomer.upsert({
      where: { siteId_openid: { siteId: site.id, openid: session.openId } },
      create: {
        siteId: site.id,
        ownerUserId: site.ownerUserId,
        openid: session.openId,
        unionid: session.unionId || '',
      },
      update: session.unionId ? { unionid: session.unionId } : {},
    });
    if (!row.status) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '该微信已被店方限制下单，如需恢复请联系店方客服',
      );
    }
    await this.autoIssue(site.id, row.id);
    return {
      token: issueCustomerToken({
        scene: ERRAND_SCENE,
        shopId: site.id,
        customerId: row.id,
        openid: row.openid,
      }),
      customerId: row.id,
      nickname: row.nickname,
      avatar: row.avatar,
      points: row.points,
    };
  }

  /** 校验顾客令牌并回到站点上下文；越权判定一律以令牌里的 shopId 为准。 */
  async identity(token: string): Promise<ErrandCustomerIdentity> {
    const payload = parseCustomerToken(token);
    if (payload.scene !== ERRAND_SCENE) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '登录状态不适用本跑腿小程序，请重新进入',
      );
    }
    const site = await this.prisma.errandSite.findUnique({
      where: { id: payload.shopId },
      select: { id: true, ownerUserId: true, status: true },
    });
    if (!site || site.status === 'CLOSED') {
      throw new BusinessException(ErrorCode.NOT_FOUND, '站点不存在或已关闭');
    }
    if (!(await toolOpen('errand', site.ownerUserId))) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该跑腿站点尚未启动（或已停服），请店主到「建站管理 → 启动设置」启动后重试',
      );
    }
    const customer = (await this.prisma.errandCustomer.findFirst({
      where: { id: payload.customerId, siteId: payload.shopId },
    })) as unknown as CustomerRow | null;
    if (!customer) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '登录状态已失效，请重新进入小程序',
      );
    }
    if (!customer.status) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '该微信已被店方限制下单，如需恢复请联系店方客服',
      );
    }
    return {
      siteId: payload.shopId,
      customerId: customer.id,
      openid: customer.openid,
      ownerUserId: site.ownerUserId,
    };
  }

  /** 下单时按 openid 建档/更新（匿名 openid 为空，不落顾客表），返回 0 表示匿名单。 */
  async ensureForOrder(
    site: { id: number; ownerUserId: string },
    openid: string,
  ): Promise<number> {
    const normalized = clip(openid, 64).trim();
    if (!normalized) return 0;
    const row = await this.prisma.errandCustomer.upsert({
      where: { siteId_openid: { siteId: site.id, openid: normalized } },
      create: {
        siteId: site.id,
        ownerUserId: site.ownerUserId,
        openid: normalized,
      },
      update: {},
    });
    if (!row.status) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '该微信已被店方限制下单，如需恢复请联系店方客服',
      );
    }
    return row.id;
  }

  async touchOrder(
    db: PrismaService | Prisma.TransactionClient,
    siteId: number,
    customerId: number,
  ): Promise<void> {
    if (!customerId) return;
    await db.errandCustomer.updateMany({
      where: { id: customerId, siteId },
      data: { orderCount: { increment: 1 }, lastOrderAt: new Date() },
    });
  }

  async touchPaid(
    db: PrismaService | Prisma.TransactionClient,
    siteId: number,
    customerId: number,
    cents: number,
  ): Promise<void> {
    if (!customerId) return;
    await db.errandCustomer.updateMany({
      where: { id: customerId, siteId },
      data: {
        paidOrderCount: { increment: 1 },
        totalAmount: { increment: fromCents(Math.max(0, cents)) },
      },
    });
  }

  /** 首次登录自动发券：按 autoIssue 配置给顾客发一张，唯一键保证重复登录不重复发。 */
  private async autoIssue(siteId: number, customerId: number): Promise<void> {
    const coupons = await this.prisma.errandCoupon.findMany({
      where: { siteId, enabled: true, autoIssue: true },
      take: 20,
    });
    if (!coupons.length) return;
    const now = new Date();
    for (const coupon of coupons) {
      if (coupon.endAt && coupon.endAt <= now) continue;
      if (coupon.startAt && coupon.startAt > now) continue;
      if (coupon.total > 0 && coupon.claimed >= coupon.total) continue;
      const exists = await this.prisma.errandCustomerCoupon.findFirst({
        where: { customerId, couponId: coupon.id },
        select: { id: true },
      });
      if (exists) continue;
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.errandCustomerCoupon.create({
            data: {
              siteId,
              customerId,
              couponId: coupon.id,
              expiresAt:
                coupon.endAt ?? new Date(now.getTime() + 30 * 86400_000),
            },
          });
          await tx.errandCoupon.update({
            where: { id: coupon.id },
            data: { claimed: { increment: 1 } },
          });
        });
      } catch {
        // 并发登录撞唯一键：说明已经发过，忽略
      }
    }
  }

  /** 顾客资料：昵称与头像由顾客自己维护，店主台账与评价展示同步可见。 */
  async saveProfile(
    identity: ErrandCustomerIdentity,
    body: { nickname: string; avatar: string },
  ): Promise<{ customerId: number; nickname: string; avatar: string }> {
    const row = await this.prisma.errandCustomer.update({
      where: { id: identity.customerId },
      data: {
        nickname: clip(body.nickname, 60),
        avatar: clip(body.avatar, 500),
      },
    });
    return { customerId: row.id, nickname: row.nickname, avatar: row.avatar };
  }

  /** 顾客当前积分。 */
  async pointsOf(identity: ErrandCustomerIdentity): Promise<number> {
    const row = await this.prisma.errandCustomer.findFirst({
      where: { id: identity.customerId, siteId: identity.siteId },
      select: { points: true },
    });
    return row?.points ?? 0;
  }

  /** 下单抵扣：余额不足直接拒绝，成功后写一条 USE 流水。 */
  async consumePoints(
    tx: Prisma.TransactionClient,
    identity: ErrandCustomerIdentity,
    points: number,
    orderId: number,
    orderNo: string,
  ): Promise<void> {
    if (points <= 0) return;
    const row = await tx.errandCustomer.findFirst({
      where: { id: identity.customerId, siteId: identity.siteId },
      select: { points: true },
    });
    if (!row || row.points < points) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '积分不足，请减少抵扣积分',
      );
    }
    const balanceAfter = row.points - points;
    await tx.errandCustomer.update({
      where: { id: identity.customerId },
      data: { points: { decrement: points } },
    });
    await tx.errandPointTx.create({
      data: {
        siteId: identity.siteId,
        customerId: identity.customerId,
        type: 'USE',
        points: -points,
        balanceAfter,
        orderId,
        orderNo,
        remark: '下单积分抵扣',
      },
    });
  }

  /** 取消/退款：把下单抵扣的积分退回。 */
  async refundPoints(
    tx: Prisma.TransactionClient,
    siteId: number,
    customerId: number,
    points: number,
    orderId: number,
    orderNo: string,
  ): Promise<void> {
    if (!customerId || points <= 0) return;
    const row = await tx.errandCustomer.findFirst({
      where: { id: customerId, siteId },
      select: { points: true },
    });
    if (!row) return;
    const balanceAfter = row.points + points;
    await tx.errandCustomer.update({
      where: { id: customerId },
      data: { points: { increment: points } },
    });
    await tx.errandPointTx.create({
      data: {
        siteId,
        customerId,
        type: 'REFUND',
        points,
        balanceAfter,
        orderId,
        orderNo,
        remark: '订单结案返还积分',
      },
    });
  }

  /** 已完成订单退款：按快照回冲已返积分；余额不足时扣到 0 并如实记差额。 */
  async clawbackPoints(
    tx: Prisma.TransactionClient,
    siteId: number,
    customerId: number,
    points: number,
    orderId: number,
    orderNo: string,
  ): Promise<void> {
    if (!customerId || points <= 0) return;
    const row = await tx.errandCustomer.findFirst({
      where: { id: customerId, siteId },
      select: { points: true },
    });
    if (!row) return;
    const deduct = Math.min(points, Math.max(0, row.points));
    const balanceAfter = row.points - deduct;
    await tx.errandCustomer.update({
      where: { id: customerId },
      data: { points: { decrement: deduct } },
    });
    await tx.errandPointTx.create({
      data: {
        siteId,
        customerId,
        type: 'CLAWBACK',
        points: -deduct,
        balanceAfter,
        orderId,
        orderNo,
        remark: `订单退款回冲返积分（应扣 ${points}，实扣 ${deduct}）`,
      },
    });
  }

  /** 订单完成返积分：按实付金额 × 城市返积分比例。 */
  async earnPoints(
    tx: Prisma.TransactionClient,
    siteId: number,
    customerId: number,
    points: number,
    orderId: number,
    orderNo: string,
  ): Promise<void> {
    if (!customerId || points <= 0) return;
    const row = await tx.errandCustomer.findFirst({
      where: { id: customerId, siteId },
      select: { points: true },
    });
    if (!row) return;
    const balanceAfter = row.points + points;
    await tx.errandCustomer.update({
      where: { id: customerId },
      data: { points: { increment: points } },
    });
    await tx.errandPointTx.create({
      data: {
        siteId,
        customerId,
        type: 'EARN',
        points,
        balanceAfter,
        orderId,
        orderNo,
        remark: '订单完成返积分',
      },
    });
  }

  // ---------- 公开：地址簿 ----------

  async addresses(identity: ErrandCustomerIdentity): Promise<ErrandAddress[]> {
    const rows = await this.prisma.errandAddress.findMany({
      where: { siteId: identity.siteId, openid: identity.openid },
      orderBy: [{ isDefault: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    return (rows as unknown as AddressRow[]).map((row) => this.toAddress(row));
  }

  private toAddress(row: AddressRow): ErrandAddress {
    return {
      id: row.id,
      type: row.type === 'TO' ? 'TO' : 'FROM',
      name: row.name,
      mobile: row.mobile,
      province: row.province,
      city: row.city,
      district: row.district,
      address: row.address,
      lng: Number(row.lng) || 0,
      lat: Number(row.lat) || 0,
      isDefault: row.isDefault,
    };
  }

  async saveAddress(
    identity: ErrandCustomerIdentity,
    body: ErrandAddressSaveBody,
  ): Promise<ErrandAddress> {
    const data = {
      siteId: identity.siteId,
      customerId: identity.customerId,
      openid: identity.openid,
      type: body.type === 'TO' ? 'TO' : 'FROM',
      name: clip(body.name, 40).trim(),
      mobile: clip(body.mobile, 20).trim(),
      province: clip(body.province, 40),
      city: clip(body.city, 40),
      district: clip(body.district, 40),
      address: clip(body.address, 200).trim(),
      lng: Number(body.lng) || 0,
      lat: Number(body.lat) || 0,
      isDefault: body.isDefault === true,
    };
    if (!data.name || !data.address) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请填写联系人和详细地址',
      );
    }
    let row: AddressRow;
    if (body.id > 0) {
      const current = await this.prisma.errandAddress.findFirst({
        where: {
          id: body.id,
          siteId: identity.siteId,
          openid: identity.openid,
        },
      });
      if (!current)
        throw new BusinessException(ErrorCode.NOT_FOUND, '地址不存在');
      row = await this.prisma.errandAddress.update({
        where: { id: current.id },
        data,
      });
    } else {
      row = await this.prisma.errandAddress.create({ data });
    }
    if (data.isDefault) {
      await this.prisma.errandAddress.updateMany({
        where: {
          siteId: identity.siteId,
          openid: identity.openid,
          type: data.type,
          NOT: { id: row.id },
        },
        data: { isDefault: false },
      });
    }
    return this.toAddress(row);
  }

  async removeAddress(identity: ErrandCustomerIdentity, id: number) {
    const row = await this.prisma.errandAddress.findFirst({
      where: {
        id: Number(id),
        siteId: identity.siteId,
        openid: identity.openid,
      },
      select: { id: true },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '地址不存在');
    await this.prisma.errandAddress.delete({ where: { id: row.id } });
    return { ok: true, message: '地址已删除' };
  }

  // ---------- 公开：优惠券 ----------

  async claimCoupon(
    identity: ErrandCustomerIdentity,
    body: ErrandPublicCouponClaimBody,
  ): Promise<ErrandPublicCustomerCoupon> {
    const coupon = await this.prisma.errandCoupon.findFirst({
      where: { id: body.couponId, siteId: identity.siteId, enabled: true },
    });
    if (!coupon)
      throw new BusinessException(ErrorCode.NOT_FOUND, '优惠券不存在或已下架');
    const now = new Date();
    if (coupon.endAt && coupon.endAt <= now) {
      throw new BusinessException(ErrorCode.CONFLICT, '优惠券已过期');
    }
    if (coupon.startAt && coupon.startAt > now) {
      throw new BusinessException(ErrorCode.CONFLICT, '优惠券还未开始发放');
    }
    if (coupon.total > 0 && coupon.claimed >= coupon.total) {
      throw new BusinessException(ErrorCode.CONFLICT, '优惠券已领完');
    }
    const exists = await this.prisma.errandCustomerCoupon.findFirst({
      where: { customerId: identity.customerId, couponId: coupon.id },
      select: { id: true },
    });
    if (exists) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '这张券已经领过了，到「我的券」里查看',
      );
    }
    const expiresAt = coupon.endAt ?? new Date(now.getTime() + 30 * 86400_000);
    const created = await this.prisma.$transaction(async (tx) => {
      const ticket = await tx.errandCustomerCoupon.create({
        data: {
          siteId: identity.siteId,
          customerId: identity.customerId,
          couponId: coupon.id,
          expiresAt,
        },
      });
      await tx.errandCoupon.update({
        where: { id: coupon.id },
        data: { claimed: { increment: 1 } },
      });
      return ticket;
    });
    return {
      id: created.id,
      couponId: coupon.id,
      name: coupon.name,
      type: coupon.type === 'PERCENT' ? 'PERCENT' : 'FIXED',
      discountValue: Number(coupon.discountValue),
      minAmount: amount(coupon.minAmount),
      used: false,
      expiresAt: iso(expiresAt),
    };
  }

  async myCoupons(
    identity: ErrandCustomerIdentity,
  ): Promise<ErrandPublicCustomerCoupon[]> {
    const rows = await this.prisma.errandCustomerCoupon.findMany({
      where: { siteId: identity.siteId, customerId: identity.customerId },
      orderBy: [{ id: 'desc' }],
      take: 100,
    });
    if (!rows.length) return [];
    const coupons = await this.prisma.errandCoupon.findMany({
      where: {
        id: { in: [...new Set(rows.map((row) => row.couponId))] },
        siteId: identity.siteId,
      },
    });
    const byId = new Map(coupons.map((coupon) => [coupon.id, coupon]));
    return rows
      .map((row) => {
        const coupon = byId.get(row.couponId);
        if (!coupon) return null;
        return {
          id: row.id,
          couponId: row.couponId,
          name: coupon.name,
          type: coupon.type === 'PERCENT' ? 'PERCENT' : 'FIXED',
          discountValue: Number(coupon.discountValue),
          minAmount: amount(coupon.minAmount),
          used: row.status !== 'UNUSED',
          expiresAt: row.expiresAt ? iso(row.expiresAt) : '',
        };
      })
      .filter((row): row is ErrandPublicCustomerCoupon => !!row);
  }

  /** 下单前用令牌里的 customerId 校验券归属、状态与门槛，返回可抵扣信息。 */
  async reserveCoupon(
    identity: ErrandCustomerIdentity,
    couponId: number,
    subtotalCents: number,
    serviceType: 'SEND' | 'BUY',
    siteId: number,
    cityId: number,
  ): Promise<ErrandCouponReservation | null> {
    if (!couponId) return null;
    const ticket = await this.prisma.errandCustomerCoupon.findFirst({
      where: {
        id: couponId,
        siteId: identity.siteId,
        customerId: identity.customerId,
        status: 'UNUSED',
      },
    });
    if (!ticket) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '这张优惠券不存在、已被使用或不属于当前账号',
      );
    }
    if (ticket.expiresAt && ticket.expiresAt <= new Date()) {
      throw new BusinessException(ErrorCode.CONFLICT, '优惠券已过期');
    }
    const coupon = await this.prisma.errandCoupon.findFirst({
      where: { id: ticket.couponId, siteId: identity.siteId, enabled: true },
    });
    if (!coupon)
      throw new BusinessException(ErrorCode.CONFLICT, '优惠券已下架');
    if (coupon.cityId > 0 && coupon.cityId !== cityId) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '该券不适用于当前服务城市',
      );
    }
    void siteId;
    const scopes = jsonList<unknown>(coupon.serviceTypes).map((item) =>
      String(item),
    );
    if (scopes.length && !scopes.includes(serviceType)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `该券只适用于「${scopes.map((item) => (item === 'BUY' ? '帮我买' : '帮我送')).join('/')}」`,
      );
    }
    if (coupon.firstOrderOnly) {
      const paid = await this.prisma.errandCustomer.findFirst({
        where: { id: identity.customerId, siteId: identity.siteId },
        select: { paidOrderCount: true },
      });
      if ((paid?.paidOrderCount ?? 0) > 0) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '该券仅限首单使用');
      }
    }
    const minCents = toCents(coupon.minAmount);
    if (minCents > 0 && subtotalCents < minCents) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `该券满 ${amount(coupon.minAmount)} 元可用，当前服务费还不够门槛`,
      );
    }
    return {
      ticketId: ticket.id,
      couponId: coupon.id,
      type: coupon.type === 'PERCENT' ? 'PERCENT' : 'FIXED',
      discountValue: Number(coupon.discountValue),
      minAmount: amount(coupon.minAmount),
    };
  }

  async markCouponUsed(
    db: PrismaService | Prisma.TransactionClient,
    ticketId: number,
    siteId: number,
    orderId: number,
  ): Promise<void> {
    if (!ticketId) return;
    const ticket = await db.errandCustomerCoupon.findFirst({
      where: { id: ticketId, siteId },
      select: { couponId: true, status: true },
    });
    if (!ticket || ticket.status !== 'UNUSED') return;
    await db.errandCustomerCoupon.update({
      where: { id: ticketId },
      data: { status: 'USED', orderId },
    });
    await db.errandCoupon.update({
      where: { id: ticket.couponId },
      data: { used: { increment: 1 } },
    });
  }

  async releaseCoupon(
    db: PrismaService | Prisma.TransactionClient,
    ticketId: number,
    siteId: number,
  ): Promise<void> {
    if (!ticketId) return;
    const ticket = await db.errandCustomerCoupon.findFirst({
      where: { id: ticketId, siteId },
      select: { couponId: true, status: true },
    });
    if (!ticket || ticket.status !== 'USED') return;
    await db.errandCustomerCoupon.update({
      where: { id: ticketId },
      data: { status: 'UNUSED', orderId: 0 },
    });
    await db.errandCoupon.updateMany({
      where: { id: ticket.couponId, used: { gt: 0 } },
      data: { used: { decrement: 1 } },
    });
  }
}
