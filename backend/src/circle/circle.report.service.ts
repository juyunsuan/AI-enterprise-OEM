import type { CircleReport } from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { Prisma } from '../../generated/prisma';
import type { PrismaService } from '../prisma/prisma.service';
import { clip, iso, jsonList, pageArgs, viewerOf } from './circle.shared';

type CommunityRow = Prisma.CircleCommunityGetPayload<object>;
type UserRow = Prisma.CircleUserGetPayload<object>;

/** 举报：成员举报帖子/评论/用户/圈子；管理员处置会同步隐藏/删除目标并通知作者。 */
export class CircleReportService {
  constructor(private readonly prisma: PrismaService) {}

  private async targetExists(
    communityId: number,
    targetType: string,
    targetId: number,
  ): Promise<string> {
    if (targetType === 'POST') {
      const row = await this.prisma.circlePost.findFirst({
        where: { id: targetId, communityId },
        select: { content: true },
      });
      if (!row)
        throw new BusinessException(ErrorCode.NOT_FOUND, '被举报的帖子不存在');
      return clip(row.content, 120);
    }
    if (targetType === 'COMMENT') {
      const row = await this.prisma.circleComment.findFirst({
        where: { id: targetId, communityId },
        select: { content: true },
      });
      if (!row)
        throw new BusinessException(ErrorCode.NOT_FOUND, '被举报的评论不存在');
      return clip(row.content, 120);
    }
    if (targetType === 'USER') {
      const row = await this.prisma.circleUser.findFirst({
        where: { id: targetId, communityId },
        select: { nickname: true, bio: true },
      });
      if (!row)
        throw new BusinessException(ErrorCode.NOT_FOUND, '被举报的成员不存在');
      return clip(`${row.nickname} ${row.bio}`, 120);
    }
    const row = await this.prisma.circleGroup.findFirst({
      where: { id: targetId, communityId },
      select: { name: true, intro: true },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '被举报的圈子不存在');
    return clip(`${row.name} ${row.intro}`, 120);
  }

  async create(
    community: CommunityRow,
    user: UserRow,
    body: {
      targetType: 'POST' | 'COMMENT' | 'USER' | 'GROUP';
      targetId: number;
      reason: string;
      detail: string;
      images: string[];
    },
  ) {
    const excerpt = await this.targetExists(
      community.id,
      body.targetType,
      body.targetId,
    );
    const row = await this.prisma.circleReport.create({
      data: {
        communityId: community.id,
        targetType: body.targetType,
        targetId: body.targetId,
        reporterUserId: user.id,
        reason: clip(body.reason, 40),
        detail: clip(body.detail, 500),
        images: jsonList(body.images, 3),
      },
    });
    return {
      id: row.id,
      message: `举报已提交，管理员会尽快处理（${excerpt}）`,
    };
  }

  async list(communityId: number, query: Record<string, unknown>) {
    const { page, pageSize, offset } = pageArgs(query);
    const status = clip(query.status, 16);
    const targetType = clip(query.targetType, 16);
    const where: Record<string, unknown> = { communityId };
    if (status) where.status = status;
    if (targetType) where.targetType = targetType;
    const [rows, total] = await Promise.all([
      this.prisma.circleReport.findMany({
        where,
        orderBy: [{ status: 'asc' }, { id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.circleReport.count({ where }),
    ]);
    const reporters = rows.length
      ? await this.prisma.circleUser.findMany({
          where: {
            communityId,
            id: { in: [...new Set(rows.map((row) => row.reporterUserId))] },
          },
        })
      : [];
    const reporterMap = new Map(reporters.map((row) => [row.id, row]));
    return {
      list: rows.map((row) =>
        this.shape(row, reporterMap.get(row.reporterUserId)),
      ),
      total,
      page,
      pageSize,
    };
  }

  private shape(
    row: Prisma.CircleReportGetPayload<object>,
    reporter?: UserRow,
  ): CircleReport {
    return {
      id: row.id,
      targetType: row.targetType as CircleReport['targetType'],
      targetId: row.targetId,
      reporter: reporter
        ? viewerOf(reporter)
        : { id: row.reporterUserId, nickname: '社区用户', avatar: '' },
      reason: row.reason,
      detail: row.detail,
      images: jsonList(row.images, 3),
      status: row.status as CircleReport['status'],
      action: row.action,
      excerpt: '',
      createdAt: iso(row.createdAt),
      handledAt: iso(row.handledAt),
    };
  }

  async handle(
    communityId: number,
    id: number,
    action: 'NONE' | 'HIDE' | 'DELETE' | 'BAN' | 'REJECT',
    note: string,
    adminUserId: string,
  ): Promise<CircleReport> {
    const row = await this.prisma.circleReport.findFirst({
      where: { id, communityId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '举报不存在');
    if (action === 'REJECT') {
      const updated = await this.prisma.circleReport.update({
        where: { id: row.id },
        data: {
          status: 'REJECTED',
          action,
          handledBy: adminUserId,
          handledAt: new Date(),
        },
      });
      return this.shape(updated);
    }
    if (action === 'HIDE' || action === 'DELETE') {
      const status = action === 'HIDE' ? 'HIDDEN' : 'DELETED';
      if (row.targetType === 'POST') {
        const post = await this.prisma.circlePost.findFirst({
          where: { id: row.targetId, communityId },
        });
        if (post) {
          if (post.status === 'PUBLISHED') {
            const links = await this.prisma.circlePostTopic.findMany({
              where: { postId: post.id },
              select: { topicId: true },
            });
            await Promise.all([
              this.prisma.circleUser.update({
                where: { id: post.authorUserId },
                data: { postCount: { decrement: 1 } },
              }),
              this.prisma.circleGroup.update({
                where: { id: post.groupId },
                data: { postCount: { decrement: 1 } },
              }),
              ...links.map((link) =>
                this.prisma.circleTopic
                  .update({
                    where: { id: link.topicId },
                    data: { postCount: { decrement: 1 } },
                  })
                  .catch(() => undefined),
              ),
            ]);
          }
          await this.prisma.circlePost.update({
            where: { id: post.id },
            data: { status, auditNote: clip(note, 200) },
          });
          await this.prisma.circleNotification.create({
            data: {
              communityId,
              userId: post.authorUserId,
              type: 'AUDIT',
              targetType: 'POST',
              targetId: post.id,
              postId: post.id,
              content:
                status === 'HIDDEN'
                  ? '你的帖子因举报被隐藏'
                  : '你的帖子因举报被删除',
            },
          });
        }
      } else if (row.targetType === 'COMMENT') {
        const comment = await this.prisma.circleComment.findFirst({
          where: { id: row.targetId, communityId },
        });
        if (comment) {
          if (comment.status === 'PUBLISHED') {
            await this.prisma.circlePost.update({
              where: { id: comment.postId },
              data: { commentCount: { decrement: 1 } },
            });
          }
          await this.prisma.circleComment.update({
            where: { id: comment.id },
            data: { status },
          });
        }
      } else if (row.targetType === 'GROUP') {
        await this.prisma.circleGroup.updateMany({
          where: { id: row.targetId, communityId },
          data: { status: 'DISABLED', rejectReason: clip(note, 200) },
        });
      }
    }
    if (action === 'BAN' && row.targetType === 'USER') {
      await this.prisma.circleUser.updateMany({
        where: { id: row.targetId, communityId },
        data: { status: 'BANNED' },
      });
    }
    const updated = await this.prisma.circleReport.update({
      where: { id: row.id },
      data: {
        status: 'RESOLVED',
        action,
        handledBy: adminUserId,
        handledAt: new Date(),
      },
    });
    return this.shape(updated);
  }
}
