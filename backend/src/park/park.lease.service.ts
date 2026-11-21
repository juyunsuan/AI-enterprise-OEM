import {
  type ParkBill,
  type ParkBillGenerateBody,
  type ParkLease,
  type ParkLeaseInput,
} from '@enterprise/contracts';
import { allocateNo } from '../common/document-number';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma';
import type { HrmScopeService } from '../hrm/hrm.scope';
import type { ErpWritePort } from '../erp/erp-write-port';
import {
  billStatusLabel,
  clip,
  integer,
  iso,
  leaseStatusLabel,
  pageArgs,
} from './park.helpers';
import type { ParkSiteService } from './park.site.service';

type LeaseRow = Prisma.ParkLeaseGetPayload<object>;
type BillRow = Prisma.ParkBillGetPayload<object>;
type CustomerRow = Prisma.ParkCustomerGetPayload<object>;

const leaseView = (
  row: LeaseRow,
  tenantName: string,
  billCount: number,
): ParkLease => ({
  id: row.id,
  siteId: row.siteId,
  tenantId: row.tenantId,
  tenantName,
  title: row.title,
  startDate: row.startDate,
  endDate: row.endDate,
  rentAmount: Number(row.rentAmount),
  deposit: Number(row.deposit),
  billingCycle: row.billingCycle,
  status: row.status as ParkLease['status'],
  statusLabel: leaseStatusLabel(row.status),
  note: row.note,
  billCount,
  createdAt: iso(row.createdAt),
});

const billView = (row: BillRow, tenantName: string): ParkBill => ({
  id: row.id,
  siteId: row.siteId,
  leaseId: row.leaseId,
  tenantId: row.tenantId,
  tenantName,
  billNo: row.billNo,
  periodStart: row.periodStart,
  periodEnd: row.periodEnd,
  dueDate: row.dueDate,
  amount: Number(row.amount),
  status: row.status as ParkBill['status'],
  statusLabel: billStatusLabel(row.status),
  paidAt: iso(row.paidAt),
  erpReceivableId: row.erpReceivableId,
  note: row.note,
  createdAt: iso(row.createdAt),
});

/** 园区租约与周期账单；账单可选同步 ERP 应收（只经 ErpWritePort）。 */
export class ParkLeaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: ParkSiteService,
    private readonly hrmScope: HrmScopeService,
    private readonly erpWrite: ErpWritePort,
  ) {}

  async leases(
    user: CurrentUser,
    siteId: number,
    query: Record<string, unknown>,
  ) {
    await this.sites.requireSite(user, siteId);
    const status = clip(query.status, 16);
    const keyword = clip(query.keyword, 60);
    const rows = await this.prisma.parkLease.findMany({
      where: {
        siteId,
        ...(status ? { status } : {}),
        ...(keyword ? { title: { contains: keyword } } : {}),
      },
      orderBy: { id: 'desc' },
    });
    const [tenants, counts] = await Promise.all([
      this.prisma.parkTenant.findMany({
        where: { siteId },
        select: { id: true, name: true },
      }),
      this.prisma.parkBill.groupBy({
        by: ['leaseId'],
        where: { siteId },
        _count: { _all: true },
      }),
    ]);
    const tenantNames = new Map(tenants.map((item) => [item.id, item.name]));
    const billCounts = new Map(
      counts.map((item) => [item.leaseId, item._count._all]),
    );
    return rows.map((row) =>
      leaseView(
        row,
        tenantNames.get(row.tenantId) || '',
        billCounts.get(row.id) || 0,
      ),
    );
  }

  async saveLease(user: CurrentUser, body: ParkLeaseInput) {
    const site = await this.sites.requireSite(user, body.siteId);
    const tenant = await this.prisma.parkTenant.findFirst({
      where: { id: body.tenantId, siteId: site.id },
    });
    if (!tenant) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '租户不存在');
    }
    const id = integer(body.id, 0);
    const existing = id
      ? await this.prisma.parkLease.findFirst({
          where: { id, siteId: site.id },
        })
      : null;
    if (id && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '租约不存在');
    }
    const data = {
      tenantId: tenant.id,
      title: clip(body.title, 160),
      startDate: clip(body.startDate, 10),
      endDate: clip(body.endDate, 10),
      rentAmount: Math.max(0, Number(body.rentAmount) || 0),
      deposit: Math.max(0, Number(body.deposit) || 0),
      billingCycle: body.billingCycle,
      status: body.status,
      note: clip(body.note, 500),
    };
    if (!data.title || !data.startDate || !data.endDate) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请填写租约名称与起止日期',
      );
    }
    const row = existing
      ? await this.prisma.parkLease.update({ where: { id: existing.id }, data })
      : await this.prisma.parkLease.create({
          data: { ...data, siteId: site.id },
        });
    const billCount = await this.prisma.parkBill.count({
      where: { leaseId: row.id },
    });
    return leaseView(row, tenant.name, billCount);
  }

  async setLeaseStatus(user: CurrentUser, id: number, status: string) {
    const row = await this.prisma.parkLease.findFirst({
      where: { id, siteId: { in: await this.siteIdsOf(user) } },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '租约不存在');
    }
    const updated = await this.prisma.parkLease.update({
      where: { id: row.id },
      data: { status },
    });
    const tenant = await this.prisma.parkTenant.findFirst({
      where: { id: row.tenantId, siteId: row.siteId },
    });
    const billCount = await this.prisma.parkBill.count({
      where: { leaseId: row.id },
    });
    return leaseView(updated, tenant?.name || '', billCount);
  }

  async removeLease(user: CurrentUser, id: number) {
    const row = await this.prisma.parkLease.findFirst({
      where: { id, siteId: { in: await this.siteIdsOf(user) } },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '租约不存在');
    }
    const billCount = await this.prisma.parkBill.count({
      where: { leaseId: row.id },
    });
    if (billCount > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该租约已有账单，请先处理账单后再删除',
      );
    }
    await this.prisma.parkLease.delete({ where: { id: row.id } });
    return { ok: true, message: '已删除' };
  }

  /** 自动出账：按月/季/年周期生成当期账单；唯一键保证重复执行不重复出账。 */
  async runScheduledBilling(now = new Date()) {
    const leases = await this.prisma.parkLease.findMany({
      where: { status: 'ACTIVE' },
    });
    let generated = 0;
    let skipped = 0;
    for (const lease of leases) {
      if (Number(lease.rentAmount) <= 0) {
        skipped += 1;
        continue;
      }
      const period = this.periodOf(lease.billingCycle, now);
      if (lease.endDate < period.start || lease.startDate > period.end) {
        skipped += 1;
        continue;
      }
      const exists = await this.prisma.parkBill.findUnique({
        where: {
          leaseId_periodStart: {
            leaseId: lease.id,
            periodStart: period.start,
          },
        },
      });
      if (exists) {
        skipped += 1;
        continue;
      }
      const site = await this.prisma.parkSite.findUnique({
        where: { id: lease.siteId },
        select: { ownerUserId: true },
      });
      if (!site) {
        skipped += 1;
        continue;
      }
      try {
        await this.generateBill(
          new CurrentUser(site.ownerUserId, 'park', 'user'),
          {
            leaseId: lease.id,
            periodStart: period.start,
            periodEnd: period.end,
            dueDate: period.dueDate,
            note: '自动出账',
          },
        );
        generated += 1;
      } catch {
        skipped += 1;
      }
    }
    return { generated, skipped };
  }

  private periodOf(cycle: string, now: Date) {
    const year = now.getFullYear();
    const month = now.getMonth();
    const startMonth =
      cycle === 'YEAR'
        ? 0
        : cycle === 'QUARTER'
          ? Math.floor(month / 3) * 3
          : month;
    const months = cycle === 'YEAR' ? 12 : cycle === 'QUARTER' ? 3 : 1;
    const start = new Date(year, startMonth, 1);
    const end = new Date(year, startMonth + months, 0);
    const due = new Date(start);
    due.setDate(due.getDate() + 5);
    const fmt = (value: Date) =>
      `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
        value.getDate(),
      ).padStart(2, '0')}`;
    return { start: fmt(start), end: fmt(end), dueDate: fmt(due) };
  }

  async bills(user: CurrentUser, query: Record<string, unknown>) {
    const siteId = integer(query.siteId, 0);
    await this.sites.requireSite(user, siteId);
    const { page, pageSize, offset } = pageArgs(query);
    const leaseId = integer(query.leaseId, 0);
    const status = clip(query.status, 16);
    const keyword = clip(query.keyword, 60);
    const where: Prisma.ParkBillWhereInput = {
      siteId,
      ...(leaseId ? { leaseId } : {}),
      ...(status ? { status } : {}),
      ...(keyword ? { billNo: { contains: keyword } } : {}),
    };
    const [rows, total, tenants] = await Promise.all([
      this.prisma.parkBill.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      this.prisma.parkBill.count({ where }),
      this.prisma.parkTenant.findMany({
        where: { siteId },
        select: { id: true, name: true },
      }),
    ]);
    const tenantNames = new Map(tenants.map((item) => [item.id, item.name]));
    return {
      list: rows.map((row) =>
        billView(row, tenantNames.get(row.tenantId) || ''),
      ),
      total,
      page,
      pageSize,
    };
  }

  async generateBill(user: CurrentUser, body: ParkBillGenerateBody) {
    const lease = await this.prisma.parkLease.findUnique({
      where: { id: body.leaseId },
    });
    if (!lease) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '租约不存在');
    }
    await this.sites.requireSite(user, lease.siteId);
    if (lease.status !== 'ACTIVE') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '只有生效中的租约可以出账',
      );
    }
    const tenant = await this.prisma.parkTenant.findFirst({
      where: { id: lease.tenantId, siteId: lease.siteId },
    });
    if (!tenant) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '租户不存在');
    }
    const duplicate = await this.prisma.parkBill.findUnique({
      where: {
        leaseId_periodStart: {
          leaseId: lease.id,
          periodStart: body.periodStart,
        },
      },
    });
    if (duplicate) {
      throw new BusinessException(ErrorCode.CONFLICT, '该周期账单已存在');
    }
    const amount = Math.max(
      0,
      Number(body.amount ?? Number(lease.rentAmount)) || 0,
    );
    const row = await this.prisma.$transaction(async (tx) => {
      const billNo = await allocateNo(tx, 'PB', new Date(), {
        table: 'park_bills',
        column: 'bill_no',
      });
      return tx.parkBill.create({
        data: {
          siteId: lease.siteId,
          leaseId: lease.id,
          tenantId: lease.tenantId,
          billNo,
          periodStart: body.periodStart,
          periodEnd: body.periodEnd,
          dueDate: body.dueDate,
          amount,
          status: 'OPEN',
          note: clip(body.note, 500),
        },
      });
    });
    let erpReceivableId = 0;
    let note = row.note;
    try {
      const org = await this.hrmScope.resolve(user);
      erpReceivableId = await this.erpWrite.syncContractReceivable(org, {
        // ERP 应收按来源单据幂等：园区账单自己就是来源，用 bill.id 作为 sourceId。
        contractId: row.id,
        customerId: 0,
        customerName: tenant.name,
        amount,
        dueDate: body.dueDate,
        note: `园区账单 ${row.billNo} ${row.periodStart}~${row.periodEnd}`.slice(
          0,
          500,
        ),
      });
    } catch (error) {
      note = clip(
        `ERP 应收同步失败：${error instanceof Error ? error.message : '未知错误'}`,
        500,
      );
    }
    const saved =
      erpReceivableId || note !== row.note
        ? await this.prisma.parkBill.update({
            where: { id: row.id },
            data: { erpReceivableId, note },
          })
        : row;
    return billView(saved, tenant.name);
  }

  async billAction(user: CurrentUser, id: number, action: string, note = '') {
    const row = await this.prisma.parkBill.findUnique({ where: { id } });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '账单不存在');
    }
    await this.sites.requireSite(user, row.siteId);
    if (action === 'paid') {
      if (row.status !== 'OPEN' && row.status !== 'OVERDUE') {
        throw new BusinessException(ErrorCode.CONFLICT, '当前账单不能收款');
      }
      const updated = await this.prisma.parkBill.update({
        where: { id: row.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          note: clip(note, 500) || row.note,
        },
      });
      return billView(updated, '');
    }
    if (action === 'cancel') {
      if (row.status === 'PAID') {
        throw new BusinessException(ErrorCode.CONFLICT, '已收款账单不能取消');
      }
      const updated = await this.prisma.parkBill.update({
        where: { id: row.id },
        data: { status: 'CANCELED', note: clip(note, 500) || row.note },
      });
      return billView(updated, '');
    }
    throw new BusinessException(ErrorCode.BAD_REQUEST, '操作不合法');
  }

  async myBills(customer: CustomerRow) {
    if (!customer.tenantId) return [];
    const rows = await this.prisma.parkBill.findMany({
      where: { siteId: customer.siteId, tenantId: customer.tenantId },
      orderBy: { id: 'desc' },
      take: 100,
    });
    const tenant = await this.prisma.parkTenant.findFirst({
      where: { id: customer.tenantId, siteId: customer.siteId },
    });
    return rows.map((row) => billView(row, tenant?.name || ''));
  }

  async myBillDetail(customer: CustomerRow, id: number) {
    if (!customer.tenantId) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '账单不存在');
    }
    const row = await this.prisma.parkBill.findFirst({
      where: { id, siteId: customer.siteId, tenantId: customer.tenantId },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '账单不存在');
    }
    const tenant = await this.prisma.parkTenant.findFirst({
      where: { id: customer.tenantId, siteId: customer.siteId },
    });
    return billView(row, tenant?.name || '');
  }

  private async siteIdsOf(user: CurrentUser) {
    const rows = await this.prisma.parkSite.findMany({
      where: { ownerUserId: user.userId },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }
}
