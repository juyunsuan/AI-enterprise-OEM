import { type ParkOrder } from '@enterprise/contracts';
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
  orderBizLabel,
  orderStatusLabel,
  pageArgs,
} from './park.helpers';
import type { ParkSiteService } from './park.site.service';
import type { ParkPayService } from './park.pay.service';

type Row = Prisma.ParkOrderGetPayload<object>;
type CustomerRow = Prisma.ParkCustomerGetPayload<object>;

const view = (row: Row): ParkOrder => ({
  id: row.id,
  orderNo: row.orderNo,
  siteId: row.siteId,
  customerId: row.customerId,
  tenantId: row.tenantId,
  bizType: row.bizType as ParkOrder['bizType'],
  bizLabel: orderBizLabel(row.bizType),
  bizId: row.bizId,
  title: row.title,
  amount: Number(row.amount),
  status: row.status as ParkOrder['status'],
  statusLabel: orderStatusLabel(row.status),
  payMethod: row.payMethod,
  paidAt: iso(row.paidAt),
  note: row.note,
  createdAt: iso(row.createdAt),
});

/** 园区订单：场地预约费用先落地，线下收款闭环；微信支付后续接统一支付客户端。 */
export class ParkOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: ParkSiteService,
    private readonly pay: ParkPayService,
  ) {}

  async createVenueOrder(input: {
    siteId: number;
    customerId: number;
    tenantId: number;
    reservationId: number;
    title: string;
    amount: number;
  }) {
    const amount = Math.max(0, Number(input.amount) || 0);
    if (amount <= 0) return null;
    const existing = await this.prisma.parkOrder.findFirst({
      where: {
        siteId: input.siteId,
        bizType: 'VENUE',
        bizId: input.reservationId,
        status: { in: ['PENDING', 'PAID'] },
      },
    });
    if (existing) return view(existing);
    const row = await this.prisma.$transaction(async (tx) => {
      const orderNo = await allocateNo(tx, 'PO', new Date(), {
        table: 'park_orders',
        column: 'order_no',
      });
      return tx.parkOrder.create({
        data: {
          orderNo,
          siteId: input.siteId,
          customerId: input.customerId,
          tenantId: input.tenantId,
          bizType: 'VENUE',
          bizId: input.reservationId,
          title: clip(input.title, 160),
          amount,
          status: 'PENDING',
          payMethod: 'OFFLINE',
        },
      });
    });
    return view(row);
  }

  async createWorkOrderOrder(input: {
    siteId: number;
    customerId: number;
    tenantId: number;
    workOrderId: number;
    title: string;
    amount: number;
  }) {
    const amount = Math.max(0, Number(input.amount) || 0);
    if (amount <= 0) return null;
    const existing = await this.prisma.parkOrder.findFirst({
      where: {
        siteId: input.siteId,
        bizType: 'WORK_ORDER',
        bizId: input.workOrderId,
        status: { in: ['PENDING', 'PAID'] },
      },
    });
    if (existing) return view(existing);
    const row = await this.prisma.$transaction(async (tx) => {
      const orderNo = await allocateNo(tx, 'PO', new Date(), {
        table: 'park_orders',
        column: 'order_no',
      });
      return tx.parkOrder.create({
        data: {
          orderNo,
          siteId: input.siteId,
          customerId: input.customerId,
          tenantId: input.tenantId,
          bizType: 'WORK_ORDER',
          bizId: input.workOrderId,
          title: clip(input.title, 160),
          amount,
          status: 'PENDING',
          payMethod: 'OFFLINE',
        },
      });
    });
    return view(row);
  }

  async createEquipmentOrder(input: {
    siteId: number;
    customerId: number;
    tenantId: number;
    reservationId: number;
    title: string;
    amount: number;
  }) {
    const amount = Math.max(0, Number(input.amount) || 0);
    if (amount <= 0) return null;
    const existing = await this.prisma.parkOrder.findFirst({
      where: {
        siteId: input.siteId,
        bizType: 'EQUIPMENT',
        bizId: input.reservationId,
        status: { in: ['PENDING', 'PAID'] },
      },
    });
    if (existing) return view(existing);
    const row = await this.prisma.$transaction(async (tx) => {
      const orderNo = await allocateNo(tx, 'PO', new Date(), {
        table: 'park_orders',
        column: 'order_no',
      });
      return tx.parkOrder.create({
        data: {
          orderNo,
          siteId: input.siteId,
          customerId: input.customerId,
          tenantId: input.tenantId,
          bizType: 'EQUIPMENT',
          bizId: input.reservationId,
          title: clip(input.title, 160),
          amount,
          status: 'PENDING',
          payMethod: 'OFFLINE',
        },
      });
    });
    return view(row);
  }

  async cancelForBiz(siteId: number, bizType: string, bizId: number) {
    await this.prisma.parkOrder.updateMany({
      where: {
        siteId,
        bizType,
        bizId,
        status: 'PENDING',
      },
      data: { status: 'CANCELED' },
    });
  }

  async list(user: CurrentUser, query: Record<string, unknown>) {
    const siteId = integer(query.siteId, 0);
    await this.sites.requireSite(user, siteId);
    const { page, pageSize, offset } = pageArgs(query);
    const status = clip(query.status, 16);
    const bizType = clip(query.bizType, 24);
    const keyword = clip(query.keyword, 60);
    const where: Prisma.ParkOrderWhereInput = {
      siteId,
      ...(status ? { status } : {}),
      ...(bizType ? { bizType } : {}),
      ...(keyword
        ? {
            OR: [
              { orderNo: { contains: keyword } },
              { title: { contains: keyword } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.parkOrder.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      this.prisma.parkOrder.count({ where }),
    ]);
    return { list: rows.map(view), total, page, pageSize };
  }

  async action(user: CurrentUser, id: number, action: string, note = '') {
    const row = await this.prisma.parkOrder.findUnique({ where: { id } });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    }
    await this.sites.requireSite(user, row.siteId);
    if (action === 'paid') {
      if (row.status !== 'PENDING') {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '只有待支付订单可以收款',
        );
      }
      const updated = await this.prisma.parkOrder.update({
        where: { id: row.id },
        data: {
          status: 'PAID',
          payMethod: 'OFFLINE',
          paidAt: new Date(),
          note: clip(note, 500) || row.note,
        },
      });
      return view(updated);
    }
    if (action === 'cancel') {
      if (row.status !== 'PENDING') {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '只有待支付订单可以取消',
        );
      }
      const updated = await this.prisma.parkOrder.update({
        where: { id: row.id },
        data: { status: 'CANCELED', note: clip(note, 500) || row.note },
      });
      return view(updated);
    }
    if (action === 'refund') {
      if (row.status !== 'PAID') {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '只有已收款订单可以退款',
        );
      }
      const updated = await this.prisma.parkOrder.update({
        where: { id: row.id },
        data: { status: 'REFUNDED', note: clip(note, 500) || row.note },
      });
      return view(updated);
    }
    throw new BusinessException(ErrorCode.BAD_REQUEST, '操作不合法');
  }

  async my(customer: CustomerRow) {
    const rows = await this.prisma.parkOrder.findMany({
      where: { siteId: customer.siteId, customerId: customer.id },
      orderBy: { id: 'desc' },
      take: 100,
    });
    return rows.map(view);
  }

  async myDetail(customer: CustomerRow, id: number) {
    const row = await this.prisma.parkOrder.findFirst({
      where: { id, siteId: customer.siteId, customerId: customer.id },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    }
    return view(row);
  }
}
