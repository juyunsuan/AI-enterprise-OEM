import {
  type ErrandWalletSummary,
  type ErrandWithdrawal,
  type ErrandWithdrawalActionBody,
} from '@enterprise/contracts';
import { pageOf, type PageResponse } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma';
import type { ErrandSiteService } from './errand.site.service';
import type { ErrandPayService } from './errand.pay.service';
import {
  amount,
  clip,
  fromCents,
  iso,
  pageArgs,
  riderIncomeOf,
  toCents,
} from './errand.shared';

type WithdrawalRow = {
  id: number;
  riderId: number;
  riderName: string;
  riderNo: string;
  amount: unknown;
  status: string;
  bankInfo: string;
  reason: string;
  handledNote: string;
  handledAt: Date | null;
  method: string;
  transferBatchId: string;
  transferState: string;
  transferredAt: Date | null;
  createdAt: Date;
};

/**
 * 骑手钱包：订单完成入账、提现申请冻结、店主核对打款/驳回。
 *
 * 资金始终在店主线下账户之间流转，平台只记「应付/已付」台账，不托管、不代付。
 * 所有余额变更都在事务里做，流水（errand_wallet_txs）只追加，余额以骑手行为准。
 */
export class ErrandWalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: ErrandSiteService,
    private readonly pay: ErrandPayService,
  ) {}

  /** 订单完成：按「超距 + 超重 + 夜间 + 小费」给骑手记劳务收入。 */
  async creditOnComplete(
    tx: Prisma.TransactionClient,
    order: {
      id: number;
      siteId: number;
      ownerUserId: string;
      orderNo: string;
      riderId: number;
      distanceFee: unknown;
      weightFee: unknown;
      timeFee: unknown;
      tip: unknown;
    },
    incomeSnapshot?: number,
  ): Promise<void> {
    if (!order.riderId) return;
    const income = incomeSnapshot ?? riderIncomeOf(order);
    if (income <= 0) return;
    const rider = await tx.errandRider.findFirst({
      where: { id: order.riderId, siteId: order.siteId },
      select: { id: true, balance: true },
    });
    if (!rider) return;
    const balanceAfter = fromCents(toCents(rider.balance) + toCents(income));
    await tx.errandRider.update({
      where: { id: rider.id },
      data: {
        balance: { increment: income },
        incomeTotal: { increment: income },
        orderCount: { increment: 1 },
        lastActiveAt: new Date(),
      },
    });
    await tx.errandWalletTx.create({
      data: {
        siteId: order.siteId,
        ownerUserId: order.ownerUserId,
        riderId: rider.id,
        type: 'INCOME',
        amount: income,
        balanceAfter,
        orderId: order.id,
        orderNo: order.orderNo,
        remark: `订单 ${order.orderNo} 劳务收入`,
      },
    });
  }

  /**
   * 已完成订单退款：回冲骑手已入账的劳务收入，并追加一条负数流水。
   * 余额允许被扣成负数（骑手已提现时），后续收入先抵扣欠款；不静默抹平。
   */
  async reverseOnRefund(
    tx: Prisma.TransactionClient,
    order: {
      id: number;
      siteId: number;
      ownerUserId: string;
      orderNo: string;
      riderId: number;
      riderIncomeAmount: unknown;
    },
  ): Promise<void> {
    if (!order.riderId) return;
    const cents = Math.abs(toCents(order.riderIncomeAmount));
    if (cents <= 0) return;
    const rider = await tx.errandRider.findFirst({
      where: { id: order.riderId, siteId: order.siteId },
      select: { id: true, balance: true, orderCount: true },
    });
    if (!rider) return;
    const balanceAfter = fromCents(toCents(rider.balance) - cents);
    await tx.errandRider.update({
      where: { id: rider.id },
      data: {
        balance: { decrement: fromCents(cents) },
        incomeTotal: { decrement: fromCents(cents) },
        ...(rider.orderCount > 0 ? { orderCount: { decrement: 1 } } : {}),
      },
    });
    await tx.errandWalletTx.create({
      data: {
        siteId: order.siteId,
        ownerUserId: order.ownerUserId,
        riderId: rider.id,
        type: 'REFUND_REVERSAL',
        amount: -fromCents(cents),
        balanceAfter,
        orderId: order.id,
        orderNo: order.orderNo,
        remark: `订单 ${order.orderNo} 退款，回冲骑手收入`,
      },
    });
  }

  async summary(user: CurrentUser): Promise<ErrandWalletSummary> {
    const ctx = await this.sites.require(user);
    const siteId = ctx.row.id;
    const [riders, incomeAgg, balanceAgg, paidAgg, pendingAgg, recent] =
      await Promise.all([
        this.prisma.errandRider.count({ where: { siteId } }),
        this.prisma.errandRider.aggregate({
          where: { siteId },
          _sum: { incomeTotal: true },
        }),
        this.prisma.errandRider.aggregate({
          where: { siteId },
          _sum: { balance: true },
        }),
        this.prisma.errandWithdrawal.aggregate({
          where: { siteId, status: 'PAID' },
          _sum: { amount: true },
        }),
        this.prisma.errandWithdrawal.aggregate({
          where: { siteId, status: 'PENDING' },
          _sum: { amount: true },
        }),
        this.prisma.errandWalletTx.findMany({
          where: { siteId },
          orderBy: [{ id: 'desc' }],
          take: 20,
        }),
      ]);
    const riderIds = [...new Set(recent.map((row) => row.riderId))];
    const names = riderIds.length
      ? await this.prisma.errandRider.findMany({
          where: { id: { in: riderIds }, siteId },
          select: { id: true, name: true },
        })
      : [];
    const nameOf = new Map(names.map((row) => [row.id, clip(row.name, 40)]));
    return {
      riders,
      totalIncome: amount(incomeAgg._sum.incomeTotal),
      totalBalance: amount(balanceAgg._sum.balance),
      totalWithdrawPaid: amount(paidAgg._sum.amount),
      totalWithdrawPending: amount(pendingAgg._sum.amount),
      recent: recent.map((row) => ({
        id: row.id,
        riderId: row.riderId,
        riderName: nameOf.get(row.riderId) ?? '',
        type: row.type,
        amount: amount(row.amount),
        orderNo: row.orderNo,
        remark: row.remark,
        createdAt: iso(row.createdAt),
      })),
    };
  }

  async withdrawals(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<PageResponse<ErrandWithdrawal>> {
    const ctx = await this.sites.require(user);
    const { page, pageSize, offset } = pageArgs(query);
    const where: Prisma.ErrandWithdrawalWhereInput = { siteId: ctx.row.id };
    const status = clip(query.status, 16);
    if (status) where.status = status;
    const [rows, total] = await Promise.all([
      this.prisma.errandWithdrawal.findMany({
        where,
        orderBy: [{ id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.errandWithdrawal.count({ where }),
    ]);
    return pageOf(
      (rows as unknown as WithdrawalRow[]).map((row) => this.toWithdrawal(row)),
      total,
      page,
      pageSize,
    );
  }

  private toWithdrawal(row: WithdrawalRow): ErrandWithdrawal {
    return {
      id: row.id,
      riderId: row.riderId,
      riderName: row.riderName,
      riderNo: row.riderNo,
      amount: amount(row.amount),
      status:
        row.status === 'PAID'
          ? 'PAID'
          : row.status === 'REJECTED'
            ? 'REJECTED'
            : 'PENDING',
      reason: row.reason,
      bankInfo: row.bankInfo,
      handledNote: row.handledNote,
      handledAt: iso(row.handledAt),
      method: row.method === 'WECHAT' ? 'WECHAT' : 'MANUAL',
      transferBatchId: row.transferBatchId,
      transferState: row.transferState,
      transferredAt: iso(row.transferredAt),
      createdAt: iso(row.createdAt),
    };
  }

  async riderIncomes(siteId: number, riderId: number) {
    const rows = await this.prisma.errandWalletTx.findMany({
      where: { siteId, riderId },
      orderBy: [{ id: 'desc' }],
      take: 50,
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      amount: amount(row.amount),
      balanceAfter: amount(row.balanceAfter),
      orderNo: row.orderNo,
      remark: row.remark,
      createdAt: iso(row.createdAt),
    }));
  }

  async riderWithdrawals(
    siteId: number,
    riderId: number,
  ): Promise<ErrandWithdrawal[]> {
    const rows = await this.prisma.errandWithdrawal.findMany({
      where: { siteId, riderId },
      orderBy: [{ id: 'desc' }],
      take: 50,
    });
    return (rows as unknown as WithdrawalRow[]).map((row) =>
      this.toWithdrawal(row),
    );
  }

  async actionWithdrawal(
    user: CurrentUser,
    body: ErrandWithdrawalActionBody,
  ): Promise<ErrandWithdrawal> {
    const ctx = await this.sites.require(user);
    const row = await this.prisma.errandWithdrawal.findFirst({
      where: { id: body.id, siteId: ctx.row.id },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '提现申请不存在');
    if (row.status !== 'PENDING') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该提现申请已处理过，不能重复操作',
      );
    }
    const rider = await this.prisma.errandRider.findFirst({
      where: { id: row.riderId, siteId: ctx.row.id },
    });
    if (!rider) throw new BusinessException(ErrorCode.NOT_FOUND, '骑手不存在');
    const cents = toCents(row.amount);
    let transferBatchId = '';
    if (body.action === 'PAID' && body.method === 'WECHAT') {
      if (!rider.openid) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '骑手没有可用的微信 openid，无法自动打款；请改用手工打款',
        );
      }
      const result = await this.pay.transferToRider({
        site: {
          ownerUserId: ctx.row.ownerUserId,
          id: ctx.row.id,
          name: ctx.row.name,
        },
        outBatchNo: `EW${row.id}`,
        openid: rider.openid,
        amountCents: cents,
        remark: `提现 ${row.id}`,
      });
      transferBatchId = result.batchId;
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      if (body.action === 'REJECTED') {
        const balanceAfter = fromCents(toCents(rider.balance) + cents);
        await tx.errandRider.update({
          where: { id: rider.id },
          data: {
            frozen: { decrement: fromCents(cents) },
            balance: { increment: fromCents(cents) },
          },
        });
        await tx.errandWalletTx.create({
          data: {
            siteId: ctx.row.id,
            ownerUserId: user.userId,
            riderId: rider.id,
            type: 'WITHDRAW_REJECT',
            amount: fromCents(cents),
            balanceAfter,
            remark: clip(body.note, 200) || '提现被驳回，金额已退回余额',
          },
        });
      } else {
        await tx.errandRider.update({
          where: { id: rider.id },
          data: { frozen: { decrement: fromCents(cents) } },
        });
      }
      return tx.errandWithdrawal.update({
        where: { id: row.id },
        data: {
          status: body.action,
          handledNote: clip(body.note, 300),
          handledBy: user.userId,
          handledAt: new Date(),
          method:
            body.action === 'PAID' && body.method === 'WECHAT'
              ? 'WECHAT'
              : 'MANUAL',
          transferBatchId,
          transferState: transferBatchId ? 'SUBMITTED' : 'NONE',
          transferredAt: transferBatchId ? new Date() : null,
        },
      });
    });
    return this.toWithdrawal(updated);
  }

  /** 骑手发起提现：余额够就冻结并等到店主核对打款。 */
  async requestWithdrawal(
    rider: {
      id: number;
      siteId: number;
      ownerUserId: string;
      riderNo: string;
      name: string;
      balance: unknown;
    },
    amountYuan: number,
    bankInfo: string,
  ): Promise<ErrandWithdrawal> {
    const cents = toCents(amountYuan);
    if (cents <= 0)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '提现金额必须大于 0');
    const balanceCents = toCents(rider.balance);
    if (cents > balanceCents) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `可提现余额只有 ${fromCents(balanceCents)} 元，不能提 ${fromCents(cents)} 元`,
      );
    }
    const pending = await this.prisma.errandWithdrawal.count({
      where: { riderId: rider.id, status: 'PENDING' },
    });
    if (pending > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '上一笔提现还在等待店主打款，请勿重复提交',
      );
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const balanceAfter = fromCents(balanceCents - cents);
      await tx.errandRider.update({
        where: { id: rider.id },
        data: {
          balance: { decrement: fromCents(cents) },
          frozen: { increment: fromCents(cents) },
        },
      });
      const row = await tx.errandWithdrawal.create({
        data: {
          siteId: rider.siteId,
          ownerUserId: rider.ownerUserId,
          riderId: rider.id,
          riderName: rider.name,
          riderNo: rider.riderNo,
          amount: fromCents(cents),
          bankInfo: clip(bankInfo, 200),
          reason: '骑手申请提现',
        },
      });
      await tx.errandWalletTx.create({
        data: {
          siteId: rider.siteId,
          ownerUserId: rider.ownerUserId,
          riderId: rider.id,
          type: 'WITHDRAW',
          amount: fromCents(cents),
          balanceAfter,
          remark: '提现申请，金额已冻结',
        },
      });
      return row;
    });
    return this.toWithdrawal(created);
  }
}
