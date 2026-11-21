import { Logger } from '../common/logger';
import type { Prisma } from '../../generated/prisma';
import type { PointsService } from '../points/points.service';
import type { PrismaService } from '../prisma/prisma.service';
import { TOOL_LAUNCH_CATALOG, type ToolCode } from './tool-launch.catalog';
import {
  chargeForPeriod,
  chargeForUsage,
  periodKeyOf,
  periodOf,
  type LaunchPlan,
} from './tool-launch.pricing';
import type { ToolLaunchSettingsService } from './tool-launch.settings.service';
import type { ToolLaunchService } from './tool-launch.service';
import { resumeArrearsBill, settlePeriod } from './tool-launch.settle';

/**
 * 启动账期日批：过渡期转首期 → 到期续扣 → 欠费停服 / 补扣复活。
 *
 * 与独立站月账同一套硬约束：
 * 1) 每天最多跑一次（守卫键），跑挂了不落键、下一轮整体重试；
 * 2) 出账幂等靠 `tool_subscription_bills (subscriptionId, periodKey)` +
 *    流水 `idempotencyKey` 双唯一键，重跑、重启、多实例都不会重复扣；
 * 3) **STOPPED 行永不出账**——用户停止或欠费停服后立即止扣，这是「只有启动才扣积分」的实现点；
 * 4) 欠费只停服不删数据，充值后自动补扣复活；平台人工停用（offBy 非空）不参与自动复活。
 *
 * 已有独立账单体系的工具（国际独立站）在这里整体跳过，绝不相叠第二套周期账。
 */

const DAILY_GUARD_KEY = 'last_tool_launch_batch_date';
const BATCH_SIZE = 500;

type Sub = Prisma.ToolSubscriptionGetPayload<object>;

export class ToolLaunchBillingService {
  private readonly logger = new Logger(ToolLaunchBillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly points: PointsService,
    private readonly settings: ToolLaunchSettingsService,
    private readonly launch: ToolLaunchService,
  ) {}

  async runDaily(now = new Date()) {
    const dayKey = now.toISOString().slice(0, 10);
    const summary = {
      skipped: false,
      started: 0,
      renewed: 0,
      arrears: 0,
      suspended: 0,
      revived: 0,
    };
    if ((await this.flag(DAILY_GUARD_KEY)) === dayKey) {
      return { ...summary, skipped: true };
    }
    try {
      const trials = await this.promoteTrials(now);
      summary.started = trials.started;
      summary.arrears += trials.arrears;
      const renew = await this.renewDue(now);
      summary.renewed = renew.renewed;
      summary.arrears += renew.arrears;
      const sweep = await this.sweep(now);
      summary.revived = sweep.revived;
      summary.suspended = sweep.suspended;
      await this.setFlag(DAILY_GUARD_KEY, dayKey);
      if (
        summary.started ||
        summary.renewed ||
        summary.suspended ||
        summary.revived
      ) {
        this.logger.log(`建站工具启动账期批处理：${JSON.stringify(summary)}`);
      }
    } catch (error) {
      this.logger.error(
        `建站工具启动账期批处理失败：${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
    return summary;
  }

  /** 存量免费过渡期到期：转 ACTIVE 并出首期（口径此刻才第一次生效，符合「过渡期内不扣」）。 */
  private async promoteTrials(
    now: Date,
  ): Promise<{ started: number; arrears: number }> {
    const rows = await this.prisma.toolSubscription.findMany({
      where: { status: 'TRIAL', trialEndsAt: { lte: now } },
      take: BATCH_SIZE,
    });
    let started = 0;
    let arrears = 0;
    for (const row of rows) {
      if (this.skipTool(row.toolCode)) continue;
      const plan = await this.launch.planFor(row.toolCode as ToolCode);
      if (this.usageCycle(plan)) {
        // 过渡期本身免费：只把账期锚点推进到过渡期结束，不出账、不计已结算期数
        await this.beginUsagePeriod(row, plan, now, row.trialEndsAt || now);
        started += 1;
        continue;
      }
      // 账期从「免费期结束」起算，不是「日批跑到这一行的那一刻」：否则每天跑批的时刻
      // 会把账期往后推，用户免费期后多享几天却永远进不了下一个账期。
      const result = await this.beginPeriod(
        row,
        plan,
        now,
        row.trialEndsAt || now,
      );
      if (result === 'ARREARS') arrears += 1;
      else started += 1;
    }
    return { started, arrears };
  }

  /** 到期续扣：按当前管理员口径推进一期（改价改周期都从这一期起生效）。 */
  private async renewDue(
    now: Date,
  ): Promise<{ renewed: number; arrears: number }> {
    const rows = await this.prisma.toolSubscription.findMany({
      where: { status: 'ACTIVE', periodEnd: { lte: now } },
      take: BATCH_SIZE,
    });
    let renewed = 0;
    let arrears = 0;
    for (const row of rows) {
      if (this.skipTool(row.toolCode)) continue;
      const plan = await this.launch.planFor(row.toolCode as ToolCode);
      if (this.usageCycle(plan)) {
        const outcome = await this.renewUsage(row, plan, now);
        if (outcome === 'ARREARS') arrears += 1;
        else renewed += 1;
        continue;
      }
      const result = await this.beginPeriod(
        row,
        plan,
        now,
        row.periodEnd || now,
      );
      if (result === 'ARREARS') arrears += 1;
      else renewed += 1;
    }
    return { renewed, arrears };
  }

  /**
   * 起一期并出账。账期锚点默认「现在」，续扣时锚定上一期期末，保证账期首尾相接不重叠。
   * 返回结果只区分是否欠费；EXISTS（上一轮已扣过）当作成功推进。
   */
  private async beginPeriod(
    row: Sub,
    plan: LaunchPlan,
    now: Date,
    anchor?: Date,
  ): Promise<'OK' | 'ARREARS'> {
    const cycleDays = plan.cycleDays || row.cycleDays || 30;
    const period = periodOf(anchor || now, cycleDays);
    const charge = chargeForPeriod(plan, row.billedPeriods);
    const result = await settlePeriod({
      prisma: this.prisma,
      points: this.points,
      subscriptionId: row.id,
      userId: row.userId,
      toolCode: row.toolCode,
      plan,
      periodKey: periodKeyOf(row.billedPeriods + 1),
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      amount: charge.amount,
      periodNo: row.billedPeriods + 1,
      now,
      onInsufficient: 'mark-arrears',
      markArrears: async (tx) => {
        await tx.toolSubscription.update({
          where: { id: row.id },
          data: { status: 'ARREARS', arrearsSince: now },
        });
      },
    });
    if (result === 'ARREARS') {
      this.launch.invalidateGate(row.toolCode as ToolCode, row.userId);
      return 'ARREARS';
    }
    await this.prisma.toolSubscription.update({
      where: { id: row.id },
      data: {
        status: 'ACTIVE',
        stopReason: '',
        startedAt: row.startedAt || now,
        trialEndsAt: null,
        arrearsSince: null,
        cycleDays,
        unitPriceAmount: plan.unitPrice,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        billedPeriods: row.billedPeriods + 1,
      },
    });
    this.launch.invalidateGate(row.toolCode as ToolCode, row.userId);
    return 'OK';
  }

  /** 按量口径的期末结算：先按本期实际用量出账，再把账期推进到下一段。 */
  private async renewUsage(
    row: Sub,
    plan: LaunchPlan,
    now: Date,
  ): Promise<'OK' | 'ARREARS'> {
    const periodStart = row.periodStart || now;
    const periodEnd = row.periodEnd || now;
    const quantity = await this.usageQuantity(
      row.userId,
      row.toolCode,
      plan.cycle,
      periodStart,
      periodEnd,
    );
    const charge = chargeForUsage(plan, quantity);
    const periodNo = row.billedPeriods + 1;
    const result = await settlePeriod({
      prisma: this.prisma,
      points: this.points,
      subscriptionId: row.id,
      userId: row.userId,
      toolCode: row.toolCode,
      plan,
      periodKey: periodKeyOf(periodNo),
      periodStart,
      periodEnd,
      amount: charge.amount,
      quantity,
      periodNo,
      now,
      onInsufficient: 'mark-arrears',
      markArrears: async (tx) => {
        await tx.toolSubscription.update({
          where: { id: row.id },
          data: { status: 'ARREARS', arrearsSince: now },
        });
      },
    });
    if (result === 'ARREARS') {
      this.launch.invalidateGate(row.toolCode as ToolCode, row.userId);
      return 'ARREARS';
    }
    const next = periodOf(periodEnd, row.cycleDays || 30);
    await this.prisma.toolSubscription.update({
      where: { id: row.id },
      data: {
        status: 'ACTIVE',
        stopReason: '',
        arrearsSince: null,
        cycleDays: row.cycleDays || 30,
        unitPriceAmount: plan.unitPrice,
        periodStart: next.periodStart,
        periodEnd: next.periodEnd,
        billedPeriods: periodNo,
      },
    });
    this.launch.invalidateGate(row.toolCode as ToolCode, row.userId);
    return 'OK';
  }

  private usageCycle(plan: LaunchPlan) {
    return (
      plan.cycle === 'USAGE_PV' ||
      plan.cycle === 'USAGE_BYTES' ||
      plan.cycle === 'USAGE_VIEW'
    );
  }

  /** 过渡期结束进入按量口径：只开账期，不预付、不出账。 */
  private async beginUsagePeriod(
    row: Sub,
    plan: LaunchPlan,
    now: Date,
    anchor?: Date,
  ) {
    const period = periodOf(anchor || now, row.cycleDays || 30);
    await this.prisma.toolSubscription.update({
      where: { id: row.id },
      data: {
        status: 'ACTIVE',
        stopReason: '',
        startedAt: row.startedAt || now,
        stoppedAt: null,
        trialEndsAt: null,
        arrearsSince: null,
        cycleDays: row.cycleDays || 30,
        unitPriceAmount: plan.unitPrice,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
      },
    });
    this.launch.invalidateGate(row.toolCode as ToolCode, row.userId);
  }

  private async usageQuantity(
    userId: string,
    toolCode: string,
    cycle: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<number> {
    const from = new Date(
      Date.UTC(
        periodStart.getUTCFullYear(),
        periodStart.getUTCMonth(),
        periodStart.getUTCDate(),
      ),
    );
    const to = new Date(
      Date.UTC(
        periodEnd.getUTCFullYear(),
        periodEnd.getUTCMonth(),
        periodEnd.getUTCDate(),
      ),
    );
    const rows = await this.prisma.toolUsageDaily
      .findMany({
        where: { userId, toolCode, day: { gte: from, lt: to } },
        select: { pv: true, views: true, bytes: true },
      })
      .catch(() => [] as { pv: number; views: number; bytes: bigint }[]);
    return rows.reduce((sum, row) => {
      if (cycle === 'USAGE_BYTES') return sum + Number(row.bytes);
      if (cycle === 'USAGE_VIEW') return sum + row.views;
      return sum + row.pv;
    }, 0);
  }

  /**
   * 用户停止时结算本期已产生的按量用量：按「开始 → 停止时刻」结算，账单键带 S 后缀，
   * 与日批的整期账单区分；重复停止会撞唯一索引，不会重复扣。
   */
  async settleUsageBeforeStop(
    userId: string,
    toolCode: string,
    now = new Date(),
  ): Promise<void> {
    const row = await this.prisma.toolSubscription.findUnique({
      where: { userId_toolCode: { userId, toolCode } },
    });
    if (!row || (row.status !== 'ACTIVE' && row.status !== 'ARREARS')) return;
    const plan = await this.launch.planFor(toolCode as ToolCode);
    if (!this.usageCycle(plan) || !row.periodStart) return;
    const quantity = await this.usageQuantity(
      userId,
      toolCode,
      plan.cycle,
      row.periodStart,
      now,
    );
    if (quantity <= 0) return;
    const charge = chargeForUsage(plan, quantity);
    const periodNo = row.billedPeriods + 1;
    const result = await settlePeriod({
      prisma: this.prisma,
      points: this.points,
      subscriptionId: row.id,
      userId,
      toolCode,
      plan,
      periodKey: `${periodKeyOf(periodNo)}S`,
      periodStart: row.periodStart,
      periodEnd: now,
      amount: charge.amount,
      quantity,
      periodNo,
      now,
      onInsufficient: 'mark-arrears',
      markArrears: async (tx) => {
        await tx.toolSubscription.update({
          where: { id: row.id },
          data: { status: 'ARREARS', arrearsSince: now },
        });
      },
    });
    if (result === 'ARREARS') {
      this.launch.invalidateGate(toolCode as ToolCode, userId);
      return;
    }
    await this.prisma.toolSubscription.update({
      where: { id: row.id },
      data: {
        billedPeriods: periodNo,
        periodEnd: now,
        unitPriceAmount: plan.unitPrice,
      },
    });
  }

  /** 欠费停服与补扣复活。 */
  private async sweep(
    now: Date,
  ): Promise<{ revived: number; suspended: number }> {
    const policy = await this.settings.view();
    let revived = 0;
    let suspended = 0;

    const pending = await this.prisma.toolSubscriptionBill.findMany({
      where: { status: 'ARREARS' },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    });
    for (const bill of pending) {
      if (this.skipTool(bill.toolCode)) continue;
      const row = await this.prisma.toolSubscription
        .findUnique({ where: { id: bill.subscriptionId } })
        .catch(() => null);
      if (!row) continue;
      const plan = await this.launch.planFor(row.toolCode as ToolCode);
      // 补扣与账期推进全在 resumeArrearsBill 里，和用户点「启动」走同一条路
      const outcome = await resumeArrearsBill({
        prisma: this.prisma,
        points: this.points,
        row,
        bill,
        plan,
        now,
      });
      if (outcome !== 'RESUMED') continue;
      this.launch.invalidateGate(row.toolCode as ToolCode, row.userId);
      revived += 1;
    }

    if (!policy.suspendOnArrears) return { revived, suspended };
    const deadline = new Date(now.getTime() - policy.graceHours * 3600_000);
    const due = await this.prisma.toolSubscription.findMany({
      where: { status: 'ARREARS', arrearsSince: { lt: deadline } },
      take: BATCH_SIZE,
    });
    for (const row of due) {
      if (this.skipTool(row.toolCode)) continue;
      await this.prisma.toolSubscription.update({
        where: { id: row.id },
        data: { status: 'STOPPED', stopReason: 'ARREARS', stoppedAt: now },
      });
      this.launch.invalidateGate(row.toolCode as ToolCode, row.userId);
      suspended += 1;
    }
    return { revived, suspended };
  }

  /** 国际独立站沿用自家站点月账，这里只当功能闸，不出第二套周期账。 */
  private skipTool(toolCode: string): boolean {
    const descriptor = TOOL_LAUNCH_CATALOG.find(
      (item) => item.code === toolCode,
    );
    return !!descriptor?.ownBilling;
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
