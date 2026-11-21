import type {
  BrandCoupon,
  BrandCouponSaveBody,
  BrandCouponTicket,
} from '@enterprise/contracts';
import { LIST_ALL_LIMIT, pageOf, pageParam } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import {
  amount,
  clip,
  fromCents,
  intIn,
  iso,
  jsonInput,
  jsonList,
  toCents,
} from './brand.shared';
import { noopScrmSink, type BrandScrmSink } from './brand.scrm.service';
import { evaluateCoupon, type CouponSpec } from '../commerce-core/pricing';

type AnyArgs = { ownerUserId: string; shopId: number };

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

function couponType(value: string): BrandCoupon['type'] {
  return value === 'DISCOUNT' ? 'DISCOUNT' : 'FULL_REDUCE';
}

/**
 * 优惠券：券模板 + 顾客手里的券票。
 *
 * 折扣券的 value 是百分比（88 = 8.8 折），满减券是减免金额，
 * 两者都靠 `apply()` 一处算，避免店主端与 C 端两份算法对不上账。
 */
export class BrandCouponService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scrm: BrandScrmSink = noopScrmSink,
  ) {}

  private toRow(row: CouponRecord): BrandCoupon {
    return {
      id: row.id,
      shopId: row.shopId,
      name: row.name,
      type: couponType(row.type),
      value: amount(row.value),
      threshold: amount(row.threshold),
      totalCount: row.totalCount,
      receivedCount: row.receivedCount,
      usedCount: row.usedCount,
      perLimit: row.perLimit,
      validType: row.validType === 'DAYS' ? 'DAYS' : 'FIXED',
      startAt: iso(row.startAt),
      endAt: iso(row.endAt),
      validDays: row.validDays,
      scope: (['ALL', 'CATEGORY', 'PRODUCT'].includes(row.scope)
        ? row.scope
        : 'ALL') as BrandCoupon['scope'],
      scopeIds: jsonList<number>(row.scopeIds).map((id) => Number(id)),
      status: (['ONLINE', 'OFFLINE', 'ENDED'].includes(row.status)
        ? row.status
        : 'ONLINE') as BrandCoupon['status'],
      createdAt: iso(row.createdAt),
    };
  }

  async list(
    args: AnyArgs,
    query: {
      page?: number;
      pageSize?: number;
      status?: string;
      keyword?: string;
    },
  ) {
    const { page, pageSize, offset } = pageParam(query.page, query.pageSize);
    const where: Record<string, unknown> = { shopId: args.shopId };
    if (query.status) where.status = query.status;
    const keyword = clip(query.keyword, 40).trim();
    if (keyword) where.name = { contains: keyword };
    const [rows, total] = await Promise.all([
      this.prisma.brandCoupon.findMany({
        where,
        orderBy: [{ id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.brandCoupon.count({ where }),
    ]);
    return pageOf(
      (rows as unknown as CouponRecord[]).map((row) => this.toRow(row)),
      total,
      page,
      pageSize,
    );
  }

  async save(args: AnyArgs, body: BrandCouponSaveBody): Promise<BrandCoupon> {
    const name = clip(body.name, 40).trim();
    if (!name)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '券名称不能为空');
    if (body.type === 'DISCOUNT' && (body.value <= 0 || body.value >= 100)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '折扣券的力度要填 1-99 之间的百分比（88 表示 8.8 折）',
      );
    }
    if (body.type === 'FULL_REDUCE' && body.value <= 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '满减金额必须大于 0');
    }
    const fixed = body.validType !== 'DAYS';
    if (fixed && (!body.startAt || !body.endAt)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '固定有效期的券必须填写开始与结束时间',
      );
    }
    if (
      fixed &&
      new Date(body.startAt).getTime() > new Date(body.endAt).getTime()
    ) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '券的开始时间不能晚于结束时间',
      );
    }
    if (body.scope !== 'ALL' && (body.scopeIds || []).length === 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '指定分类或指定商品的券必须至少选一个适用范围',
      );
    }
    const data = {
      name,
      type: body.type,
      value: Math.round(body.value * 100) / 100,
      threshold: Math.round(body.threshold * 100) / 100,
      totalCount: intIn(body.totalCount, 1, 9_999_999, 100),
      perLimit: intIn(body.perLimit, 1, 99, 1),
      validType: body.validType || 'FIXED',
      startAt: fixed ? new Date(body.startAt) : null,
      endAt: fixed ? new Date(body.endAt) : null,
      validDays: intIn(body.validDays, 1, 3650, 7),
      scope: body.scope || 'ALL',
      scopeIds: jsonInput(
        (body.scopeIds || [])
          .map((id) => Number(id))
          .filter((id) => id > 0)
          .slice(0, 500),
      ),
      status: ['ONLINE', 'OFFLINE', 'ENDED'].includes(String(body.status))
        ? body.status
        : 'ONLINE',
    };
    if (body.id) {
      const row = await this.coupon(args, body.id);
      await this.prisma.brandCoupon.update({ where: { id: row.id }, data });
      return this.toRow(await this.coupon(args, row.id));
    }
    const created = await this.prisma.brandCoupon.create({
      data: { shopId: args.shopId, ...data, receivedCount: 0, usedCount: 0 },
    });
    return this.toRow(created);
  }

  private async coupon(args: AnyArgs, id: number) {
    const row = await this.prisma.brandCoupon.findFirst({
      where: { id: Number(id), shopId: args.shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '优惠券不存在');
    return row;
  }

  async setStatus(
    args: AnyArgs,
    id: number,
    status: string,
  ): Promise<BrandCoupon> {
    if (!['ONLINE', 'OFFLINE', 'ENDED'].includes(String(status))) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '券状态不合法');
    }
    const row = await this.coupon(args, id);
    await this.prisma.brandCoupon.update({
      where: { id: row.id },
      data: { status },
    });
    return this.toRow(row);
  }

  async remove(args: AnyArgs, id: number) {
    const row = await this.coupon(args, id);
    const used = await this.prisma.brandCouponTicket.count({
      where: { couponId: row.id, status: 'USED' },
    });
    if (used > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `这张券已被核销 ${used} 次，不能删除；请改为「停发」，历史券票仍按原规则可用`,
      );
    }
    await this.prisma.brandCouponTicket.deleteMany({
      where: { couponId: row.id },
    });
    await this.prisma.brandCoupon.delete({ where: { id: row.id } });
    return { ok: true, message: '优惠券已删除' };
  }

  async tickets(
    args: AnyArgs,
    query: {
      page?: number;
      pageSize?: number;
      couponId?: number;
      status?: string;
      keyword?: string;
    },
  ) {
    const { page, pageSize, offset } = pageParam(query.page, query.pageSize);
    const where: Record<string, unknown> = { shopId: args.shopId };
    if (query.couponId) where.couponId = query.couponId;
    if (query.status) where.status = query.status;
    const keyword = clip(query.keyword, 60).trim();
    if (keyword) {
      const customers = await this.prisma.brandCustomer.findMany({
        where: {
          shopId: args.shopId,
          OR: [
            { nickname: { contains: keyword } },
            { phone: { contains: keyword } },
          ],
        },
        select: { id: true },
        take: LIST_ALL_LIMIT,
      });
      where.customerId = { in: customers.map((row) => row.id) };
    }
    const [rows, total] = await Promise.all([
      this.prisma.brandCouponTicket.findMany({
        where,
        orderBy: [{ id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.brandCouponTicket.count({ where }),
    ]);
    const couponIds = [...new Set(rows.map((row) => row.couponId))];
    const coupons = couponIds.length
      ? await this.prisma.brandCoupon.findMany({
          where: { id: { in: couponIds } },
          select: { id: true, name: true },
        })
      : [];
    const couponMap = new Map(coupons.map((row) => [row.id, row.name]));
    const customerIds = [...new Set(rows.map((row) => row.customerId))];
    const customers = customerIds.length
      ? await this.prisma.brandCustomer.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, nickname: true, phone: true },
        })
      : [];
    const customerMap = new Map(customers.map((row) => [row.id, row]));
    const list = rows.map((row): BrandCouponTicket => ({
      id: row.id,
      couponId: row.couponId,
      couponName: couponMap.get(row.couponId) || '（券已删除）',
      customerId: row.customerId,
      nickname: customerMap.get(row.customerId)?.nickname || '微信用户',
      phone: customerMap.get(row.customerId)?.phone || '',
      status: row.status as BrandCouponTicket['status'],
      orderId: row.orderId,
      receivedAt: iso(row.receivedAt),
      usedAt: iso(row.usedAt),
      expireAt: iso(row.expireAt),
    }));
    return pageOf(list, total, page, pageSize);
  }

  /** 店铺可领的券（装修里的「优惠券」组件按 id 取这批）。 */
  async shopList(shopId: number, couponIds?: number[]) {
    const where: Record<string, unknown> = { shopId, status: 'ONLINE' };
    if (couponIds && couponIds.length > 0) {
      where.id = {
        in: couponIds
          .slice(0, 50)
          .map((id) => Number(id))
          .filter((id) => id > 0),
      };
    }
    const rows = (await this.prisma.brandCoupon.findMany({
      where,
      orderBy: [{ id: 'desc' }],
      take: 50,
    })) as unknown as CouponRecord[];
    return rows.map((row) => this.toRow(row));
  }

  /** 我领到的券。 */
  async mine(shopId: number, customerId: number) {
    const tickets = await this.prisma.brandCouponTicket.findMany({
      where: { shopId, customerId },
      orderBy: [{ id: 'desc' }],
      take: LIST_ALL_LIMIT,
    });
    const couponIds = [...new Set(tickets.map((row) => row.couponId))];
    const coupons = couponIds.length
      ? ((await this.prisma.brandCoupon.findMany({
          where: { id: { in: couponIds } },
        })) as unknown as CouponRecord[])
      : [];
    const map = new Map(coupons.map((row) => [row.id, this.toRow(row)]));
    return tickets.map((row) => ({
      ticketId: row.id,
      status: row.status as 'UNUSED' | 'USED' | 'EXPIRED',
      orderId: row.orderId,
      receivedAt: iso(row.receivedAt),
      usedAt: iso(row.usedAt),
      expireAt: iso(row.expireAt),
      coupon: map.get(row.couponId) || null,
    }));
  }

  /** C 端领券。返回券票 id；名额与限领都在这里挡，避免端上绕过按钮。 */
  async receive(shopId: number, customerId: number, couponId: number) {
    const coupon = (await this.prisma.brandCoupon.findFirst({
      where: { id: couponId, shopId },
    })) as unknown as CouponRecord | null;
    if (!coupon)
      throw new BusinessException(ErrorCode.NOT_FOUND, '优惠券不存在或已下架');
    if (coupon.status !== 'ONLINE') {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '该券已停止发放');
    }
    const now = new Date();
    if (coupon.validType === 'FIXED' && coupon.endAt && coupon.endAt < now) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '该券活动已结束');
    }
    if (
      coupon.validType === 'FIXED' &&
      coupon.startAt &&
      coupon.startAt > now
    ) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '该券还没开始领取');
    }
    if (coupon.totalCount > 0 && coupon.receivedCount >= coupon.totalCount) {
      throw new BusinessException(ErrorCode.CONFLICT, '该券已被领完');
    }
    const owned = await this.prisma.brandCouponTicket.count({
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
    const ticket = await this.prisma.brandCouponTicket.create({
      data: { shopId, couponId, customerId, status: 'UNUSED', expireAt },
    });
    await this.prisma.brandCoupon.update({
      where: { id: couponId },
      data: { receivedCount: { increment: 1 } },
    });
    await this.scrm.enqueue({
      shopId,
      customerId,
      kind: 'COUPON_RECEIVED',
      recordKey: ticket.id,
      payload: { couponName: coupon.name },
    });
    return { ticketId: ticket.id, expireAt: iso(expireAt) };
  }

  /**
   * 券票 → 中台券规则：这里只查库并判定可用性（存在 / 未用 / 未过期 / 券未下架），
   * 门槛、适用范围、抵扣额一律交 `commerce-core/pricing`，两个商城共用同一套口径。
   */
  async specOf(
    shopId: number,
    ticketId: number,
  ): Promise<{ spec: CouponSpec | null; reason: string }> {
    const ticket = await this.prisma.brandCouponTicket.findFirst({
      where: { id: ticketId, shopId },
    });
    if (!ticket) return { spec: null, reason: '优惠券不存在' };
    if (ticket.status !== 'UNUSED') {
      return { spec: null, reason: '优惠券已使用或已过期' };
    }
    if (ticket.expireAt && ticket.expireAt < new Date()) {
      await this.prisma.brandCouponTicket.update({
        where: { id: ticket.id },
        data: { status: 'EXPIRED' },
      });
      return { spec: null, reason: '优惠券已过期' };
    }
    const coupon = (await this.prisma.brandCoupon.findFirst({
      where: { id: ticket.couponId },
    })) as unknown as CouponRecord | null;
    if (!coupon) return { spec: null, reason: '优惠券已下架' };
    return {
      spec: {
        name: coupon.name,
        type: coupon.type === 'DISCOUNT' ? 'DISCOUNT' : 'FULL_REDUCE',
        // 折扣券的力度是百分比（88 = 8.8 折），满减券的是减免金额（元 → 分）
        value:
          coupon.type === 'DISCOUNT'
            ? amount(coupon.value)
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

  /**
   * 券抵扣额：门槛与适用范围按**商品原价合计**判定，折扣券结果向下取整到分。
   * 返回 0 表示不可用（含原因），调用方把原因回给端上展示。
   */
  async discountOf(
    shopId: number,
    ticketId: number,
    lines: Array<{ productId: number; categoryId: number; totalPrice: number }>,
  ): Promise<{ discount: number; reason: string; couponName: string }> {
    const { spec, reason } = await this.specOf(shopId, ticketId);
    if (!spec) return { discount: 0, reason, couponName: '' };
    const evaluation = evaluateCoupon(
      spec,
      lines.map((line) => ({
        productId: line.productId,
        categoryId: line.categoryId,
        totalCents: toCents(line.totalPrice),
      })),
    );
    return {
      discount: fromCents(evaluation.discountCents),
      reason: evaluation.reason,
      couponName: evaluation.name,
    };
  }

  /** 过期扫描：券票到期置 EXPIRED，固定期券到期置 ENDED（定时任务调用）。 */
  async sweepExpiry(): Promise<{ tickets: number; coupons: number }> {
    const now = new Date();
    const tickets = await this.prisma.brandCouponTicket.updateMany({
      where: { status: 'UNUSED', expireAt: { lt: now } },
      data: { status: 'EXPIRED' },
    });
    const coupons = await this.prisma.brandCoupon.updateMany({
      where: { status: 'ONLINE', validType: 'FIXED', endAt: { lt: now } },
      data: { status: 'ENDED' },
    });
    return { tickets: tickets.count, coupons: coupons.count };
  }

  /** 下单成功后核销；返回 false 表示券已被别的并发订单占用。 */
  async consume(
    shopId: number,
    ticketId: number,
    orderId: number,
  ): Promise<boolean> {
    const result = await this.prisma.brandCouponTicket.updateMany({
      where: { id: ticketId, shopId, status: 'UNUSED' },
      data: { status: 'USED', orderId, usedAt: new Date() },
    });
    if (result.count === 0) return false;
    await this.prisma.brandCoupon
      .update({
        where: { id: await this.ticketCouponId(shopId, ticketId) },
        data: { usedCount: { increment: 1 } },
      })
      .catch(() => undefined);
    return true;
  }

  private async ticketCouponId(shopId: number, ticketId: number) {
    const row = await this.prisma.brandCouponTicket.findFirst({
      where: { id: ticketId, shopId },
      select: { couponId: true },
    });
    return row?.couponId || 0;
  }

  async release(shopId: number, ticketId: number) {
    if (!ticketId) return;
    await this.prisma.brandCouponTicket.updateMany({
      where: { id: ticketId, shopId, status: 'USED' },
      data: { status: 'UNUSED', orderId: 0, usedAt: null },
    });
  }

  /** C 端可用券列表（含不可用原因，端上灰显）。 */
  async availableFor(
    shopId: number,
    customerId: number,
    lines: Array<{ productId: number; categoryId: number; totalPrice: number }>,
  ) {
    const tickets = await this.prisma.brandCouponTicket.findMany({
      where: { shopId, customerId, status: 'UNUSED' },
      orderBy: [{ id: 'desc' }],
      take: LIST_ALL_LIMIT,
    });
    const out: Array<{
      ticketId: number;
      name: string;
      type: BrandCoupon['type'];
      value: number;
      threshold: number;
      usable: boolean;
      reason: string;
    }> = [];
    for (const ticket of tickets) {
      const coupon = (await this.prisma.brandCoupon.findFirst({
        where: { id: ticket.couponId },
      })) as unknown as CouponRecord | null;
      if (!coupon) continue;
      const result = await this.discountOf(shopId, ticket.id, lines);
      out.push({
        ticketId: ticket.id,
        name: coupon.name,
        type: couponType(coupon.type),
        value: amount(coupon.value),
        threshold: amount(coupon.threshold),
        usable: result.discount > 0 && !result.reason,
        reason: result.reason,
      });
    }
    return out;
  }
}
