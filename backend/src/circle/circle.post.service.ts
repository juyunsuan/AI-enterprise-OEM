import type {
  CirclePost,
  CirclePublicPostCreateBody,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { Prisma } from '../../generated/prisma';
import type { PrismaService } from '../prisma/prisma.service';
import type { PublishReviewService } from '../moderation/publish-review.service';
import type { ToolLaunchMeterService } from '../tool-launch/tool-launch.meter';
import type { CircleCommunityService } from './circle.community.service';
import {
  CIRCLE_TOOL,
  clip,
  dayKey,
  isUniqueViolation,
  iso,
  jsonList,
  pageArgs,
  visitorKeyOf,
  viewerOf,
} from './circle.shared';

type CommunityRow = Prisma.CircleCommunityGetPayload<object>;
type PostRow = Prisma.CirclePostGetPayload<object>;
type UserRow = Prisma.CircleUserGetPayload<object>;

/**
 * 帖子：图文内容 + 话题 + 计数。
 *
 * 三条硬口径：
 * 1. 发帖必须是圈子 ACTIVE 成员；审核开关打开时先落 PENDING，管理员通过后才公开；
 * 2. 浏览量按「帖子 × 访客 × 自然日」去重，只在首次打开时累加并写 tool_usage_daily.views，
 *    避免刷新页面把按浏览量计费刷爆；
 * 3. 所有读写都带 communityId；C 端不传 communityId，社区由 AppID/公开码解析。
 */
export class CirclePostService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly community: CircleCommunityService,
    private readonly review: PublishReviewService,
    private readonly meter: ToolLaunchMeterService,
  ) {}

  private async authorMap(communityId: number, rows: PostRow[]) {
    const ids = [
      ...new Set(rows.map((row) => row.authorUserId).filter(Boolean)),
    ];
    if (!ids.length) return new Map<number, UserRow>();
    const users = await this.prisma.circleUser.findMany({
      where: { communityId, id: { in: ids } },
    });
    return new Map(users.map((row) => [row.id, row]));
  }

  private async groupMap(communityId: number, rows: PostRow[]) {
    const ids = [...new Set(rows.map((row) => row.groupId))];
    if (!ids.length) return new Map<number, string>();
    const groups = await this.prisma.circleGroup.findMany({
      where: { communityId, id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(groups.map((row) => [row.id, row.name]));
  }

  private async topicMap(rows: PostRow[]) {
    const ids = rows.map((row) => row.id);
    if (!ids.length) return new Map<number, { id: number; name: string }[]>();
    const links = await this.prisma.circlePostTopic.findMany({
      where: { postId: { in: ids } },
    });
    const topicIds = [...new Set(links.map((row) => row.topicId))];
    const topics = topicIds.length
      ? await this.prisma.circleTopic.findMany({
          where: { id: { in: topicIds } },
          select: { id: true, name: true },
        })
      : [];
    const topicById = new Map(topics.map((row) => [row.id, row]));
    const out = new Map<number, { id: number; name: string }[]>();
    for (const link of links) {
      const topic = topicById.get(link.topicId);
      if (!topic) continue;
      const list = out.get(link.postId) || [];
      list.push({ id: topic.id, name: topic.name });
      out.set(link.postId, list);
    }
    return out;
  }

  private async likedSet(
    communityId: number,
    userId: number,
    postIds: number[],
  ) {
    if (!userId || !postIds.length) return new Set<number>();
    const rows = await this.prisma.circlePostLike.findMany({
      where: { communityId, userId, postId: { in: postIds } },
      select: { postId: true },
    });
    return new Set(rows.map((row) => row.postId));
  }

  private async favoredSet(
    communityId: number,
    userId: number,
    postIds: number[],
  ) {
    if (!userId || !postIds.length) return new Set<number>();
    const rows = await this.prisma.circlePostFavorite.findMany({
      where: { communityId, userId, postId: { in: postIds } },
      select: { postId: true },
    });
    return new Set(rows.map((row) => row.postId));
  }

  private async shapeList(
    communityId: number,
    rows: PostRow[],
    viewerId: number,
  ): Promise<CirclePost[]> {
    const ids = rows.map((row) => row.id);
    const [authors, groups, topics, liked, favored] = await Promise.all([
      this.authorMap(communityId, rows),
      this.groupMap(communityId, rows),
      this.topicMap(rows),
      this.likedSet(communityId, viewerId, ids),
      this.favoredSet(communityId, viewerId, ids),
    ]);
    return rows.map((row) => {
      const author = authors.get(row.authorUserId);
      return {
        id: row.id,
        groupId: row.groupId,
        groupName: groups.get(row.groupId) || '圈子',
        author: author
          ? viewerOf(author)
          : { id: 0, nickname: '社区用户', avatar: '' },
        content: row.content,
        images: jsonList(row.images, 9),
        topics: topics.get(row.id) || [],
        status: row.status as CirclePost['status'],
        auditNote: row.auditNote,
        isPinned: row.isPinned,
        isFeatured: row.isFeatured,
        likeCount: row.likeCount,
        commentCount: row.commentCount,
        viewCount: row.viewCount,
        favoriteCount: row.favoriteCount,
        isLiked: liked.has(row.id),
        isFavorited: favored.has(row.id),
        createdAt: iso(row.createdAt),
      };
    });
  }

  async adminList(communityId: number, query: Record<string, unknown>) {
    const { page, pageSize, offset } = pageArgs(query);
    const status = clip(query.status, 16);
    const groupId = Number(query.groupId || 0);
    const keyword = clip(query.keyword, 60);
    const where: Record<string, unknown> = { communityId };
    if (status) where.status = status;
    if (groupId > 0) where.groupId = groupId;
    if (keyword) where.content = { contains: keyword };
    const [rows, total] = await Promise.all([
      this.prisma.circlePost.findMany({
        where,
        orderBy: [{ isPinned: 'desc' }, { id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.circlePost.count({ where }),
    ]);
    return {
      list: await this.shapeList(communityId, rows, 0),
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
    const tab = clip(query.tab, 20) || 'recommend';
    const groupId = Number(query.groupId || 0);
    const keyword = clip(query.keyword, 60);
    const where: Record<string, unknown> = {
      communityId,
      status: 'PUBLISHED',
    };
    if (groupId > 0) where.groupId = groupId;
    if (keyword) where.content = { contains: keyword };
    if (tab === 'featured') where.isFeatured = true;
    if (tab === 'following' && viewerId) {
      const [groups, users] = await Promise.all([
        this.prisma.circleGroupFollow.findMany({
          where: { communityId, userId: viewerId },
          select: { groupId: true },
        }),
        this.prisma.circleUserFollow.findMany({
          where: { communityId, followerId: viewerId },
          select: { targetUserId: true },
        }),
      ]);
      where.OR = [
        { groupId: { in: groups.map((row) => row.groupId) } },
        { authorUserId: { in: users.map((row) => row.targetUserId) } },
      ];
    }
    const orderBy =
      tab === 'latest'
        ? [{ id: 'desc' as const }]
        : [
            { isPinned: 'desc' as const },
            { isFeatured: 'desc' as const },
            { hotScore: 'desc' as const },
            { id: 'desc' as const },
          ];
    const [rows, total] = await Promise.all([
      this.prisma.circlePost.findMany({
        where,
        orderBy,
        skip: offset,
        take: pageSize,
      }),
      this.prisma.circlePost.count({ where }),
    ]);
    return {
      list: await this.shapeList(communityId, rows, viewerId),
      total,
      page,
      pageSize,
    };
  }

  async detail(
    communityId: number,
    id: number,
    viewerId: number,
    options: { publicOnly?: boolean; visitorKey?: string } = {},
  ): Promise<CirclePost> {
    const row = await this.prisma.circlePost.findFirst({
      where: { id, communityId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '帖子不存在');
    if (options.publicOnly && row.status !== 'PUBLISHED') {
      throw new BusinessException(ErrorCode.NOT_FOUND, '帖子不存在或已隐藏');
    }
    if (options.visitorKey) {
      await this.recordView(communityId, row, options.visitorKey);
    }
    const list = await this.shapeList(communityId, [row], viewerId);
    return list[0];
  }

  /** 去重浏览：同一访客同一天只计一次，首次打开才累加帖子计数与 tool_usage_daily.views。 */
  private async recordView(
    communityId: number,
    row: PostRow,
    visitorKey: string,
  ) {
    const day = dayKey();
    try {
      await this.prisma.circlePostView.create({
        data: { communityId, postId: row.id, visitorKey, day },
      });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'P2002' || code === '23505') return;
      throw error;
    }
    await this.prisma.circlePost.update({
      where: { id: row.id },
      data: {
        viewCount: { increment: 1 },
        hotScore: { increment: 1 },
      },
    });
    const community = await this.prisma.circleCommunity.findUnique({
      where: { id: communityId },
      select: { ownerUserId: true },
    });
    if (community) await this.meter.view(CIRCLE_TOOL, community.ownerUserId);
  }

  async create(
    community: CommunityRow,
    user: UserRow,
    body: CirclePublicPostCreateBody,
  ): Promise<CirclePost> {
    if (user.status !== 'ACTIVE') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '当前账号已被禁言或封禁',
      );
    }
    const group = await this.prisma.circleGroup.findFirst({
      where: { id: body.groupId, communityId: community.id, status: 'ACTIVE' },
    });
    if (!group)
      throw new BusinessException(ErrorCode.NOT_FOUND, '圈子不存在或未开放');
    const member = await this.prisma.circleGroupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: user.id } },
    });
    if (!member || (member.status !== 'ACTIVE' && member.status !== 'MUTED')) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '请先加入该圈子再发帖');
    }
    if (member.status === 'MUTED') {
      throw new BusinessException(ErrorCode.FORBIDDEN, '你已被该圈子禁言');
    }
    const platform = await this.community.settings();
    if (platform.maxPostsPerDay > 0) {
      const today = await this.prisma.circlePost.count({
        where: {
          communityId: community.id,
          authorUserId: user.id,
          createdAt: { gte: dayKey() },
        },
      });
      if (today >= platform.maxPostsPerDay) {
        throw new BusinessException(
          ErrorCode.FORBIDDEN,
          `今天已发布 ${today} 条，达到每日上限，请明天再来`,
        );
      }
    }
    const content = clip(body.content, 5000);
    const images = jsonList(body.images, 9);
    await this.review.guard({
      scene: 'community_post',
      userId: `circle:${community.id}:${user.id}`,
      texts: [content],
    });
    const status = community.postReview ? 'PENDING' : 'PUBLISHED';
    const created = await this.prisma.circlePost.create({
      data: {
        communityId: community.id,
        groupId: group.id,
        authorUserId: user.id,
        content,
        images,
        status,
        hotScore: 0,
      },
    });
    if (status === 'PUBLISHED') {
      await Promise.all([
        this.prisma.circleUser.update({
          where: { id: user.id },
          data: { postCount: { increment: 1 } },
        }),
        this.prisma.circleGroup.update({
          where: { id: group.id },
          data: { postCount: { increment: 1 } },
        }),
      ]);
    }
    if (body.topicIds.length) {
      const topics = await this.prisma.circleTopic.findMany({
        where: {
          communityId: community.id,
          id: { in: body.topicIds },
          enabled: true,
        },
        select: { id: true },
      });
      if (topics.length) {
        await this.prisma.circlePostTopic.createMany({
          data: topics.map((topic) => ({
            postId: created.id,
            topicId: topic.id,
          })),
        });
        if (status === 'PUBLISHED') {
          await Promise.all(
            topics.map((topic) =>
              this.prisma.circleTopic.update({
                where: { id: topic.id },
                data: { postCount: { increment: 1 } },
              }),
            ),
          );
        }
      }
    }
    return this.detail(community.id, created.id, user.id);
  }

  async removeByAuthor(communityId: number, id: number, userId: number) {
    const row = await this.prisma.circlePost.findFirst({
      where: { id, communityId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '帖子不存在');
    if (row.authorUserId !== userId) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '只能删除自己的帖子');
    }
    await this.hide(communityId, row, 'DELETED', '作者删除');
    return { ok: true, message: '帖子已删除' };
  }

  async audit(communityId: number, id: number, approve: boolean, note: string) {
    const row = await this.prisma.circlePost.findFirst({
      where: { id, communityId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '帖子不存在');
    if (row.status !== 'PENDING') {
      throw new BusinessException(ErrorCode.CONFLICT, '该帖子不在待审核状态');
    }
    const updated = await this.prisma.circlePost.update({
      where: { id: row.id },
      data: {
        status: approve ? 'PUBLISHED' : 'REJECTED',
        auditNote: approve ? '' : clip(note, 200),
      },
    });
    if (approve) {
      await Promise.all([
        this.prisma.circleUser.update({
          where: { id: row.authorUserId },
          data: { postCount: { increment: 1 } },
        }),
        this.prisma.circleGroup.update({
          where: { id: row.groupId },
          data: { postCount: { increment: 1 } },
        }),
      ]);
      await this.adjustTopicCounts(row.id, 1);
    }
    await this.prisma.circleNotification.create({
      data: {
        communityId,
        userId: row.authorUserId,
        type: 'AUDIT',
        targetType: 'POST',
        targetId: row.id,
        postId: row.id,
        content: approve
          ? '你的帖子已通过审核'
          : `你的帖子未通过审核${note ? `：${clip(note, 200)}` : ''}`,
      },
    });
    return this.detail(communityId, updated.id, 0);
  }

  async setStatus(
    communityId: number,
    id: number,
    status: CirclePost['status'],
  ) {
    const row = await this.prisma.circlePost.findFirst({
      where: { id, communityId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '帖子不存在');
    const wasPublic = row.status === 'PUBLISHED';
    const nextPublic = status === 'PUBLISHED';
    if (wasPublic !== nextPublic) {
      await this.applyCountDelta(row, nextPublic ? 1 : -1);
      await this.adjustTopicCounts(row.id, nextPublic ? 1 : -1);
    }
    const updated = await this.prisma.circlePost.update({
      where: { id: row.id },
      data: { status },
    });
    return this.detail(communityId, updated.id, 0);
  }

  async pin(communityId: number, id: number, pinned: boolean) {
    const row = await this.prisma.circlePost.findFirst({
      where: { id, communityId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '帖子不存在');
    const updated = await this.prisma.circlePost.update({
      where: { id: row.id },
      data: { isPinned: pinned },
    });
    return this.detail(communityId, updated.id, 0);
  }

  async feature(communityId: number, id: number, featured: boolean) {
    const row = await this.prisma.circlePost.findFirst({
      where: { id, communityId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '帖子不存在');
    const updated = await this.prisma.circlePost.update({
      where: { id: row.id },
      data: { isFeatured: featured },
    });
    return this.detail(communityId, updated.id, 0);
  }

  async remove(communityId: number, id: number) {
    const row = await this.prisma.circlePost.findFirst({
      where: { id, communityId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '帖子不存在');
    await this.hide(communityId, row, 'DELETED', '管理员删除');
    return { ok: true, message: '帖子已删除' };
  }

  private async hide(
    communityId: number,
    row: PostRow,
    status: 'HIDDEN' | 'DELETED',
    note: string,
  ) {
    if (row.status === 'PUBLISHED') {
      await this.applyCountDelta(row, -1);
      await this.adjustTopicCounts(row.id, -1);
    }
    await this.prisma.circlePost.update({
      where: { id: row.id },
      data: { status, auditNote: clip(note, 200) },
    });
    await this.prisma.circleNotification.create({
      data: {
        communityId,
        userId: row.authorUserId,
        type: 'AUDIT',
        targetType: 'POST',
        targetId: row.id,
        postId: row.id,
        content: status === 'DELETED' ? '你的帖子已被删除' : '你的帖子已被隐藏',
      },
    });
  }

  /** 帖子公开状态变化时同步话题帖子数；话题行不存在时跳过，不让计数失败拖垮主链路。 */
  private async adjustTopicCounts(postId: number, delta: 1 | -1) {
    const links = await this.prisma.circlePostTopic.findMany({
      where: { postId },
      select: { topicId: true },
    });
    if (!links.length) return;
    await Promise.all(
      links.map((link) =>
        this.prisma.circleTopic
          .update({
            where: { id: link.topicId },
            data:
              delta > 0
                ? { postCount: { increment: 1 } }
                : { postCount: { decrement: 1 } },
          })
          .catch(() => undefined),
      ),
    );
  }

  private async applyCountDelta(row: PostRow, delta: 1 | -1) {
    if (delta > 0) {
      await Promise.all([
        this.prisma.circleUser.update({
          where: { id: row.authorUserId },
          data: { postCount: { increment: 1 } },
        }),
        this.prisma.circleGroup.update({
          where: { id: row.groupId },
          data: { postCount: { increment: 1 } },
        }),
      ]);
    } else {
      await Promise.all([
        this.prisma.circleUser.update({
          where: { id: row.authorUserId },
          data: { postCount: { decrement: 1 } },
        }),
        this.prisma.circleGroup.update({
          where: { id: row.groupId },
          data: { postCount: { decrement: 1 } },
        }),
      ]);
    }
  }

  async view(
    community: CommunityRow,
    id: number,
    viewerId: number,
    openid: string,
    ip: string,
  ) {
    return this.detail(community.id, id, viewerId, {
      publicOnly: true,
      visitorKey: visitorKeyOf(openid, ip),
    });
  }

  async myList(
    communityId: number,
    userId: number,
    query: Record<string, unknown>,
  ) {
    const { page, pageSize, offset } = pageArgs(query);
    const [rows, total] = await Promise.all([
      this.prisma.circlePost.findMany({
        where: {
          communityId,
          authorUserId: userId,
          status: { not: 'DELETED' },
        },
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      this.prisma.circlePost.count({
        where: {
          communityId,
          authorUserId: userId,
          status: { not: 'DELETED' },
        },
      }),
    ]);
    return {
      list: await this.shapeList(communityId, rows, userId),
      total,
      page,
      pageSize,
    };
  }

  async myFavorites(
    communityId: number,
    userId: number,
    query: Record<string, unknown>,
  ) {
    const { page, pageSize, offset } = pageArgs(query);
    const likes = await this.prisma.circlePostFavorite.findMany({
      where: { communityId, userId },
      orderBy: { id: 'desc' },
      skip: offset,
      take: pageSize,
    });
    const ids = likes.map((row) => row.postId);
    const [rows, total] = await Promise.all([
      this.prisma.circlePost.findMany({
        where: { communityId, id: { in: ids }, status: 'PUBLISHED' },
      }),
      this.prisma.circlePostFavorite.count({ where: { communityId, userId } }),
    ]);
    const order = new Map(ids.map((id, index) => [id, index]));
    rows.sort((a, b) => (order.get(a.id) || 0) - (order.get(b.id) || 0));
    return {
      list: await this.shapeList(communityId, rows, userId),
      total,
      page,
      pageSize,
    };
  }

  async search(
    communityId: number,
    viewerId: number,
    query: Record<string, unknown>,
  ) {
    return this.publicList(communityId, viewerId, {
      ...query,
      tab: 'latest',
    });
  }

  topics(communityId: number) {
    return this.prisma.circleTopic.findMany({
      where: { communityId, enabled: true },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      take: 100,
      select: { id: true, name: true, postCount: true },
    });
  }

  async adminTopics(communityId: number) {
    const rows = await this.prisma.circleTopic.findMany({
      where: { communityId },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      take: 200,
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      postCount: row.postCount,
      enabled: row.enabled,
      sort: row.sort,
    }));
  }

  async topicSave(
    communityId: number,
    body: {
      id?: number;
      name: string;
      description: string;
      sort: number;
      enabled: boolean;
    },
  ) {
    const name = clip(body.name, 30);
    try {
      if (body.id) {
        const existing = await this.prisma.circleTopic.findFirst({
          where: { id: body.id, communityId },
        });
        if (!existing)
          throw new BusinessException(ErrorCode.NOT_FOUND, '话题不存在');
        const updated = await this.prisma.circleTopic.update({
          where: { id: existing.id },
          data: {
            name,
            description: clip(body.description, 200),
            sort: Math.max(0, Math.floor(body.sort)),
            enabled: body.enabled,
          },
        });
        return {
          id: updated.id,
          name: updated.name,
          description: updated.description,
          postCount: updated.postCount,
          enabled: updated.enabled,
          sort: updated.sort,
        };
      }
      const created = await this.prisma.circleTopic.create({
        data: {
          communityId,
          name,
          description: clip(body.description, 200),
          sort: Math.max(0, Math.floor(body.sort)),
          enabled: body.enabled,
        },
      });
      return {
        id: created.id,
        name: created.name,
        description: created.description,
        postCount: created.postCount,
        enabled: created.enabled,
        sort: created.sort,
      };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      throw new BusinessException(ErrorCode.CONFLICT, '话题名称已存在');
    }
  }

  async topicRemove(communityId: number, id: number) {
    const row = await this.prisma.circleTopic.findFirst({
      where: { id, communityId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '话题不存在');
    if (row.postCount > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `该话题下还有 ${row.postCount} 条帖子，请先停用而不是删除`,
      );
    }
    await this.prisma.circleTopic.delete({ where: { id: row.id } });
    return { ok: true, message: '话题已删除' };
  }
}
