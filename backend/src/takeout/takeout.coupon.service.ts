import type {
  TakeoutCoupon,
  TakeoutCouponSaveBody,
} from '@enterprise/contracts';
import { pageOf, pageParam } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import { evaluateCoupon, type CouponSpec } from '../commerce-core/pricing';
import { amountOut, clip, iso, jsonList, toCents } from './takeout.shared';

type ShopArgs = { ownerUserId: string; shopId: number };

type CouponRecord = {
  id: number;
  shopId: number;
  name: string;
  type: string;
  value: unknown;
  threshold: unknown;
  totalCount: number;
  receivedCount: number;
  usedCount: number;
  perLimit: number;
  validType: string;
  startAt: Date | null;
  endAt: Date | null;
  validDays: number;
  scope: string;
  scopeIds: unknown;
  status: string;
  createdAt: Date;
};

function toCoupon(row: CouponRecord): TakeoutCoupon {
  return {
    id: row.id,
    name: row.name,
    type: row.type === 'DISCOUNT' ? 'DISCOUNT' : 'FULL_REDUCE',
    value: amountOut(row.value),
    threshold: amountOut(row.threshold),
    totalCount: row.totalCount,
    receivedCount: row.receivedCount,
    usedCount: row.usedCount,
    perLimit: row.perLimit,
    validType: row.validType === 'DAYS' ? 'DAYS' : 'FIXED',
    startAt: iso(row.startAt),
    endAt: iso(row.endAt),
    validDays: row.validDays,
    scope:
      row.scope === 'CATEGORY' || row.scope === 'PRODUCT' ? row.scope : 'ALL',
    scopeIds: jsonList<number>(row.scopeIds).map((id) => Number(id)),
    status:
      row.status === 'OFFLINE' || row.status === 'ENDED'
        ? row.status
        : 'ONLINE',
    createdAt: iso(row.createdAt),
  };
}

export class TakeoutCouponService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    args: ShopArgs,
    query: {
      keyword?: string;
      status?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const { page, pageSize, offset } = pageParam(query.page, query.pageSize);
    const where: Record<string, unknown> = { shopId: args.shopId };
    if (query.status) where.status = query.status;
    const keyword = clip(query.keyword, 40).trim();
    if (keyword) where.name = { contains: keyword };
    const [rows, total] = await Promise.all([
      this.prisma.takeoutCoupon.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      this.prisma.takeoutCoupon.count({ where }),
    ]);
    return pageOf(
      (rows as unknown as CouponRecord[]).map(toCoupon),
      total,
      page,
      pageSize,
    );
  }

  async save(
    args: ShopArgs,
    body: TakeoutCouponSaveBody,
  ): Promise<TakeoutCoupon> {
    const data = {
      name: clip(body.name, 40),
      type: body.type,
      value: body.value,
      threshold: body.threshold,
      totalCount: body.totalCount,
      perLimit: body.perLimit,
      validType: body.validType,
      startAt: body.startAt ? new Date(body.startAt) : null,
      endAt: body.endAt ? new Date(body.endAt) : null,
      validDays: body.validDays,
      scope: body.scope,
      scopeIds: body.scopeIds,
      status: body.status,
    };
    if (body.id) {
      const changed = await this.prisma.takeoutCoupon.updateMany({
        where: { id: body.id, shopId: args.shopId },
        data,
      });
      if (changed.count === 0) {
        throw new BusinessException(ErrorCode.NOT_FOUND, '优惠券不存在');
      }
    } else {
      await this.prisma.takeoutCoupon.create({
        data: { ...data, shopId: args.shopId },
      });
    }
    const row = body.id
      ? await this.prisma.takeoutCoupon.findFirst({
          where: { id: body.id, shopId: args.shopId },
        })
      : await this.prisma.takeoutCoupon.findFirst({
          where: { shopId: args.shopId, name: data.name },
          orderBy: { id: 'desc' },
        });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '优惠券不存在');
    return toCoupon(row);
  }

  async setStatus(args: ShopArgs, id: number, status: string) {
    if (!['ONLINE', 'OFFLINE', 'ENDED'].includes(status)) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '券状态不合法');
    }
    const changed = await this.prisma.takeoutCoupon.updateMany({
      where: { id, shopId: args.shopId },
      data: { status },
    });
    if (changed.count === 0) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '优惠券不存在');
    }
    const row = await this.prisma.takeoutCoupon.findFirst({
      where: { id, shopId: args.shopId },
    });
    return toCoupon(row as unknown as CouponRecord);
  }

  async shopList(shopId: number) {
    const rows = await this.prisma.takeoutCoupon.findMany({
      where: { shopId, status: 'ONLINE' },
      orderBy: { id: 'desc' },
      take: 50,
    });
    return (rows as unknown as CouponRecord[]).map(toCoupon);
  }

  async mine(shopId: number, customerId: number) {
    const tickets = await this.prisma.takeoutCouponTicket.findMany({
      where: { shopId, customerId },
      orderBy: { id: 'desc' },
      take: 100,
    });
    const ids = [...new Set(tickets.map((row) => row.couponId))];
    const coupons = ids.length
      ? await this.prisma.takeoutCoupon.findMany({
          where: { id: { in: ids } },
        })
      : [];
    const map = new Map(
      (coupons as unknown as CouponRecord[]).map((row) => [
        row.id,
        toCoupon(row),
      ]),
    );
    return tickets.map((row) => ({
      ticketId: row.id,
      status: row.status,
      orderId: row.orderId,
      receivedAt: iso(row.receivedAt),
      usedAt: iso(row.usedAt),
      expireAt: iso(row.expireAt),
      coupon: map.get(row.couponId) || null,
    }));
  }

  async receive(shopId: number, customerId: number, couponId: number) {
    const coupon = (await this.prisma.takeoutCoupon.findFirst({
      where: { id: couponId, shopId },
    })) as unknown as CouponRecord | null;
    if (!coupon || coupon.status !== 'ONLINE') {
      throw new BusinessException(ErrorCode.NOT_FOUND, '优惠券不存在或已停发');
    }
    const now = new Date();
    if (coupon.validType === 'FIXED' && coupon.endAt && coupon.endAt < now) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '该券活动已结束');
    }
    if (coupon.startAt && coupon.startAt > now) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '该券还没开始领取');
    }
    if (coupon.totalCount > 0 && coupon.receivedCount >= coupon.totalCount) {
      throw new BusinessException(ErrorCode.CONFLICT, '该券已被领完');
    }
    const owned = await this.prisma.takeoutCouponTicket.count({
      where: { couponId, customerId },
    });
    if (owned >= Math.max(1, coupon.perLimit)) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `该券每人限领 ${Math.max(1, coupon.perLimit)} 张，你已领过`,
      );
    }
    const expireAt =
      coupon.validType === 'DAYS'
        ? new Date(now.getTime() + coupon.validDays * 86_400_000)
        : coupon.endAt;
    const ticket = await this.prisma.takeoutCouponTicket.create({
      data: { shopId, couponId, customerId, status: 'UNUSED', expireAt },
    });
    await this.prisma.takeoutCoupon.update({
      where: { id: couponId },
      data: { receivedCount: { increment: 1 } },
    });
    return { ticketId: ticket.id, expireAt: iso(expireAt) };
  }

  async specOf(
    shopId: number,
    ticketId: number,
  ): Promise<{ spec: CouponSpec | null; reason: string }> {
    const ticket = await this.prisma.takeoutCouponTicket.findFirst({
      where: { id: ticketId, shopId },
    });
    if (!ticket) return { spec: null, reason: '优惠券不存在' };
    if (ticket.status !== 'UNUSED') {
      return { spec: null, reason: '优惠券已使用或已过期' };
    }
    if (ticket.expireAt && ticket.expireAt < new Date()) {
      await this.prisma.takeoutCouponTicket.update({
        where: { id: ticket.id },
        data: { status: 'EXPIRED' },
      });
      return { spec: null, reason: '优惠券已过期' };
    }
    const coupon = (await this.prisma.takeoutCoupon.findFirst({
      where: { id: ticket.couponId },
    })) as unknown as CouponRecord | null;
    if (!coupon || coupon.status === 'ENDED') {
      return { spec: null, reason: '优惠券已失效' };
    }
    return {
      spec: {
        name: coupon.name,
        type: coupon.type === 'DISCOUNT' ? 'DISCOUNT' : 'FULL_REDUCE',
        value:
          coupon.type === 'DISCOUNT'
            ? amountOut(coupon.value)
            : toCents(coupon.value),
        thresholdCents: toCents(coupon.threshold),
        scope:
          coupon.scope === 'CATEGORY' || coupon.scope === 'PRODUCT'
            ? coupon.scope
            : 'ALL',
        scopeIds: jsonList<number>(coupon.scopeIds).map((id) => Number(id)),
      },
      reason: '',
    };
  }

  async availableFor(
    shopId: number,
    customerId: number,
    lines: Array<{ productId: number; categoryId: number; totalPrice: number }>,
  ) {
    const tickets = await this.prisma.takeoutCouponTicket.findMany({
      where: { shopId, customerId, status: 'UNUSED' },
      orderBy: { id: 'desc' },
      take: 50,
    });
    const out: Array<{
      ticketId: number;
      name: string;
      type: 'FULL_REDUCE' | 'DISCOUNT';
      value: number;
      threshold: number;
      usable: boolean;
      reason: string;
    }> = [];
    for (const ticket of tickets) {
      const resolved = await this.specOf(shopId, ticket.id);
      if (!resolved.spec) {
        out.push({
          ticketId: ticket.id,
          name: '优惠券',
          type: 'FULL_REDUCE',
          value: 0,
          threshold: 0,
          usable: false,
          reason: resolved.reason,
        });
        continue;
      }
      const result = evaluateCoupon(
        resolved.spec,
        lines.map((line) => ({
          productId: line.productId,
          categoryId: line.categoryId,
          totalCents: toCents(line.totalPrice),
        })),
      );
      out.push({
        ticketId: ticket.id,
        name: resolved.spec.name,
        type: resolved.spec.type,
        value:
          resolved.spec.type === 'DISCOUNT'
            ? resolved.spec.value
            : fromCentsValue(resolved.spec.value),
        threshold: fromCentsValue(resolved.spec.thresholdCents),
        usable: !result.reason,
        reason: result.reason,
      });
    }
    return out;
  }

  async consume(shopId: number, ticketId: number, orderId: number) {
    const changed = await this.prisma.takeoutCouponTicket.updateMany({
      where: { id: ticketId, shopId, status: 'UNUSED' },
      data: { status: 'USED', orderId, usedAt: new Date() },
    });
    if (changed.count === 0) return false;
    const ticket = await this.prisma.takeoutCouponTicket.findUnique({
      where: { id: ticketId },
      select: { couponId: true },
    });
    if (ticket) {
      await this.prisma.takeoutCoupon.update({
        where: { id: ticket.couponId },
        data: { usedCount: { increment: 1 } },
      });
    }
    return true;
  }
}

/** 券引擎的金额单位是分；这里只做展示层回元。 */
function fromCentsValue(cents: number): number {
  return Math.round(Number(cents) || 0) / 100;
}
