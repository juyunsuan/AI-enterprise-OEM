import type { CircleMedal, CircleMedalSaveBody } from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { Prisma } from '../../generated/prisma';
import type { PrismaService } from '../prisma/prisma.service';
import { clip, isUniqueViolation, iso } from './circle.shared';

type MedalRow = Prisma.CircleMedalGetPayload<object>;

/** 勋章：达到发帖/评论/粉丝阈值自动授予；管理员可增删改与停用。 */
export class CircleMedalService {
  constructor(private readonly prisma: PrismaService) {}

  private shape(row: MedalRow): CircleMedal {
    return {
      id: row.id,
      name: row.name,
      icon: row.icon,
      type: row.type as CircleMedal['type'],
      threshold: row.threshold,
      enabled: row.enabled,
      sort: row.sort,
      createdAt: iso(row.createdAt),
    };
  }

  async list(communityId: number) {
    const rows = await this.prisma.circleMedal.findMany({
      where: { communityId },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.shape(row));
  }

  async save(communityId: number, body: CircleMedalSaveBody) {
    const data = {
      name: clip(body.name, 30),
      icon: clip(body.icon, 500),
      type: body.type,
      threshold: Math.max(1, Math.floor(body.threshold)),
      enabled: body.enabled,
      sort: Math.max(0, Math.floor(body.sort)),
    };
    if (body.id) {
      const row = await this.prisma.circleMedal.findFirst({
        where: { id: body.id, communityId },
      });
      if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '勋章不存在');
      const updated = await this.prisma.circleMedal.update({
        where: { id: row.id },
        data,
      });
      return this.shape(updated);
    }
    const created = await this.prisma.circleMedal.create({
      data: { ...data, communityId },
    });
    return this.shape(created);
  }

  async remove(communityId: number, id: number) {
    const row = await this.prisma.circleMedal.findFirst({
      where: { id, communityId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '勋章不存在');
    await this.prisma.$transaction([
      this.prisma.circleUserMedal.deleteMany({
        where: { communityId, medalId: id },
      }),
      this.prisma.circleMedal.delete({ where: { id: row.id } }),
    ]);
    return { ok: true, message: '勋章已删除' };
  }

  /** 首次建社区时铺三条默认勋章；已存在则不重复创建。 */
  async seedDefaults(communityId: number) {
    const count = await this.prisma.circleMedal.count({
      where: { communityId },
    });
    if (count > 0) return;
    await this.prisma.circleMedal.createMany({
      data: [
        {
          communityId,
          name: '发帖达人',
          type: 'POST',
          threshold: 10,
          sort: 10,
        },
        {
          communityId,
          name: '评论达人',
          type: 'COMMENT',
          threshold: 50,
          sort: 20,
        },
        {
          communityId,
          name: '人气之星',
          type: 'FOLLOWER',
          threshold: 20,
          sort: 30,
        },
      ],
    });
  }

  /** 按当前计数补齐勋章；重复授予会被唯一索引挡住。 */
  async award(communityId: number, userId: number) {
    const [user, medals, comments] = await Promise.all([
      this.prisma.circleUser.findFirst({
        where: { id: userId, communityId },
        select: { id: true, postCount: true, followerCount: true },
      }),
      this.prisma.circleMedal.findMany({
        where: { communityId, enabled: true },
      }),
      this.prisma.circleComment.count({
        where: { communityId, userId, status: 'PUBLISHED' },
      }),
    ]);
    if (!user) return;
    const values: Record<string, number> = {
      POST: user.postCount,
      COMMENT: comments,
      FOLLOWER: user.followerCount,
    };
    for (const medal of medals) {
      if ((values[medal.type] || 0) < medal.threshold) continue;
      try {
        await this.prisma.circleUserMedal.create({
          data: { communityId, medalId: medal.id, userId },
        });
        await this.prisma.circleNotification.create({
          data: {
            communityId,
            userId,
            type: 'SYSTEM',
            targetType: 'MEDAL',
            targetId: medal.id,
            content: `获得新勋章「${medal.name}」`,
          },
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
  }

  async userMedals(communityId: number, userId: number) {
    const rows = await this.prisma.circleUserMedal.findMany({
      where: { communityId, userId },
      orderBy: { awardedAt: 'desc' },
      take: 20,
    });
    const medals = await this.prisma.circleMedal.findMany({
      where: { communityId, id: { in: rows.map((row) => row.medalId) } },
      select: { id: true, name: true, icon: true },
    });
    const map = new Map(medals.map((row) => [row.id, row]));
    return rows
      .map((row) => map.get(row.medalId))
      .filter((row): row is { id: number; name: string; icon: string } => !!row)
      .map((row) => ({ id: row.id, name: row.name, icon: row.icon }));
  }
}
