import {
  parkResourceScheduleSchema,
  type ParkResource,
  type ParkResourceInput,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma';
import type { AppointmentService } from '../gaps/appointment.service';
import {
  clip,
  integer,
  iso,
  randomCode,
  resourceKindLabel,
  resourceScheduleOf,
  resourceStatusLabel,
} from './park.helpers';
import type { ParkSiteService } from './park.site.service';

type Row = Prisma.ParkResourceGetPayload<object>;
type Slot = {
  id: number;
  startAt: string;
  endAt: string;
  label: string;
  booked: boolean;
};

const slotView = (row: {
  id: number;
  startAt: string;
  endAt: string;
  booked?: boolean;
  label?: string;
}): Slot => {
  const start = String(row.startAt || '');
  return {
    id: row.id,
    startAt: start,
    endAt: String(row.endAt || ''),
    label:
      row.label ||
      `${start.slice(5, 10)} ${new Date(
        new Date(start).getTime() + 8 * 3600_000,
      )
        .toISOString()
        .slice(11, 16)}`,
    booked: Boolean(row.booked),
  };
};

const view = (row: Row, buildingName: string, slots: Slot[]): ParkResource => ({
  id: row.id,
  siteId: row.siteId,
  buildingId: row.buildingId,
  buildingName,
  name: row.name,
  kind: row.kind as ParkResource['kind'],
  kindLabel: resourceKindLabel(row.kind),
  capacity: row.capacity,
  location: row.location,
  description: row.description,
  cover: row.cover,
  feeAmount: Number(row.feeAmount),
  stock: row.stock,
  deposit: Number(row.deposit),
  approvalRequired: row.approvalRequired,
  schedule: parkResourceScheduleSchema.parse(resourceScheduleOf(row.schedule)),
  status: row.status as ParkResource['status'],
  statusLabel: resourceStatusLabel(row.status),
  eventId: row.eventId,
  slug: row.slug,
  slots,
  createdAt: iso(row.createdAt),
});

/** 园区场地/会议室：元数据在 park_resources，时段与并发占位复用 appointment_*。 */
export class ParkResourceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: ParkSiteService,
    private readonly appointments: AppointmentService,
  ) {}

  async list(user: CurrentUser, siteId: number) {
    await this.sites.requireSite(user, siteId);
    const rows = await this.prisma.parkResource.findMany({
      where: { siteId },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    const buildings = await this.prisma.parkBuilding.findMany({
      where: { siteId },
      select: { id: true, name: true },
    });
    const names = new Map(buildings.map((item) => [item.id, item.name]));
    return rows.map((row) => view(row, names.get(row.buildingId) || '', []));
  }

  async save(user: CurrentUser, body: ParkResourceInput) {
    const site = await this.sites.requireSite(user, body.siteId);
    const id = integer(body.id, 0);
    const existing = id
      ? await this.prisma.parkResource.findFirst({
          where: { id, siteId: site.id },
        })
      : null;
    if (id && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '场地不存在');
    }
    const name = clip(body.name, 120);
    if (!name) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写场地名称');
    }
    const duplicate = await this.prisma.parkResource.findFirst({
      where: { siteId: site.id, name, NOT: id ? { id } : undefined },
    });
    if (duplicate) {
      throw new BusinessException(ErrorCode.CONFLICT, '该场地名称已存在');
    }
    const schedule = parkResourceScheduleSchema.parse(body.schedule);
    const building = body.buildingId
      ? await this.prisma.parkBuilding.findFirst({
          where: { id: body.buildingId, siteId: site.id },
        })
      : null;
    let slug = existing?.slug || '';
    if (!slug) {
      for (let i = 0; i < 20; i += 1) {
        const next = `park-${site.id}-${randomCode(8).toLowerCase()}`;
        const taken = await this.prisma.appointmentEvent.findUnique({
          where: { slug: next },
        });
        if (!taken) {
          slug = next;
          break;
        }
      }
    }
    if (!slug) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '预约链接生成失败，请重试',
      );
    }
    const event = await this.appointments.saveEvent(user, {
      id: existing?.eventId || 0,
      title: name,
      slug,
      purpose: 'MEETING',
      durationMin: schedule.stepMin,
      bufferMin: 0,
      location: clip(body.location, 200) || building?.name || '',
      description: clip(body.description, 1000),
      horizonDays: 60,
      active: body.status === 'ONLINE',
    });
    const data = {
      buildingId: building?.id || 0,
      name,
      kind: body.kind,
      capacity: Math.max(1, integer(body.capacity, 1)),
      location: clip(body.location, 200),
      description: clip(body.description, 2000),
      cover: clip(body.cover, 500),
      feeAmount: Math.max(0, Number(body.feeAmount) || 0),
      stock: Math.max(1, integer(body.stock, 1)),
      deposit: Math.max(0, Number(body.deposit) || 0),
      approvalRequired: Boolean(body.approvalRequired),
      schedule: schedule as Prisma.InputJsonValue,
      status: body.status,
      sort: integer(body.sort, 0),
      eventId: event.id,
      slug: event.slug,
    };
    const row = existing
      ? await this.prisma.parkResource.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.parkResource.create({
          data: { ...data, siteId: site.id },
        });
    return view(row, building?.name || '', []);
  }

  async setStatus(user: CurrentUser, id: number, status: string) {
    const row = await this.prisma.parkResource.findFirst({
      where: { id, siteId: { in: await this.siteIdsOf(user) } },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '场地不存在');
    }
    const schedule = parkResourceScheduleSchema.parse(
      resourceScheduleOf(row.schedule),
    );
    if (row.eventId) {
      await this.appointments.saveEvent(user, {
        id: row.eventId,
        title: row.name,
        slug: row.slug,
        purpose: 'MEETING',
        durationMin: schedule.stepMin,
        bufferMin: 0,
        location: row.location,
        description: row.description,
        horizonDays: 60,
        active: status === 'ONLINE',
      });
    }
    const updated = await this.prisma.parkResource.update({
      where: { id: row.id },
      data: { status },
    });
    return view(updated, '', []);
  }

  async remove(user: CurrentUser, id: number) {
    const row = await this.prisma.parkResource.findFirst({
      where: { id, siteId: { in: await this.siteIdsOf(user) } },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '场地不存在');
    }
    const active = await this.prisma.parkReservation.count({
      where: {
        siteId: row.siteId,
        resourceId: row.id,
        status: { in: ['PENDING', 'APPROVED', 'CHECKED_IN'] },
      },
    });
    if (active > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该场地还有未结束的预约，请先处理后再删除',
      );
    }
    await this.prisma.parkResource.delete({ where: { id: row.id } });
    if (row.eventId) {
      await this.appointments
        .removeEvent(user, row.eventId)
        .catch(() => undefined);
    }
    return { ok: true, message: '已删除' };
  }

  async slots(
    user: CurrentUser,
    resourceId: number,
    from?: string,
    to?: string,
  ) {
    const row = await this.prisma.parkResource.findFirst({
      where: { id: resourceId, siteId: { in: await this.siteIdsOf(user) } },
    });
    if (!row || !row.eventId) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '场地不存在或未配置时段',
      );
    }
    const rows = await this.appointments.slots(user, {
      eventId: row.eventId,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    });
    return rows.map((item) => slotView(item));
  }

  async generateSlots(
    user: CurrentUser,
    body: {
      resourceId: number;
      date: string;
      startTime: string;
      endTime: string;
      stepMin: number;
    },
  ) {
    const row = await this.prisma.parkResource.findFirst({
      where: {
        id: body.resourceId,
        siteId: { in: await this.siteIdsOf(user) },
      },
    });
    if (!row || !row.eventId) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '场地不存在或未配置时段',
      );
    }
    const rows = await this.appointments.generateSlots(user, {
      eventId: row.eventId,
      date: body.date,
      startTime: body.startTime,
      endTime: body.endTime,
      stepMin: body.stepMin,
    });
    return rows.map((item) => slotView(item));
  }

  async publicList(siteId: number) {
    const rows = await this.prisma.parkResource.findMany({
      where: { siteId, status: 'ONLINE' },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    return Promise.all(
      rows.map(async (row) => {
        const slots = await this.publicSlots(row);
        return view(row, '', slots);
      }),
    );
  }

  async publicDetail(siteId: number, id: number) {
    const row = await this.prisma.parkResource.findFirst({
      where: { id, siteId, status: 'ONLINE' },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '场地不存在或已关闭');
    }
    return view(row, '', await this.publicSlots(row));
  }

  private async publicSlots(row: Row): Promise<Slot[]> {
    if (!row.eventId || !row.slug) return [];
    const event = await this.appointments
      .publicEvent(row.slug)
      .catch(() => null);
    if (!event) return [];
    return event.slots.slice(0, 40).map((item) =>
      slotView({
        id: item.id,
        startAt: item.startAt,
        endAt: item.endAt,
        label: item.label,
      }),
    );
  }

  private async siteIdsOf(user: CurrentUser) {
    const rows = await this.prisma.parkSite.findMany({
      where: { ownerUserId: user.userId },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }
}
