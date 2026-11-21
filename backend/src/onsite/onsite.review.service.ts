import type { Prisma } from '../../generated/prisma';
import {
  type OnsiteAppealRow,
  type OnsiteFeedbackRow,
  type OnsiteReviewCreateInput,
  type OnsiteReviewRow,
  type OnsiteReviewStatus,
} from '@enterprise/contracts';
import { pageOf, pageParam, text } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { OnsiteNotifyService } from './onsite.notify.service';
import type { OnsiteShopService } from './onsite.shop.service';

const REVIEW_STATUSES = ['PENDING', 'PUBLISHED', 'HIDDEN'];
const reviewStatusOf = (value: string): OnsiteReviewStatus => {
  for (const status of REVIEW_STATUSES) {
    if (status === value) return status as OnsiteReviewStatus;
  }
  return 'PUBLISHED';
};

const REVERSED_STATUSES = ['CANCELLED', 'EXPIRED', 'REJECTED', 'REFUNDED'];

/**
 * 评价、差评申诉与问题反馈。
 *
 * 评分聚合不是写一次就不动：每当一条评价展示态变化（发布 / 隐藏 / 申诉成立撤下），
 * 技师与服务的平均分都按**当前可见评价**重算，否则申诉成功后平均分还带着被撤下的那条，
 * 顾客看到的分数和列表里的评价就对不上（参考源码这块只做了增量累加，是已知缺陷）。
 */
export class OnsiteReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shops: OnsiteShopService,
    private readonly notify: OnsiteNotifyService,
  ) {}

  // ---------- 顾客提交 ----------

  async create(
    shop: Awaited<ReturnType<OnsiteShopService['requireShop']>>,
    customerId: number,
    input: OnsiteReviewCreateInput,
  ) {
    if (!shop.trade.reviewEnabled) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该店铺已关闭评价功能，暂时不能提交评价',
      );
    }
    const order = await this.prisma.onsiteOrder.findFirst({
      where: { id: input.orderId, shopId: shop.shopId, customerId },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    if (!['COMPLETED', 'SIGNED', 'REVIEWED'].includes(order.status)) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '只有已完成的订单可以评价（服务结束后再来打分吧）',
      );
    }
    if (
      REVERSED_STATUSES.includes(order.status) ||
      order.payStatus === 'REFUNDED'
    ) {
      throw new BusinessException(ErrorCode.CONFLICT, '已退款的订单不能评价');
    }
    const exists = await this.prisma.onsiteReview.findFirst({
      where: { orderId: order.id },
    });
    if (exists) {
      throw new BusinessException(ErrorCode.CONFLICT, '该订单已评价过');
    }
    const items = await this.prisma.onsiteOrderItem.findMany({
      where: { orderId: order.id },
    });
    const review = await this.prisma.$transaction(async (tx) => {
      const created = await tx.onsiteReview.create({
        data: {
          shopId: shop.shopId,
          orderId: order.id,
          customerId,
          staffId: order.staffId,
          rating: clampScore(input.rating),
          serviceRating: clampScore(input.serviceRating),
          attitudeRating: clampScore(input.attitudeRating),
          tags: input.tags.slice(0, 12),
          content: String(input.content || '').slice(0, 2000),
          images: input.images.slice(0, 9),
          anonymous: input.anonymous === true,
          // 店主开了「先审后展示」就先落 PENDING（不计分、不进列表默认视图）
          status: shop.trade.reviewAuditFirst ? 'PENDING' : 'PUBLISHED',
        },
      });
      await tx.onsiteReviewItem.createMany({
        data: items.map((item) => {
          const picked = input.items.find(
            (row) => row.serviceId === item.serviceId,
          );
          return {
            reviewId: created.id,
            shopId: shop.shopId,
            serviceId: item.serviceId,
            title: item.title,
            rating: clampScore(picked?.rating ?? input.rating),
          };
        }),
      });
      await tx.onsiteOrder.update({
        where: { id: order.id },
        data: { status: 'REVIEWED', reviewed: true },
      });
      await tx.onsiteOrderStatusLog.create({
        data: {
          orderId: order.id,
          shopId: shop.shopId,
          fromStatus: order.status,
          toStatus: 'REVIEWED',
          operatorRole: 'CUSTOMER',
          operatorId: String(customerId),
          action: 'review',
          content: `评价 ${clampScore(input.rating)} 星`,
        },
      });
      return created;
    });
    await this.recalculate(
      shop.shopId,
      order.staffId,
      items.map((item) => item.serviceId),
    );
    await this.notify.reviewCreated(shop.shopId, review.id);
    return this.toRow(review, {
      orderNo: order.orderNo,
      customerNickname: '',
      staffName: order.staffName,
      items: await this.prisma.onsiteReviewItem.findMany({
        where: { reviewId: review.id },
      }),
      appealCount: 0,
    });
  }

  // ---------- 店主端 ----------

  /**
   * 顾客回显自己某单的评价（小程序「已评价」态用）。
   *
   * 双条件过滤：`orderId` 必须属于该顾客，越权查别人的评价拿不到东西。
   * 未评价回 `null` 而不是 404：小程序侧据此决定展示「去评价」还是「查看评价」。
   */
  async byOrder(shopId: number, customerId: number, orderId: number) {
    const order = await this.prisma.onsiteOrder.findFirst({
      where: { id: orderId, shopId, customerId },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    const review = await this.prisma.onsiteReview.findFirst({
      where: { orderId: order.id, shopId, customerId },
    });
    if (!review) return null;
    const [items, appealCount, staff] = await Promise.all([
      this.prisma.onsiteReviewItem.findMany({ where: { reviewId: review.id } }),
      this.prisma.onsiteReviewAppeal.count({ where: { reviewId: review.id } }),
      review.staffId
        ? this.prisma.onsiteStaff.findUnique({
            where: { id: review.staffId },
            select: { name: true },
          })
        : null,
    ]);
    return this.toRow(review, {
      orderNo: order.orderNo,
      customerNickname: '',
      staffName: staff?.name ?? '',
      items,
      appealCount,
    });
  }

  private async toRow(
    row: Prisma.OnsiteReviewGetPayload<Record<string, never>>,
    extra: {
      orderNo: string;
      customerNickname: string;
      staffName: string;
      items: Prisma.OnsiteReviewItemGetPayload<Record<string, never>>[];
      appealCount: number;
    },
  ): Promise<OnsiteReviewRow> {
    const customer = row.anonymous
      ? null
      : await this.prisma.onsiteCustomer.findUnique({
          where: { id: row.customerId },
          select: { nickname: true },
        });
    return {
      id: row.id,
      orderId: row.orderId,
      orderNo: extra.orderNo,
      customerId: row.customerId,
      customerNickname: row.anonymous
        ? '匿名用户'
        : customer?.nickname || extra.customerNickname || '顾客',
      anonymous: row.anonymous,
      staffId: row.staffId,
      staffName: extra.staffName,
      rating: row.rating,
      serviceRating: row.serviceRating,
      attitudeRating: row.attitudeRating,
      tags: toStringArray(row.tags),
      content: row.content,
      images: toStringArray(row.images),
      status: reviewStatusOf(row.status),
      reply: row.reply,
      repliedAt: row.repliedAt ? row.repliedAt.toISOString() : '',
      items: extra.items.map((item) => ({
        serviceId: item.serviceId,
        title: item.title,
        rating: item.rating,
      })),
      appealCount: extra.appealCount,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async reviews(
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
    const status = text(query.status, 'all');
    const staffId = Number(query.staffId) || 0;
    const rating = Number(query.rating) || 0;
    const where = {
      shopId: shop.shopId,
      ...(status && status !== 'all' ? { status } : {}),
      ...(staffId ? { staffId } : {}),
      ...(rating ? { rating } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.onsiteReview.count({ where }),
      this.prisma.onsiteReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const [items, appeals, orders] = await Promise.all([
      this.prisma.onsiteReviewItem.findMany({
        where: { reviewId: { in: rows.map((row) => row.id) } },
      }),
      this.prisma.onsiteReviewAppeal.findMany({
        where: { reviewId: { in: rows.map((row) => row.id) } },
        select: { reviewId: true },
      }),
      this.prisma.onsiteOrder.findMany({
        where: { id: { in: rows.map((row) => row.orderId) } },
        select: { id: true, orderNo: true, staffName: true },
      }),
    ]);
    const itemsOf = new Map<number, typeof items>();
    for (const item of items) {
      const bucket = itemsOf.get(item.reviewId) ?? [];
      bucket.push(item);
      itemsOf.set(item.reviewId, bucket);
    }
    const appealCount = new Map<number, number>();
    for (const appeal of appeals) {
      appealCount.set(
        appeal.reviewId,
        (appealCount.get(appeal.reviewId) || 0) + 1,
      );
    }
    const orderOf = new Map(orders.map((row) => [row.id, row]));
    const list: OnsiteReviewRow[] = [];
    for (const row of rows) {
      const order = orderOf.get(row.orderId);
      list.push(
        await this.toRow(row, {
          orderNo: order?.orderNo ?? '',
          customerNickname: '',
          staffName: order?.staffName ?? '',
          items: itemsOf.get(row.id) ?? [],
          appealCount: appealCount.get(row.id) || 0,
        }),
      );
    }
    return pageOf(list, total, page, pageSize);
  }

  async reply(user: CurrentUser, shopId: string, id: number, reply: string) {
    const shop = await this.shops.requireShop(user, shopId);
    const row = await this.prisma.onsiteReview.findFirst({
      where: { id, shopId: shop.shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '评价不存在');
    const updated = await this.prisma.onsiteReview.update({
      where: { id: row.id },
      data: { reply: reply.trim().slice(0, 1000), repliedAt: new Date() },
    });
    const order = await this.prisma.onsiteOrder.findUnique({
      where: { id: row.orderId },
      select: { orderNo: true, staffName: true },
    });
    return this.toRow(updated, {
      orderNo: order?.orderNo ?? '',
      customerNickname: '',
      staffName: order?.staffName ?? '',
      items: await this.prisma.onsiteReviewItem.findMany({
        where: { reviewId: row.id },
      }),
      appealCount: 0,
    });
  }

  /** 展示 / 隐藏评价都会触发平均分重算（隐藏的那条不再计入）。 */
  async setStatus(
    user: CurrentUser,
    shopId: string,
    id: number,
    status: OnsiteReviewStatus,
  ) {
    const shop = await this.shops.requireShop(user, shopId);
    const row = await this.prisma.onsiteReview.findFirst({
      where: { id, shopId: shop.shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '评价不存在');
    const updated = await this.prisma.onsiteReview.update({
      where: { id: row.id },
      data: { status },
    });
    const items = await this.prisma.onsiteOrderItem.findMany({
      where: { orderId: row.orderId },
      select: { serviceId: true },
    });
    await this.recalculate(
      shop.shopId,
      row.staffId,
      items.map((item) => item.serviceId),
    );
    const order = await this.prisma.onsiteOrder.findUnique({
      where: { id: row.orderId },
      select: { orderNo: true, staffName: true },
    });
    return this.toRow(updated, {
      orderNo: order?.orderNo ?? '',
      customerNickname: '',
      staffName: order?.staffName ?? '',
      items: await this.prisma.onsiteReviewItem.findMany({
        where: { reviewId: row.id },
      }),
      appealCount: 0,
    });
  }

  /**
   * 平均分级：按可见评价重算技师与服务的评分与条数（两位小数）。
   *
   * `onsite_review_items` 上没有评价状态（被隐藏的评价不能在服务分里留痕），
   * 也没有跨表关系可用，所以按「该服务的评价行 → 其中已展示的评价 → 再聚合」三步走：
   * 每次只处理这一条评价涉及的服务，量级就是单个服务的历史评价数，够用且不会跨库拼 SQL。
   */
  private async recalculate(
    shopId: number,
    staffId: number,
    serviceIds: number[],
  ) {
    if (staffId) {
      const grouped = await this.prisma.onsiteReview.aggregate({
        _avg: { rating: true },
        _count: true,
        where: { shopId, staffId, status: 'PUBLISHED' },
      });
      await this.prisma.onsiteStaff
        .update({
          where: { id: staffId },
          data: {
            rating: Number((grouped._avg.rating ?? 5).toFixed(2)),
            reviewCount: grouped._count,
          },
        })
        .catch(() => undefined);
    }
    for (const serviceId of Array.from(new Set(serviceIds.filter(Boolean)))) {
      const itemRows = await this.prisma.onsiteReviewItem.findMany({
        where: { shopId, serviceId },
        select: { reviewId: true },
      });
      const candidateIds = Array.from(
        new Set(itemRows.map((row) => row.reviewId)),
      );
      if (!candidateIds.length) continue;
      const published = await this.prisma.onsiteReview.findMany({
        where: { id: { in: candidateIds }, shopId, status: 'PUBLISHED' },
        select: { id: true },
      });
      const grouped = await this.prisma.onsiteReviewItem.aggregate({
        _avg: { rating: true },
        _count: true,
        where: {
          shopId,
          serviceId,
          reviewId: { in: published.map((row) => row.id) },
        },
      });
      await this.prisma.onsiteService
        .update({
          where: { id: serviceId },
          data: {
            rating: Number((grouped._avg.rating ?? 5).toFixed(2)),
            reviewCount: grouped._count,
          },
        })
        .catch(() => undefined);
    }
  }

  // ---------- 差评申诉 ----------

  async createAppeal(
    shopId: number,
    input: {
      reviewId: number;
      staffId: number;
      reason: string;
      images: string[];
    },
  ): Promise<OnsiteAppealRow> {
    const review = await this.prisma.onsiteReview.findFirst({
      where: { id: input.reviewId, shopId },
    });
    if (!review) throw new BusinessException(ErrorCode.NOT_FOUND, '评价不存在');
    if (review.rating >= 4) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '只有 4 星以下的评价可以发起申诉（好评不需要撤下）',
      );
    }
    const exists = await this.prisma.onsiteReviewAppeal.count({
      where: { reviewId: review.id, status: { in: ['PENDING', 'ACCEPTED'] } },
    });
    if (exists) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '这条评价已有申诉记录，请等店主处理结果',
      );
    }
    const staff = await this.prisma.onsiteStaff.findFirst({
      where: { id: input.staffId, shopId },
    });
    if (!staff)
      throw new BusinessException(ErrorCode.NOT_FOUND, '服务人员不存在');
    const row = await this.prisma.onsiteReviewAppeal.create({
      data: {
        shopId,
        reviewId: review.id,
        orderId: review.orderId,
        staffId: staff.id,
        reason: input.reason.trim().slice(0, 300),
        images: input.images.slice(0, 9),
      },
    });
    return this.toAppealRow(row, staff.name, '');
  }

  private toAppealRow(
    row: Prisma.OnsiteReviewAppealGetPayload<Record<string, never>>,
    staffName: string,
    orderNo: string,
  ): OnsiteAppealRow {
    return {
      id: row.id,
      reviewId: row.reviewId,
      orderNo,
      staffId: row.staffId,
      staffName,
      reason: row.reason,
      images: toStringArray(row.images),
      status:
        row.status === 'ACCEPTED'
          ? 'ACCEPTED'
          : row.status === 'REJECTED'
            ? 'REJECTED'
            : 'PENDING',
      reply: row.reply,
      handledAt: row.handledAt ? row.handledAt.toISOString() : '',
      createdAt: row.createdAt.toISOString(),
    };
  }

  async appeals(
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
    const status = text(query.status, 'all');
    const where = {
      shopId: shop.shopId,
      ...(status && status !== 'all' ? { status } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.onsiteReviewAppeal.count({ where }),
      this.prisma.onsiteReviewAppeal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const [staffRows, orders] = await Promise.all([
      this.prisma.onsiteStaff.findMany({
        where: {
          id: { in: Array.from(new Set(rows.map((row) => row.staffId))) },
        },
        select: { id: true, name: true },
      }),
      this.prisma.onsiteOrder.findMany({
        where: { id: { in: rows.map((row) => row.orderId) } },
        select: { id: true, orderNo: true },
      }),
    ]);
    const staffName = new Map(staffRows.map((row) => [row.id, row.name]));
    const orderNo = new Map(orders.map((row) => [row.id, row.orderNo]));
    const list: OnsiteAppealRow[] = rows.map((row) =>
      this.toAppealRow(
        row,
        staffName.get(row.staffId) ?? `#${row.staffId}`,
        orderNo.get(row.orderId) ?? '',
      ),
    );
    return pageOf(list, total, page, pageSize);
  }

  /** 申诉成立 = 撤下该条评价并重算平均分；驳回只留回复，评价仍然可见。 */
  async handleAppeal(
    user: CurrentUser,
    shopId: string,
    input: { id: number; accepted: boolean; reply: string },
  ) {
    const shop = await this.shops.requireShop(user, shopId);
    const row = await this.prisma.onsiteReviewAppeal.findFirst({
      where: { id: input.id, shopId: shop.shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '申诉不存在');
    if (row.status !== 'PENDING') {
      throw new BusinessException(ErrorCode.CONFLICT, '该申诉已处理过');
    }
    if (!input.reply.trim()) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请填写处理说明：申诉结论要回复给服务人员，不能只点按钮',
      );
    }
    const review = await this.prisma.onsiteReview.findUnique({
      where: { id: row.reviewId },
    });
    await this.prisma.$transaction([
      this.prisma.onsiteReviewAppeal.update({
        where: { id: row.id },
        data: {
          status: input.accepted ? 'ACCEPTED' : 'REJECTED',
          reply: input.reply.trim().slice(0, 300),
          handledBy: user.userId,
          handledAt: new Date(),
        },
      }),
      ...(input.accepted && review
        ? [
            this.prisma.onsiteReview.update({
              where: { id: review.id },
              data: { status: 'HIDDEN' },
            }),
          ]
        : []),
    ]);
    if (input.accepted && review) {
      const items = await this.prisma.onsiteOrderItem.findMany({
        where: { orderId: review.orderId },
        select: { serviceId: true },
      });
      await this.recalculate(
        shop.shopId,
        review.staffId,
        items.map((item) => item.serviceId),
      );
    }
    const staff = await this.prisma.onsiteStaff.findUnique({
      where: { id: row.staffId },
      select: { name: true },
    });
    const order = await this.prisma.onsiteOrder.findUnique({
      where: { id: row.orderId },
      select: { orderNo: true },
    });
    const updated = await this.prisma.onsiteReviewAppeal.findUnique({
      where: { id: row.id },
    });
    if (!updated)
      throw new BusinessException(ErrorCode.NOT_FOUND, '申诉不存在');
    return this.toAppealRow(updated, staff?.name ?? '', order?.orderNo ?? '');
  }

  // ---------- 问题反馈 ----------

  async feedbacks(
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
    const status = text(query.status, 'all');
    const where = {
      shopId: shop.shopId,
      ...(status && status !== 'all' ? { status } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.onsiteFeedback.count({ where }),
      this.prisma.onsiteFeedback.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const staffRows = await this.prisma.onsiteStaff.findMany({
      where: {
        id: {
          in: Array.from(
            new Set(rows.map((row) => row.staffId).filter(Boolean)),
          ),
        },
      },
      select: { id: true, name: true },
    });
    const staffName = new Map(staffRows.map((row) => [row.id, row.name]));
    const list: OnsiteFeedbackRow[] = rows.map((row) => ({
      id: row.id,
      customerId: row.customerId,
      staffId: row.staffId,
      staffName: staffName.get(row.staffId) ?? '',
      orderId: row.orderId,
      category: row.category,
      content: row.content,
      images: toStringArray(row.images),
      video: row.video,
      status: row.status,
      reply: row.reply,
      handledAt: row.handledAt ? row.handledAt.toISOString() : '',
      createdAt: row.createdAt.toISOString(),
    }));
    return pageOf(list, total, page, pageSize);
  }

  /** C 端「我的反馈」：只列本人提交的记录，店主回复与处理状态原样带回。 */
  async publicFeedbacks(
    shopId: number,
    customerId: number,
    page: number,
    pageSize: number,
  ) {
    const { offset } = pageParam(page, pageSize, 10);
    const where = { shopId, customerId };
    const [total, rows] = await Promise.all([
      this.prisma.onsiteFeedback.count({ where }),
      this.prisma.onsiteFeedback.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    return pageOf(
      rows.map((row) => ({
        id: row.id,
        orderId: row.orderId,
        category: row.category,
        content: row.content,
        images: toStringArray(row.images),
        status: row.status,
        reply: row.reply,
        handledAt: row.handledAt ? row.handledAt.toISOString() : '',
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    );
  }

  async handleFeedback(
    user: CurrentUser,
    shopId: string,
    input: { id: number; reply: string; status: string },
  ) {
    const shop = await this.shops.requireShop(user, shopId);
    const row = await this.prisma.onsiteFeedback.findFirst({
      where: { id: input.id, shopId: shop.shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '反馈不存在');
    const updated = await this.prisma.onsiteFeedback.update({
      where: { id: row.id },
      data: {
        status: input.status === 'DONE' ? 'DONE' : 'PENDING',
        reply: input.reply.trim().slice(0, 300),
        handledBy: user.userId,
        handledAt: new Date(),
      },
    });
    const staff = updated.staffId
      ? await this.prisma.onsiteStaff.findUnique({
          where: { id: updated.staffId },
          select: { name: true },
        })
      : null;
    return {
      id: updated.id,
      customerId: updated.customerId,
      staffId: updated.staffId,
      staffName: staff?.name ?? '',
      orderId: updated.orderId,
      category: updated.category,
      content: updated.content,
      images: toStringArray(updated.images),
      video: updated.video,
      status: updated.status,
      reply: updated.reply,
      handledAt: updated.handledAt ? updated.handledAt.toISOString() : '',
      createdAt: updated.createdAt.toISOString(),
    } satisfies OnsiteFeedbackRow;
  }

  /** 顾客/技师提交反馈（C 端与技师端共用）。 */
  async submitFeedback(
    shopId: number,
    input: {
      customerId: number;
      staffId: number;
      orderId: number;
      category: string;
      content: string;
      images: string[];
      video: string;
    },
  ) {
    if (input.content.trim().length < 4) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请描述清楚问题（至少 4 个字），方便店主处理',
      );
    }
    const row = await this.prisma.onsiteFeedback.create({
      data: {
        shopId,
        customerId: input.customerId,
        staffId: input.staffId,
        orderId: input.orderId,
        category: input.category.trim().slice(0, 40) || '其他',
        content: input.content.slice(0, 2000),
        images: input.images.slice(0, 9),
        video: input.video.trim().slice(0, 500),
      },
    });
    return { id: row.id, status: row.status };
  }
}

function clampScore(value: number) {
  const score = Math.round(Number(value) || 5);
  return Math.min(5, Math.max(1, score));
}

function toStringArray(value: unknown): string[] {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => String(item ?? '')).filter((item) => item !== '');
}
