import {
  type CardShopCoupon,
  type CardShopCouponGenerateBody,
  type CardShopCouponSaveBody,
} from '@enterprise/contracts';
import { pageOf, type PageResponse } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma';
import type { CardShopSiteService } from './card-shop.site.service';
import {
  amount,
  cardShopNo,
  clip,
  couponCode,
  couponKind,
  couponStatus,
  intIn,
  iso,
  pageArgs,
  parseExpire,
  toCents,
} from './card-shop.shared';

type Db = PrismaService | Prisma.TransactionClient;

type CouponRow = {
  id: number;
  siteId: number;
  code: string;
  kind: string;
  value: unknown;
  categoryId: number;
  minAmount: unknown;
  remark: string;
  batchNo: string;
  status: string;
  usedOrderId: number;
  usedAt: Date | null;
  expireAt: Date | null;
  createdAt: Date;
};

/** 一次生成的券数上限，与契约的 max(5000) 对齐；再大就该分批，避免一次事务塞几千行。 */
const GENERATE_MAX = 5000;
/** 批量删除券的 id 上限，与契约的 max(2000) 对齐。 */
const ID_LIMIT = 2000;
/** 站内券码总量硬顶：券是买家可枚举输入的，量大到一定程度撞码概率就不再可忽略。 */
const COUPON_QUOTA = 200_000;

/**
 * 券码：一码一用，码本身就是凭证，不记名、不发到具体顾客。
 *
 * 三条口径：
 * 1. 状态机 UNUSED → LOCKED（下单占用）→ USED（支付成功核销），关单/超时把 LOCKED 放回 UNUSED，
 *    所以「一个码被两单同时用」在数据库条件更新上必然只成一单；
 * 2. 抵扣只算到「商品金额」，券不找零、不抵运费（本业务没有运费）；
 * 3. 已核销的券不可删不可改面额——它已经是资金流水的一部分，只留追溯。
 */
export class CardShopCouponService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: CardShopSiteService,
  ) {}

  // ---------- 店主侧 ----------

  async list(
    user: CurrentUser,
    siteId: number,
    query: Record<string, unknown>,
  ): Promise<PageResponse<CardShopCoupon>> {
    await this.sites.requireSite(user, siteId);
    const { page, pageSize, offset } = pageArgs(query);
    const where: Record<string, unknown> = { siteId };
    const status = query.status;
    if (
      status === 'UNUSED' ||
      status === 'LOCKED' ||
      status === 'USED' ||
      status === 'DISABLED'
    ) {
      where.status = status;
    }
    const keyword = clip(query.keyword, 40).trim();
    if (keyword) {
      where.OR = [
        { code: { contains: keyword } },
        { remark: { contains: keyword } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.cardShopCoupon.findMany({
        where,
        orderBy: [{ id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.cardShopCoupon.count({ where }),
    ]);
    const list = rows as unknown as CouponRow[];
    return pageOf(await this.decorate(siteId, list), total, page, pageSize);
  }

  async generate(
    user: CurrentUser,
    body: CardShopCouponGenerateBody,
  ): Promise<{
    batchNo: string;
    created: number;
    codes: string[];
    message: string;
  }> {
    const site = await this.sites.requireSite(user, body.siteId);
    const count = intIn(body.count, 1, GENERATE_MAX, 10);
    const existing = await this.prisma.cardShopCoupon.count({
      where: { siteId: site.siteId },
    });
    if (existing + count > COUPON_QUOTA) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `本站券码总量上限 ${COUPON_QUOTA} 张，当前已有 ${existing} 张；请先停用不再使用的券码`,
      );
    }
    const kind = couponKind(body.kind);
    const value =
      kind === 'PERCENT' ? intIn(body.value, 1, 99, 0) : amount(body.value);
    if (value <= 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        kind === 'PERCENT'
          ? '折扣比例要填 1-99 之间的整数（表示折让的百分比）'
          : '券面额要大于 0',
      );
    }
    if (Number(body.categoryId || 0) > 0) {
      const category = await this.prisma.cardShopCategory.findFirst({
        where: { id: Number(body.categoryId), siteId: site.siteId },
        select: { id: true },
      });
      if (!category) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '券绑定的分类不存在，请重新选择',
        );
      }
    }
    const batchNo = cardShopNo('CPB');
    // 前缀留空补 CS：券码完全无 prefix 时，店主在台账里分不清哪批是本站的
    const prefix =
      clip(
        String(body.prefix ?? '')
          .trim()
          .toUpperCase(),
        12,
      ) || 'CS';
    const codes = await this.uniqueCodes(site.siteId, count, prefix);
    const expireAt = parseExpire(body.expireAt);
    if (body.expireAt && !expireAt) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '到期时间格式不对，请用 2026-12-31 或带时区的完整时间',
      );
    }
    if (expireAt && expireAt.getTime() <= Date.now()) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '到期时间已经过了，这样生成的券一张都用不了',
      );
    }
    const shared = {
      siteId: site.siteId,
      kind,
      value,
      categoryId: Number(body.categoryId || 0),
      minAmount: amount(body.minAmount),
      remark: clip(body.remark, 200),
      batchNo,
      status: 'UNUSED',
      expireAt,
    };
    await this.prisma.cardShopCoupon.createMany({
      data: codes.map((code) => ({ ...shared, code })),
    });
    return {
      batchNo,
      created: codes.length,
      codes,
      message: `已生成 ${codes.length} 张券码${expireAt ? `，${iso(expireAt).slice(0, 10)} 到期` : ''}`,
    };
  }

  async save(
    user: CurrentUser,
    body: CardShopCouponSaveBody,
  ): Promise<CardShopCoupon> {
    const site = await this.sites.requireSite(user, body.siteId);
    const code = clip(body.code, 40).trim().toUpperCase();
    if (!code) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '券码不能为空');
    }
    const kind = couponKind(body.kind);
    const value =
      kind === 'PERCENT' ? intIn(body.value, 1, 99, 0) : amount(body.value);
    if (value <= 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        kind === 'PERCENT' ? '折扣比例要填 1-99 之间的整数' : '券面额要大于 0',
      );
    }
    const minAmount = amount(body.minAmount);
    if (kind === 'PERCENT' && minAmount > 0 && value >= 99) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '折让 99% 还带门槛容易让买家以为免费，请把比例调到 98 以下或去掉门槛',
      );
    }
    const data = {
      code,
      kind,
      value,
      categoryId: Number(body.categoryId || 0),
      minAmount,
      remark: clip(body.remark, 200),
      expireAt: parseExpire(body.expireAt),
      status: couponStatus(body.status),
    };
    const duplicated = await this.prisma.cardShopCoupon.findFirst({
      where: { siteId: site.siteId, code },
      select: { id: true },
    });
    const id = Number(body.id || 0);
    if (id > 0) {
      const row = await this.prisma.cardShopCoupon.findFirst({
        where: { id, siteId: site.siteId },
      });
      if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '券码不存在');
      if (duplicated && duplicated.id !== id) {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          `券码 ${code} 已存在，请换一个`,
        );
      }
      if (row.status === 'USED' && data.status !== 'USED') {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '券码已核销，不能改回未使用——这单的抵扣已经发生过',
        );
      }
      await this.prisma.cardShopCoupon.update({ where: { id }, data });
      const updated = await this.prisma.cardShopCoupon.findUnique({
        where: { id },
      });
      const [saved] = await this.decorate(site.siteId, [
        updated as unknown as CouponRow,
      ]);
      return saved;
    }
    if (duplicated) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `券码 ${code} 已存在，请换一个`,
      );
    }
    const created = await this.prisma.cardShopCoupon.create({
      data: { siteId: site.siteId, ...data, batchNo: '' },
    });
    const [saved] = await this.decorate(site.siteId, [created]);
    return saved;
  }

  /**
   * 删券：只删没被用过的。
   * USED 的保留（资金抵扣凭据），LOCKED 的说明有未支付订单正占着，也不给删。
   */
  async remove(user: CurrentUser, siteId: number, ids: number[]) {
    await this.sites.requireSite(user, siteId);
    const list = (ids || [])
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0)
      .slice(0, ID_LIMIT);
    if (!list.length) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请选择要删除的券码');
    }
    const rows = await this.prisma.cardShopCoupon.findMany({
      where: { siteId, id: { in: list } },
      select: { id: true, status: true },
    });
    const deletable = rows.filter(
      (row) => row.status === 'UNUSED' || row.status === 'DISABLED',
    );
    const skipped = rows.length - deletable.length;
    if (!deletable.length) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `选中的 ${rows.length} 张券里有 ${skipped} 张正在被订单占用或已核销，都不能删；` +
          '想停用请改用「停用」状态',
      );
    }
    await this.prisma.cardShopCoupon.deleteMany({
      where: { id: { in: deletable.map((row) => row.id) } },
    });
    return {
      ok: true,
      changed: deletable.length,
      message:
        skipped > 0
          ? `已删除 ${deletable.length} 张，另有 ${skipped} 张因占用或已核销保留`
          : `已删除 ${deletable.length} 张券码`,
    };
  }

  // ---------- 下单链路（由订单服务在同事务里调用）----------

  /**
   * 算抵扣：校验券码可用性并给出减免金额（分）。
   * 返回 null 表示「没用券」；抛错表示券本身有问题，消息要能照着改。
   */
  async evaluate(
    db: Db,
    siteId: number,
    rawCode: string,
    args: { categoryId: number; productCents: number },
  ): Promise<{ couponId: number; discountCents: number } | null> {
    const code = clip(rawCode, 40).trim().toUpperCase();
    if (!code) return null;
    const row = (await db.cardShopCoupon.findFirst({
      where: { siteId, code },
    })) as unknown as CouponRow | null;
    if (!row) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `券码 ${code} 不存在，请核对后重试`,
      );
    }
    if (row.status === 'USED') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该券码已使用过，一张码只能用一次',
      );
    }
    if (row.status === 'LOCKED') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该券码已被另一笔未支付订单占用，请先在「我的订单」里完成或取消那笔订单',
      );
    }
    if (row.status === 'DISABLED') {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '该券码已被商家停用');
    }
    if (row.expireAt && row.expireAt.getTime() <= Date.now()) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `该券码已于 ${iso(row.expireAt).slice(0, 10)} 到期`,
      );
    }
    if (row.categoryId > 0 && row.categoryId !== Number(args.categoryId || 0)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '该券码不适用于当前商品分类',
      );
    }
    const minCents = toCents(row.minAmount);
    if (minCents > 0 && args.productCents < minCents) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `满 ${amount(row.minAmount).toFixed(2)} 元可用，当前订单 ${amount(args.productCents).toFixed(2)} 元`,
      );
    }
    const valueCents = toCents(row.value);
    // PERCENT 的 value 是「折让百分比」（1-99），不是金额，不能走 toCents 的乘 100。
    const percent = Math.min(
      99,
      Math.max(1, Math.round(Number(row.value) || 0)),
    );
    const discountCents =
      row.kind === 'PERCENT'
        ? Math.round((args.productCents * percent) / 100)
        : valueCents;
    return {
      couponId: row.id,
      discountCents: Math.max(0, Math.min(args.productCents, discountCents)),
    };
  }

  /** 下单占用券码：条件更新，同一张码并发时只有一单能占上。 */
  async lock(
    db: Db,
    couponId: number,
    siteId: number,
    orderId: number,
  ): Promise<boolean> {
    if (!couponId) return true;
    const changed = await db.cardShopCoupon.updateMany({
      where: { id: couponId, siteId, status: 'UNUSED' },
      data: { status: 'LOCKED', usedOrderId: orderId },
    });
    return changed.count === 1;
  }

  /** 支付成功核销：只允许从 LOCKED（本单占用）变 USED。 */
  async use(
    db: Db,
    couponId: number,
    siteId: number,
    orderId: number,
  ): Promise<void> {
    if (!couponId) return;
    await db.cardShopCoupon.updateMany({
      where: {
        id: couponId,
        siteId,
        usedOrderId: orderId,
        status: { in: ['LOCKED', 'UNUSED'] },
      },
      data: { status: 'USED', usedAt: new Date(), usedOrderId: orderId },
    });
  }

  /** 关单/超时放回券码：只放开本单占用的 LOCKED，USED 永不动。 */
  async release(
    db: Db,
    couponId: number,
    siteId: number,
    orderId: number,
  ): Promise<void> {
    if (!couponId) return;
    await db.cardShopCoupon.updateMany({
      where: { id: couponId, siteId, usedOrderId: orderId, status: 'LOCKED' },
      data: { status: 'UNUSED', usedOrderId: 0 },
    });
  }

  /** 撞码重试取够码：一次查库比对已存在的码，避免 unique 冲突把整批生成打断。 */
  private async uniqueCodes(
    siteId: number,
    count: number,
    prefix: string,
  ): Promise<string[]> {
    const out: string[] = [];
    const seen = new Set<string>();
    let guard = 0;
    while (out.length < count && guard < 40) {
      guard += 1;
      const batch: string[] = [];
      while (batch.length < Math.min(count - out.length + 20, GENERATE_MAX)) {
        const code = couponCode(prefix, 10);
        if (seen.has(code)) continue;
        seen.add(code);
        batch.push(code);
      }
      const exists = await this.prisma.cardShopCoupon.findMany({
        where: { siteId, code: { in: batch } },
        select: { code: true },
      });
      const taken = new Set(exists.map((row) => row.code));
      for (const code of batch) {
        if (taken.has(code)) {
          seen.delete(code);
          continue;
        }
        out.push(code);
        if (out.length >= count) break;
      }
    }
    if (out.length < count) {
      throw new BusinessException(
        ErrorCode.INTERNAL_ERROR,
        `券码生成撞码过多（只拿到 ${out.length}/${count} 张），请稍后重试或换个前缀`,
      );
    }
    return out;
  }

  /** 出参补分类名与订单号：列表与单条编辑共用同一份口径。 */
  private async decorate(
    siteId: number,
    rows: CouponRow[],
  ): Promise<CardShopCoupon[]> {
    const categoryIds = [
      ...new Set(rows.map((row) => row.categoryId).filter((id) => id > 0)),
    ];
    const categoryName = new Map<number, string>();
    if (categoryIds.length) {
      const categories = await this.prisma.cardShopCategory.findMany({
        where: { siteId, id: { in: categoryIds } },
        select: { id: true, name: true },
      });
      for (const row of categories) categoryName.set(row.id, row.name);
    }
    const orderIds = rows
      .map((row) => row.usedOrderId)
      .filter((id) => id > 0)
      .slice(0, ID_LIMIT);
    const orderNo = new Map<number, string>();
    if (orderIds.length) {
      const orders = await this.prisma.cardShopOrder.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, orderNo: true },
      });
      for (const row of orders) orderNo.set(row.id, row.orderNo);
    }
    return rows.map((row) => ({
      ...toCoupon(row),
      categoryName: categoryName.get(row.categoryId) ?? '',
      usedOrderNo: orderNo.get(row.usedOrderId) ?? '',
    }));
  }
}

function toCoupon(row: CouponRow): CardShopCoupon {
  return {
    id: row.id,
    siteId: row.siteId,
    code: row.code,
    kind: couponKind(row.kind),
    value: amount(row.value),
    categoryId: row.categoryId,
    categoryName: '',
    minAmount: amount(row.minAmount),
    remark: row.remark,
    batchNo: row.batchNo,
    status: couponStatus(row.status),
    usedOrderNo: '',
    usedAt: row.usedAt ? iso(row.usedAt) : null,
    expireAt: row.expireAt ? iso(row.expireAt) : null,
    createdAt: iso(row.createdAt),
  };
}
