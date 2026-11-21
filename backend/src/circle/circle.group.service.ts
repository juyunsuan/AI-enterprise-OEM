import type {
  CircleCategory,
  CircleGroup,
  CircleGroupSaveBody,
  CircleJoinMode,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { Prisma } from '../../generated/prisma';
import type { PrismaService } from '../prisma/prisma.service';
import type { PublishReviewService } from '../moderation/publish-review.service';
import type { CircleCommunityService } from './circle.community.service';
import {
  clip,
  isUniqueViolation,
  iso,
  pageArgs,
  viewerOf,
} from './circle.shared';

type CommunityRow = Prisma.CircleCommunityGetPayload<object>;
type GroupRow = Prisma.CircleGroupGetPayload<object>;
type CategoryRow = Prisma.CircleCategoryGetPayload<object>;
type MemberRow = Prisma.CircleGroupMemberGetPayload<object>;
type UserRow = Prisma.CircleUserGetPayload<object>;

/**
 * 圈子（分组）：管理员建分类、审核圈子；圈主/圈管管理自己的圈子与成员。
 * 所有查询都带 communityId 双条件，C 端请求体里的 id 从不作为权限依据。
 */
export class CircleGroupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly community: CircleCommunityService,
    private readonly review: PublishReviewService,
  ) {}

  // ---------------------------------------------------------------- 分类

  async categoryList(communityId: number): Promise<CircleCategory[]> {
    const [rows, counts] = await Promise.all([
      this.prisma.circleCategory.findMany({
        where: { communityId },
        orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.circleGroup.groupBy({
        by: ['categoryId'],
        where: { communityId },
        _count: { _all: true },
      }),
    ]);
    const map = new Map(counts.map((row) => [row.categoryId, row._count._all]));
    return rows.map((row) => this.categoryView(row, map.get(row.id) || 0));
  }

  private categoryView(row: CategoryRow, groupCount: number): CircleCategory {
    return {
      id: row.id,
      name: row.name,
      icon: row.icon,
      sort: row.sort,
      enabled: row.enabled,
      groupCount,
      createdAt: iso(row.createdAt),
    };
  }

  async categorySave(
    communityId: number,
    body: {
      id?: number;
      name: string;
      icon: string;
      sort: number;
      enabled: boolean;
    },
  ): Promise<CircleCategory> {
    const name = clip(body.name, 30);
    if (body.id) {
      const existing = await this.prisma.circleCategory.findFirst({
        where: { id: body.id, communityId },
      });
      if (!existing)
        throw new BusinessException(ErrorCode.NOT_FOUND, '分类不存在');
      const updated = await this.prisma.circleCategory.update({
        where: { id: existing.id },
        data: {
          name,
          icon: clip(body.icon, 500),
          sort: Math.max(0, Math.floor(body.sort)),
          enabled: body.enabled,
        },
      });
      const count = await this.prisma.circleGroup.count({
        where: { communityId, categoryId: updated.id },
      });
      return this.categoryView(updated, count);
    }
    try {
      const created = await this.prisma.circleCategory.create({
        data: {
          communityId,
          name,
          icon: clip(body.icon, 500),
          sort: Math.max(0, Math.floor(body.sort)),
          enabled: body.enabled,
        },
      });
      return this.categoryView(created, 0);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      throw new BusinessException(ErrorCode.CONFLICT, '分类名称已存在');
    }
  }

  async categoryRemove(communityId: number, id: number) {
    const row = await this.prisma.circleCategory.findFirst({
      where: { id, communityId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '分类不存在');
    const count = await this.prisma.circleGroup.count({
      where: { communityId, categoryId: id },
    });
    if (count > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `该分类下还有 ${count} 个圈子，请先移动或停用这些圈子`,
      );
    }
    await this.prisma.circleCategory.delete({ where: { id } });
    return { ok: true, message: '分类已删除' };
  }

  // ---------------------------------------------------------------- 圈子

  private async creatorMap(rows: GroupRow[]) {
    const ids = [
      ...new Set(rows.map((row) => row.creatorUserId).filter(Boolean)),
    ];
    if (!ids.length) return new Map<number, UserRow>();
    const users = await this.prisma.circleUser.findMany({
      where: { communityId: rows[0].communityId, id: { in: ids } },
    });
    return new Map(users.map((row) => [row.id, row]));
  }

  private async categoryMap(communityId: number) {
    const rows = await this.prisma.circleCategory.findMany({
      where: { communityId },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  private async membershipMap(
    communityId: number,
    userId: number,
    groupIds: number[],
  ) {
    if (!userId || !groupIds.length) return new Map<number, MemberRow>();
    const rows = await this.prisma.circleGroupMember.findMany({
      where: { communityId, userId, groupId: { in: groupIds } },
    });
    return new Map(rows.map((row) => [row.groupId, row]));
  }

  private async followSet(
    communityId: number,
    userId: number,
    groupIds: number[],
  ) {
    if (!userId || !groupIds.length) return new Set<number>();
    const rows = await this.prisma.circleGroupFollow.findMany({
      where: { communityId, userId, groupId: { in: groupIds } },
      select: { groupId: true },
    });
    return new Set(rows.map((row) => row.groupId));
  }

  private shape(
    row: GroupRow,
    categoryName: string,
    creator: UserRow | undefined,
    membership: MemberRow | undefined,
    following: boolean,
  ): CircleGroup {
    return {
      id: row.id,
      categoryId: row.categoryId,
      categoryName,
      creatorUserId: row.creatorUserId,
      creator: creator
        ? viewerOf(creator)
        : { id: 0, nickname: '社区管理员', avatar: '' },
      name: row.name,
      cover: row.cover,
      intro: row.intro,
      rules: row.rules,
      joinMode: row.joinMode as CircleJoinMode,
      status: row.status as CircleGroup['status'],
      rejectReason: row.rejectReason,
      memberCount: row.memberCount,
      postCount: row.postCount,
      followCount: row.followCount,
      isRecommended: row.isRecommended,
      isJoined:
        membership?.status === 'ACTIVE' || membership?.status === 'MUTED',
      isFollowing: following,
      role:
        membership?.status === 'ACTIVE' || membership?.status === 'MUTED'
          ? membership.role
          : '',
      createdAt: iso(row.createdAt),
    };
  }

  async list(communityId: number, query: Record<string, unknown>) {
    const { page, pageSize, offset } = pageArgs(query);
    const keyword = clip(query.keyword, 60);
    const status = clip(query.status, 16);
    const categoryId = Number(query.categoryId || 0);
    const where: Record<string, unknown> = { communityId };
    if (status) where.status = status;
    if (categoryId > 0) where.categoryId = categoryId;
    if (keyword) where.name = { contains: keyword };
    const [rows, total] = await Promise.all([
      this.prisma.circleGroup.findMany({
        where,
        orderBy: [{ isRecommended: 'desc' }, { sort: 'asc' }, { id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.circleGroup.count({ where }),
    ]);
    const [categories, creators] = await Promise.all([
      this.categoryMap(communityId),
      this.creatorMap(rows),
    ]);
    return {
      list: rows.map((row) =>
        this.shape(
          row,
          categories.get(row.categoryId) || '未分类',
          creators.get(row.creatorUserId),
          undefined,
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
    const keyword = clip(query.keyword, 60);
    const categoryId = Number(query.categoryId || 0);
    const where: Record<string, unknown> = { communityId, status: 'ACTIVE' };
    if (categoryId > 0) where.categoryId = categoryId;
    if (keyword) where.name = { contains: keyword };
    const [rows, total] = await Promise.all([
      this.prisma.circleGroup.findMany({
        where,
        orderBy: [
          { isRecommended: 'desc' },
          { memberCount: 'desc' },
          { id: 'desc' },
        ],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.circleGroup.count({ where }),
    ]);
    const ids = rows.map((row) => row.id);
    const [categories, creators, memberships, follows] = await Promise.all([
      this.categoryMap(communityId),
      this.creatorMap(rows),
      this.membershipMap(communityId, viewerId, ids),
      this.followSet(communityId, viewerId, ids),
    ]);
    return {
      list: rows.map((row) =>
        this.shape(
          row,
          categories.get(row.categoryId) || '未分类',
          creators.get(row.creatorUserId),
          memberships.get(row.id),
          follows.has(row.id),
        ),
      ),
      total,
      page,
      pageSize,
    };
  }

  async hot(
    communityId: number,
    viewerId: number,
    limit = 8,
  ): Promise<CircleGroup[]> {
    const rows = await this.prisma.circleGroup.findMany({
      where: { communityId, status: 'ACTIVE' },
      orderBy: [{ isRecommended: 'desc' }, { memberCount: 'desc' }],
      take: limit,
    });
    const ids = rows.map((row) => row.id);
    const [categories, creators, memberships, follows] = await Promise.all([
      this.categoryMap(communityId),
      this.creatorMap(rows),
      this.membershipMap(communityId, viewerId, ids),
      this.followSet(communityId, viewerId, ids),
    ]);
    return rows.map((row) =>
      this.shape(
        row,
        categories.get(row.categoryId) || '未分类',
        creators.get(row.creatorUserId),
        memberships.get(row.id),
        follows.has(row.id),
      ),
    );
  }

  async requireGroup(
    communityId: number,
    id: number,
    publicOnly = false,
  ): Promise<GroupRow> {
    const row = await this.prisma.circleGroup.findFirst({
      where: { id, communityId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '圈子不存在');
    if (publicOnly && row.status !== 'ACTIVE') {
      throw new BusinessException(ErrorCode.NOT_FOUND, '圈子不存在或已停用');
    }
    return row;
  }

  async detail(
    communityId: number,
    id: number,
    viewerId: number,
  ): Promise<CircleGroup> {
    const row = await this.requireGroup(communityId, id, true);
    const [category, creator, membership, following] = await Promise.all([
      this.prisma.circleCategory.findFirst({
        where: { id: row.categoryId, communityId },
        select: { name: true },
      }),
      row.creatorUserId
        ? this.prisma.circleUser.findFirst({
            where: { id: row.creatorUserId, communityId },
          })
        : null,
      this.prisma.circleGroupMember.findUnique({
        where: { groupId_userId: { groupId: id, userId: viewerId || 0 } },
      }),
      this.prisma.circleGroupFollow.count({
        where: { communityId, groupId: id, userId: viewerId || 0 },
      }),
    ]);
    return this.shape(
      row,
      category?.name || '未分类',
      creator || undefined,
      membership || undefined,
      following > 0,
    );
  }

  async apply(
    community: CommunityRow,
    userId: number,
    body: CircleGroupSaveBody,
  ): Promise<CircleGroup> {
    if (!community.allowUserCreateCircle) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '当前社区只允许管理员创建圈子',
      );
    }
    const platform = await this.community.settings();
    const owned = await this.prisma.circleGroup.count({
      where: { communityId: community.id, creatorUserId: userId },
    });
    if (owned >= platform.maxGroupsPerUser) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        `每人最多创建 ${platform.maxGroupsPerUser} 个圈子，请先管理已有圈子`,
      );
    }
    const category = await this.prisma.circleCategory.findFirst({
      where: { id: body.categoryId, communityId: community.id, enabled: true },
    });
    if (!category)
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请选择有效的圈子分类',
      );
    await this.review.guard({
      scene: 'community_post',
      userId: `circle:${community.id}:${userId}`,
      texts: [body.name, body.intro, body.rules],
    });
    let created: GroupRow;
    try {
      created = await this.prisma.circleGroup.create({
        data: {
          communityId: community.id,
          categoryId: category.id,
          creatorUserId: userId,
          name: clip(body.name, 40),
          cover: clip(body.cover, 500),
          intro: clip(body.intro, 2000),
          rules: clip(body.rules, 5000),
          joinMode: body.joinMode,
          status: 'PENDING',
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      throw new BusinessException(ErrorCode.CONFLICT, '你已提交过同名圈子');
    }
    await this.prisma.circleGroupMember.create({
      data: {
        communityId: community.id,
        groupId: created.id,
        userId,
        role: 'OWNER',
        status: 'ACTIVE',
      },
    });
    await this.prisma.circleGroup.update({
      where: { id: created.id },
      data: { memberCount: 1 },
    });
    return this.detail(community.id, created.id, userId);
  }

  /** 管理员直接建圈（不走审核）；creatorUserId=0 表示社区管理员创建。 */
  async adminSave(
    communityId: number,
    body: CircleGroupSaveBody,
  ): Promise<CircleGroup> {
    const category = await this.prisma.circleCategory.findFirst({
      where: { id: body.categoryId, communityId },
    });
    if (!category)
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请选择有效的圈子分类',
      );
    if (body.id) {
      const row = await this.requireGroup(communityId, body.id);
      const updated = await this.prisma.circleGroup.update({
        where: { id: row.id },
        data: {
          categoryId: category.id,
          name: clip(body.name, 40),
          cover: clip(body.cover, 500),
          intro: clip(body.intro, 2000),
          rules: clip(body.rules, 5000),
          joinMode: body.joinMode,
        },
      });
      return this.detail(communityId, updated.id, 0);
    }
    const created = await this.prisma.circleGroup.create({
      data: {
        communityId,
        categoryId: category.id,
        creatorUserId: 0,
        name: clip(body.name, 40),
        cover: clip(body.cover, 500),
        intro: clip(body.intro, 2000),
        rules: clip(body.rules, 5000),
        joinMode: body.joinMode,
        status: 'ACTIVE',
        auditedBy: 'owner',
        auditedAt: new Date(),
      },
    });
    return this.detail(communityId, created.id, 0);
  }

  /**
   * 删除圈子：有帖子时拒绝（避免帖子变成无圈子的孤儿内容），由管理员先停用；
   * 无帖子时连同成员与关注一起清理，避免留下指向已删圈子的关联行。
   */
  async remove(communityId: number, id: number) {
    const row = await this.requireGroup(communityId, id);
    const postCount = await this.prisma.circlePost.count({
      where: { communityId, groupId: id, status: { not: 'DELETED' } },
    });
    if (postCount > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `该圈子下还有 ${postCount} 条帖子，请先停用圈子而不是删除`,
      );
    }
    await this.prisma.$transaction([
      this.prisma.circleGroupMember.deleteMany({
        where: { communityId, groupId: id },
      }),
      this.prisma.circleGroupFollow.deleteMany({
        where: { communityId, groupId: id },
      }),
      this.prisma.circleGroup.delete({ where: { id: row.id } }),
    ]);
    return { ok: true, message: '圈子已删除' };
  }

  async audit(
    communityId: number,
    id: number,
    approve: boolean,
    note: string,
  ): Promise<CircleGroup> {
    const row = await this.requireGroup(communityId, id);
    const updated = await this.prisma.circleGroup.update({
      where: { id: row.id },
      data: {
        status: approve ? 'ACTIVE' : 'REJECTED',
        rejectReason: approve ? '' : clip(note, 200),
        auditedBy: 'owner',
        auditedAt: new Date(),
      },
    });
    if (row.creatorUserId) {
      await this.prisma.circleNotification.create({
        data: {
          communityId,
          userId: row.creatorUserId,
          type: 'AUDIT',
          targetType: 'GROUP',
          targetId: row.id,
          content: approve
            ? `圈子「${row.name}」已通过审核`
            : `圈子「${row.name}」未通过审核${note ? `：${clip(note, 200)}` : ''}`,
        },
      });
    }
    return this.detail(communityId, updated.id, 0);
  }

  async setStatus(
    communityId: number,
    id: number,
    status: CircleGroup['status'],
  ): Promise<CircleGroup> {
    const row = await this.requireGroup(communityId, id);
    const updated = await this.prisma.circleGroup.update({
      where: { id: row.id },
      data: { status },
    });
    return this.detail(communityId, updated.id, 0);
  }

  async recommend(
    communityId: number,
    id: number,
    recommended: boolean,
  ): Promise<CircleGroup> {
    const row = await this.requireGroup(communityId, id);
    const updated = await this.prisma.circleGroup.update({
      where: { id: row.id },
      data: { isRecommended: recommended },
    });
    return this.detail(communityId, updated.id, 0);
  }

  async join(
    communityId: number,
    id: number,
    userId: number,
  ): Promise<CircleGroup> {
    const row = await this.requireGroup(communityId, id, true);
    const existing = await this.prisma.circleGroupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId } },
    });
    if (existing?.status === 'BANNED') {
      throw new BusinessException(ErrorCode.FORBIDDEN, '你已被该圈子封禁');
    }
    if (existing?.status === 'ACTIVE' || existing?.status === 'MUTED') {
      return this.detail(communityId, id, userId);
    }
    const active = row.joinMode === 'FREE' || existing?.status === 'PENDING';
    if (active) {
      await this.prisma.circleGroupMember.upsert({
        where: { groupId_userId: { groupId: id, userId } },
        create: {
          communityId,
          groupId: id,
          userId,
          role: 'MEMBER',
          status: 'ACTIVE',
        },
        update: { status: 'ACTIVE' },
      });
      await this.prisma.circleGroup.update({
        where: { id },
        data: { memberCount: { increment: 1 } },
      });
      await this.prisma.circleNotification.create({
        data: {
          communityId,
          userId,
          type: 'JOIN',
          targetType: 'GROUP',
          targetId: id,
          content: `已加入圈子「${row.name}」`,
        },
      });
    } else {
      await this.prisma.circleGroupMember.upsert({
        where: { groupId_userId: { groupId: id, userId } },
        create: {
          communityId,
          groupId: id,
          userId,
          role: 'MEMBER',
          status: 'PENDING',
        },
        update: { status: 'PENDING' },
      });
    }
    return this.detail(communityId, id, userId);
  }

  async leave(communityId: number, id: number, userId: number) {
    const row = await this.requireGroup(communityId, id);
    const member = await this.prisma.circleGroupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId } },
    });
    if (!member) return { ok: true, message: '已退出圈子' };
    if (member.role === 'OWNER') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '圈主不能退出自己的圈子',
      );
    }
    await this.prisma.circleGroupMember.delete({ where: { id: member.id } });
    if (member.status === 'ACTIVE' || member.status === 'MUTED') {
      await this.prisma.circleGroup.update({
        where: { id: row.id },
        data: { memberCount: { decrement: 1 } },
      });
    }
    return { ok: true, message: '已退出圈子' };
  }

  async follow(
    communityId: number,
    id: number,
    userId: number,
    follow: boolean,
  ): Promise<CircleGroup> {
    const row = await this.requireGroup(communityId, id, true);
    if (follow) {
      try {
        await this.prisma.circleGroupFollow.create({
          data: { communityId, groupId: id, userId },
        });
        await this.prisma.circleGroup.update({
          where: { id },
          data: { followCount: { increment: 1 } },
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    } else {
      const deleted = await this.prisma.circleGroupFollow.deleteMany({
        where: { communityId, groupId: id, userId },
      });
      if (deleted.count) {
        await this.prisma.circleGroup.update({
          where: { id: row.id },
          data: { followCount: { decrement: 1 } },
        });
      }
    }
    return this.detail(communityId, id, userId);
  }

  async members(
    communityId: number,
    groupId: number,
    viewerId: number,
    query: Record<string, unknown>,
  ) {
    const group = await this.requireGroup(communityId, groupId);
    const mine = await this.prisma.circleGroupMember.findUnique({
      where: { groupId_userId: { groupId, userId: viewerId } },
    });
    const isManager =
      !!mine &&
      (mine.role === 'OWNER' || mine.role === 'ADMIN') &&
      (mine.status === 'ACTIVE' || mine.status === 'MUTED');
    if (!isManager && group.status !== 'ACTIVE') {
      throw new BusinessException(ErrorCode.FORBIDDEN, '圈子尚未开放');
    }
    const { page, pageSize, offset } = pageArgs(query);
    const status = clip(query.status, 16) || 'ACTIVE';
    const where = { communityId, groupId, status };
    const [rows, total] = await Promise.all([
      this.prisma.circleGroupMember.findMany({
        where,
        orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.circleGroupMember.count({ where }),
    ]);
    const users = await this.prisma.circleUser.findMany({
      where: { communityId, id: { in: rows.map((row) => row.userId) } },
    });
    const userMap = new Map(users.map((row) => [row.id, row]));
    return {
      list: rows.map((row) => ({
        userId: row.userId,
        role: row.role,
        status: row.status,
        joinedAt: iso(row.joinedAt),
        user: userMap.has(row.userId)
          ? viewerOf(userMap.get(row.userId)!)
          : { id: row.userId, nickname: '社区用户', avatar: '' },
      })),
      total,
      page,
      pageSize,
      canManage: isManager,
    };
  }

  async memberAction(
    communityId: number,
    groupId: number,
    actorId: number,
    body: { userId: number; action: 'APPROVE' | 'REMOVE' | 'MUTE' | 'BAN' },
  ) {
    const group = await this.requireGroup(communityId, groupId);
    const actor = await this.prisma.circleGroupMember.findUnique({
      where: { groupId_userId: { groupId, userId: actorId } },
    });
    if (
      !actor ||
      (actor.role !== 'OWNER' && actor.role !== 'ADMIN') ||
      (actor.status !== 'ACTIVE' && actor.status !== 'MUTED')
    ) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '只有圈主或圈管可以管理成员',
      );
    }
    const target = await this.prisma.circleGroupMember.findUnique({
      where: { groupId_userId: { groupId, userId: body.userId } },
    });
    if (!target) throw new BusinessException(ErrorCode.NOT_FOUND, '成员不存在');
    if (target.role === 'OWNER') {
      throw new BusinessException(ErrorCode.FORBIDDEN, '不能操作圈主');
    }
    if (body.action === 'APPROVE') {
      const updated = await this.prisma.circleGroupMember.update({
        where: { id: target.id },
        data: { status: 'ACTIVE' },
      });
      if (target.status === 'PENDING') {
        await this.prisma.circleGroup.update({
          where: { id: group.id },
          data: { memberCount: { increment: 1 } },
        });
      }
      await this.prisma.circleNotification.create({
        data: {
          communityId,
          userId: body.userId,
          type: 'JOIN',
          targetType: 'GROUP',
          targetId: groupId,
          content: `你加入圈子「${group.name}」的申请已通过`,
        },
      });
      return { ok: true, message: '已通过加入申请', status: updated.status };
    }
    if (body.action === 'REMOVE') {
      await this.prisma.circleGroupMember.delete({ where: { id: target.id } });
      if (target.status === 'ACTIVE' || target.status === 'MUTED') {
        await this.prisma.circleGroup.update({
          where: { id: group.id },
          data: { memberCount: { decrement: 1 } },
        });
      }
      return { ok: true, message: '已移出圈子', status: 'REMOVED' };
    }
    const status = body.action === 'MUTE' ? 'MUTED' : 'BANNED';
    await this.prisma.circleGroupMember.update({
      where: { id: target.id },
      data: { status },
    });
    return {
      ok: true,
      message: body.action === 'MUTE' ? '已禁言' : '已封禁',
      status,
    };
  }

  async updateByManager(
    communityId: number,
    actorId: number,
    body: CircleGroupSaveBody & { id: number },
  ) {
    const group = await this.requireGroup(communityId, body.id);
    const actor = await this.prisma.circleGroupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: actorId } },
    });
    if (
      !actor ||
      (actor.role !== 'OWNER' && actor.role !== 'ADMIN') ||
      (actor.status !== 'ACTIVE' && actor.status !== 'MUTED')
    ) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '只有圈主或圈管可以编辑圈子',
      );
    }
    const category = await this.prisma.circleCategory.findFirst({
      where: { id: body.categoryId, communityId },
    });
    if (!category)
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请选择有效的圈子分类',
      );
    await this.review.guard({
      scene: 'community_post',
      userId: `circle:${communityId}:${actorId}`,
      texts: [body.name, body.intro, body.rules],
    });
    const updated = await this.prisma.circleGroup.update({
      where: { id: group.id },
      data: {
        categoryId: category.id,
        name: clip(body.name, 40),
        cover: clip(body.cover, 500),
        intro: clip(body.intro, 2000),
        rules: clip(body.rules, 5000),
        joinMode: body.joinMode,
      },
    });
    return this.detail(communityId, updated.id, actorId);
  }
}
