import type { Prisma } from '../../generated/prisma';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PointsService } from '../points/points.service';
import type { PrismaService } from '../prisma/prisma.service';
import { periodOf, type LaunchPlan } from './tool-launch.pricing';

/**
 * 账期结算：一笔积分流水 + 一条账单 + 一条用量事件，同一事务提交。
 *
 * 幂等三保险（照搬独立站月账的成熟做法）：
 * 1) `point_transactions.idempotencyKey` 唯一；
 * 2) `tool_subscription_bills (subscriptionId, periodKey)` 唯一；
 * 3) 日批守卫键（在 billing service 里）。
 * 任一层撞唯一键都按「上一次确实扣过了」处理，绝不重复扣。
 *
 * 余额不足的行为按调用场景分两种：
 * - `throw`：用户亲手点「启动」，必须当场失败并回滚，不留半成品账单；
 * - `mark-arrears`：后台日批续扣，业务已在跑，账单记 ARREARS 并起算宽限，不打断营业。
 */

export const TOOL_LAUNCH_BILL_SCENE = 'tool_launch';

export function launchIdempotencyKey(
  toolCode: string,
  subscriptionId: number,
  periodKey: string,
) {
  return `${TOOL_LAUNCH_BILL_SCENE}:${toolCode}:${subscriptionId}:${periodKey}`;
}

export type SettleArgs = {
  prisma: PrismaService;
  points: PointsService;
  subscriptionId: number;
  userId: string;
  toolCode: string;
  plan: LaunchPlan;
  periodKey: string;
  periodStart: Date;
  periodEnd: Date;
  amount: number;
  /** 本期计量数量（按量口径写账单；周期口径缺省 1）。 */
  quantity?: number;
  /** 第几期（从 1 起），只用于账单备注可读。 */
  periodNo: number;
  now: Date;
  /** 已存在的欠费账单（补扣时改写该行，不再新增）。 */
  billId?: number;
  onInsufficient: 'throw' | 'mark-arrears';
  /** 欠费时的宽限锚点写回（mark-arrears 用）：由调用方决定落到哪张表。 */
  markArrears?: (tx: Prisma.TransactionClient) => Promise<void>;
};

export type SettleResult = 'CHARGED' | 'WAIVED' | 'ARREARS' | 'EXISTS';

function billData(args: SettleArgs, status: string, txId = 0) {
  return {
    subscriptionId: args.subscriptionId,
    userId: args.userId,
    toolCode: args.toolCode,
    periodKey: args.periodKey,
    periodStart: args.periodStart,
    periodEnd: args.periodEnd,
    days: Math.max(
      1,
      Math.round(
        (args.periodEnd.getTime() - args.periodStart.getTime()) / 86400_000,
      ),
    ),
    billingMode:
      args.plan.cycle === 'FREE'
        ? 'FREE'
        : args.plan.cycleDays > 0
          ? 'PERIOD'
          : 'USAGE',
    quantityAmount: args.quantity ?? 1,
    unit: args.plan.unitLabel || args.plan.cycleLabel,
    pointsAmount: status === 'WAIVED' ? 0 : args.amount,
    status,
    txId,
    remark:
      status === 'WAIVED'
        ? `${args.toolCode} 第 ${args.periodNo} 期免费`
        : args.plan.cycleDays > 0
          ? `${args.toolCode} 第 ${args.periodNo} 期（${args.plan.cycleLabel}）`
          : `${args.toolCode} 第 ${args.periodNo} 期（${args.plan.cycleLabel}，用量 ${args.quantity ?? 0}${args.plan.unitLabel}）`,
  };
}

export async function settlePeriod(args: SettleArgs): Promise<SettleResult> {
  const { prisma, points, plan, amount } = args;
  const idempotencyKey = launchIdempotencyKey(
    args.toolCode,
    args.subscriptionId,
    args.periodKey,
  );

  if (amount <= 0) {
    try {
      await prisma.toolSubscriptionBill.create({
        data: billData(args, 'WAIVED'),
      });
    } catch (error) {
      if (isUniqueViolation(error)) return 'EXISTS';
      throw error;
    }
    return 'WAIVED';
  }

  await points.ensureAccount(args.userId);
  try {
    await prisma.$transaction(async (tx) => {
      const debit = await points.debitTx(tx, args.userId, 'SPEND', amount, {
        scene: TOOL_LAUNCH_BILL_SCENE,
        refType: 'tool_subscription_bill',
        refId: String(args.billId ?? args.subscriptionId),
        idempotencyKey,
        remark: `${args.toolCode} ${plan.cycleLabel}费 ${amount} 积分（第 ${args.periodNo} 期）`,
      });
      if (args.billId) {
        await tx.toolSubscriptionBill.update({
          where: { id: args.billId },
          data: {
            status: 'CHARGED',
            pointsAmount: amount,
            txId: debit.txId,
          },
        });
      } else {
        await tx.toolSubscriptionBill.create({
          data: billData(args, 'CHARGED', debit.txId),
        });
      }
      await tx.usageEvent.create({
        data: {
          userId: args.userId,
          code: TOOL_LAUNCH_BILL_SCENE,
          quantityAmount: 1,
          occurredAt: args.now,
          billed: 1,
          billTxId: debit.txId,
          remark: `${args.toolCode} ${plan.cycleLabel}费 ${amount}`,
        },
      });
    });
    return 'CHARGED';
  } catch (error) {
    if (
      error instanceof BusinessException &&
      error.errorCode.code === ErrorCode.POINTS_INSUFFICIENT.code
    ) {
      if (args.onInsufficient === 'throw') throw error;
      await prisma.$transaction(async (tx) => {
        if (args.billId) {
          await tx.toolSubscriptionBill.update({
            where: { id: args.billId },
            data: { status: 'ARREARS' },
          });
        } else {
          try {
            await tx.toolSubscriptionBill.create({
              data: billData(args, 'ARREARS'),
            });
          } catch (inner) {
            // 只有「这张账期的欠费单已存在」才是可忽略的竞态；连接抖动、字段超长
            // 之类的错误必须让整笔回滚——欠费事实丢了，日批就再也扫不到这笔钱。
            if (!isUniqueViolation(inner)) throw inner;
          }
        }
        await tx.pointAccount.update({
          where: { userId: args.userId },
          data: { status: 'ARREARS', arrearsSince: args.now },
        });
        await args.markArrears?.(tx);
      });
      return 'ARREARS';
    }
    if (isUniqueViolation(error)) return 'EXISTS';
    throw error;
  }
}

/**
 * 唯一键冲突：Prisma 在 MySQL 与 PostgreSQL 上都归一成 P2002，
 * 因此只认错误对象的 `code`——按整条错误信息里有没有 "23505" 判定，
 * 会把任何恰好带这五个数字的消息（金额、单号）误判成「已经扣过了」。
 */
export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P2002';
}

/**
 * 补扣欠费账单并恢复订阅——**唯一实现**，日批与"用户再点启动"都走这里。
 *
 * 为什么要抽出来：两边都要判断余额、都要改写同一张账期、都要保证
 * "已欠费的那一期不会被再另起一期重复收钱"。两处各写一套，早晚会分叉成
 * 用户在宽限期点一次启动就被扣两笔。
 *
 * - interactive=true：用户在启动页亲手点，余额不足直接抛错（不静默留在欠费）；
 * - interactive=false：日批后台补扣，余额不足只顺延，下一轮再来。
 */
export type ArrearsResumeResult = 'RESUMED' | 'PENDING' | 'NO_FUNDS';

export async function resumeArrearsBill(args: {
  prisma: PrismaService;
  points: PointsService;
  row: {
    id: number;
    userId: string;
    toolCode: string;
    billedPeriods: number;
    cycleDays: number;
    status: string;
    stopReason: string;
    offBy: string;
  };
  bill: {
    id: number;
    periodKey: string;
    periodStart: Date;
    periodEnd: Date;
    pointsAmount: Prisma.Decimal | number;
  };
  plan: LaunchPlan;
  now: Date;
  interactive?: boolean;
}): Promise<ArrearsResumeResult> {
  const { prisma, points, row, bill, plan, now } = args;
  // 平台人工停用（offBy 非空）的订阅**绝不自动补扣**：既没在营业，扣了就是白扣，
  // 而且账单被抹成 CHARGED 后，管理员解除停用时日批再也看不到这笔欠费。
  if (row.offBy) return 'PENDING';
  // 后台日批只认「欠费」驱动的停服：用户自己点了停止（stopReason=USER/NOT_STARTED）
  // 却还留着一张欠费单时，既不能替他扣钱，更不能把他重新开机——那条铁律是
  // 「STOPPED 行永不出账 / 只有启动才扣积分」。欠费单原样留着，等他再点一次
  // 「启动」时由交互路径（interactive=true）结清并同期恢复。
  if (!args.interactive) {
    const arrearsDriven =
      row.status === 'ARREARS' ||
      (row.status === 'STOPPED' && row.stopReason === 'ARREARS');
    if (!arrearsDriven) return 'PENDING';
  }
  const amount = Number(bill.pointsAmount);
  if (amount > 0) {
    const account = await points.ensureAccount(row.userId);
    if (Number(account.balanceAmount) < amount) {
      if (args.interactive) {
        throw new BusinessException(
          ErrorCode.POINTS_INSUFFICIENT,
          `本工具有 ${amount} 积分欠费待补，请先充值：补齐后系统会自动补扣并恢复运行，不需要再付一期。充值入口：/points`,
          {
            amount,
            balance: Number(account.balanceAmount),
            rechargeUrl: '/points',
          },
        );
      }
      return 'NO_FUNDS';
    }
  }
  const result = await settlePeriod({
    prisma,
    points,
    subscriptionId: row.id,
    userId: row.userId,
    toolCode: row.toolCode,
    plan,
    periodKey: bill.periodKey,
    periodStart: bill.periodStart,
    periodEnd: bill.periodEnd,
    amount,
    periodNo: row.billedPeriods + 1,
    now,
    billId: bill.id,
    onInsufficient: args.interactive ? 'throw' : 'mark-arrears',
  });
  if (result === 'ARREARS') return 'PENDING';
  const unpaid = await prisma.toolSubscriptionBill.count({
    where: { subscriptionId: row.id, status: 'ARREARS' },
  });
  if (unpaid > 0 || row.offBy) return 'PENDING';
  // 账期不追溯：仍在本期内的沿用原起止，已过期的从当下重起一期，停服天数不收费
  const cycleDays = plan.cycleDays || row.cycleDays || 30;
  const period =
    bill.periodEnd > now
      ? { periodStart: bill.periodStart, periodEnd: bill.periodEnd }
      : periodOf(now, cycleDays);
  await prisma.toolSubscription.update({
    where: { id: row.id },
    data: {
      status: 'ACTIVE',
      stopReason: '',
      arrearsSince: null,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      billedPeriods: row.billedPeriods + 1,
    },
  });
  return 'RESUMED';
}
