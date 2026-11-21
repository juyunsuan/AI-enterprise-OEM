import {
  HEALTH_ORDER_BIZ_TYPES,
  type HealthDashboard,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import { intIn, requireShop, toIso } from './health.shared';

const BIZ_TYPES = new Set<string>(HEALTH_ORDER_BIZ_TYPES);

/** 本地时区的日键（YYYY-MM-DD）：看板按店主所在地的自然日切，不用 UTC。 */
function dayKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfDay(value: Date): Date {
  const out = new Date(value);
  out.setHours(0, 0, 0, 0);
  return out;
}

const sumOf = (values: number[]): number =>
  values.reduce((sum, item) => sum + item, 0);

/**
 * 经营看板（C13 的数据面，先落 C2 便于页面骨架打通）。
 *
 * 口径：
 * 1. 时间范围按「自然日」左闭右开：`days=30` 是含今天在内的最近 30 天；
 * 2. 收款额以 `paidAt` 落日志，退款额以 `refundedAt` 落日志，二者不互相冲抵（对账要分开看）；
 * 3. 待办区只回计数与落点，不在这里做任何状态流转——点进对应页面再处理。
 */
export class HealthStatService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthDashboard> {
    const context = await requireShop(this.prisma, user, query.shopId, 'stat');
    const shopId = context.shop.id;
    const days = intIn(query.days, 1, 365, 30);
    const now = new Date();
    const from = startOfDay(new Date(now.getTime() - (days - 1) * 86_400_000));
    const range = { gte: from };

    const [
      customers,
      orders,
      alerts,
      consults,
      followupTotal,
      followupDone,
      followupOverdue,
      metricLogCount,
      alertOpenCount,
      prescriptionCount,
      prescriptionPendingReview,
      goodsShipPending,
      aftersalePending,
      withdrawalPending,
      practitionerActive,
      patientCount,
      reviewAgg,
      orderItems,
    ] = await Promise.all([
      this.prisma.healthCustomer.findMany({
        where: { shopId },
        select: { createdAt: true, lastActiveAt: true },
      }),
      this.prisma.healthOrder.findMany({
        where: { shopId, createdAt: range },
        select: {
          createdAt: true,
          paidAt: true,
          refundedAt: true,
          payStatus: true,
          orderType: true,
          payAmountCents: true,
          refundAmountCents: true,
        },
      }),
      this.prisma.healthAlert.findMany({
        where: { shopId, createdAt: range },
        select: { createdAt: true },
      }),
      this.prisma.healthConsult.findMany({
        where: { shopId, createdAt: range },
        select: { createdAt: true, acceptedAt: true },
      }),
      this.prisma.healthFollowupTask.count({ where: { shopId } }),
      this.prisma.healthFollowupTask.count({
        where: { shopId, status: 'DONE', updatedAt: range },
      }),
      this.prisma.healthFollowupTask.count({
        where: {
          shopId,
          status: { in: ['PENDING', 'OVERDUE'] },
          dueAt: { lt: now },
        },
      }),
      this.prisma.healthMetricLog.count({
        where: { shopId, measuredAt: range },
      }),
      this.prisma.healthAlert.count({ where: { shopId, status: 'OPEN' } }),
      this.prisma.healthPrescription.count({
        where: { shopId, createdAt: range },
      }),
      this.prisma.healthPrescription.count({
        where: { shopId, status: 'PENDING' },
      }),
      this.prisma.healthOrder.count({
        where: {
          shopId,
          orderType: 'GOODS',
          payStatus: 'PAID',
          status: { in: ['PAID', 'ACCEPTED', 'ASSIGNED', 'SERVING'] },
        },
      }),
      this.prisma.healthAftersale.count({
        where: { shopId, status: { in: ['PENDING', 'RETURNING'] } },
      }),
      this.prisma.healthWithdrawal.count({
        where: { shopId, status: 'PENDING' },
      }),
      this.prisma.healthPractitioner.count({
        where: { shopId, status: 'ON', auditStatus: 'APPROVED' },
      }),
      this.prisma.healthPatient.count({ where: { shopId } }),
      this.prisma.healthReview.aggregate({
        where: { shopId, status: 'PUBLISHED' },
        _avg: { score: true },
        _count: { _all: true },
      }),
      this.prisma.healthOrderItem.findMany({
        where: {
          shopId,
          practitionerId: { gt: 0 },
          createdAt: range,
        },
        select: { practitionerId: true, amountCents: true },
      }),
    ]);

    // 收款/退款按发生日归集：一张订单可能跨日退款，两次分别计入。
    const trend = new Map<
      string,
      {
        customerNew: number;
        orderCount: number;
        payCents: number;
        alertCount: number;
      }
    >();
    for (let index = 0; index < days; index += 1) {
      const day = dayKey(new Date(from.getTime() + index * 86_400_000));
      trend.set(day, {
        customerNew: 0,
        orderCount: 0,
        payCents: 0,
        alertCount: 0,
      });
    }
    const bump = (
      day: string,
      key: 'customerNew' | 'orderCount' | 'payCents' | 'alertCount',
      amount = 1,
    ) => {
      const entry = trend.get(day);
      if (entry) entry[key] += amount;
    };

    let customerNew = 0;
    let customerActive = 0;
    for (const customer of customers) {
      if (customer.createdAt >= from) {
        customerNew += 1;
        bump(dayKey(customer.createdAt), 'customerNew');
      }
      if (customer.lastActiveAt && customer.lastActiveAt >= from)
        customerActive += 1;
    }

    let payCents = 0;
    let refundCents = 0;
    let orderCount = 0;
    const bizMix = new Map<string, { count: number; payCents: number }>();
    for (const order of orders) {
      orderCount += 1;
      bump(dayKey(order.createdAt), 'orderCount');
      if (
        order.paidAt &&
        order.paidAt >= from &&
        order.payStatus !== 'UNPAID'
      ) {
        payCents += order.payAmountCents;
        bump(dayKey(order.paidAt), 'payCents', order.payAmountCents);
        if (BIZ_TYPES.has(order.orderType)) {
          const entry = bizMix.get(order.orderType) ?? {
            count: 0,
            payCents: 0,
          };
          entry.count += 1;
          entry.payCents += order.payAmountCents;
          bizMix.set(order.orderType, entry);
        }
      }
      if (order.refundedAt && order.refundedAt >= from) {
        refundCents += order.refundAmountCents;
      }
    }

    for (const alert of alerts) bump(dayKey(alert.createdAt), 'alertCount');

    const acceptMinutes = consults
      .filter((item) => item.acceptedAt)
      .map(
        (item) =>
          (item.acceptedAt!.getTime() - item.createdAt.getTime()) / 60_000,
      )
      .filter((minutes) => minutes >= 0);
    const consultAvgAcceptMinutes = Math.round(
      sumOf(acceptMinutes) / Math.max(1, acceptMinutes.length),
    );

    const earningByPractitioner = new Map<
      number,
      { orderCount: number; earningCents: number }
    >();
    for (const item of orderItems) {
      const entry = earningByPractitioner.get(item.practitionerId) ?? {
        orderCount: 0,
        earningCents: 0,
      };
      entry.orderCount += 1;
      entry.earningCents += item.amountCents;
      earningByPractitioner.set(item.practitionerId, entry);
    }
    const topIds = [...earningByPractitioner.entries()]
      .sort((a, b) => b[1].earningCents - a[1].earningCents)
      .slice(0, 5)
      .map(([id]) => id);
    const topRows = topIds.length
      ? await this.prisma.healthPractitioner.findMany({
          where: { shopId, id: { in: topIds } },
          select: { id: true, name: true, scoreSum: true, scoreCount: true },
        })
      : [];
    const topMap = new Map(topRows.map((row) => [row.id, row]));
    const topPractitioners = topIds.flatMap((id) => {
      const stat = earningByPractitioner.get(id);
      const row = topMap.get(id);
      if (!stat || !row) return [];
      return [
        {
          practitionerId: id,
          name: row.name,
          orderCount: stat.orderCount,
          earningCents: stat.earningCents,
          score:
            row.scoreCount > 0
              ? Math.round((row.scoreSum / row.scoreCount) * 10) / 10
              : 0,
        },
      ];
    });

    const followupDonePercent =
      followupTotal > 0
        ? Math.round((followupDone / followupTotal) * 1000) / 10
        : 0;

    const todo = [
      {
        key: 'consult',
        label: '待接诊问诊',
        count: consults.filter((item) => !item.acceptedAt).length,
        href: '/health/consult',
      },
      {
        key: 'followup',
        label: '逾期随访',
        count: followupOverdue,
        href: '/health/followup',
      },
      {
        key: 'alert',
        label: '未处理预警',
        count: alertOpenCount,
        href: '/health/alert',
      },
      {
        key: 'prescription',
        label: '待审处方',
        count: prescriptionPendingReview,
        href: '/health/prescription',
      },
      {
        key: 'ship',
        label: '待发货订单',
        count: goodsShipPending,
        href: '/health/order',
      },
      {
        key: 'aftersale',
        label: '待处理售后',
        count: aftersalePending,
        href: '/health/order?tab=aftersale',
      },
      {
        key: 'withdrawal',
        label: '待审提现',
        count: withdrawalPending,
        href: '/health/fund',
      },
    ];

    return {
      range: { from: dayKey(from), to: toIso(now), days },
      customerNew,
      customerActive,
      patientCount,
      orderCount,
      payCents,
      refundCents,
      consultCount: consults.length,
      consultAvgAcceptMinutes,
      followupTotal,
      followupDone,
      followupOverdue,
      followupDonePercent,
      metricLogCount,
      alertCount: alerts.length,
      alertOpenCount,
      prescriptionCount,
      prescriptionPendingReview,
      goodsShipPending,
      aftersalePending,
      withdrawalPending,
      practitionerActive,
      reviewScore:
        reviewAgg._avg.score !== null && reviewAgg._avg.score !== undefined
          ? Math.round(Number(reviewAgg._avg.score) * 10) / 10
          : 0,
      reviewCount: reviewAgg._count._all,
      trend: [...trend.entries()].map(([day, entry]) => ({ day, ...entry })),
      bizMix: [...bizMix.entries()].map(([bizType, entry]) => ({
        bizType: bizType as (typeof HEALTH_ORDER_BIZ_TYPES)[number],
        ...entry,
      })),
      topPractitioners,
      todo,
    };
  }
}
