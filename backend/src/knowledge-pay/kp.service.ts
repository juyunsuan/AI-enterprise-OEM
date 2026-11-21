import { randomBytes } from 'node:crypto';
import {
  KP_CARD_KINDS,
  KP_TOGGLE_KEYS,
  KP_VIP_PLANS,
  type KpBannerInput,
  type KpBannerRow,
  type KpCardGenerateInput,
  type KpCardGenerateResult,
  type KpCardRow,
  type KpCategoryInput,
  type KpCategoryRow,
  type KpChapterInput,
  type KpLearningRow,
  type KpLessonInput,
  type KpLessonRow,
  type KpLinkInput,
  type KpLinkRow,
  type KpMemberAdjustInput,
  type KpMemberRow,
  type KpNavInput,
  type KpNoticeInput,
  type KpNoticeRow,
  type KpOrderRow,
  type KpOverview,
  type KpPageInput,
  type KpResourceInput,
  type KpResourceRow,
  type KpReviewRow,
  type KpSettingsInput,
  type KpSettingsView,
  type KpTeacherInput,
  type KpVipPlan,
} from '@enterprise/contracts';
import type { Prisma } from '../../generated/prisma';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { LIST_ALL_LIMIT, pageOf, pageParam } from '../common/api';
import { MiniProgramCrypto } from '../miniprogram/miniprogram-crypto';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_VIP_PLANS: KpVipPlan[] = [
  { plan: 1, price: 99, cashPrice: 0 },
  { plan: 6, price: 499, cashPrice: 0 },
  { plan: 12, price: 899, cashPrice: 0 },
];
const DEFAULT_SIGN_REWARDS = [1, 1, 2, 2, 3, 3, 5];

/** 卡密码去除易混字符（0/O、1/I/L），与站内邀请码同一口径。 */
const CARD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function genCardCode(): string {
  const bytes = randomBytes(12);
  return Array.from(bytes, (b) => CARD_ALPHABET[b % CARD_ALPHABET.length]).join(
    '',
  );
}

function iso(value: Date | null | undefined): string {
  return value ? value.toISOString() : '';
}

/** JSON 列读取时防御式解析（历史脏数据回落默认值，不让公开通道 500）。 */
function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function normalizeToggles(raw: unknown): Record<string, boolean> {
  const stored = asObject(raw);
  return Object.fromEntries(
    KP_TOGGLE_KEYS.map((key) => [key, stored[key] !== false]),
  );
}

type ListQuery = { keyword?: string; page?: number; pageSize?: number };
type ResourceListQuery = ListQuery & {
  categoryId?: number;
  mediaType?: string;
  accessMode?: string;
  status?: string;
  auditStatus?: string;
};

/**
 * 知识付费云课堂的业务层（工作台 → 建站管理）。
 *
 * 归属口径与活码 / 小程序绑定一致：站点行按 `userId` 归个人账户、首次访问自动创建
 *（siteCode 随机生成后稳定不变），小程序端凭 siteCode 公开寻址；各业务表再冗余 userId，
 * 行级过滤一律 `siteId`，越权即「不存在」。
 */
export class KnowledgePayService {
  private cryptoInstance: MiniProgramCrypto | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** 未配置 EXTERNAL_CRED_KEY 的环境（单测/文档生成）不在构造期抛错。 */
  private get crypto() {
    return (this.cryptoInstance ??= new MiniProgramCrypto());
  }

  /** 解密站点侧密文凭据（支付密钥等）；空串原样返回。 */
  decryptSecret(value: string) {
    return value ? this.crypto.decrypt(value) : '';
  }

  // ------------------------------------------------------------------
  // 站点
  // ------------------------------------------------------------------

  async ensureSite(userId: string) {
    const existing = await this.prisma.knowledgePaySite.findUnique({
      where: { userId },
    });
    if (existing) return existing;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const siteCode = randomBytes(5).toString('hex').toUpperCase();
      try {
        return await this.prisma.knowledgePaySite.create({
          data: { userId, siteCode },
        });
      } catch (error) {
        const duplicated = await this.prisma.knowledgePaySite.findUnique({
          where: { userId },
        });
        if (duplicated) return duplicated;
        if (
          !String((error as { code?: string })?.code || '').includes('P2002')
        ) {
          throw error;
        }
      }
    }
    throw new BusinessException(
      ErrorCode.INTERNAL_ERROR,
      '知识付费站点初始化失败，请重试',
    );
  }

  async siteByCode(siteCode: string) {
    const code = String(siteCode || '')
      .trim()
      .toUpperCase();
    if (!code) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '缺少站点编码：请在「知识付费云课堂 → 基础设置」查看站点编码并填到小程序 config.js 里',
      );
    }
    const site = await this.prisma.knowledgePaySite.findUnique({
      where: { siteCode: code },
    });
    if (!site) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '站点不存在或站点编码有误，请到「工作台 → 建站管理 → 知识付费云课堂 → 基础设置」核对站点编码',
      );
    }
    return site;
  }

  /** 公开通道登录 / 打包用的微信运行时凭据（解密后只在调用栈内存在）。 */
  requireRuntime(site: { wxAppId: string; wxAppSecret: string }) {
    if (!site.wxAppId || !site.wxAppSecret) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '尚未配置微信小程序 AppID / AppSecret，请到「知识付费云课堂 → 基础设置 → 微信凭据」填写并保存',
      );
    }
    return {
      appId: site.wxAppId,
      appSecret: this.crypto.decrypt(site.wxAppSecret),
    };
  }

  settingsView(
    site: Awaited<ReturnType<KnowledgePayService['ensureSite']>>,
  ): KpSettingsView {
    return {
      siteCode: site.siteCode,
      siteName: site.siteName,
      slogan: site.slogan,
      themeColor: site.themeColor,
      toggles: normalizeToggles(site.toggles),
      faq: site.faq,
      about: site.about,
      vipPlans: this.vipPlansOf(site),
      signRewards: this.signRewardsOf(site),
      hotWords: site.hotWords,
      moreTitle: site.moreTitle,
      wxAppId: site.wxAppId,
      wxAppSecretConfigured: Boolean(site.wxAppSecret),
      wxMchId: site.wxMchId,
      wxPaySerial: site.wxPaySerial,
      wxPayApiV3KeyConfigured: Boolean(site.wxPayApiV3Key),
      wxPayPrivateKeyConfigured: Boolean(site.wxPayPrivateKey),
      wxPayReady: Boolean(
        site.wxAppId &&
        site.wxMchId &&
        site.wxPaySerial &&
        site.wxPayApiV3Key &&
        site.wxPayPrivateKey,
      ),
      adUnitTab: site.adUnitTab,
      adUnitDetail: site.adUnitDetail,
      enabled: site.enabled,
      updatedAt: iso(site.updatedAt),
    };
  }

  /** 保存设置：凭据留空保留原值；启用要求凭据完整（与平台级小程序管理同口径）。 */
  async saveSettings(
    userId: string,
    body: KpSettingsInput,
  ): Promise<KpSettingsView> {
    const site = await this.ensureSite(userId);
    const themeColor = String(body.themeColor || '').trim();
    if (themeColor && !HEX_COLOR.test(themeColor)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '主题色需为 #RRGGBB 格式，例如 #3370ff',
      );
    }
    const vipPlans = (body.vipPlans || [])
      .filter((row) =>
        (KP_VIP_PLANS as readonly number[]).includes(Number(row.plan)),
      )
      .map((row) => ({
        plan: Number(row.plan),
        price: Math.max(0, Math.round(row.price)),
        cashPrice: Math.max(0, Math.round(Number(row.cashPrice) || 0)),
      }));
    const toggles = normalizeToggles(body.toggles);
    const appSecret = String(body.wxAppSecret || '').trim();
    const payApiV3Key = String(body.wxPayApiV3Key || '').trim();
    const payPrivateKey = String(body.wxPayPrivateKey || '').trim();
    const next = {
      siteName: String(body.siteName || '')
        .trim()
        .slice(0, 60),
      slogan: String(body.slogan || '')
        .trim()
        .slice(0, 120),
      themeColor: themeColor || site.themeColor,
      toggles: toggles as Prisma.InputJsonValue,
      faq: String(body.faq || '').slice(0, 20000),
      about: String(body.about || '').slice(0, 20000),
      vipPlans: (vipPlans.length
        ? vipPlans
        : DEFAULT_VIP_PLANS) as Prisma.InputJsonValue,
      signRewards: (body.signRewards && body.signRewards.length
        ? body.signRewards.map((n) => Math.max(0, Math.round(n)))
        : DEFAULT_SIGN_REWARDS) as Prisma.InputJsonValue,
      hotWords: String(body.hotWords || '')
        .trim()
        .slice(0, 255),
      moreTitle:
        String(body.moreTitle || '')
          .trim()
          .slice(0, 60) || '精选推荐',
      wxAppId: String(body.wxAppId || '')
        .trim()
        .slice(0, 64),
      wxAppSecret: appSecret
        ? this.crypto.encrypt(appSecret)
        : site.wxAppSecret,
      wxMchId: String(body.wxMchId || '')
        .trim()
        .slice(0, 32),
      wxPaySerial: String(body.wxPaySerial || '')
        .trim()
        .slice(0, 64),
      wxPayApiV3Key: payApiV3Key
        ? this.crypto.encrypt(payApiV3Key)
        : site.wxPayApiV3Key,
      wxPayPrivateKey: payPrivateKey
        ? this.crypto.encrypt(payPrivateKey)
        : site.wxPayPrivateKey,
      adUnitTab: String(body.adUnitTab || '')
        .trim()
        .slice(0, 64),
      adUnitDetail: String(body.adUnitDetail || '')
        .trim()
        .slice(0, 64),
      enabled: body.enabled === true,
    };
    if (next.enabled && (!next.wxAppId || !next.wxAppSecret)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '启用站点前请先填写微信小程序 AppID 与 AppSecret',
      );
    }
    const updated = await this.prisma.knowledgePaySite.update({
      where: { id: site.id },
      data: next,
    });
    return this.settingsView(updated);
  }

  // ------------------------------------------------------------------
  // 分类
  // ------------------------------------------------------------------

  private categoryView(
    row: {
      id: number;
      title: string;
      cover: string;
      sort: number;
      status: boolean;
      createdAt: Date;
    },
    resourceCount = 0,
  ): KpCategoryRow {
    return {
      id: row.id,
      title: row.title,
      cover: row.cover,
      sort: row.sort,
      status: row.status,
      resourceCount,
      createdAt: iso(row.createdAt),
    };
  }

  private async requireCategory(siteId: number, id: number) {
    const row = await this.prisma.knowledgePayCategory.findFirst({
      where: { id: Number(id), siteId },
    });
    if (!row)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '分类不存在或不属于本站点',
      );
    return row;
  }

  private categoryData(body: KpCategoryInput) {
    return {
      title: String(body.title).trim().slice(0, 60),
      cover: String(body.cover || '')
        .trim()
        .slice(0, 512),
      sort: Math.round(Number(body.sort) || 0),
      status: body.status !== false,
    };
  }

  async listCategories(userId: string): Promise<{ list: KpCategoryRow[] }> {
    const site = await this.ensureSite(userId);
    const rows = await this.prisma.knowledgePayCategory.findMany({
      where: { siteId: site.id },
      orderBy: [{ sort: 'desc' }, { id: 'asc' }],
      take: LIST_ALL_LIMIT,
    });
    const counts = await this.prisma.knowledgePayResource.groupBy({
      by: ['categoryId'],
      where: { siteId: site.id },
      _count: { _all: true },
    });
    const countOf = new Map(
      counts.map((row) => [row.categoryId, row._count._all]),
    );
    return {
      list: rows.map((row) => this.categoryView(row, countOf.get(row.id) || 0)),
    };
  }

  async createCategory(
    userId: string,
    body: KpCategoryInput,
  ): Promise<KpCategoryRow> {
    const site = await this.ensureSite(userId);
    const row = await this.prisma.knowledgePayCategory.create({
      data: { siteId: site.id, userId, ...this.categoryData(body) },
    });
    return this.categoryView(row);
  }

  async updateCategory(
    userId: string,
    id: string,
    body: KpCategoryInput,
  ): Promise<KpCategoryRow> {
    const site = await this.ensureSite(userId);
    const existing = await this.requireCategory(site.id, Number(id));
    const row = await this.prisma.knowledgePayCategory.update({
      where: { id: existing.id },
      data: this.categoryData(body),
    });
    return this.categoryView(row);
  }

  async removeCategory(userId: string, id: string) {
    const site = await this.ensureSite(userId);
    const row = await this.requireCategory(site.id, Number(id));
    const linked = await this.prisma.knowledgePayResource.count({
      where: { siteId: site.id, categoryId: row.id },
    });
    if (linked > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `该分类下还有 ${linked} 条内容，请先在「付费内容」里移走或删除后再删分类`,
      );
    }
    await this.prisma.knowledgePayCategory.delete({ where: { id: row.id } });
    return { removed: true };
  }

  // ------------------------------------------------------------------
  // 内容
  // ------------------------------------------------------------------

  private resourceView(
    row: {
      id: number;
      categoryId: number;
      mediaType: string;
      accessMode: string;
      price: number;
      cashPriceCents: number;
      teacherId: number;
      title: string;
      cover: string;
      intro: string;
      url: string;
      teacherName: string;
      teacherTitle: string;
      teacherAvatar: string;
      teacherIntro: string;
      auditStatus: string;
      auditNote: string;
      hot: boolean;
      sort: number;
      viewCount: number;
      status: boolean;
      createdAt: Date;
    },
    extra: {
      categoryTitle?: string;
      orderCount?: number;
      lessonCount?: number;
      ratingAvg?: number;
      ratingCount?: number;
    } = {},
  ): KpResourceRow {
    return {
      id: row.id,
      categoryId: row.categoryId,
      categoryTitle: extra.categoryTitle || '',
      mediaType: row.mediaType as KpResourceRow['mediaType'],
      accessMode: row.accessMode as KpResourceRow['accessMode'],
      price: row.price,
      cashPriceCents: row.cashPriceCents,
      teacherId: row.teacherId,
      title: row.title,
      cover: row.cover,
      intro: row.intro,
      url: row.url,
      teacherName: row.teacherName,
      teacherTitle: row.teacherTitle,
      teacherAvatar: row.teacherAvatar,
      teacherIntro: row.teacherIntro,
      auditStatus: row.auditStatus,
      auditNote: row.auditNote,
      lessonCount: extra.lessonCount || 0,
      ratingAvg: Math.round((extra.ratingAvg || 0) * 10) / 10,
      ratingCount: extra.ratingCount || 0,
      hot: row.hot,
      sort: row.sort,
      viewCount: row.viewCount,
      orderCount: extra.orderCount || 0,
      status: row.status,
      createdAt: iso(row.createdAt),
    };
  }

  private async requireResource(siteId: number, id: number) {
    const row = await this.prisma.knowledgePayResource.findFirst({
      where: { id: Number(id), siteId },
    });
    if (!row)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '内容不存在或不属于本站点',
      );
    return row;
  }

  private resourceData(body: KpResourceInput) {
    const accessMode = body.accessMode || 'points';
    return {
      categoryId: Math.max(0, Math.round(Number(body.categoryId) || 0)),
      mediaType: body.mediaType || 'video',
      accessMode,
      price:
        accessMode === 'points'
          ? Math.max(0, Math.round(Number(body.price) || 0))
          : 0,
      cashPriceCents: Math.max(0, Math.round(Number(body.cashPriceCents) || 0)),
      teacherId: Math.max(0, Math.round(Number(body.teacherId) || 0)),
      auditStatus: body.auditStatus || 'published',
      auditNote: String(body.auditNote || '')
        .trim()
        .slice(0, 255),
      title: String(body.title).trim().slice(0, 120),
      cover: String(body.cover || '')
        .trim()
        .slice(0, 512),
      intro: String(body.intro || '').slice(0, 60000),
      url: String(body.url || '')
        .trim()
        .slice(0, 512),
      teacherName: String(body.teacherName || '')
        .trim()
        .slice(0, 60),
      teacherTitle: String(body.teacherTitle || '')
        .trim()
        .slice(0, 60),
      teacherAvatar: String(body.teacherAvatar || '')
        .trim()
        .slice(0, 512),
      teacherIntro: String(body.teacherIntro || '').slice(0, 2000),
      hot: body.hot === true,
      sort: Math.round(Number(body.sort) || 0),
      status: body.status !== false,
    };
  }

  async listResources(userId: string, query: ResourceListQuery) {
    const site = await this.ensureSite(userId);
    const { page, pageSize, offset } = pageParam(query.page, query.pageSize);
    const where: Record<string, unknown> = { siteId: site.id };
    if (Number(query.categoryId) > 0)
      where.categoryId = Number(query.categoryId);
    if (query.mediaType && query.mediaType !== 'all')
      where.mediaType = query.mediaType;
    if (query.accessMode && query.accessMode !== 'all')
      where.accessMode = query.accessMode;
    if (query.status === 'online') where.status = true;
    if (query.status === 'offline') where.status = false;
    if (query.auditStatus && query.auditStatus !== 'all')
      where.auditStatus = query.auditStatus;
    const keyword = String(query.keyword || '')
      .trim()
      .slice(0, 60);
    if (keyword) where.title = { contains: keyword };
    const [rows, total] = await Promise.all([
      this.prisma.knowledgePayResource.findMany({
        where: where as never,
        orderBy: [{ sort: 'desc' }, { id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.knowledgePayResource.count({ where: where as never }),
    ]);
    const categories = await this.prisma.knowledgePayCategory.findMany({
      where: { siteId: site.id },
      select: { id: true, title: true },
    });
    const titleOf = new Map(categories.map((row) => [row.id, row.title]));
    const orderCounts = await this.prisma.knowledgePayOrder.groupBy({
      by: ['resourceId'],
      where: { siteId: site.id, resourceId: { in: rows.map((row) => row.id) } },
      _count: { _all: true },
    });
    const countOf = new Map(
      orderCounts.map((row) => [row.resourceId, row._count._all]),
    );
    const ids = rows.map((row) => row.id);
    const [lessonCounts, ratingAggs] = await Promise.all([
      this.prisma.knowledgePayLesson.groupBy({
        by: ['resourceId'],
        where: { siteId: site.id, resourceId: { in: ids }, status: true },
        _count: { _all: true },
      }),
      this.prisma.knowledgePayReview.groupBy({
        by: ['resourceId'],
        where: { siteId: site.id, resourceId: { in: ids }, status: true },
        _avg: { rating: true },
        _count: { _all: true },
      }),
    ]);
    const lessonOf = new Map(
      lessonCounts.map((row) => [row.resourceId, row._count._all]),
    );
    const ratingOf = new Map(
      ratingAggs.map((row) => [
        row.resourceId,
        { avg: row._avg.rating || 0, count: row._count._all },
      ]),
    );
    return pageOf(
      rows.map((row) =>
        this.resourceView(row, {
          categoryTitle: titleOf.get(row.categoryId) || '',
          orderCount: countOf.get(row.id) || 0,
          lessonCount: lessonOf.get(row.id) || 0,
          ratingAvg: ratingOf.get(row.id)?.avg || 0,
          ratingCount: ratingOf.get(row.id)?.count || 0,
        }),
      ),
      total,
      page,
      pageSize,
    );
  }

  async createResource(
    userId: string,
    body: KpResourceInput,
  ): Promise<KpResourceRow> {
    const site = await this.ensureSite(userId);
    const data = this.resourceData(body);
    if (data.categoryId) await this.requireCategory(site.id, data.categoryId);
    if (data.teacherId) await this.requireTeacher(site.id, data.teacherId);
    const row = await this.prisma.knowledgePayResource.create({
      data: { siteId: site.id, userId, ...data },
    });
    return this.resourceView(row);
  }

  async updateResource(
    userId: string,
    id: string,
    body: KpResourceInput,
  ): Promise<KpResourceRow> {
    const site = await this.ensureSite(userId);
    const existing = await this.requireResource(site.id, Number(id));
    const data = this.resourceData(body);
    if (data.categoryId) await this.requireCategory(site.id, data.categoryId);
    if (data.teacherId) await this.requireTeacher(site.id, data.teacherId);
    const row = await this.prisma.knowledgePayResource.update({
      where: { id: existing.id },
      data,
    });
    return this.resourceView(row);
  }

  async removeResource(userId: string, id: string) {
    const site = await this.ensureSite(userId);
    const row = await this.requireResource(site.id, Number(id));
    await this.prisma.knowledgePayResource.delete({ where: { id: row.id } });
    // 收藏、课时、学习进度与评价随课程清掉；订单是消费凭据，保留作历史台账。
    await Promise.all([
      this.prisma.knowledgePayFavorite.deleteMany({
        where: { siteId: site.id, resourceId: row.id },
      }),
      this.prisma.knowledgePayLesson.deleteMany({
        where: { siteId: site.id, resourceId: row.id },
      }),
      this.prisma.knowledgePayChapter.deleteMany({
        where: { siteId: site.id, resourceId: row.id },
      }),
      this.prisma.knowledgePayProgress.deleteMany({
        where: { siteId: site.id, resourceId: row.id },
      }),
      this.prisma.knowledgePayReview.deleteMany({
        where: { siteId: site.id, resourceId: row.id },
      }),
    ]);
    return { removed: true };
  }

  /** 审核快捷动作：只改审核态与备注。 */
  async auditResource(
    userId: string,
    id: string,
    body: { auditStatus: string; auditNote: string },
  ) {
    const site = await this.ensureSite(userId);
    const row = await this.requireResource(site.id, Number(id));
    const updated = await this.prisma.knowledgePayResource.update({
      where: { id: row.id },
      data: {
        auditStatus: body.auditStatus,
        auditNote: String(body.auditNote || '')
          .trim()
          .slice(0, 255),
      },
    });
    return {
      id: updated.id,
      auditStatus: updated.auditStatus,
      auditNote: updated.auditNote,
    };
  }

  // ------------------------------------------------------------------
  // 课程目录（课时）
  // ------------------------------------------------------------------

  private lessonView(row: {
    id: number;
    resourceId: number;
    chapterId: number;
    title: string;
    mediaType: string;
    url: string;
    intro: string;
    durationSec: number;
    freeTrial: boolean;
    sort: number;
    status: boolean;
    createdAt: Date;
  }): KpLessonRow {
    return {
      id: row.id,
      resourceId: row.resourceId,
      chapterId: row.chapterId,
      title: row.title,
      mediaType: row.mediaType as KpLessonRow['mediaType'],
      url: row.url,
      intro: row.intro,
      durationSec: row.durationSec,
      freeTrial: row.freeTrial,
      sort: row.sort,
      status: row.status,
      createdAt: iso(row.createdAt),
    };
  }

  async listLessons(userId: string, query: { resourceId: number }) {
    const site = await this.ensureSite(userId);
    await this.requireResource(site.id, Number(query.resourceId));
    const rows = await this.prisma.knowledgePayLesson.findMany({
      where: { siteId: site.id, resourceId: Number(query.resourceId) },
      orderBy: [{ sort: 'desc' }, { id: 'asc' }],
      take: 500,
    });
    return { list: rows.map((row) => this.lessonView(row)) };
  }

  async saveLesson(userId: string, body: KpLessonInput): Promise<KpLessonRow> {
    const site = await this.ensureSite(userId);
    await this.requireResource(site.id, Number(body.resourceId));
    if (body.chapterId)
      await this.requireChapter(
        site.id,
        Number(body.resourceId),
        body.chapterId,
      );
    const data = {
      title: String(body.title).trim().slice(0, 120),
      chapterId: Math.max(0, Math.round(Number(body.chapterId) || 0)),
      mediaType: body.mediaType || 'video',
      url: String(body.url || '')
        .trim()
        .slice(0, 512),
      intro: String(body.intro || '').slice(0, 60000),
      durationSec: Math.max(0, Math.round(Number(body.durationSec) || 0)),
      freeTrial: body.freeTrial === true,
      sort: Math.round(Number(body.sort) || 0),
      status: body.status !== false,
    };
    const row = await this.prisma.knowledgePayLesson.create({
      data: {
        siteId: site.id,
        userId,
        resourceId: Number(body.resourceId),
        ...data,
      },
    });
    return this.lessonView(row);
  }

  async updateLesson(
    userId: string,
    id: string,
    body: KpLessonInput,
  ): Promise<KpLessonRow> {
    const site = await this.ensureSite(userId);
    const existing = await this.prisma.knowledgePayLesson.findFirst({
      where: { id: Number(id), siteId: site.id },
    });
    if (!existing)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '课时不存在或不属于本站点',
      );
    await this.requireResource(site.id, Number(body.resourceId));
    if (body.chapterId)
      await this.requireChapter(
        site.id,
        Number(body.resourceId),
        body.chapterId,
      );
    const row = await this.prisma.knowledgePayLesson.update({
      where: { id: existing.id },
      data: {
        resourceId: Number(body.resourceId),
        chapterId: Math.max(0, Math.round(Number(body.chapterId) || 0)),
        title: String(body.title).trim().slice(0, 120),
        mediaType: body.mediaType || 'video',
        url: String(body.url || '')
          .trim()
          .slice(0, 512),
        intro: String(body.intro || '').slice(0, 60000),
        durationSec: Math.max(0, Math.round(Number(body.durationSec) || 0)),
        freeTrial: body.freeTrial === true,
        sort: Math.round(Number(body.sort) || 0),
        status: body.status !== false,
      },
    });
    return this.lessonView(row);
  }

  async removeLesson(userId: string, id: string) {
    const site = await this.ensureSite(userId);
    const row = await this.prisma.knowledgePayLesson.findFirst({
      where: { id: Number(id), siteId: site.id },
    });
    if (!row)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '课时不存在或不属于本站点',
      );
    await this.prisma.knowledgePayLesson.delete({ where: { id: row.id } });
    await this.prisma.knowledgePayProgress.deleteMany({
      where: { siteId: site.id, lessonId: row.id },
    });
    return { removed: true };
  }

  // ------------------------------------------------------------------
  // 章节 / 讲师 / 发现页导航 / 自定义单页
  // ------------------------------------------------------------------

  private async requireChapter(siteId: number, resourceId: number, id: number) {
    const row = await this.prisma.knowledgePayChapter.findFirst({
      where: { id: Number(id), siteId, resourceId },
    });
    if (!row)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '章节不存在或不属于本课程',
      );
    return row;
  }

  async listChapters(userId: string, query: { resourceId: number }) {
    const site = await this.ensureSite(userId);
    await this.requireResource(site.id, Number(query.resourceId));
    const rows = await this.prisma.knowledgePayChapter.findMany({
      where: { siteId: site.id, resourceId: Number(query.resourceId) },
      orderBy: [{ sort: 'desc' }, { id: 'asc' }],
      take: 300,
    });
    const counts = await this.prisma.knowledgePayLesson.groupBy({
      by: ['chapterId'],
      where: {
        siteId: site.id,
        resourceId: Number(query.resourceId),
        status: true,
      },
      _count: { _all: true },
    });
    const countOf = new Map(
      counts.map((row) => [row.chapterId, row._count._all]),
    );
    return {
      list: rows.map((row) => ({
        id: row.id,
        resourceId: row.resourceId,
        title: row.title,
        sort: row.sort,
        status: row.status,
        lessonCount: countOf.get(row.id) || 0,
        createdAt: iso(row.createdAt),
      })),
    };
  }

  async saveChapter(userId: string, body: KpChapterInput) {
    const site = await this.ensureSite(userId);
    await this.requireResource(site.id, Number(body.resourceId));
    const row = await this.prisma.knowledgePayChapter.create({
      data: {
        siteId: site.id,
        userId,
        resourceId: Number(body.resourceId),
        title: String(body.title).trim().slice(0, 120),
        sort: Math.round(Number(body.sort) || 0),
        status: body.status !== false,
      },
    });
    return {
      id: row.id,
      resourceId: row.resourceId,
      title: row.title,
      sort: row.sort,
      status: row.status,
      lessonCount: 0,
      createdAt: iso(row.createdAt),
    };
  }

  async updateChapter(userId: string, id: string, body: KpChapterInput) {
    const site = await this.ensureSite(userId);
    const existing = await this.prisma.knowledgePayChapter.findFirst({
      where: { id: Number(id), siteId: site.id },
    });
    if (!existing)
      throw new BusinessException(ErrorCode.NOT_FOUND, '章节不存在');
    await this.requireResource(site.id, Number(body.resourceId));
    const row = await this.prisma.knowledgePayChapter.update({
      where: { id: existing.id },
      data: {
        resourceId: Number(body.resourceId),
        title: String(body.title).trim().slice(0, 120),
        sort: Math.round(Number(body.sort) || 0),
        status: body.status !== false,
      },
    });
    const lessonCount = await this.prisma.knowledgePayLesson.count({
      where: { siteId: site.id, chapterId: row.id, status: true },
    });
    return {
      id: row.id,
      resourceId: row.resourceId,
      title: row.title,
      sort: row.sort,
      status: row.status,
      lessonCount,
      createdAt: iso(row.createdAt),
    };
  }

  async removeChapter(userId: string, id: string) {
    const site = await this.ensureSite(userId);
    const row = await this.prisma.knowledgePayChapter.findFirst({
      where: { id: Number(id), siteId: site.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '章节不存在');
    await this.prisma.$transaction(async (tx) => {
      // 章节删除不删课时：课时回落到「未分章」，避免误删学员进度。
      await tx.knowledgePayLesson.updateMany({
        where: { siteId: site.id, chapterId: row.id },
        data: { chapterId: 0 },
      });
      await tx.knowledgePayChapter.delete({ where: { id: row.id } });
    });
    return { removed: true };
  }

  private async requireTeacher(siteId: number, id: number) {
    const row = await this.prisma.knowledgePayTeacher.findFirst({
      where: { id: Number(id), siteId },
    });
    if (!row)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '讲师不存在或不属于本站点',
      );
    return row;
  }

  async listTeachers(userId: string) {
    const site = await this.ensureSite(userId);
    const rows = await this.prisma.knowledgePayTeacher.findMany({
      where: { siteId: site.id },
      orderBy: [{ sort: 'desc' }, { id: 'desc' }],
      take: 500,
    });
    const counts = await this.prisma.knowledgePayResource.groupBy({
      by: ['teacherId'],
      where: { siteId: site.id, teacherId: { in: rows.map((row) => row.id) } },
      _count: { _all: true },
    });
    const countOf = new Map(
      counts.map((row) => [row.teacherId, row._count._all]),
    );
    return {
      list: rows.map((row) => ({
        id: row.id,
        name: row.name,
        title: row.title,
        avatar: row.avatar,
        intro: row.intro,
        sort: row.sort,
        status: row.status,
        courseCount: countOf.get(row.id) || 0,
        createdAt: iso(row.createdAt),
      })),
    };
  }

  private teacherData(body: KpTeacherInput) {
    return {
      name: String(body.name).trim().slice(0, 60),
      title: String(body.title || '')
        .trim()
        .slice(0, 60),
      avatar: String(body.avatar || '')
        .trim()
        .slice(0, 512),
      intro: String(body.intro || '').slice(0, 2000),
      sort: Math.round(Number(body.sort) || 0),
      status: body.status !== false,
    };
  }

  async saveTeacher(userId: string, body: KpTeacherInput) {
    const site = await this.ensureSite(userId);
    const row = await this.prisma.knowledgePayTeacher.create({
      data: { siteId: site.id, userId, ...this.teacherData(body) },
    });
    return {
      id: row.id,
      name: row.name,
      title: row.title,
      avatar: row.avatar,
      intro: row.intro,
      sort: row.sort,
      status: row.status,
      courseCount: 0,
      createdAt: iso(row.createdAt),
    };
  }

  async updateTeacher(userId: string, id: string, body: KpTeacherInput) {
    const site = await this.ensureSite(userId);
    await this.requireTeacher(site.id, Number(id));
    const row = await this.prisma.knowledgePayTeacher.update({
      where: { id: Number(id) },
      data: this.teacherData(body),
    });
    // 课程上保留的是展示快照：讲师改名/换头像后同步，列表与详情不会一边新一边旧。
    await this.prisma.knowledgePayResource.updateMany({
      where: { siteId: site.id, teacherId: row.id },
      data: {
        teacherName: row.name,
        teacherTitle: row.title,
        teacherAvatar: row.avatar,
        teacherIntro: row.intro,
      },
    });
    const courseCount = await this.prisma.knowledgePayResource.count({
      where: { siteId: site.id, teacherId: row.id },
    });
    return {
      id: row.id,
      name: row.name,
      title: row.title,
      avatar: row.avatar,
      intro: row.intro,
      sort: row.sort,
      status: row.status,
      courseCount,
      createdAt: iso(row.createdAt),
    };
  }

  async removeTeacher(userId: string, id: string) {
    const site = await this.ensureSite(userId);
    const row = await this.requireTeacher(site.id, Number(id));
    await this.prisma.$transaction(async (tx) => {
      // 课程保留（讲师文字快照仍在 resource 上），只解绑关联。
      await tx.knowledgePayResource.updateMany({
        where: { siteId: site.id, teacherId: row.id },
        data: { teacherId: 0 },
      });
      await tx.knowledgePayTeacher.delete({ where: { id: row.id } });
    });
    return { removed: true };
  }

  private navView(row: {
    id: number;
    title: string;
    icon: string;
    link: string;
    sort: number;
    status: boolean;
  }) {
    return {
      id: row.id,
      title: row.title,
      icon: row.icon,
      link: row.link,
      sort: row.sort,
      status: row.status,
    };
  }

  async listNavs(userId: string) {
    const site = await this.ensureSite(userId);
    const rows = await this.prisma.knowledgePayNav.findMany({
      where: { siteId: site.id },
      orderBy: [{ sort: 'desc' }, { id: 'asc' }],
      take: 100,
    });
    return { list: rows.map((row) => this.navView(row)) };
  }

  async saveNav(userId: string, body: KpNavInput) {
    const site = await this.ensureSite(userId);
    const row = await this.prisma.knowledgePayNav.create({
      data: {
        siteId: site.id,
        userId,
        title: String(body.title).trim().slice(0, 60),
        icon: String(body.icon || '')
          .trim()
          .slice(0, 512),
        link:
          String(body.link || 'none')
            .trim()
            .slice(0, 512) || 'none',
        sort: Math.round(Number(body.sort) || 0),
        status: body.status !== false,
      },
    });
    return this.navView(row);
  }

  async updateNav(userId: string, id: string, body: KpNavInput) {
    const site = await this.ensureSite(userId);
    await this.requireRow('knowledgePayNav', site.id, Number(id));
    const row = await this.prisma.knowledgePayNav.update({
      where: { id: Number(id) },
      data: {
        title: String(body.title).trim().slice(0, 60),
        icon: String(body.icon || '')
          .trim()
          .slice(0, 512),
        link:
          String(body.link || 'none')
            .trim()
            .slice(0, 512) || 'none',
        sort: Math.round(Number(body.sort) || 0),
        status: body.status !== false,
      },
    });
    return this.navView(row);
  }

  async removeNav(userId: string, id: string) {
    const site = await this.ensureSite(userId);
    await this.requireRow('knowledgePayNav', site.id, Number(id));
    await this.prisma.knowledgePayNav.delete({ where: { id: Number(id) } });
    return { removed: true };
  }

  private pageView(row: {
    id: number;
    title: string;
    slug: string;
    content: string;
    sort: number;
    status: boolean;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      content: row.content,
      sort: row.sort,
      status: row.status,
      createdAt: iso(row.createdAt),
    };
  }

  async listPages(userId: string) {
    const site = await this.ensureSite(userId);
    const rows = await this.prisma.knowledgePayPage.findMany({
      where: { siteId: site.id },
      orderBy: [{ sort: 'desc' }, { id: 'asc' }],
      take: 200,
    });
    return { list: rows.map((row) => this.pageView(row)) };
  }

  private async assertSlugFree(siteId: number, slug: string, exceptId = 0) {
    if (!slug) return;
    const existed = await this.prisma.knowledgePayPage.findFirst({
      where: { siteId, slug, id: { not: exceptId } },
      select: { id: true },
    });
    if (existed)
      throw new BusinessException(ErrorCode.CONFLICT, '页面标识已被使用');
  }

  async savePage(userId: string, body: KpPageInput) {
    const site = await this.ensureSite(userId);
    const slug =
      String(body.slug || '')
        .trim()
        .slice(0, 60) || `p${Date.now().toString(36)}`;
    await this.assertSlugFree(site.id, slug);
    const row = await this.prisma.knowledgePayPage.create({
      data: {
        siteId: site.id,
        userId,
        title: String(body.title).trim().slice(0, 120),
        slug,
        content: String(body.content || '').slice(0, 60000),
        sort: Math.round(Number(body.sort) || 0),
        status: body.status !== false,
      },
    });
    return this.pageView(row);
  }

  async updatePage(userId: string, id: string, body: KpPageInput) {
    const site = await this.ensureSite(userId);
    await this.requireRow('knowledgePayPage', site.id, Number(id));
    const slug = String(body.slug || '')
      .trim()
      .slice(0, 60);
    await this.assertSlugFree(site.id, slug, Number(id));
    const row = await this.prisma.knowledgePayPage.update({
      where: { id: Number(id) },
      data: {
        title: String(body.title).trim().slice(0, 120),
        slug,
        content: String(body.content || '').slice(0, 60000),
        sort: Math.round(Number(body.sort) || 0),
        status: body.status !== false,
      },
    });
    return this.pageView(row);
  }

  async removePage(userId: string, id: string) {
    const site = await this.ensureSite(userId);
    await this.requireRow('knowledgePayPage', site.id, Number(id));
    await this.prisma.knowledgePayPage.delete({ where: { id: Number(id) } });
    return { removed: true };
  }

  // ------------------------------------------------------------------
  // 评价与学习台账
  // ------------------------------------------------------------------

  private reviewView(
    row: {
      id: number;
      resourceId: number;
      memberId: number;
      rating: number;
      content: string;
      reply: string;
      status: boolean;
      repliedAt: Date | null;
      createdAt: Date;
    },
    courseTitle = '',
    nickname = '',
    avatar = '',
  ): KpReviewRow {
    return {
      id: row.id,
      resourceId: row.resourceId,
      courseTitle,
      memberId: row.memberId,
      nickname,
      avatar,
      rating: row.rating,
      content: row.content,
      reply: row.reply,
      status: row.status,
      repliedAt: iso(row.repliedAt),
      createdAt: iso(row.createdAt),
    };
  }

  private async reviewContext(
    siteId: number,
    rows: { resourceId: number; memberId: number }[],
  ) {
    const [resources, members] = await Promise.all([
      this.prisma.knowledgePayResource.findMany({
        where: { siteId, id: { in: rows.map((row) => row.resourceId) } },
        select: { id: true, title: true },
      }),
      this.prisma.knowledgePayMember.findMany({
        where: { siteId, id: { in: rows.map((row) => row.memberId) } },
        select: { id: true, nickname: true, avatar: true },
      }),
    ]);
    return {
      courseOf: new Map(resources.map((row) => [row.id, row.title])),
      memberOf: new Map(members.map((row) => [row.id, row])),
    };
  }

  async listReviews(
    userId: string,
    query: {
      page: number;
      pageSize: number;
      keyword: string;
      resourceId: number;
      status: string;
    },
  ) {
    const site = await this.ensureSite(userId);
    const { page, pageSize, offset } = pageParam(query.page, query.pageSize);
    const where: Record<string, unknown> = { siteId: site.id };
    if (Number(query.resourceId) > 0)
      where.resourceId = Number(query.resourceId);
    if (query.status === 'visible') where.status = true;
    if (query.status === 'hidden') where.status = false;
    const keyword = String(query.keyword || '')
      .trim()
      .slice(0, 60);
    if (keyword) where.content = { contains: keyword };
    const [rows, total] = await Promise.all([
      this.prisma.knowledgePayReview.findMany({
        where: where as never,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      this.prisma.knowledgePayReview.count({ where: where as never }),
    ]);
    const { courseOf, memberOf } = await this.reviewContext(site.id, rows);
    return pageOf(
      rows.map((row) =>
        this.reviewView(
          row,
          courseOf.get(row.resourceId) || '',
          memberOf.get(row.memberId)?.nickname || '微信用户',
          memberOf.get(row.memberId)?.avatar || '',
        ),
      ),
      total,
      page,
      pageSize,
    );
  }

  private async requireReview(siteId: number, id: number) {
    const row = await this.prisma.knowledgePayReview.findFirst({
      where: { id: Number(id), siteId },
    });
    if (!row)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '评价不存在或不属于本站点',
      );
    return row;
  }

  async replyReview(userId: string, id: string, body: { reply: string }) {
    const site = await this.ensureSite(userId);
    const existing = await this.requireReview(site.id, Number(id));
    const reply = String(body.reply || '')
      .trim()
      .slice(0, 2000);
    const row = await this.prisma.knowledgePayReview.update({
      where: { id: existing.id },
      data: {
        reply,
        repliedAt: reply ? new Date() : null,
      },
    });
    const { courseOf, memberOf } = await this.reviewContext(site.id, [row]);
    return this.reviewView(
      row,
      courseOf.get(row.resourceId) || '',
      memberOf.get(row.memberId)?.nickname || '微信用户',
      memberOf.get(row.memberId)?.avatar || '',
    );
  }

  async setReviewStatus(userId: string, id: string, body: { status: boolean }) {
    const site = await this.ensureSite(userId);
    const existing = await this.requireReview(site.id, Number(id));
    const row = await this.prisma.knowledgePayReview.update({
      where: { id: existing.id },
      data: { status: body.status === true },
    });
    const { courseOf, memberOf } = await this.reviewContext(site.id, [row]);
    return this.reviewView(
      row,
      courseOf.get(row.resourceId) || '',
      memberOf.get(row.memberId)?.nickname || '微信用户',
      memberOf.get(row.memberId)?.avatar || '',
    );
  }

  async removeReview(userId: string, id: string) {
    const site = await this.ensureSite(userId);
    const existing = await this.requireReview(site.id, Number(id));
    await this.prisma.knowledgePayReview.delete({
      where: { id: existing.id },
    });
    return { removed: true };
  }

  async listLearnings(
    userId: string,
    query: {
      page: number;
      pageSize: number;
      keyword: string;
      resourceId: number;
      completed: string;
    },
  ) {
    const site = await this.ensureSite(userId);
    const { page, pageSize, offset } = pageParam(query.page, query.pageSize);
    const where: Record<string, unknown> = { siteId: site.id };
    if (Number(query.resourceId) > 0)
      where.resourceId = Number(query.resourceId);
    if (query.completed === 'done') where.completed = true;
    if (query.completed === 'doing') where.completed = false;
    const keyword = String(query.keyword || '')
      .trim()
      .slice(0, 60);
    if (keyword) {
      // 关键词跨「会员昵称 / 课程名 / 课时名」三张表：先取匹配 ID，再作为 OR 条件下推。
      const [members, resources, lessons] = await Promise.all([
        this.prisma.knowledgePayMember.findMany({
          where: { siteId: site.id, nickname: { contains: keyword } },
          select: { id: true },
          take: 200,
        }),
        this.prisma.knowledgePayResource.findMany({
          where: { siteId: site.id, title: { contains: keyword } },
          select: { id: true },
          take: 200,
        }),
        this.prisma.knowledgePayLesson.findMany({
          where: { siteId: site.id, title: { contains: keyword } },
          select: { id: true },
          take: 200,
        }),
      ]);
      where.OR = [
        { memberId: { in: members.map((row) => row.id) } },
        { resourceId: { in: resources.map((row) => row.id) } },
        { lessonId: { in: lessons.map((row) => row.id) } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.knowledgePayProgress.findMany({
        where: where as never,
        orderBy: { updatedAt: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      this.prisma.knowledgePayProgress.count({ where: where as never }),
    ]);
    const [resources, lessons, members] = await Promise.all([
      this.prisma.knowledgePayResource.findMany({
        where: {
          siteId: site.id,
          id: { in: rows.map((row) => row.resourceId) },
        },
        select: { id: true, title: true },
      }),
      this.prisma.knowledgePayLesson.findMany({
        where: { siteId: site.id, id: { in: rows.map((row) => row.lessonId) } },
        select: { id: true, title: true },
      }),
      this.prisma.knowledgePayMember.findMany({
        where: { siteId: site.id, id: { in: rows.map((row) => row.memberId) } },
        select: { id: true, nickname: true, avatar: true },
      }),
    ]);
    const courseOf = new Map(resources.map((row) => [row.id, row.title]));
    const lessonOf = new Map(lessons.map((row) => [row.id, row.title]));
    const memberOf = new Map(members.map((row) => [row.id, row]));
    const list: KpLearningRow[] = rows.map((row) => ({
      id: row.id,
      memberId: row.memberId,
      nickname: memberOf.get(row.memberId)?.nickname || '微信用户',
      avatar: memberOf.get(row.memberId)?.avatar || '',
      resourceId: row.resourceId,
      courseTitle: courseOf.get(row.resourceId) || '',
      lessonId: row.lessonId,
      lessonTitle: lessonOf.get(row.lessonId) || '',
      positionSec: row.positionSec,
      durationSec: row.durationSec,
      completed: row.completed,
      updatedAt: iso(row.updatedAt),
    }));
    return pageOf(list, total, page, pageSize);
  }

  // ------------------------------------------------------------------
  // 装修：轮播 / 公告 / 精选位
  // ------------------------------------------------------------------

  private bannerView(row: {
    id: number;
    title: string;
    image: string;
    link: string;
    sort: number;
    status: boolean;
  }): KpBannerRow {
    return {
      id: row.id,
      title: row.title,
      image: row.image,
      link: row.link,
      sort: row.sort,
      status: row.status,
    };
  }

  private bannerData(body: KpBannerInput) {
    return {
      title: String(body.title || '')
        .trim()
        .slice(0, 120),
      image: String(body.image || '')
        .trim()
        .slice(0, 512),
      link:
        String(body.link || 'none')
          .trim()
          .slice(0, 512) || 'none',
      sort: Math.round(Number(body.sort) || 0),
      status: body.status !== false,
    };
  }

  private async requireRow<T extends { id: number }>(
    model:
      | 'knowledgePayBanner'
      | 'knowledgePayNotice'
      | 'knowledgePayLink'
      | 'knowledgePayNav'
      | 'knowledgePayPage'
      | 'knowledgePayChapter'
      | 'knowledgePayTeacher',
    siteId: number,
    id: number,
  ): Promise<T> {
    const row = await (
      this.prisma[model] as never as {
        findFirst(args: never): Promise<T | null>;
      }
    ).findFirst({ where: { id: Number(id), siteId } } as never);
    if (!row)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '记录不存在或不属于本站点',
      );
    return row;
  }

  async listBanners(userId: string): Promise<{ list: KpBannerRow[] }> {
    const site = await this.ensureSite(userId);
    const rows = await this.prisma.knowledgePayBanner.findMany({
      where: { siteId: site.id },
      orderBy: [{ sort: 'desc' }, { id: 'desc' }],
      take: LIST_ALL_LIMIT,
    });
    return { list: rows.map((row) => this.bannerView(row)) };
  }

  async saveBanner(
    userId: string,
    id: string | undefined,
    body: KpBannerInput,
  ) {
    const site = await this.ensureSite(userId);
    const data = this.bannerData(body);
    const row = id
      ? await (async () => {
          const existing = await this.requireRow<{ id: number }>(
            'knowledgePayBanner',
            site.id,
            Number(id),
          );
          return this.prisma.knowledgePayBanner.update({
            where: { id: existing.id },
            data,
          });
        })()
      : await this.prisma.knowledgePayBanner.create({
          data: { siteId: site.id, ...data },
        });
    return this.bannerView(row);
  }

  async removeBanner(userId: string, id: string) {
    const site = await this.ensureSite(userId);
    const row = await this.requireRow<{ id: number }>(
      'knowledgePayBanner',
      site.id,
      Number(id),
    );
    await this.prisma.knowledgePayBanner.delete({ where: { id: row.id } });
    return { removed: true };
  }

  async listNotices(userId: string, query: ListQuery) {
    const site = await this.ensureSite(userId);
    const { page, pageSize, offset } = pageParam(query.page, query.pageSize);
    const where: Record<string, unknown> = { siteId: site.id };
    const keyword = String(query.keyword || '')
      .trim()
      .slice(0, 60);
    if (keyword) where.title = { contains: keyword };
    const [rows, total] = await Promise.all([
      this.prisma.knowledgePayNotice.findMany({
        where: where as never,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      this.prisma.knowledgePayNotice.count({ where: where as never }),
    ]);
    return pageOf(
      rows.map((row): KpNoticeRow => ({
        id: row.id,
        title: row.title,
        content: row.content,
        status: row.status,
        createdAt: iso(row.createdAt),
      })),
      total,
      page,
      pageSize,
    );
  }

  private noticeData(body: KpNoticeInput) {
    return {
      title: String(body.title).trim().slice(0, 120),
      content: String(body.content || '').slice(0, 20000),
      status: body.status !== false,
    };
  }

  async saveNotice(
    userId: string,
    id: string | undefined,
    body: KpNoticeInput,
  ) {
    const site = await this.ensureSite(userId);
    const data = this.noticeData(body);
    const row = id
      ? await (async () => {
          const existing = await this.requireRow<{ id: number }>(
            'knowledgePayNotice',
            site.id,
            Number(id),
          );
          return this.prisma.knowledgePayNotice.update({
            where: { id: existing.id },
            data,
          });
        })()
      : await this.prisma.knowledgePayNotice.create({
          data: { siteId: site.id, ...data },
        });
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      status: row.status,
      createdAt: iso(row.createdAt),
    } satisfies KpNoticeRow;
  }

  async removeNotice(userId: string, id: string) {
    const site = await this.ensureSite(userId);
    const row = await this.requireRow<{ id: number }>(
      'knowledgePayNotice',
      site.id,
      Number(id),
    );
    await this.prisma.knowledgePayNotice.delete({ where: { id: row.id } });
    return { removed: true };
  }

  private linkView(row: {
    id: number;
    title: string;
    summary: string;
    cover: string;
    link: string;
    sort: number;
    status: boolean;
  }): KpLinkRow {
    return {
      id: row.id,
      title: row.title,
      summary: row.summary,
      cover: row.cover,
      link: row.link,
      sort: row.sort,
      status: row.status,
    };
  }

  private linkData(body: KpLinkInput) {
    return {
      title: String(body.title).trim().slice(0, 120),
      summary: String(body.summary || '')
        .trim()
        .slice(0, 255),
      cover: String(body.cover || '')
        .trim()
        .slice(0, 512),
      link: String(body.link || '')
        .trim()
        .slice(0, 512),
      sort: Math.round(Number(body.sort) || 0),
      status: body.status !== false,
    };
  }

  async listLinks(userId: string): Promise<{ list: KpLinkRow[] }> {
    const site = await this.ensureSite(userId);
    const rows = await this.prisma.knowledgePayLink.findMany({
      where: { siteId: site.id },
      orderBy: [{ sort: 'desc' }, { id: 'desc' }],
      take: LIST_ALL_LIMIT,
    });
    return { list: rows.map((row) => this.linkView(row)) };
  }

  async saveLink(userId: string, id: string | undefined, body: KpLinkInput) {
    const site = await this.ensureSite(userId);
    const data = this.linkData(body);
    const row = id
      ? await (async () => {
          const existing = await this.requireRow<{ id: number }>(
            'knowledgePayLink',
            site.id,
            Number(id),
          );
          return this.prisma.knowledgePayLink.update({
            where: { id: existing.id },
            data,
          });
        })()
      : await this.prisma.knowledgePayLink.create({
          data: { siteId: site.id, ...data },
        });
    return this.linkView(row);
  }

  async removeLink(userId: string, id: string) {
    const site = await this.ensureSite(userId);
    const row = await this.requireRow<{ id: number }>(
      'knowledgePayLink',
      site.id,
      Number(id),
    );
    await this.prisma.knowledgePayLink.delete({ where: { id: row.id } });
    return { removed: true };
  }

  // ------------------------------------------------------------------
  // 会员 / 订单 / 概览
  // ------------------------------------------------------------------

  memberPublicView(
    row: {
      id: number;
      nickname: string;
      avatar: string;
      points: number;
      vipUntil: Date | null;
      signInStreak: number;
    },
    orderCount: number,
    favoriteCount: number,
    learningCount = 0,
  ) {
    return {
      id: row.id,
      nickname: row.nickname,
      avatar: row.avatar,
      points: row.points,
      vipUntil: iso(row.vipUntil),
      vipActive: Boolean(row.vipUntil && row.vipUntil.getTime() > Date.now()),
      signInStreak: row.signInStreak,
      orderCount,
      favoriteCount,
      learningCount,
    };
  }

  private memberRow(
    row: {
      id: number;
      nickname: string;
      avatar: string;
      openid: string;
      points: number;
      vipUntil: Date | null;
      signInStreak: number;
      status: boolean;
      createdAt: Date;
      updatedAt: Date;
    },
    orderCount = 0,
  ): KpMemberRow {
    return {
      id: row.id,
      nickname: row.nickname,
      avatar: row.avatar,
      openidMasked: `${row.openid.slice(0, 4)}****${row.openid.slice(-4)}`,
      points: row.points,
      vipUntil: iso(row.vipUntil),
      vipActive: Boolean(row.vipUntil && row.vipUntil.getTime() > Date.now()),
      signInStreak: row.signInStreak,
      orderCount,
      status: row.status,
      createdAt: iso(row.createdAt),
      // 登录动作会 touch 会员行（loginCount+1），updatedAt 即最近活动时间
      lastLoginAt: iso(row.updatedAt),
    };
  }

  async listMembers(userId: string, query: ListQuery & { vip?: string }) {
    const site = await this.ensureSite(userId);
    const { page, pageSize, offset } = pageParam(query.page, query.pageSize);
    const where: Record<string, unknown> = { siteId: site.id };
    const keyword = String(query.keyword || '')
      .trim()
      .slice(0, 60);
    if (keyword) where.nickname = { contains: keyword };
    if (query.vip === 'yes') where.vipUntil = { gt: new Date() };
    if (query.vip === 'no')
      where.OR = [{ vipUntil: null }, { vipUntil: { lte: new Date() } }];
    const [rows, total] = await Promise.all([
      this.prisma.knowledgePayMember.findMany({
        where: where as never,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      this.prisma.knowledgePayMember.count({ where: where as never }),
    ]);
    const orderCounts = await this.prisma.knowledgePayOrder.groupBy({
      by: ['memberId'],
      where: { siteId: site.id, memberId: { in: rows.map((row) => row.id) } },
      _count: { _all: true },
    });
    const countOf = new Map(
      orderCounts.map((row) => [row.memberId, row._count._all]),
    );
    return pageOf(
      rows.map((row) => this.memberRow(row, countOf.get(row.id) || 0)),
      total,
      page,
      pageSize,
    );
  }

  async adjustMember(
    userId: string,
    id: string,
    body: KpMemberAdjustInput,
  ): Promise<KpMemberRow> {
    const site = await this.ensureSite(userId);
    const member = await this.prisma.knowledgePayMember.findFirst({
      where: { id: Number(id), siteId: site.id },
    });
    if (!member)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '会员不存在或不属于本站点',
      );
    const data: Record<string, unknown> = {};
    if (typeof body.pointsDelta === 'number' && body.pointsDelta !== 0) {
      data.points = Math.max(0, member.points + body.pointsDelta);
    }
    if (typeof body.vipDays === 'number' && body.vipDays !== 0) {
      const base =
        member.vipUntil && member.vipUntil.getTime() > Date.now()
          ? member.vipUntil.getTime()
          : Date.now();
      data.vipUntil = new Date(base + body.vipDays * 86_400_000);
    }
    if (typeof body.status === 'boolean') data.status = body.status;
    if (Object.keys(data).length) {
      await this.prisma.knowledgePayMember.update({
        where: { id: member.id },
        data: data as never,
      });
    }
    const [updated, orderCount] = await Promise.all([
      this.prisma.knowledgePayMember.findUnique({ where: { id: member.id } }),
      this.prisma.knowledgePayOrder.count({
        where: { siteId: site.id, memberId: member.id },
      }),
    ]);
    return this.memberRow(updated ?? member, orderCount);
  }

  async listOrders(userId: string, query: ListQuery & { payMethod?: string }) {
    const site = await this.ensureSite(userId);
    const { page, pageSize, offset } = pageParam(query.page, query.pageSize);
    const where: Record<string, unknown> = { siteId: site.id };
    if (query.payMethod && query.payMethod !== 'all')
      where.payMethod = query.payMethod;
    const keyword = String(query.keyword || '')
      .trim()
      .slice(0, 60);
    if (keyword) {
      const matchedMembers = await this.prisma.knowledgePayMember.findMany({
        where: { siteId: site.id, nickname: { contains: keyword } },
        select: { id: true },
        take: 500,
      });
      where.OR = [
        { title: { contains: keyword } },
        { memberId: { in: matchedMembers.map((row) => row.id) } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.knowledgePayOrder.findMany({
        where: where as never,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      this.prisma.knowledgePayOrder.count({ where: where as never }),
    ]);
    const members = await this.prisma.knowledgePayMember.findMany({
      where: { siteId: site.id, id: { in: rows.map((row) => row.memberId) } },
      select: { id: true, nickname: true },
    });
    const nickOf = new Map(members.map((row) => [row.id, row.nickname]));
    const list: KpOrderRow[] = rows.map((row) => ({
      id: row.id,
      memberId: row.memberId,
      nickname: nickOf.get(row.memberId) || `会员#${row.memberId}`,
      resourceId: row.resourceId,
      title: row.title,
      cover: row.cover,
      payMethod: row.payMethod,
      amount: row.amount,
      createdAt: iso(row.createdAt),
    }));
    return pageOf(list, total, page, pageSize);
  }

  /** 现金订单台账：会员昵称与课程名按 ID 批量补齐，避免 N+1。 */
  async listCashOrders(
    userId: string,
    query: {
      page: number;
      pageSize: number;
      keyword: string;
      status: string;
      kind: string;
    },
  ) {
    const site = await this.ensureSite(userId);
    const { page, pageSize, offset } = pageParam(query.page, query.pageSize);
    // 待支付超过 2 小时视为失效（微信侧若已支付，回调会把 closed 重新置为 paid）。
    await this.prisma.knowledgePayCashOrder.updateMany({
      where: {
        siteId: site.id,
        status: 'pending',
        createdAt: { lt: new Date(Date.now() - 2 * 3600_000) },
      },
      data: { status: 'closed' },
    });
    const where: Record<string, unknown> = { siteId: site.id };
    if (query.status && query.status !== 'all') where.status = query.status;
    if (query.kind && query.kind !== 'all') where.kind = query.kind;
    const keyword = String(query.keyword || '')
      .trim()
      .slice(0, 60);
    if (keyword) {
      const members = await this.prisma.knowledgePayMember.findMany({
        where: { siteId: site.id, nickname: { contains: keyword } },
        select: { id: true },
        take: 500,
      });
      where.OR = [
        { title: { contains: keyword } },
        { outTradeNo: { contains: keyword } },
        { memberId: { in: members.map((row) => row.id) } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.knowledgePayCashOrder.findMany({
        where: where as never,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      this.prisma.knowledgePayCashOrder.count({ where: where as never }),
    ]);
    const [members, resources] = await Promise.all([
      this.prisma.knowledgePayMember.findMany({
        where: { siteId: site.id, id: { in: rows.map((row) => row.memberId) } },
        select: { id: true, nickname: true },
      }),
      this.prisma.knowledgePayResource.findMany({
        where: {
          siteId: site.id,
          id: { in: rows.map((row) => row.resourceId) },
        },
        select: { id: true, title: true },
      }),
    ]);
    const nickOf = new Map(members.map((row) => [row.id, row.nickname]));
    const titleOf = new Map(resources.map((row) => [row.id, row.title]));
    return pageOf(
      rows.map((row) => ({
        id: row.id,
        memberId: row.memberId,
        nickname: nickOf.get(row.memberId) || `会员#${row.memberId}`,
        kind: row.kind,
        resourceId: row.resourceId,
        courseTitle: titleOf.get(row.resourceId) || '',
        plan: row.plan,
        title: row.title,
        amountCents: row.amountCents,
        outTradeNo: row.outTradeNo,
        transactionId: row.transactionId,
        status: row.status,
        refundNo: row.refundNo,
        refundReason: row.refundReason,
        paidAt: iso(row.paidAt),
        refundedAt: iso(row.refundedAt),
        createdAt: iso(row.createdAt),
      })),
      total,
      page,
      pageSize,
    );
  }

  async overview(userId: string): Promise<KpOverview> {
    const site = await this.ensureSite(userId);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [
      resourceCount,
      onlineCount,
      categoryCount,
      memberCount,
      vipCount,
      orderCount,
      todayOrders,
      pointsAgg,
      cardUnused,
      cardUsed,
      learnerRows,
      progressCount,
      completedCount,
      reviewAgg,
      cashOrderCount,
      cashPaidAgg,
      cashRefundedAgg,
      pendingCashOrders,
    ] = await Promise.all([
      this.prisma.knowledgePayResource.count({ where: { siteId: site.id } }),
      this.prisma.knowledgePayResource.count({
        where: { siteId: site.id, status: true },
      }),
      this.prisma.knowledgePayCategory.count({ where: { siteId: site.id } }),
      this.prisma.knowledgePayMember.count({ where: { siteId: site.id } }),
      this.prisma.knowledgePayMember.count({
        where: { siteId: site.id, vipUntil: { gt: new Date() } },
      }),
      this.prisma.knowledgePayOrder.count({ where: { siteId: site.id } }),
      this.prisma.knowledgePayOrder.count({
        where: { siteId: site.id, createdAt: { gte: todayStart } },
      }),
      this.prisma.knowledgePayOrder.aggregate({
        where: { siteId: site.id, payMethod: 'points' },
        _sum: { amount: true },
      }),
      this.prisma.knowledgePayCard.count({
        where: { siteId: site.id, status: 'unused' },
      }),
      this.prisma.knowledgePayCard.count({
        where: { siteId: site.id, status: 'used' },
      }),
      this.prisma.knowledgePayProgress.groupBy({
        by: ['memberId'],
        where: { siteId: site.id },
      }),
      this.prisma.knowledgePayProgress.count({ where: { siteId: site.id } }),
      this.prisma.knowledgePayProgress.count({
        where: { siteId: site.id, completed: true },
      }),
      this.prisma.knowledgePayReview.aggregate({
        where: { siteId: site.id, status: true },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      this.prisma.knowledgePayCashOrder.count({ where: { siteId: site.id } }),
      this.prisma.knowledgePayCashOrder.aggregate({
        where: { siteId: site.id, status: { in: ['paid', 'refunded'] } },
        _sum: { amountCents: true },
      }),
      this.prisma.knowledgePayCashOrder.aggregate({
        where: { siteId: site.id, status: 'refunded' },
        _sum: { amountCents: true },
      }),
      this.prisma.knowledgePayCashOrder.count({
        where: { siteId: site.id, status: 'pending' },
      }),
    ]);
    return {
      siteCode: site.siteCode,
      resourceCount,
      onlineCount,
      categoryCount,
      memberCount,
      vipCount,
      orderCount,
      todayOrders,
      pointsConsumed: pointsAgg._sum.amount || 0,
      cardUnused,
      cardUsed,
      learnerCount: learnerRows.length,
      progressCount,
      completedCount,
      reviewCount: reviewAgg._count._all,
      ratingAvg: Math.round((reviewAgg._avg.rating || 0) * 10) / 10,
      cashOrderCount,
      cashRevenueCents: cashPaidAgg._sum.amountCents || 0,
      cashRefundedCents: cashRefundedAgg._sum.amountCents || 0,
      pendingCashOrders,
      wxReady: Boolean(site.wxAppId && site.wxAppSecret && site.enabled),
    };
  }

  // ------------------------------------------------------------------
  // 卡密
  // ------------------------------------------------------------------

  private cardView(
    row: {
      id: number;
      code: string;
      kind: string;
      resourceId: number;
      days: number;
      points: number;
      status: string;
      usedBy: number;
      usedAt: Date | null;
      batchNo: string;
      remark: string;
      createdAt: Date;
    },
    resourceTitle = '',
    usedByNickname = '',
  ): KpCardRow {
    return {
      id: row.id,
      code: row.code,
      kind: row.kind as KpCardRow['kind'],
      resourceId: row.resourceId,
      resourceTitle,
      days: row.days,
      points: row.points,
      status: row.status,
      usedByNickname,
      usedAt: iso(row.usedAt),
      batchNo: row.batchNo,
      remark: row.remark,
      createdAt: iso(row.createdAt),
    };
  }

  async listCards(
    userId: string,
    query: ListQuery & { kind?: string; status?: string },
  ) {
    const site = await this.ensureSite(userId);
    const { page, pageSize, offset } = pageParam(query.page, query.pageSize);
    const where: Record<string, unknown> = { siteId: site.id };
    if (query.kind && query.kind !== 'all') where.kind = query.kind;
    if (query.status && query.status !== 'all') where.status = query.status;
    const keyword = String(query.keyword || '')
      .trim()
      .slice(0, 40);
    if (keyword) where.code = { contains: keyword.toUpperCase() };
    const [rows, total] = await Promise.all([
      this.prisma.knowledgePayCard.findMany({
        where: where as never,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      this.prisma.knowledgePayCard.count({ where: where as never }),
    ]);
    const resources = await this.prisma.knowledgePayResource.findMany({
      where: {
        siteId: site.id,
        id: {
          in: rows.filter((row) => row.resourceId).map((row) => row.resourceId),
        },
      },
      select: { id: true, title: true },
    });
    const titleOf = new Map(resources.map((row) => [row.id, row.title]));
    const members = await this.prisma.knowledgePayMember.findMany({
      where: {
        siteId: site.id,
        id: { in: rows.filter((row) => row.usedBy).map((row) => row.usedBy) },
      },
      select: { id: true, nickname: true },
    });
    const nickOf = new Map(members.map((row) => [row.id, row.nickname]));
    return pageOf(
      rows.map((row) =>
        this.cardView(
          row,
          titleOf.get(row.resourceId) || '',
          row.usedBy ? nickOf.get(row.usedBy) || `会员#${row.usedBy}` : '',
        ),
      ),
      total,
      page,
      pageSize,
    );
  }

  async generateCards(
    userId: string,
    body: KpCardGenerateInput,
  ): Promise<KpCardGenerateResult> {
    const site = await this.ensureSite(userId);
    const kind = body.kind;
    if (!(KP_CARD_KINDS as readonly string[]).includes(kind)) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '卡密种类不合法');
    }
    if (kind === 'vip' && !(body.days > 0)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '会员卡必须填写天数（1–3650）',
      );
    }
    if (kind === 'points' && !(body.points > 0)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '积分卡必须填写积分面值',
      );
    }
    if (kind === 'resource') {
      await this.requireResource(site.id, Number(body.resourceId));
    }
    const batchNo = new Date()
      .toISOString()
      .replace(/[-:TZ]/g, '')
      .slice(0, 14);
    const codes = new Set<string>();
    while (codes.size < body.count) codes.add(genCardCode());
    const created: number[] = [];
    // 站点内撞码概率极低：唯一键冲突时该码跳过（Set 已去重，这里只兜历史码）
    for (const code of codes) {
      try {
        const row = await this.prisma.knowledgePayCard.create({
          data: {
            siteId: site.id,
            userId,
            code,
            kind,
            resourceId:
              kind === 'resource' ? Math.round(Number(body.resourceId)) : 0,
            days: kind === 'vip' ? Math.round(body.days) : 0,
            points: kind === 'points' ? Math.round(body.points) : 0,
            batchNo,
            remark: String(body.remark || '')
              .trim()
              .slice(0, 120),
          },
          select: { id: true },
        });
        created.push(row.id);
      } catch (error) {
        if (!String((error as { code?: string })?.code || '').includes('P2002'))
          throw error;
      }
    }
    if (!created.length) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '卡密生成失败（卡号全部冲突），请重试',
      );
    }
    const rows = await this.prisma.knowledgePayCard.findMany({
      where: { id: { in: created } },
      orderBy: { id: 'asc' },
    });
    return {
      batchNo,
      count: rows.length,
      items: rows.map((row) => this.cardView(row)),
    };
  }

  async disableCard(userId: string, id: string): Promise<KpCardRow> {
    const site = await this.ensureSite(userId);
    const row = await this.prisma.knowledgePayCard.findFirst({
      where: { id: Number(id), siteId: site.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '卡密不存在');
    if (row.status === 'used') {
      throw new BusinessException(ErrorCode.CONFLICT, '已使用的卡密不能停用');
    }
    const updated = await this.prisma.knowledgePayCard.update({
      where: { id: row.id },
      data: { status: 'disabled' },
    });
    return this.cardView(updated);
  }

  async removeCard(userId: string, id: string) {
    const site = await this.ensureSite(userId);
    const row = await this.prisma.knowledgePayCard.findFirst({
      where: { id: Number(id), siteId: site.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '卡密不存在');
    if (row.status === 'used') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '已使用的卡密请保留作兑换台账，不能删除',
      );
    }
    await this.prisma.knowledgePayCard.delete({ where: { id: row.id } });
    return { removed: true };
  }

  // ------------------------------------------------------------------
  // 素材上传（封面 / 轮播图：multipart 直传本站 OSS，音视频走外链粘贴）
  // ------------------------------------------------------------------

  private static readonly MEDIA_EXT: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
  };

  async uploadMedia(userId: string, file: File) {
    const ext = KnowledgePayService.MEDIA_EXT[file.type || ''];
    if (!ext) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '仅支持 jpg / png / webp / gif 图片素材；视频与音频请在内容里填写播放地址（https 直链）',
      );
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '图片为空或超过 5MB 上限',
      );
    }
    const name = `${Date.now()}-${randomBytes(4).toString('hex')}${ext}`;
    const stored = await this.storage.put(
      `enterprise/${userId}/kp/media/${name}`,
      bytes,
    );
    return {
      key: stored.key,
      url: this.storage.urlOf(stored.key),
      fileName: file.name || name,
    };
  }

  // ------------------------------------------------------------------
  // 公开通道复用（kp.public.ts 调用）
  // ------------------------------------------------------------------

  vipPlansOf(site: { vipPlans: unknown }): KpVipPlan[] {
    const plans = asArray(site.vipPlans)
      .map((row) => ({
        plan: Number(asObject(row).plan) || 0,
        price: Math.max(0, Math.round(Number(asObject(row).price) || 0)),
        cashPrice: Math.max(
          0,
          Math.round(Number(asObject(row).cashPrice) || 0),
        ),
      }))
      .filter((row) => (KP_VIP_PLANS as readonly number[]).includes(row.plan));
    return plans.length ? plans : DEFAULT_VIP_PLANS;
  }

  signRewardsOf(site: { signRewards: unknown }): number[] {
    const rows = asArray(site.signRewards).map((n) =>
      Math.max(0, Math.round(Number(n) || 0)),
    );
    return rows.length === 7 ? rows : DEFAULT_SIGN_REWARDS;
  }
}
