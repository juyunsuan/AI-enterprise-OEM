import {
  DH_PACKAGE_TYPES,
  type DhCardBatchCreateInput,
  type DhCardBatchRow,
  type DhCardRow,
  type DhCardsExportResult,
  type DhOrderRefundResult,
  type DhOrderRow,
  type DhPackageInput,
  type DhPackageRow,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import { pageOf, pageParam, text } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { SystemAssetService } from '../system-asset/system-asset.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { DhCommissionService } from './dh.commission.service';
import { DH_SCENE, clip, dhCardCode, dhOrderNo } from './dh.shared';
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
type PackageRow = NonNullable<
  Awaited<ReturnType<PrismaService['digitalHumanPackage']['findUnique']>>
>;

function packageType(value: string): (typeof DH_PACKAGE_TYPES)[number] {
  for (const item of DH_PACKAGE_TYPES) {
    if (item === value) return item;
  }
  return 'point';
}

function num(value: unknown): number {
  const result = Math.round(Number(value) || 0);
  return Number.isFinite(result) ? result : 0;
}

type Snapshot = {
  name: string;
  type: string;
  priceCents: number;
  vipDays: number;
  point: number;
  bodyQuota: number;
  voiceQuota: number;
};

function snapshotOf(value: unknown, order: OrderRow): Snapshot {
  const raw =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    name:
      clip(typeof raw.name === 'string' ? raw.name : '', 80) ||
      `套餐 #${order.packageId}`,
    type: clip(typeof raw.type === 'string' ? raw.type : '', 16) || order.type,
    priceCents: num(raw.priceCents) || order.amountCents,
    vipDays: num(raw.vipDays),
    point: num(raw.point),
    bodyQuota: num(raw.bodyQuota),
    voiceQuota: num(raw.voiceQuota),
  };
}

/**
 * 数字人商城：套餐 / 订单 / 卡密。
 *
 * 资金口径与商城一致：订单收款进站点主人自己的商户号，平台不经手；
 * 卡密是纯线下售卖渠道，兑换在同一事务里完成「改会员资产 + 写流水 + 标记已用」。
 */
export class DhStoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: SystemAssetService,
    private readonly member: DhMemberService,
    private readonly pay: DhPayService,
    private readonly commission: DhCommissionService,
  ) {}

  // ================= 套餐 =================

  async packages(user: CurrentUser, type?: string) {
    const site = await this.member.siteOfOwner(user.userId);
    const filter = clip(type || '', 16);
    const rows = await this.prisma.digitalHumanPackage.findMany({
      where: {
        siteId: site.id,
        ...(filter ? { type: packageType(filter) } : {}),
      },
      orderBy: [{ type: 'asc' }, { sort: 'asc' }, { id: 'asc' }],
      take: 200,
    });
    return rows.map((row) => this.packageRow(row));
  }

  async savePackage(user: CurrentUser, body: DhPackageInput) {
    const site = await this.member.siteOfOwner(user.userId);
    const data = {
      type: packageType(body.type),
      name: clip(body.name, 80),
      priceCents: body.priceCents,
      originalCents: body.originalCents,
      vipDays: body.vipDays,
      point: body.point,
      bodyQuota: body.bodyQuota,
      voiceQuota: body.voiceQuota,
      limitNum: body.limitNum,
      recommended: body.recommended,
      sort: body.sort,
      enabled: body.enabled,
    };
    if (body.id) {
      const row = await this.prisma.digitalHumanPackage.findFirst({
        where: { id: body.id, siteId: site.id },
      });
      if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '套餐不存在');
      const updated = await this.prisma.digitalHumanPackage.update({
        where: { id: row.id },
        data,
      });
      return this.packageRow(updated);
    }
    const created = await this.prisma.digitalHumanPackage.create({
      data: { siteId: site.id, ...data },
    });
    return this.packageRow(created);
  }

  async removePackage(user: CurrentUser, id: number) {
    const site = await this.member.siteOfOwner(user.userId);
    const row = await this.prisma.digitalHumanPackage.findFirst({
      where: { id, siteId: site.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '套餐不存在');
    await this.prisma.digitalHumanPackage.delete({ where: { id: row.id } });
    return { ok: true };
  }

  // ================= C 端：套餐 / 下单 / 我的订单 =================

  async publicPackages(site: SiteRow) {
    const rows = await this.prisma.digitalHumanPackage.findMany({
      where: { siteId: site.id, enabled: true },
      orderBy: [{ type: 'asc' }, { sort: 'asc' }, { id: 'asc' }],
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      name: row.name,
      priceCents: row.priceCents,
      originalCents: row.originalCents,
      vipDays: row.vipDays,
      point: row.point,
      bodyQuota: row.bodyQuota,
      voiceQuota: row.voiceQuota,
      limitNum: row.limitNum,
      sales: row.sales,
      recommended: row.recommended,
    }));
  }

  async createOrder(site: SiteRow, member: MemberRow, packageId: number) {
    const pkg = await this.prisma.digitalHumanPackage.findFirst({
      where: { id: packageId, siteId: site.id, enabled: true },
    });
    if (!pkg)
      throw new BusinessException(ErrorCode.NOT_FOUND, '套餐不存在或已下架');
    if (pkg.limitNum > 0) {
      const bought = await this.prisma.digitalHumanOrder.count({
        where: {
          siteId: site.id,
          memberId: member.id,
          packageId: pkg.id,
          status: 1,
        },
      });
      if (bought >= pkg.limitNum) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          `该套餐每人限购 ${pkg.limitNum} 次，你已达到上限`,
        );
      }
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
        },
        type: pkg.type,
        amountCents: pkg.priceCents,
        payType: 'wxpay',
        status: 0,
        promoterId: member.referrerId,
        expireAt: new Date(Date.now() + 30 * 60_000),
      },
    });
    const runtime = await this.pay.runtime(site);
    if (!runtime) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '站点暂未开通在线支付：请联系站点管理员，或使用卡密兑换',
      );
    }
    let payParams: Awaited<ReturnType<DhPayService['prepay']>> | null = null;
    try {
      payParams = await this.pay.prepay({
        site,
        orderNo: order.orderNo,
        amountCents: order.amountCents,
        description: `${pkg.name}`,
        openid: member.openid,
      });
    } catch (error) {
      await this.prisma.digitalHumanOrder.update({
        where: { id: order.id },
        data: { status: 3 },
      });
      throw error;
    }
    return {
      orderId: order.id,
      orderNo: order.orderNo,
      amountCents: order.amountCents,
      payParams,
    };
  }

  async myOrders(
    site: SiteRow,
    member: MemberRow,
    page: number,
    pageSize: number,
  ) {
    const where = { siteId: site.id, memberId: member.id };
    const [total, rows] = await Promise.all([
      this.prisma.digitalHumanOrder.count({ where }),
      this.prisma.digitalHumanOrder.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return pageOf(
      rows.map((row) => ({
        id: row.id,
        orderNo: row.orderNo,
        type: row.type,
        amountCents: row.amountCents,
        status: row.status,
        packageName: snapshotOf(row.packageSnapshot, row).name,
        paidAt: row.paidAt ? row.paidAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    );
  }

  /** 支付回调入口：幂等，成功后发资产 + 记销量 + 分佣。 */
  async markPaid(input: {
    siteId: number;
    orderNo: string;
    transactionId: string;
    amountCents: number;
    mchId: string;
  }) {
    const order = await this.prisma.digitalHumanOrder.findFirst({
      where: { orderNo: clip(input.orderNo, 40), siteId: input.siteId },
    });
    if (!order) return { ok: false, message: 'order not found' };
    if (order.status === 1) return { ok: true, message: 'ignored (paid)' };
    if (order.status !== 0) return { ok: false, message: 'order closed' };
    if (
      Math.round(Number(order.amountCents)) !== Math.round(input.amountCents)
    ) {
      return { ok: false, message: '回调金额与订单金额不一致' };
    }
    const snapshot = snapshotOf(order.packageSnapshot, order);
    const paidAt = new Date();
    const updated = await this.prisma.digitalHumanOrder.updateMany({
      where: { id: order.id, siteId: input.siteId, status: 0 },
      data: {
        status: 1,
        payType: 'wxpay',
        transactionId: clip(input.transactionId, 64),
        paidAt,
      },
    });
    if (!updated.count) return { ok: true, message: 'ignored (paid)' };
    const vipExpireAt =
      snapshot.vipDays > 0
        ? new Date(
            Math.max(
              Date.now(),
              (await this.vipBaseOf(order.memberId)) +
                snapshot.vipDays * 86_400_000,
            ),
          )
        : undefined;
    if (vipExpireAt) {
      await this.prisma.digitalHumanMember.update({
        where: { id: order.memberId },
        data: { vipExpireAt },
      });
    }
    for (const item of [
      { account: 'point' as const, value: snapshot.point },
      { account: 'body' as const, value: snapshot.bodyQuota },
      { account: 'voice' as const, value: snapshot.voiceQuota },
    ]) {
      if (item.value > 0) {
        await this.member.applyBalance({
          siteId: order.siteId,
          memberId: order.memberId,
          account: item.account,
          delta: item.value,
          bizType: 'recharge',
          refId: order.id,
          remark: `购买「${snapshot.name}」`,
        });
      }
    }
    await this.prisma.digitalHumanPackage
      .update({
        where: { id: order.packageId },
        data: { sales: { increment: 1 } },
      })
      .catch(() => undefined);
    const fresh = await this.prisma.digitalHumanOrder.findUnique({
      where: { id: order.id },
    });
    if (fresh) await this.commission.onOrderPaid(fresh);
    return { ok: true, message: 'success' };
  }

  private async vipBaseOf(memberId: number): Promise<number> {
    const member = await this.prisma.digitalHumanMember.findUnique({
      where: { id: memberId },
      select: { vipExpireAt: true },
    });
    return member?.vipExpireAt ? member.vipExpireAt.getTime() : Date.now();
  }

  // ================= 卡密 =================

  async cardBatches(user: CurrentUser, query: Record<string, unknown>) {
    const site = await this.member.siteOfOwner(user.userId);
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
      20,
    );
    const [total, rows] = await Promise.all([
      this.prisma.digitalHumanCardBatch.count({ where: { siteId: site.id } }),
      this.prisma.digitalHumanCardBatch.findMany({
        where: { siteId: site.id },
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const used = rows.length
      ? await this.prisma.digitalHumanCard.groupBy({
          by: ['batchId'],
          where: {
            siteId: site.id,
            batchId: { in: rows.map((row) => row.id) },
            status: 'used',
          },
          _count: { _all: true },
        })
      : [];
    const usedMap = new Map(used.map((row) => [row.batchId, row._count._all]));
    return pageOf(
      rows.map((row) => this.batchRow(row, usedMap.get(row.id) || 0)),
      total,
      page,
      pageSize,
    );
  }

  async createBatch(user: CurrentUser, body: DhCardBatchCreateInput) {
    const site = await this.member.siteOfOwner(user.userId);
    const batch = await this.prisma.digitalHumanCardBatch.create({
      data: {
        siteId: site.id,
        userId: user.userId,
        name:
          clip(body.name, 80) ||
          `批次 ${new Date().toLocaleDateString('zh-CN')}`,
        type: packageType(body.type),
        quantity: body.quantity,
        vipDays: body.vipDays,
        point: body.point,
        bodyQuota: body.bodyQuota,
        voiceQuota: body.voiceQuota,
        remark: clip(body.remark, 200),
      },
    });
    const codes = new Set<string>();
    while (codes.size < body.quantity) codes.add(dhCardCode());
    await this.prisma.$transaction(
      [...codes].map((code) =>
        this.prisma.digitalHumanCard.create({
          data: {
            siteId: site.id,
            batchId: batch.id,
            code,
            type: batch.type,
            vipDays: batch.vipDays,
            point: batch.point,
            bodyQuota: batch.bodyQuota,
            voiceQuota: batch.voiceQuota,
          },
        }),
      ),
    );
    await this.audit(
      user.userId,
      'dh.card.batch',
      `batch=${batch.id} ${batch.type} x${body.quantity}`,
    );
    return this.batchRow(batch, 0);
  }

  async cards(user: CurrentUser, query: Record<string, unknown>) {
    const site = await this.member.siteOfOwner(user.userId);
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
      20,
    );
    const batchId = Number(query.batchId || 0);
    const status = clip(text(query.status), 16);
    const keyword = clip(text(query.keyword), 40);
    const where = {
      siteId: site.id,
      ...(batchId > 0 ? { batchId } : {}),
      ...(status ? { status } : {}),
      ...(keyword ? { code: { contains: keyword.toUpperCase() } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.digitalHumanCard.count({ where }),
      this.prisma.digitalHumanCard.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const nameOf = await this.member.nameMap(
      site.id,
      rows.map((row) => row.usedByMemberId),
    );
    return pageOf(
      rows.map((row) =>
        this.cardRow(row, nameOf.get(row.usedByMemberId) || ''),
      ),
      total,
      page,
      pageSize,
    );
  }

  async disableCard(user: CurrentUser, id: number) {
    const site = await this.member.siteOfOwner(user.userId);
    const row = await this.prisma.digitalHumanCard.findFirst({
      where: { id, siteId: site.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '卡密不存在');
    if (row.status === 'used') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '已使用的卡密不能停用',
      );
    }
    await this.prisma.digitalHumanCard.update({
      where: { id: row.id },
      data: { status: 'disabled' },
    });
    return { ok: true };
  }

  async exportCards(
    user: CurrentUser,
    batchId: number,
  ): Promise<DhCardsExportResult> {
    const site = await this.member.siteOfOwner(user.userId);
    const rows = await this.prisma.digitalHumanCard.findMany({
      where: { siteId: site.id, ...(batchId > 0 ? { batchId } : {}) },
      orderBy: { id: 'asc' },
      take: 20_000,
    });
    if (!rows.length) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '没有可导出的卡密');
    }
    const header = '卡号,类型,会员天数,算力,形象点,声音点,状态,使用时间';
    const lines = rows.map((row) =>
      [
        row.code,
        row.type,
        row.vipDays,
        row.point,
        row.bodyQuota,
        row.voiceQuota,
        row.status,
        row.usedAt ? row.usedAt.toISOString() : '',
      ].join(','),
    );
    const csv = `\uFEFF${header}\n${lines.join('\n')}\n`;
    const fileName = `digital-human-cards-${site.siteCode}-${batchId || 'all'}-${Date.now()}.csv`;
    // 卡密导出件入账到站点归属账号：含卡密明文，归属与留存必须可追
    const uploaded = await this.assets.put({
      ownerUserId: site.userId,
      path: `${DH_SCENE.toLowerCase()}/cards/${site.id}/${fileName}`,
      bytes: Buffer.from(csv, 'utf8'),
      name: fileName,
      bizRef: `dh-site:${site.id}`,
    });
    await this.audit(
      user.userId,
      'dh.card.export',
      `${fileName} rows=${rows.length}`,
    );
    return { url: this.assets.urlOf(uploaded.key), fileName };
  }

  /** C 端兑换：一事务内改资产、写流水、标记已用；重复兑换给明确提示。 */
  async redeem(site: SiteRow, member: MemberRow, rawCode: string) {
    const code = clip(rawCode, 32).toUpperCase();
    if (!code) throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写卡密');
    const card = await this.prisma.digitalHumanCard.findUnique({
      where: { siteId_code: { siteId: site.id, code } },
    });
    if (!card)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '卡密不存在，请核对后重试',
      );
    if (card.status === 'used') {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '该卡密已被使用');
    }
    if (card.status === 'disabled') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '该卡密已停用，请联系站点',
      );
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const fresh = await tx.digitalHumanCard.findUnique({
        where: { id: card.id },
      });
      if (!fresh || fresh.status !== 'unused') {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '该卡密已被使用');
      }
      await tx.digitalHumanCard.update({
        where: { id: fresh.id },
        data: { status: 'used', usedByMemberId: member.id, usedAt: new Date() },
      });
      const memberRow = await tx.digitalHumanMember.findUnique({
        where: { id: member.id },
      });
      if (!memberRow)
        throw new BusinessException(ErrorCode.NOT_FOUND, '会员不存在');
      const vipExpireAt =
        fresh.vipDays > 0
          ? new Date(
              Math.max(
                Date.now(),
                memberRow.vipExpireAt?.getTime() || 0 || Date.now(),
              ) +
                fresh.vipDays * 86_400_000,
            )
          : memberRow.vipExpireAt;
      const updated = await tx.digitalHumanMember.update({
        where: { id: member.id },
        data: {
          vipExpireAt,
          point: { increment: fresh.point },
          bodyQuota: { increment: fresh.bodyQuota },
          voiceQuota: { increment: fresh.voiceQuota },
        },
      });
      const logs = [
        { account: 'point', delta: fresh.point, after: updated.point },
        { account: 'body', delta: fresh.bodyQuota, after: updated.bodyQuota },
        {
          account: 'voice',
          delta: fresh.voiceQuota,
          after: updated.voiceQuota,
        },
      ].filter((item) => item.delta > 0);
      for (const log of logs) {
        await tx.digitalHumanBalanceLog.create({
          data: {
            siteId: site.id,
            memberId: member.id,
            account: log.account,
            delta: log.delta,
            balanceAfter: log.after,
            bizType: 'card',
            refId: fresh.id,
            remark: `卡密兑换 ${fresh.code.slice(0, 4)}****`,
          },
        });
      }
      return updated;
    });
    return {
      point: result.point,
      bodyQuota: result.bodyQuota,
      voiceQuota: result.voiceQuota,
      vipExpireAt: result.vipExpireAt ? result.vipExpireAt.toISOString() : null,
      message: '兑换成功，点数已到账',
    };
  }

  // ================= 管理端订单 =================

  async orders(user: CurrentUser, query: Record<string, unknown>) {
    const site = await this.member.siteOfOwner(user.userId);
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
      20,
    );
    const statusRaw = text(query.status).trim();
    const status = statusRaw === '' ? NaN : Number(statusRaw);
    const type = clip(text(query.type), 16);
    const keyword = clip(text(query.keyword), 40);
    const where = {
      siteId: site.id,
      ...(Number.isInteger(status) ? { status } : {}),
      ...(type ? { type: packageType(type) } : {}),
      ...(keyword ? { orderNo: { contains: keyword } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.digitalHumanOrder.count({ where }),
      this.prisma.digitalHumanOrder.findMany({
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
    const list: DhOrderRow[] = rows.map((row) =>
      this.orderRow(row, nameOf.get(row.memberId) || ''),
    );
    return pageOf(list, total, page, pageSize);
  }

  async refundOrder(
    user: CurrentUser,
    id: number,
    reason: string,
  ): Promise<DhOrderRefundResult> {
    const site = await this.member.siteOfOwner(user.userId);
    const order = await this.prisma.digitalHumanOrder.findFirst({
      where: { id, siteId: site.id },
    });
    if (!order) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    if (order.status !== 1) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '只有已支付订单可以退款',
      );
    }
    const refundId = await this.pay.refund({
      site,
      orderNo: order.orderNo,
      refundNo: `R${order.orderNo}`.slice(0, 40),
      totalCents: order.amountCents,
      refundCents: order.amountCents,
      reason: clip(reason, 80),
    });
    const updated = await this.prisma.digitalHumanOrder.updateMany({
      where: { id: order.id, status: 1 },
      data: { status: 2 },
    });
    if (!updated.count) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '订单状态已变化，请刷新后重试',
      );
    }
    await this.revokeAssets(order);
    const fresh = await this.prisma.digitalHumanOrder.findUnique({
      where: { id: order.id },
    });
    if (fresh) await this.commission.clawbackOrder(fresh);
    await this.audit(
      user.userId,
      'dh.order.refund',
      `order=${order.orderNo} ${(order.amountCents / 100).toFixed(2)}元`,
    );
    return {
      ok: true,
      message: refundId
        ? '已发起原路退款，微信处理完成后会通知买家'
        : '订单已标记退款（该单未走线上支付，请线下退回）',
    };
  }

  /** 退款回收已发放资产：扣到 0 为止，差额在流水备注里可见。 */
  private async revokeAssets(order: OrderRow) {
    const snapshot = snapshotOf(order.packageSnapshot, order);
    await this.prisma.$transaction(async (tx) => {
      const member = await tx.digitalHumanMember.findFirst({
        where: { id: order.memberId, siteId: order.siteId },
      });
      if (!member) return;
      const pointCut = Math.min(member.point, snapshot.point);
      const bodyCut = Math.min(member.bodyQuota, snapshot.bodyQuota);
      const voiceCut = Math.min(member.voiceQuota, snapshot.voiceQuota);
      const updated = await tx.digitalHumanMember.update({
        where: { id: member.id },
        data: {
          point: { decrement: pointCut },
          bodyQuota: { decrement: bodyCut },
          voiceQuota: { decrement: voiceCut },
        },
      });
      const logs = [
        { account: 'point', delta: pointCut, after: updated.point },
        { account: 'body', delta: bodyCut, after: updated.bodyQuota },
        { account: 'voice', delta: voiceCut, after: updated.voiceQuota },
      ].filter((item) => item.delta > 0);
      for (const log of logs) {
        await tx.digitalHumanBalanceLog.create({
          data: {
            siteId: order.siteId,
            memberId: member.id,
            account: log.account,
            delta: -log.delta,
            balanceAfter: log.after,
            bizType: 'refund',
            refId: order.id,
            isRefund: true,
            remark: `订单退款回收（应回收 ${log.delta}）`.slice(0, 200),
          },
        });
      }
    });
  }

  // ================= 行映射 =================

  private packageRow(row: PackageRow): DhPackageRow {
    return {
      id: row.id,
      type: packageType(row.type),
      name: row.name,
      priceCents: row.priceCents,
      originalCents: row.originalCents,
      vipDays: row.vipDays,
      point: row.point,
      bodyQuota: row.bodyQuota,
      voiceQuota: row.voiceQuota,
      limitNum: row.limitNum,
      sales: row.sales,
      recommended: row.recommended,
      sort: row.sort,
      enabled: row.enabled,
    };
  }

  private batchRow(
    row: {
      id: number;
      name: string;
      type: string;
      quantity: number;
      vipDays: number;
      point: number;
      bodyQuota: number;
      voiceQuota: number;
      remark: string;
      createdAt: Date;
    },
    usedCount: number,
  ): DhCardBatchRow {
    return {
      id: row.id,
      name: row.name,
      type: packageType(row.type),
      quantity: row.quantity,
      usedCount,
      vipDays: row.vipDays,
      point: row.point,
      bodyQuota: row.bodyQuota,
      voiceQuota: row.voiceQuota,
      remark: row.remark,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private cardRow(
    row: {
      id: number;
      batchId: number;
      code: string;
      type: string;
      vipDays: number;
      point: number;
      bodyQuota: number;
      voiceQuota: number;
      status: string;
      usedByMemberId: number;
      usedAt: Date | null;
      createdAt: Date;
    },
    usedNickname: string,
  ): DhCardRow {
    return {
      id: row.id,
      batchId: row.batchId,
      code: row.code,
      type: row.type,
      vipDays: row.vipDays,
      point: row.point,
      bodyQuota: row.bodyQuota,
      voiceQuota: row.voiceQuota,
      status: row.status,
      usedByMemberId: row.usedByMemberId,
      usedNickname,
      usedAt: row.usedAt ? row.usedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private orderRow(row: OrderRow, nickname: string): DhOrderRow {
    return {
      id: row.id,
      orderNo: row.orderNo,
      memberId: row.memberId,
      nickname,
      packageId: row.packageId,
      packageName: snapshotOf(row.packageSnapshot, row).name,
      type: row.type,
      amountCents: row.amountCents,
      payType: row.payType,
      status: row.status,
      transactionId: row.transactionId,
      paidAt: row.paidAt ? row.paidAt.toISOString() : null,
      promoterId: row.promoterId,
      commission1Cents: row.commission1Cents,
      commission2Cents: row.commission2Cents,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async audit(userId: string, action: string, detail: string) {
    await this.prisma.auditLog
      .create({ data: { userId, action, detail: detail.slice(0, 500) } })
      .catch(() => undefined);
  }
}
