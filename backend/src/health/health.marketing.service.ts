import {
  HEALTH_ON_STATUSES,
  type HealthCouponRow,
  type HealthCouponSaveBody,
  type HealthCouponTicketRow,
  type HealthMemberCardRow,
  type HealthMemberCardSaveBody,
  type HealthMemberGrantBody,
  type HealthMemberGrantRow,
  type HealthMemberLevelRow,
  type HealthMemberLevelSaveBody,
  type HealthPointLogRow,
  type HealthPointRuleRow,
  type HealthPointRuleSaveBody,
  type HealthVerifyBody,
  type HealthVerifyResult,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import { resolveTransition } from './health.order.rules';
import {
  audit,
  clip,
  intIn,
  jsonArr,
  makeNo,
  requireShop,
  requireShopWritable,
  strOf,
  toIso,
} from './health.shared';
import { orderRowsOf } from './health.views';

const numOf = (value: unknown): number => {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
};

/** 前端时间输入：「2026-11-01」或完整 ISO；非法文本按未填处理。 */
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

type BenefitItem = { key: string; label: string; quota: number; desc: string };

const benefitsOf = (value: unknown): BenefitItem[] =>
  jsonArr<Record<string, unknown>>(value)
    .map((item) => ({
      key: strOf(item.key, 40),
      label: strOf(item.label, 40),
      quota: intIn(item.quota, 0, 99_999, 0),
      desc: strOf(item.desc, 200),
    }))
    .filter((item) => item.key || item.label);

const usedMapOf = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    out[key] = intIn(raw, 0, 99_999, 0);
  }
  return out;
};

/**
 * 会员、优惠券、积分与核销（C10）。
 *
 * 口径：
 * 1. 积分是店内积分（`health_customers.point_value`），不与平台积分互通；
 *    任何增减都写 `health_point_logs` 并带变动后余额快照。
 * 2. 会员权益在发放时以「卡上权益」为准，使用次数记录在 `benefits_used_json`，
 *    后续改卡不影响已发放的权益。
 * 3. 核销一单一码：核销码与订单一一对应，已核销不可重复；核销只推进订单状态，
 *    资金与分成在支付/完成节点各自记账。
 */
export class HealthMarketingService {
  constructor(private readonly prisma: PrismaService) {}

  private pager(query: Record<string, unknown>) {
    const page = intIn(query.page, 1, 10_000, 1);
    const pageSize = intIn(query.pageSize, 1, 200, 20);
    return { page, pageSize, skip: (page - 1) * pageSize };
  }

  private onOff(value: unknown): (typeof HEALTH_ON_STATUSES)[number] {
    return strOf(value, 8, 'ON') === 'OFF' ? 'OFF' : 'ON';
  }

  // ---------- 会员等级 ----------

  async memberLevels(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthMemberLevelRow[]> {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'marketing');
    const [rows, counts] = await Promise.all([
      this.prisma.healthMemberLevel.findMany({
        where: { shopId: ctx.shop.id },
        orderBy: [{ levelValue: 'asc' }],
      }),
      this.prisma.healthCustomer.groupBy({
        by: ['memberLevelId'],
        where: { shopId: ctx.shop.id, memberLevelId: { gt: 0 } },
        _count: { _all: true },
      }),
    ]);
    const countMap = new Map(
      counts.map((row) => [row.memberLevelId, row._count._all]),
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      reachCents: row.thresholdCents,
      discountPercent: row.discountPercent,
      pointRatePercent: row.pointRatePercent,
      benefits: jsonArr<unknown>(row.rightsJson)
        .map((item) => String(item))
        .filter(Boolean),
      sort: row.sort,
      status: this.onOff(row.status),
      memberCount: countMap.get(row.id) ?? 0,
    }));
  }

  async memberLevelSave(
    user: CurrentUser,
    body: HealthMemberLevelSaveBody,
  ): Promise<HealthMemberLevelRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'marketing');
    await requireShopWritable(ctx);
    const data = {
      name: body.name,
      thresholdCents: body.reachCents,
      discountPercent: body.discountPercent,
      pointRatePercent: body.pointRatePercent,
      rightsJson: body.benefits as never,
      sort: body.sort,
      status: body.status,
    };
    let id = body.id;
    if (id > 0) {
      const row = await this.prisma.healthMemberLevel.findFirst({
        where: { id, shopId: ctx.shop.id },
      });
      if (!row)
        throw new BusinessException(ErrorCode.NOT_FOUND, '会员等级不存在');
      await this.prisma.healthMemberLevel.update({ where: { id }, data });
    } else {
      const max = await this.prisma.healthMemberLevel.aggregate({
        where: { shopId: ctx.shop.id },
        _max: { levelValue: true },
      });
      const row = await this.prisma.healthMemberLevel.create({
        data: {
          ...data,
          shopId: ctx.shop.id,
          levelValue: numOf(max._max.levelValue) + 1,
        },
      });
      id = row.id;
    }
    await audit(
      this.prisma,
      user.userId,
      'health.member-level.save',
      `shop=${ctx.shop.id} id=${id}`,
    );
    const [mapped] = await this.memberLevels(user, { shopId: ctx.shop.id });
    return mapped;
  }

  async memberLevelRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'marketing');
    await requireShopWritable(ctx);
    const used = await this.prisma.healthCustomer.count({
      where: { shopId: ctx.shop.id, memberLevelId: body.id },
    });
    if (used > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `还有 ${used} 位顾客属于该等级，不能删除`,
      );
    }
    await this.prisma.healthMemberLevel.deleteMany({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.member-level.remove',
      `shop=${ctx.shop.id} id=${body.id}`,
    );
    return { ok: true, message: '会员等级已删除' };
  }

  // ---------- 会员卡 ----------

  async memberCards(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<{
    list: HealthMemberCardRow[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const { page, pageSize, skip } = this.pager(query);
    const ctx = await requireShop(this.prisma, user, query.shopId, 'marketing');
    const keyword = clip(query.keyword, 60);
    const where = {
      shopId: ctx.shop.id,
      ...(keyword ? { name: { contains: keyword } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.healthMemberCard.findMany({
        where,
        orderBy: [{ sort: 'asc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.healthMemberCard.count({ where }),
    ]);
    const cardIds = rows.map((row) => row.id);
    const counts = cardIds.length
      ? await this.prisma.healthMemberGrant.groupBy({
          by: ['memberCardId'],
          where: { shopId: ctx.shop.id, memberCardId: { in: cardIds } },
          _count: { _all: true },
        })
      : [];
    const countMap = new Map(
      counts.map((row) => [row.memberCardId, row._count._all]),
    );
    const list = rows.map((row) => ({
      id: row.id,
      name: row.name,
      cover: row.coverImage,
      priceCents: row.priceCents,
      originPriceCents: row.originPriceCents,
      validDays: row.validDays,
      benefits: benefitsOf(row.rightsJson),
      intro: row.desc,
      soldCount: countMap.get(row.id) ?? 0,
      status: this.onOff(row.status),
    }));
    return { list, total, page, pageSize };
  }

  async memberCardSave(
    user: CurrentUser,
    body: HealthMemberCardSaveBody,
  ): Promise<HealthMemberCardRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'marketing');
    await requireShopWritable(ctx);
    const data = {
      name: body.name,
      coverImage: body.cover,
      priceCents: body.priceCents,
      originPriceCents: body.originPriceCents,
      validDays: body.validDays,
      desc: body.intro,
      rightsJson: body.benefits as never,
      status: body.status,
    };
    let id = body.id;
    if (id > 0) {
      const row = await this.prisma.healthMemberCard.findFirst({
        where: { id, shopId: ctx.shop.id },
      });
      if (!row)
        throw new BusinessException(ErrorCode.NOT_FOUND, '会员卡不存在');
      await this.prisma.healthMemberCard.update({ where: { id }, data });
    } else {
      const row = await this.prisma.healthMemberCard.create({
        data: { ...data, shopId: ctx.shop.id },
      });
      id = row.id;
    }
    await audit(
      this.prisma,
      user.userId,
      'health.member-card.save',
      `shop=${ctx.shop.id} id=${id}`,
    );
    const row = await this.prisma.healthMemberCard.findUniqueOrThrow({
      where: { id },
    });
    const sold = await this.prisma.healthMemberGrant.count({
      where: { shopId: ctx.shop.id, memberCardId: id },
    });
    return {
      id: row.id,
      name: row.name,
      cover: row.coverImage,
      priceCents: row.priceCents,
      originPriceCents: row.originPriceCents,
      validDays: row.validDays,
      benefits: benefitsOf(row.rightsJson),
      intro: row.desc,
      soldCount: sold,
      status: this.onOff(row.status),
    };
  }

  async memberCardRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'marketing');
    await requireShopWritable(ctx);
    const sold = await this.prisma.healthMemberGrant.count({
      where: { shopId: ctx.shop.id, memberCardId: body.id },
    });
    if (sold > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该卡已发放过，不能删除，可改为下架',
      );
    }
    await this.prisma.healthMemberCard.deleteMany({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.member-card.remove',
      `shop=${ctx.shop.id} id=${body.id}`,
    );
    return { ok: true, message: '会员卡已删除' };
  }

  // ---------- 发放记录 ----------

  async memberGrants(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<{
    list: HealthMemberGrantRow[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const { page, pageSize, skip } = this.pager(query);
    const ctx = await requireShop(this.prisma, user, query.shopId, 'marketing');
    const status = strOf(query.grantStatus, 24, 'all');
    const customerId = intIn(query.customerId, 0, 1_000_000_000, 0);
    const where = {
      shopId: ctx.shop.id,
      ...(status && status !== 'all' ? { status } : {}),
      ...(customerId > 0 ? { customerId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.healthMemberGrant.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.healthMemberGrant.count({ where }),
    ]);
    if (!rows.length) return { list: [], total, page, pageSize };
    const cardIds = [
      ...new Set(rows.map((row) => row.memberCardId).filter((id) => id > 0)),
    ];
    const customerIds = [...new Set(rows.map((row) => row.customerId))];
    const [cards, customers] = await Promise.all([
      cardIds.length
        ? this.prisma.healthMemberCard.findMany({
            where: { shopId: ctx.shop.id, id: { in: cardIds } },
            select: { id: true, name: true, rightsJson: true },
          })
        : [],
      this.prisma.healthCustomer.findMany({
        where: { shopId: ctx.shop.id, id: { in: customerIds } },
        select: { id: true, nickname: true, phone: true },
      }),
    ]);
    const cardMap = new Map(cards.map((row) => [row.id, row]));
    const customerMap = new Map(customers.map((row) => [row.id, row]));
    const list = rows.map((row) => {
      const card = cardMap.get(row.memberCardId);
      const customer = customerMap.get(row.customerId);
      const used = usedMapOf(row.benefitsUsedJson);
      return {
        id: row.id,
        cardId: row.memberCardId,
        cardName: card?.name ?? '',
        customerLabel:
          customer?.nickname || customer?.phone || `顾客${row.customerId}`,
        orderId: row.orderId,
        verifyCode: row.verifyCode,
        status: (row.status as HealthMemberGrantRow['status']) ?? 'UNUSED',
        benefits: benefitsOf(card?.rightsJson).map((item) => ({
          key: item.key,
          label: item.label,
          used: used[item.key] ?? 0,
          quota: item.quota,
        })),
        activatedAt: toIso(row.startAt),
        expireAt: toIso(row.endAt),
        source: row.source,
        createdAt: toIso(row.createdAt),
      };
    });
    return { list, total, page, pageSize };
  }

  async memberGrant(
    user: CurrentUser,
    body: HealthMemberGrantBody,
  ): Promise<{ granted: number; message: string }> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'marketing');
    await requireShopWritable(ctx);
    const card = await this.prisma.healthMemberCard.findFirst({
      where: { id: body.cardId, shopId: ctx.shop.id },
    });
    if (!card) throw new BusinessException(ErrorCode.NOT_FOUND, '会员卡不存在');
    const customers = await this.prisma.healthCustomer.findMany({
      where: { shopId: ctx.shop.id, id: { in: body.customerIds } },
      select: { id: true },
    });
    if (!customers.length) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '所选顾客不在本店');
    }
    const days = body.validDays > 0 ? body.validDays : card.validDays;
    const startAt = new Date();
    const endAt = new Date(startAt.getTime() + days * 86_400_000);
    const level = await this.prisma.healthMemberLevel.findFirst({
      where: { shopId: ctx.shop.id, levelValue: card.levelValue },
      select: { id: true },
    });
    const usedSeed: Record<string, number> = {};
    for (const item of benefitsOf(card.rightsJson)) usedSeed[item.key] = 0;
    await this.prisma.$transaction([
      this.prisma.healthMemberGrant.createMany({
        data: customers.map((customer) => ({
          shopId: ctx.shop.id,
          customerId: customer.id,
          kind: 'CARD',
          memberCardId: card.id,
          levelValue: card.levelValue,
          startAt,
          endAt,
          verifyCode: makeNo('MG'),
          status: 'UNUSED',
          benefitsUsedJson: usedSeed as never,
          source: 'ADMIN',
          operator: user.username ?? String(user.userId),
          note: body.reason,
        })),
      }),
      this.prisma.healthCustomer.updateMany({
        where: {
          shopId: ctx.shop.id,
          id: { in: customers.map((row) => row.id) },
        },
        data: { memberLevelId: level?.id ?? 0 },
      }),
    ]);
    await audit(
      this.prisma,
      user.userId,
      'health.member-grant.grant',
      `shop=${ctx.shop.id} card=${card.id} customers=${customers.length}`,
    );
    return {
      granted: customers.length,
      message: `已为 ${customers.length} 位顾客开通「${card.name}」`,
    };
  }

  async memberGrantRevoke(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'marketing');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthMemberGrant.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '发放记录不存在');
    if (row.status === 'REVOKED') {
      throw new BusinessException(ErrorCode.CONFLICT, '该权益已撤销');
    }
    await this.prisma.healthMemberGrant.update({
      where: { id: row.id },
      data: { status: 'REVOKED' },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.member-grant.revoke',
      `shop=${ctx.shop.id} id=${row.id}`,
    );
    return { ok: true, message: '会员权益已撤销' };
  }

  // ---------- 优惠券 ----------

  async coupons(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<{
    list: HealthCouponRow[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const { page, pageSize, skip } = this.pager(query);
    const ctx = await requireShop(this.prisma, user, query.shopId, 'marketing');
    const keyword = clip(query.keyword, 60);
    const where = {
      shopId: ctx.shop.id,
      ...(keyword ? { name: { contains: keyword } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.healthCoupon.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.healthCoupon.count({ where }),
    ]);
    return {
      list: rows.map((row) => ({
        id: row.id,
        name: row.name,
        kind: (['FULL_REDUCE', 'DISCOUNT', 'CASH', 'SPECIFIED'].includes(
          row.kind,
        )
          ? row.kind
          : 'FULL_REDUCE') as HealthCouponRow['kind'],
        reduceCents: row.valueCents,
        discountPercent: row.discountPercent,
        startFeeCents: row.minAmountCents,
        totalCount: row.total,
        takenCount: row.received,
        usedCount: row.used,
        perCustomerLimit: row.receiveLimit,
        validDays: row.validDays,
        validStart: toIso(row.startAt),
        validEnd: toIso(row.endAt),
        bizTypes: jsonArr<string>(
          row.bizTypesJson,
        ) as HealthCouponRow['bizTypes'],
        goodsIds: jsonArr<number>(row.goodsIdsJson).map((id) => numOf(id)),
        status: this.onOff(row.status),
      })),
      total,
      page,
      pageSize,
    };
  }

  async couponSave(
    user: CurrentUser,
    body: HealthCouponSaveBody,
  ): Promise<HealthCouponRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'marketing');
    await requireShopWritable(ctx);
    const startAt = dateOf(body.validStart);
    const endAt = dateOf(body.validEnd, true);
    if (startAt && endAt && startAt > endAt) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '券的有效期开始时间不能晚于结束时间',
      );
    }
    const data = {
      name: body.name,
      kind: body.kind,
      valueCents: body.reduceCents,
      discountPercent: body.discountPercent,
      minAmountCents: body.startFeeCents,
      total: body.totalCount,
      receiveLimit: body.perCustomerLimit,
      validType: startAt || endAt ? 'FIXED' : 'DAYS',
      validDays: body.validDays,
      startAt,
      endAt,
      bizTypesJson: body.bizTypes as never,
      goodsIdsJson: body.goodsIds as never,
      scope: body.goodsIds.length ? 'SPECIFIED' : 'ALL',
      status: body.status,
    };
    let id = body.id;
    if (id > 0) {
      const row = await this.prisma.healthCoupon.findFirst({
        where: { id, shopId: ctx.shop.id },
      });
      if (!row)
        throw new BusinessException(ErrorCode.NOT_FOUND, '优惠券不存在');
      await this.prisma.healthCoupon.update({ where: { id }, data });
    } else {
      const row = await this.prisma.healthCoupon.create({
        data: { ...data, shopId: ctx.shop.id },
      });
      id = row.id;
    }
    await audit(
      this.prisma,
      user.userId,
      'health.coupon.save',
      `shop=${ctx.shop.id} id=${id}`,
    );
    const row = await this.prisma.healthCoupon.findUniqueOrThrow({
      where: { id },
    });
    return {
      id: row.id,
      name: row.name,
      kind: row.kind as HealthCouponRow['kind'],
      reduceCents: row.valueCents,
      discountPercent: row.discountPercent,
      startFeeCents: row.minAmountCents,
      totalCount: row.total,
      takenCount: row.received,
      usedCount: row.used,
      perCustomerLimit: row.receiveLimit,
      validDays: row.validDays,
      validStart: toIso(row.startAt),
      validEnd: toIso(row.endAt),
      bizTypes: jsonArr<string>(
        row.bizTypesJson,
      ) as HealthCouponRow['bizTypes'],
      goodsIds: jsonArr<number>(row.goodsIdsJson).map((value) => numOf(value)),
      status: this.onOff(row.status),
    };
  }

  async couponRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'marketing');
    await requireShopWritable(ctx);
    const taken = await this.prisma.healthCouponTicket.count({
      where: { shopId: ctx.shop.id, couponId: body.id },
    });
    if (taken > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该券已被领取，不能删除，可改为下架',
      );
    }
    await this.prisma.healthCoupon.deleteMany({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.coupon.remove',
      `shop=${ctx.shop.id} id=${body.id}`,
    );
    return { ok: true, message: '优惠券已删除' };
  }

  async couponTickets(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<{
    list: HealthCouponTicketRow[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const { page, pageSize, skip } = this.pager(query);
    const ctx = await requireShop(this.prisma, user, query.shopId, 'marketing');
    const couponId = intIn(query.couponId, 0, 1_000_000_000, 0);
    const status = strOf(query.ticketStatus, 24, 'all');
    const where = {
      shopId: ctx.shop.id,
      ...(couponId > 0 ? { couponId } : {}),
      ...(status && status !== 'all' ? { status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.healthCouponTicket.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.healthCouponTicket.count({ where }),
    ]);
    if (!rows.length) return { list: [], total, page, pageSize };
    const couponIds = [...new Set(rows.map((row) => row.couponId))];
    const customerIds = [...new Set(rows.map((row) => row.customerId))];
    const [coupons, customers] = await Promise.all([
      this.prisma.healthCoupon.findMany({
        where: { shopId: ctx.shop.id, id: { in: couponIds } },
        select: { id: true, name: true },
      }),
      this.prisma.healthCustomer.findMany({
        where: { shopId: ctx.shop.id, id: { in: customerIds } },
        select: { id: true, nickname: true, phone: true },
      }),
    ]);
    const couponMap = new Map(coupons.map((row) => [row.id, row.name]));
    const customerMap = new Map(customers.map((row) => [row.id, row]));
    const list = rows.map((row) => {
      const customer = customerMap.get(row.customerId);
      return {
        id: row.id,
        couponId: row.couponId,
        couponName: couponMap.get(row.couponId) ?? '',
        customerLabel:
          customer?.nickname || customer?.phone || `顾客${row.customerId}`,
        code: row.code,
        status: (['UNUSED', 'USED', 'EXPIRED'].includes(row.status)
          ? row.status
          : 'UNUSED') as HealthCouponTicketRow['status'],
        receivedAt: toIso(row.createdAt),
        usedAt: toIso(row.usedAt),
        expireAt: toIso(row.endAt),
        orderId: row.orderId,
      };
    });
    return { list, total, page, pageSize };
  }

  // ---------- 积分 ----------

  async pointRules(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthPointRuleRow[]> {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'marketing');
    const rows = await this.prisma.healthPointRule.findMany({
      where: { shopId: ctx.shop.id },
      orderBy: { id: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      action: row.scene,
      label: row.label,
      pointValue: row.value,
      dailyLimit: row.dailyLimit,
      status: this.onOff(row.status),
    }));
  }

  async pointRuleSave(
    user: CurrentUser,
    body: HealthPointRuleSaveBody,
  ): Promise<HealthPointRuleRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'marketing');
    await requireShopWritable(ctx);
    if (body.id > 0) {
      const row = await this.prisma.healthPointRule.findFirst({
        where: { id: body.id, shopId: ctx.shop.id },
      });
      if (!row)
        throw new BusinessException(ErrorCode.NOT_FOUND, '积分规则不存在');
      await this.prisma.healthPointRule.update({
        where: { id: row.id },
        data: {
          scene: body.action,
          label: body.label,
          value: body.pointValue,
          dailyLimit: body.dailyLimit,
          status: body.status,
        },
      });
    } else {
      const exists = await this.prisma.healthPointRule.findFirst({
        where: { shopId: ctx.shop.id, scene: body.action },
      });
      if (exists) {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          `「${body.action}」场景的规则已存在`,
        );
      }
      await this.prisma.healthPointRule.create({
        data: {
          shopId: ctx.shop.id,
          scene: body.action,
          label: body.label,
          value: body.pointValue,
          dailyLimit: body.dailyLimit,
          status: body.status,
        },
      });
    }
    await audit(
      this.prisma,
      user.userId,
      'health.point-rule.save',
      `shop=${ctx.shop.id} scene=${body.action}`,
    );
    const rows = await this.pointRules(user, { shopId: ctx.shop.id });
    return rows.find((row) => row.action === body.action) ?? rows[0];
  }

  async pointLogs(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<{
    list: HealthPointLogRow[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const { page, pageSize, skip } = this.pager(query);
    const ctx = await requireShop(this.prisma, user, query.shopId, 'marketing');
    const customerId = intIn(query.customerId, 0, 1_000_000_000, 0);
    const where = {
      shopId: ctx.shop.id,
      ...(customerId > 0 ? { customerId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.healthPointLog.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.healthPointLog.count({ where }),
    ]);
    if (!rows.length) return { list: [], total, page, pageSize };
    const customerIds = [...new Set(rows.map((row) => row.customerId))];
    const customers = await this.prisma.healthCustomer.findMany({
      where: { shopId: ctx.shop.id, id: { in: customerIds } },
      select: { id: true, nickname: true, phone: true },
    });
    const customerMap = new Map(customers.map((row) => [row.id, row]));
    return {
      list: rows.map((row) => {
        const customer = customerMap.get(row.customerId);
        return {
          id: row.id,
          customerId: row.customerId,
          customerLabel:
            customer?.nickname || customer?.phone || `顾客${row.customerId}`,
          action: row.scene,
          pointValue: row.value,
          balance: row.balance,
          refType: row.orderId > 0 ? 'ORDER' : '',
          refId: row.orderId,
          note: row.note,
          createdAt: toIso(row.createdAt),
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  async pointAdjust(
    user: CurrentUser,
    body: {
      shopId: number;
      customerId: number;
      pointValue: number;
      note: string;
    },
  ): Promise<HealthPointLogRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'marketing');
    await requireShopWritable(ctx);
    const customer = await this.prisma.healthCustomer.findFirst({
      where: { id: body.customerId, shopId: ctx.shop.id },
    });
    if (!customer)
      throw new BusinessException(ErrorCode.NOT_FOUND, '顾客不存在');
    const balance = customer.pointValue + body.pointValue;
    if (balance < 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '扣减后积分为负，请检查扣减数量',
      );
    }
    const log = await this.prisma.$transaction(async (tx) => {
      const created = await tx.healthPointLog.create({
        data: {
          shopId: ctx.shop.id,
          customerId: customer.id,
          value: body.pointValue,
          balance,
          scene: 'ADMIN',
          note: body.note,
        },
      });
      await tx.healthCustomer.update({
        where: { id: customer.id },
        data: { pointValue: balance },
      });
      return created;
    });
    await audit(
      this.prisma,
      user.userId,
      'health.point.adjust',
      `shop=${ctx.shop.id} customer=${customer.id} delta=${body.pointValue} balance=${balance}`,
    );
    return {
      id: log.id,
      customerId: log.customerId,
      customerLabel:
        customer.nickname || customer.phone || `顾客${customer.id}`,
      action: log.scene,
      pointValue: log.value,
      balance: log.balance,
      refType: '',
      refId: 0,
      note: log.note,
      createdAt: toIso(log.createdAt),
    };
  }

  // ---------- 核销 ----------

  async verify(
    user: CurrentUser,
    body: HealthVerifyBody,
  ): Promise<HealthVerifyResult> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'orders');
    const code = await this.prisma.healthVerifyCode.findFirst({
      where: { shopId: ctx.shop.id, code: body.code.trim() },
    });
    if (!code) {
      return {
        ok: false,
        order: null,
        patientName: '',
        serviceName: '',
        message: '核销码不存在或不属于本店',
      };
    }
    if (code.status === 'USED' || code.verifiedAt) {
      return {
        ok: false,
        order: null,
        patientName: '',
        serviceName: '',
        message: `该核销码已于 ${toIso(code.verifiedAt).slice(0, 16).replace('T', ' ')} 核销`,
      };
    }
    const order = await this.prisma.healthOrder.findFirst({
      where: { id: code.orderId, shopId: ctx.shop.id },
    });
    if (!order) {
      return {
        ok: false,
        order: null,
        patientName: '',
        serviceName: '',
        message: '订单不存在',
      };
    }
    let next: string;
    try {
      next = resolveTransition(
        'VERIFY',
        order.status as never,
        order.orderType,
      );
    } catch (error) {
      return {
        ok: false,
        order: null,
        patientName: '',
        serviceName: '',
        message:
          error instanceof BusinessException
            ? error.message
            : '当前状态不可核销',
      };
    }
    const now = new Date();
    const operator = user.username ?? String(user.userId);
    await this.prisma.$transaction([
      this.prisma.healthVerifyCode.update({
        where: { id: code.id },
        data: {
          status: 'USED',
          verifiedAt: now,
          verifyBy: String(user.userId),
          verifyName: operator,
        },
      }),
      this.prisma.healthOrder.update({
        where: { id: order.id },
        data: { status: next, verifiedAt: now },
      }),
      this.prisma.healthOrderStatusLog.create({
        data: {
          shopId: ctx.shop.id,
          orderId: order.id,
          fromStatus: order.status,
          toStatus: next,
          action: 'VERIFY',
          operatorType: 'STAFF',
          operatorName: operator,
          note:
            body.practitionerId > 0
              ? `核销医护=${body.practitionerId}`
              : '扫码核销',
        },
      }),
    ]);
    await audit(
      this.prisma,
      user.userId,
      'health.verify',
      `shop=${ctx.shop.id} order=${order.id} code=${code.code}`,
    );
    const [mapped] = await orderRowsOf(this.prisma, ctx.shop.id, [
      {
        ...(await this.prisma.healthOrder.findUniqueOrThrow({
          where: { id: order.id },
        })),
      },
    ]);
    return {
      ok: true,
      order: mapped,
      patientName: '',
      serviceName: '',
      message: '核销成功',
    };
  }
}
