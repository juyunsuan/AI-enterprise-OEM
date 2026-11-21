import type {
  OnsiteActivityRecordRow,
  OnsiteActivityRow,
  OnsiteActivitySave,
  OnsiteCouponRow,
  OnsiteCouponSave,
  OnsiteCouponTicketRow,
  OnsiteInviteRow,
  OnsiteStatusToggle,
} from '@enterprise/contracts';
import { pageOf, pageParam, text } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import { centsOf, yuanOf } from './onsite.money';
import type { OnsiteShopService } from './onsite.shop.service';
import type { OnsiteWalletService } from './onsite.wallet.service';

type Tx =
  PrismaService | Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

const randomCode = (prefix: string) =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();

/**
 * 卡券营销与邀请有礼。
 *
 * 券的核销口径（与价格试算共用一处，避免下单与试算两套算法）：
 *   - 满减：合格金额 ≥ 门槛才可用，抵扣 = min(券面额, 合格金额)；
 *   - 折扣：discountRate 表示「付几折」（90 = 9 折），抵扣 = 合格金额 × (100 − 折扣率)；
 *   - 新客券：额外要求该顾客在本店无已支付订单；
 *   - 作用域 ALL 全场 / CATEGORY 指定分类 / SERVICE 指定服务，合格金额只累计命中行。
 *
 * 邀请有礼：被邀请人首次支付成功后给邀请人发奖（余额/积分/券），一条记录只发一次。
 */
export class OnsiteMarketingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shops: OnsiteShopService,
    private readonly wallet: OnsiteWalletService,
  ) {}

  // ---------- 券 ----------

  async coupons(
    user: CurrentUser,
    shopId: string,
    query: Record<string, unknown>,
  ): Promise<{
    list: OnsiteCouponRow[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const shop = await this.shops.requireShop(user, shopId);
    const { page, pageSize, offset } = pageParam(
      query.page as string,
      query.pageSize as string,
      20,
    );
    const status = text(query.status, 'ALL');
    const where = {
      shopId: shop.shopId,
      ...(status && status !== 'ALL' ? { status } : {}),
      ...(text(query.keyword)
        ? { name: { contains: text(query.keyword) } }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.onsiteCoupon.count({ where }),
      this.prisma.onsiteCoupon.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const scopeLinks = await this.prisma.onsiteCouponScopeLink.findMany({
      where: {
        shopId: shop.shopId,
        couponId: { in: rows.map((row) => row.id) },
      },
    });
    const scopes = new Map<number, number[]>();
    for (const link of scopeLinks) {
      const list = scopes.get(link.couponId) ?? [];
      list.push(link.targetId);
      scopes.set(link.couponId, list);
    }
    return pageOf(
      rows.map((row) => toCouponRow(row, scopes.get(row.id) ?? [])),
      total,
      page,
      pageSize,
    );
  }

  async saveCoupon(
    user: CurrentUser,
    shopId: string,
    input: OnsiteCouponSave,
  ): Promise<OnsiteCouponRow> {
    const shop = await this.shops.requireShop(user, shopId);
    if (input.type === 'FULL_REDUCTION' && input.discountCents <= 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '满减券的抵扣金额必须大于 0',
      );
    }
    if (
      input.type === 'DISCOUNT' &&
      !(input.discountRate > 0 && input.discountRate < 100)
    ) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '折扣券的折扣率必须在 1–99 之间（90 = 9 折）',
      );
    }
    if (input.scope !== 'ALL' && input.scopeTargets.length === 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '指定分类/服务时必须选择适用范围',
      );
    }
    if (input.id) {
      const owned = await this.prisma.onsiteCoupon.findFirst({
        where: { id: input.id, shopId: shop.shopId },
      });
      if (!owned)
        throw new BusinessException(ErrorCode.NOT_FOUND, '优惠券不存在');
    }
    const validStartAt = input.validStartAt
      ? new Date(input.validStartAt)
      : null;
    const validEndAt = input.validEndAt ? new Date(input.validEndAt) : null;
    if (validStartAt && Number.isNaN(validStartAt.getTime())) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '生效时间格式不对');
    }
    if (validEndAt && Number.isNaN(validEndAt.getTime())) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '失效时间格式不对');
    }
    const data = {
      name: input.name,
      type: input.type,
      thresholdAmount: yuanOf(input.thresholdCents),
      discountAmount: yuanOf(input.discountCents),
      discountRate: Number(input.discountRate.toFixed(2)),
      newUserOnly: input.newUserOnly || input.type === 'NEW_USER',
      totalQuantity: input.totalQuantity,
      perLimit: input.perLimit,
      scope: input.scope,
      validStartAt,
      validEndAt,
    };
    const row = input.id
      ? await this.prisma.onsiteCoupon.update({ where: { id: input.id }, data })
      : await this.prisma.onsiteCoupon.create({
          data: { shopId: shop.shopId, ...data },
        });
    await this.prisma.onsiteCouponScopeLink.deleteMany({
      where: { shopId: shop.shopId, couponId: row.id },
    });
    if (input.scope !== 'ALL' && input.scopeTargets.length > 0) {
      await this.prisma.onsiteCouponScopeLink.createMany({
        data: input.scopeTargets.map((targetId) => ({
          shopId: shop.shopId,
          couponId: row.id,
          scopeType: input.scope,
          targetId,
        })),
      });
    }
    return toCouponRow(row, input.scope === 'ALL' ? [] : input.scopeTargets);
  }

  async removeCoupon(
    user: CurrentUser,
    shopId: string,
    couponId: string,
  ): Promise<{ id: number }> {
    const shop = await this.shops.requireShop(user, shopId);
    const owned = await this.prisma.onsiteCoupon.findFirst({
      where: { id: Number(couponId) || 0, shopId: shop.shopId },
    });
    if (!owned)
      throw new BusinessException(ErrorCode.NOT_FOUND, '优惠券不存在');
    const used = await this.prisma.onsiteCouponTicket.count({
      where: { shopId: shop.shopId, couponId: owned.id, status: 'USED' },
    });
    if (used > 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `该券已有 ${used} 张被核销，不能删除；请改为停用`,
      );
    }
    await this.prisma.$transaction([
      this.prisma.onsiteCouponScopeLink.deleteMany({
        where: { shopId: shop.shopId, couponId: owned.id },
      }),
      this.prisma.onsiteCouponTicket.deleteMany({
        where: { shopId: shop.shopId, couponId: owned.id },
      }),
      this.prisma.onsiteCoupon.delete({ where: { id: owned.id } }),
    ]);
    return { id: owned.id };
  }

  async setCouponStatus(
    user: CurrentUser,
    shopId: string,
    couponId: string,
    input: OnsiteStatusToggle,
  ): Promise<OnsiteCouponRow> {
    const shop = await this.shops.requireShop(user, shopId);
    const owned = await this.prisma.onsiteCoupon.findFirst({
      where: { id: Number(couponId) || 0, shopId: shop.shopId },
    });
    if (!owned)
      throw new BusinessException(ErrorCode.NOT_FOUND, '优惠券不存在');
    const status = text(input.status).toUpperCase();
    if (!['ON', 'OFF'].includes(status)) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '状态只能是 ON / OFF');
    }
    const row = await this.prisma.onsiteCoupon.update({
      where: { id: owned.id },
      data: { status },
    });
    const links = await this.prisma.onsiteCouponScopeLink.findMany({
      where: { shopId: shop.shopId, couponId: row.id },
    });
    return toCouponRow(
      row,
      links.map((link) => link.targetId),
    );
  }

  /** 定向发券：按顾客列表发，超过每客限领或库存发完的部分计入 skipped。 */
  async issueCoupon(
    user: CurrentUser,
    shopId: string,
    couponId: string,
    customerIds: number[],
  ): Promise<{ issued: number; skipped: number }> {
    const shop = await this.shops.requireShop(user, shopId);
    const coupon = await this.prisma.onsiteCoupon.findFirst({
      where: { id: Number(couponId) || 0, shopId: shop.shopId },
    });
    if (!coupon)
      throw new BusinessException(ErrorCode.NOT_FOUND, '优惠券不存在');
    if (coupon.status !== 'ON') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '券已停用，先启用再发放',
      );
    }
    const customers = await this.prisma.onsiteCustomer.findMany({
      where: { shopId: shop.shopId, id: { in: customerIds } },
      select: { id: true },
    });
    const valid = new Set(customers.map((row) => row.id));
    const expireAt = coupon.validEndAt ?? null;
    let issued = 0;
    let skipped = customerIds.length - valid.size;
    for (const customerId of valid) {
      const ownedCount = await this.prisma.onsiteCouponTicket.count({
        where: { shopId: shop.shopId, couponId: coupon.id, customerId },
      });
      if (ownedCount >= coupon.perLimit) {
        skipped += 1;
        continue;
      }
      if (
        coupon.totalQuantity > 0 &&
        coupon.issuedCount + issued >= coupon.totalQuantity
      ) {
        skipped += 1;
        continue;
      }
      await this.prisma.$transaction([
        this.prisma.onsiteCouponTicket.create({
          data: {
            shopId: shop.shopId,
            couponId: coupon.id,
            customerId,
            code: randomCode('OC'),
            expireAt,
          },
        }),
        this.prisma.onsiteCoupon.update({
          where: { id: coupon.id },
          data: { issuedCount: { increment: 1 } },
        }),
      ]);
      issued += 1;
    }
    return { issued, skipped };
  }

  async couponTickets(
    user: CurrentUser,
    shopId: string,
    couponId: string,
    query: Record<string, unknown>,
  ): Promise<{
    list: OnsiteCouponTicketRow[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const shop = await this.shops.requireShop(user, shopId);
    const { page, pageSize, offset } = pageParam(
      query.page as string,
      query.pageSize as string,
      20,
    );
    const where = { shopId: shop.shopId, couponId: Number(couponId) || 0 };
    const [total, rows] = await Promise.all([
      this.prisma.onsiteCouponTicket.count({ where }),
      this.prisma.onsiteCouponTicket.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const customers = await this.prisma.onsiteCustomer.findMany({
      where: {
        shopId: shop.shopId,
        id: { in: [...new Set(rows.map((row) => row.customerId))] },
      },
      select: { id: true, nickname: true, phone: true },
    });
    const nameOf = new Map(
      customers.map((row) => [row.id, row.nickname || row.phone || '顾客']),
    );
    return pageOf(
      rows.map((row) => ({
        id: row.id,
        couponId: row.couponId,
        customerId: row.customerId,
        customerName: nameOf.get(row.customerId) ?? '',
        code: row.code,
        status: row.status,
        usedOrderId: row.usedOrderId,
        usedAt: row.usedAt ? row.usedAt.toISOString() : '',
        expireAt: row.expireAt ? row.expireAt.toISOString() : '',
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    );
  }

  // ---------- 活动与邀请 ----------

  async activities(
    user: CurrentUser,
    shopId: string,
    query: Record<string, unknown>,
  ): Promise<{
    list: OnsiteActivityRow[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const shop = await this.shops.requireShop(user, shopId);
    const { page, pageSize, offset } = pageParam(
      query.page as string,
      query.pageSize as string,
      20,
    );
    const status = text(query.status, 'ALL');
    const where = {
      shopId: shop.shopId,
      ...(status && status !== 'ALL' ? { status } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.onsiteActivity.count({ where }),
      this.prisma.onsiteActivity.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const [inviteCounts, rewardCounts] = await Promise.all([
      this.prisma.onsiteActivityInvite.groupBy({
        by: ['activityId'],
        where: { shopId: shop.shopId },
        _sum: { inviteCount: true },
      }),
      this.prisma.onsiteActivityRecord.groupBy({
        by: ['activityId'],
        where: { shopId: shop.shopId, status: 'REWARDED' },
        _count: { _all: true },
      }),
    ]);
    const invites = new Map(
      inviteCounts.map((row) => [
        row.activityId,
        Number(row._sum.inviteCount ?? 0),
      ]),
    );
    const rewards = new Map(
      rewardCounts.map((row) => [row.activityId, row._count._all]),
    );
    return pageOf(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        rewardType: row.rewardType,
        rewardCents: rewardOf(row.rewardType, row.rewardValue),
        couponId: row.couponId,
        startAt: row.startAt ? row.startAt.toISOString() : '',
        endAt: row.endAt ? row.endAt.toISOString() : '',
        status: row.status,
        inviteCount: invites.get(row.id) ?? 0,
        rewardCount: rewards.get(row.id) ?? 0,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    );
  }

  async saveActivity(
    user: CurrentUser,
    shopId: string,
    input: OnsiteActivitySave,
  ): Promise<OnsiteActivityRow> {
    const shop = await this.shops.requireShop(user, shopId);
    if (input.rewardType === 'COUPON' && !input.couponId) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '奖励为优惠券时必须选择券模板',
      );
    }
    if (input.rewardType !== 'COUPON' && input.rewardCents <= 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '奖励金额/积分必须大于 0',
      );
    }
    if (input.id) {
      const owned = await this.prisma.onsiteActivity.findFirst({
        where: { id: input.id, shopId: shop.shopId },
      });
      if (!owned)
        throw new BusinessException(ErrorCode.NOT_FOUND, '活动不存在');
    }
    const data = {
      name: input.name,
      rewardType: input.rewardType,
      // BALANCE 存元（两位小数），POINTS 直接存积分数，COUPON 奖励不看数值
      rewardValue:
        input.rewardType === 'BALANCE'
          ? yuanOf(input.rewardCents)
          : input.rewardType === 'POINTS'
            ? Math.trunc(input.rewardCents)
            : 0,
      couponId: input.couponId,
      startAt: input.startAt ? new Date(input.startAt) : null,
      endAt: input.endAt ? new Date(input.endAt) : null,
    };
    const row = input.id
      ? await this.prisma.onsiteActivity.update({
          where: { id: input.id },
          data,
        })
      : await this.prisma.onsiteActivity.create({
          data: { shopId: shop.shopId, ...data },
        });
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      rewardType: row.rewardType,
      rewardCents: rewardOf(row.rewardType, row.rewardValue),
      couponId: row.couponId,
      startAt: row.startAt ? row.startAt.toISOString() : '',
      endAt: row.endAt ? row.endAt.toISOString() : '',
      status: row.status,
      inviteCount: 0,
      rewardCount: 0,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async setActivityStatus(
    user: CurrentUser,
    shopId: string,
    activityId: string,
    input: OnsiteStatusToggle,
  ): Promise<OnsiteActivityRow> {
    const shop = await this.shops.requireShop(user, shopId);
    const owned = await this.prisma.onsiteActivity.findFirst({
      where: { id: Number(activityId) || 0, shopId: shop.shopId },
    });
    if (!owned) throw new BusinessException(ErrorCode.NOT_FOUND, '活动不存在');
    const status = text(input.status).toUpperCase();
    if (!['ON', 'OFF'].includes(status)) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '状态只能是 ON / OFF');
    }
    const row = await this.prisma.onsiteActivity.update({
      where: { id: owned.id },
      data: { status },
    });
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      rewardType: row.rewardType,
      rewardCents: rewardOf(row.rewardType, row.rewardValue),
      couponId: row.couponId,
      startAt: row.startAt ? row.startAt.toISOString() : '',
      endAt: row.endAt ? row.endAt.toISOString() : '',
      status: row.status,
      inviteCount: 0,
      rewardCount: 0,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async activityRecords(
    user: CurrentUser,
    shopId: string,
    activityId: string,
    query: Record<string, unknown>,
  ): Promise<{
    list: OnsiteActivityRecordRow[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const shop = await this.shops.requireShop(user, shopId);
    const { page, pageSize, offset } = pageParam(
      query.page as string,
      query.pageSize as string,
      20,
    );
    const where = { shopId: shop.shopId, activityId: Number(activityId) || 0 };
    const [total, rows] = await Promise.all([
      this.prisma.onsiteActivityRecord.count({ where }),
      this.prisma.onsiteActivityRecord.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const ids = [
      ...new Set(
        rows.flatMap((row) => [row.inviterCustomerId, row.inviteeCustomerId]),
      ),
    ];
    const customers = await this.prisma.onsiteCustomer.findMany({
      where: { shopId: shop.shopId, id: { in: ids } },
      select: { id: true, nickname: true, phone: true },
    });
    const nameOf = new Map(
      customers.map((row) => [row.id, row.nickname || row.phone || '顾客']),
    );
    return pageOf(
      rows.map((row) => ({
        id: row.id,
        inviterCustomerId: row.inviterCustomerId,
        inviterName: nameOf.get(row.inviterCustomerId) ?? '',
        inviteeCustomerId: row.inviteeCustomerId,
        inviteeName: nameOf.get(row.inviteeCustomerId) ?? '',
        status: row.status,
        rewardCents: centsOf(row.rewardAmount),
        rewardedAt: row.rewardedAt ? row.rewardedAt.toISOString() : '',
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    );
  }

  async invites(
    user: CurrentUser,
    shopId: string,
    query: Record<string, unknown>,
  ): Promise<{
    list: OnsiteInviteRow[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const shop = await this.shops.requireShop(user, shopId);
    const { page, pageSize, offset } = pageParam(
      query.page as string,
      query.pageSize as string,
      20,
    );
    const where = { shopId: shop.shopId };
    const [total, rows] = await Promise.all([
      this.prisma.onsiteActivityInvite.count({ where }),
      this.prisma.onsiteActivityInvite.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const customers = await this.prisma.onsiteCustomer.findMany({
      where: {
        shopId: shop.shopId,
        id: { in: [...new Set(rows.map((row) => row.inviterCustomerId))] },
      },
      select: { id: true, nickname: true, phone: true },
    });
    const nameOf = new Map(
      customers.map((row) => [row.id, row.nickname || row.phone || '顾客']),
    );
    return pageOf(
      rows.map((row) => ({
        id: row.id,
        activityId: row.activityId,
        inviterCustomerId: row.inviterCustomerId,
        inviterName: nameOf.get(row.inviterCustomerId) ?? '',
        code: row.code,
        inviteCount: row.inviteCount,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    );
  }

  // ---------- 券核销（与试算共用） ----------

  /**
   * 试算券：返回抵扣额。任何不满足条件的情况都抛中文原因，不静默按 0 处理——
   * 顾客点了券却少减钱，比报错更难查。
   */
  async quoteTicket(
    shopId: number,
    customerId: number,
    ticketId: number,
    items: Array<{
      serviceId: number;
      categoryId: number;
      amountCents: number;
    }>,
  ): Promise<{ discountCents: number; ticketId: number }> {
    if (!ticketId) return { discountCents: 0, ticketId: 0 };
    const ticket = await this.prisma.onsiteCouponTicket.findFirst({
      where: { id: ticketId, shopId, customerId },
    });
    if (!ticket)
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '券不存在或不属于当前顾客',
      );
    if (ticket.status !== 'UNUSED') {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '该券已使用或已失效');
    }
    if (ticket.expireAt && ticket.expireAt.getTime() <= Date.now()) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '该券已过期');
    }
    const coupon = await this.prisma.onsiteCoupon.findFirst({
      where: { id: ticket.couponId, shopId },
    });
    if (!coupon || coupon.status !== 'ON') {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '该券已停用');
    }
    const now = Date.now();
    if (coupon.validStartAt && coupon.validStartAt.getTime() > now) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '该券还没到可用时间');
    }
    if (coupon.validEndAt && coupon.validEndAt.getTime() < now) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '该券已过有效期');
    }
    if (coupon.newUserOnly) {
      const paid = await this.prisma.onsiteOrder.count({
        where: { shopId, customerId, payStatus: 'PAID' },
      });
      if (paid > 0) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '新客券仅限本店首单使用',
        );
      }
    }
    let eligible = items;
    if (coupon.scope === 'CATEGORY' || coupon.scope === 'SERVICE') {
      const links = await this.prisma.onsiteCouponScopeLink.findMany({
        where: { shopId, couponId: coupon.id },
      });
      const targets = new Set(links.map((link) => link.targetId));
      eligible = items.filter((item) =>
        coupon.scope === 'SERVICE'
          ? targets.has(item.serviceId)
          : targets.has(item.categoryId),
      );
      if (eligible.length === 0) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '该券不适用于所选服务',
        );
      }
    }
    const eligibleCents = eligible.reduce(
      (sum, item) => sum + Math.max(0, item.amountCents),
      0,
    );
    const threshold = centsOf(coupon.thresholdAmount);
    if (eligibleCents < threshold) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `还差 ${((threshold - eligibleCents) / 100).toFixed(2)} 元可用该券`,
      );
    }
    const discount =
      coupon.type === 'DISCOUNT'
        ? Math.floor(
            (eligibleCents * (100 - Number(coupon.discountRate))) / 100,
          )
        : Math.min(centsOf(coupon.discountAmount), eligibleCents);
    return { discountCents: Math.max(0, discount), ticketId: ticket.id };
  }

  /** 核销：与下单同事务把券票置 USED 并绑定订单。 */
  async consumeTicket(
    tx: Tx,
    input: {
      shopId: number;
      customerId: number;
      ticketId: number;
      orderId: number;
    },
  ): Promise<void> {
    const db = tx as PrismaService;
    const result = await db.onsiteCouponTicket.updateMany({
      where: {
        id: input.ticketId,
        shopId: input.shopId,
        customerId: input.customerId,
        status: 'UNUSED',
      },
      data: { status: 'USED', usedOrderId: input.orderId, usedAt: new Date() },
    });
    if (result.count === 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '券已被使用，请重新选择',
      );
    }
  }

  // ---------- C 端 ----------

  async customerCoupons(shopId: number, customerId: number) {
    const now = new Date();
    const rows = await this.prisma.onsiteCouponTicket.findMany({
      where: { shopId, customerId },
      orderBy: { id: 'desc' },
      take: 100,
    });
    const coupons = await this.prisma.onsiteCoupon.findMany({
      where: {
        shopId,
        id: { in: [...new Set(rows.map((row) => row.couponId))] },
      },
    });
    const couponMap = new Map(coupons.map((row) => [row.id, row]));
    return {
      list: rows
        .filter((row) => couponMap.has(row.couponId))
        .map((row) => {
          const coupon = couponMap.get(row.couponId)!;
          const expired = row.expireAt
            ? row.expireAt.getTime() < now.getTime()
            : false;
          return {
            ticketId: row.id,
            couponId: coupon.id,
            name: coupon.name,
            type: coupon.type,
            thresholdCents: centsOf(coupon.thresholdAmount),
            discountCents: centsOf(coupon.discountAmount),
            discountRate: Number(coupon.discountRate),
            scope: coupon.scope,
            status: row.status === 'UNUSED' && expired ? 'EXPIRED' : row.status,
            expireAt: row.expireAt ? row.expireAt.toISOString() : '',
          };
        }),
    };
  }

  /** 顾客自助领券：只发可公开领取的券（不含新客券，新客券由店主定向发）。 */
  async receiveCoupon(shopId: number, customerId: number, couponId: number) {
    const coupon = await this.prisma.onsiteCoupon.findFirst({
      where: { id: couponId, shopId, status: 'ON', newUserOnly: false },
    });
    if (!coupon)
      throw new BusinessException(ErrorCode.NOT_FOUND, '该券不存在或不可领取');
    const owned = await this.prisma.onsiteCouponTicket.count({
      where: { shopId, couponId: coupon.id, customerId },
    });
    if (owned >= coupon.perLimit) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '已达该券领取上限');
    }
    if (
      coupon.totalQuantity > 0 &&
      coupon.issuedCount >= coupon.totalQuantity
    ) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '该券已领完');
    }
    const ticket = await this.prisma.onsiteCouponTicket.create({
      data: {
        shopId,
        couponId: coupon.id,
        customerId,
        code: randomCode('OC'),
        expireAt: coupon.validEndAt ?? null,
      },
    });
    await this.prisma.onsiteCoupon.update({
      where: { id: coupon.id },
      data: { issuedCount: { increment: 1 } },
    });
    return { ticketId: ticket.id, couponId: coupon.id };
  }

  /** 我的邀请码：取当前启用活动，没有就建一个默认「邀请有礼」。 */
  async inviteCode(shopId: number, customerId: number) {
    const now = new Date();
    let activity = await this.prisma.onsiteActivity.findFirst({
      where: {
        shopId,
        type: 'INVITE',
        status: 'ON',
        OR: [{ startAt: null }, { startAt: { lte: now } }],
        AND: [{ OR: [{ endAt: null }, { endAt: { gte: now } }] }],
      },
      orderBy: { id: 'desc' },
    });
    if (!activity) {
      activity = await this.prisma.onsiteActivity.create({
        data: {
          shopId,
          type: 'INVITE',
          name: '邀请有礼',
          rewardType: 'POINTS',
          rewardValue: 100,
          status: 'ON',
        },
      });
    }
    const existing = await this.prisma.onsiteActivityInvite.findUnique({
      where: {
        activityId_inviterCustomerId: {
          activityId: activity.id,
          inviterCustomerId: customerId,
        },
      },
    });
    if (existing) {
      return {
        activityId: activity.id,
        code: existing.code,
        inviteCount: existing.inviteCount,
        rewardType: activity.rewardType,
        rewardCents: centsOf(activity.rewardValue),
      };
    }
    const created = await this.prisma.onsiteActivityInvite.create({
      data: {
        shopId,
        activityId: activity.id,
        inviterCustomerId: customerId,
        code: randomCode('OI'),
      },
    });
    return {
      activityId: activity.id,
      code: created.code,
      inviteCount: 0,
      rewardType: activity.rewardType,
      rewardCents: centsOf(activity.rewardValue),
    };
  }

  /** 被邀请人绑定邀请码：写关系与活动记录，奖励等首单支付后再发。 */
  async bindInvite(shopId: number, inviteeCustomerId: number, code: string) {
    const invite = await this.prisma.onsiteActivityInvite.findFirst({
      where: { shopId, code: text(code).toUpperCase() },
    });
    if (!invite)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '邀请码不存在');
    if (invite.inviterCustomerId === inviteeCustomerId) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '不能邀请自己');
    }
    const exists = await this.prisma.onsiteActivityRecord.findUnique({
      where: {
        activityId_inviteeCustomerId: {
          activityId: invite.activityId,
          inviteeCustomerId,
        },
      },
    });
    if (exists) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '你已绑定过邀请关系');
    }
    await this.prisma.$transaction([
      this.prisma.onsiteActivityRecord.create({
        data: {
          shopId,
          activityId: invite.activityId,
          inviterCustomerId: invite.inviterCustomerId,
          inviteeCustomerId,
          status: 'PENDING',
        },
      }),
      this.prisma.onsiteActivityInvite.update({
        where: { id: invite.id },
        data: { inviteCount: { increment: 1 } },
      }),
      this.prisma.onsiteRelation.create({
        data: {
          shopId,
          customerId: inviteeCustomerId,
          pid: invite.inviterCustomerId,
          source: 'QR',
        },
      }),
    ]);
    return {
      activityId: invite.activityId,
      inviterCustomerId: invite.inviterCustomerId,
    };
  }

  /**
   * 首单支付后发奖：只处理 PENDING 记录，同一条记录重复调用也只发一次。
   * 支付链路失败不得回滚订单——奖励是运营福利，订单才是钱。
   */
  async rewardInvite(shopId: number, inviteeCustomerId: number): Promise<void> {
    const record = await this.prisma.onsiteActivityRecord.findFirst({
      where: { shopId, inviteeCustomerId, status: 'PENDING' },
    });
    if (!record) return;
    const activity = await this.prisma.onsiteActivity.findFirst({
      where: { id: record.activityId, shopId, status: 'ON' },
    });
    if (!activity) return;
    try {
      await this.prisma.$transaction(async (tx) => {
        if (activity.rewardType === 'BALANCE') {
          const cents = centsOf(activity.rewardValue);
          await this.wallet.creditBalance(tx, {
            shopId,
            customerId: record.inviterCustomerId,
            changeCents: cents,
            type: 'INVITE',
            remark: `邀请有礼奖励（活动 ${activity.id}）`,
          });
        } else if (activity.rewardType === 'POINTS') {
          await this.wallet.creditPoints(tx, {
            shopId,
            customerId: record.inviterCustomerId,
            changePoints: Math.max(1, Math.round(Number(activity.rewardValue))),
            type: 'INVITE',
            remark: `邀请有礼奖励（活动 ${activity.id}）`,
          });
        } else if (activity.rewardType === 'COUPON' && activity.couponId > 0) {
          const coupon = await tx.onsiteCoupon.findFirst({
            where: { id: activity.couponId, shopId },
          });
          if (coupon) {
            await tx.onsiteCouponTicket.create({
              data: {
                shopId,
                couponId: coupon.id,
                customerId: record.inviterCustomerId,
                code: randomCode('OC'),
                expireAt: coupon.validEndAt ?? null,
              },
            });
            await tx.onsiteCoupon.update({
              where: { id: coupon.id },
              data: { issuedCount: { increment: 1 } },
            });
          }
        }
        await tx.onsiteActivityRecord.update({
          where: { id: record.id },
          data: {
            status: 'REWARDED',
            rewardAmount:
              activity.rewardType === 'BALANCE' ? activity.rewardValue : 0,
            rewardedAt: new Date(),
          },
        });
      });
    } catch {
      // 奖励失败不影响支付结果；记录保持 PENDING，店主可在活动记录里看到未发放项
    }
  }
}

const rewardOf = (rewardType: string, value: unknown) =>
  rewardType === 'BALANCE' ? centsOf(value) : Math.round(Number(value ?? 0));

type CouponRow = {
  id: number;
  name: string;
  type: string;
  thresholdAmount: unknown;
  discountAmount: unknown;
  discountRate: unknown;
  newUserOnly: boolean;
  totalQuantity: number;
  issuedCount: number;
  perLimit: number;
  scope: string;
  validStartAt: Date | null;
  validEndAt: Date | null;
  status: string;
  createdAt: Date;
};

const toCouponRow = (row: CouponRow, targets: number[]): OnsiteCouponRow => ({
  id: row.id,
  name: row.name,
  type: row.type as OnsiteCouponRow['type'],
  thresholdCents: centsOf(row.thresholdAmount),
  discountCents: centsOf(row.discountAmount),
  discountRate: Number(row.discountRate),
  newUserOnly: row.newUserOnly,
  totalQuantity: row.totalQuantity,
  issuedCount: row.issuedCount,
  perLimit: row.perLimit,
  scope: row.scope as OnsiteCouponRow['scope'],
  scopeTargets: targets,
  validStartAt: row.validStartAt ? row.validStartAt.toISOString() : '',
  validEndAt: row.validEndAt ? row.validEndAt.toISOString() : '',
  status: row.status,
  createdAt: row.createdAt.toISOString(),
});
