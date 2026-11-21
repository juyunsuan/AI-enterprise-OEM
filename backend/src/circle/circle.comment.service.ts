import type { CircleComment } from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { Prisma } from '../../generated/prisma';
import type { PrismaService } from '../prisma/prisma.service';
import type { PublishReviewService } from '../moderation/publish-review.service';
import type { CircleCommunityService } from './circle.community.service';
import { clip, iso, pageArgs, viewerOf } from './circle.shared';

type CommunityRow = Prisma.CircleCommunityGetPayload<object>;
type CommentRow = Prisma.CircleCommentGetPayload<object>;
type UserRow = Prisma.CircleUserGetPayload<object>;

/**
 * 评论与楼中楼：一级评论 parentId=0，回复 parentId 指向一级评论；
 * 允许多级展示但只落两层（与参考包楼中楼一致），审核开关打开时先 PENDING。
 */
export class CircleCommentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly community: CircleCommunityService,
    private readonly review: PublishReviewService,
  ) {}

  private async userMap(communityId: number, rows: CommentRow[]) {
    const ids = [...new Set(rows.map((row) => row.userId))];
    if (!ids.length) return new Map<number, UserRow>();
    const users = await this.prisma.circleUser.findMany({
      where: { communityId, id: { in: ids } },
    });
    return new Map(users.map((row) => [row.id, row]));
  }

  private async likedSet(communityId: number, userId: number, ids: number[]) {
    if (!userId || !ids.length) return new Set<number>();
    const rows = await this.prisma.circleCommentLike.findMany({
      where: { communityId, userId, commentId: { in: ids } },
      select: { commentId: true },
    });
    return new Set(rows.map((row) => row.commentId));
  }

  private shape(
    row: CommentRow,
    users: Map<number, UserRow>,
    liked: Set<number>,
  ): CircleComment {
    const user = users.get(row.userId);
    return {
      id: row.id,
      postId: row.postId,
      parentId: row.parentId,
      user: user
        ? viewerOf(user)
        : { id: row.userId, nickname: '社区用户', avatar: '' },
      replyToName: row.replyToName,
      content: row.content,
      likeCount: row.likeCount,
      isLiked: liked.has(row.id),
      status: row.status as CircleComment['status'],
      createdAt: iso(row.createdAt),
      children: [],
    };
  }

  async list(communityId: number, postId: number, viewerId: number) {
    const post = await this.prisma.circlePost.findFirst({
      where: { id: postId, communityId, status: 'PUBLISHED' },
      select: { id: true },
    });
    if (!post)
      throw new BusinessException(ErrorCode.NOT_FOUND, '帖子不存在或已隐藏');
    const rows = await this.prisma.circleComment.findMany({
      where: { communityId, postId, status: 'PUBLISHED' },
      orderBy: [{ isPinned: 'desc' }, { id: 'asc' }],
      take: 500,
    });
    const [users, liked] = await Promise.all([
      this.userMap(communityId, rows),
      this.likedSet(
        communityId,
        viewerId,
        rows.map((row) => row.id),
      ),
    ]);
    const shaped = new Map<number, CircleComment>();
    const rootOf = new Map<number, number>();
    const roots: CircleComment[] = [];
    for (const row of rows) {
      const node = this.shape(row, users, liked);
      shaped.set(row.id, node);
      if (!row.parentId) {
        rootOf.set(row.id, row.id);
        roots.push(node);
        continue;
      }
      // 楼中楼统一挂到一级评论下：小程序只渲染一层 children，回复的回复
      // 如果继续嵌套会看不见；这里把后代拍平，replyToName 仍保留被回复人。
      const parent = shaped.get(row.parentId);
      const rootId = parent
        ? rootOf.get(parent.id) || (parent.parentId ? 0 : parent.id)
        : 0;
      const root = rootId ? shaped.get(rootId) : null;
      if (root) {
        root.children.push(node);
        rootOf.set(row.id, rootId);
      } else {
        roots.push(node);
        rootOf.set(row.id, row.id);
      }
    }
    return roots;
  }

  async create(
    community: CommunityRow,
    user: UserRow,
    body: {
      postId: number;
      parentId: number;
      replyToUserId: number;
      content: string;
    },
  ): Promise<CircleComment> {
    if (user.status !== 'ACTIVE') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '当前账号已被禁言或封禁',
      );
    }
    const post = await this.prisma.circlePost.findFirst({
      where: {
        id: body.postId,
        communityId: community.id,
        status: 'PUBLISHED',
      },
    });
    if (!post)
      throw new BusinessException(ErrorCode.NOT_FOUND, '帖子不存在或已隐藏');
    let replyToName = '';
    if (body.parentId) {
      const parent = await this.prisma.circleComment.findFirst({
        where: {
          id: body.parentId,
          communityId: community.id,
          postId: post.id,
        },
      });
      if (!parent)
        throw new BusinessException(ErrorCode.BAD_REQUEST, '回复的评论不存在');
      const targetId = body.replyToUserId || parent.userId;
      const target = await this.prisma.circleUser.findFirst({
        where: { id: targetId, communityId: community.id },
        select: { nickname: true },
      });
      replyToName = target?.nickname || '';
    }
    const content = clip(body.content, 1000);
    await this.review.guard({
      scene: 'community_post',
      userId: `circle:${community.id}:${user.id}`,
      texts: [content],
    });
    const status = community.commentReview ? 'PENDING' : 'PUBLISHED';
    const created = await this.prisma.circleComment.create({
      data: {
        communityId: community.id,
        postId: post.id,
        userId: user.id,
        parentId: body.parentId,
        replyToUserId: body.replyToUserId,
        replyToName,
        content,
        status,
      },
    });
    if (status === 'PUBLISHED') {
      await this.prisma.circlePost.update({
        where: { id: post.id },
        data: {
          commentCount: { increment: 1 },
          hotScore: { increment: 2 },
        },
      });
    }
    const notifyUserId = body.parentId
      ? body.replyToUserId || post.authorUserId
      : post.authorUserId;
    if (notifyUserId && notifyUserId !== user.id) {
      await this.prisma.circleNotification.create({
        data: {
          communityId: community.id,
          userId: notifyUserId,
          type: body.parentId ? 'REPLY' : 'COMMENT',
          actorUserId: user.id,
          targetType: 'POST',
          targetId: post.id,
          postId: post.id,
          commentId: created.id,
          content: body.parentId ? '回复了你的评论' : '评论了你的帖子',
        },
      });
    }
    const users = await this.userMap(community.id, [created]);
    const liked = await this.likedSet(community.id, user.id, [created.id]);
    return this.shape(created, users, liked);
  }

  async like(
    communityId: number,
    commentId: number,
    userId: number,
    like: boolean,
  ): Promise<CircleComment> {
    const row = await this.prisma.circleComment.findFirst({
      where: { id: commentId, communityId, status: 'PUBLISHED' },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '评论不存在');
    if (like) {
      try {
        await this.prisma.circleCommentLike.create({
          data: { communityId, commentId, userId },
        });
        await this.prisma.circleComment.update({
          where: { id: commentId },
          data: { likeCount: { increment: 1 } },
        });
      } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code !== 'P2002' && code !== '23505') throw error;
      }
    } else {
      const deleted = await this.prisma.circleCommentLike.deleteMany({
        where: { communityId, commentId, userId },
      });
      if (deleted.count) {
        await this.prisma.circleComment.update({
          where: { id: commentId },
          data: { likeCount: { decrement: 1 } },
        });
      }
    }
    const updated = await this.prisma.circleComment.findUniqueOrThrow({
      where: { id: row.id },
    });
    const users = await this.userMap(communityId, [updated]);
    const liked = await this.likedSet(communityId, userId, [updated.id]);
    return this.shape(updated, users, liked);
  }

  async adminList(communityId: number, query: Record<string, unknown>) {
    const { page, pageSize, offset } = pageArgs(query);
    const status = clip(query.status, 16);
    const postId = Number(query.postId || 0);
    const keyword = clip(query.keyword, 60);
    const where: Record<string, unknown> = { communityId };
    if (status) where.status = status;
    if (postId > 0) where.postId = postId;
    if (keyword) where.content = { contains: keyword };
    const [rows, total] = await Promise.all([
      this.prisma.circleComment.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      this.prisma.circleComment.count({ where }),
    ]);
    const [users, liked] = await Promise.all([
      this.userMap(communityId, rows),
      this.likedSet(communityId, 0, []),
    ]);
    return {
      list: rows.map((row) => this.shape(row, users, liked)),
      total,
      page,
      pageSize,
    };
  }

  async setStatus(
    communityId: number,
    id: number,
    status: CircleComment['status'],
  ) {
    const row = await this.prisma.circleComment.findFirst({
      where: { id, communityId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '评论不存在');
    if (row.status === 'PUBLISHED' && status !== 'PUBLISHED') {
      await this.prisma.circlePost.update({
        where: { id: row.postId },
        data: { commentCount: { decrement: 1 } },
      });
    }
    if (row.status !== 'PUBLISHED' && status === 'PUBLISHED') {
      await this.prisma.circlePost.update({
        where: { id: row.postId },
        data: { commentCount: { increment: 1 } },
      });
    }
    await this.prisma.circleComment.update({
      where: { id: row.id },
      data: { status },
    });
    return { ok: true, message: '评论状态已更新' };
  }

  async remove(communityId: number, id: number, userId = 0) {
    const row = await this.prisma.circleComment.findFirst({
      where: { id, communityId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '评论不存在');
    if (userId && row.userId !== userId) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '只能删除自己的评论');
    }
    const all = await this.prisma.circleComment.findMany({
      where: { communityId, postId: row.postId },
      select: { id: true, parentId: true, status: true },
    });
    const doomed = new Set<number>([row.id]);
    let frontier = [row.id];
    while (frontier.length) {
      const next = all
        .filter(
          (item) => frontier.includes(item.parentId) && !doomed.has(item.id),
        )
        .map((item) => item.id);
      next.forEach((item) => doomed.add(item));
      frontier = next;
    }
    const removed = all.filter(
      (item) => doomed.has(item.id) && item.status === 'PUBLISHED',
    ).length;
    await this.prisma.$transaction(async (tx) => {
      await tx.circleComment.updateMany({
        where: { communityId, id: { in: [...doomed] } },
        data: { status: 'DELETED' },
      });
      if (removed > 0) {
        await tx.circlePost.update({
          where: { id: row.postId },
          data: { commentCount: { decrement: removed } },
        });
      }
    });
    return { ok: true, message: '评论已删除' };
  }
}
