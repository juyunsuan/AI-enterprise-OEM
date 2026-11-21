import type {
  CircleActivity,
  CircleActivitySaveBody,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { Prisma } from '../../generated/prisma';
import type { PrismaService } from '../prisma/prisma.service';
import {
  clip,
  iso,
  isUniqueViolation,
  pageArgs,
  viewerOf,
} from './circle.shared';

type ActivityRow = Prisma.CircleActivityGetPayload<object>;
type UserRow = Prisma.CircleUserGetPayload<object>;

/** 活动：管理员/圈主发起，成员报名；capacity=0 不限人数。 */
export class CircleActivityService {
  constructor(private readonly prisma: PrismaService) {}

  private shape(
    row: ActivityRow,
    groupName: string,
    creator: UserRow | undefined,
    isJoined: boolean,
  ): CircleActivity {
    return {
      id: row.id,
      groupId: row.groupId,
      groupName,
      creator: creator
        ? viewerOf(creator)
        : { id: 0, nickname: '社区管理员', avatar: '' },
      title: row.title,
      cover: row.cover,
      description: row.description,
      startAt: iso(row.startAt),
      endAt: iso(row.endAt),
      address: row.address,
      capacity: row.capacity,
      joinCount: row.joinCount,
      status: row.status as CircleActivity['status'],
      isJoined,
      createdAt: iso(row.createdAt),
    };
  }

  private async context(rows: ActivityRow[], viewerId: number) {
    const [groups, creators, joins] = await Promise.all([
      rows.length
        ? this.prisma.circleGroup.findMany({
            where: {
              id: {
                in: [
                  ...new Set(rows.map((row) => row.groupId).filter(Boolean)),
                ],
              },
            },
            select: { id: true, name: true },
          })
        : [],
      rows.length
        ? this.prisma.circleUser.findMany({
            where: {
              id: {
                in: [
                  ...new Set(
                    rows.map((row) => row.creatorUserId).filter(Boolean),
                  ),
                ],
              },
            },
          })
        : [],
      viewerId && rows.length
        ? this.prisma.circleActivityJoin
            .findMany({
              where: {
                userId: viewerId,
                activityId: { in: rows.map((row) => row.id) },
              },
              select: { activityId: true },
            })
            .catch(() => [])
        : [],
    ]);
    return {
      groups: new Map(groups.map((row) => [row.id, row.name])),
      creators: new Map(creators.map((row) => [row.id, row])),
      joined: new Set(joins.map((row) => row.activityId)),
    };
  }

  async list(communityId: number, query: Record<string, unknown>) {
    const { page, pageSize, offset } = pageArgs(query);
    const status = clip(query.status, 16);
    const groupId = Number(query.groupId || 0);
    const where: Record<string, unknown> = { communityId };
    if (status) where.status = status;
    if (groupId > 0) where.groupId = groupId;
    const [rows, total] = await Promise.all([
      this.prisma.circleActivity.findMany({
        where,
        orderBy: [{ startAt: 'desc' }, { id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.circleActivity.count({ where }),
    ]);
    const ctx = await this.context(rows, 0);
    return {
      list: rows.map((row) =>
        this.shape(
          row,
          ctx.groups.get(row.groupId) || '',
          ctx.creators.get(row.creatorUserId),
          false,
        ),
      ),
      total,
      page,
      pageSize,
    };
  }

  async publicList(
    communityId: number,
    viewerId: number,
    query: Record<string, unknown>,
  ) {
    const { page, pageSize, offset } = pageArgs(query);
    const groupId = Number(query.groupId || 0);
    const where: Record<string, unknown> = { communityId, status: 'ACTIVE' };
    if (groupId > 0) where.groupId = groupId;
    const [rows, total] = await Promise.all([
      this.prisma.circleActivity.findMany({
        where,
        orderBy: [{ startAt: 'asc' }, { id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.circleActivity.count({ where }),
    ]);
    const ctx = await this.context(rows, viewerId);
    return {
      list: rows.map((row) =>
        this.shape(
          row,
          ctx.groups.get(row.groupId) || '',
          ctx.creators.get(row.creatorUserId),
          ctx.joined.has(row.id),
        ),
      ),
      total,
      page,
      pageSize,
    };
  }

  async detail(communityId: number, id: number, viewerId: number) {
    const row = await this.prisma.circleActivity.findFirst({
      where: { id, communityId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '活动不存在');
    const ctx = await this.context([row], viewerId);
    return this.shape(
      row,
      ctx.groups.get(row.groupId) || '',
      ctx.creators.get(row.creatorUserId),
      ctx.joined.has(row.id),
    );
  }

  async save(communityId: number, body: CircleActivitySaveBody) {
    const startAt = new Date(body.startAt);
    if (Number.isNaN(startAt.getTime())) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '开始时间格式不正确');
    }
    const endAt = body.endAt ? new Date(body.endAt) : null;
    if (endAt && Number.isNaN(endAt.getTime())) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '结束时间格式不正确');
    }
    if (endAt && endAt < startAt) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '结束时间必须晚于开始时间',
      );
    }
    if (body.groupId) {
      const group = await this.prisma.circleGroup.findFirst({
        where: { id: body.groupId, communityId },
        select: { id: true },
      });
      if (!group)
        throw new BusinessException(ErrorCode.BAD_REQUEST, '圈子不存在');
    }
    const data = {
      groupId: body.groupId,
      title: clip(body.title, 80),
      cover: clip(body.cover, 500),
      description: clip(body.description, 5000),
      startAt,
      endAt,
      address: clip(body.address, 200),
      capacity: Math.max(0, Math.floor(body.capacity)),
      status: body.status,
    };
    if (body.id) {
      const row = await this.prisma.circleActivity.findFirst({
        where: { id: body.id, communityId },
      });
      if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '活动不存在');
      const updated = await this.prisma.circleActivity.update({
        where: { id: row.id },
        data,
      });
      return this.detail(communityId, updated.id, 0);
    }
    const created = await this.prisma.circleActivity.create({
      data: { ...data, communityId },
    });
    return this.detail(communityId, created.id, 0);
  }

  async setStatus(
    communityId: number,
    id: number,
    status: CircleActivity['status'],
  ) {
    const row = await this.prisma.circleActivity.findFirst({
      where: { id, communityId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '活动不存在');
    const updated = await this.prisma.circleActivity.update({
      where: { id: row.id },
      data: { status },
    });
    return this.detail(communityId, updated.id, 0);
  }

  async remove(communityId: number, id: number) {
    const row = await this.prisma.circleActivity.findFirst({
      where: { id, communityId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '活动不存在');
    await this.prisma.$transaction([
      this.prisma.circleActivityJoin.deleteMany({
        where: { communityId, activityId: id },
      }),
      this.prisma.circleActivity.delete({ where: { id: row.id } }),
    ]);
    return { ok: true, message: '活动已删除' };
  }

  async join(communityId: number, id: number, userId: number) {
    const row = await this.prisma.circleActivity.findFirst({
      where: { id, communityId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '活动不存在');
    if (row.status !== 'ACTIVE') {
      throw new BusinessException(ErrorCode.FORBIDDEN, '活动当前不可报名');
    }
    if (row.endAt && row.endAt < new Date()) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '活动已结束');
    }
    if (row.capacity > 0 && row.joinCount >= row.capacity) {
      throw new BusinessException(ErrorCode.CONFLICT, '活动报名人数已满');
    }
    try {
      await this.prisma.circleActivityJoin.create({
        data: { communityId, activityId: id, userId },
      });
      await this.prisma.circleActivity.update({
        where: { id },
        data: { joinCount: { increment: 1 } },
      });
      await this.prisma.circleNotification.create({
        data: {
          communityId,
          userId,
          type: 'SYSTEM',
          targetType: 'ACTIVITY',
          targetId: id,
          content: `已报名活动「${row.title}」`,
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    return this.detail(communityId, id, userId);
  }

  async cancel(communityId: number, id: number, userId: number) {
    const deleted = await this.prisma.circleActivityJoin.deleteMany({
      where: { communityId, activityId: id, userId },
    });
    if (deleted.count) {
      await this.prisma.circleActivity.update({
        where: { id },
        data: { joinCount: { decrement: 1 } },
      });
    }
    return this.detail(communityId, id, userId);
  }
}
