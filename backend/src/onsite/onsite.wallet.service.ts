import type {
  OnsiteBalanceAdjust,
  OnsiteBalanceCardRow,
  OnsiteBalanceCardSave,
  OnsiteBalanceFlowRow,
  OnsitePointsAdjust,
  OnsiteRechargeRow,
  OnsiteSettlementCreate,
  OnsiteSettlementRow,
  OnsiteWithdrawalHandle,
  OnsiteWithdrawalRow,
} from '@enterprise/contracts';
import { ONSITE_WITHDRAWAL_METHODS } from '@enterprise/contracts';
import type { Prisma } from '../../generated/prisma';
import { pageOf, pageParam, text } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import { centsOf, rateOf, yuanOf } from './onsite.money';
import type { OnsiteShopService } from './onsite.shop.service';

type Tx =
  PrismaService | Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

const randomCode = (prefix: string) =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();

/**
 * 钱包：充值卡、余额（复式流水）、积分、技师结算、提现（四种处理动作 + 税点）。
 *
 * 余额与积分只在本店 C 端顾客域内流转，与站内 AWcoin 物理隔离（方案 §4.2）。
 * 复式硬约束：每笔流水都写 before/after，且 after 必须等于下一条的 before——
 * 任何「只加余额不写流水」的改动都会让对账断链，代码评审专项盯。
 */
export class OnsiteWalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shops: OnsiteShopService,
  ) {}

  // ---------- 充值卡 ----------

  async balanceCards(
    user: CurrentUser,
    shopId: string,
  ): Promise<{ list: OnsiteBalanceCardRow[] }> {
    const shop = await this.shops.requireShop(user, shopId);
    const rows = await this.prisma.onsiteBalanceCard.findMany({
      where: { shopId: shop.shopId },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return { list: rows.map(toCardRow) };
  }

  async saveBalanceCard(
    user: CurrentUser,
    shopId: string,
    input: OnsiteBalanceCardSave,
  ): Promise<OnsiteBalanceCardRow> {
    const shop = await this.shops.requireShop(user, shopId);
    if (input.faceCents + input.giftCents <= 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '充值卡面值必须大于 0',
      );
    }
    if (input.faceCents + input.giftCents < input.priceCents) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '实付金额不能高于到账总额，否则顾客会吃亏',
      );
    }
    if (input.id) {
      const owned = await this.prisma.onsiteBalanceCard.findFirst({
        where: { id: input.id, shopId: shop.shopId },
      });
      if (!owned)
        throw new BusinessException(ErrorCode.NOT_FOUND, '充值卡不存在');
    }
    const data = {
      name: input.name,
      faceAmount: yuanOf(input.faceCents),
      giftAmount: yuanOf(input.giftCents),
      price: yuanOf(input.priceCents),
      validityDays: input.validityDays,
      enabled: input.enabled,
      sortOrder: input.sortOrder,
    };
    const row = input.id
      ? await this.prisma.onsiteBalanceCard.update({
          where: { id: input.id },
          data,
        })
      : await this.prisma.onsiteBalanceCard.create({
          data: { shopId: shop.shopId, ...data },
        });
    return toCardRow(row);
  }

  async removeBalanceCard(
    user: CurrentUser,
    shopId: string,
    cardId: string,
  ): Promise<{ id: number }> {
    const shop = await this.shops.requireShop(user, shopId);
    const owned = await this.prisma.onsiteBalanceCard.findFirst({
      where: { id: Number(cardId) || 0, shopId: shop.shopId },
    });
    if (!owned)
      throw new BusinessException(ErrorCode.NOT_FOUND, '充值卡不存在');
    await this.prisma.onsiteBalanceCard.delete({ where: { id: owned.id } });
    return { id: owned.id };
  }

  // ---------- 充值单 ----------

  async rechargeOrders(
    user: CurrentUser,
    shopId: string,
    query: Record<string, unknown>,
  ): Promise<{
    list: OnsiteRechargeRow[];
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
        ? { orderNo: { contains: text(query.keyword) } }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.onsiteRechargeOrder.count({ where }),
      this.prisma.onsiteRechargeOrder.findMany({
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
        orderNo: row.orderNo,
        customerId: row.customerId,
        customerName: nameOf.get(row.customerId) ?? '',
        cardId: row.cardId,
        amountCents: centsOf(row.amount),
        giftCents: centsOf(row.giftAmount),
        totalCents: centsOf(row.totalAmount),
        status: row.status,
        payType: row.payType,
        paidAt: row.paidAt ? row.paidAt.toISOString() : '',
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    );
  }

  /**
   * 线下到账确认：店主收到转账/现金后点确认，一笔充值同时落余额与复式流水。
   * 已支付的重复点击直接返回，不重复加钱（幂等）。
   */
  async confirmRecharge(
    user: CurrentUser,
    shopId: string,
    rechargeId: string,
    remark: string,
  ): Promise<OnsiteRechargeRow> {
    const shop = await this.shops.requireShop(user, shopId);
    const recharge = await this.prisma.onsiteRechargeOrder.findFirst({
      where: { id: Number(rechargeId) || 0, shopId: shop.shopId },
    });
    if (!recharge)
      throw new BusinessException(ErrorCode.NOT_FOUND, '充值单不存在');
    if (recharge.status === 'PAID') {
      return (await this.findRechargeRow(shop.shopId, recharge.id))!;
    }
    if (recharge.status !== 'UNPAID') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '该充值单已关闭，请让顾客重新下单',
      );
    }
    const totalCents =
      centsOf(recharge.totalAmount) ||
      centsOf(recharge.amount) + centsOf(recharge.giftAmount);
    await this.prisma.$transaction(async (tx) => {
      await tx.onsiteRechargeOrder.update({
        where: { id: recharge.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          payType: 'OFFLINE',
          transactionId: `OFFLINE${Date.now()}`,
        },
      });
      await this.creditBalance(tx, {
        shopId: shop.shopId,
        customerId: recharge.customerId,
        changeCents: totalCents,
        type: 'RECHARGE',
        relatedRechargeId: recharge.id,
        remark: remark || `充值 ${yuanOf(totalCents)} 元（线下确认）`,
      });
    });
    return (await this.findRechargeRow(shop.shopId, recharge.id))!;
  }

  // ---------- 余额 / 积分流水 ----------

  async balanceFlows(
    user: CurrentUser,
    shopId: string,
    query: Record<string, unknown>,
  ): Promise<{
    list: OnsiteBalanceFlowRow[];
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
    const customerId = Number(query.customerId) || 0;
    const where = {
      shopId: shop.shopId,
      ...(customerId ? { customerId } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.onsiteBalanceFlow.count({ where }),
      this.prisma.onsiteBalanceFlow.findMany({
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
        customerId: row.customerId,
        customerName: nameOf.get(row.customerId) ?? '',
        type: row.type,
        changeCents: centsOf(row.changeAmount),
        beforeCents: centsOf(row.beforeBalance),
        afterCents: centsOf(row.afterBalance),
        relatedOrderId: row.relatedOrderId,
        remark: row.remark,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    );
  }

  async adjustBalance(
    user: CurrentUser,
    shopId: string,
    input: OnsiteBalanceAdjust,
  ) {
    const shop = await this.shops.requireShop(user, shopId);
    const result = await this.creditBalance(this.prisma, {
      shopId: shop.shopId,
      customerId: input.customerId,
      changeCents: input.amountCents,
      type: 'ADJUST',
      remark: input.remark,
    });
    return { customerId: input.customerId, balanceCents: result.afterCents };
  }

  async adjustPoints(
    user: CurrentUser,
    shopId: string,
    input: OnsitePointsAdjust,
  ) {
    const shop = await this.shops.requireShop(user, shopId);
    const result = await this.creditPoints(this.prisma, {
      shopId: shop.shopId,
      customerId: input.customerId,
      changePoints: input.points,
      type: 'ADJUST',
      remark: input.remark,
    });
    return { customerId: input.customerId, points: result.afterPoints };
  }

  // ---------- 结算 ----------

  async settlements(
    user: CurrentUser,
    shopId: string,
    query: Record<string, unknown>,
  ): Promise<{
    list: OnsiteSettlementRow[];
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
      this.prisma.onsiteSettlement.count({ where }),
      this.prisma.onsiteSettlement.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const staff = await this.prisma.onsiteStaff.findMany({
      where: {
        shopId: shop.shopId,
        id: { in: [...new Set(rows.map((row) => row.staffId))] },
      },
      select: { id: true, name: true },
    });
    const staffName = new Map(staff.map((row) => [row.id, row.name]));
    return pageOf(
      rows.map((row) => ({
        id: row.id,
        staffId: row.staffId,
        staffName: staffName.get(row.staffId) ?? '',
        periodStart: row.periodStart.toISOString(),
        periodEnd: row.periodEnd.toISOString(),
        orderCount: row.orderCount,
        grossCents: centsOf(row.grossAmount),
        commissionCents: centsOf(row.commissionAmount),
        netCents: centsOf(row.netAmount),
        status: row.status,
        paidAt: row.paidAt ? row.paidAt.toISOString() : '',
      })),
      total,
      page,
      pageSize,
    );
  }

  /**
   * 生成结算单：统计周期内该技师已完成订单的服务费（含车费）为毛收入，
   * 减去该技师承担的佣金为净额。同一周期重复生成直接拒绝（唯一键兜底）。
   */
  async createSettlement(
    user: CurrentUser,
    shopId: string,
    input: OnsiteSettlementCreate,
  ): Promise<OnsiteSettlementRow> {
    const shop = await this.shops.requireShop(user, shopId);
    const staff = await this.prisma.onsiteStaff.findFirst({
      where: { id: input.staffId, shopId: shop.shopId },
    });
    if (!staff)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '技师不存在');
    const start = new Date(input.periodStart);
    const end = new Date(input.periodEnd);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '结算周期不合法（结束必须晚于开始）',
      );
    }
    const exists = await this.prisma.onsiteSettlement.findFirst({
      where: {
        shopId: shop.shopId,
        staffId: staff.id,
        periodStart: start,
        periodEnd: end,
      },
    });
    if (exists) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '该技师此周期已生成过结算单，请直接查看',
      );
    }
    const orders = await this.prisma.onsiteOrder.findMany({
      where: {
        shopId: shop.shopId,
        staffId: staff.id,
        status: { in: ['COMPLETED', 'SIGNED', 'REVIEWED'] },
        completedAt: { gte: start, lte: end },
      },
      select: { id: true, trueServiceFee: true, trueTravelFee: true },
    });
    const grossCents = orders.reduce(
      (sum, row) =>
        sum + centsOf(row.trueServiceFee) + centsOf(row.trueTravelFee),
      0,
    );
    const shares = await this.prisma.onsiteOrderCommissionShare.findMany({
      where: {
        shopId: shop.shopId,
        bearerRole: 'STAFF',
        bearerId: staff.id,
        status: 'ACTIVE',
        orderId: { in: orders.map((row) => row.id) },
      },
      select: { amount: true, reversedAmount: true },
    });
    const commissionCents = shares.reduce(
      (sum, row) =>
        sum + Math.max(0, centsOf(row.amount) - centsOf(row.reversedAmount)),
      0,
    );
    const row = await this.prisma.onsiteSettlement.create({
      data: {
        shopId: shop.shopId,
        staffId: staff.id,
        periodStart: start,
        periodEnd: end,
        orderCount: orders.length,
        grossAmount: yuanOf(grossCents),
        commissionAmount: yuanOf(commissionCents),
        netAmount: yuanOf(Math.max(0, grossCents - commissionCents)),
      },
    });
    return {
      id: row.id,
      staffId: row.staffId,
      staffName: staff.name,
      periodStart: row.periodStart.toISOString(),
      periodEnd: row.periodEnd.toISOString(),
      orderCount: row.orderCount,
      grossCents: centsOf(row.grossAmount),
      commissionCents: centsOf(row.commissionAmount),
      netCents: centsOf(row.netAmount),
      status: row.status,
      paidAt: '',
    };
  }

  async paySettlement(
    user: CurrentUser,
    shopId: string,
    settlementId: string,
    remark: string,
  ): Promise<OnsiteSettlementRow> {
    const shop = await this.shops.requireShop(user, shopId);
    const row = await this.prisma.onsiteSettlement.findFirst({
      where: { id: Number(settlementId) || 0, shopId: shop.shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '结算单不存在');
    if (row.status === 'PAID')
      throw new BusinessException(ErrorCode.BAD_REQUEST, '该结算单已发放');
    const staff = await this.prisma.onsiteStaff.findFirst({
      where: { id: row.staffId, shopId: shop.shopId },
    });
    const updated = await this.prisma.onsiteSettlement.update({
      where: { id: row.id },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        remark: remark || row.remark,
      },
    });
    return {
      id: updated.id,
      staffId: updated.staffId,
      staffName: staff?.name ?? '',
      periodStart: updated.periodStart.toISOString(),
      periodEnd: updated.periodEnd.toISOString(),
      orderCount: updated.orderCount,
      grossCents: centsOf(updated.grossAmount),
      commissionCents: centsOf(updated.commissionAmount),
      netCents: centsOf(updated.netAmount),
      status: updated.status,
      paidAt: updated.paidAt ? updated.paidAt.toISOString() : '',
    };
  }

  // ---------- 提现 ----------

  async withdrawals(
    user: CurrentUser,
    shopId: string,
    query: Record<string, unknown>,
  ): Promise<{
    list: OnsiteWithdrawalRow[];
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
      this.prisma.onsiteWithdrawal.count({ where }),
      this.prisma.onsiteWithdrawal.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const names = await this.ownerNames(shop.shopId, rows);
    return pageOf(
      rows.map((row) => toWithdrawalRow(row, names)),
      total,
      page,
      pageSize,
    );
  }

  /**
   * 四种处理动作（状态机）：
   *   APPROVE：待处理 → 已通过待打款
   *   PAID   ：待处理/已通过 → 已打款（记流水号，可留空表示线下转账）
   *   REJECT ：待处理/已通过 → 已驳回（必须写原因，申请人可见）
   *   CANCEL ：仅待处理可撤销（顾客/技师自己撤单走同一动作）
   */
  async handleWithdrawal(
    user: CurrentUser,
    shopId: string,
    withdrawalId: string,
    input: OnsiteWithdrawalHandle,
  ): Promise<OnsiteWithdrawalRow> {
    const shop = await this.shops.requireShop(user, shopId);
    const row = await this.prisma.onsiteWithdrawal.findFirst({
      where: { id: Number(withdrawalId) || 0, shopId: shop.shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '提现单不存在');
    const next = (() => {
      switch (input.action) {
        case 'APPROVE':
          if (row.status !== 'PENDING') {
            throw new BusinessException(
              ErrorCode.BAD_REQUEST,
              '只有待处理的提现单可以通过',
            );
          }
          return 'APPROVED';
        case 'PAID':
          if (row.status !== 'APPROVED' && row.status !== 'PENDING') {
            throw new BusinessException(
              ErrorCode.BAD_REQUEST,
              '当前状态不能标记为已打款',
            );
          }
          return 'PAID';
        case 'REJECT':
          if (row.status !== 'PENDING' && row.status !== 'APPROVED') {
            throw new BusinessException(
              ErrorCode.BAD_REQUEST,
              '当前状态不能驳回',
            );
          }
          if (!input.reason) {
            throw new BusinessException(
              ErrorCode.BAD_REQUEST,
              '驳回必须写明原因（申请人可见）',
            );
          }
          return 'REJECTED';
        case 'CANCEL':
          if (row.status !== 'PENDING') {
            throw new BusinessException(
              ErrorCode.BAD_REQUEST,
              '只有待处理的提现单可以撤销',
            );
          }
          return 'CANCELLED';
        default:
          throw new BusinessException(
            ErrorCode.BAD_REQUEST,
            '未知的提现处理动作',
          );
      }
    })();
    const updated = await this.prisma.onsiteWithdrawal.update({
      where: { id: row.id },
      data: {
        status: next,
        rejectReason: next === 'REJECTED' ? input.reason : row.rejectReason,
        transactionId: input.transactionId || row.transactionId,
        handledBy: user.userId,
        handledAt: new Date(),
      },
    });
    const names = await this.ownerNames(shop.shopId, [updated]);
    return toWithdrawalRow(updated, names);
  }

  // ---------- C 端 ----------

  async customerCards(
    shopId: number,
  ): Promise<{ list: OnsiteBalanceCardRow[] }> {
    const rows = await this.prisma.onsiteBalanceCard.findMany({
      where: { shopId, enabled: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return { list: rows.map(toCardRow) };
  }

  /** C 端充值下单：先落 UNPAID，店主确认到账后由 confirmRecharge 入账。 */
  async createRecharge(shopId: number, customerId: number, cardId: number) {
    const card = await this.prisma.onsiteBalanceCard.findFirst({
      where: { id: cardId, shopId, enabled: true },
    });
    if (!card)
      throw new BusinessException(ErrorCode.NOT_FOUND, '充值卡不存在或已下架');
    const customer = await this.prisma.onsiteCustomer.findFirst({
      where: { id: customerId, shopId },
    });
    if (!customer)
      throw new BusinessException(ErrorCode.UNAUTHORIZED, '请先登录小程序');
    const amountCents = centsOf(card.price) || centsOf(card.faceAmount);
    const giftCents = centsOf(card.giftAmount);
    const order = await this.prisma.onsiteRechargeOrder.create({
      data: {
        shopId,
        customerId,
        orderNo: randomCode('OR'),
        cardId: card.id,
        amount: yuanOf(amountCents),
        giftAmount: yuanOf(giftCents),
        totalAmount: yuanOf(amountCents + giftCents),
        status: 'UNPAID',
        payType: 'OFFLINE',
        expireAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    return {
      id: order.id,
      orderNo: order.orderNo,
      amountCents,
      giftCents,
      totalCents: amountCents + giftCents,
      hint: '下单后请联系店铺付款，店铺确认到账后金额进入余额',
    };
  }

  async customerBalance(shopId: number, customerId: number) {
    const customer = await this.prisma.onsiteCustomer.findFirst({
      where: { id: customerId, shopId },
    });
    if (!customer)
      throw new BusinessException(ErrorCode.UNAUTHORIZED, '请先登录小程序');
    return {
      balanceCents: centsOf(customer.balance),
      points: customer.points,
    };
  }

  async customerBalanceFlows(
    shopId: number,
    customerId: number,
    page: number,
    pageSize: number,
  ) {
    const { offset } = pageParam(page, pageSize, 20);
    const where = { shopId, customerId };
    const [total, rows] = await Promise.all([
      this.prisma.onsiteBalanceFlow.count({ where }),
      this.prisma.onsiteBalanceFlow.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    return pageOf(
      rows.map((row) => ({
        id: row.id,
        type: row.type,
        changeCents: centsOf(row.changeAmount),
        beforeCents: centsOf(row.beforeBalance),
        afterCents: centsOf(row.afterBalance),
        remark: row.remark,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    );
  }

  /**
   * 提现申请（C 端技师/分销商）：按店铺税率预扣，实际到账＝申请额 − 税额。
   * 时间门槛（完成后 canTxHours）在申请侧只做提示不做拦截——钱已进店主账户，
   * 拦不拦是店主的规则；税点与门槛都在店铺 tradeJson 里配。
   */
  async requestWithdrawal(input: {
    shopId: number;
    ownerType: 'STAFF' | 'AGENT' | 'DISTRIBUTOR' | 'PARTNER';
    ownerId: number;
    amountCents: number;
    method: string;
    payInfo: Record<string, unknown>;
  }) {
    const shop = await this.prisma.onsiteShop.findUnique({
      where: { id: input.shopId },
    });
    if (!shop) throw new BusinessException(ErrorCode.NOT_FOUND, '店铺不存在');
    const trade = (shop.tradeJson ?? {}) as Record<string, unknown>;
    const taxRate = Number(trade.taxRate ?? 0) || 0;
    const minCents = Number(trade.minWithdrawCents ?? 0) || 0;
    const amountCents = Math.max(0, Math.trunc(input.amountCents));
    if (amountCents <= 0)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '提现金额必须大于 0');
    if (amountCents < minCents) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `单笔提现不能低于 ${(minCents / 100).toFixed(2)} 元`,
      );
    }
    const method = (ONSITE_WITHDRAWAL_METHODS as readonly string[]).includes(
      input.method,
    )
      ? input.method
      : 'OFFLINE';
    const taxCents = Math.round((amountCents * rateOf(taxRate)) / 100);
    const row = await this.prisma.onsiteWithdrawal.create({
      data: {
        shopId: input.shopId,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        amount: yuanOf(amountCents),
        taxRate: rateOf(taxRate),
        taxAmount: yuanOf(taxCents),
        actualAmount: yuanOf(amountCents - taxCents),
        method,
        payInfo: input.payInfo as Prisma.InputJsonValue,
        status: 'PENDING',
      },
    });
    return {
      id: row.id,
      amountCents,
      taxCents,
      actualCents: amountCents - taxCents,
    };
  }

  // ---------- 复式流水内核 ----------

  /**
   * 加/减余额并写复式流水。传 tx 时参与调用方事务（下单抵扣、充值入账都走它）。
   * 余额不允许为负；`changeCents` 为负时余额不足直接抛错，不做"先欠着"。
   */
  async creditBalance(
    client: Tx,
    input: {
      shopId: number;
      customerId: number;
      changeCents: number;
      type: string;
      relatedOrderId?: number;
      relatedRechargeId?: number;
      remark?: string;
    },
  ): Promise<{ beforeCents: number; afterCents: number }> {
    const db = client as PrismaService;
    const customer = await db.onsiteCustomer.findFirst({
      where: { id: input.customerId, shopId: input.shopId },
    });
    if (!customer)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '顾客不存在');
    const beforeCents = centsOf(customer.balance);
    const afterCents = beforeCents + Math.trunc(input.changeCents);
    if (afterCents < 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `余额不足（当前 ${(beforeCents / 100).toFixed(2)} 元）`,
      );
    }
    await db.onsiteCustomer.update({
      where: { id: customer.id },
      data: { balance: yuanOf(afterCents) },
    });
    await db.onsiteBalanceFlow.create({
      data: {
        shopId: input.shopId,
        customerId: customer.id,
        type: input.type,
        changeAmount: yuanOf(Math.trunc(input.changeCents)),
        beforeBalance: yuanOf(beforeCents),
        afterBalance: yuanOf(afterCents),
        relatedOrderId: input.relatedOrderId ?? 0,
        relatedRechargeId: input.relatedRechargeId ?? 0,
        remark: (input.remark ?? '').slice(0, 200),
      },
    });
    return { beforeCents, afterCents };
  }

  async creditPoints(
    client: Tx,
    input: {
      shopId: number;
      customerId: number;
      changePoints: number;
      type: string;
      relatedOrderId?: number;
      remark?: string;
    },
  ): Promise<{ beforePoints: number; afterPoints: number }> {
    const db = client as PrismaService;
    const customer = await db.onsiteCustomer.findFirst({
      where: { id: input.customerId, shopId: input.shopId },
    });
    if (!customer)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '顾客不存在');
    const beforePoints = customer.points;
    const afterPoints = beforePoints + Math.trunc(input.changePoints);
    if (afterPoints < 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `积分不足（当前 ${beforePoints}）`,
      );
    }
    await db.onsiteCustomer.update({
      where: { id: customer.id },
      data: { points: afterPoints },
    });
    await db.onsitePointFlow.create({
      data: {
        shopId: input.shopId,
        customerId: customer.id,
        type: input.type,
        changePoints: Math.trunc(input.changePoints),
        beforePoints,
        afterPoints,
        relatedOrderId: input.relatedOrderId ?? 0,
        remark: (input.remark ?? '').slice(0, 200),
      },
    });
    return { beforePoints, afterPoints };
  }

  // ---------- 内部 ----------

  private async findRechargeRow(
    shopId: number,
    id: number,
  ): Promise<OnsiteRechargeRow | null> {
    const row = await this.prisma.onsiteRechargeOrder.findFirst({
      where: { id, shopId },
    });
    if (!row) return null;
    const customer = await this.prisma.onsiteCustomer.findFirst({
      where: { id: row.customerId, shopId },
    });
    return {
      id: row.id,
      orderNo: row.orderNo,
      customerId: row.customerId,
      customerName: customer?.nickname || customer?.phone || '',
      cardId: row.cardId,
      amountCents: centsOf(row.amount),
      giftCents: centsOf(row.giftAmount),
      totalCents: centsOf(row.totalAmount),
      status: row.status,
      payType: row.payType,
      paidAt: row.paidAt ? row.paidAt.toISOString() : '',
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async ownerNames(
    shopId: number,
    rows: Array<{ ownerType: string; ownerId: number }>,
  ): Promise<Map<string, string>> {
    const key = (type: string, id: number) => `${type}:${id}`;
    const out = new Map<string, string>();
    const pick = (type: string, ids: number[]) =>
      [...new Set(ids)].filter(Boolean);
    const staffIds = pick(
      'STAFF',
      rows.filter((r) => r.ownerType === 'STAFF').map((r) => r.ownerId),
    );
    const agentIds = pick(
      'AGENT',
      rows.filter((r) => r.ownerType === 'AGENT').map((r) => r.ownerId),
    );
    const customerIds = pick(
      'DISTRIBUTOR',
      rows.filter((r) => r.ownerType === 'DISTRIBUTOR').map((r) => r.ownerId),
    );
    const [staff, agents, customers] = await Promise.all([
      staffIds.length
        ? this.prisma.onsiteStaff.findMany({
            where: { shopId, id: { in: staffIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      agentIds.length
        ? this.prisma.onsiteAgentAccount.findMany({
            where: { shopId, id: { in: agentIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      customerIds.length
        ? this.prisma.onsiteCustomer.findMany({
            where: { shopId, id: { in: customerIds } },
            select: { id: true, nickname: true, phone: true },
          })
        : Promise.resolve([]),
    ]);
    for (const row of staff) out.set(key('STAFF', row.id), row.name);
    for (const row of agents) out.set(key('AGENT', row.id), row.name);
    for (const row of customers)
      out.set(key('DISTRIBUTOR', row.id), row.nickname || row.phone || '顾客');
    return out;
  }
}

type CardRow = {
  id: number;
  name: string;
  faceAmount: unknown;
  giftAmount: unknown;
  price: unknown;
  validityDays: number;
  enabled: boolean;
  sortOrder: number;
};

const toCardRow = (row: CardRow): OnsiteBalanceCardRow => ({
  id: row.id,
  name: row.name,
  faceCents: centsOf(row.faceAmount),
  giftCents: centsOf(row.giftAmount),
  priceCents: centsOf(row.price),
  validityDays: row.validityDays,
  enabled: row.enabled,
  sortOrder: row.sortOrder,
});

type WithdrawalRow = {
  id: number;
  ownerType: string;
  ownerId: number;
  amount: unknown;
  taxRate: unknown;
  taxAmount: unknown;
  actualAmount: unknown;
  method: string;
  status: string;
  rejectReason: string;
  transactionId: string;
  handledAt: Date | null;
  createdAt: Date;
};

const toWithdrawalRow = (
  row: WithdrawalRow,
  names: Map<string, string>,
): OnsiteWithdrawalRow => ({
  id: row.id,
  ownerType: row.ownerType,
  ownerId: row.ownerId,
  ownerName: names.get(`${row.ownerType}:${row.ownerId}`) ?? '',
  amountCents: centsOf(row.amount),
  taxRate: Number(row.taxRate),
  taxCents: centsOf(row.taxAmount),
  actualCents: centsOf(row.actualAmount),
  method: (ONSITE_WITHDRAWAL_METHODS as readonly string[]).includes(row.method)
    ? (row.method as OnsiteWithdrawalRow['method'])
    : 'OFFLINE',
  status: row.status,
  rejectReason: row.rejectReason,
  transactionId: row.transactionId,
  handledAt: row.handledAt ? row.handledAt.toISOString() : '',
  createdAt: row.createdAt.toISOString(),
});
