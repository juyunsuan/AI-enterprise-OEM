import type {
  CircleAdminCommunity,
  CircleAdminSettings,
  CircleCommunity,
  CircleCommunitySaveBody,
  CircleMeta,
  CircleOverview,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { Prisma } from '../../generated/prisma';
import type { PrismaService } from '../prisma/prisma.service';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { UserLookupService } from '../directory/user-lookup.service';
import {
  CIRCLE_PLATFORM_SETTINGS_KEY,
  CIRCLE_SCENE,
  CIRCLE_DEFAULT_SETTINGS,
  clip,
  communityCode,
  dayKey,
  iso,
  isUniqueViolation,
  pageArgs,
  settingsOf,
  type CirclePlatformSettings,
} from './circle.shared';

type CommunityRow = Prisma.CircleCommunityGetPayload<object>;

export type CircleAppSubject = {
  ownerUserId: string;
  scene: typeof CIRCLE_SCENE;
  shopId: number;
  shopName: string;
};

/**
 * 社区实例与平台参数。
 *
 * 一个账号一个社区：第一次进「建站管理 → 圈子社区」时自动落一条 DRAFT 行，
 * 账号负责人就是管理员；C 端成员不落站内 User。平台侧只做板块开关、默认审核口径与停服。
 */
export class CircleCommunityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly miniApp: MiniAppService,
    private readonly users: UserLookupService,
  ) {}

  /** 小程序主体归属：账号级（shopId=0），与快递/卡密同一口径。 */
  subject(ownerUserId: string, shopName = '圈子社区'): CircleAppSubject {
    return { ownerUserId, scene: CIRCLE_SCENE, shopId: 0, shopName };
  }

  async settings(): Promise<CirclePlatformSettings> {
    const row = await this.prisma.systemSetting
      .findUnique({ where: { key: CIRCLE_PLATFORM_SETTINGS_KEY } })
      .catch(() => null);
    if (!row?.value) return CIRCLE_DEFAULT_SETTINGS;
    try {
      return settingsOf(JSON.parse(row.value));
    } catch {
      return CIRCLE_DEFAULT_SETTINGS;
    }
  }

  async saveSettings(input: CircleAdminSettings): Promise<CircleAdminSettings> {
    const value: CirclePlatformSettings = {
      enabled: input.enabled,
      defaultPostReview: input.defaultPostReview,
      defaultCommentReview: input.defaultCommentReview,
      maxGroupsPerUser: Math.max(0, Math.floor(input.maxGroupsPerUser)),
      maxPostsPerDay: Math.max(0, Math.floor(input.maxPostsPerDay)),
    };
    await this.prisma.systemSetting.upsert({
      where: { key: CIRCLE_PLATFORM_SETTINGS_KEY },
      update: { value: JSON.stringify(value) },
      create: {
        key: CIRCLE_PLATFORM_SETTINGS_KEY,
        value: JSON.stringify(value),
      },
    });
    return value;
  }

  /** 首次进入自动建社区：DRAFT 不影响 C 端（公开通道只认 ONLINE）。 */
  async ensure(userId: string): Promise<CommunityRow> {
    const existing = await this.prisma.circleCommunity.findUnique({
      where: { ownerUserId: userId },
    });
    if (existing) return existing;
    const platform = await this.settings();
    try {
      const created = await this.prisma.circleCommunity.create({
        data: {
          ownerUserId: userId,
          code: communityCode(),
          name: '我的圈子社区',
          status: 'DRAFT',
          postReview: platform.defaultPostReview,
          commentReview: platform.defaultCommentReview,
        },
      });
      await this.prisma.circleMedal
        .createMany({
          data: [
            {
              communityId: created.id,
              name: '发帖达人',
              type: 'POST',
              threshold: 10,
              sort: 10,
            },
            {
              communityId: created.id,
              name: '评论达人',
              type: 'COMMENT',
              threshold: 50,
              sort: 20,
            },
            {
              communityId: created.id,
              name: '人气之星',
              type: 'FOLLOWER',
              threshold: 20,
              sort: 30,
            },
          ],
        })
        .catch(() => undefined);
      return created;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return this.prisma.circleCommunity.findUniqueOrThrow({
        where: { ownerUserId: userId },
      });
    }
  }

  async rowOf(userId: string): Promise<CommunityRow> {
    return this.ensure(userId);
  }

  private requiresOnline(row: CommunityRow) {
    if (row.status !== 'ONLINE') {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '圈子社区尚未上线或已被平台停用，请到「建站管理 → 圈子社区」检查社区状态',
      );
    }
  }

  /** C 端寻址：优先 AppID，其次公开码；两者都必须指向 ONLINE 社区。 */
  async publicByAppId(appId: string): Promise<CommunityRow> {
    const app = await this.prisma.miniProgramApp.findUnique({
      where: { appId: clip(appId, 64) },
      select: { scene: true, ownerUserId: true },
    });
    if (!app || app.scene !== CIRCLE_SCENE) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '圈子社区不存在或已关闭',
      );
    }
    const row = await this.prisma.circleCommunity.findUnique({
      where: { ownerUserId: app.ownerUserId },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '圈子社区尚未创建');
    this.requiresOnline(row);
    return row;
  }

  async publicByCode(code: string): Promise<CommunityRow> {
    const row = await this.prisma.circleCommunity.findUnique({
      where: { code: clip(code, 16).toUpperCase() },
    });
    if (!row)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '圈子社区不存在或已关闭',
      );
    this.requiresOnline(row);
    return row;
  }

  async publicByOwner(ownerUserId: string): Promise<CommunityRow> {
    const row = await this.prisma.circleCommunity.findUnique({
      where: { ownerUserId },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '圈子社区尚未创建');
    this.requiresOnline(row);
    return row;
  }

  view(row: CommunityRow): CircleCommunity {
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      logo: row.logo,
      cover: row.cover,
      slogan: row.slogan,
      intro: row.intro,
      themeColor: row.themeColor,
      notice: row.notice,
      status: row.status as CircleCommunity['status'],
      joinApproval: row.joinApproval,
      allowUserCreateCircle: row.allowUserCreateCircle,
      postReview: row.postReview,
      commentReview: row.commentReview,
      aiAssistantEnabled: row.aiAssistantEnabled,
      deskSiteKey: row.deskSiteKey,
      servicePhone: row.servicePhone,
      serviceWechat: row.serviceWechat,
      shareImage: row.shareImage,
      agreement: row.agreement,
      privacy: row.privacy,
      about: row.about,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  async counts(communityId: number) {
    const [
      users,
      groups,
      posts,
      comments,
      pendingPosts,
      pendingGroups,
      pendingReports,
    ] = await Promise.all([
      this.prisma.circleUser.count({ where: { communityId } }),
      this.prisma.circleGroup.count({ where: { communityId } }),
      this.prisma.circlePost.count({
        where: { communityId, status: { in: ['PUBLISHED', 'PENDING'] } },
      }),
      this.prisma.circleComment.count({
        where: { communityId, status: 'PUBLISHED' },
      }),
      this.prisma.circlePost.count({
        where: { communityId, status: 'PENDING' },
      }),
      this.prisma.circleGroup.count({
        where: { communityId, status: 'PENDING' },
      }),
      this.prisma.circleReport.count({
        where: { communityId, status: 'PENDING' },
      }),
    ]);
    return {
      users,
      groups,
      posts,
      comments,
      pendingPosts,
      pendingGroups,
      pendingReports,
    };
  }

  /** C 端可拿到的订阅消息模板 ID（模板 ID 不是密钥）；未配置的项返回空串。 */
  async subscribeTemplates(row: CommunityRow) {
    const view = await this.miniApp
      .view(this.subject(row.ownerUserId, row.name))
      .catch(() => null);
    const templates = view?.templates || {};
    return {
      circleComment: templates.circleComment || '',
      circleLike: templates.circleLike || '',
      circleAudit: templates.circleAudit || '',
      circleActivity: templates.circleActivity || '',
    };
  }

  async meta(user: CurrentUser): Promise<CircleMeta> {
    const row = await this.ensure(user.userId);
    const [app, deskSites, counts] = await Promise.all([
      this.miniApp.view(this.subject(user.userId, row.name)),
      this.prisma.serviceDeskSite.findMany({
        where: { ownerUserId: user.userId },
        orderBy: { id: 'desc' },
        select: { siteKey: true, name: true, enabled: true },
      }),
      this.counts(row.id),
    ]);
    return { community: this.view(row), app, deskSites, counts };
  }

  private async usage(communityOwnerUserId: string) {
    const from = dayKey(new Date(Date.now() - 29 * 86400_000));
    const rows = await this.prisma.toolUsageDaily
      .findMany({
        where: {
          userId: communityOwnerUserId,
          toolCode: 'circle',
          day: { gte: from },
        },
        select: { pv: true, views: true, bytes: true },
      })
      .catch(() => [] as { pv: number; views: number; bytes: bigint }[]);
    return rows.reduce(
      (acc, row) => ({
        pv: acc.pv + row.pv,
        views: acc.views + row.views,
        bytes: acc.bytes + Number(row.bytes),
        days: acc.days + 1,
      }),
      { pv: 0, views: 0, bytes: 0, days: 0 },
    );
  }

  async overview(user: CurrentUser): Promise<CircleOverview> {
    const row = await this.ensure(user.userId);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const [counts, todayUsers, todayPosts, todayComments, usage, topGroups] =
      await Promise.all([
        this.counts(row.id),
        this.prisma.circleUser.count({
          where: { communityId: row.id, createdAt: { gte: start } },
        }),
        this.prisma.circlePost.count({
          where: { communityId: row.id, createdAt: { gte: start } },
        }),
        this.prisma.circleComment.count({
          where: { communityId: row.id, createdAt: { gte: start } },
        }),
        this.usage(row.ownerUserId),
        this.prisma.circleGroup.findMany({
          where: { communityId: row.id, status: 'ACTIVE' },
          orderBy: [{ memberCount: 'desc' }, { postCount: 'desc' }],
          take: 5,
          select: { id: true, name: true, memberCount: true, postCount: true },
        }),
      ]);
    return {
      counts,
      today: { users: todayUsers, posts: todayPosts, comments: todayComments },
      usage,
      topGroups,
    };
  }

  async save(
    user: CurrentUser,
    body: CircleCommunitySaveBody,
  ): Promise<CircleCommunity> {
    const row = await this.ensure(user.userId);
    if (body.deskSiteKey) {
      const desk = await this.prisma.serviceDeskSite.findFirst({
        where: { siteKey: body.deskSiteKey, ownerUserId: user.userId },
        select: { id: true },
      });
      if (!desk) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          `客服站点「${body.deskSiteKey}」不存在或不属于当前账号，请到「AI客服 → 站点管理」选择本账号的站点`,
        );
      }
    }
    const updated = await this.prisma.circleCommunity.update({
      where: { id: row.id },
      data: {
        name: clip(body.name, 40) || row.name,
        logo: clip(body.logo, 500),
        cover: clip(body.cover, 500),
        slogan: clip(body.slogan, 80),
        intro: clip(body.intro, 2000),
        themeColor: clip(body.themeColor, 20) || '#1677ff',
        notice: clip(body.notice, 1000),
        joinApproval: body.joinApproval,
        allowUserCreateCircle: body.allowUserCreateCircle,
        postReview: body.postReview,
        commentReview: body.commentReview,
        aiAssistantEnabled: body.aiAssistantEnabled,
        deskSiteKey: clip(body.deskSiteKey, 64),
        servicePhone: clip(body.servicePhone, 30),
        serviceWechat: clip(body.serviceWechat, 60),
        shareImage: clip(body.shareImage, 500),
        agreement: clip(body.agreement, 20000),
        privacy: clip(body.privacy, 20000),
        about: clip(body.about, 20000),
      },
    });
    return this.view(updated);
  }

  async setStatus(
    user: CurrentUser,
    status: 'DRAFT' | 'ONLINE',
  ): Promise<CircleCommunity> {
    const row = await this.ensure(user.userId);
    if (row.status === 'SUSPENDED') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '社区已被平台停用，请联系平台客服恢复后再上线',
      );
    }
    const updated = await this.prisma.circleCommunity.update({
      where: { id: row.id },
      data: { status },
    });
    return this.view(updated);
  }

  async adminList(query: Record<string, unknown>): Promise<{
    list: CircleAdminCommunity[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const { page, pageSize, offset } = pageArgs(query);
    const keyword = clip(query.keyword, 60);
    const status = clip(query.status, 16);
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { code: { contains: keyword.toUpperCase() } },
        { ownerUserId: { contains: keyword } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.circleCommunity.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      this.prisma.circleCommunity.count({ where }),
    ]);
    const ids = rows.map((row) => row.id);
    const [userCounts, groupCounts, postCounts, owners] = await Promise.all([
      this.prisma.circleUser.groupBy({
        by: ['communityId'],
        where: { communityId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.circleGroup.groupBy({
        by: ['communityId'],
        where: { communityId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.circlePost.groupBy({
        by: ['communityId'],
        where: { communityId: { in: ids } },
        _count: { _all: true },
      }),
      this.users.lookup(rows.map((row) => row.ownerUserId)),
    ]);
    const countMap = (
      rowsIn: { communityId: number; _count: { _all: number } }[],
    ) => new Map(rowsIn.map((row) => [row.communityId, row._count._all]));
    const users = countMap(userCounts);
    const groups = countMap(groupCounts);
    const posts = countMap(postCounts);
    const ownerMap = new Map(owners.map((item) => [item.id, item]));
    return {
      list: rows.map((row) => ({
        id: row.id,
        ownerUserId: row.ownerUserId,
        ownerName:
          ownerMap.get(row.ownerUserId)?.displayName ||
          ownerMap.get(row.ownerUserId)?.username ||
          row.ownerUserId,
        name: row.name,
        code: row.code,
        status: row.status as CircleAdminCommunity['status'],
        users: users.get(row.id) || 0,
        groups: groups.get(row.id) || 0,
        posts: posts.get(row.id) || 0,
        offReason: row.offReason,
        createdAt: iso(row.createdAt),
      })),
      total,
      page,
      pageSize,
    };
  }

  async adminStatus(
    id: number,
    status: 'ONLINE' | 'SUSPENDED',
    reason: string,
    adminUserId: string,
  ): Promise<CircleAdminCommunity> {
    const row = await this.prisma.circleCommunity.findUnique({ where: { id } });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '社区不存在');
    const updated = await this.prisma.circleCommunity.update({
      where: { id },
      data: {
        status,
        offBy: status === 'SUSPENDED' ? adminUserId : '',
        offReason: status === 'SUSPENDED' ? clip(reason, 200) : '',
      },
    });
    const counts = await this.counts(id);
    const owner = await this.users.findPublic(updated.ownerUserId);
    return {
      id: updated.id,
      ownerUserId: updated.ownerUserId,
      ownerName: owner?.displayName || owner?.username || updated.ownerUserId,
      name: updated.name,
      code: updated.code,
      status: updated.status as CircleAdminCommunity['status'],
      users: counts.users,
      groups: counts.groups,
      posts: counts.posts,
      offReason: updated.offReason,
      createdAt: iso(updated.createdAt),
    };
  }
}
