import type {
  CirclePublicLoginResult,
  CirclePublicProfileSaveBody,
  CircleUser,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { Prisma } from '../../generated/prisma';
import type { PrismaService } from '../prisma/prisma.service';
import {
  issueCustomerToken,
  parseCustomerToken,
} from '../private-mini/customer-token';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { MiniProgramClient } from '../miniprogram/miniprogram.client';
import type { PublishReviewService } from '../moderation/publish-review.service';
import type { CircleCommunityService } from './circle.community.service';
import {
  CIRCLE_SCENE,
  clip,
  dayKey,
  iso,
  pageArgs,
  viewerOf,
} from './circle.shared';

type UserRow = Prisma.CircleUserGetPayload<object>;
type CommunityRow = Prisma.CircleCommunityGetPayload<object>;

/**
 * C 端成员：每个社区一套身份（openid 只在社区内唯一），与站内账号物理隔离。
 * 令牌沿用 private-mini 顾客 issuer，scene=CIRCLE + shopId=communityId，进不了 /enterprise/**。
 */
export class CircleUserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly community: CircleCommunityService,
    private readonly miniApp: MiniAppService,
    private readonly client: MiniProgramClient,
    private readonly review: PublishReviewService,
  ) {}

  private subject(row: CommunityRow) {
    return this.community.subject(row.ownerUserId, row.name);
  }

  private async row(userId: number, communityId: number): Promise<UserRow> {
    const row = await this.prisma.circleUser.findFirst({
      where: { id: userId, communityId },
    });
    if (!row)
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '社区身份不存在，请重新登录',
      );
    return row;
  }

  async login(
    community: CommunityRow,
    input: { code: string; nickname: string; avatar: string },
  ): Promise<CirclePublicLoginResult> {
    const runtime = await this.miniApp.requireRuntime(this.subject(community));
    const session = await this.client.code2Session(runtime, input.code);
    const nickname = clip(input.nickname, 40);
    const avatar = clip(input.avatar, 500);
    const row = await this.prisma.circleUser.upsert({
      where: {
        communityId_openid: {
          communityId: community.id,
          openid: session.openId,
        },
      },
      create: {
        communityId: community.id,
        openid: session.openId,
        unionid: session.unionId || '',
        nickname: nickname || '社区用户',
        avatar,
        lastLoginAt: new Date(),
      },
      update: {
        unionid: session.unionId || '',
        lastLoginAt: new Date(),
        ...(nickname ? { nickname } : {}),
        ...(avatar ? { avatar } : {}),
      },
    });
    if (row.status === 'BANNED') {
      throw new BusinessException(ErrorCode.FORBIDDEN, '该社区账号已被封禁');
    }
    const token = issueCustomerToken({
      scene: CIRCLE_SCENE,
      shopId: community.id,
      customerId: row.id,
      openid: row.openid,
    });
    return { token, user: await this.view(row, row.id) };
  }

  async identity(token: string, communityId: number): Promise<UserRow> {
    const payload = parseCustomerToken(token);
    if (payload.scene !== CIRCLE_SCENE || payload.shopId !== communityId) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '登录状态不适用于本社区',
      );
    }
    const row = await this.row(payload.customerId, communityId);
    if (row.status === 'BANNED') {
      throw new BusinessException(ErrorCode.FORBIDDEN, '该社区账号已被封禁');
    }
    return row;
  }

  async optionalIdentity(
    token: string,
    communityId: number,
  ): Promise<UserRow | null> {
    if (!String(token || '').trim()) return null;
    try {
      return await this.identity(token, communityId);
    } catch {
      return null;
    }
  }

  /** 公开主页：按社区内 id 读取，必须带 communityId，防止跨社区枚举。 */
  async identityById(communityId: number, id: number): Promise<UserRow> {
    const row = await this.prisma.circleUser.findFirst({
      where: { id, communityId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '成员不存在');
    return row;
  }

  private async medalsOf(communityId: number, userId: number) {
    const rows = await this.prisma.circleUserMedal.findMany({
      where: { communityId, userId },
      orderBy: { awardedAt: 'desc' },
      take: 20,
    });
    if (!rows.length) return [];
    const medals = await this.prisma.circleMedal.findMany({
      where: { communityId, id: { in: rows.map((item) => item.medalId) } },
      select: { id: true, name: true, icon: true },
    });
    const map = new Map(medals.map((item) => [item.id, item]));
    return rows
      .map((item) => map.get(item.medalId))
      .filter(
        (item): item is { id: number; name: string; icon: string } => !!item,
      );
  }

  async view(row: UserRow, viewerId: number): Promise<CircleUser> {
    const medals = await this.medalsOf(row.communityId, row.id);
    const following =
      viewerId && viewerId !== row.id
        ? await this.prisma.circleUserFollow.count({
            where: {
              followerId: viewerId,
              targetUserId: row.id,
              communityId: row.communityId,
            },
          })
        : 0;
    return {
      id: row.id,
      nickname: row.nickname || '社区用户',
      avatar: row.avatar,
      bio: row.bio,
      gender: row.gender,
      status: row.status as CircleUser['status'],
      postCount: row.postCount,
      followerCount: row.followerCount,
      followingCount: row.followingCount,
      isFollowing: following > 0,
      isSelf: viewerId === row.id,
      medals,
      createdAt: iso(row.createdAt),
    };
  }

  async views(
    rows: UserRow[],
    viewerId: number,
  ): Promise<Map<number, CircleUser>> {
    const ids = rows.filter((row) => row.id !== viewerId).map((row) => row.id);
    const follows = ids.length
      ? await this.prisma.circleUserFollow.findMany({
          where: { followerId: viewerId, targetUserId: { in: ids } },
          select: { targetUserId: true },
        })
      : [];
    const followed = new Set(follows.map((row) => row.targetUserId));
    return new Map(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          nickname: row.nickname || '社区用户',
          avatar: row.avatar,
          bio: row.bio,
          gender: row.gender,
          status: row.status as CircleUser['status'],
          postCount: row.postCount,
          followerCount: row.followerCount,
          followingCount: row.followingCount,
          isFollowing: followed.has(row.id),
          isSelf: viewerId === row.id,
          medals: [],
          createdAt: iso(row.createdAt),
        },
      ]),
    );
  }

  async list(communityId: number, query: Record<string, unknown>) {
    const { page, pageSize, offset } = pageArgs(query);
    const keyword = clip(query.keyword, 60);
    const status = clip(query.status, 16);
    const where: Record<string, unknown> = { communityId };
    if (status) where.status = status;
    if (keyword) {
      where.OR = [
        { nickname: { contains: keyword } },
        { openid: { contains: keyword } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.circleUser.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      this.prisma.circleUser.count({ where }),
    ]);
    return {
      list: rows.map((row) => this.viewSync(row)),
      total,
      page,
      pageSize,
    };
  }

  private viewSync(row: UserRow): CircleUser {
    return {
      id: row.id,
      nickname: row.nickname || '社区用户',
      avatar: row.avatar,
      bio: row.bio,
      gender: row.gender,
      status: row.status as CircleUser['status'],
      postCount: row.postCount,
      followerCount: row.followerCount,
      followingCount: row.followingCount,
      isFollowing: false,
      isSelf: false,
      medals: [],
      createdAt: iso(row.createdAt),
    };
  }

  async setStatus(
    communityId: number,
    id: number,
    status: CircleUser['status'],
  ): Promise<CircleUser> {
    const row = await this.prisma.circleUser.findFirst({
      where: { id, communityId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '成员不存在');
    const updated = await this.prisma.circleUser.update({
      where: { id: row.id },
      data: { status },
    });
    return this.viewSync(updated);
  }

  async saveProfile(
    communityId: number,
    userId: number,
    body: CirclePublicProfileSaveBody,
  ): Promise<CircleUser> {
    const row = await this.prisma.circleUser.findFirst({
      where: { id: userId, communityId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '成员不存在');
    if (row.status === 'BANNED') {
      throw new BusinessException(ErrorCode.FORBIDDEN, '该社区账号已被封禁');
    }
    const nickname = clip(body.nickname, 40) || row.nickname;
    const bio = clip(body.bio, 200);
    await this.review.guard({
      scene: 'community_post',
      userId: `circle:${communityId}:${userId}`,
      texts: [nickname, bio],
    });
    const updated = await this.prisma.circleUser.update({
      where: { id: row.id },
      data: {
        nickname,
        avatar: clip(body.avatar, 500),
        bio,
        gender: Math.min(2, Math.max(0, Math.floor(body.gender))),
      },
    });
    return this.view(updated, userId);
  }

  async follow(
    communityId: number,
    userId: number,
    targetUserId: number,
    follow: boolean,
  ): Promise<CircleUser> {
    if (userId === targetUserId) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '不能关注自己');
    }
    const target = await this.prisma.circleUser.findFirst({
      where: { id: targetUserId, communityId },
    });
    if (!target) throw new BusinessException(ErrorCode.NOT_FOUND, '成员不存在');
    if (follow) {
      try {
        await this.prisma.circleUserFollow.create({
          data: { communityId, followerId: userId, targetUserId },
        });
        await this.prisma.circleUser.update({
          where: { id: targetUserId },
          data: { followerCount: { increment: 1 } },
        });
        await this.prisma.circleUser.update({
          where: { id: userId },
          data: { followingCount: { increment: 1 } },
        });
        await this.prisma.circleNotification.create({
          data: {
            communityId,
            userId: targetUserId,
            type: 'FOLLOW',
            actorUserId: userId,
            targetType: 'USER',
            targetId: userId,
            content: '关注了你',
          },
        });
      } catch (error) {
        if ((error as { code?: string })?.code !== 'P2002') throw error;
      }
    } else {
      const deleted = await this.prisma.circleUserFollow.deleteMany({
        where: { communityId, followerId: userId, targetUserId },
      });
      if (deleted.count) {
        await this.prisma.circleUser.update({
          where: { id: targetUserId },
          data: { followerCount: { decrement: 1 } },
        });
        await this.prisma.circleUser.update({
          where: { id: userId },
          data: { followingCount: { decrement: 1 } },
        });
      }
    }
    return this.view(target, userId);
  }

  /** 管理端/公开侧共用的「当前查看者是否已关注」批量口径。 */
  async followingSet(
    communityId: number,
    userId: number,
    ids: number[],
  ): Promise<Set<number>> {
    if (!userId || !ids.length) return new Set();
    const rows = await this.prisma.circleUserFollow.findMany({
      where: { communityId, followerId: userId, targetUserId: { in: ids } },
      select: { targetUserId: true },
    });
    return new Set(rows.map((row) => row.targetUserId));
  }

  async viewer(userId: number, communityId: number) {
    const row = await this.prisma.circleUser.findFirst({
      where: { id: userId, communityId },
      select: { id: true, nickname: true, avatar: true },
    });
    return row ? viewerOf(row) : null;
  }

  async todayCount(communityId: number) {
    return this.prisma.circleUser.count({
      where: { communityId, createdAt: { gte: dayKey() } },
    });
  }
}
