import {
  type HealthPosterRow,
  type HealthPosterSaveBody,
  type HealthPromoteLogRow,
  type HealthPromoterRow,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import {
  audit,
  intIn,
  jsonObj,
  normalizeTrade,
  requireShop,
  requireShopWritable,
  strOf,
  toIso,
} from './health.shared';
import { maskPhone } from './health.views';

const POSTER_TARGETS = new Set([
  'SHOP',
  'SERVICE',
  'GOODS',
  'EXAM',
  'SIGN_PKG',
  'ARTICLE',
]);

/**
 * 推客分销（C11）：申请审核、归因流水与海报模板。
 *
 * 分佣比例存 `rates_json.self`（0 表示按店铺默认），
 * 归因关系与订单金额由 C 端写入（首次进入锁定），本域只做审核与查看。
 */
export class HealthPromoterService {
  constructor(private readonly prisma: PrismaService) {}

  private pager(query: Record<string, unknown>) {
    const page = intIn(query.page, 1, 10_000, 1);
    const pageSize = intIn(query.pageSize, 1, 200, 20);
    return { page, pageSize, skip: (page - 1) * pageSize };
  }

  private rateOf(value: unknown): number {
    return intIn(jsonObj<Record<string, unknown>>(value, {}).self, 0, 50, 0);
  }

  private async promoterRows(
    shopId: number,
    rows: {
      id: number;
      customerId: number;
      name: string;
      phone: string;
      ratesJson: unknown;
      auditStatus: string;
      auditReason: string;
      totalCents: number;
      settledCents: number;
      createdAt: Date;
    }[],
  ): Promise<HealthPromoterRow[]> {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const [relations, logs, shares] = await Promise.all([
      this.prisma.healthPromoterRelation.groupBy({
        by: ['promoterId'],
        where: { shopId, promoterId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.healthPromoteLog.groupBy({
        by: ['promoterId'],
        where: { shopId, promoterId: { in: ids }, kind: 'ORDER' },
        _count: { _all: true },
      }),
      this.prisma.healthOrderShare.groupBy({
        by: ['earnerId'],
        where: {
          shopId,
          earnerKind: 'PROMOTER',
          earnerId: { in: ids },
          status: 'SETTLED',
        },
        _sum: { shareCents: true },
      }),
    ]);
    const relationMap = new Map(
      relations.map((row) => [row.promoterId, row._count._all]),
    );
    const logMap = new Map(
      logs.map((row) => [row.promoterId, row._count._all]),
    );
    const shareMap = new Map(
      shares.map((row) => [row.earnerId, Number(row._sum.shareCents ?? 0)]),
    );
    return rows.map((row) => {
      const earning = shareMap.get(row.id) ?? 0;
      return {
        id: row.id,
        customerId: row.customerId,
        name: row.name || `推客${row.id}`,
        phoneMasked: maskPhone(row.phone),
        auditStatus: (['PENDING', 'APPROVED', 'REJECTED'].includes(
          row.auditStatus,
        )
          ? row.auditStatus
          : 'PENDING') as HealthPromoterRow['auditStatus'],
        auditReason: row.auditReason,
        ratePercent: this.rateOf(row.ratesJson),
        bindCustomerCount: relationMap.get(row.id) ?? 0,
        orderCount: logMap.get(row.id) ?? 0,
        earningCents: earning,
        settleableCents: Math.max(0, earning - row.settledCents),
        createdAt: toIso(row.createdAt),
      };
    });
  }

  async promoters(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<{
    list: HealthPromoterRow[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const { page, pageSize, skip } = this.pager(query);
    const ctx = await requireShop(this.prisma, user, query.shopId, 'promoter');
    const auditStatus = strOf(query.auditStatus, 20, 'all');
    const where = {
      shopId: ctx.shop.id,
      ...(auditStatus && auditStatus !== 'all' ? { auditStatus } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.healthPromoter.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.healthPromoter.count({ where }),
    ]);
    return {
      list: await this.promoterRows(ctx.shop.id, rows),
      total,
      page,
      pageSize,
    };
  }

  async promoterAudit(
    user: CurrentUser,
    body: {
      shopId: number;
      id: number;
      approved: boolean;
      ratePercent: number;
      reason: string;
    },
  ): Promise<HealthPromoterRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'promoter');
    await requireShopWritable(ctx);
    const trade = normalizeTrade(ctx.shop.tradeJson);
    if (!trade.promoterEnabled) {
      throw new BusinessException(
        ErrorCode.FEATURE_CLOSED,
        '店铺未开启推客分销',
      );
    }
    const row = await this.prisma.healthPromoter.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '推客申请不存在');
    if (row.auditStatus === 'APPROVED' && body.approved) {
      throw new BusinessException(ErrorCode.CONFLICT, '该推客已通过审核');
    }
    const rate =
      body.ratePercent > 0 ? body.ratePercent : trade.promoterRatePercent;
    const updated = await this.prisma.healthPromoter.update({
      where: { id: row.id },
      data: {
        auditStatus: body.approved ? 'APPROVED' : 'REJECTED',
        auditReason: body.reason,
        status: body.approved ? 'ON' : 'OFF',
        ratesJson: {
          ...jsonObj<Record<string, unknown>>(row.ratesJson, {}),
          self: rate,
        } as never,
      },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.promoter.audit',
      `shop=${ctx.shop.id} id=${row.id} approved=${body.approved} rate=${rate}`,
    );
    const [mapped] = await this.promoterRows(ctx.shop.id, [updated]);
    return mapped;
  }

  async promoteLogs(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<{
    list: HealthPromoteLogRow[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const { page, pageSize, skip } = this.pager(query);
    const ctx = await requireShop(this.prisma, user, query.shopId, 'promoter');
    const promoterId = intIn(query.promoterId, 0, 1_000_000_000, 0);
    const where = {
      shopId: ctx.shop.id,
      ...(promoterId > 0 ? { promoterId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.healthPromoteLog.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.healthPromoteLog.count({ where }),
    ]);
    if (!rows.length) return { list: [], total, page, pageSize };
    const promoterIds = [...new Set(rows.map((row) => row.promoterId))];
    const customerIds = [
      ...new Set(rows.map((row) => row.customerId).filter((id) => id > 0)),
    ];
    const [promoters, customers] = await Promise.all([
      this.prisma.healthPromoter.findMany({
        where: { shopId: ctx.shop.id, id: { in: promoterIds } },
        select: { id: true, name: true },
      }),
      customerIds.length
        ? this.prisma.healthCustomer.findMany({
            where: { shopId: ctx.shop.id, id: { in: customerIds } },
            select: { id: true, nickname: true, phone: true },
          })
        : [],
    ]);
    const promoterMap = new Map(promoters.map((row) => [row.id, row.name]));
    const customerMap = new Map(customers.map((row) => [row.id, row]));
    return {
      list: rows.map((row) => {
        const customer = customerMap.get(row.customerId);
        return {
          id: row.id,
          promoterId: row.promoterId,
          promoterName: promoterMap.get(row.promoterId) ?? '',
          customerId: row.customerId,
          customerLabel: customer?.nickname || customer?.phone || '',
          targetType: row.kind,
          targetId: row.orderId,
          targetName: row.page,
          orderId: row.orderId,
          commissionCents: row.amountCents,
          createdAt: toIso(row.createdAt),
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  async posters(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthPosterRow[]> {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'promoter');
    const rows = await this.prisma.healthPoster.findMany({
      where: { shopId: ctx.shop.id },
      orderBy: [{ sort: 'asc' }, { id: 'desc' }],
    });
    return rows.map((row) => this.posterRow(row));
  }

  private posterRow(row: {
    id: number;
    name: string;
    bgImage: string;
    layoutJson: unknown;
    refType: string;
    refId: number;
    status: string;
  }): HealthPosterRow {
    const layout = jsonObj<Record<string, unknown>>(row.layoutJson, {});
    const position = jsonObj<Record<string, unknown>>(
      layout.qrcodePosition,
      {},
    );
    return {
      id: row.id,
      name: row.name,
      targetType: (POSTER_TARGETS.has(row.refType)
        ? row.refType
        : 'SHOP') as HealthPosterRow['targetType'],
      targetId: row.refId,
      background: row.bgImage,
      qrcodePosition: {
        x: intIn(position.x, 0, 2000, 300),
        y: intIn(position.y, 0, 4000, 1000),
        size: intIn(position.size, 60, 800, 180),
      },
      titleText: strOf(layout.titleText, 60),
      subtitleText: strOf(layout.subtitleText, 120),
      status: row.status === 'OFF' ? 'OFF' : 'ON',
    };
  }

  async posterSave(
    user: CurrentUser,
    body: HealthPosterSaveBody,
  ): Promise<HealthPosterRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'promoter');
    await requireShopWritable(ctx);
    const data = {
      name: body.name,
      bgImage: body.background,
      layoutJson: {
        qrcodePosition: body.qrcodePosition,
        titleText: body.titleText,
        subtitleText: body.subtitleText,
      } as never,
      refType: body.targetType,
      refId: body.targetId,
      status: body.status,
    };
    let id = body.id;
    if (id > 0) {
      const row = await this.prisma.healthPoster.findFirst({
        where: { id, shopId: ctx.shop.id },
      });
      if (!row)
        throw new BusinessException(ErrorCode.NOT_FOUND, '海报模板不存在');
      await this.prisma.healthPoster.update({ where: { id }, data });
    } else {
      const row = await this.prisma.healthPoster.create({
        data: { ...data, shopId: ctx.shop.id },
      });
      id = row.id;
    }
    await audit(
      this.prisma,
      user.userId,
      'health.poster.save',
      `shop=${ctx.shop.id} id=${id}`,
    );
    return this.posterRow(
      await this.prisma.healthPoster.findUniqueOrThrow({ where: { id } }),
    );
  }

  async posterRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'promoter');
    await requireShopWritable(ctx);
    await this.prisma.healthPoster.deleteMany({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.poster.remove',
      `shop=${ctx.shop.id} id=${body.id}`,
    );
    return { ok: true, message: '海报模板已删除' };
  }
}
