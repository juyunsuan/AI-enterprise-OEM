import {
  type ParkWorkOrder,
  type ParkWorkOrderDetail,
} from '@enterprise/contracts';
import { allocateNo } from '../common/document-number';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma';
import {
  clip,
  integer,
  iso,
  pageArgs,
  stringList,
  workOrderCategoryLabel,
  workOrderStatusLabel,
} from './park.helpers';
import type { ParkSiteService } from './park.site.service';
import type { ParkNotifyService } from './park.notify.service';
import type { ParkOrderService } from './park.order.service';

type Row = Prisma.ParkWorkOrderGetPayload<object>;
type LogRow = Prisma.ParkWorkOrderLogGetPayload<object>;
type CustomerRow = Prisma.ParkCustomerGetPayload<object>;

const view = (row: Row): ParkWorkOrder => ({
  id: row.id,
  siteId: row.siteId,
  orderNo: row.orderNo,
  category: row.category as ParkWorkOrder['category'],
  categoryLabel: workOrderCategoryLabel(row.category),
  title: row.title,
  reporterName: row.reporterName,
  reporterPhone: row.reporterPhone,
  buildingId: row.buildingId,
  unitId: row.unitId,
  location: row.location,
  urgency: row.urgency,
  status: row.status as ParkWorkOrder['status'],
  statusLabel: workOrderStatusLabel(row.status),
  assigneeStaffId: row.assigneeStaffId,
  assigneeName: row.assigneeName,
  rating: row.rating,
  finishedAt: iso(row.finishedAt),
  createdAt: iso(row.createdAt),
});

const detail = (row: Row, logs: LogRow[]): ParkWorkOrderDetail => ({
  ...view(row),
  description: row.description,
  images: stringList(row.images),
  result: row.result,
  feeAmount: Number(row.feeAmount),
  ratingComment: row.ratingComment,
  logs: logs.map((item) => ({
    id: item.id,
    action: item.action,
    operatorName: item.operatorName,
    note: item.note,
    createdAt: iso(item.createdAt),
  })),
});

export type ParkWorkOrderCreate = {
  category?: string;
  title: string;
  description?: string;
  images?: string[];
  buildingId?: number;
  unitId?: number;
  location?: string;
  urgency?: string;
};

const categoryOf = (value: unknown): string =>
  ['REPAIR', 'COMPLAINT', 'CLEANING', 'OTHER'].includes(String(value))
    ? String(value)
    : 'REPAIR';

const urgencyOf = (value: unknown): string =>
  ['LOW', 'NORMAL', 'HIGH'].includes(String(value)) ? String(value) : 'NORMAL';

/** 园区工单：报修/投诉/保洁，派单、处理、完成、评价。 */
export class ParkWorkOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: ParkSiteService,
    private readonly notify: ParkNotifyService,
    private readonly orders: ParkOrderService,
  ) {}

  async create(
    site: { id: number },
    customer: CustomerRow,
    input: ParkWorkOrderCreate,
  ) {
    const title = clip(input.title, 120);
    if (!title) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写工单标题');
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const orderNo = await allocateNo(tx, 'PW', new Date(), {
        table: 'park_work_orders',
        column: 'order_no',
      });
      const created = await tx.parkWorkOrder.create({
        data: {
          siteId: site.id,
          orderNo,
          customerId: customer.id,
          tenantId: customer.tenantId,
          reporterName: customer.nickname || clip(input.title, 60),
          reporterPhone: clip(customer.phone, 32),
          category: categoryOf(input.category),
          title,
          description: clip(input.description, 5000),
          images: (input.images || []).slice(0, 9),
          buildingId: integer(input.buildingId, 0),
          unitId: integer(input.unitId, 0),
          location: clip(input.location, 200),
          urgency: urgencyOf(input.urgency),
          status: 'PENDING',
        },
      });
      await tx.parkWorkOrderLog.create({
        data: {
          orderId: created.id,
          action: 'SUBMIT',
          operatorType: 'CUSTOMER',
          operatorId: customer.id,
          operatorName: customer.nickname || '',
          note: '租户提交工单',
        },
      });
      return created;
    });
    return view(row);
  }

  async my(customer: CustomerRow) {
    const rows = await this.prisma.parkWorkOrder.findMany({
      where: { siteId: customer.siteId, customerId: customer.id },
      orderBy: { id: 'desc' },
      take: 100,
    });
    return rows.map(view);
  }

  async myDetail(customer: CustomerRow, id: number) {
    const row = await this.prisma.parkWorkOrder.findFirst({
      where: { id, siteId: customer.siteId, customerId: customer.id },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '工单不存在');
    }
    const logs = await this.prisma.parkWorkOrderLog.findMany({
      where: { orderId: row.id },
      orderBy: { id: 'asc' },
    });
    return detail(row, logs);
  }

  async rate(customer: CustomerRow, id: number, rating: number, comment = '') {
    const row = await this.prisma.parkWorkOrder.findFirst({
      where: { id, siteId: customer.siteId, customerId: customer.id },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '工单不存在');
    }
    if (!['DONE', 'CLOSED'].includes(row.status)) {
      throw new BusinessException(ErrorCode.CONFLICT, '工单完成后才能评价');
    }
    const updated = await this.prisma.parkWorkOrder.update({
      where: { id: row.id },
      data: {
        rating: Math.min(5, Math.max(1, integer(rating, 5))),
        ratingComment: clip(comment, 300),
        status: 'CLOSED',
      },
    });
    return view(updated);
  }

  async staffList(siteId: number, query: Record<string, unknown>) {
    const { page, pageSize, offset } = pageArgs(query);
    const category = clip(query.category, 24);
    const status = clip(query.status, 16);
    const keyword = clip(query.keyword, 60);
    const where: Prisma.ParkWorkOrderWhereInput = {
      siteId,
      ...(category ? { category } : {}),
      ...(status ? { status } : {}),
      ...(keyword
        ? {
            OR: [
              { title: { contains: keyword } },
              { orderNo: { contains: keyword } },
              { reporterName: { contains: keyword } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.parkWorkOrder.findMany({
        where,
        orderBy: [{ status: 'asc' }, { id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.parkWorkOrder.count({ where }),
    ]);
    return { list: rows.map(view), total, page, pageSize };
  }

  async staffDetail(siteId: number, id: number) {
    const row = await this.prisma.parkWorkOrder.findFirst({
      where: { id, siteId },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '工单不存在');
    }
    const logs = await this.prisma.parkWorkOrderLog.findMany({
      where: { orderId: row.id },
      orderBy: { id: 'asc' },
    });
    return detail(row, logs);
  }

  async assign(siteId: number, id: number, staffId: number, note = '') {
    const row = await this.prisma.parkWorkOrder.findFirst({
      where: { id, siteId },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '工单不存在');
    }
    if (['DONE', 'CLOSED', 'CANCELED'].includes(row.status)) {
      throw new BusinessException(ErrorCode.CONFLICT, '该工单已结束，不能派单');
    }
    const staff = await this.prisma.parkStaff.findFirst({
      where: { id: staffId, siteId, status: 'ACTIVE' },
    });
    if (!staff) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '员工不存在或已停用');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.parkWorkOrder.update({
        where: { id: row.id },
        data: {
          assigneeStaffId: staff.id,
          assigneeName: staff.name,
          status: 'ASSIGNED',
        },
      });
      await tx.parkWorkOrderLog.create({
        data: {
          orderId: row.id,
          action: 'ASSIGN',
          operatorType: 'STAFF',
          operatorId: staff.id,
          operatorName: staff.name,
          note: clip(note, 500) || `派单给 ${staff.name}`,
        },
      });
      return saved;
    });
    return this.staffDetail(siteId, updated.id);
  }

  async staffAct(
    siteId: number,
    staffId: number,
    id: number,
    action: string,
    input: {
      note?: string;
      result?: string;
      images?: string[];
      feeAmount?: number;
    } = {},
  ) {
    const row = await this.prisma.parkWorkOrder.findFirst({
      where: { id, siteId },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '工单不存在');
    }
    const staff = await this.prisma.parkStaff.findFirst({
      where: { id: staffId, siteId, status: 'ACTIVE' },
    });
    if (!staff) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '员工身份无效');
    }
    const next = this.nextStatus(row.status, action);
    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.parkWorkOrder.update({
        where: { id: row.id },
        data: {
          status: next,
          ...(action === 'done'
            ? {
                result: clip(input.result, 3000),
                finishedAt: new Date(),
              }
            : {}),
          ...(action === 'accept' || action === 'process'
            ? { assigneeStaffId: staff.id, assigneeName: staff.name }
            : {}),
        },
      });
      await tx.parkWorkOrderLog.create({
        data: {
          orderId: row.id,
          action: action.toUpperCase(),
          operatorType: 'STAFF',
          operatorId: staff.id,
          operatorName: staff.name,
          note: clip(input.note, 500) || clip(input.result, 500),
          images: (input.images || []).slice(0, 9),
        },
      });
      return saved;
    });
    if (action === 'done') {
      await this.notifyDone(updated);
      await this.orders.createWorkOrderOrder({
        siteId,
        customerId: updated.customerId,
        tenantId: updated.tenantId,
        workOrderId: updated.id,
        title: `工单费用：${updated.title}`,
        amount: Number(input.feeAmount || 0),
      });
    }
    return this.staffDetail(siteId, updated.id);
  }

  async adminList(user: CurrentUser, query: Record<string, unknown>) {
    const siteId = integer(query.siteId, 0);
    await this.sites.requireSite(user, siteId);
    return this.staffList(siteId, query);
  }

  async adminDetail(user: CurrentUser, id: number) {
    const row = await this.prisma.parkWorkOrder.findUnique({ where: { id } });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '工单不存在');
    }
    await this.sites.requireSite(user, row.siteId);
    const logs = await this.prisma.parkWorkOrderLog.findMany({
      where: { orderId: row.id },
      orderBy: { id: 'asc' },
    });
    return detail(row, logs);
  }

  async adminAssign(user: CurrentUser, id: number, staffId: number, note = '') {
    const row = await this.prisma.parkWorkOrder.findUnique({ where: { id } });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '工单不存在');
    }
    await this.sites.requireSite(user, row.siteId);
    return this.assign(row.siteId, id, staffId, note);
  }

  async adminAct(
    user: CurrentUser,
    id: number,
    action: string,
    input: {
      note?: string;
      result?: string;
      images?: string[];
      feeAmount?: number;
    } = {},
  ) {
    const row = await this.prisma.parkWorkOrder.findUnique({ where: { id } });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '工单不存在');
    }
    await this.sites.requireSite(user, row.siteId);
    const next = this.nextStatus(row.status, action);
    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.parkWorkOrder.update({
        where: { id: row.id },
        data: {
          status: next,
          ...(action === 'done'
            ? {
                result: clip(input.result, 3000),
                finishedAt: new Date(),
              }
            : {}),
        },
      });
      await tx.parkWorkOrderLog.create({
        data: {
          orderId: row.id,
          action: action.toUpperCase(),
          operatorType: 'ADMIN',
          operatorId: 0,
          operatorName: user.actorUserId || user.userId,
          note: clip(input.note, 500) || clip(input.result, 500),
          images: (input.images || []).slice(0, 9),
        },
      });
      return saved;
    });
    if (action === 'done') {
      await this.notifyDone(updated);
      await this.orders.createWorkOrderOrder({
        siteId: updated.siteId,
        customerId: updated.customerId,
        tenantId: updated.tenantId,
        workOrderId: updated.id,
        title: `工单费用：${updated.title}`,
        amount: Number(input.feeAmount || 0),
      });
    }
    return this.adminDetail(user, updated.id);
  }

  private async notifyDone(row: Row) {
    if (!row.customerId) return;
    const customer = await this.prisma.parkCustomer.findFirst({
      where: { id: row.customerId, siteId: row.siteId },
      select: { openid: true },
    });
    if (!customer) return;
    void this.notify.notify(
      row.siteId,
      customer,
      'parkWork',
      '/pages/repair/list',
      [row.title, '已完成', iso(new Date())],
    );
  }

  private nextStatus(current: string, action: string): string {
    if (action === 'accept') {
      if (current !== 'ASSIGNED') {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '只有已派单的工单可以接单',
        );
      }
      return 'PROCESSING';
    }
    if (action === 'process') {
      if (!['ASSIGNED', 'PROCESSING'].includes(current)) {
        throw new BusinessException(ErrorCode.CONFLICT, '当前状态不能开始处理');
      }
      return 'PROCESSING';
    }
    if (action === 'done') {
      if (current !== 'PROCESSING') {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '只有处理中的工单可以完成',
        );
      }
      return 'DONE';
    }
    if (action === 'close') {
      if (!['DONE', 'PROCESSING'].includes(current)) {
        throw new BusinessException(ErrorCode.CONFLICT, '当前状态不能关闭');
      }
      return 'CLOSED';
    }
    if (action === 'cancel') {
      if (['DONE', 'CLOSED', 'CANCELED'].includes(current)) {
        throw new BusinessException(ErrorCode.CONFLICT, '该工单已结束');
      }
      return 'CANCELED';
    }
    throw new BusinessException(ErrorCode.BAD_REQUEST, '操作不合法');
  }
}
