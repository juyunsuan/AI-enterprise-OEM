import {
  PARK_ASSET_STATUS_LABELS,
  PARK_INVOICE_BIZ_LABELS,
  PARK_INVOICE_STATUS_LABELS,
  PARK_METER_TYPE_LABELS,
  PARK_PARKING_STATUS_LABELS,
  PARK_PATROL_STATUS_LABELS,
  PARK_VEHICLE_TYPE_LABELS,
  type ParkAsset,
  type ParkInvoice,
  type ParkMeter,
  type ParkParkingPermit,
  type ParkPatrolPlan,
  type ParkPatrolRecord,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma';
import {
  clip,
  integer,
  iso,
  jsonList,
  pageArgs,
  stringList,
} from './park.helpers';
import type { ParkSiteService } from './park.site.service';

type InvoiceRow = Prisma.ParkInvoiceGetPayload<object>;
type PatrolPlanRow = Prisma.ParkPatrolPlanGetPayload<object>;
type PatrolRecordRow = Prisma.ParkPatrolRecordGetPayload<object>;
type ParkingRow = Prisma.ParkParkingPermitGetPayload<object>;
type AssetRow = Prisma.ParkAssetGetPayload<object>;
type MeterRow = Prisma.ParkMeterReadingGetPayload<object>;
type CustomerRow = Prisma.ParkCustomerGetPayload<object>;

const invoiceView = (row: InvoiceRow): ParkInvoice => ({
  id: row.id,
  siteId: row.siteId,
  bizType: row.bizType as ParkInvoice['bizType'],
  bizLabel: PARK_INVOICE_BIZ_LABELS[row.bizType] || row.bizType,
  bizId: row.bizId,
  customerId: row.customerId,
  tenantId: row.tenantId,
  title: row.title,
  taxNo: row.taxNo,
  amount: Number(row.amount),
  status: row.status as ParkInvoice['status'],
  statusLabel: PARK_INVOICE_STATUS_LABELS[row.status] || row.status,
  issuedAt: iso(row.issuedAt),
  note: row.note,
  createdAt: iso(row.createdAt),
});

const patrolPlanView = (
  row: PatrolPlanRow,
  recordCount: number,
): ParkPatrolPlan => ({
  id: row.id,
  siteId: row.siteId,
  name: row.name,
  points: jsonList(row.points).map((item) => {
    const value = (item || {}) as Record<string, unknown>;
    return { name: clip(value.name, 120), code: clip(value.code, 32) };
  }),
  staffIds: jsonList(row.staffIds)
    .map((item) => Number(item))
    .filter(Boolean),
  status: row.status as ParkPatrolPlan['status'],
  statusLabel: PARK_PATROL_STATUS_LABELS[row.status] || row.status,
  note: row.note,
  recordCount,
  createdAt: iso(row.createdAt),
});

const patrolRecordView = (row: PatrolRecordRow): ParkPatrolRecord => ({
  id: row.id,
  planId: row.planId,
  staffId: row.staffId,
  staffName: row.staffName,
  pointName: row.pointName,
  result: row.result,
  note: row.note,
  images: stringList(row.images),
  createdAt: iso(row.createdAt),
});

const parkingView = (row: ParkingRow): ParkParkingPermit => ({
  id: row.id,
  siteId: row.siteId,
  tenantId: row.tenantId,
  customerId: row.customerId,
  plateNo: row.plateNo,
  vehicleType: row.vehicleType as ParkParkingPermit['vehicleType'],
  vehicleTypeLabel:
    PARK_VEHICLE_TYPE_LABELS[row.vehicleType] || row.vehicleType,
  validFrom: row.validFrom,
  validTo: row.validTo,
  status: row.status as ParkParkingPermit['status'],
  statusLabel: PARK_PARKING_STATUS_LABELS[row.status] || row.status,
  note: row.note,
  createdAt: iso(row.createdAt),
});

const assetView = (row: AssetRow): ParkAsset => ({
  id: row.id,
  siteId: row.siteId,
  name: row.name,
  category: row.category,
  location: row.location,
  status: row.status as ParkAsset['status'],
  statusLabel: PARK_ASSET_STATUS_LABELS[row.status] || row.status,
  assigneeStaffId: row.assigneeStaffId,
  assigneeName: row.assigneeName,
  purchaseDate: row.purchaseDate,
  value: Number(row.value),
  note: row.note,
  createdAt: iso(row.createdAt),
});

const meterView = (row: MeterRow): ParkMeter => ({
  id: row.id,
  siteId: row.siteId,
  meterType: row.meterType as ParkMeter['meterType'],
  meterTypeLabel: PARK_METER_TYPE_LABELS[row.meterType] || row.meterType,
  meterNo: row.meterNo,
  unitId: row.unitId,
  period: row.period,
  reading: Number(row.reading),
  amount: Number(row.amount),
  note: row.note,
  createdAt: iso(row.createdAt),
});

/** 园区可选运营：发票、巡检、停车许可、资产与能耗。 */
export class ParkOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: ParkSiteService,
  ) {}

  private async siteIdsOf(user: CurrentUser) {
    const rows = await this.prisma.parkSite.findMany({
      where: { ownerUserId: user.userId },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  // ---------------------------------------------------------------- 发票

  async invoices(user: CurrentUser, query: Record<string, unknown>) {
    const siteId = integer(query.siteId, 0);
    await this.sites.requireSite(user, siteId);
    const status = clip(query.status, 16);
    const keyword = clip(query.keyword, 60);
    const rows = await this.prisma.parkInvoice.findMany({
      where: {
        siteId,
        ...(status ? { status } : {}),
        ...(keyword
          ? {
              OR: [
                { title: { contains: keyword } },
                { taxNo: { contains: keyword } },
              ],
            }
          : {}),
      },
      orderBy: { id: 'desc' },
    });
    return rows.map(invoiceView);
  }

  async issueInvoice(user: CurrentUser, body: Record<string, unknown>) {
    const siteId = integer(body.siteId, 0);
    await this.sites.requireSite(user, siteId);
    const title = clip(body.title, 160);
    if (!title)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写发票抬头');
    const data = {
      siteId,
      bizType: body.bizType === 'BILL' ? 'BILL' : 'ORDER',
      bizId: integer(body.bizId, 0),
      customerId: integer(body.customerId, 0),
      tenantId: integer(body.tenantId, 0),
      title,
      taxNo: clip(body.taxNo, 32),
      amount: Math.max(0, Number(body.amount) || 0),
      status: body.status === 'VOID' ? 'VOID' : 'ISSUED',
      issuedAt: body.status === 'VOID' ? null : new Date(),
      note: clip(body.note, 500),
    };
    const row = await this.prisma.parkInvoice.create({ data });
    return invoiceView(row);
  }

  async voidInvoice(user: CurrentUser, id: number) {
    const row = await this.prisma.parkInvoice.findFirst({
      where: { id, siteId: { in: await this.siteIdsOf(user) } },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '发票不存在');
    await this.prisma.parkInvoice.update({
      where: { id: row.id },
      data: { status: 'VOID' },
    });
    return { ok: true, message: '已作废' };
  }

  async myInvoices(customer: CustomerRow) {
    const rows = await this.prisma.parkInvoice.findMany({
      where: {
        siteId: customer.siteId,
        OR: [
          { customerId: customer.id },
          ...(customer.tenantId ? [{ tenantId: customer.tenantId }] : []),
        ],
      },
      orderBy: { id: 'desc' },
      take: 100,
    });
    return rows.map(invoiceView);
  }

  // ---------------------------------------------------------------- 巡检

  async patrolPlans(user: CurrentUser, siteId: number) {
    await this.sites.requireSite(user, siteId);
    const rows = await this.prisma.parkPatrolPlan.findMany({
      where: { siteId },
      orderBy: { id: 'desc' },
    });
    const counts = await this.prisma.parkPatrolRecord.groupBy({
      by: ['planId'],
      where: { siteId },
      _count: { _all: true },
    });
    const byId = new Map(counts.map((item) => [item.planId, item._count._all]));
    return rows.map((row) => patrolPlanView(row, byId.get(row.id) || 0));
  }

  async savePatrolPlan(user: CurrentUser, body: Record<string, unknown>) {
    const siteId = integer(body.siteId, 0);
    await this.sites.requireSite(user, siteId);
    const name = clip(body.name, 120);
    const points = jsonList(body.points)
      .map((item) => {
        const value = (item || {}) as Record<string, unknown>;
        return { name: clip(value.name, 120), code: clip(value.code, 32) };
      })
      .filter((item) => item.name);
    if (!name || !points.length) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请填写巡检名称与点位',
      );
    }
    const staffIds = jsonList(body.staffIds)
      .map((item) => integer(item, 0))
      .filter(Boolean);
    const id = integer(body.id, 0);
    const existing = id
      ? await this.prisma.parkPatrolPlan.findFirst({ where: { id, siteId } })
      : null;
    if (id && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '巡检计划不存在');
    }
    const data = {
      name,
      points: points as Prisma.InputJsonValue,
      staffIds: staffIds as Prisma.InputJsonValue,
      status: body.status === 'DISABLED' ? 'DISABLED' : 'ACTIVE',
      note: clip(body.note, 500),
    };
    const row = existing
      ? await this.prisma.parkPatrolPlan.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.parkPatrolPlan.create({ data: { ...data, siteId } });
    const recordCount = await this.prisma.parkPatrolRecord.count({
      where: { planId: row.id },
    });
    return patrolPlanView(row, recordCount);
  }

  async removePatrolPlan(user: CurrentUser, id: number) {
    const row = await this.prisma.parkPatrolPlan.findFirst({
      where: { id, siteId: { in: await this.siteIdsOf(user) } },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '巡检计划不存在');
    await this.prisma.$transaction([
      this.prisma.parkPatrolRecord.deleteMany({ where: { planId: row.id } }),
      this.prisma.parkPatrolPlan.delete({ where: { id: row.id } }),
    ]);
    return { ok: true, message: '已删除' };
  }

  async patrolRecords(user: CurrentUser, query: Record<string, unknown>) {
    const siteId = integer(query.siteId, 0);
    await this.sites.requireSite(user, siteId);
    const { page, pageSize, offset } = pageArgs(query);
    const planId = integer(query.planId, 0);
    const where: Prisma.ParkPatrolRecordWhereInput = {
      siteId,
      ...(planId ? { planId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.parkPatrolRecord.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      this.prisma.parkPatrolRecord.count({ where }),
    ]);
    return { list: rows.map(patrolRecordView), total, page, pageSize };
  }

  async staffPatrolPlans(siteId: number, staffId: number) {
    const rows = await this.prisma.parkPatrolPlan.findMany({
      where: { siteId, status: 'ACTIVE' },
      orderBy: { id: 'desc' },
    });
    return rows
      .filter((row) => {
        const staffIds = jsonList(row.staffIds).map((item) => Number(item));
        return !staffIds.length || staffIds.includes(staffId);
      })
      .map((row) => patrolPlanView(row, 0));
  }

  async staffPatrolRecord(
    siteId: number,
    staff: { id: number; name: string },
    body: Record<string, unknown>,
  ) {
    const planId = integer(body.planId, 0);
    const plan = await this.prisma.parkPatrolPlan.findFirst({
      where: { id: planId, siteId, status: 'ACTIVE' },
    });
    if (!plan)
      throw new BusinessException(ErrorCode.NOT_FOUND, '巡检计划不存在');
    const pointName = clip(body.pointName, 120);
    const points = jsonList(plan.points).map((item) => {
      const value = (item || {}) as Record<string, unknown>;
      return clip(value.name, 120);
    });
    if (!pointName || !points.includes(pointName)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请选择有效的巡检点位',
      );
    }
    const row = await this.prisma.parkPatrolRecord.create({
      data: {
        siteId,
        planId,
        staffId: staff.id,
        staffName: clip(staff.name, 60),
        pointName,
        result: body.result === 'ABNORMAL' ? 'ABNORMAL' : 'NORMAL',
        note: clip(body.note, 500),
        images: stringList(body.images),
      },
    });
    return patrolRecordView(row);
  }

  // ---------------------------------------------------------------- 停车许可

  async parkingPermits(user: CurrentUser, query: Record<string, unknown>) {
    const siteId = integer(query.siteId, 0);
    await this.sites.requireSite(user, siteId);
    const status = clip(query.status, 16);
    const keyword = clip(query.keyword, 60);
    const rows = await this.prisma.parkParkingPermit.findMany({
      where: {
        siteId,
        ...(status ? { status } : {}),
        ...(keyword ? { plateNo: { contains: keyword } } : {}),
      },
      orderBy: { id: 'desc' },
    });
    return rows.map(parkingView);
  }

  async parkingAction(user: CurrentUser, body: Record<string, unknown>) {
    const id = integer(body.id, 0);
    const row = await this.prisma.parkParkingPermit.findUnique({
      where: { id },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '停车许可不存在');
    await this.sites.requireSite(user, row.siteId);
    if (row.status !== 'PENDING') {
      throw new BusinessException(ErrorCode.CONFLICT, '该申请已处理');
    }
    const status = body.action === 'approve' ? 'APPROVED' : 'REJECTED';
    const updated = await this.prisma.parkParkingPermit.update({
      where: { id: row.id },
      data: { status, note: clip(body.note, 500) || row.note },
    });
    return parkingView(updated);
  }

  async myParking(customer: CustomerRow) {
    const rows = await this.prisma.parkParkingPermit.findMany({
      where: {
        siteId: customer.siteId,
        OR: [
          { customerId: customer.id },
          ...(customer.tenantId ? [{ tenantId: customer.tenantId }] : []),
        ],
      },
      orderBy: { id: 'desc' },
    });
    return rows.map(parkingView);
  }

  async applyParking(
    site: { id: number },
    customer: CustomerRow,
    body: Record<string, unknown>,
  ) {
    const plateNo = clip(body.plateNo, 20).toUpperCase();
    if (!plateNo)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写车牌号');
    const exists = await this.prisma.parkParkingPermit.findFirst({
      where: {
        siteId: site.id,
        plateNo,
        status: { in: ['PENDING', 'APPROVED'] },
      },
    });
    if (exists) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该车牌已有在办/有效许可',
      );
    }
    const row = await this.prisma.parkParkingPermit.create({
      data: {
        siteId: site.id,
        tenantId: customer.tenantId,
        customerId: customer.id,
        plateNo,
        vehicleType: ['CAR', 'BIKE', 'TRUCK'].includes(String(body.vehicleType))
          ? String(body.vehicleType)
          : 'CAR',
        validFrom: clip(body.validFrom, 10),
        validTo: clip(body.validTo, 10),
        note: clip(body.note, 500),
        status: 'PENDING',
      },
    });
    return parkingView(row);
  }

  // ---------------------------------------------------------------- 资产

  async assets(user: CurrentUser, siteId: number) {
    await this.sites.requireSite(user, siteId);
    const rows = await this.prisma.parkAsset.findMany({
      where: { siteId },
      orderBy: { id: 'desc' },
    });
    return rows.map(assetView);
  }

  async saveAsset(user: CurrentUser, body: Record<string, unknown>) {
    const siteId = integer(body.siteId, 0);
    await this.sites.requireSite(user, siteId);
    const name = clip(body.name, 120);
    if (!name)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写资产名称');
    const id = integer(body.id, 0);
    const existing = id
      ? await this.prisma.parkAsset.findFirst({ where: { id, siteId } })
      : null;
    if (id && !existing)
      throw new BusinessException(ErrorCode.NOT_FOUND, '资产不存在');
    const data = {
      name,
      category: clip(body.category, 40) || 'EQUIPMENT',
      location: clip(body.location, 200),
      status: ['IN_USE', 'IDLE', 'REPAIRED', 'SCRAPPED'].includes(
        String(body.status),
      )
        ? String(body.status)
        : 'IN_USE',
      assigneeStaffId: integer(body.assigneeStaffId, 0),
      assigneeName: clip(body.assigneeName, 60),
      purchaseDate: clip(body.purchaseDate, 10),
      value: Math.max(0, Number(body.value) || 0),
      note: clip(body.note, 500),
    };
    const row = existing
      ? await this.prisma.parkAsset.update({ where: { id: existing.id }, data })
      : await this.prisma.parkAsset.create({ data: { ...data, siteId } });
    return assetView(row);
  }

  async removeAsset(user: CurrentUser, id: number) {
    const row = await this.prisma.parkAsset.findFirst({
      where: { id, siteId: { in: await this.siteIdsOf(user) } },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '资产不存在');
    await this.prisma.parkAsset.delete({ where: { id: row.id } });
    return { ok: true, message: '已删除' };
  }

  // ---------------------------------------------------------------- 能耗

  async meters(user: CurrentUser, siteId: number) {
    await this.sites.requireSite(user, siteId);
    const rows = await this.prisma.parkMeterReading.findMany({
      where: { siteId },
      orderBy: [{ period: 'desc' }, { id: 'desc' }],
    });
    return rows.map(meterView);
  }

  async saveMeter(user: CurrentUser, body: Record<string, unknown>) {
    const siteId = integer(body.siteId, 0);
    await this.sites.requireSite(user, siteId);
    const period = clip(body.period, 10);
    if (!period)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写抄表周期');
    const id = integer(body.id, 0);
    const existing = id
      ? await this.prisma.parkMeterReading.findFirst({ where: { id, siteId } })
      : null;
    if (id && !existing)
      throw new BusinessException(ErrorCode.NOT_FOUND, '抄表记录不存在');
    const data = {
      meterType: ['WATER', 'ELECTRIC', 'GAS'].includes(String(body.meterType))
        ? String(body.meterType)
        : 'ELECTRIC',
      meterNo: clip(body.meterNo, 40),
      unitId: integer(body.unitId, 0),
      period,
      reading: Math.max(0, Number(body.reading) || 0),
      amount: Math.max(0, Number(body.amount) || 0),
      note: clip(body.note, 500),
    };
    const row = existing
      ? await this.prisma.parkMeterReading.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.parkMeterReading.create({
          data: { ...data, siteId },
        });
    return meterView(row);
  }

  async removeMeter(user: CurrentUser, id: number) {
    const row = await this.prisma.parkMeterReading.findFirst({
      where: { id, siteId: { in: await this.siteIdsOf(user) } },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '抄表记录不存在');
    await this.prisma.parkMeterReading.delete({ where: { id: row.id } });
    return { ok: true, message: '已删除' };
  }
}
