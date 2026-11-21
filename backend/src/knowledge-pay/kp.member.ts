import { KP_TOGGLE_KEYS } from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { MiniProgramClient } from '../miniprogram/miniprogram.client';
import type { PrismaService } from '../prisma/prisma.service';
import { toolOpen } from '../tool-launch/tool-launch.holder';
import { KnowledgePayService } from './kp.service';
import { issueMemberToken, verifyMemberToken } from './kp.token';

function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}
function iso(value: Date | null | undefined): string {
  return value ? value.toISOString() : '';
}

type SiteRow = Awaited<ReturnType<KnowledgePayService['siteByCode']>>;

/**
 * 知识付费云课堂「终端会员」侧逻辑（公开通道专用，不进 JSON 契约）。
 *
 * 会员凭 issueMemberToken 签发的独立令牌访问；每个动作都同时校验
 * 「令牌 ↔ 站点」一致，杜绝 A 站令牌打到 B 站数据。
 */
export class KnowledgePayMemberService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly service: KnowledgePayService,
    private readonly wx: MiniProgramClient,
  ) {}

  // ------------------------------------------------------------------
  // 站点公开配置（匿名）
  // ------------------------------------------------------------------

  async publicConfig(siteCode: string) {
    const site = await this.service.siteByCode(siteCode);
    if (!site.enabled) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该知识付费站点未启用，请联系站点负责人在「工作台 → 建站管理 → 知识付费云课堂 → 基础设置」开启',
      );
    }
    // 启动闸门：账号未启动该工具（或欠费/平台停用）时，公开通道一并停服
    if (!(await toolOpen('knowledge-pay', site.userId))) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该站点尚未启动（或已停服），请到「建站管理 → 启动设置」启动后重试',
      );
    }
    const toggles = (
      site.toggles && typeof site.toggles === 'object'
        ? (site.toggles as Record<string, unknown>)
        : {}
    ) as Record<string, boolean>;
    return {
      enabled: true,
      siteName: site.siteName,
      slogan: site.slogan,
      themeColor: site.themeColor,
      hotWords: site.hotWords,
      moreTitle: site.moreTitle,
      toggles: Object.fromEntries(
        KP_TOGGLE_KEYS.map((key) => [key, toggles[key] !== false]),
      ),
      vipPlans: this.service.vipPlansOf(site),
      signRewards: this.service.signRewardsOf(site),
      payReady: Boolean(
        site.wxAppId &&
        site.wxMchId &&
        site.wxPaySerial &&
        site.wxPayApiV3Key &&
        site.wxPayPrivateKey,
      ),
      faq: site.faq,
      about: site.about,
      adUnitTab: site.adUnitTab,
      adUnitDetail: site.adUnitDetail,
    };
  }

  private async enabledSite(siteCode: string): Promise<SiteRow> {
    const site = await this.service.siteByCode(siteCode);
    if (!site.enabled) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该知识付费站点未启用，请联系站点负责人开启后再试',
      );
    }
    // 启动闸门：与「站点未启用」同一停服形状，9 个公开方法在此一次判掉
    if (!(await toolOpen('knowledge-pay', site.userId))) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该站点尚未启动（或已停服），请到「建站管理 → 启动设置」启动后重试',
      );
    }
    return site;
  }

  // ------------------------------------------------------------------
  // 登录 / 档案
  // ------------------------------------------------------------------

  async login(
    siteCode: string,
    body: { code?: string; nickname?: string; avatar?: string },
  ) {
    const site = await this.enabledSite(siteCode);
    const jsCode = String(body.code || '').trim();
    if (!jsCode) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '缺少微信登录 code（wx.login）',
      );
    }
    const runtime = this.service.requireRuntime(site);
    const wxSession = await this.wx.code2Session(runtime, jsCode);
    const member = await this.prisma.knowledgePayMember.upsert({
      where: {
        siteId_openid: { siteId: site.id, openid: wxSession.openId },
      },
      update: {
        unionid: wxSession.unionId || undefined,
        loginCount: { increment: 1 },
      },
      create: {
        siteId: site.id,
        userId: site.userId,
        openid: wxSession.openId,
        unionid: wxSession.unionId,
        nickname:
          String(body.nickname || '')
            .trim()
            .slice(0, 60) || '微信用户',
        avatar: String(body.avatar || '')
          .trim()
          .slice(0, 512),
        loginCount: 1,
      },
    });
    if (!member.status) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '账号已被站点停用，请联系客服',
      );
    }
    // 老用户昵称/头像为空时补一次（wx.getUserProfile 已下线，允许端上带默认值）
    if (!member.nickname || member.nickname === '微信用户') {
      const nickname = String(body.nickname || '')
        .trim()
        .slice(0, 60);
      const avatar = String(body.avatar || '')
        .trim()
        .slice(0, 512);
      if (nickname || avatar) {
        await this.prisma.knowledgePayMember.update({
          where: { id: member.id },
          data: {
            nickname: nickname || member.nickname,
            avatar: avatar || member.avatar,
          },
        });
      }
    }
    const token = issueMemberToken({ memberId: member.id, siteId: site.id });
    const view = await this.memberView(member.id, site.id);
    return { token, member: view };
  }

  /** 令牌 → 会员行（同时校验站点归属与停用状态），供公开路由统一前置。 */
  async authenticate(siteCode: string, authorization: string | undefined) {
    const site = await this.enabledSite(siteCode);
    const raw = String(authorization || '').trim();
    if (!raw) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '请先登录（微信授权进入小程序）',
      );
    }
    const payload = verifyMemberToken(raw);
    if (payload.siteId !== site.id) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '登录状态与站点不匹配，请重新进入小程序',
      );
    }
    const member = await this.prisma.knowledgePayMember.findUnique({
      where: { id: payload.memberId },
    });
    if (!member || member.siteId !== site.id) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '登录已过期，请重新进入小程序',
      );
    }
    if (!member.status) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '账号已被站点停用，请联系客服',
      );
    }
    return { site, member };
  }

  async memberView(memberId: number, siteId: number) {
    const member = await this.prisma.knowledgePayMember.findUnique({
      where: { id: memberId },
    });
    if (!member)
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '会员不存在，请重新登录',
      );
    const [orderCount, favoriteCount, learningRows] = await Promise.all([
      this.prisma.knowledgePayOrder.count({ where: { siteId, memberId } }),
      this.prisma.knowledgePayFavorite.count({ where: { siteId, memberId } }),
      this.prisma.knowledgePayProgress.groupBy({
        by: ['resourceId'],
        where: { siteId, memberId },
      }),
    ]);
    return this.service.memberPublicView(
      member,
      orderCount,
      favoriteCount,
      learningRows.length,
    );
  }

  // ------------------------------------------------------------------
  // 签到
  // ------------------------------------------------------------------

  async signIn(memberId: number, siteId: number) {
    const site = await this.prisma.knowledgePaySite.findUniqueOrThrow({
      where: { id: siteId },
    });
    const member = await this.prisma.knowledgePayMember.findUniqueOrThrow({
      where: { id: memberId },
    });
    const today = ymd(new Date());
    if (member.lastSignInDate === today) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '今天已经签到过了，明天再来吧',
      );
    }
    const yesterday = ymd(new Date(Date.now() - 86_400_000));
    const streak =
      member.lastSignInDate === yesterday ? member.signInStreak + 1 : 1;
    const rewards = this.service.signRewardsOf(site);
    const reward = rewards[Math.min(streak, 7) - 1] ?? 0;
    const updated = await this.prisma.knowledgePayMember.update({
      where: { id: memberId },
      data: {
        signInStreak: streak,
        lastSignInDate: today,
        points: { increment: reward },
      },
    });
    return {
      reward,
      points: updated.points,
      signInStreak: streak,
      message:
        streak >= 7
          ? `已连续签到 ${streak} 天，奖励 ${reward} 积分`
          : `签到成功，奖励 ${reward} 积分`,
    };
  }

  // ------------------------------------------------------------------
  // 内容目录（匿名可读；带令牌时透出解锁状态）
  // ------------------------------------------------------------------

  private cardOf(row: {
    id: number;
    title: string;
    cover: string;
    mediaType: string;
    accessMode: string;
    price: number;
    cashPriceCents: number;
    viewCount: number;
    hot: boolean;
    teacherName: string;
  }) {
    return {
      id: row.id,
      title: row.title,
      cover: row.cover,
      mediaType: row.mediaType,
      accessMode: row.accessMode,
      price: row.price,
      cashPriceCents: row.cashPriceCents,
      viewCount: row.viewCount,
      hot: row.hot,
      teacherName: row.teacherName || '',
    };
  }

  async feed(
    siteCode: string,
    query: {
      categoryId?: number;
      kind?: string;
      keyword?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const site = await this.enabledSite(siteCode);
    const page = Math.max(1, Math.floor(Number(query.page) || 1));
    const pageSize = Math.min(
      50,
      Math.max(1, Math.floor(Number(query.pageSize) || 10)),
    );
    const where: Record<string, unknown> = {
      siteId: site.id,
      status: true,
      auditStatus: 'published',
    };
    if (Number(query.categoryId) > 0)
      where.categoryId = Number(query.categoryId);
    if (query.kind === 'hot') where.hot = true;
    if (query.kind === 'vip') where.accessMode = 'vip';
    const keyword = String(query.keyword || '')
      .trim()
      .slice(0, 60);
    if (keyword) where.title = { contains: keyword };
    const orderBy =
      query.kind === 'hot'
        ? [{ viewCount: 'desc' as const }, { id: 'desc' as const }]
        : [{ id: 'desc' as const }];
    const [rows, total] = await Promise.all([
      this.prisma.knowledgePayResource.findMany({
        where: where as never,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.knowledgePayResource.count({ where: where as never }),
    ]);
    return { list: rows.map((row) => this.cardOf(row)), total, page, pageSize };
  }

  async categoryList(siteCode: string) {
    const site = await this.enabledSite(siteCode);
    const rows = await this.prisma.knowledgePayCategory.findMany({
      where: { siteId: site.id, status: true },
      orderBy: [{ sort: 'desc' }, { id: 'asc' }],
      take: 200,
    });
    return {
      list: rows.map((row) => ({
        id: row.id,
        title: row.title,
        cover: row.cover,
      })),
    };
  }

  async bannerList(siteCode: string) {
    const site = await this.enabledSite(siteCode);
    const rows = await this.prisma.knowledgePayBanner.findMany({
      where: { siteId: site.id, status: true },
      orderBy: [{ sort: 'desc' }, { id: 'desc' }],
      take: 20,
    });
    return {
      list: rows.map((row) => ({
        id: row.id,
        title: row.title,
        image: row.image,
        link: row.link,
      })),
    };
  }

  async noticeList(siteCode: string, limit = 6) {
    const site = await this.enabledSite(siteCode);
    const rows = await this.prisma.knowledgePayNotice.findMany({
      where: { siteId: site.id, status: true },
      orderBy: { id: 'desc' },
      take: Math.min(50, Math.max(1, Number(limit) || 6)),
    });
    return {
      list: rows.map((row) => ({
        id: row.id,
        title: row.title,
        createdAt: iso(row.createdAt),
      })),
    };
  }

  async noticeDetail(siteCode: string, id: number) {
    const site = await this.enabledSite(siteCode);
    const row = await this.prisma.knowledgePayNotice.findFirst({
      where: { id: Number(id), siteId: site.id, status: true },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '公告不存在或已下架');
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      createdAt: iso(row.createdAt),
    };
  }

  async linkList(siteCode: string) {
    const site = await this.enabledSite(siteCode);
    const rows = await this.prisma.knowledgePayLink.findMany({
      where: { siteId: site.id, status: true },
      orderBy: [{ sort: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    return {
      list: rows.map((row) => ({
        id: row.id,
        title: row.title,
        summary: row.summary,
        cover: row.cover,
        link: row.link,
      })),
    };
  }

  /** 讲师列表（发现页/课程详情跳转用）。 */
  async teacherList(siteCode: string) {
    const site = await this.enabledSite(siteCode);
    const rows = await this.prisma.knowledgePayTeacher.findMany({
      where: { siteId: site.id, status: true },
      orderBy: [{ sort: 'desc' }, { id: 'asc' }],
      take: 200,
    });
    return {
      list: rows.map((row) => ({
        id: row.id,
        name: row.name,
        title: row.title,
        avatar: row.avatar,
        intro: row.intro,
      })),
    };
  }

  /** 讲师主页：档案 + 已上架课程。 */
  async teacherDetail(siteCode: string, id: number) {
    const site = await this.enabledSite(siteCode);
    const teacher = await this.prisma.knowledgePayTeacher.findFirst({
      where: { id: Number(id), siteId: site.id, status: true },
    });
    if (!teacher)
      throw new BusinessException(ErrorCode.NOT_FOUND, '讲师不存在或已下架');
    const courses = await this.prisma.knowledgePayResource.findMany({
      where: {
        siteId: site.id,
        teacherId: teacher.id,
        status: true,
        auditStatus: 'published',
      },
      orderBy: [{ sort: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    return {
      id: teacher.id,
      name: teacher.name,
      title: teacher.title,
      avatar: teacher.avatar,
      intro: teacher.intro,
      courses: courses.map((row) => this.cardOf(row)),
    };
  }

  /** 「发现」页导航。 */
  async navList(siteCode: string) {
    const site = await this.enabledSite(siteCode);
    const rows = await this.prisma.knowledgePayNav.findMany({
      where: { siteId: site.id, status: true },
      orderBy: [{ sort: 'desc' }, { id: 'asc' }],
      take: 100,
    });
    return {
      list: rows.map((row) => ({
        id: row.id,
        title: row.title,
        icon: row.icon,
        link: row.link,
      })),
    };
  }

  /** 自定义单页详情（按 id 或 slug）。 */
  async pageDetail(siteCode: string, id: number, slug: string) {
    const site = await this.enabledSite(siteCode);
    const row = await this.prisma.knowledgePayPage.findFirst({
      where: {
        siteId: site.id,
        status: true,
        ...(Number(id) > 0 ? { id: Number(id) } : { slug: String(slug || '') }),
      },
      orderBy: { id: 'asc' },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '页面不存在或已下架');
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      content: row.content,
    };
  }

  /** 我的现金订单（微信支付）。 */
  async myCashOrders(
    siteId: number,
    memberId: number,
    page = 1,
    pageSize = 10,
  ) {
    const size = Math.min(50, Math.max(1, Number(pageSize) || 10));
    const no = Math.max(1, Math.floor(Number(page) || 1));
    const [rows, total] = await Promise.all([
      this.prisma.knowledgePayCashOrder.findMany({
        where: { siteId, memberId },
        orderBy: { id: 'desc' },
        skip: (no - 1) * size,
        take: size,
      }),
      this.prisma.knowledgePayCashOrder.count({ where: { siteId, memberId } }),
    ]);
    return {
      list: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        resourceId: row.resourceId,
        plan: row.plan,
        title: row.title,
        amountCents: row.amountCents,
        outTradeNo: row.outTradeNo,
        status: row.status,
        paidAt: iso(row.paidAt),
        refundedAt: iso(row.refundedAt),
        createdAt: iso(row.createdAt),
      })),
      total,
      page: no,
      pageSize: size,
    };
  }

  async resourceDetail(
    siteCode: string,
    id: number,
    member: { id: number; vipUntil: Date | null } | null,
  ) {
    const site = await this.enabledSite(siteCode);
    const row = await this.prisma.knowledgePayResource.findFirst({
      where: {
        id: Number(id),
        siteId: site.id,
        status: true,
        auditStatus: 'published',
      },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '内容不存在或已下架');
    await this.prisma.knowledgePayResource.update({
      where: { id: row.id },
      data: { viewCount: { increment: 1 } },
    });
    const [lessons, order, favorite, progressRows, reviewRows, reviewAgg] =
      await Promise.all([
        this.prisma.knowledgePayLesson.findMany({
          where: { siteId: site.id, resourceId: row.id, status: true },
          orderBy: [{ sort: 'desc' }, { id: 'asc' }],
          take: 500,
        }),
        member
          ? this.prisma.knowledgePayOrder.findFirst({
              where: {
                siteId: site.id,
                memberId: member.id,
                resourceId: row.id,
              },
              select: { id: true },
            })
          : null,
        member
          ? this.prisma.knowledgePayFavorite.findFirst({
              where: {
                siteId: site.id,
                memberId: member.id,
                resourceId: row.id,
              },
              select: { id: true },
            })
          : null,
        member
          ? this.prisma.knowledgePayProgress.findMany({
              where: {
                siteId: site.id,
                memberId: member.id,
                resourceId: row.id,
              },
              orderBy: { updatedAt: 'desc' },
            })
          : ([] as {
              lessonId: number;
              positionSec: number;
              completed: boolean;
              updatedAt: Date;
            }[]),
        this.prisma.knowledgePayReview.findMany({
          where: { siteId: site.id, resourceId: row.id, status: true },
          orderBy: { id: 'desc' },
          take: 20,
        }),
        this.prisma.knowledgePayReview.aggregate({
          where: { siteId: site.id, resourceId: row.id, status: true },
          _avg: { rating: true },
          _count: { _all: true },
        }),
      ]);
    const vipActive = Boolean(
      member?.vipUntil && member.vipUntil.getTime() > Date.now(),
    );
    const unlocked = Boolean(order) || (row.accessMode === 'vip' && vipActive);
    const progressByLesson = new Map(
      progressRows.map((item) => [item.lessonId, item]),
    );
    const lessonViews = lessons.map((lesson) => {
      const open = unlocked || lesson.freeTrial;
      const progress = progressByLesson.get(lesson.id);
      return {
        id: lesson.id,
        chapterId: lesson.chapterId,
        title: lesson.title,
        mediaType: lesson.mediaType || row.mediaType,
        durationSec: lesson.durationSec,
        freeTrial: lesson.freeTrial,
        unlocked: open,
        intro: open ? lesson.intro : '',
        // 未解锁且非试看课时不回资源地址（与课程详情同口径）
        url: open ? lesson.url || row.url : '',
        positionSec: progress?.positionSec || 0,
        completed: progress?.completed || false,
      };
    });
    const [chapters, teacherProfile] = await Promise.all([
      this.prisma.knowledgePayChapter.findMany({
        where: { siteId: site.id, resourceId: row.id, status: true },
        orderBy: [{ sort: 'desc' }, { id: 'asc' }],
      }),
      row.teacherId
        ? this.prisma.knowledgePayTeacher.findFirst({
            where: { id: row.teacherId, siteId: site.id, status: true },
          })
        : null,
    ]);
    const chapterViews = chapters
      .map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        lessons: lessonViews.filter((item) => item.chapterId === chapter.id),
      }))
      .filter((chapter) => chapter.lessons.length);
    const ungrouped = lessonViews.filter(
      (item) =>
        !item.chapterId || !chapterViews.some((c) => c.id === item.chapterId),
    );
    const authorIds = Array.from(
      new Set(reviewRows.map((item) => item.memberId)),
    );
    const authors = authorIds.length
      ? await this.prisma.knowledgePayMember.findMany({
          where: { siteId: site.id, id: { in: authorIds } },
          select: { id: true, nickname: true, avatar: true },
        })
      : [];
    const authorOf = new Map(authors.map((item) => [item.id, item]));
    const myReview = member
      ? reviewRows.find((item) => item.memberId === member.id) || null
      : null;
    const completedCount = progressRows.filter((item) => item.completed).length;
    const lessonCount = lessonViews.length;
    return {
      ...this.cardOf(row),
      intro: row.intro,
      // 未解锁绝不回资源地址（参考版 huoqu/goods 后才给 dizhi 的口径）
      url: unlocked ? row.url : '',
      unlocked,
      favorited: Boolean(favorite),
      vipActive,
      viewCount: row.viewCount + 1,
      teacher: {
        id: teacherProfile?.id || 0,
        name: teacherProfile?.name || row.teacherName,
        title: teacherProfile?.title || row.teacherTitle,
        avatar: teacherProfile?.avatar || row.teacherAvatar,
        intro: teacherProfile?.intro || row.teacherIntro,
      },
      lessonCount,
      lessons: lessonViews,
      chapters: chapterViews,
      ungroupedLessons: ungrouped,
      progress: {
        completedCount,
        lessonCount,
        percent: lessonCount
          ? Math.round((completedCount / lessonCount) * 100)
          : 0,
        lastLessonId: progressRows[0]?.lessonId || 0,
        lastPositionSec: progressRows[0]?.positionSec || 0,
      },
      rating: {
        avg: Math.round((reviewAgg._avg.rating || 0) * 10) / 10,
        count: reviewAgg._count._all,
      },
      reviews: reviewRows.map((item) => ({
        id: item.id,
        rating: item.rating,
        content: item.content,
        reply: item.reply,
        createdAt: iso(item.createdAt),
        nickname: authorOf.get(item.memberId)?.nickname || '微信用户',
        avatar: authorOf.get(item.memberId)?.avatar || '',
        mine: Boolean(member && item.memberId === member.id),
      })),
      myReview: myReview
        ? {
            id: myReview.id,
            rating: myReview.rating,
            content: myReview.content,
          }
        : null,
    };
  }

  /** 上报学习进度：同一会员 × 课时一行，播放位置与完课状态以最新一次为准。 */
  async reportProgress(
    memberId: number,
    siteId: number,
    body: {
      resourceId: number;
      lessonId: number;
      positionSec?: number;
      durationSec?: number;
      completed?: boolean;
    },
  ) {
    const resourceId = Number(body.resourceId);
    const lessonId = Number(body.lessonId);
    const resource = await this.prisma.knowledgePayResource.findFirst({
      where: { id: resourceId, siteId, status: true, auditStatus: 'published' },
    });
    if (!resource)
      throw new BusinessException(ErrorCode.NOT_FOUND, '课程不存在或已下架');
    const lesson = await this.prisma.knowledgePayLesson.findFirst({
      where: { id: lessonId, siteId, resourceId, status: true },
    });
    if (!lesson)
      throw new BusinessException(ErrorCode.NOT_FOUND, '课时不存在或已下架');
    const member = await this.prisma.knowledgePayMember.findUniqueOrThrow({
      where: { id: memberId },
    });
    const order = await this.prisma.knowledgePayOrder.findFirst({
      where: { siteId, memberId, resourceId },
      select: { id: true },
    });
    const vipActive = Boolean(
      member.vipUntil && member.vipUntil.getTime() > Date.now(),
    );
    const unlocked =
      Boolean(order) || (resource.accessMode === 'vip' && vipActive);
    if (!unlocked && !lesson.freeTrial) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '请先解锁课程后再学习');
    }
    const positionSec = Math.max(
      0,
      Math.min(86400, Math.round(Number(body.positionSec) || 0)),
    );
    const durationSec = Math.max(
      0,
      Math.min(
        86400,
        Math.round(Number(body.durationSec) || lesson.durationSec || 0),
      ),
    );
    const completed =
      body.completed === true ||
      (durationSec > 0 && positionSec >= durationSec * 0.9);
    const row = await this.prisma.knowledgePayProgress.upsert({
      where: {
        siteId_memberId_lessonId: { siteId, memberId, lessonId },
      },
      update: {
        resourceId,
        positionSec,
        durationSec,
        completed: completed || undefined,
      },
      create: {
        siteId,
        userId: member.userId,
        memberId,
        resourceId,
        lessonId,
        positionSec,
        durationSec,
        completed,
      },
    });
    const [lessonCount, completedCount] = await Promise.all([
      this.prisma.knowledgePayLesson.count({
        where: { siteId, resourceId, status: true },
      }),
      this.prisma.knowledgePayProgress.count({
        where: { siteId, memberId, resourceId, completed: true },
      }),
    ]);
    return {
      lessonId: row.lessonId,
      positionSec: row.positionSec,
      completed: row.completed,
      completedCount,
      lessonCount,
      percent: lessonCount
        ? Math.round((completedCount / lessonCount) * 100)
        : 0,
    };
  }

  /** 我的学习：按课程聚合最近一次进度，课程级百分比用于「继续学习」。 */
  async myLearning(siteId: number, memberId: number, page = 1, pageSize = 10) {
    const size = Math.min(50, Math.max(1, Number(pageSize) || 10));
    const no = Math.max(1, Math.floor(Number(page) || 1));
    const rows = await this.prisma.knowledgePayProgress.findMany({
      where: { siteId, memberId },
      orderBy: { updatedAt: 'desc' },
      take: 1000,
    });
    const latest = new Map<number, (typeof rows)[number]>();
    for (const row of rows) {
      if (!latest.has(row.resourceId)) latest.set(row.resourceId, row);
    }
    const all = Array.from(latest.values());
    const slice = all.slice((no - 1) * size, no * size);
    const resourceIds = slice.map((item) => item.resourceId);
    const [resources, lessonGroups] = await Promise.all([
      this.prisma.knowledgePayResource.findMany({
        where: { siteId, id: { in: resourceIds } },
      }),
      this.prisma.knowledgePayLesson.groupBy({
        by: ['resourceId'],
        where: { siteId, resourceId: { in: resourceIds }, status: true },
        _count: { _all: true },
      }),
    ]);
    const resourceOf = new Map(resources.map((item) => [item.id, item]));
    const lessonCountOf = new Map(
      lessonGroups.map((item) => [item.resourceId, item._count._all]),
    );
    const completedByResource = new Map<number, number>();
    for (const row of rows) {
      if (row.completed) {
        completedByResource.set(
          row.resourceId,
          (completedByResource.get(row.resourceId) || 0) + 1,
        );
      }
    }
    const lessonTitles = await this.prisma.knowledgePayLesson.findMany({
      where: { siteId, id: { in: slice.map((item) => item.lessonId) } },
      select: { id: true, title: true },
    });
    const lessonTitleOf = new Map(
      lessonTitles.map((item) => [item.id, item.title]),
    );
    return {
      list: slice.map((item) => {
        const resource = resourceOf.get(item.resourceId);
        const lessonCount = lessonCountOf.get(item.resourceId) || 0;
        const completedCount = completedByResource.get(item.resourceId) || 0;
        return {
          resourceId: item.resourceId,
          title: resource?.title || '课程已下架',
          cover: resource?.cover || '',
          mediaType: resource?.mediaType || 'video',
          lessonCount,
          completedCount,
          percent: lessonCount
            ? Math.round((completedCount / lessonCount) * 100)
            : 0,
          lastLessonId: item.lessonId,
          lastLessonTitle: lessonTitleOf.get(item.lessonId) || '',
          positionSec: item.positionSec,
          completed: completedCount > 0 && completedCount >= lessonCount,
          updatedAt: iso(item.updatedAt),
        };
      }),
      total: all.length,
      page: no,
      pageSize: size,
    };
  }

  /** 提交/更新课程评价：需已解锁，写完回最新均分。 */
  async saveReview(
    siteId: number,
    memberId: number,
    body: { resourceId: number; rating?: number; content?: string },
  ) {
    const resourceId = Number(body.resourceId);
    const resource = await this.prisma.knowledgePayResource.findFirst({
      where: { id: resourceId, siteId, status: true, auditStatus: 'published' },
    });
    if (!resource)
      throw new BusinessException(ErrorCode.NOT_FOUND, '课程不存在或已下架');
    const [order, member] = await Promise.all([
      this.prisma.knowledgePayOrder.findFirst({
        where: { siteId, memberId, resourceId },
        select: { id: true },
      }),
      this.prisma.knowledgePayMember.findUniqueOrThrow({
        where: { id: memberId },
      }),
    ]);
    const vipActive = Boolean(
      member.vipUntil && member.vipUntil.getTime() > Date.now(),
    );
    if (!order && !(resource.accessMode === 'vip' && vipActive)) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '请先解锁课程后再评价');
    }
    const rating = Math.max(
      1,
      Math.min(5, Math.round(Number(body.rating) || 5)),
    );
    const content = String(body.content || '')
      .trim()
      .slice(0, 2000);
    await this.prisma.knowledgePayReview.upsert({
      where: {
        siteId_memberId_resourceId: { siteId, memberId, resourceId },
      },
      update: { rating, content, status: true },
      create: {
        siteId,
        userId: member.userId,
        memberId,
        resourceId,
        rating,
        content,
      },
    });
    const agg = await this.prisma.knowledgePayReview.aggregate({
      where: { siteId, resourceId, status: true },
      _avg: { rating: true },
      _count: { _all: true },
    });
    return {
      message: '评价已提交',
      rating: {
        avg: Math.round((agg._avg.rating || 0) * 10) / 10,
        count: agg._count._all,
      },
    };
  }

  // ------------------------------------------------------------------
  // 解锁 / 收藏 / 卡密 / 会员购买
  // ------------------------------------------------------------------

  async unlock(memberId: number, siteId: number, resourceId: number) {
    const resource = await this.prisma.knowledgePayResource.findFirst({
      where: {
        id: Number(resourceId),
        siteId,
        status: true,
        auditStatus: 'published',
      },
    });
    if (!resource)
      throw new BusinessException(ErrorCode.NOT_FOUND, '内容不存在或已下架');
    return this.prisma.$transaction(async (tx) => {
      const existed = await tx.knowledgePayOrder.findFirst({
        where: { siteId, memberId, resourceId: resource.id },
        select: { id: true },
      });
      if (existed) {
        return { unlocked: true, already: true, points: null as number | null };
      }
      const member = await tx.knowledgePayMember.findUniqueOrThrow({
        where: { id: memberId },
      });
      let payMethod = 'free';
      let amount = 0;
      if (resource.accessMode === 'vip') {
        if (!(member.vipUntil && member.vipUntil.getTime() > Date.now())) {
          throw new BusinessException(
            ErrorCode.FORBIDDEN,
            '该内容为会员专享，请先到「会员」页开通会员',
          );
        }
        payMethod = 'vip';
      } else if (resource.accessMode === 'points' && resource.price > 0) {
        const paid = await tx.knowledgePayMember.updateMany({
          where: { id: memberId, points: { gte: resource.price } },
          data: { points: { decrement: resource.price } },
        });
        if (paid.count !== 1) {
          throw new BusinessException(
            ErrorCode.CONFLICT,
            `积分不足：该内容需要 ${resource.price} 积分，当前余额 ${member.points}。可通过每日签到、卡密兑换或联系站点方获取积分`,
          );
        }
        payMethod = 'points';
        amount = resource.price;
      }
      const order = await tx.knowledgePayOrder.create({
        data: {
          siteId,
          userId: member.userId,
          memberId,
          resourceId: resource.id,
          title: resource.title,
          cover: resource.cover,
          url: resource.url,
          payMethod,
          amount,
        },
      });
      const after = await tx.knowledgePayMember.findUniqueOrThrow({
        where: { id: memberId },
      });
      return {
        unlocked: true,
        already: false,
        points: after.points,
        order: {
          id: order.id,
          title: order.title,
          payMethod: order.payMethod,
          amount: order.amount,
        },
      };
    });
  }

  async toggleFavorite(memberId: number, siteId: number, resourceId: number) {
    const resource = await this.prisma.knowledgePayResource.findFirst({
      where: {
        id: Number(resourceId),
        siteId,
        status: true,
        auditStatus: 'published',
      },
    });
    if (!resource)
      throw new BusinessException(ErrorCode.NOT_FOUND, '内容不存在或已下架');
    const existed = await this.prisma.knowledgePayFavorite.findFirst({
      where: { siteId, memberId, resourceId: resource.id },
    });
    if (existed) {
      await this.prisma.knowledgePayFavorite.delete({
        where: { id: existed.id },
      });
      return { favorited: false };
    }
    await this.prisma.knowledgePayFavorite.create({
      data: {
        siteId,
        memberId,
        resourceId: resource.id,
        title: resource.title,
        cover: resource.cover,
      },
    });
    return { favorited: true };
  }

  async myOrders(siteId: number, memberId: number, page = 1, pageSize = 10) {
    const size = Math.min(50, Math.max(1, Number(pageSize) || 10));
    const no = Math.max(1, Math.floor(Number(page) || 1));
    const [rows, total] = await Promise.all([
      this.prisma.knowledgePayOrder.findMany({
        where: { siteId, memberId },
        orderBy: { id: 'desc' },
        skip: (no - 1) * size,
        take: size,
      }),
      this.prisma.knowledgePayOrder.count({ where: { siteId, memberId } }),
    ]);
    return {
      list: rows.map((row) => ({
        id: row.id,
        resourceId: row.resourceId,
        title: row.title,
        cover: row.cover,
        payMethod: row.payMethod,
        amount: row.amount,
        createdAt: iso(row.createdAt),
      })),
      total,
      page: no,
      pageSize: size,
    };
  }

  async myFavorites(siteId: number, memberId: number, page = 1, pageSize = 10) {
    const size = Math.min(50, Math.max(1, Number(pageSize) || 10));
    const no = Math.max(1, Math.floor(Number(page) || 1));
    const [rows, total] = await Promise.all([
      this.prisma.knowledgePayFavorite.findMany({
        where: { siteId, memberId },
        orderBy: { id: 'desc' },
        skip: (no - 1) * size,
        take: size,
      }),
      this.prisma.knowledgePayFavorite.count({ where: { siteId, memberId } }),
    ]);
    // 收藏是快照：内容下架后列表仍在，点进去才提示不存在
    return {
      list: rows.map((row) => ({
        id: row.id,
        resourceId: row.resourceId,
        title: row.title,
        cover: row.cover,
        createdAt: iso(row.createdAt),
      })),
      total,
      page: no,
      pageSize: size,
    };
  }

  async redeemCard(siteId: number, memberId: number, code: string) {
    const clean = String(code || '')
      .trim()
      .toUpperCase();
    if (!clean)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请输入卡密');
    const card = await this.prisma.knowledgePayCard.findFirst({
      where: { siteId, code: clean },
    });
    if (!card)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '卡号错误，请核对后重试',
      );
    if (card.status === 'used')
      throw new BusinessException(ErrorCode.CONFLICT, '该卡密已被使用');
    if (card.status === 'disabled')
      throw new BusinessException(ErrorCode.CONFLICT, '该卡密已被站点停用');
    return this.prisma.$transaction(async (tx) => {
      // 条件更新占用卡密，防并发双花
      const taken = await tx.knowledgePayCard.updateMany({
        where: { id: card.id, status: 'unused' },
        data: { status: 'used', usedBy: memberId, usedAt: new Date() },
      });
      if (taken.count !== 1)
        throw new BusinessException(ErrorCode.CONFLICT, '该卡密已被使用');
      const member = await tx.knowledgePayMember.findUniqueOrThrow({
        where: { id: memberId },
      });
      let message = '';
      if (card.kind === 'vip') {
        const base =
          member.vipUntil && member.vipUntil.getTime() > Date.now()
            ? member.vipUntil.getTime()
            : Date.now();
        await tx.knowledgePayMember.update({
          where: { id: memberId },
          data: { vipUntil: new Date(base + card.days * 86_400_000) },
        });
        message = `充值成功，会员时长增加 ${card.days} 天`;
      } else if (card.kind === 'points') {
        await tx.knowledgePayMember.update({
          where: { id: memberId },
          data: { points: { increment: card.points } },
        });
        message = `充值成功，积分增加 ${card.points}`;
      } else {
        const resource = await tx.knowledgePayResource.findFirst({
          where: {
            id: card.resourceId,
            siteId,
            status: true,
            auditStatus: 'published',
          },
        });
        if (!resource)
          throw new BusinessException(
            ErrorCode.CONFLICT,
            '对应内容已下架，请联系站点方',
          );
        const existed = await tx.knowledgePayOrder.findFirst({
          where: { siteId, memberId, resourceId: resource.id },
          select: { id: true },
        });
        if (!existed) {
          await tx.knowledgePayOrder.create({
            data: {
              siteId,
              userId: member.userId,
              memberId,
              resourceId: resource.id,
              title: resource.title,
              cover: resource.cover,
              url: resource.url,
              payMethod: 'card',
              amount: 0,
            },
          });
        }
        message = `《${resource.title}》已开通`;
      }
      return { message };
    });
  }

  async buyVip(siteId: number, memberId: number, plan: number) {
    const site = await this.prisma.knowledgePaySite.findUniqueOrThrow({
      where: { id: siteId },
    });
    const plans = this.service.vipPlansOf(site);
    const chosen = plans.find((row) => row.plan === Number(plan));
    if (!chosen)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '会员套餐不存在');
    const paid = await this.prisma.knowledgePayMember.updateMany({
      where: { id: memberId, points: { gte: chosen.price } },
      data: { points: { decrement: chosen.price } },
    });
    if (paid.count !== 1) {
      const member = await this.prisma.knowledgePayMember.findUniqueOrThrow({
        where: { id: memberId },
      });
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `积分不足：${chosen.plan} 个月会员需要 ${chosen.price} 积分，当前余额 ${member.points}`,
      );
    }
    const member = await this.prisma.knowledgePayMember.findUniqueOrThrow({
      where: { id: memberId },
    });
    const base =
      member.vipUntil && member.vipUntil.getTime() > Date.now()
        ? member.vipUntil.getTime()
        : Date.now();
    await this.prisma.knowledgePayMember.update({
      where: { id: memberId },
      data: { vipUntil: new Date(base + chosen.plan * 30 * 86_400_000) },
    });
    return { message: `开通成功：${chosen.plan} 个月会员`, plan: chosen.plan };
  }
}
