import * as bcrypt from 'bcryptjs';
import {
  ERRAND_AGENT_STATUSES,
  type ErrandAgent,
  type ErrandAgentMe,
  type ErrandAgentSaveBody,
  type ErrandAgentStatus,
  type ErrandAgentWithdrawal,
  type ErrandAgentWithdrawalActionBody,
  type ErrandOrder,
} from '@enterprise/contracts';
import { pageOf, type PageResponse } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma';
import type { ErrandSiteService } from './errand.site.service';
import { issueAgentToken, parseAgentToken } from './errand.agent.token';
import {
  ERRAND_SCENE,
  toText,
  amount,
  clip,
  fromCents,
  iso,
  jsonInput,
  jsonList,
  pageArgs,
  toCents,
} from './errand.shared';

type AgentRow = {
  id: number;
  siteId: number;
  name: string;
  mobile: string;
  passwordHash: string;
  status: string;
  commissionRate: unknown;
  cityIds: unknown;
  balance: unknown;
  frozen: unknown;
  totalIncome: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type AgentWithdrawalRow = {
  id: number;
  agentId: number;
  agentName: string;
  amount: unknown;
  status: string;
  bankInfo: string;
  handledNote: string;
  handledAt: Date | null;
  createdAt: Date;
};

export type AgentOrderLike = {
  id: number;
  siteId: number;
  cityId: number;
  ownerUserId: string;
  orderNo: string;
  baseFee: unknown;
  distanceFee: unknown;
  weightFee: unknown;
  timeFee: unknown;
  goodsFee: unknown;
};

function agentStatus(value: unknown): ErrandAgentStatus {
  return String(value) === 'DISABLED' ? 'DISABLED' : 'ACTIVE';
}

function cityIdsOf(value: unknown): number[] {
  return jsonList<unknown>(value)
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
}

/** 代理佣金 = 服务费（起步+超距+超重+夜间+帮买服务费）× 分成比例。 */
function commissionOf(order: AgentOrderLike, rate: number): number {
  const cents =
    toCents(order.baseFee) +
    toCents(order.distanceFee) +
    toCents(order.weightFee) +
    toCents(order.timeFee) +
    toCents(order.goodsFee);
  return fromCents(Math.round(cents * Math.min(1, Math.max(0, rate))));
}

/**
 * 城市代理：下游独立账号（手机号+密码），由平台账号创建/停用；按城市分佣。
 * 与站内账号体系无任何关系，令牌 issuer 也独立。
 */
export class ErrandAgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: ErrandSiteService,
  ) {}

  private toAgent(row: AgentRow): ErrandAgent {
    return {
      id: row.id,
      name: row.name,
      mobile: row.mobile,
      status: agentStatus(row.status),
      commissionRate: Number(row.commissionRate) || 0,
      cityIds: cityIdsOf(row.cityIds),
      balance: amount(row.balance),
      frozen: amount(row.frozen),
      totalIncome: amount(row.totalIncome),
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  private toWithdrawal(row: AgentWithdrawalRow): ErrandAgentWithdrawal {
    return {
      id: row.id,
      agentId: row.agentId,
      agentName: row.agentName,
      amount: amount(row.amount),
      status:
        row.status === 'PAID'
          ? 'PAID'
          : row.status === 'REJECTED'
            ? 'REJECTED'
            : 'PENDING',
      bankInfo: row.bankInfo,
      handledNote: row.handledNote,
      handledAt: iso(row.handledAt),
      createdAt: iso(row.createdAt),
    };
  }

  async list(user: CurrentUser): Promise<ErrandAgent[]> {
    const ctx = await this.sites.require(user);
    const rows = await this.prisma.errandAgent.findMany({
      where: { siteId: ctx.row.id },
      orderBy: [{ id: 'desc' }],
      take: 200,
    });
    return (rows as unknown as AgentRow[]).map((row) => this.toAgent(row));
  }

  async save(
    user: CurrentUser,
    body: ErrandAgentSaveBody,
  ): Promise<ErrandAgent> {
    const ctx = await this.sites.require(user);
    const mobile = clip(body.mobile, 20).trim();
    if (!mobile)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写代理手机号');
    const current =
      body.id > 0
        ? await this.prisma.errandAgent.findFirst({
            where: { id: body.id, siteId: ctx.row.id },
          })
        : null;
    if (body.id > 0 && !current) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '代理不存在');
    }
    const dup = await this.prisma.errandAgent.findFirst({
      where: {
        siteId: ctx.row.id,
        mobile,
        ...(current ? { NOT: { id: current.id } } : {}),
      },
      select: { id: true },
    });
    if (dup)
      throw new BusinessException(ErrorCode.CONFLICT, '该手机号已经登记为代理');
    const cityIds = [...new Set(body.cityIds.filter((id) => id > 0))];
    if (cityIds.length) {
      const count = await this.prisma.errandCity.count({
        where: { siteId: ctx.row.id, id: { in: cityIds } },
      });
      if (count !== cityIds.length) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '代理负责城市里有不存在的城市',
        );
      }
    }
    const password = clip(body.password, 64).trim();
    if (!current && password.length < 6) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '新建代理需要设置至少 6 位登录密码',
      );
    }
    const data = {
      siteId: ctx.row.id,
      name: clip(body.name, 60).trim(),
      mobile,
      status: body.status === 'DISABLED' ? 'DISABLED' : 'ACTIVE',
      commissionRate: Math.min(
        1,
        Math.max(0, Number(body.commissionRate) || 0),
      ),
      cityIds: jsonInput(cityIds),
      ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
    };
    const row = current
      ? await this.prisma.errandAgent.update({
          where: { id: current.id },
          data,
        })
      : await this.prisma.errandAgent.create({ data });
    return this.toAgent(row);
  }

  async setStatus(
    user: CurrentUser,
    id: number,
    status: ErrandAgentStatus,
  ): Promise<ErrandAgent> {
    const ctx = await this.sites.require(user);
    const row = await this.prisma.errandAgent.findFirst({
      where: { id, siteId: ctx.row.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '代理不存在');
    const updated = await this.prisma.errandAgent.update({
      where: { id: row.id },
      data: { status: status === 'DISABLED' ? 'DISABLED' : 'ACTIVE' },
    });
    return this.toAgent(updated);
  }

  async remove(user: CurrentUser, id: number) {
    const ctx = await this.sites.require(user);
    const row = await this.prisma.errandAgent.findFirst({
      where: { id, siteId: ctx.row.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '代理不存在');
    const orders = await this.prisma.errandOrder.count({
      where: { siteId: ctx.row.id, agentId: row.id },
    });
    const balance = Number(row.balance);
    if (orders || balance > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `该代理已有 ${orders} 笔分佣订单、余额 ${balance} 元，不能删除；请改为「停用」`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.errandAgentTx.deleteMany({
        where: { siteId: ctx.row.id, agentId: row.id },
      });
      await tx.errandAgentWithdrawal.deleteMany({
        where: { siteId: ctx.row.id, agentId: row.id },
      });
      await tx.errandAgent.delete({ where: { id: row.id } });
    });
    return { ok: true, message: '代理已删除' };
  }

  async withdrawals(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<PageResponse<ErrandAgentWithdrawal>> {
    const ctx = await this.sites.require(user);
    const { page, pageSize, offset } = pageArgs(query);
    const where: Prisma.ErrandAgentWithdrawalWhereInput = {
      siteId: ctx.row.id,
    };
    const status = clip(query.status, 16);
    if (status) where.status = status;
    const [rows, total] = await Promise.all([
      this.prisma.errandAgentWithdrawal.findMany({
        where,
        orderBy: [{ id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.errandAgentWithdrawal.count({ where }),
    ]);
    return pageOf(
      (rows as unknown as AgentWithdrawalRow[]).map((row) =>
        this.toWithdrawal(row),
      ),
      total,
      page,
      pageSize,
    );
  }

  async actionWithdrawal(
    user: CurrentUser,
    body: ErrandAgentWithdrawalActionBody,
  ): Promise<ErrandAgentWithdrawal> {
    const ctx = await this.sites.require(user);
    const row = await this.prisma.errandAgentWithdrawal.findFirst({
      where: { id: body.id, siteId: ctx.row.id },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '提现申请不存在');
    if (row.status !== 'PENDING') {
      throw new BusinessException(ErrorCode.CONFLICT, '该提现申请已处理过');
    }
    const agent = await this.prisma.errandAgent.findFirst({
      where: { id: row.agentId, siteId: ctx.row.id },
    });
    if (!agent) throw new BusinessException(ErrorCode.NOT_FOUND, '代理不存在');
    const cents = toCents(row.amount);
    const updated = await this.prisma.$transaction(async (tx) => {
      if (body.action === 'REJECTED') {
        const balanceAfter = fromCents(toCents(agent.balance) + cents);
        await tx.errandAgent.update({
          where: { id: agent.id },
          data: {
            frozen: { decrement: fromCents(cents) },
            balance: { increment: fromCents(cents) },
          },
        });
        await tx.errandAgentTx.create({
          data: {
            siteId: ctx.row.id,
            agentId: agent.id,
            type: 'WITHDRAW_REJECT',
            amount: fromCents(cents),
            balanceAfter,
            remark: clip(body.note, 200) || '提现被驳回，金额已退回余额',
          },
        });
      } else {
        await tx.errandAgent.update({
          where: { id: agent.id },
          data: { frozen: { decrement: fromCents(cents) } },
        });
      }
      return tx.errandAgentWithdrawal.update({
        where: { id: row.id },
        data: {
          status: body.action,
          handledNote: clip(body.note, 300),
          handledAt: new Date(),
        },
      });
    });
    return this.toWithdrawal(updated);
  }

  // ---------------------------------------------------------------- 代理端

  async login(body: { site: string; mobile: string; password: string }) {
    const found = await this.sites.byCode(body.site);
    if (!found) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '站点不存在或已关闭');
    }
    await this.sites.ensureToolOpen(found.row.ownerUserId);
    const mobile = clip(body.mobile, 20).trim();
    const agent = (await this.prisma.errandAgent.findFirst({
      where: { siteId: found.row.id, mobile },
    })) as unknown as AgentRow | null;
    if (!agent || !agent.passwordHash) {
      throw new BusinessException(ErrorCode.UNAUTHORIZED, '手机号或密码不正确');
    }
    const ok = await bcrypt.compare(
      clip(body.password, 64),
      agent.passwordHash,
    );
    if (!ok)
      throw new BusinessException(ErrorCode.UNAUTHORIZED, '手机号或密码不正确');
    if (agent.status !== 'ACTIVE') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '代理账号已停用，请联系平台管理员',
      );
    }
    return {
      token: issueAgentToken({
        scene: ERRAND_SCENE,
        siteId: found.row.id,
        agentId: agent.id,
      }),
      agent: this.toAgent(agent),
    };
  }

  async identity(token: string): Promise<{
    agent: AgentRow;
    site: { id: number; ownerUserId: string; name: string };
  }> {
    const payload = parseAgentToken(token);
    const site = await this.prisma.errandSite.findUnique({
      where: { id: payload.siteId },
      select: { id: true, ownerUserId: true, name: true, status: true },
    });
    if (!site || site.status === 'CLOSED') {
      throw new BusinessException(ErrorCode.NOT_FOUND, '站点不存在或已关闭');
    }
    await this.sites.ensureToolOpen(site.ownerUserId);
    const agent = (await this.prisma.errandAgent.findFirst({
      where: { id: payload.agentId, siteId: site.id },
    })) as unknown as AgentRow | null;
    if (!agent)
      throw new BusinessException(ErrorCode.UNAUTHORIZED, '代理身份已失效');
    if (agent.status !== 'ACTIVE') {
      throw new BusinessException(ErrorCode.FORBIDDEN, '代理账号已停用');
    }
    return { agent, site };
  }

  async me(agent: AgentRow): Promise<ErrandAgentMe> {
    const cityIds = cityIdsOf(agent.cityIds);
    const [cities, ordersToday, gmvAgg, commissionAgg] = await Promise.all([
      this.prisma.errandCity.findMany({
        where: { id: { in: cityIds }, siteId: agent.siteId },
        select: { id: true, name: true },
      }),
      this.prisma.errandOrder.count({
        where: {
          siteId: agent.siteId,
          cityId: { in: cityIds },
          createdAt: { gte: this.todayStart() },
        },
      }),
      this.prisma.errandOrder.aggregate({
        where: {
          siteId: agent.siteId,
          cityId: { in: cityIds },
          payState: 'PAID',
          createdAt: { gte: this.todayStart() },
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.errandAgentTx.aggregate({
        where: {
          siteId: agent.siteId,
          agentId: agent.id,
          type: 'INCOME',
          createdAt: { gte: this.todayStart() },
        },
        _sum: { amount: true },
      }),
    ]);
    return {
      agent: this.toAgent(agent),
      cities: cities.map((city) => ({ id: city.id, name: city.name })),
      ordersToday,
      gmvToday: amount(gmvAgg._sum.totalAmount),
      commissionToday: amount(commissionAgg._sum.amount),
    };
  }

  async orders(
    agent: AgentRow,
    query: Record<string, unknown>,
  ): Promise<PageResponse<ErrandOrder>> {
    const cityIds = cityIdsOf(agent.cityIds);
    const { page, pageSize, offset } = pageArgs(query);
    const where: Prisma.ErrandOrderWhereInput = {
      siteId: agent.siteId,
      cityId: { in: cityIds },
    };
    const status = clip(query.status, 24);
    if (status) where.status = status;
    const [rows, total] = await Promise.all([
      this.prisma.errandOrder.findMany({
        where,
        orderBy: [{ id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.errandOrder.count({ where }),
    ]);
    return pageOf(
      (rows as unknown as Array<Record<string, unknown>>).map((row) =>
        this.toOrder(row),
      ),
      total,
      page,
      pageSize,
    );
  }

  private toOrder(row: Record<string, unknown>): ErrandOrder {
    const read = (key: string) => row[key];
    return {
      id: Number(read('id')),
      orderNo: toText(read('orderNo')),
      cityId: Number(read('cityId')) || 0,
      cityName: toText(read('cityName')),
      serviceType: String(read('serviceType')) === 'BUY' ? 'BUY' : 'SEND',
      status: String(read('status')) as ErrandOrder['status'],
      payState: String(read('payState')) as ErrandOrder['payState'],
      payMode: String(read('payMode')) as ErrandOrder['payMode'],
      fromParty: (read('fromParty') as ErrandOrder['fromParty']) || {
        name: '',
        mobile: '',
        province: '',
        city: '',
        district: '',
        address: '',
        lng: 0,
        lat: 0,
      },
      toParty: (read('toParty') as ErrandOrder['toParty']) || {
        name: '',
        mobile: '',
        province: '',
        city: '',
        district: '',
        address: '',
        lng: 0,
        lat: 0,
      },
      goodsDesc: toText(read('goodsDesc')),
      goodsAmount: amount(read('goodsAmount')),
      weightKg: Number(read('weightKg')) || 0,
      distanceKm: Number(read('distanceKm')) || 0,
      baseFee: amount(read('baseFee')),
      distanceFee: amount(read('distanceFee')),
      weightFee: amount(read('weightFee')),
      timeFee: amount(read('timeFee')),
      goodsFee: amount(read('goodsFee')),
      tip: amount(read('tip')),
      couponId: Number(read('couponId')) || 0,
      couponDiscount: amount(read('couponDiscount')),
      pointsUsed: Number(read('pointsUsed')) || 0,
      pointsEarned: Number(read('pointsEarned')) || 0,
      pointsDiscount: amount(read('pointsDiscount')),
      totalAmount: amount(read('totalAmount')),
      riderIncomeAmount: amount(read('riderIncomeAmount')),
      agentId: Number(read('agentId')) || 0,
      agentIncomeAmount: amount(read('agentIncomeAmount')),
      purchaseAmount: amount(read('purchaseAmount')),
      purchaseReceipt: toText(read('purchaseReceipt')),
      purchaseNote: toText(read('purchaseNote')),
      changeAmount: amount(read('changeAmount')),
      extraAmount: amount(read('extraAmount')),
      extraPaidAt: iso(read('extraPaidAt') as Date | null),
      rating: Number(read('rating')) || 0,
      ratingComment: toText(read('ratingComment')),
      ratedAt: iso(read('ratedAt') as Date | null),
      riderId: Number(read('riderId')) || 0,
      riderNo: toText(read('riderNo')),
      riderName: toText(read('riderName')),
      customerId: Number(read('customerId')) || 0,
      contactName: toText(read('contactName')),
      contactMobile: toText(read('contactMobile')),
      remark: toText(read('remark')),
      photos: jsonList<string>(read('photos')),
      cancelReason: toText(read('cancelReason')),
      expireAt: iso(read('expireAt') as Date | null),
      paidAt: iso(read('paidAt') as Date | null),
      acceptedAt: iso(read('acceptedAt') as Date | null),
      pickedAt: iso(read('pickedAt') as Date | null),
      deliveredAt: iso(read('deliveredAt') as Date | null),
      completedAt: iso(read('completedAt') as Date | null),
      createdAt: iso(read('createdAt') as Date | null),
      updatedAt: iso(read('updatedAt') as Date | null),
    };
  }

  async wallet(agent: AgentRow) {
    const [txs, withdrawals] = await Promise.all([
      this.prisma.errandAgentTx.findMany({
        where: { siteId: agent.siteId, agentId: agent.id },
        orderBy: [{ id: 'desc' }],
        take: 50,
      }),
      this.prisma.errandAgentWithdrawal.findMany({
        where: { siteId: agent.siteId, agentId: agent.id },
        orderBy: [{ id: 'desc' }],
        take: 50,
      }),
    ]);
    return {
      balance: amount(agent.balance),
      frozen: amount(agent.frozen),
      totalIncome: amount(agent.totalIncome),
      txs: txs.map((row) => ({
        id: row.id,
        type: row.type,
        amount: amount(row.amount),
        balanceAfter: amount(row.balanceAfter),
        orderNo: row.orderNo,
        remark: row.remark,
        createdAt: iso(row.createdAt),
      })),
      withdrawals: withdrawals.map((row) =>
        this.toWithdrawal(row as unknown as AgentWithdrawalRow),
      ),
    };
  }

  async requestWithdrawal(
    agent: AgentRow,
    amountYuan: number,
    bankInfo: string,
  ) {
    const cents = toCents(amountYuan);
    if (cents <= 0)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '提现金额必须大于 0');
    const balanceCents = toCents(agent.balance);
    if (cents > balanceCents) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '可提现余额不足');
    }
    const pending = await this.prisma.errandAgentWithdrawal.count({
      where: { agentId: agent.id, status: 'PENDING' },
    });
    if (pending > 0) {
      throw new BusinessException(ErrorCode.CONFLICT, '上一笔提现还在等待处理');
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const balanceAfter = fromCents(balanceCents - cents);
      await tx.errandAgent.update({
        where: { id: agent.id },
        data: {
          balance: { decrement: fromCents(cents) },
          frozen: { increment: fromCents(cents) },
        },
      });
      const row = await tx.errandAgentWithdrawal.create({
        data: {
          siteId: agent.siteId,
          agentId: agent.id,
          agentName: agent.name,
          amount: fromCents(cents),
          bankInfo: clip(bankInfo, 200),
        },
      });
      await tx.errandAgentTx.create({
        data: {
          siteId: agent.siteId,
          agentId: agent.id,
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

  // ---------------------------------------------------------------- 分佣

  /** 找到负责该城市的启用代理（第一匹配）。 */
  async agentForCity(siteId: number, cityId: number): Promise<AgentRow | null> {
    const rows = (await this.prisma.errandAgent.findMany({
      where: { siteId, status: 'ACTIVE' },
      take: 100,
    })) as unknown as AgentRow[];
    return rows.find((row) => cityIdsOf(row.cityIds).includes(cityId)) ?? null;
  }

  commissionOf(order: AgentOrderLike, agent: AgentRow): number {
    return commissionOf(order, Number(agent.commissionRate) || 0);
  }

  async creditOnComplete(
    tx: Prisma.TransactionClient,
    order: AgentOrderLike,
    agent: AgentRow,
    commission: number,
  ): Promise<void> {
    if (commission <= 0) return;
    const balanceAfter = fromCents(
      toCents(agent.balance) + toCents(commission),
    );
    await tx.errandAgent.update({
      where: { id: agent.id },
      data: {
        balance: { increment: commission },
        totalIncome: { increment: commission },
      },
    });
    await tx.errandAgentTx.create({
      data: {
        siteId: order.siteId,
        agentId: agent.id,
        type: 'INCOME',
        amount: commission,
        balanceAfter,
        orderId: order.id,
        orderNo: order.orderNo,
        remark: `订单 ${order.orderNo} 城市分佣`,
      },
    });
  }

  async reverseOnRefund(
    tx: Prisma.TransactionClient,
    order: {
      id: number;
      siteId: number;
      orderNo: string;
      agentId: number;
      agentIncomeAmount: unknown;
    },
  ): Promise<void> {
    if (!order.agentId) return;
    const cents = Math.abs(toCents(order.agentIncomeAmount));
    if (cents <= 0) return;
    const agent = await tx.errandAgent.findFirst({
      where: { id: order.agentId, siteId: order.siteId },
      select: { id: true, balance: true },
    });
    if (!agent) return;
    const balanceAfter = fromCents(toCents(agent.balance) - cents);
    await tx.errandAgent.update({
      where: { id: agent.id },
      data: {
        balance: { decrement: fromCents(cents) },
        totalIncome: { decrement: fromCents(cents) },
      },
    });
    await tx.errandAgentTx.create({
      data: {
        siteId: order.siteId,
        agentId: agent.id,
        type: 'REFUND_REVERSAL',
        amount: -fromCents(cents),
        balanceAfter,
        orderId: order.id,
        orderNo: order.orderNo,
        remark: `订单 ${order.orderNo} 退款，回冲代理分佣`,
      },
    });
  }

  private todayStart(): Date {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start;
  }
}

/** 状态枚举兜底。 */
export function agentStatusOf(value: unknown): ErrandAgentStatus {
  for (const item of ERRAND_AGENT_STATUSES) if (item === value) return item;
  return 'ACTIVE';
}
