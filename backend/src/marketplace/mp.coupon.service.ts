import type {
  MpCoupon,
  MpCouponSaveBody,
  MpCouponTicket,
  MpPublicCoupon,
} from '@enterprise/contracts';
import { pageOf, pageParam } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import type { MpMerchantTokenPayload } from './mp.token';
import type { MpMerchantService } from './mp.merchant.service';
import { noopMpScrmSink, type MpScrmSink } from './mp.scrm.service';
import { decimalOf, iso, jsonIds, numberIn } from './mp.shared';

type CouponRecord = {
  id: number;
  marketId: number;
  shopId: number;
  merchantId: number;
  issuerType: string;
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
  updatedAt: Date;
};

type TicketRecord = {
  id: number;
  marketId: number;
  couponId: number;
  customerId: number;
  status: string;
  orderId: number;
  receivedAt: Date;
  usedAt: Date | null;
  expireAt: Date | null;
};

/** 券模板可编辑字段（状态单独走上下线接口）。 */
type CouponData = {
  name: string;
  type: string;
  value: number;
  threshold: number;
  totalCount: number;
  perLimit: number;
  validType: string;
  startAt: Date | null;
  endAt: Date | null;
  validDays: number;
  scope: string;
  scopeIds: number[];
  status: string;
};

/** 结算用行摘要：券范围只用店铺/类目/商品归属与行金额判定。 */
export type MpCouponLine = {
  shopId: number;
  productId: number;
  categoryId: number;
  totalCents: number;
};

export type MpCouponUsage = {
  ticketId: number;
  couponId: number;
  name: string;
  /** 单位分 */
  discountCents: number;
  /** 按子单商品额分摊（单位分），合计等于 discountCents */
  allocations: Map<number, number>;
};

const COUPON_TYPES = new Set(['FULL_REDUCE', 'DISCOUNT']);
const COUPON_SCOPES = new Set(['ALL', 'SHOP', 'CATEGORY', 'PRODUCT']);
const COUPON_STATUSES = new Set(['ONLINE', 'OFFLINE', 'ENDED']);

function centsOf(amount: unknown): number {
  return Math.max(0, Math.round((decimalOf(amount) ?? 0) * 100));
}

function inScope(coupon: CouponRecord, line: MpCouponLine): boolean {
  if (coupon.scope === 'SHOP')
    return jsonIds(coupon.scopeIds).includes(line.shopId);
  if (coupon.scope === 'CATEGORY') {
    return jsonIds(coupon.scopeIds).includes(line.categoryId);
  }
  if (coupon.scope === 'PRODUCT') {
    return jsonIds(coupon.scopeIds).includes(line.productId);
  }
  return true;
}

/**
 * 多店铺商城的券：平台券（shopId=0）与商户券（绑店铺）。
 *
 * 硬口径：
 * 1. 券只抵扣商品额，不抵运费；跨商户父单券按各子单命中商品额比例分摊；
 * 2. 折扣券 value 填「折」（8.5 = 8.5 折），内部换算成百分比后按分计算；
 * 3. 领取与使用都回库校验余量、每人限领、有效期与券状态，端上传的金额一律不信。
 */
export class MpCouponService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly merchants: MpMerchantService,
    private readonly scrm: MpScrmSink = noopMpScrmSink,
  ) {}

  // ------------------------------------------------------------ 管理端：平台券

  async marketList(
    marketId: number,
    query: {
      page?: unknown;
      pageSize?: unknown;
      status?: string;
      keyword?: string;
    },
  ) {
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
    );
    const status = String(query.status || '').trim();
    const keyword = String(query.keyword || '').trim();
    const where = {
      marketId,
      issuerType: 'PLATFORM',
      ...(COUPON_STATUSES.has(status) ? { status } : {}),
      ...(keyword ? { name: { contains: keyword } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.mpCoupon.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      this.prisma.mpCoupon.count({ where }),
    ]);
    const shopNames = await this.shopNames(marketId);
    return pageOf(
      (rows as unknown as CouponRecord[]).map((row) =>
        this.toRow(row, shopNames),
      ),
      total,
      page,
      pageSize,
    );
  }

  async marketSave(
    marketId: number,
    body: MpCouponSaveBody,
  ): Promise<MpCoupon> {
    const data = await this.normalizeSave(marketId, body, {
      shopId: 0,
      merchantId: 0,
      issuerType: 'PLATFORM',
    });
    const row = body.id
      ? await this.updateCoupon(marketId, 0, body.id, data)
      : await this.prisma.mpCoupon.create({
          data: {
            marketId,
            shopId: 0,
            merchantId: 0,
            issuerType: 'PLATFORM',
            ...data,
            status: 'ONLINE',
            receivedCount: 0,
            usedCount: 0,
          },
        });
    return this.toRow(row, await this.shopNames(marketId));
  }

  async marketStatus(
    marketId: number,
    id: number,
    status: string,
  ): Promise<MpCoupon> {
    const row = await this.updateCoupon(marketId, 0, id, {
      status:
        COUPON_STATUSES.has(status) && status !== 'ENDED' ? status : 'OFFLINE',
    });
    return this.toRow(row, await this.shopNames(marketId));
  }

  // ------------------------------------------------------------ 管理端：商户券

  async merchantList(
    payload: MpMerchantTokenPayload,
    query: {
      page?: unknown;
      pageSize?: unknown;
      status?: string;
      keyword?: string;
    },
  ) {
    const { merchant, shop } = await this.merchants.session(payload);
    if (!shop) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '店铺尚未创建，暂不能发券',
      );
    }
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
    );
    const status = String(query.status || '').trim();
    const keyword = String(query.keyword || '').trim();
    const where = {
      marketId: merchant.marketId,
      shopId: shop.id,
      ...(COUPON_STATUSES.has(status) ? { status } : {}),
      ...(keyword ? { name: { contains: keyword } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.mpCoupon.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      this.prisma.mpCoupon.count({ where }),
    ]);
    const shopNames = await this.shopNames(merchant.marketId);
    return pageOf(
      (rows as unknown as CouponRecord[]).map((row) =>
        this.toRow(row, shopNames),
      ),
      total,
      page,
      pageSize,
    );
  }

  async merchantSave(
    payload: MpMerchantTokenPayload,
    body: MpCouponSaveBody,
  ): Promise<MpCoupon> {
    const { merchant, shop } = await this.merchants.session(payload, true);
    if (!shop) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '店铺尚未创建，暂不能发券',
      );
    }
    const data = await this.normalizeSave(merchant.marketId, body, {
      shopId: shop.id,
      merchantId: merchant.id,
      issuerType: 'MERCHANT',
    });
    const row = body.id
      ? await this.updateCoupon(merchant.marketId, shop.id, body.id, data)
      : await this.prisma.mpCoupon.create({
          data: {
            marketId: merchant.marketId,
            shopId: shop.id,
            merchantId: merchant.id,
            issuerType: 'MERCHANT',
            ...data,
            status: 'ONLINE',
            receivedCount: 0,
            usedCount: 0,
          },
        });
    return this.toRow(row, await this.shopNames(merchant.marketId));
  }

  async merchantStatus(
    payload: MpMerchantTokenPayload,
    id: number,
    status: string,
  ): Promise<MpCoupon> {
    const { merchant, shop } = await this.merchants.session(payload, true);
    if (!shop) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '店铺尚未创建');
    }
    const row = await this.updateCoupon(merchant.marketId, shop.id, id, {
      status:
        COUPON_STATUSES.has(status) && status !== 'ENDED' ? status : 'OFFLINE',
    });
    return this.toRow(row, await this.shopNames(merchant.marketId));
  }

  // ------------------------------------------------------------ C 端

  /** 可领券列表：平台券 + （传了 shopId 时）该店铺的商户券。 */
  async publicList(
    marketId: number,
    shopId: number,
    customerId: number,
  ): Promise<MpPublicCoupon[]> {
    const now = new Date();
    const rows = (await this.prisma.mpCoupon.findMany({
      where: {
        marketId,
        status: 'ONLINE',
        ...(shopId > 0
          ? { OR: [{ issuerType: 'PLATFORM' }, { shopId }] }
          : { issuerType: 'PLATFORM' }),
      },
      orderBy: [{ id: 'desc' }],
      take: 100,
    })) as unknown as CouponRecord[];
    const usable = rows.filter(
      (row) =>
        (!row.startAt || row.startAt <= now) &&
        (!row.endAt || row.endAt >= now),
    );
    const claimed = customerId
      ? await this.claimedCounts(
          marketId,
          customerId,
          usable.map((row) => row.id),
        )
      : new Map<number, number>();
    const shops = await this.shopNames(marketId);
    return usable.map((row) =>
      this.toPublic(row, shops, claimed.get(row.id) ?? 0),
    );
  }

  /** 领券：余量、每人限领、有效期、状态全部回库判定。 */
  async claim(
    marketId: number,
    customerId: number,
    couponId: number,
  ): Promise<MpCouponTicket> {
    const coupon = (await this.prisma.mpCoupon.findFirst({
      where: { id: couponId, marketId },
    })) as unknown as CouponRecord | null;
    if (!coupon) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '优惠券不存在');
    }
    const now = new Date();
    if (coupon.status !== 'ONLINE') {
      throw new BusinessException(ErrorCode.CONFLICT, '该券已停止发放');
    }
    if (
      (coupon.startAt && coupon.startAt > now) ||
      (coupon.endAt && coupon.endAt < now)
    ) {
      throw new BusinessException(ErrorCode.CONFLICT, '该券不在领用时间内');
    }
    if (coupon.totalCount > 0 && coupon.receivedCount >= coupon.totalCount) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '来晚了，这张券已经被领完',
      );
    }
    const got = await this.prisma.mpCouponTicket.count({
      where: { couponId, customerId, marketId },
    });
    if (got >= coupon.perLimit) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `每人最多领取 ${coupon.perLimit} 张`,
      );
    }
    const expireAt =
      coupon.validType === 'DAYS'
        ? new Date(now.getTime() + Math.max(1, coupon.validDays) * 86_400_000)
        : coupon.endAt;
    const ticket = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.mpCoupon.updateMany({
        where: {
          id: coupon.id,
          ...(coupon.totalCount > 0
            ? { receivedCount: { lt: coupon.totalCount } }
            : {}),
        },
        data: { receivedCount: { increment: 1 } },
      });
      if (changed.count === 0) {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '来晚了，这张券已经被领完',
        );
      }
      return tx.mpCouponTicket.create({
        data: {
          marketId,
          couponId: coupon.id,
          customerId,
          status: 'UNUSED',
          expireAt,
        },
      });
    });
    const shops = await this.shopNames(marketId);
    const view = this.toTicket(ticket, coupon, shops);
    // 平台券不对应单个商户，不生产商户维度的 SCRM 事件。
    if (coupon.issuerType === 'MERCHANT' && coupon.merchantId > 0) {
      await this.scrm.enqueue({
        marketId,
        merchantId: coupon.merchantId,
        customerId,
        kind: 'COUPON_RECEIVED',
        recordKey: ticket.id,
        payload: {
          couponName: coupon.name,
          shopName: shops.get(coupon.shopId) ?? '',
        },
      });
    }
    return view;
  }

  async tickets(
    marketId: number,
    customerId: number,
    status: string,
  ): Promise<MpCouponTicket[]> {
    const now = new Date();
    const rows = (await this.prisma.mpCouponTicket.findMany({
      where: {
        marketId,
        customerId,
        ...(status && ['UNUSED', 'USED', 'EXPIRED'].includes(status)
          ? { status }
          : {}),
      },
      orderBy: [{ id: 'desc' }],
      take: 200,
    })) as unknown as TicketRecord[];
    const coupons = (await this.prisma.mpCoupon.findMany({
      where: { id: { in: [...new Set(rows.map((row) => row.couponId))] } },
    })) as unknown as CouponRecord[];
    const couponMap = new Map(coupons.map((row) => [row.id, row] as const));
    const shops = await this.shopNames(marketId);
    // 读时顺带把过期未用的票标记为 EXPIRED，避免 C 端一直显示「可用」。
    const expired = rows.filter(
      (row) =>
        row.status === 'UNUSED' && row.expireAt !== null && row.expireAt < now,
    );
    if (expired.length > 0) {
      await this.prisma.mpCouponTicket.updateMany({
        where: { id: { in: expired.map((row) => row.id) } },
        data: { status: 'EXPIRED' },
      });
      for (const row of expired) row.status = 'EXPIRED';
    }
    return rows
      .filter((row) => couponMap.has(row.couponId))
      .map((row) => this.toTicket(row, couponMap.get(row.couponId)!, shops));
  }

  /** 结算页可选券：只列顾客手里未使用且未过期的券，逐张标注可用性。 */
  async options(
    marketId: number,
    customerId: number,
    lines: MpCouponLine[],
  ): Promise<
    Array<{
      ticketId: number;
      couponId: number;
      name: string;
      type: 'FULL_REDUCE' | 'DISCOUNT';
      value: number;
      threshold: number;
      expireAt: string;
      usable: boolean;
      reason: string;
    }>
  > {
    const now = new Date();
    const tickets = (await this.prisma.mpCouponTicket.findMany({
      where: { marketId, customerId, status: 'UNUSED' },
      orderBy: { id: 'desc' },
      take: 100,
    })) as unknown as TicketRecord[];
    const valid = tickets.filter(
      (ticket) => !ticket.expireAt || ticket.expireAt > now,
    );
    if (valid.length === 0) return [];
    const coupons = (await this.prisma.mpCoupon.findMany({
      where: {
        id: { in: [...new Set(valid.map((ticket) => ticket.couponId))] },
      },
    })) as unknown as CouponRecord[];
    const couponMap = new Map(coupons.map((row) => [row.id, row] as const));
    return valid.flatMap((ticket) => {
      const coupon = couponMap.get(ticket.couponId);
      if (!coupon) return [];
      const evaluation = this.evaluate(coupon, lines);
      return [
        {
          ticketId: ticket.id,
          couponId: coupon.id,
          name: coupon.name,
          type: this.couponType(coupon),
          value: decimalOf(coupon.value) ?? 0,
          threshold: decimalOf(coupon.threshold) ?? 0,
          expireAt: iso(ticket.expireAt),
          usable: evaluation.reason === '' && evaluation.discountCents > 0,
          reason: evaluation.reason,
        },
      ];
    });
  }

  /** 下单/试算用：用指定券票算折扣并分摊到子单；不可用直接 400。 */
  async use(
    marketId: number,
    customerId: number,
    ticketId: number,
    lines: MpCouponLine[],
  ): Promise<MpCouponUsage> {
    const ticket = await this.prisma.mpCouponTicket.findFirst({
      where: { id: ticketId, marketId, customerId },
    });
    if (!ticket) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '优惠券不存在或不属于当前账号',
      );
    }
    if (ticket.status !== 'UNUSED') {
      throw new BusinessException(ErrorCode.CONFLICT, '该券已使用或已过期');
    }
    if (ticket.expireAt && ticket.expireAt <= new Date()) {
      throw new BusinessException(ErrorCode.CONFLICT, '该券已过期');
    }
    const coupon = (await this.prisma.mpCoupon.findFirst({
      where: { id: ticket.couponId, marketId },
    })) as unknown as CouponRecord | null;
    if (!coupon) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '优惠券不存在');
    }
    if (coupon.status === 'ENDED') {
      throw new BusinessException(ErrorCode.CONFLICT, '该券已结束，不能使用');
    }
    const evaluation = this.evaluate(coupon, lines);
    if (!evaluation.reason && evaluation.discountCents <= 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '本单没有可用这张券的商品',
      );
    }
    if (evaluation.reason) {
      throw new BusinessException(ErrorCode.CONFLICT, evaluation.reason);
    }
    return {
      ticketId: ticket.id,
      couponId: coupon.id,
      name: coupon.name,
      discountCents: evaluation.discountCents,
      allocations: evaluation.allocations,
    };
  }

  /** 券票核销与券使用计数由下单事务直接写（见 `MpTradeService.createOrder`），这里不提供跨库助手。 */

  // ------------------------------------------------------------ 内部

  private couponType(row: CouponRecord): 'FULL_REDUCE' | 'DISCOUNT' {
    return row.type === 'DISCOUNT' ? 'DISCOUNT' : 'FULL_REDUCE';
  }

  /**
   * 纯计算：门槛按命中范围商品额判定（避免用别家商品凑单），
   * 折扣按分向下取整；分摊按各子单命中商品额比例，余数给命中额最大的子单。
   */
  private evaluate(coupon: CouponRecord, lines: MpCouponLine[]) {
    const scoped = lines.filter((line) => inScope(coupon, line));
    const scopeCents = scoped.reduce((sum, line) => sum + line.totalCents, 0);
    if (scoped.length === 0) {
      return {
        discountCents: 0,
        allocations: new Map<number, number>(),
        reason: '本单没有可用这张券的商品',
      };
    }
    const thresholdCents = centsOf(coupon.threshold);
    if (scopeCents < thresholdCents) {
      return {
        discountCents: 0,
        allocations: new Map<number, number>(),
        reason: `满 ${thresholdCents / 100} 元可用`,
      };
    }
    const value = decimalOf(coupon.value) ?? 0;
    const discountCents =
      this.couponType(coupon) === 'DISCOUNT'
        ? Math.min(
            scopeCents,
            Math.floor((scopeCents * Math.max(0, 100 - value * 10)) / 100),
          )
        : Math.min(scopeCents, centsOf(coupon.value));
    if (discountCents <= 0) {
      return {
        discountCents: 0,
        allocations: new Map<number, number>(),
        reason: '本单没有可用这张券的商品',
      };
    }
    const byShop = new Map<number, number>();
    for (const line of scoped) {
      byShop.set(line.shopId, (byShop.get(line.shopId) ?? 0) + line.totalCents);
    }
    const shopIds = [...byShop.keys()];
    const allocations = new Map<number, number>();
    let assigned = 0;
    for (const shopId of shopIds) {
      const share = Math.floor(
        (discountCents * (byShop.get(shopId) ?? 0)) / scopeCents,
      );
      allocations.set(shopId, share);
      assigned += share;
    }
    const residual = discountCents - assigned;
    if (residual > 0) {
      const largest = shopIds.reduce((best, shopId) =>
        (byShop.get(shopId) ?? 0) > (byShop.get(best) ?? 0) ? shopId : best,
      );
      allocations.set(largest, (allocations.get(largest) ?? 0) + residual);
    }
    return { discountCents, allocations, reason: '' };
  }

  private async normalizeSave(
    marketId: number,
    body: MpCouponSaveBody,
    owner: { shopId: number; merchantId: number; issuerType: string },
  ) {
    const name = String(body.name || '')
      .trim()
      .slice(0, 40);
    if (!name) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '券名称不能为空');
    }
    if (!COUPON_TYPES.has(body.type)) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '券类型不正确');
    }
    if (body.type === 'DISCOUNT' && (body.value <= 0 || body.value >= 10)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '折扣券的力度要填 1-10 之间的折数（如 8.5 表示 8.5 折）',
      );
    }
    if (body.type === 'FULL_REDUCE' && body.value <= 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '满减金额必须大于 0');
    }
    const fixed = body.validType !== 'DAYS';
    const startAt = fixed && body.startAt ? new Date(body.startAt) : null;
    const endAt = fixed && body.endAt ? new Date(body.endAt) : null;
    if (
      fixed &&
      (!startAt ||
        !endAt ||
        Number.isNaN(startAt.getTime()) ||
        Number.isNaN(endAt.getTime()))
    ) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '固定有效期的券必须填写开始与结束时间',
      );
    }
    if (startAt && endAt && startAt > endAt) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '券的开始时间不能晚于结束时间',
      );
    }
    const scope = COUPON_SCOPES.has(body.scope) ? body.scope : 'ALL';
    const scopeIds = [...new Set(body.scopeIds)].filter((id) => id > 0);
    if (scope !== 'ALL' && scopeIds.length === 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '指定范围的券必须至少选一个适用对象',
      );
    }
    if (scope === 'SHOP' && owner.issuerType === 'MERCHANT') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '商户券默认只限本店铺商品，无需再指定店铺',
      );
    }
    if (scope === 'SHOP') {
      const count = await this.prisma.mpShop.count({
        where: { id: { in: scopeIds }, marketId },
      });
      if (count !== scopeIds.length) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '指定店铺不存在');
      }
    }
    return {
      name,
      type: body.type,
      value: Math.round(body.value * 100) / 100,
      threshold: Math.round(Math.max(0, body.threshold) * 100) / 100,
      totalCount: numberIn(body.totalCount, 100, 0, 1_000_000),
      perLimit: numberIn(body.perLimit, 1, 1, 100),
      validType: body.validType === 'DAYS' ? 'DAYS' : 'FIXED',
      startAt,
      endAt,
      validDays: numberIn(body.validDays, 7, 1, 365),
      scope,
      scopeIds,
    };
  }

  private async updateCoupon(
    marketId: number,
    shopId: number,
    id: number,
    data: Partial<CouponData>,
  ) {
    const row = (await this.prisma.mpCoupon.findFirst({
      where: {
        id,
        marketId,
        ...(shopId > 0 ? { shopId } : { issuerType: 'PLATFORM' }),
      },
    })) as unknown as CouponRecord | null;
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '优惠券不存在');
    }
    if (row.status === 'ENDED') {
      throw new BusinessException(ErrorCode.CONFLICT, '已结束的券不能再修改');
    }
    return this.prisma.mpCoupon.update({
      where: { id: row.id },
      data,
    });
  }

  private async claimedCounts(
    marketId: number,
    customerId: number,
    couponIds: number[],
  ): Promise<Map<number, number>> {
    if (couponIds.length === 0) return new Map();
    const rows = await this.prisma.mpCouponTicket.groupBy({
      by: ['couponId'],
      where: { marketId, customerId, couponId: { in: couponIds } },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.couponId, row._count._all] as const));
  }

  private async shopNames(marketId: number): Promise<Map<number, string>> {
    const shops = await this.prisma.mpShop.findMany({
      where: { marketId },
      select: { id: true, name: true },
    });
    return new Map(shops.map((shop) => [shop.id, shop.name] as const));
  }

  private toRow(row: CouponRecord, shops: Map<number, string>): MpCoupon {
    return {
      id: row.id,
      marketId: row.marketId,
      shopId: row.shopId,
      merchantId: row.merchantId,
      issuerType: row.issuerType === 'MERCHANT' ? 'MERCHANT' : 'PLATFORM',
      shopName: shops.get(row.shopId) ?? '',
      name: row.name,
      type: this.couponType(row),
      value: decimalOf(row.value) ?? 0,
      threshold: decimalOf(row.threshold) ?? 0,
      totalCount: row.totalCount,
      receivedCount: row.receivedCount,
      usedCount: row.usedCount,
      perLimit: row.perLimit,
      validType: row.validType === 'DAYS' ? 'DAYS' : 'FIXED',
      startAt: iso(row.startAt),
      endAt: iso(row.endAt),
      validDays: row.validDays,
      scope: (COUPON_SCOPES.has(row.scope)
        ? row.scope
        : 'ALL') as MpCoupon['scope'],
      scopeIds: jsonIds(row.scopeIds),
      status: (COUPON_STATUSES.has(row.status)
        ? row.status
        : 'ONLINE') as MpCoupon['status'],
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  private toPublic(
    row: CouponRecord,
    shops: Map<number, string>,
    claimed: number,
  ): MpPublicCoupon {
    const remaining =
      row.totalCount === 0
        ? -1
        : Math.max(0, row.totalCount - row.receivedCount);
    return {
      id: row.id,
      name: row.name,
      issuerType: row.issuerType === 'MERCHANT' ? 'MERCHANT' : 'PLATFORM',
      shopId: row.shopId,
      shopName: shops.get(row.shopId) ?? '',
      type: this.couponType(row),
      value: decimalOf(row.value) ?? 0,
      threshold: decimalOf(row.threshold) ?? 0,
      remaining,
      perLimit: row.perLimit,
      scope: (COUPON_SCOPES.has(row.scope)
        ? row.scope
        : 'ALL') as MpPublicCoupon['scope'],
      expireAt: iso(row.endAt),
      claimed,
      claimable: remaining !== 0 && claimed < row.perLimit,
    };
  }

  private toTicket(
    row: TicketRecord,
    coupon: CouponRecord,
    shops: Map<number, string>,
  ): MpCouponTicket {
    return {
      ticketId: row.id,
      couponId: coupon.id,
      name: coupon.name,
      issuerType: coupon.issuerType === 'MERCHANT' ? 'MERCHANT' : 'PLATFORM',
      shopId: coupon.shopId,
      shopName: shops.get(coupon.shopId) ?? '',
      type: this.couponType(coupon),
      value: decimalOf(coupon.value) ?? 0,
      threshold: decimalOf(coupon.threshold) ?? 0,
      scope: (COUPON_SCOPES.has(coupon.scope)
        ? coupon.scope
        : 'ALL') as MpCouponTicket['scope'],
      status: (['USED', 'EXPIRED'].includes(row.status)
        ? row.status
        : 'UNUSED') as MpCouponTicket['status'],
      orderId: row.orderId,
      receivedAt: iso(row.receivedAt),
      usedAt: iso(row.usedAt),
      expireAt: iso(row.expireAt),
    };
  }
}
