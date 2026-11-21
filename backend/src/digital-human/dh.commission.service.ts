import {
  DH_WITHDRAW_METHODS,
  type DhAuditInput,
  type DhCommissionRow,
  type DhPromoterApplyRow,
  type DhWithdrawRow,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import { pageOf, pageParam, text } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import { dhOrderNo, clip, siteConfigOf } from './dh.shared';
import type { DhMemberService } from './dh.member.service';
import type { DhPayService } from './dh.pay.service';

type SiteRow = NonNullable<
  Awaited<ReturnType<PrismaService['digitalHumanSite']['findUnique']>>
>;
type MemberRow = NonNullable<
  Awaited<ReturnType<PrismaService['digitalHumanMember']['findUnique']>>
>;
type OrderRow = NonNullable<
  Awaited<ReturnType<PrismaService['digitalHumanOrder']['findUnique']>>
>;

function withdrawMethod(value: string): (typeof DH_WITHDRAW_METHODS)[number] {
  for (const item of DH_WITHDRAW_METHODS) {
    if (item === value) return item;
  }
  return 'bank';
}

/**
 * 两级分销：推广员申请（自动/付费/人工）、订单分佣、提现。
 *
 * 四条口径：
 * 1. 佣金只按「订单实付金额」计算，退款按原比例扣回；
 * 2. 提现申请即冻结：余额先扣、审核通过只是打款确认，驳回原路退回；
 * 3. 分佣在支付成功那一笔事务里完成，不依赖定时任务；
 * 4. 推广员身份由站点方审核/套餐开通，站点可整体关闭分销模块。
 */
export class DhCommissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly member: DhMemberService,
    private readonly pay: DhPayService,
  ) {}

  // ================= C 端 =================

  async center(site: SiteRow, member: MemberRow) {
    const config = siteConfigOf(site).commission;
    const [directCount, indirectCount, recent] = await Promise.all([
      this.prisma.digitalHumanMember.count({
        where: { siteId: site.id, referrerId: member.id },
      }),
      this.prisma.digitalHumanMember.count({
        where: { siteId: site.id, parentReferrerId: member.id },
      }),
      this.prisma.digitalHumanCommission.findMany({
        where: { siteId: site.id, memberId: member.id },
        orderBy: { id: 'desc' },
        take: 20,
      }),
    ]);
    const pendingApply = await this.prisma.digitalHumanPromoterApply.findFirst({
      where: { siteId: site.id, memberId: member.id, status: 0 },
      orderBy: { id: 'desc' },
    });
    return {
      enabled: config.enabled,
      joinType: config.joinType,
      level1Rate: config.level1Rate,
      level2Rate: config.level2Rate,
      minWithdrawCents: config.minWithdrawCents,
      isPromoter: member.promoterLevel > 0,
      applyStatus: pendingApply ? 0 : member.promoterLevel > 0 ? 1 : -1,
      commissionBalance: member.commissionBalance,
      commissionTotal: member.commissionTotal,
      directCount,
      indirectCount,
      recent: recent.map((row) => ({
        id: row.id,
        level: row.level,
        type: row.type,
        amountCents: row.amountCents,
        remark: row.remark,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  /** 申请成为推广员：auto 立即通过；manual 待审；pay 生成开通订单并下发支付参数。 */
  async applyPromoter(site: SiteRow, member: MemberRow) {
    const config = siteConfigOf(site).commission;
    if (!config.enabled) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '站点未开放推广分销');
    }
    if (member.promoterLevel > 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '你已经是推广员了');
    }
    const pending = await this.prisma.digitalHumanPromoterApply.findFirst({
      where: { siteId: site.id, memberId: member.id, status: 0 },
    });
    if (pending) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        pending.orderId > 0
          ? '开通订单待支付，请先完成支付'
          : '申请已提交，请等待站点审核',
      );
    }
    if (config.joinType === 'auto') {
      const apply = await this.prisma.digitalHumanPromoterApply.create({
        data: {
          siteId: site.id,
          memberId: member.id,
          joinType: 'auto',
          status: 1,
          reviewedAt: new Date(),
          adminRemark: '自动开通',
        },
      });
      await this.prisma.digitalHumanMember.update({
        where: { id: member.id },
        data: { promoterLevel: 1 },
      });
      return {
        status: 1,
        message: '已开通推广员，分享作品即可获得佣金',
        applyId: apply.id,
        orderId: 0,
        payParams: null,
      };
    }
    if (config.joinType === 'manual') {
      const apply = await this.prisma.digitalHumanPromoterApply.create({
        data: {
          siteId: site.id,
          memberId: member.id,
          joinType: 'manual',
          status: 0,
        },
      });
      return {
        status: 0,
        message: '申请已提交，站点审核通过后自动开通',
        applyId: apply.id,
        orderId: 0,
        payParams: null,
      };
    }
    // 付费开通：生成一张开通订单，支付成功后由订单链路自动通过申请
    const pkg = await this.prisma.digitalHumanPackage.findFirst({
      where: { id: config.payPackageId, siteId: site.id, enabled: true },
    });
    if (!pkg) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '站点未配置推广员开通套餐，请联系站点管理员',
      );
    }
    const order = await this.prisma.digitalHumanOrder.create({
      data: {
        siteId: site.id,
        orderNo: dhOrderNo(),
        memberId: member.id,
        packageId: pkg.id,
        packageSnapshot: {
          name: pkg.name,
          type: pkg.type,
          priceCents: pkg.priceCents,
          vipDays: pkg.vipDays,
          point: pkg.point,
          bodyQuota: pkg.bodyQuota,
          voiceQuota: pkg.voiceQuota,
          purpose: 'promoter',
        },
        type: pkg.type,
        amountCents: pkg.priceCents,
        payType: 'wxpay',
        status: 0,
        promoterId: member.referrerId,
        expireAt: new Date(Date.now() + 30 * 60_000),
      },
    });
    const apply = await this.prisma.digitalHumanPromoterApply.create({
      data: {
        siteId: site.id,
        memberId: member.id,
        joinType: 'pay',
        status: 0,
        orderId: order.id,
      },
    });
    const runtime = await this.pay.runtime(site);
    const payParams = runtime
      ? await this.pay.prepay({
          site,
          orderNo: order.orderNo,
          amountCents: order.amountCents,
          description: `开通推广员 · ${pkg.name}`,
          openid: member.openid,
        })
      : null;
    return {
      status: 0,
      message: payParams
        ? '请完成支付，支付成功后自动开通推广员'
        : '站点暂未配置在线支付，请联系站点管理员开通',
      applyId: apply.id,
      orderId: order.id,
      payParams,
    };
  }

  async myCommissions(
    site: SiteRow,
    member: MemberRow,
    page: number,
    pageSize: number,
  ) {
    const where = { siteId: site.id, memberId: member.id };
    const [total, rows] = await Promise.all([
      this.prisma.digitalHumanCommission.count({ where }),
      this.prisma.digitalHumanCommission.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const fromOf = await this.member.nameMap(
      site.id,
      rows.map((row) => row.fromMemberId),
    );
    const list: DhCommissionRow[] = rows.map((row) => ({
      id: row.id,
      memberId: row.memberId,
      nickname: member.nickname,
      fromMemberId: row.fromMemberId,
      fromNickname: fromOf.get(row.fromMemberId) || '',
      orderId: row.orderId,
      level: row.level,
      type: row.type,
      amountCents: row.amountCents,
      rate: row.rate,
      balanceAfter: row.balanceAfter,
      remark: row.remark,
      createdAt: row.createdAt.toISOString(),
    }));
    return pageOf(list, total, page, pageSize);
  }

  async applyWithdraw(
    site: SiteRow,
    member: MemberRow,
    body: Record<string, unknown>,
  ) {
    const config = siteConfigOf(site).commission;
    if (member.promoterLevel <= 0) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '开通推广员后才能提现佣金',
      );
    }
    const amountCents = Math.round(Number(body.amountCents) || 0);
    if (amountCents < config.minWithdrawCents) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `最低提现金额为 ${(config.minWithdrawCents / 100).toFixed(2)} 元`,
      );
    }
    if (amountCents > member.commissionBalance) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `可提现佣金不足（当前 ${(member.commissionBalance / 100).toFixed(2)} 元）`,
      );
    }
    const method = withdrawMethod(text(body.method));
    const accountName = clip(text(body.accountName), 60);
    const accountNo = clip(text(body.accountNo), 120);
    const bankName = clip(text(body.bankName), 120);
    const qrUrl = clip(text(body.qrUrl), 500);
    if (method === 'bank' && (!accountName || !accountNo)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请填写收款人姓名与银行卡号',
      );
    }
    if (method === 'qrcode' && !qrUrl) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请上传收款二维码');
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const fresh = await tx.digitalHumanMember.findFirst({
        where: { id: member.id, siteId: site.id },
      });
      if (!fresh || fresh.commissionBalance < amountCents) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '可提现佣金不足');
      }
      const updated = await tx.digitalHumanMember.update({
        where: { id: fresh.id },
        data: { commissionBalance: { decrement: amountCents } },
      });
      const withdraw = await tx.digitalHumanWithdraw.create({
        data: {
          siteId: site.id,
          memberId: member.id,
          amountCents,
          method,
          accountName,
          accountNo,
          bankName,
          qrUrl,
          status: 0,
        },
      });
      await tx.digitalHumanCommission.create({
        data: {
          siteId: site.id,
          memberId: member.id,
          level: 0,
          type: 2,
          amountCents: -amountCents,
          rate: 0,
          balanceAfter: updated.commissionBalance,
          remark: `提现申请 #${withdraw.id}`,
        },
      });
      return withdraw;
    });
    return {
      id: result.id,
      amountCents: result.amountCents,
      status: result.status,
      message: '提现申请已提交，站点审核后打款',
    };
  }

  async myWithdraws(
    site: SiteRow,
    member: MemberRow,
    page: number,
    pageSize: number,
  ) {
    const where = { siteId: site.id, memberId: member.id };
    const [total, rows] = await Promise.all([
      this.prisma.digitalHumanWithdraw.count({ where }),
      this.prisma.digitalHumanWithdraw.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return pageOf(
      rows.map((row) => this.withdrawRow(row, member.nickname)),
      total,
      page,
      pageSize,
    );
  }

  // ================= 订单钩子 =================

  /** 支付成功钩子：付费开通的推广员申请自动通过，然后按两级比例分佣。 */
  async onOrderPaid(order: OrderRow) {
    const site = await this.prisma.digitalHumanSite.findUnique({
      where: { id: order.siteId },
    });
    if (!site) return;
    const apply = await this.prisma.digitalHumanPromoterApply.findFirst({
      where: { siteId: order.siteId, orderId: order.id, status: 0 },
    });
    if (apply) {
      await this.prisma.digitalHumanPromoterApply.update({
        where: { id: apply.id },
        data: { status: 1, reviewedAt: new Date(), adminRemark: '付费开通' },
      });
      await this.prisma.digitalHumanMember.update({
        where: { id: apply.memberId },
        data: { promoterLevel: 1 },
      });
    }
    const config = siteConfigOf(site).commission;
    if (!config.enabled || order.promoterId <= 0 || order.amountCents <= 0)
      return;
    const buyer = await this.prisma.digitalHumanMember.findUnique({
      where: { id: order.memberId },
      select: { id: true, nickname: true },
    });
    const level1 = await this.prisma.digitalHumanMember.findFirst({
      where: { id: order.promoterId, siteId: order.siteId, status: 'ACTIVE' },
      select: { id: true, referrerId: true, promoterLevel: true },
    });
    let commission1 = 0;
    let commission2 = 0;
    if (level1 && level1.promoterLevel > 0 && config.level1Rate > 0) {
      commission1 = Math.floor((order.amountCents * config.level1Rate) / 100);
      if (commission1 > 0) {
        await this.credit(
          level1.id,
          commission1,
          1,
          config.level1Rate,
          order,
          buyer?.nickname || '',
        );
      }
    }
    if (level1 && level1.referrerId > 0 && config.level2Rate > 0) {
      const level2 = await this.prisma.digitalHumanMember.findFirst({
        where: {
          id: level1.referrerId,
          siteId: order.siteId,
          status: 'ACTIVE',
          promoterLevel: { gt: 0 },
        },
        select: { id: true },
      });
      if (level2) {
        commission2 = Math.floor((order.amountCents * config.level2Rate) / 100);
        if (commission2 > 0) {
          await this.credit(
            level2.id,
            commission2,
            2,
            config.level2Rate,
            order,
            buyer?.nickname || '',
          );
        }
      }
    }
    if (commission1 || commission2) {
      await this.prisma.digitalHumanOrder.update({
        where: { id: order.id },
        data: { commission1Cents: commission1, commission2Cents: commission2 },
      });
    }
  }

  private async credit(
    memberId: number,
    amountCents: number,
    level: number,
    rate: number,
    order: OrderRow,
    buyerName: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.digitalHumanMember.update({
        where: { id: memberId },
        data: {
          commissionBalance: { increment: amountCents },
          commissionTotal: { increment: amountCents },
        },
      });
      await tx.digitalHumanCommission.create({
        data: {
          siteId: order.siteId,
          memberId,
          fromMemberId: order.memberId,
          orderId: order.id,
          level,
          type: 1,
          amountCents,
          rate,
          balanceAfter: updated.commissionBalance,
          remark: `${level === 1 ? '一级' : '二级'}推广佣金${buyerName ? ` · ${buyerName}` : ''}`,
        },
      });
    });
  }

  /** 退款钩子：按当时入账金额原路扣回（余额不够就扣到 0，差额留痕）。 */
  async clawbackOrder(order: OrderRow) {
    const rows = await this.prisma.digitalHumanCommission.findMany({
      where: { siteId: order.siteId, orderId: order.id, type: 1 },
    });
    for (const row of rows) {
      await this.prisma.$transaction(async (tx) => {
        const member = await tx.digitalHumanMember.findFirst({
          where: { id: row.memberId, siteId: order.siteId },
        });
        if (!member) return;
        const deduct = Math.min(member.commissionBalance, row.amountCents);
        const updated = await tx.digitalHumanMember.update({
          where: { id: member.id },
          data: {
            commissionBalance: { decrement: deduct },
            commissionTotal: {
              decrement: Math.min(member.commissionTotal, row.amountCents),
            },
          },
        });
        await tx.digitalHumanCommission.create({
          data: {
            siteId: order.siteId,
            memberId: member.id,
            fromMemberId: row.fromMemberId,
            orderId: order.id,
            level: row.level,
            type: 3,
            amountCents: -deduct,
            rate: row.rate,
            balanceAfter: updated.commissionBalance,
            remark: '订单退款扣回',
          },
        });
      });
    }
  }

  // ================= 管理端 =================

  async applies(user: CurrentUser, query: Record<string, unknown>) {
    const site = await this.member.siteOfOwner(user.userId);
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
      20,
    );
    const statusRaw = text(query.status).trim();
    const status = statusRaw === '' ? NaN : Number(statusRaw);
    const where = {
      siteId: site.id,
      ...(Number.isInteger(status) ? { status } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.digitalHumanPromoterApply.count({ where }),
      this.prisma.digitalHumanPromoterApply.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const ids = rows.map((row) => row.memberId);
    const members = ids.length
      ? await this.prisma.digitalHumanMember.findMany({
          where: { siteId: site.id, id: { in: ids } },
          select: { id: true, nickname: true, avatar: true },
        })
      : [];
    const map = new Map(members.map((row) => [row.id, row]));
    const list: DhPromoterApplyRow[] = rows.map((row) => ({
      id: row.id,
      memberId: row.memberId,
      nickname: map.get(row.memberId)?.nickname || '',
      avatar: map.get(row.memberId)?.avatar || '',
      joinType:
        row.joinType === 'pay'
          ? 'pay'
          : row.joinType === 'manual'
            ? 'manual'
            : 'auto',
      status: row.status,
      orderId: row.orderId,
      reason: row.reason,
      adminRemark: row.adminRemark,
      appliedAt: row.appliedAt.toISOString(),
      reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    }));
    return pageOf(list, total, page, pageSize);
  }

  async auditApply(user: CurrentUser, body: DhAuditInput) {
    const site = await this.member.siteOfOwner(user.userId);
    const apply = await this.prisma.digitalHumanPromoterApply.findFirst({
      where: { id: body.id, siteId: site.id },
    });
    if (!apply) throw new BusinessException(ErrorCode.NOT_FOUND, '申请不存在');
    if (apply.status !== 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '该申请已处理过');
    }
    const updated = await this.prisma.digitalHumanPromoterApply.update({
      where: { id: apply.id },
      data: {
        status: body.pass ? 1 : 2,
        adminRemark: clip(body.remark, 200),
        reviewedAt: new Date(),
      },
    });
    if (body.pass) {
      await this.prisma.digitalHumanMember.update({
        where: { id: apply.memberId },
        data: { promoterLevel: 1 },
      });
    }
    const member = await this.prisma.digitalHumanMember.findUnique({
      where: { id: apply.memberId },
      select: { nickname: true, avatar: true },
    });
    return {
      id: updated.id,
      memberId: updated.memberId,
      nickname: member?.nickname || '',
      avatar: member?.avatar || '',
      joinType:
        updated.joinType === 'pay'
          ? 'pay'
          : updated.joinType === 'manual'
            ? 'manual'
            : 'auto',
      status: updated.status,
      orderId: updated.orderId,
      reason: updated.reason,
      adminRemark: updated.adminRemark,
      appliedAt: updated.appliedAt.toISOString(),
      reviewedAt: updated.reviewedAt ? updated.reviewedAt.toISOString() : null,
    } satisfies DhPromoterApplyRow;
  }

  async commissions(user: CurrentUser, query: Record<string, unknown>) {
    const site = await this.member.siteOfOwner(user.userId);
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
      20,
    );
    const memberId = Number(query.memberId || 0);
    const typeRaw = text(query.type).trim();
    const type = typeRaw === '' ? NaN : Number(typeRaw);
    const where = {
      siteId: site.id,
      ...(memberId > 0 ? { memberId } : {}),
      ...(Number.isInteger(type) ? { type } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.digitalHumanCommission.count({ where }),
      this.prisma.digitalHumanCommission.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const nameOf = await this.member.nameMap(
      site.id,
      rows.flatMap((row) => [row.memberId, row.fromMemberId]),
    );
    const list: DhCommissionRow[] = rows.map((row) => ({
      id: row.id,
      memberId: row.memberId,
      nickname: nameOf.get(row.memberId) || '',
      fromMemberId: row.fromMemberId,
      fromNickname: nameOf.get(row.fromMemberId) || '',
      orderId: row.orderId,
      level: row.level,
      type: row.type,
      amountCents: row.amountCents,
      rate: row.rate,
      balanceAfter: row.balanceAfter,
      remark: row.remark,
      createdAt: row.createdAt.toISOString(),
    }));
    return pageOf(list, total, page, pageSize);
  }

  async withdraws(user: CurrentUser, query: Record<string, unknown>) {
    const site = await this.member.siteOfOwner(user.userId);
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
      20,
    );
    const memberId = Number(query.memberId || 0);
    const statusRaw = text(query.status).trim();
    const status = statusRaw === '' ? NaN : Number(statusRaw);
    const where = {
      siteId: site.id,
      ...(memberId > 0 ? { memberId } : {}),
      ...(Number.isInteger(status) ? { status } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.digitalHumanWithdraw.count({ where }),
      this.prisma.digitalHumanWithdraw.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const nameOf = await this.member.nameMap(
      site.id,
      rows.map((row) => row.memberId),
    );
    return pageOf(
      rows.map((row) => this.withdrawRow(row, nameOf.get(row.memberId) || '')),
      total,
      page,
      pageSize,
    );
  }

  async auditWithdraw(user: CurrentUser, body: DhAuditInput) {
    const site = await this.member.siteOfOwner(user.userId);
    const row = await this.prisma.digitalHumanWithdraw.findFirst({
      where: { id: body.id, siteId: site.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '提现单不存在');
    if (row.status !== 0)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '该提现单已处理过');
    if (body.pass) {
      const updated = await this.prisma.digitalHumanWithdraw.update({
        where: { id: row.id },
        data: {
          status: 1,
          adminRemark: clip(body.remark, 200),
          processedAt: new Date(),
        },
      });
      const member = await this.prisma.digitalHumanMember.findUnique({
        where: { id: row.memberId },
        select: { nickname: true },
      });
      return this.withdrawRow(updated, member?.nickname || '');
    }
    // 驳回：冻结的佣金原路退回
    const updated = await this.prisma.$transaction(async (tx) => {
      const member = await tx.digitalHumanMember.findFirst({
        where: { id: row.memberId, siteId: site.id },
      });
      if (!member)
        throw new BusinessException(ErrorCode.NOT_FOUND, '会员不存在');
      const fresh = await tx.digitalHumanMember.update({
        where: { id: member.id },
        data: { commissionBalance: { increment: row.amountCents } },
      });
      await tx.digitalHumanCommission.create({
        data: {
          siteId: site.id,
          memberId: member.id,
          level: 0,
          type: 4,
          amountCents: row.amountCents,
          rate: 0,
          balanceAfter: fresh.commissionBalance,
          remark: `提现驳回退回 #${row.id}`,
        },
      });
      return tx.digitalHumanWithdraw.update({
        where: { id: row.id },
        data: {
          status: 2,
          adminRemark: clip(body.remark, 200),
          processedAt: new Date(),
        },
      });
    });
    return this.withdrawRow(updated, '');
  }

  private withdrawRow(
    row: {
      id: number;
      memberId: number;
      amountCents: number;
      method: string;
      accountName: string;
      accountNo: string;
      bankName: string;
      qrUrl: string;
      status: number;
      adminRemark: string;
      createdAt: Date;
      processedAt: Date | null;
    },
    nickname: string,
  ): DhWithdrawRow {
    return {
      id: row.id,
      memberId: row.memberId,
      nickname,
      amountCents: row.amountCents,
      method: withdrawMethod(row.method),
      accountName: row.accountName,
      accountNo: row.accountNo,
      bankName: row.bankName,
      qrUrl: row.qrUrl,
      status: row.status,
      adminRemark: row.adminRemark,
      createdAt: row.createdAt.toISOString(),
      processedAt: row.processedAt ? row.processedAt.toISOString() : null,
    };
  }
}
