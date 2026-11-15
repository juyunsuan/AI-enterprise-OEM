import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { Logger } from '../common/logger';
import { PrismaService } from '../prisma/prisma.service';
import { PointsService } from '../points/points.service';
import { GeoSiteSettingsService } from './geo-site.settings.service';

/**
 * GEO 独立站按月扣积分：账期＝自然月，每月 1 日出账，首月按在册天数折算。
 *
 * 四条硬约束：
 * 1) 幂等——扣费流水、账单行、用量事件在同一事务里提交，`geo_site_bills (siteId, periodMonth)`
 *    与 point_transactions.idempotencyKey 双唯一键兜底，日批重跑、进程重启、多实例并发都不会重复扣；
 * 2) 免费额按账号排名——单价读 module_pricing.geo_site，`free_quota_amount` 的语义是
 *    「每个账号排名前 N 个站点免费」，排名按 billingFrom 升序；展示与出账共用 planMonthlyCharges，不会两张嘴；
 * 3) 欠费只冻结、不删数据——余额不足记 ARREARS，超过宽限期才停止公开访问（SUSPENDED）；
 * 4) 已停服的站点不再产生新账单，充值补扣后自动复活，不会越欠越多。
 */

export const GEO_SITE_BILL_SCENE = 'geo_site';
const DAILY_GUARD_KEY = 'last_geo_site_batch_date';

export type PlanSite = {
  id: number;
  ownerUserId: string;
  billingFrom: Date;
};

export type PlanEntry = {
  siteId: number;
  ownerUserId: string;
  /** 站点在账号内的免费额排名（从 1 开始）。 */
  rank: number;
  days: number;
  amount: number;
  waived: boolean;
};

export type PlanOptions = {
  monthPrice: number;
  freeSites: number;
  minCharge: number;
  pricingEnabled: boolean;
  /** 账期 YYYY-MM，默认当月。 */
  periodMonth?: string;
};

const round4 = (value: number) => Math.round(value * 10000) / 10000;

export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthParts(periodMonth: string): [number, number] {
  const [year, month] = periodMonth.split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) return [2000, 1];
  return [year, month];
}

function daysInMonth(periodMonth: string): number {
  const [year, month] = monthParts(periodMonth);
  return new Date(year, month, 0).getDate();
}

/** 本期在册天数：首月从建站当天起算，跨月为整月，建站日晚于账期则不计费。 */
export function proratedDays(billingFrom: Date, periodMonth: string): number {
  const total = daysInMonth(periodMonth);
  const [year, month] = monthParts(periodMonth);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  const from = new Date(
    billingFrom.getFullYear(),
    billingFrom.getMonth(),
    billingFrom.getDate(),
  );
  if (from > end) return 0;
  if (from <= start) return total;
  return total - (from.getDate() - 1);
}

/**
 * 账单计划（纯函数）：按账号分组 → 按 billingFrom 升序排名 → 排名在免费额内、
 * 折算天数为 0 或未启用计费即免费，其余按「单价 × 在册天数 / 当月天数」，非零账单不低于起扣额。
 */
export function planMonthlyCharges(
  sites: PlanSite[],
  options: PlanOptions,
): PlanEntry[] {
  const periodMonth = options.periodMonth || monthKeyOf(new Date());
  const total = daysInMonth(periodMonth);
  const byOwner = new Map<string, PlanSite[]>();
  for (const site of [...sites].sort(
    (a, b) => a.billingFrom.getTime() - b.billingFrom.getTime() || a.id - b.id,
  )) {
    const bucket = byOwner.get(site.ownerUserId) || [];
    bucket.push(site);
    byOwner.set(site.ownerUserId, bucket);
  }
  const out: PlanEntry[] = [];
  for (const [ownerUserId, list] of byOwner) {
    list.forEach((site, index) => {
      const rank = index + 1;
      const days = proratedDays(site.billingFrom, periodMonth);
      const withinFree = rank <= options.freeSites;
      let amount = 0;
      if (
        options.pricingEnabled &&
        options.monthPrice > 0 &&
        days > 0 &&
        !withinFree
      ) {
        amount = round4((options.monthPrice * days) / total);
        if (amount > 0 && amount < options.minCharge)
          amount = round4(options.minCharge);
      }
      out.push({
        siteId: site.id,
        ownerUserId,
        rank,
        days,
        amount,
        waived: amount <= 0,
      });
    });
  }
  return out.sort((a, b) => a.siteId - b.siteId);
}

type SettleInput = {
  /** 已有账单行（欠费补扣）时传入，直接改写该行。 */
  billId?: number;
  siteId: number;
  ownerUserId: string;
  amount: number;
  days: number;
  periodMonth: string;
  at: Date;
};

export class GeoSiteBillingService {
  private readonly logger = new Logger(GeoSiteBillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly points: PointsService,
    private readonly settings: GeoSiteSettingsService,
  ) {}

  /**
   * 进程内日批入口：每天最多跑一次（守卫键拦截），每月 1 日额外出一次月账，
   * 停服与补扣复活每天都过一遍。中途异常不落守卫键，下一轮整体重试。
   */
  async runDaily(now = new Date()) {
    const dayKey = `${monthKeyOf(now)}-${String(now.getDate()).padStart(2, '0')}`;
    const summary = {
      skipped: false,
      billed: 0,
      charged: 0,
      arrears: 0,
      suspended: 0,
      revived: 0,
    };
    if ((await this.flag(DAILY_GUARD_KEY)) === dayKey) {
      return { ...summary, skipped: true };
    }
    try {
      if (now.getDate() === 1) {
        const monthly = await this.chargeMonth(monthKeyOf(now), now);
        summary.billed = monthly.billed;
        summary.charged = monthly.charged;
        summary.arrears = monthly.arrears;
      }
      const sweep = await this.sweep(now);
      summary.suspended = sweep.suspended;
      summary.revived = sweep.revived;
      await this.setFlag(DAILY_GUARD_KEY, dayKey);
      if (summary.billed || summary.suspended || summary.revived) {
        this.logger.log(`GEO 独立站账单批处理：${JSON.stringify(summary)}`);
      }
    } catch (error) {
      this.logger.error(
        `GEO 独立站账单批处理失败：${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
    return summary;
  }

  /** 出某个月的账（默认当月）：可被手工触发与测试直接调用，已出账的站点自动跳过。 */
  async chargeMonth(periodMonth = monthKeyOf(new Date()), now = new Date()) {
    const [pricing, sites] = await Promise.all([
      this.pricing(),
      this.prisma.geoSite.findMany({
        where: { status: { not: 'SUSPENDED' } },
        select: { id: true, ownerUserId: true, billingFrom: true },
      }),
    ]);
    const plan = planMonthlyCharges(sites, { ...pricing, periodMonth });
    let billed = 0;
    let charged = 0;
    let arrears = 0;
    for (const entry of plan) {
      const existed = await this.prisma.geoSiteBill.findUnique({
        where: { siteId_periodMonth: { siteId: entry.siteId, periodMonth } },
      });
      if (existed) continue;
      billed += 1;
      if (entry.waived) {
        await this.prisma.geoSiteBill
          .create({
            data: {
              siteId: entry.siteId,
              ownerUserId: entry.ownerUserId,
              periodMonth,
              days: entry.days,
              pointsAmount: 0,
              status: 'WAIVED',
            },
          })
          .catch(() => undefined);
        continue;
      }
      const result = await this.settle({
        siteId: entry.siteId,
        ownerUserId: entry.ownerUserId,
        amount: entry.amount,
        days: entry.days,
        periodMonth,
        at: now,
      });
      if (result === 'CHARGED') charged += 1;
      else if (result === 'ARREARS') arrears += 1;
    }
    return { billed, charged, arrears };
  }

  /**
   * 扣一笔月费：条件更新扣积分 + 落账单 + 落用量事件，同一事务提交。
   * 余额不足只把账单记 ARREARS 并起算宽限，业务与数据都不中断。
   */
  private async settle(
    input: SettleInput,
  ): Promise<'CHARGED' | 'ARREARS' | 'EXISTS'> {
    const { siteId, ownerUserId, amount, days, periodMonth, at } = input;
    await this.points.ensureAccount(ownerUserId);
    const idempotencyKey = `${GEO_SITE_BILL_SCENE}:${siteId}:${periodMonth}`;
    try {
      await this.prisma.$transaction(async (tx) => {
        const debit = await this.points.debitTx(
          tx,
          ownerUserId,
          'SPEND',
          amount,
          {
            scene: GEO_SITE_BILL_SCENE,
            refType: 'geo_site_bill',
            refId: String(input.billId ?? siteId),
            idempotencyKey,
            remark: `独立站月费 ${periodMonth}（${days} 天）`,
          },
        );
        if (input.billId) {
          await tx.geoSiteBill.update({
            where: { id: input.billId },
            data: { status: 'CHARGED', pointsAmount: amount, txId: debit.txId },
          });
        } else {
          await tx.geoSiteBill.create({
            data: {
              siteId,
              ownerUserId,
              periodMonth,
              days,
              pointsAmount: amount,
              status: 'CHARGED',
              txId: debit.txId,
            },
          });
        }
        await tx.usageEvent.create({
          data: {
            userId: ownerUserId,
            code: GEO_SITE_BILL_SCENE,
            quantityAmount: round4(days / (daysInMonth(periodMonth) || 1)),
            occurredAt: at,
            billed: 1,
            billTxId: debit.txId,
            remark: `独立站月费 ${amount}`,
          },
        });
      });
      return 'CHARGED';
    } catch (error) {
      if (
        error instanceof BusinessException &&
        error.errorCode.code === ErrorCode.POINTS_INSUFFICIENT.code
      ) {
        if (!input.billId) {
          await this.prisma.geoSiteBill
            .create({
              data: {
                siteId,
                ownerUserId,
                periodMonth,
                days,
                pointsAmount: amount,
                status: 'ARREARS',
              },
            })
            .catch(() => undefined);
        } else {
          await this.prisma.geoSiteBill.update({
            where: { id: input.billId },
            data: { status: 'ARREARS' },
          });
        }
        await this.prisma.pointAccount
          .update({
            where: { userId: ownerUserId },
            data: { status: 'ARREARS', arrearsSince: new Date() },
          })
          .catch(() => undefined);
        // 宽限期从欠费起算，到期才由 sweep 停止公开访问
        await this.prisma.geoSite
          .update({ where: { id: siteId }, data: { suspendedAt: at } })
          .catch(() => undefined);
        return 'ARREARS';
      }
      if (isUniqueViolation(error)) {
        // 流水或账单已存在＝上一次确实扣过了，只对账不再重复扣
        const txRow = await this.prisma.pointTransaction.findUnique({
          where: { idempotencyKey },
        });
        if (txRow && input.billId) {
          await this.prisma.geoSiteBill
            .update({
              where: { id: input.billId },
              data: { status: 'CHARGED', txId: txRow.id },
            })
            .catch(() => undefined);
        }
        return 'EXISTS';
      }
      throw error;
    }
  }

  /**
   * 每日巡检：宽限期到点停服 + 欠费账单补扣复活。
   * 平台管理员强制下线的站点（offBy 非空）不参与自动复活，必须人工恢复。
   */
  async sweep(now = new Date()) {
    const [settings, pending] = await Promise.all([
      this.settings.view(),
      this.prisma.geoSiteBill.findMany({
        where: { status: 'ARREARS' },
        orderBy: { id: 'asc' },
        take: 500,
      }),
    ]);
    let revived = 0;
    for (const bill of pending) {
      const account = await this.points.ensureAccount(bill.ownerUserId);
      const amount = Number(bill.pointsAmount);
      if (amount <= 0 || Number(account.balanceAmount) < amount) continue;
      const result = await this.settle({
        billId: bill.id,
        siteId: bill.siteId,
        ownerUserId: bill.ownerUserId,
        amount,
        days: bill.days,
        periodMonth: bill.periodMonth,
        at: now,
      });
      if (result === 'ARREARS') continue;
      const site = await this.prisma.geoSite.findUnique({
        where: { id: bill.siteId },
      });
      if (!site || site.offBy) continue;
      const unpaid = await this.prisma.geoSiteBill.count({
        where: { siteId: bill.siteId, status: 'ARREARS' },
      });
      if (unpaid > 0) continue;
      await this.prisma.geoSite.update({
        where: { id: site.id },
        data: {
          status: site.publishedContent ? 'PUBLISHED' : 'DRAFT',
          suspendedAt: null,
        },
      });
      revived += 1;
    }
    let suspended = 0;
    if (settings.suspendOnArrears) {
      const deadline = new Date(now.getTime() - settings.graceHours * 3600_000);
      const due = await this.prisma.geoSite.findMany({
        where: { status: 'PUBLISHED', suspendedAt: { lt: deadline } },
        select: { id: true },
        take: 500,
      });
      if (due.length) {
        await this.prisma.geoSite.updateMany({
          where: { id: { in: due.map((item) => item.id) } },
          data: { status: 'SUSPENDED' },
        });
        suspended = due.length;
      }
    }
    return { revived, suspended };
  }

  async pricing() {
    const row = await this.prisma.modulePricing.findUnique({
      where: { code: GEO_SITE_BILL_SCENE },
    });
    return {
      monthPrice: round4(Number(row?.unitPriceAmount ?? 0)),
      freeSites: round4(Number(row?.freeQuotaAmount ?? 0)),
      minCharge: round4(Number(row?.minChargeAmount ?? 0)),
      pricingEnabled: !!row && row.enabled === 1 && row.mode === 'METERED',
    };
  }

  private async flag(key: string): Promise<string> {
    const row = await this.prisma.systemSetting
      .findUnique({ where: { key } })
      .catch(() => null);
    return row?.value || '';
  }

  private async setFlag(key: string, value: string) {
    await this.prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === 'P2002' || String(error).includes('23505');
}
