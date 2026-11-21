import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Context, Input } from 'hono';
import {
  circlePublicCommentCreateBodySchema,
  circlePublicGroupApplyBodySchema,
  circlePublicLoginBodySchema,
  circlePublicPostCreateBodySchema,
  circlePublicProfileSaveBodySchema,
  circlePublicReportBodySchema,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { RateWindow } from '../common/rate-window';
import type { ApiEnv } from '../http/types';
import type { Services } from '../http/services';
import { toolOpen } from '../tool-launch/tool-launch.holder';
import { clip, viewerOf } from './circle.shared';

function clientIp(c: Context<ApiEnv, string, Input>) {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
    c.req.header('x-real-ip') ||
    ''
  ).slice(0, 64);
}

function tokenOf(c: Context<ApiEnv, string, Input>) {
  return (
    c.req.header('authorization') || c.req.header('x-customer-token') || ''
  );
}

/**
 * 圈子社区 C 端公开通道（`/api/public/circle/**`，免站内鉴权）。
 *
 * 五条边界：
 * 1. 社区一律按 AppID 或公开码解析，**端上传的 communityId 从不作为权限依据**；
 * 2. 成员令牌 scene=CIRCLE + communityId + circleUserId，进不了 `/enterprise/**`；
 * 3. 未启动/平台停用/欠费停服时整条公开通道停服（与快递/卡密同一闸门）；
 * 4. 帖子浏览按访客去重计量，按浏览量口径出账时只认这份事实；
 * 5. 匿名只开放浏览与登录，发帖/评论/举报/消息必须带成员令牌。
 */
export function registerCirclePublic(
  app: OpenAPIHono<ApiEnv>,
  services: Services,
) {
  const anonWindow = new RateWindow(240, 60_000);
  const writeWindow = new RateWindow(60, 60_000);
  const loginWindow = new RateWindow(20, 60_000);
  const uploadWindow = new RateWindow(20, 60_000);

  const guard = (
    window: InstanceType<typeof RateWindow>,
    c: Context<ApiEnv, string, Input>,
    message: string,
  ) => window.consume(clientIp(c) || 'unknown', message);

  const communityOf = async (c: Context<ApiEnv, string, Input>) => {
    const appId = clip(c.req.query('appId'), 64);
    const code = clip(c.req.query('code'), 16).toUpperCase();
    if (!appId && !code) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '缺少社区标识：请用小程序 AppID 或社区码访问',
      );
    }
    const row = appId
      ? await services.circle.communityService.publicByAppId(appId)
      : await services.circle.communityService.publicByCode(code);
    if (!(await toolOpen('circle', row.ownerUserId))) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该圈子社区尚未启动（或已停服），请到「建站管理 → 启动设置」启动后重试',
      );
    }
    return row;
  };

  const viewerOfRequest = async (
    c: Context<ApiEnv, string, Input>,
    communityId: number,
  ) => services.circle.userService.optionalIdentity(tokenOf(c), communityId);

  const requireViewer = async (
    c: Context<ApiEnv, string, Input>,
    communityId: number,
  ) => {
    const row = await viewerOfRequest(c, communityId);
    if (!row) {
      throw new BusinessException(ErrorCode.UNAUTHORIZED, '请先登录社区');
    }
    return row;
  };

  // ---------------------------------------------------------------- 启动与登录

  app.get('/api/public/circle/bootstrap', async (c) => {
    guard(anonWindow, c, '访问过于频繁，请稍后重试');
    const row = await communityOf(c);
    const viewer = await viewerOfRequest(c, row.id);
    const [categories, hotGroups, subscribeTemplates] = await Promise.all([
      services.circle.groupService.categoryList(row.id),
      services.circle.groupService.hot(row.id, viewer?.id || 0, 8),
      services.circle.communityService.subscribeTemplates(row),
    ]);
    return c.json({
      community: {
        code: row.code,
        name: row.name,
        logo: row.logo,
        cover: row.cover,
        slogan: row.slogan,
        intro: row.intro,
        themeColor: row.themeColor,
        notice: row.notice,
        servicePhone: row.servicePhone,
        serviceWechat: row.serviceWechat,
        joinApproval: row.joinApproval,
        allowUserCreateCircle: row.allowUserCreateCircle,
        aiAssistantEnabled: row.aiAssistantEnabled,
        deskSiteKey: row.deskSiteKey,
        agreement: row.agreement,
        privacy: row.privacy,
        about: row.about,
        shareImage: row.shareImage,
        status: row.status,
      },
      categories,
      hotGroups,
      subscribeTemplates,
      viewer: viewer ? viewerOf(viewer) : null,
    });
  });

  app.post('/api/public/circle/login', async (c) => {
    guard(loginWindow, c, '登录过于频繁，请一分钟后再试');
    const row = await communityOf(c);
    const body = circlePublicLoginBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    const session = await services.circle.userService.login(row, body);
    void services.terminalScrm.identify({
      ownerUserId: row.ownerUserId,
      scene: 'CIRCLE',
      sourceId: row.id,
      sourceName: row.name,
      customerId: session.user.id,
      kind: 'CUSTOMER_REGISTER',
      recordKey: session.user.id,
    });
    return c.json(session);
  });

  // ---------------------------------------------------------------- 分类与圈子

  app.get('/api/public/circle/categories', async (c) => {
    guard(anonWindow, c, '访问过于频繁，请稍后重试');
    const row = await communityOf(c);
    return c.json(await services.circle.groupService.categoryList(row.id));
  });

  app.get('/api/public/circle/groups', async (c) => {
    guard(anonWindow, c, '访问过于频繁，请稍后重试');
    const row = await communityOf(c);
    const viewer = await viewerOfRequest(c, row.id);
    return c.json(
      await services.circle.groupService.publicList(row.id, viewer?.id || 0, {
        page: c.req.query('page'),
        pageSize: c.req.query('pageSize'),
        keyword: c.req.query('keyword'),
        categoryId: c.req.query('categoryId'),
      }),
    );
  });

  app.get('/api/public/circle/group/detail', async (c) => {
    guard(anonWindow, c, '访问过于频繁，请稍后重试');
    const row = await communityOf(c);
    const viewer = await viewerOfRequest(c, row.id);
    return c.json(
      await services.circle.groupService.detail(
        row.id,
        Number(c.req.query('id') || 0),
        viewer?.id || 0,
      ),
    );
  });

  app.post('/api/public/circle/group/apply', async (c) => {
    guard(writeWindow, c, '操作过于频繁，请稍后再试');
    const row = await communityOf(c);
    const viewer = await requireViewer(c, row.id);
    const body = circlePublicGroupApplyBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    return c.json(
      await services.circle.groupService.apply(row, viewer.id, body),
    );
  });

  app.post('/api/public/circle/group/join', async (c) => {
    guard(writeWindow, c, '操作过于频繁，请稍后再试');
    const row = await communityOf(c);
    const viewer = await requireViewer(c, row.id);
    const body = (await c.req.json().catch(() => ({}))) as { groupId?: number };
    return c.json(
      await services.circle.groupService.join(
        row.id,
        Number(body.groupId || 0),
        viewer.id,
      ),
    );
  });

  app.post('/api/public/circle/group/leave', async (c) => {
    guard(writeWindow, c, '操作过于频繁，请稍后再试');
    const row = await communityOf(c);
    const viewer = await requireViewer(c, row.id);
    const body = (await c.req.json().catch(() => ({}))) as { groupId?: number };
    return c.json(
      await services.circle.groupService.leave(
        row.id,
        Number(body.groupId || 0),
        viewer.id,
      ),
    );
  });

  app.post('/api/public/circle/group/follow', async (c) => {
    guard(writeWindow, c, '操作过于频繁，请稍后再试');
    const row = await communityOf(c);
    const viewer = await requireViewer(c, row.id);
    const body = (await c.req.json().catch(() => ({}))) as {
      groupId?: number;
      follow?: boolean;
    };
    return c.json(
      await services.circle.groupService.follow(
        row.id,
        Number(body.groupId || 0),
        viewer.id,
        body.follow !== false,
      ),
    );
  });

  app.post('/api/public/circle/group/update', async (c) => {
    guard(writeWindow, c, '操作过于频繁，请稍后再试');
    const row = await communityOf(c);
    const viewer = await requireViewer(c, row.id);
    const body = (await c.req.json().catch(() => ({}))) as {
      id?: number;
      categoryId?: number;
      name?: string;
      cover?: string;
      intro?: string;
      rules?: string;
      joinMode?: 'FREE' | 'APPROVAL';
    };
    return c.json(
      await services.circle.groupService.updateByManager(row.id, viewer.id, {
        id: Number(body.id || 0),
        categoryId: Number(body.categoryId || 0),
        name: clip(body.name, 40),
        cover: clip(body.cover, 500),
        intro: clip(body.intro, 2000),
        rules: clip(body.rules, 5000),
        joinMode: body.joinMode === 'FREE' ? 'FREE' : 'APPROVAL',
      }),
    );
  });

  app.get('/api/public/circle/group/members', async (c) => {
    guard(anonWindow, c, '访问过于频繁，请稍后重试');
    const row = await communityOf(c);
    const viewer = await requireViewer(c, row.id);
    return c.json(
      await services.circle.groupService.members(
        row.id,
        Number(c.req.query('groupId') || 0),
        viewer.id,
        {
          page: c.req.query('page'),
          pageSize: c.req.query('pageSize'),
          status: c.req.query('status'),
        },
      ),
    );
  });

  app.post('/api/public/circle/group/member/action', async (c) => {
    guard(writeWindow, c, '操作过于频繁，请稍后再试');
    const row = await communityOf(c);
    const viewer = await requireViewer(c, row.id);
    const body = (await c.req.json().catch(() => ({}))) as {
      groupId?: number;
      userId?: number;
      action?: 'APPROVE' | 'REMOVE' | 'MUTE' | 'BAN';
    };
    const result = await services.circle.groupService.memberAction(
      row.id,
      Number(body.groupId || 0),
      viewer.id,
      {
        userId: Number(body.userId || 0),
        action: body.action || 'APPROVE',
      },
    );
    if (body.action === 'APPROVE') {
      const group = await services.circle.prisma.circleGroup.findFirst({
        where: { id: Number(body.groupId || 0), communityId: row.id },
        select: { name: true },
      });
      void services.circle.subscribeService
        .notify(
          row,
          Number(body.userId || 0),
          'circleAudit',
          `/pages/group-detail/group-detail?id=${body.groupId}`,
          group?.name || '圈子加入申请',
        )
        .catch(() => undefined);
    }
    return c.json(result);
  });

  // ---------------------------------------------------------------- 帖子

  app.get('/api/public/circle/posts', async (c) => {
    guard(anonWindow, c, '访问过于频繁，请稍后重试');
    const row = await communityOf(c);
    const viewer = await viewerOfRequest(c, row.id);
    return c.json(
      await services.circle.postService.publicList(row.id, viewer?.id || 0, {
        page: c.req.query('page'),
        pageSize: c.req.query('pageSize'),
        tab: c.req.query('tab'),
        groupId: c.req.query('groupId'),
        keyword: c.req.query('keyword'),
      }),
    );
  });

  app.get('/api/public/circle/post/detail', async (c) => {
    guard(anonWindow, c, '访问过于频繁，请稍后重试');
    const row = await communityOf(c);
    const viewer = await viewerOfRequest(c, row.id);
    return c.json(
      await services.circle.postService.view(
        row,
        Number(c.req.query('id') || 0),
        viewer?.id || 0,
        viewer?.openid || '',
        clientIp(c),
      ),
    );
  });

  app.post('/api/public/circle/post/create', async (c) => {
    guard(writeWindow, c, '操作过于频繁，请稍后再试');
    const row = await communityOf(c);
    const viewer = await requireViewer(c, row.id);
    const body = circlePublicPostCreateBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    const post = await services.circle.postService.create(row, viewer, body);
    void services.circle.medalService
      .award(row.id, viewer.id)
      .catch(() => undefined);
    return c.json(post);
  });

  app.post('/api/public/circle/post/remove', async (c) => {
    guard(writeWindow, c, '操作过于频繁，请稍后再试');
    const row = await communityOf(c);
    const viewer = await requireViewer(c, row.id);
    const body = (await c.req.json().catch(() => ({}))) as { id?: number };
    return c.json(
      await services.circle.postService.removeByAuthor(
        row.id,
        Number(body.id || 0),
        viewer.id,
      ),
    );
  });

  app.post('/api/public/circle/post/like', async (c) => {
    guard(writeWindow, c, '操作过于频繁，请稍后再试');
    const row = await communityOf(c);
    const viewer = await requireViewer(c, row.id);
    const body = (await c.req.json().catch(() => ({}))) as {
      postId?: number;
      like?: boolean;
    };
    const result = await services.circle.interactionService.like(
      row.id,
      Number(body.postId || 0),
      viewer.id,
      body.like !== false,
    );
    if (body.like !== false) {
      const post = await services.circle.prisma.circlePost.findFirst({
        where: { id: Number(body.postId || 0), communityId: row.id },
        select: { authorUserId: true, content: true },
      });
      if (post) {
        void services.circle.subscribeService
          .notify(
            row,
            post.authorUserId,
            'circleLike',
            `/pages/post-detail/post-detail?id=${body.postId}`,
            post.content,
          )
          .catch(() => undefined);
      }
    }
    return c.json(result);
  });

  app.post('/api/public/circle/post/favorite', async (c) => {
    guard(writeWindow, c, '操作过于频繁，请稍后再试');
    const row = await communityOf(c);
    const viewer = await requireViewer(c, row.id);
    const body = (await c.req.json().catch(() => ({}))) as {
      postId?: number;
      favorite?: boolean;
    };
    return c.json(
      await services.circle.interactionService.favorite(
        row.id,
        Number(body.postId || 0),
        viewer.id,
        body.favorite !== false,
      ),
    );
  });

  // ---------------------------------------------------------------- 评论

  app.get('/api/public/circle/comments', async (c) => {
    guard(anonWindow, c, '访问过于频繁，请稍后重试');
    const row = await communityOf(c);
    const viewer = await viewerOfRequest(c, row.id);
    return c.json(
      await services.circle.commentService.list(
        row.id,
        Number(c.req.query('postId') || 0),
        viewer?.id || 0,
      ),
    );
  });

  app.post('/api/public/circle/comment/create', async (c) => {
    guard(writeWindow, c, '操作过于频繁，请稍后再试');
    const row = await communityOf(c);
    const viewer = await requireViewer(c, row.id);
    const body = circlePublicCommentCreateBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    return c.json(
      await services.circle.commentService.create(row, viewer, body),
    );
  });

  app.post('/api/public/circle/comment/like', async (c) => {
    guard(writeWindow, c, '操作过于频繁，请稍后再试');
    const row = await communityOf(c);
    const viewer = await requireViewer(c, row.id);
    const body = (await c.req.json().catch(() => ({}))) as {
      commentId?: number;
      like?: boolean;
    };
    return c.json(
      await services.circle.commentService.like(
        row.id,
        Number(body.commentId || 0),
        viewer.id,
        body.like !== false,
      ),
    );
  });

  app.post('/api/public/circle/comment/remove', async (c) => {
    guard(writeWindow, c, '操作过于频繁，请稍后再试');
    const row = await communityOf(c);
    const viewer = await requireViewer(c, row.id);
    const body = (await c.req.json().catch(() => ({}))) as { id?: number };
    return c.json(
      await services.circle.commentService.remove(
        row.id,
        Number(body.id || 0),
        viewer.id,
      ),
    );
  });

  // ---------------------------------------------------------------- 成员与关注

  app.get('/api/public/circle/user/me', async (c) => {
    guard(anonWindow, c, '访问过于频繁，请稍后重试');
    const row = await communityOf(c);
    const viewer = await requireViewer(c, row.id);
    await services.circle.medalService
      .award(row.id, viewer.id)
      .catch(() => undefined);
    return c.json(await services.circle.userService.view(viewer, viewer.id));
  });

  app.get('/api/public/circle/user/detail', async (c) => {
    guard(anonWindow, c, '访问过于频繁，请稍后重试');
    const row = await communityOf(c);
    const viewer = await viewerOfRequest(c, row.id);
    const id = Number(c.req.query('id') || 0);
    const userRow = await services.circle.userService.identityById(row.id, id);
    return c.json(
      await services.circle.userService.view(userRow, viewer?.id || 0),
    );
  });

  app.post('/api/public/circle/user/profile', async (c) => {
    guard(writeWindow, c, '操作过于频繁，请稍后再试');
    const row = await communityOf(c);
    const viewer = await requireViewer(c, row.id);
    const body = circlePublicProfileSaveBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    return c.json(
      await services.circle.userService.saveProfile(row.id, viewer.id, body),
    );
  });

  app.post('/api/public/circle/user/follow', async (c) => {
    guard(writeWindow, c, '操作过于频繁，请稍后再试');
    const row = await communityOf(c);
    const viewer = await requireViewer(c, row.id);
    const body = (await c.req.json().catch(() => ({}))) as {
      userId?: number;
      follow?: boolean;
    };
    const target = await services.circle.userService.follow(
      row.id,
      viewer.id,
      Number(body.userId || 0),
      body.follow !== false,
    );
    if (body.follow !== false) {
      void services.circle.medalService
        .award(row.id, Number(body.userId || 0))
        .catch(() => undefined);
    }
    return c.json(target);
  });

  app.get('/api/public/circle/user/posts', async (c) => {
    guard(anonWindow, c, '访问过于频繁，请稍后重试');
    const row = await communityOf(c);
    const viewer = await viewerOfRequest(c, row.id);
    const id = Number(c.req.query('id') || 0) || viewer?.id || 0;
    return c.json(
      await services.circle.postService.myList(row.id, id, {
        page: c.req.query('page'),
        pageSize: c.req.query('pageSize'),
      }),
    );
  });

  app.get('/api/public/circle/user/favorites', async (c) => {
    guard(anonWindow, c, '访问过于频繁，请稍后重试');
    const row = await communityOf(c);
    const viewer = await requireViewer(c, row.id);
    return c.json(
      await services.circle.postService.myFavorites(row.id, viewer.id, {
        page: c.req.query('page'),
        pageSize: c.req.query('pageSize'),
      }),
    );
  });

  // ---------------------------------------------------------------- 消息、举报、话题

  app.get('/api/public/circle/messages', async (c) => {
    guard(anonWindow, c, '访问过于频繁，请稍后重试');
    const row = await communityOf(c);
    const viewer = await requireViewer(c, row.id);
    return c.json(
      await services.circle.notificationService.list(row.id, viewer.id),
    );
  });

  app.post('/api/public/circle/messages/read', async (c) => {
    guard(writeWindow, c, '操作过于频繁，请稍后再试');
    const row = await communityOf(c);
    const viewer = await requireViewer(c, row.id);
    return c.json(
      await services.circle.notificationService.readAll(row.id, viewer.id),
    );
  });

  app.post('/api/public/circle/report/create', async (c) => {
    guard(writeWindow, c, '操作过于频繁，请稍后再试');
    const row = await communityOf(c);
    const viewer = await requireViewer(c, row.id);
    const body = circlePublicReportBodySchema.parse(
      await c.req.json().catch(() => ({})),
    );
    return c.json(
      await services.circle.reportService.create(row, viewer, body),
    );
  });

  // ---------------------------------------------------------------- 活动与勋章

  app.get('/api/public/circle/activities', async (c) => {
    guard(anonWindow, c, '访问过于频繁，请稍后重试');
    const row = await communityOf(c);
    const viewer = await viewerOfRequest(c, row.id);
    return c.json(
      await services.circle.activityService.publicList(
        row.id,
        viewer?.id || 0,
        {
          page: c.req.query('page'),
          pageSize: c.req.query('pageSize'),
          groupId: c.req.query('groupId'),
        },
      ),
    );
  });

  app.get('/api/public/circle/activity/detail', async (c) => {
    guard(anonWindow, c, '访问过于频繁，请稍后重试');
    const row = await communityOf(c);
    const viewer = await viewerOfRequest(c, row.id);
    return c.json(
      await services.circle.activityService.detail(
        row.id,
        Number(c.req.query('id') || 0),
        viewer?.id || 0,
      ),
    );
  });

  app.post('/api/public/circle/activity/join', async (c) => {
    guard(writeWindow, c, '操作过于频繁，请稍后再试');
    const row = await communityOf(c);
    const viewer = await requireViewer(c, row.id);
    const body = (await c.req.json().catch(() => ({}))) as { id?: number };
    return c.json(
      await services.circle.activityService.join(
        row.id,
        Number(body.id || 0),
        viewer.id,
      ),
    );
  });

  app.post('/api/public/circle/activity/cancel', async (c) => {
    guard(writeWindow, c, '操作过于频繁，请稍后再试');
    const row = await communityOf(c);
    const viewer = await requireViewer(c, row.id);
    const body = (await c.req.json().catch(() => ({}))) as { id?: number };
    return c.json(
      await services.circle.activityService.cancel(
        row.id,
        Number(body.id || 0),
        viewer.id,
      ),
    );
  });

  app.get('/api/public/circle/user/medals', async (c) => {
    guard(anonWindow, c, '访问过于频繁，请稍后重试');
    const row = await communityOf(c);
    const viewer = await viewerOfRequest(c, row.id);
    const id = Number(c.req.query('id') || 0) || viewer?.id || 0;
    return c.json(await services.circle.medalService.userMedals(row.id, id));
  });

  app.get('/api/public/circle/topics', async (c) => {
    guard(anonWindow, c, '访问过于频繁，请稍后重试');
    const row = await communityOf(c);
    return c.json(await services.circle.postService.topics(row.id));
  });

  app.get('/api/public/circle/search', async (c) => {
    guard(anonWindow, c, '访问过于频繁，请稍后重试');
    const row = await communityOf(c);
    const viewer = await viewerOfRequest(c, row.id);
    const keyword = clip(c.req.query('keyword'), 60);
    const [posts, groups] = await Promise.all([
      services.circle.postService.search(row.id, viewer?.id || 0, {
        keyword,
        page: c.req.query('page'),
        pageSize: c.req.query('pageSize'),
      }),
      services.circle.groupService.publicList(row.id, viewer?.id || 0, {
        keyword,
        pageSize: 10,
      }),
    ]);
    return c.json({ posts, groups: groups.list });
  });

  // ---------------------------------------------------------------- 图片上传

  app.post('/api/public/circle/upload', async (c) => {
    guard(uploadWindow, c, '上传过于频繁，请稍后再试');
    const row = await communityOf(c);
    const viewer = await requireViewer(c, row.id);
    const form = await c.req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请选择要上传的图片');
    }
    return c.json(await services.circle.mediaService.upload(row, viewer, file));
  });
}
