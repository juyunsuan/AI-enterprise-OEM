import type { CircleNotification } from '@enterprise/contracts';
import type { PrismaService } from '../prisma/prisma.service';
import { clip, iso, viewerOf } from './circle.shared';

/** 站内消息：点赞/评论/回复/关注/审核/系统公告；小程序「消息」页一次拉最近 50 条。 */
export class CircleNotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    communityId: number,
    userId: number,
  ): Promise<CircleNotification[]> {
    const rows = await this.prisma.circleNotification.findMany({
      where: { communityId, userId },
      orderBy: { id: 'desc' },
      take: 50,
    });
    const actorIds = [
      ...new Set(rows.map((row) => row.actorUserId).filter(Boolean)),
    ];
    const actors = actorIds.length
      ? await this.prisma.circleUser.findMany({
          where: { communityId, id: { in: actorIds } },
        })
      : [];
    const actorMap = new Map(actors.map((row) => [row.id, row]));
    return rows.map((row) => {
      const actor = actorMap.get(row.actorUserId);
      return {
        id: row.id,
        type: row.type as CircleNotification['type'],
        actor: actor ? viewerOf(actor) : null,
        content: row.content,
        targetType: row.targetType,
        targetId: row.targetId,
        postId: row.postId,
        commentId: row.commentId,
        readAt: iso(row.readAt),
        createdAt: iso(row.createdAt),
      };
    });
  }

  async readAll(communityId: number, userId: number) {
    await this.prisma.circleNotification.updateMany({
      where: { communityId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true, message: '已全部标记为已读' };
  }

  async send(communityId: number, title: string, content: string) {
    const users = await this.prisma.circleUser.findMany({
      where: { communityId, status: 'ACTIVE' },
      select: { id: true },
      take: 2000,
    });
    if (!users.length) return { ok: true, message: '暂无成员可通知' };
    await this.prisma.circleNotification.createMany({
      data: users.map((user) => ({
        communityId,
        userId: user.id,
        type: 'SYSTEM',
        content: clip(`${title}：${content}`, 500),
      })),
    });
    return { ok: true, message: `已向 ${users.length} 位成员发送公告` };
  }

  unread(communityId: number, userId: number) {
    return this.prisma.circleNotification.count({
      where: { communityId, userId, readAt: null },
    });
  }
}
