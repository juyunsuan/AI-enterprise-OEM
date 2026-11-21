import {
  type ParkReservation,
  type ParkApprovalDetail,
} from '@enterprise/contracts';
import QRCode from 'qrcode';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma';
import {
  clip,
  integer,
  iso,
  pageArgs,
  passCode,
  reservationKindLabel,
  reservationStatusLabel,
} from './park.helpers';
import type { ParkApprovalService } from './park.approval.service';
import type { AppointmentService } from '../gaps/appointment.service';
import type { ParkOrderService } from './park.order.service';
import type { ParkNotifyService } from './park.notify.service';
import type { ParkSiteService } from './park.site.service';

type Row = Prisma.ParkReservationGetPayload<object>;
type CustomerRow = Prisma.ParkCustomerGetPayload<object>;

const view = (row: Row): ParkReservation => ({
  id: row.id,
  siteId: row.siteId,
  kind: row.kind as ParkReservation['kind'],
  kindLabel: reservationKindLabel(row.kind),
  applicantName: row.applicantName,
  applicantPhone: row.applicantPhone,
  visitorName: row.visitorName,
  visitorPhone: row.visitorPhone,
  visitorCompany: row.visitorCompany,
  plateNo: row.plateNo,
  companions: row.companions,
  quantity: row.quantity,
  depositAmount: Number(row.depositAmount),
  buildingId: row.buildingId,
  unitId: row.unitId,
  resourceName: row.resourceName,
  startAt: iso(row.startAt),
  endAt: iso(row.endAt),
  purpose: row.purpose,
  note: row.note,
  status: row.status as ParkReservation['status'],
  statusLabel: reservationStatusLabel(row.status),
  approvalId: row.approvalId,
  checkedInAt: iso(row.checkedInAt),
  createdAt: iso(row.createdAt),
});

const passView = (row: Row) => ({
  ...view(row),
  passCode: row.passCode,
  passExpiresAt: iso(row.passExpiresAt),
});

export type ParkReservationCreate = {
  kind: string;
  visitorName: string;
  visitorPhone?: string;
  visitorCompany?: string;
  visitorIdNo?: string;
  plateNo?: string;
  companions?: number;
  buildingId?: number;
  unitId?: number;
  resourceName?: string;
  startAt: string;
  endAt: string;
  purpose?: string;
  note?: string;
  quantity?: number;
};

/** 访客/场地预约：单据、审批、通行码、门岗核验。 */
export class ParkReservationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: ParkSiteService,
    private readonly approvals: ParkApprovalService,
    private readonly appointments: AppointmentService,
    private readonly orders: ParkOrderService,
    private readonly notify: ParkNotifyService,
  ) {}

  async create(
    site: { id: number },
    customer: CustomerRow,
    input: ParkReservationCreate,
  ) {
    const kind = ['VISITOR', 'VENUE', 'MEETING'].includes(input.kind)
      ? input.kind
      : 'VISITOR';
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    if (
      Number.isNaN(startAt.getTime()) ||
      Number.isNaN(endAt.getTime()) ||
      endAt.getTime() <= startAt.getTime()
    ) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请选择有效的开始与结束时间',
      );
    }
    const visitorName = clip(input.visitorName, 60);
    if (!visitorName) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写访客姓名');
    }
    if (kind === 'VISITOR' && !clip(input.visitorPhone, 32)) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写访客手机号');
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.parkReservation.create({
        data: {
          siteId: site.id,
          kind,
          customerId: customer.id,
          tenantId: customer.tenantId,
          applicantName: customer.nickname || visitorName,
          applicantPhone: clip(customer.phone, 32),
          visitorName,
          visitorPhone: clip(input.visitorPhone, 32),
          visitorCompany: clip(input.visitorCompany, 120),
          visitorIdNo: clip(input.visitorIdNo, 64),
          plateNo: clip(input.plateNo, 20),
          companions: Math.min(50, Math.max(0, integer(input.companions, 0))),
          buildingId: integer(input.buildingId, 0),
          unitId: integer(input.unitId, 0),
          resourceName: clip(input.resourceName, 120),
          startAt,
          endAt,
          purpose: clip(input.purpose, 200),
          note: clip(input.note, 500),
          status: 'PENDING',
        },
      });
      return created;
    });
    const approval = await this.approvals.create({
      siteId: site.id,
      bizType: kind === 'VISITOR' ? 'VISITOR' : 'VENUE',
      bizId: row.id,
      title:
        kind === 'VISITOR'
          ? `访客预约：${visitorName}`
          : `场地预约：${clip(input.resourceName, 120) || visitorName}`,
      applicantType: 'CUSTOMER',
      applicantId: customer.id,
      applicantName: customer.nickname || visitorName,
      tenantId: customer.tenantId,
      formData: {
        kind,
        visitorName,
        visitorPhone: clip(input.visitorPhone, 32),
        visitorCompany: clip(input.visitorCompany, 120),
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        purpose: clip(input.purpose, 200),
      },
    });
    const saved = await this.prisma.parkReservation.update({
      where: { id: row.id },
      data: { approvalId: approval.id },
    });
    if (approval.status === 'APPROVED') {
      return this.approve(saved);
    }
    return this.withQr(passView(saved));
  }

  /** 场地/会议室预约：复用 appointment 的并发占位，再由园区审批发通行码。 */
  async createVenue(
    site: { id: number; ownerUserId: string },
    customer: CustomerRow,
    resource: {
      id: number;
      kind: string;
      name: string;
      slug: string;
      eventId: number;
      approvalRequired: boolean;
      feeAmount: number;
    },
    slotId: number,
    purpose: string,
    note: string,
  ) {
    if (!resource.eventId || !resource.slug) {
      throw new BusinessException(ErrorCode.CONFLICT, '场地时段尚未配置');
    }
    if (!slotId) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请选择预约时段');
    }
    const booking = await this.appointments.publicBook(resource.slug, {
      slotId,
      name: customer.nickname || '园区用户',
      phone: customer.phone || '',
      company: '',
      note: clip(note, 500),
    });
    try {
      const row = await this.prisma.parkReservation.create({
        data: {
          siteId: site.id,
          kind: resource.kind,
          customerId: customer.id,
          tenantId: customer.tenantId,
          applicantName: customer.nickname || '园区用户',
          applicantPhone: customer.phone || '',
          visitorName: customer.nickname || '园区用户',
          visitorPhone: customer.phone || '',
          resourceId: resource.id,
          resourceName: resource.name,
          eventId: resource.eventId,
          slotId,
          appointmentBookingId: booking.id,
          startAt: new Date(booking.startAt),
          endAt: new Date(booking.endAt),
          purpose: clip(purpose, 200),
          note: clip(note, 500),
          status: 'PENDING',
        },
      });
      if (resource.feeAmount > 0) {
        await this.orders.createVenueOrder({
          siteId: site.id,
          customerId: customer.id,
          tenantId: customer.tenantId,
          reservationId: row.id,
          title: `场地预约：${resource.name}`,
          amount: resource.feeAmount,
        });
      }
      if (!resource.approvalRequired) {
        return this.approve(row);
      }
      const approval = await this.approvals.create({
        siteId: site.id,
        bizType: 'VENUE',
        bizId: row.id,
        title: `${resource.kind === 'MEETING' ? '会议室' : '场地'}预约：${resource.name}`,
        applicantType: 'CUSTOMER',
        applicantId: customer.id,
        applicantName: customer.nickname || '园区用户',
        tenantId: customer.tenantId,
        formData: {
          kind: resource.kind,
          resourceId: resource.id,
          resourceName: resource.name,
          slotId,
          startAt: booking.startAt,
          endAt: booking.endAt,
          purpose: clip(purpose, 200),
        },
      });
      const saved = await this.prisma.parkReservation.update({
        where: { id: row.id },
        data: { approvalId: approval.id },
      });
      if (approval.status === 'APPROVED') return this.approve(saved);
      return this.withQr(passView(saved));
    } catch (error) {
      await this.releaseAppointment({
        siteId: site.id,
        ownerUserId: site.ownerUserId,
        appointmentBookingId: booking.id,
      });
      throw error;
    }
  }

  /** 设备租赁：按天计费、按库存校验，复用同一套审批/通行码/订单。 */
  async createEquipment(
    site: { id: number; ownerUserId: string },
    customer: CustomerRow,
    resource: {
      id: number;
      kind: string;
      name: string;
      feeAmount: number;
      deposit: number;
      stock: number;
      approvalRequired: boolean;
    },
    body: ParkReservationCreate,
  ) {
    const quantity = Math.min(
      Math.max(1, integer(body.quantity, 1)),
      Math.max(1, resource.stock),
    );
    const startAt = new Date(body.startAt);
    const endAt = new Date(body.endAt);
    if (
      Number.isNaN(startAt.getTime()) ||
      Number.isNaN(endAt.getTime()) ||
      endAt.getTime() <= startAt.getTime()
    ) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请选择有效的租赁起止时间',
      );
    }
    const active = await this.prisma.parkReservation.findMany({
      where: {
        siteId: site.id,
        resourceId: resource.id,
        status: { in: ['PENDING', 'APPROVED', 'CHECKED_IN'] },
      },
      select: { quantity: true },
    });
    const used = active.reduce(
      (sum, row) => sum + Number(row.quantity || 1),
      0,
    );
    if (used + quantity > resource.stock) {
      throw new BusinessException(ErrorCode.CONFLICT, '该设备可租数量不足');
    }
    const days = Math.max(
      1,
      Math.ceil((endAt.getTime() - startAt.getTime()) / 86_400_000),
    );
    const amount = Math.max(0, resource.feeAmount) * days * quantity;
    const row = await this.prisma.parkReservation.create({
      data: {
        siteId: site.id,
        kind: 'EQUIPMENT',
        customerId: customer.id,
        tenantId: customer.tenantId,
        applicantName: customer.nickname || '园区用户',
        applicantPhone: customer.phone || '',
        visitorName: customer.nickname || '园区用户',
        visitorPhone: customer.phone || '',
        resourceId: resource.id,
        resourceName: resource.name,
        quantity,
        depositAmount: Math.max(0, resource.deposit) * quantity,
        startAt,
        endAt,
        purpose: clip(body.purpose, 200),
        note: clip(body.note, 500),
        status: 'PENDING',
      },
    });
    if (amount > 0) {
      await this.orders.createEquipmentOrder({
        siteId: site.id,
        customerId: customer.id,
        tenantId: customer.tenantId,
        reservationId: row.id,
        title: `设备租赁：${resource.name} × ${quantity}（${days} 天）`,
        amount,
      });
    }
    if (!resource.approvalRequired) {
      return this.approve(row);
    }
    const approval = await this.approvals.create({
      siteId: site.id,
      bizType: 'EQUIPMENT',
      bizId: row.id,
      title: `设备租赁：${resource.name}`,
      applicantType: 'CUSTOMER',
      applicantId: customer.id,
      applicantName: customer.nickname || '园区用户',
      tenantId: customer.tenantId,
      formData: {
        kind: 'EQUIPMENT',
        resourceId: resource.id,
        resourceName: resource.name,
        quantity,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        amount,
      },
    });
    const saved = await this.prisma.parkReservation.update({
      where: { id: row.id },
      data: { approvalId: approval.id },
    });
    if (approval.status === 'APPROVED') return this.approve(saved);
    return this.withQr(passView(saved));
  }

  private async releaseAppointment(row: {
    siteId: number;
    ownerUserId?: string;
    appointmentBookingId: number;
  }) {
    if (!row.appointmentBookingId) return;
    const ownerUserId =
      row.ownerUserId ||
      (
        await this.prisma.parkSite.findUnique({
          where: { id: row.siteId },
          select: { ownerUserId: true },
        })
      )?.ownerUserId;
    if (!ownerUserId) return;
    await this.appointments
      .cancelBooking(
        new CurrentUser(ownerUserId, 'park', 'user'),
        row.appointmentBookingId,
        '[园区] 预约取消/驳回，释放时段',
      )
      .catch(() => undefined);
  }

  async my(customer: CustomerRow) {
    const rows = await this.prisma.parkReservation.findMany({
      where: { siteId: customer.siteId, customerId: customer.id },
      orderBy: { id: 'desc' },
      take: 100,
    });
    return Promise.all(rows.map(async (row) => this.withQr(passView(row))));
  }

  async myDetail(customer: CustomerRow, id: number) {
    const row = await this.prisma.parkReservation.findFirst({
      where: { id, siteId: customer.siteId, customerId: customer.id },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '预约不存在');
    }
    return this.withQr(passView(row));
  }

  async cancel(customer: CustomerRow, id: number) {
    const row = await this.prisma.parkReservation.findFirst({
      where: { id, siteId: customer.siteId, customerId: customer.id },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '预约不存在');
    }
    if (!['PENDING', 'APPROVED'].includes(row.status)) {
      throw new BusinessException(ErrorCode.CONFLICT, '当前状态不能取消');
    }
    if (row.approvalId) {
      await this.prisma.$transaction([
        this.prisma.parkApprovalTask.updateMany({
          where: { approvalId: row.approvalId, status: 'PENDING' },
          data: { status: 'SKIPPED' },
        }),
        this.prisma.parkApproval.updateMany({
          where: { id: row.approvalId, status: 'APPROVING' },
          data: { status: 'WITHDRAWN', finishedAt: new Date() },
        }),
      ]);
    }
    await this.releaseAppointment({
      siteId: row.siteId,
      appointmentBookingId: row.appointmentBookingId,
    });
    await this.orders.cancelForBiz(
      row.siteId,
      row.kind === 'EQUIPMENT' ? 'EQUIPMENT' : 'VENUE',
      row.id,
    );
    const updated = await this.prisma.parkReservation.update({
      where: { id: row.id },
      data: { status: 'CANCELED', passCode: '' },
    });
    return passView(updated);
  }

  async staffList(siteId: number, query: Record<string, unknown>) {
    const { page, pageSize, offset } = pageArgs(query);
    const kind = clip(query.kind, 16);
    const status = clip(query.status, 16);
    const keyword = clip(query.keyword, 60);
    const where: Prisma.ParkReservationWhereInput = {
      siteId,
      ...(kind ? { kind } : {}),
      ...(status ? { status } : {}),
      ...(keyword
        ? {
            OR: [
              { visitorName: { contains: keyword } },
              { visitorPhone: { contains: keyword } },
              { resourceName: { contains: keyword } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.parkReservation.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      this.prisma.parkReservation.count({ where }),
    ]);
    return { list: rows.map(view), total, page, pageSize };
  }

  async staffAct(
    siteId: number,
    staffId: number,
    id: number,
    action: string,
    comment = '',
  ) {
    const row = await this.prisma.parkReservation.findFirst({
      where: { id, siteId },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '预约不存在');
    }
    if (action === 'checkin') {
      return this.checkIn(row, staffId);
    }
    if (action === 'complete') {
      if (row.status !== 'CHECKED_IN') {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '只有已核验的预约才能完成',
        );
      }
      const updated = await this.prisma.parkReservation.update({
        where: { id: row.id },
        data: { status: 'COMPLETED' },
      });
      return view(updated);
    }
    if (action === 'cancel') {
      const updated = await this.prisma.parkReservation.update({
        where: { id: row.id },
        data: { status: 'CANCELED', passCode: '' },
      });
      return view(updated);
    }
    if (!['approve', 'reject'].includes(action) || !row.approvalId) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '操作不合法');
    }
    const approval = await this.approvals.act(
      { type: 'STAFF', id: staffId },
      row.approvalId,
      action as 'approve' | 'reject',
      comment,
    );
    return this.sync(row.id, approval.status);
  }

  async adminAct(
    user: CurrentUser,
    id: number,
    action: 'approve' | 'reject' | 'cancel' | 'checkin' | 'complete',
    comment = '',
  ) {
    const row = await this.prisma.parkReservation.findUnique({ where: { id } });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '预约不存在');
    }
    await this.sites.requireSite(user, row.siteId);
    if (action === 'checkin') return this.checkIn(row, 0);
    if (action === 'cancel') {
      const updated = await this.prisma.parkReservation.update({
        where: { id: row.id },
        data: { status: 'CANCELED', passCode: '' },
      });
      return view(updated);
    }
    if (action === 'complete') {
      if (row.status !== 'CHECKED_IN') {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '只有已核验的预约才能完成',
        );
      }
      const updated = await this.prisma.parkReservation.update({
        where: { id: row.id },
        data: { status: 'COMPLETED' },
      });
      return view(updated);
    }
    if (!row.approvalId) {
      throw new BusinessException(ErrorCode.CONFLICT, '该预约没有审批单');
    }
    const approval = await this.approvals.adminAct(
      user,
      row.approvalId,
      action,
      comment,
    );
    return this.sync(row.id, approval.status);
  }

  async checkInByCode(siteId: number, staffId: number, code: string) {
    const pass = clip(code, 20).toUpperCase();
    if (!pass) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写通行码');
    }
    const row = await this.prisma.parkReservation.findFirst({
      where: { siteId, passCode: pass },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '通行码无效');
    }
    return this.checkIn(row, staffId);
  }

  private async checkIn(row: Row, staffId: number) {
    if (row.status === 'CHECKED_IN') {
      throw new BusinessException(ErrorCode.CONFLICT, '该通行码已核验');
    }
    if (row.status !== 'APPROVED') {
      throw new BusinessException(ErrorCode.CONFLICT, '预约未通过审批或已失效');
    }
    if (row.passExpiresAt && row.passExpiresAt.getTime() < Date.now()) {
      throw new BusinessException(ErrorCode.CONFLICT, '通行码已过期');
    }
    const updated = await this.prisma.parkReservation.update({
      where: { id: row.id },
      data: {
        status: 'CHECKED_IN',
        checkedInAt: new Date(),
        checkedInBy: staffId,
        passCode: '',
      },
    });
    const customer = await this.prisma.parkCustomer.findFirst({
      where: { id: row.customerId, siteId: row.siteId },
      select: { openid: true },
    });
    if (customer) {
      void this.notify.notify(
        row.siteId,
        customer,
        'parkVisit',
        '/pages/visitor/list',
        [
          row.resourceName || row.visitorName || '园区通行',
          iso(new Date()),
          row.applicantName || '',
        ],
      );
    }
    return view(updated);
  }

  /** 审批状态回写预约：通过生成通行码，驳回/撤回置对应状态。 */
  async sync(id: number, approvalStatus: string) {
    const row = await this.prisma.parkReservation.findUnique({ where: { id } });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '预约不存在');
    }
    if (approvalStatus === 'APPROVED') {
      return this.approve(row);
    }
    const status =
      approvalStatus === 'REJECTED'
        ? 'REJECTED'
        : approvalStatus === 'WITHDRAWN'
          ? 'CANCELED'
          : row.status;
    if (status !== row.status) {
      await this.releaseAppointment({
        siteId: row.siteId,
        appointmentBookingId: row.appointmentBookingId,
      });
      await this.orders.cancelForBiz(
        row.siteId,
        row.kind === 'EQUIPMENT' ? 'EQUIPMENT' : 'VENUE',
        row.id,
      );
    }
    const updated = await this.prisma.parkReservation.update({
      where: { id: row.id },
      data: { status, passCode: '' },
    });
    if (status === 'REJECTED') {
      const customer = await this.prisma.parkCustomer.findFirst({
        where: { id: row.customerId, siteId: row.siteId },
        select: { openid: true },
      });
      if (customer) {
        void this.notify.notify(
          row.siteId,
          customer,
          'parkApprove',
          '/pages/visitor/list',
          [
            row.resourceName || row.visitorName || '园区预约',
            '已驳回',
            iso(row.startAt),
            '如有疑问请联系园区',
          ],
        );
      }
    }
    return view(updated);
  }

  private async approve(row: Row) {
    const code = passCode();
    const expires = new Date(
      Math.max(row.endAt.getTime(), Date.now()) + 2 * 3600_000,
    );
    const updated = await this.prisma.parkReservation.update({
      where: { id: row.id },
      data: {
        status: 'APPROVED',
        passCode: code,
        passExpiresAt: expires,
      },
    });
    const customer = await this.prisma.parkCustomer.findFirst({
      where: { id: row.customerId, siteId: row.siteId },
      select: { openid: true },
    });
    if (customer) {
      void this.notify.notify(
        row.siteId,
        customer,
        'parkApprove',
        '/pages/visitor/list',
        [
          row.resourceName || row.visitorName || '园区预约',
          '已通过',
          iso(row.startAt),
          '请出示通行码入园',
        ],
      );
    }
    return this.withQr(passView(updated));
  }

  private async withQr<T extends { passCode?: string }>(view: T) {
    if (!view.passCode) return view;
    try {
      const qrDataUrl = await QRCode.toDataURL(view.passCode, {
        width: 320,
        margin: 1,
        errorCorrectionLevel: 'M',
      });
      return { ...view, qrDataUrl };
    } catch {
      return view;
    }
  }

  /** 员工端审批后回写预约：用 siteId 再兜一层，防止跨园区串单。 */
  async syncByApprovalForSite(
    siteId: number,
    approvalId: number,
    status: string,
  ) {
    const row = await this.prisma.parkReservation.findFirst({
      where: { approvalId, siteId },
    });
    if (!row) return null;
    return this.sync(row.id, status);
  }

  /** 管理端在审批页操作后，把结果回写到对应预约；没有对应预约时返回 null。 */
  async syncByApprovalId(
    user: CurrentUser,
    approvalId: number,
    status: string,
  ) {
    const row = await this.prisma.parkReservation.findFirst({
      where: { approvalId },
    });
    if (!row) return null;
    await this.sites.requireSite(user, row.siteId);
    return this.sync(row.id, status);
  }

  async adminList(user: CurrentUser, query: Record<string, unknown>) {
    const siteId = integer(query.siteId, 0);
    await this.sites.requireSite(user, siteId);
    return this.staffList(siteId, query);
  }

  async adminDetail(user: CurrentUser, id: number) {
    const row = await this.prisma.parkReservation.findUnique({ where: { id } });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '预约不存在');
    }
    await this.sites.requireSite(user, row.siteId);
    return passView(row);
  }

  async approvalDetailFor(
    user: CurrentUser,
    approvalId: number,
  ): Promise<ParkApprovalDetail> {
    return this.approvals.detail(user, approvalId);
  }
}
