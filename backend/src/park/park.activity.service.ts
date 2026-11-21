import {
  type ParkActivity,
  type ParkActivityInput,
  type ParkActivitySignup,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma';
import {
  activityStatusLabel,
  activitySignupStatusLabel,
  clip,
  integer,
  iso,
} from './park.helpers';
import type { ParkSiteService } from './park.site.service';

type Row = Prisma.ParkActivityGetPayload<object>;
type SignupRow = Prisma.ParkActivitySignupGetPayload<object>;
type CustomerRow = Prisma.ParkCustomerGetPayload<object>;

const view = (row: Row, signupCount: number): ParkActivity => ({
  id: row.id,
  siteId: row.siteId,
  title: row.title,
  cover: row.cover,
  summary: row.summary,
  content: row.content,
  location: row.location,
  startAt: iso(row.startAt),
  endAt: iso(row.endAt),
  signupDeadline: row.signupDeadline,
  capacity: row.capacity,
  signupCount,
  remaining: row.capacity > 0 ? Math.max(0, row.capacity - signupCount) : -1,
  status: row.status as ParkActivity['status'],
  statusLabel: activityStatusLabel(row.status),
  createdAt: iso(row.createdAt),
});

const signupView = (row: SignupRow): ParkActivitySignup => ({
  id: row.id,
  activityId: row.activityId,
  name: row.name,
  phone: row.phone,
  tenantId: row.tenantId,
  status: row.status as ParkActivitySignup['status'],
  statusLabel: activitySignupStatusLabel(row.status),
  note: row.note,
  createdAt: iso(row.createdAt),
});

/** 园区活动：发布、报名、取消、报名名单；报名人始终是园区外部顾客。 */
export class ParkActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: ParkSiteService,
  ) {}

  async list(
    user: CurrentUser,
    siteId: number,
    query: Record<string, unknown>,
  ) {
    await this.sites.requireSite(user, siteId);
    const status = clip(query.status, 16);
    const keyword = clip(query.keyword, 60);
    const rows = await this.prisma.parkActivity.findMany({
      where: {
        siteId,
        ...(status ? { status } : {}),
        ...(keyword ? { title: { contains: keyword } } : {}),
      },
      orderBy: [{ startAt: 'desc' }, { id: 'desc' }],
    });
    const counts = await this.prisma.parkActivitySignup.groupBy({
      by: ['activityId'],
      where: { siteId, status: 'SIGNED' },
      _count: { _all: true },
    });
    const byId = new Map(
      counts.map((item) => [item.activityId, item._count._all]),
    );
    return rows.map((row) => view(row, byId.get(row.id) || 0));
  }

  async save(user: CurrentUser, body: ParkActivityInput) {
    const site = await this.sites.requireSite(user, body.siteId);
    const id = integer(body.id, 0);
    const existing = id
      ? await this.prisma.parkActivity.findFirst({
          where: { id, siteId: site.id },
        })
      : null;
    if (id && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '活动不存在');
    }
    const title = clip(body.title, 160);
    if (!title) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写活动标题');
    }
    const startAt = new Date(body.startAt);
    const endAt = new Date(body.endAt);
    if (
      Number.isNaN(startAt.getTime()) ||
      Number.isNaN(endAt.getTime()) ||
      endAt.getTime() <= startAt.getTime()
    ) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请选择有效的活动时间',
      );
    }
    const data = {
      title,
      cover: clip(body.cover, 500),
      summary: clip(body.summary, 300),
      content: String(body.content || '').slice(0, 200_000),
      location: clip(body.location, 200),
      startAt,
      endAt,
      signupDeadline: clip(body.signupDeadline, 40),
      capacity: Math.max(0, integer(body.capacity, 0)),
      status: body.status,
    };
    const row = existing
      ? await this.prisma.parkActivity.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.parkActivity.create({
          data: { ...data, siteId: site.id },
        });
    const signupCount = await this.prisma.parkActivitySignup.count({
      where: { activityId: row.id, status: 'SIGNED' },
    });
    return view(row, signupCount);
  }

  async setStatus(user: CurrentUser, id: number, status: string) {
    const row = await this.prisma.parkActivity.findFirst({
      where: { id, siteId: { in: await this.siteIdsOf(user) } },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '活动不存在');
    }
    const updated = await this.prisma.parkActivity.update({
      where: { id: row.id },
      data: { status },
    });
    const signupCount = await this.prisma.parkActivitySignup.count({
      where: { activityId: row.id, status: 'SIGNED' },
    });
    return view(updated, signupCount);
  }

  async remove(user: CurrentUser, id: number) {
    const row = await this.prisma.parkActivity.findFirst({
      where: { id, siteId: { in: await this.siteIdsOf(user) } },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '活动不存在');
    }
    await this.prisma.$transaction([
      this.prisma.parkActivitySignup.deleteMany({
        where: { activityId: row.id },
      }),
      this.prisma.parkActivity.delete({ where: { id: row.id } }),
    ]);
    return { ok: true, message: '已删除' };
  }

  async signups(user: CurrentUser, activityId: number) {
    const row = await this.prisma.parkActivity.findFirst({
      where: { id: activityId, siteId: { in: await this.siteIdsOf(user) } },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '活动不存在');
    }
    const rows = await this.prisma.parkActivitySignup.findMany({
      where: { activityId },
      orderBy: { id: 'asc' },
    });
    return rows.map(signupView);
  }

  async publicList(siteId: number) {
    const rows = await this.prisma.parkActivity.findMany({
      where: { siteId, status: 'PUBLISHED' },
      orderBy: [{ startAt: 'asc' }],
      take: 50,
    });
    const counts = await this.prisma.parkActivitySignup.groupBy({
      by: ['activityId'],
      where: {
        siteId,
        activityId: { in: rows.map((row) => row.id) },
        status: 'SIGNED',
      },
      _count: { _all: true },
    });
    const byId = new Map(
      counts.map((item) => [item.activityId, item._count._all]),
    );
    return rows.map((row) => view(row, byId.get(row.id) || 0));
  }

  async publicDetail(siteId: number, id: number) {
    const row = await this.prisma.parkActivity.findFirst({
      where: { id, siteId, status: 'PUBLISHED' },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '活动不存在或未发布');
    }
    const signupCount = await this.prisma.parkActivitySignup.count({
      where: { activityId: row.id, status: 'SIGNED' },
    });
    return view(row, signupCount);
  }

  async my(customer: CustomerRow) {
    const rows = await this.prisma.parkActivitySignup.findMany({
      where: { siteId: customer.siteId, customerId: customer.id },
      orderBy: { id: 'desc' },
    });
    if (!rows.length) return [];
    const activities = await this.prisma.parkActivity.findMany({
      where: { id: { in: rows.map((row) => row.activityId) } },
    });
    const byId = new Map(activities.map((item) => [item.id, item]));
    return rows
      .map((row) => {
        const activity = byId.get(row.activityId);
        if (!activity) return null;
        return {
          signup: signupView(row),
          activity: view(activity, 0),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }

  async signup(
    site: { id: number },
    customer: CustomerRow,
    body: Record<string, unknown>,
  ) {
    const activityId = integer(body.activityId, 0);
    const activity = await this.prisma.parkActivity.findFirst({
      where: { id: activityId, siteId: site.id, status: 'PUBLISHED' },
    });
    if (!activity) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '活动不存在或未开放报名',
      );
    }
    if (
      activity.signupDeadline &&
      new Date(activity.signupDeadline).getTime() < Date.now()
    ) {
      throw new BusinessException(ErrorCode.CONFLICT, '报名已截止');
    }
    const existing = await this.prisma.parkActivitySignup.findUnique({
      where: {
        activityId_customerId: {
          activityId: activity.id,
          customerId: customer.id,
        },
      },
    });
    if (existing?.status === 'SIGNED') {
      throw new BusinessException(ErrorCode.CONFLICT, '你已经报名该活动');
    }
    if (activity.capacity > 0) {
      const signed = await this.prisma.parkActivitySignup.count({
        where: { activityId: activity.id, status: 'SIGNED' },
      });
      if (signed >= activity.capacity) {
        throw new BusinessException(ErrorCode.CONFLICT, '活动名额已满');
      }
    }
    const name = clip(body.name, 60) || customer.nickname || '园区用户';
    const phone = clip(body.phone, 32) || customer.phone || '';
    const note = clip(body.note, 500);
    const row = existing
      ? await this.prisma.parkActivitySignup.update({
          where: { id: existing.id },
          data: { name, phone, note, status: 'SIGNED' },
        })
      : await this.prisma.parkActivitySignup.create({
          data: {
            activityId: activity.id,
            siteId: site.id,
            customerId: customer.id,
            tenantId: customer.tenantId,
            name,
            phone,
            note,
            status: 'SIGNED',
          },
        });
    const signupCount = await this.prisma.parkActivitySignup.count({
      where: { activityId: activity.id, status: 'SIGNED' },
    });
    return { signup: signupView(row), activity: view(activity, signupCount) };
  }

  async cancel(customer: CustomerRow, activityId: number) {
    const row = await this.prisma.parkActivitySignup.findUnique({
      where: {
        activityId_customerId: {
          activityId: integer(activityId, 0),
          customerId: customer.id,
        },
      },
    });
    if (!row || row.siteId !== customer.siteId) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '报名记录不存在');
    }
    if (row.status === 'CANCELED') {
      return signupView(row);
    }
    const updated = await this.prisma.parkActivitySignup.update({
      where: { id: row.id },
      data: { status: 'CANCELED' },
    });
    return signupView(updated);
  }

  private async siteIdsOf(user: CurrentUser) {
    const rows = await this.prisma.parkSite.findMany({
      where: { ownerUserId: user.userId },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }
}
