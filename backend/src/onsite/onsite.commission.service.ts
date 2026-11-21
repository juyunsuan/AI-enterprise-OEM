import type {
  OnsiteCommissionRuleRow,
  OnsiteCommissionRuleSave,
  OnsiteIncomeOverview,
  OnsiteOrderCommissionRow,
} from '@enterprise/contracts';
import {
  ONSITE_COMMISSION_ROLE_LABELS,
  ONSITE_COMMISSION_ROLES,
} from '@enterprise/contracts';
import { pageOf, pageParam, text } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import { centsOf, rateOf, yuanOf } from './onsite.money';
import type { OnsiteShopService } from './onsite.shop.service';
import {
  buildOrderCommission,
  reverseCommission,
  type CommissionActor,
  type CommissionItem,
  type CommissionLine,
  type CommissionRule,
} from './onsite.commission.engine';

/**
 * 分账引擎的服务层。
 *
 * 三条硬口径（与 engine 注释一致，改这里必须同步改注释与算例）：
 *   1. 下单即预生成 PENDING，支付才生效 ACTIVE——不能改成"支付后才算佣"；
 *   2. 佣金从技师收入与店主/代理收入里按承担比例扣，平台默认不掏钱；
 *   3. 退款按行按比例冲销，冲销额度不回滚已发放的提现，只影响后续结算额。
 *
 * 基数口径：订单行的服务金额（`unitPrice × quantity − 券抵扣`），不含车费与物料费。
 * 车费是跑腿成本、物料是代购成本，拿去抽佣技师会白干。
 */
export class OnsiteCommissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shops: OnsiteShopService,
  ) {}

  // ---------- 规则矩阵 ----------

  async rules(
    user: CurrentUser,
    shopId: string,
  ): Promise<{ list: OnsiteCommissionRuleRow[] }> {
    const shop = await this.shops.requireShop(user, shopId);
    const rows = await this.ensureRules(shop.shopId);
    return { list: rows.map(toRuleRow) };
  }

  async saveRule(
    user: CurrentUser,
    shopId: string,
    input: OnsiteCommissionRuleSave,
  ): Promise<OnsiteCommissionRuleRow> {
    const shop = await this.shops.requireShop(user, shopId);
    const sum =
      input.staffBorneRate + input.ownerBorneRate + input.platformBorneRate;
    if (sum <= 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '承担方比例合计不能为 0',
      );
    }
    const row = await this.prisma.onsiteCommissionRule.upsert({
      where: { shopId_role: { shopId: shop.shopId, role: input.role } },
      update: {
        totalRate: rateOf(input.totalRate),
        staffBorneRate: rateOf(input.staffBorneRate),
        ownerBorneRate: rateOf(input.ownerBorneRate),
        platformBorneRate: rateOf(input.platformBorneRate),
        enabled: input.enabled,
      },
      create: {
        shopId: shop.shopId,
        role: input.role,
        totalRate: rateOf(input.totalRate),
        staffBorneRate: rateOf(input.staffBorneRate),
        ownerBorneRate: rateOf(input.ownerBorneRate),
        platformBorneRate: rateOf(input.platformBorneRate),
        enabled: input.enabled,
      },
    });
    return toRuleRow(row);
  }

  /**
   * 规则缺省值（方案 §十一.4 的保守模板）：分销 10% / 业务员 15% / 渠道 8% / 合伙人 5% / 代理 6%，
   * 技师与店主各担 50%。首次读取时落库，之后以库为准，避免"页面显示比例"与"实际算佣比例"两套。
   */
  private async ensureRules(shopId: number) {
    const existing = await this.prisma.onsiteCommissionRule.findMany({
      where: { shopId },
      orderBy: { id: 'asc' },
    });
    const missing = ONSITE_COMMISSION_ROLES.filter(
      (role) => !existing.some((row) => row.role === role),
    );
    if (missing.length === 0) return existing;
    const defaults: Record<string, number> = {
      DISTRIBUTOR: 10,
      SALESMAN: 15,
      CHANNEL: 8,
      PARTNER: 5,
      AGENT: 6,
    };
    await this.prisma.onsiteCommissionRule.createMany({
      data: missing.map((role) => ({
        shopId,
        role,
        totalRate: defaults[role] ?? 0,
        staffBorneRate: 50,
        ownerBorneRate: 50,
        platformBorneRate: 0,
        enabled: true,
      })),
    });
    return this.prisma.onsiteCommissionRule.findMany({
      where: { shopId },
      orderBy: { id: 'asc' },
    });
  }

  // ---------- 生成 / 生效 / 冲销 ----------

  /**
   * 下单预生成：按订单行 × 绑定关系算佣金，整体落 PENDING。
   * 调用方传 tx 时与下单同事务；失败不得阻断下单（佣金算不出来要留痕而不是拒单）。
   */
  async generateForOrder(shopId: number, orderId: number): Promise<void> {
    const order = await this.prisma.onsiteOrder.findFirst({
      where: { id: orderId, shopId },
    });
    if (!order) return;
    const orderItems = await this.prisma.onsiteOrderItem.findMany({
      where: { orderId: order.id, shopId },
      orderBy: { id: 'asc' },
    });
    if (orderItems.length === 0) return;
    const exists = await this.prisma.onsiteOrderCommission.findUnique({
      where: { orderId },
    });
    if (exists) return;
    const actors = await this.resolveActors(
      shopId,
      order.customerId,
      order.staffId,
    );
    if (actors.actors.length === 0) return;
    const rules = await this.ensureRules(shopId);
    const engineRules: CommissionRule[] = rules.map((row) => ({
      role: row.role,
      totalRate: Number(row.totalRate),
      staffBorneRate: Number(row.staffBorneRate),
      ownerBorneRate: Number(row.ownerBorneRate),
      platformBorneRate: Number(row.platformBorneRate),
      enabled: row.enabled,
    }));
    const itemRows = await this.prisma.onsiteOrderItem.findMany({
      where: { orderId, shopId },
      orderBy: { id: 'asc' },
    });
    const lines: CommissionLine[] = itemRows.map((item) => {
      const quantity = item.quantity;
      const grossCents = centsOf(item.unitPrice) * quantity;
      const baseCents = Math.max(0, grossCents - centsOf(item.couponDiscount));
      return {
        orderItemId: item.id,
        serviceId: item.serviceId,
        baseCents,
        staffId: order.staffId,
        agentId: actors.agentId,
        actors: actors.actors,
      };
    });
    const result = buildOrderCommission(lines, engineRules);
    if (result.items.length === 0) return;
    await this.prisma.$transaction(async (tx) => {
      const commission = await tx.onsiteOrderCommission.create({
        data: {
          shopId,
          orderId,
          orderNo: order.orderNo,
          customerId: order.customerId,
          status: 'PENDING',
          baseAmount: yuanOf(result.baseCents),
          totalAmount: yuanOf(result.totalCents),
          itemCount: result.items.length,
        },
      });
      await tx.onsiteOrderCommissionItem.createMany({
        data: result.items.map((item) => ({
          commissionId: commission.id,
          shopId,
          orderId,
          orderItemId: item.orderItemId,
          serviceId: item.serviceId,
          sourceRole: item.sourceRole,
          sourceId: item.sourceId,
          totalRate: rateOf(item.totalRate),
          staffBorneRate: rateOf(item.staffBorneRate),
          ownerBorneRate: rateOf(item.ownerBorneRate),
          platformBorneRate: rateOf(item.platformBorneRate),
          baseAmount: yuanOf(item.baseCents),
          totalAmount: yuanOf(item.totalCents),
          staffBorneAmount: yuanOf(item.staffBorneCents),
          ownerBorneAmount: yuanOf(item.ownerBorneCents),
          platformBorneAmount: yuanOf(item.platformBorneCents),
          status: 'PENDING',
        })),
      });
      if (result.shares.length > 0) {
        await tx.onsiteOrderCommissionShare.createMany({
          data: result.shares.map((share) => ({
            commissionId: commission.id,
            shopId,
            orderId,
            bearerRole: share.bearerRole,
            bearerId: share.bearerId,
            amount: yuanOf(share.cents),
            status: 'PENDING',
          })),
        });
      }
    });
  }

  /** 支付生效：总表、明细、承担方一起翻成 ACTIVE（调用方保证幂等）。 */
  async activate(orderId: number): Promise<void> {
    const commission = await this.prisma.onsiteOrderCommission.findUnique({
      where: { orderId },
    });
    if (!commission || commission.status === 'ACTIVE') return;
    if (commission.status === 'REVERSED') return;
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.onsiteOrderCommission.update({
        where: { id: commission.id },
        data: { status: 'ACTIVE', paidAt: now },
      }),
      this.prisma.onsiteOrderCommissionItem.updateMany({
        where: { commissionId: commission.id, status: 'PENDING' },
        data: { status: 'ACTIVE' },
      }),
      this.prisma.onsiteOrderCommissionShare.updateMany({
        where: { commissionId: commission.id, status: 'PENDING' },
        data: { status: 'ACTIVE' },
      }),
    ]);
  }

  /**
   * 退款冲销：按行累计退款金额算目标冲销额，只更新差额。
   * `refunds` 是「该订单行累计已退服务金额」，重复调用不会重复扣减。
   */
  async reverse(
    orderId: number,
    refunds: Array<{ orderItemId: number; refundBaseCents: number }>,
  ): Promise<void> {
    if (refunds.length === 0) return;
    const commission = await this.prisma.onsiteOrderCommission.findUnique({
      where: { orderId },
    });
    if (!commission || commission.status === 'PENDING') return;
    const items = await this.prisma.onsiteOrderCommissionItem.findMany({
      where: { commissionId: commission.id },
    });
    if (items.length === 0) return;
    const engineItems: CommissionItem[] = items.map((item) => ({
      orderItemId: item.orderItemId,
      serviceId: item.serviceId,
      sourceRole: item.sourceRole,
      sourceId: item.sourceId,
      totalRate: Number(item.totalRate),
      staffBorneRate: Number(item.staffBorneRate),
      ownerBorneRate: Number(item.ownerBorneRate),
      platformBorneRate: Number(item.platformBorneRate),
      baseCents: centsOf(item.baseAmount),
      totalCents: centsOf(item.totalAmount),
      staffBorneCents: centsOf(item.staffBorneAmount),
      ownerBorneCents: centsOf(item.ownerBorneAmount),
      platformBorneCents: centsOf(item.platformBorneAmount),
    }));
    const targets = reverseCommission(engineItems, refunds);
    const shares = await this.prisma.onsiteOrderCommissionShare.findMany({
      where: { commissionId: commission.id },
    });
    const staffShare = shares.find((row) => row.bearerRole === 'STAFF');
    const agentShare = shares.find((row) => row.bearerRole === 'AGENT');
    const platformShare = shares.find((row) => row.bearerRole === 'PLATFORM');
    const staffDelta = { value: 0 };
    const agentDelta = { value: 0 };
    const platformDelta = { value: 0 };

    await this.prisma.$transaction(async (tx) => {
      for (const target of targets) {
        const current = items.find(
          (item) =>
            item.orderItemId === target.item.orderItemId &&
            item.sourceRole === target.item.sourceRole &&
            item.sourceId === target.item.sourceId,
        );
        if (!current) continue;
        const already = centsOf(current.reversedAmount);
        const delta = Math.max(0, target.reversedCents - already);
        if (delta === 0) continue;
        const nextReversed = already + delta;
        const fully = nextReversed >= centsOf(current.totalAmount);
        await tx.onsiteOrderCommissionItem.update({
          where: { id: current.id },
          data: {
            reversedAmount: yuanOf(nextReversed),
            status: fully ? 'REVERSED' : 'ACTIVE',
          },
        });
        const total = Math.max(1, centsOf(current.totalAmount));
        staffDelta.value += Math.round(
          (delta * centsOf(current.staffBorneAmount)) / total,
        );
        agentDelta.value += Math.round(
          (delta * centsOf(current.ownerBorneAmount)) / total,
        );
        platformDelta.value +=
          delta -
          Math.round((delta * centsOf(current.staffBorneAmount)) / total) -
          Math.round((delta * centsOf(current.ownerBorneAmount)) / total);
      }
      for (const [share, delta] of [
        [staffShare, staffDelta.value],
        [agentShare, agentDelta.value],
        [platformShare, platformDelta.value],
      ] as const) {
        if (!share || delta <= 0) continue;
        const next = centsOf(share.reversedAmount) + delta;
        const capped = Math.min(next, centsOf(share.amount));
        await tx.onsiteOrderCommissionShare.update({
          where: { id: share.id },
          data: {
            reversedAmount: yuanOf(capped),
            status: capped >= centsOf(share.amount) ? 'REVERSED' : 'ACTIVE',
          },
        });
      }
      const remaining = await tx.onsiteOrderCommissionItem.count({
        where: { commissionId: commission.id, status: 'ACTIVE' },
      });
      if (remaining === 0) {
        await tx.onsiteOrderCommission.update({
          where: { id: commission.id },
          data: { status: 'REVERSED', reversedAt: new Date() },
        });
      }
    });
  }

  // ---------- 台账与看板 ----------

  async ledger(
    user: CurrentUser,
    shopId: string,
    query: Record<string, unknown>,
  ): Promise<{
    list: OnsiteOrderCommissionRow[];
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
      this.prisma.onsiteOrderCommission.count({ where }),
      this.prisma.onsiteOrderCommission.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const customerIds = [...new Set(rows.map((row) => row.customerId))];
    const customers = await this.prisma.onsiteCustomer.findMany({
      where: { shopId: shop.shopId, id: { in: customerIds } },
      select: { id: true, nickname: true, phone: true },
    });
    const nameOf = new Map(
      customers.map((row) => [row.id, row.nickname || row.phone || '顾客']),
    );
    return pageOf(
      rows.map((row) => ({
        id: row.id,
        orderId: row.orderId,
        orderNo: row.orderNo,
        customerId: row.customerId,
        customerName: nameOf.get(row.customerId) ?? '',
        status: row.status,
        baseCents: centsOf(row.baseAmount),
        totalCents: centsOf(row.totalAmount),
        itemCount: row.itemCount,
        paidAt: row.paidAt ? row.paidAt.toISOString() : '',
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    );
  }

  async overview(
    user: CurrentUser,
    shopId: string,
  ): Promise<OnsiteIncomeOverview> {
    const shop = await this.shops.requireShop(user, shopId);
    const sid = shop.shopId;
    const settledStatuses = ['COMPLETED', 'SIGNED', 'REVIEWED'];
    const [orders, items, settlements, withdrawals, customers, recharges] =
      await Promise.all([
        this.prisma.onsiteOrder.findMany({
          where: { shopId: sid, status: { in: settledStatuses } },
          select: { id: true, payAmount: true },
        }),
        this.prisma.onsiteOrderCommissionItem.groupBy({
          by: ['sourceRole'],
          where: { shopId: sid, status: 'ACTIVE' },
          _sum: {
            totalAmount: true,
            staffBorneAmount: true,
            ownerBorneAmount: true,
            platformBorneAmount: true,
          },
          _count: { _all: true },
        }),
        this.prisma.onsiteSettlement.aggregate({
          where: { shopId: sid, status: 'PENDING' },
          _sum: { netAmount: true },
        }),
        this.prisma.onsiteWithdrawal.aggregate({
          where: { shopId: sid, status: { in: ['PENDING', 'APPROVED'] } },
          _sum: { actualAmount: true },
        }),
        this.prisma.onsiteCustomer.aggregate({
          where: { shopId: sid },
          _sum: { balance: true },
        }),
        this.prisma.onsiteRechargeOrder.aggregate({
          where: { shopId: sid, status: 'PAID' },
          _sum: { amount: true },
        }),
      ]);
    const sumOf = (
      field:
        | 'totalAmount'
        | 'staffBorneAmount'
        | 'ownerBorneAmount'
        | 'platformBorneAmount',
    ) => items.reduce((sum, row) => sum + centsOf(row._sum[field]), 0);
    return {
      orderCount: orders.length,
      orderAmountCents: orders.reduce(
        (sum, row) => sum + centsOf(row.payAmount),
        0,
      ),
      commissionCents: sumOf('totalAmount'),
      staffBorneCents: sumOf('staffBorneAmount'),
      ownerBorneCents: sumOf('ownerBorneAmount'),
      platformBorneCents: sumOf('platformBorneAmount'),
      pendingSettleCents: centsOf(settlements._sum.netAmount),
      pendingWithdrawCents: centsOf(withdrawals._sum.actualAmount),
      balanceLiabilityCents: centsOf(customers._sum.balance),
      rechargeCents: centsOf(recharges._sum.amount),
      byRole: items.map((row) => ({
        role: row.sourceRole,
        roleName:
          ONSITE_COMMISSION_ROLE_LABELS[row.sourceRole] ?? row.sourceRole,
        orderCount: row._count._all,
        totalCents: centsOf(row._sum.totalAmount),
      })),
    };
  }

  // ---------- 绑定关系解析 ----------

  /**
   * 一单的佣金角色：分销商（本人申请通过）/ 上级顾客 / 业务员 / 渠道 / 代理 / 技师合伙人。
   * 绑定关系带有效期，过期视为无上级；个人比例 > 0 时覆盖规则表默认。
   */
  async resolveActors(
    shopId: number,
    customerId: number,
    staffId: number,
  ): Promise<{ actors: CommissionActor[]; agentId: number }> {
    const now = new Date();
    const [profile, relation, partner] = await Promise.all([
      this.prisma.onsiteDistributorProfile.findFirst({
        where: { shopId, customerId, status: 'APPROVED' },
      }),
      this.prisma.onsiteRelation.findFirst({
        where: {
          shopId,
          customerId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        orderBy: { id: 'desc' },
      }),
      staffId
        ? this.prisma.onsitePartner.findFirst({
            where: { shopId, staffId, status: 'ACTIVE' },
          })
        : Promise.resolve(null),
    ]);
    const actors: CommissionActor[] = [];
    if (profile) {
      actors.push({
        role: 'DISTRIBUTOR',
        sourceId: customerId,
        rate: Number(profile.rate),
      });
    }
    if (relation) {
      if (relation.pid > 0) {
        const pidProfile = await this.prisma.onsiteDistributorProfile.findFirst(
          {
            where: { shopId, customerId: relation.pid, status: 'APPROVED' },
          },
        );
        if (pidProfile) {
          actors.push({
            role: 'DISTRIBUTOR',
            sourceId: relation.pid,
            rate: Number(pidProfile.rate),
          });
        }
      }
      if (relation.salesmanId > 0) {
        const salesman = await this.prisma.onsiteSalesman.findFirst({
          where: { shopId, id: relation.salesmanId, status: 'ACTIVE' },
        });
        if (salesman) {
          actors.push({
            role: 'SALESMAN',
            sourceId: salesman.id,
            rate: Number(salesman.rate),
          });
        }
      }
      if (relation.channelId > 0) {
        const channel = await this.prisma.onsiteChannel.findFirst({
          where: { shopId, id: relation.channelId, status: 'ACTIVE' },
        });
        if (channel) {
          actors.push({
            role: 'CHANNEL',
            sourceId: channel.id,
            rate: Number(channel.rate),
          });
        }
      }
    }
    let agentId = 0;
    if (relation?.agentId) {
      const agent = await this.prisma.onsiteAgentAccount.findFirst({
        where: { shopId, id: relation.agentId, status: 'ACTIVE' },
      });
      if (agent) {
        agentId = agent.id;
        actors.push({
          role: 'AGENT',
          sourceId: agent.id,
          rate: Number(agent.commissionRate),
        });
      }
    }
    if (partner) {
      actors.push({
        role: 'PARTNER',
        sourceId: partner.staffId,
        rate: Number(partner.rate),
      });
    }
    return { actors, agentId };
  }
}

type RuleRow = {
  role: string;
  totalRate: unknown;
  staffBorneRate: unknown;
  ownerBorneRate: unknown;
  platformBorneRate: unknown;
  enabled: boolean;
};

const toRuleRow = (row: RuleRow): OnsiteCommissionRuleRow => ({
  role: row.role as OnsiteCommissionRuleRow['role'],
  roleName: ONSITE_COMMISSION_ROLE_LABELS[row.role] ?? row.role,
  totalRate: Number(row.totalRate),
  staffBorneRate: Number(row.staffBorneRate),
  ownerBorneRate: Number(row.ownerBorneRate),
  platformBorneRate: Number(row.platformBorneRate),
  enabled: row.enabled,
});
