import { safeText } from '../common/safe-text';
import {
  HEALTH_CROWD_KINDS,
  type HealthAnswerRow,
  type HealthArticleCategoryRow,
  type HealthArticleCategorySaveBody,
  type HealthArticleRow,
  type HealthArticleSaveBody,
  type HealthBroadcastCreateBody,
  type HealthBroadcastRow,
  type HealthCannedRow,
  type HealthHotKeywordRow,
  type HealthPostCommentRow,
  type HealthPostRow,
  type HealthPostTagRow,
  type HealthQuestionRow,
  type HealthReviewReplyBody,
  type HealthReviewRow,
  type HealthReviewStatRow,
  type HealthSearchLogRow,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { MiniProgramClient } from '../miniprogram/miniprogram.client';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { PrismaService } from '../prisma/prisma.service';
import {
  audit,
  clip,
  intIn,
  jsonArr,
  jsonObj,
  requireShop,
  requireShopWritable,
  strOf,
  subjectOfShop,
  toIso,
} from './health.shared';

const CROWD_KINDS = new Set<string>(HEALTH_CROWD_KINDS as readonly string[]);
const BROADCAST_CHANNELS = new Set(['SUBSCRIBE', 'IN_APP']);

/** 历史审核态 → 现行审核态（0128 迁移后 status 只承载 ON/OFF）。 */
const auditOf = (value: unknown): HealthArticleRow['auditStatus'] => {
  const text = safeText(value);
  if (text === 'APPROVED' || text === 'PUBLISHED') return 'APPROVED';
  if (text === 'REJECTED') return 'REJECTED';
  if (text === 'OFFLINE' || text === 'HIDDEN') return 'OFFLINE';
  return 'PENDING';
};

const onOff = (value: unknown): 'ON' | 'OFF' =>
  safeText(value) === 'OFF' ? 'OFF' : 'ON';

const crowdKindsOf = (value: unknown): HealthArticleRow['crowdKinds'] =>
  jsonArr<string>(value)
    .map((item) => String(item))
    .filter((item): item is HealthArticleRow['crowdKinds'][number] =>
      CROWD_KINDS.has(item),
    );

const safeTargetKind = (value: unknown): HealthReviewRow['targetKind'] => {
  const text = safeText(value);
  if (text === 'HOSPITAL') return 'ORGAN';
  if (text === 'CONSULT') return 'SERVICE';
  if (
    text === 'PRACTITIONER' ||
    text === 'ORGAN' ||
    text === 'GOODS' ||
    text === 'SERVICE' ||
    text === 'SHOP'
  ) {
    return text;
  }
  return 'SERVICE';
};

const appealOf = (value: unknown): string => {
  const text = safeText(value);
  return text || 'NONE';
};

/**
 * 内容、社区与运营（C12）：科普文章、病友圈、公开问答、评价、群发、搜索热词与常用语。
 *
 * 口径：
 * 1. 审核态独立成 `auditStatus`（PENDING/APPROVED/REJECTED/OFFLINE），上下线用 `status`（ON/OFF）；
 *    店铺自己发布的内容直接通过，医护/团队/顾客投稿一律先 PENDING 等店主审核。
 * 2. 帖子与评论的标签/作者名都在读取时补齐，不在写入时冗余名称，改名后旧帖跟着变。
 * 3. 群发只是台账：站内渠道落一条公告并记为 SENT，订阅消息逐人发送、失败如实计数，
 *    没有模板/凭据时直接 FAILED 并把原因写进 lastError，不假装已送达。
 * 4. 搜索日志按关键词聚合（计数 / 零结果数 / 最近时间），供运营看「搜了什么没搜到」。
 */
export class HealthContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly miniApp: MiniAppService,
    private readonly client: MiniProgramClient,
  ) {}

  private pager(query: Record<string, unknown>) {
    const page = intIn(query.page, 1, 10_000, 1);
    const pageSize = intIn(query.pageSize, 1, 200, 20);
    return {
      page,
      pageSize,
      skip: (page - 1) * pageSize,
      keyword: clip(query.keyword, 60),
    };
  }

  // ---------- 科普与课程 ----------

  async articleCategories(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthArticleCategoryRow[]> {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'content');
    const [rows, counts] = await Promise.all([
      this.prisma.healthArticleCategory.findMany({
        where: { shopId: ctx.shop.id },
        orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.healthArticle.groupBy({
        by: ['categoryId'],
        where: { shopId: ctx.shop.id },
        _count: { _all: true },
      }),
    ]);
    const countMap = new Map(
      counts.map((row) => [row.categoryId, row._count._all]),
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      sort: row.sort,
      status: onOff(row.status),
      articleCount: countMap.get(row.id) ?? 0,
    }));
  }

  async articleCategorySave(
    user: CurrentUser,
    body: HealthArticleCategorySaveBody,
  ): Promise<HealthArticleCategoryRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'content');
    await requireShopWritable(ctx);
    const existing =
      body.id > 0
        ? await this.prisma.healthArticleCategory.findFirst({
            where: { id: body.id, shopId: ctx.shop.id },
          })
        : null;
    if (body.id > 0 && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '文章分类不存在');
    }
    const data = {
      shopId: ctx.shop.id,
      name: body.name,
      sort: body.sort,
      status: body.status,
    };
    const row = existing
      ? await this.prisma.healthArticleCategory.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.healthArticleCategory.create({ data });
    await audit(
      this.prisma,
      user.userId,
      existing
        ? 'health.articleCategory.update'
        : 'health.articleCategory.create',
      `shop=${ctx.shop.id} category=${row.id}`,
    );
    return {
      id: row.id,
      name: row.name,
      sort: row.sort,
      status: onOff(row.status),
      articleCount: await this.prisma.healthArticle.count({
        where: { shopId: ctx.shop.id, categoryId: row.id },
      }),
    };
  }

  async articleCategoryRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'content');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthArticleCategory.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
      select: { id: true },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '文章分类不存在');
    const used = await this.prisma.healthArticle.count({
      where: { shopId: ctx.shop.id, categoryId: row.id },
    });
    if (used > 0)
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '分类下还有文章，不能删除',
      );
    await this.prisma.healthArticleCategory.delete({ where: { id: row.id } });
    await audit(
      this.prisma,
      user.userId,
      'health.articleCategory.remove',
      `shop=${ctx.shop.id} category=${row.id}`,
    );
    return { ok: true, message: '文章分类已删除' };
  }

  private async articleRows(
    shopId: number,
    rows: {
      id: number;
      title: string;
      kind: string;
      categoryId: number;
      coverImage: string;
      mediaUrl: string;
      summary: string;
      authorKind: string;
      authorId: number;
      authorName: string;
      visibility: string;
      crowdKindsJson: unknown;
      topFlag: boolean;
      status: string;
      auditStatus: string;
      auditReason: string;
      viewCount: number;
      likeCount: number;
      commentCount: number;
      collectCount: number;
      publishedAt: Date | null;
      createdAt: Date;
    }[],
  ): Promise<HealthArticleRow[]> {
    if (!rows.length) return [];
    const categoryIds = [
      ...new Set(rows.map((row) => row.categoryId).filter((id) => id > 0)),
    ];
    const categories = categoryIds.length
      ? await this.prisma.healthArticleCategory.findMany({
          where: { shopId, id: { in: categoryIds } },
          select: { id: true, name: true },
        })
      : [];
    const categoryMap = new Map(categories.map((row) => [row.id, row.name]));
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      kind: row.kind as HealthArticleRow['kind'],
      categoryId: row.categoryId,
      categoryName: categoryMap.get(row.categoryId) ?? '',
      cover: row.coverImage,
      mediaUrl: row.mediaUrl,
      summary: row.summary,
      authorKind: row.authorKind as HealthArticleRow['authorKind'],
      authorId: row.authorId,
      authorName: row.authorName,
      visibility: (['PUBLIC', 'MEMBER', 'CROWD', 'SIGNED'] as const).includes(
        row.visibility as never,
      )
        ? (row.visibility as HealthArticleRow['visibility'])
        : 'PUBLIC',
      crowdKinds: crowdKindsOf(row.crowdKindsJson),
      recommend: row.topFlag,
      auditStatus: auditOf(row.auditStatus),
      auditReason: row.auditReason,
      status: onOff(row.status),
      readCount: row.viewCount,
      likeCount: row.likeCount,
      commentCount: row.commentCount,
      collectCount: row.collectCount,
      publishedAt: toIso(row.publishedAt),
      createdAt: toIso(row.createdAt),
    }));
  }

  async articles(user: CurrentUser, query: Record<string, unknown>) {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'content');
    const { page, pageSize, skip, keyword } = this.pager(query);
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (keyword) where.title = { contains: keyword };
    const kind = strOf(query.kind, 12, 'all');
    if (kind !== 'all') where.kind = kind;
    const categoryId = intIn(query.categoryId, 0, 2_000_000_000, 0);
    if (categoryId > 0) where.categoryId = categoryId;
    const authorKind = strOf(query.authorKind, 16, 'all');
    if (authorKind !== 'all') where.authorKind = authorKind;
    const audit = strOf(query.auditStatus, 16, 'all');
    if (audit !== 'all') where.auditStatus = audit;
    const [rows, total] = await Promise.all([
      this.prisma.healthArticle.findMany({
        where,
        orderBy: [{ topFlag: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.healthArticle.count({ where }),
    ]);
    return {
      list: await this.articleRows(ctx.shop.id, rows),
      total,
      page,
      pageSize,
    };
  }

  async articleDetail(user: CurrentUser, query: Record<string, unknown>) {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'content');
    const id = intIn(query.id, 0, 2_000_000_000, 0);
    const row = await this.prisma.healthArticle.findFirst({
      where: { id, shopId: ctx.shop.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '文章不存在');
    const [article] = await this.articleRows(ctx.shop.id, [row]);
    return { article, content: row.contentHtml };
  }

  async articleSave(
    user: CurrentUser,
    body: HealthArticleSaveBody,
  ): Promise<HealthArticleRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'content');
    await requireShopWritable(ctx);
    if (body.categoryId > 0) {
      const category = await this.prisma.healthArticleCategory.findFirst({
        where: { id: body.categoryId, shopId: ctx.shop.id },
        select: { id: true },
      });
      if (!category)
        throw new BusinessException(ErrorCode.BAD_REQUEST, '文章分类不存在');
    }
    const existing =
      body.id > 0
        ? await this.prisma.healthArticle.findFirst({
            where: { id: body.id, shopId: ctx.shop.id },
          })
        : null;
    if (body.id > 0 && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '文章不存在');
    }
    // 店铺官方稿直接通过；医护/机构/团队/顾客投稿进审核队列。
    const selfPublished = body.authorKind === 'SHOP';
    const auditStatus = selfPublished
      ? 'APPROVED'
      : existing?.auditStatus === 'APPROVED'
        ? 'PENDING'
        : 'PENDING';
    const now = new Date();
    const data = {
      shopId: ctx.shop.id,
      categoryId: body.categoryId,
      title: body.title,
      kind: body.kind,
      coverImage: body.cover,
      mediaUrl: body.mediaUrl,
      summary: body.summary,
      contentHtml: body.content,
      authorKind: body.authorKind,
      authorId: body.authorId,
      authorName: existing?.authorName ?? '',
      tagsJson: [] as never,
      visibility: body.visibility,
      crowdKindsJson: body.crowdKinds as never,
      status: body.status,
      auditStatus,
      auditReason: '',
      auditBy: selfPublished ? user.userId : (existing?.auditBy ?? ''),
      auditAt: selfPublished ? now : (existing?.auditAt ?? null),
      topFlag: body.recommend,
      publishedAt:
        auditStatus === 'APPROVED'
          ? (existing?.publishedAt ?? now)
          : (existing?.publishedAt ?? null),
    };
    const row = existing
      ? await this.prisma.healthArticle.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.healthArticle.create({ data });
    await audit(
      this.prisma,
      user.userId,
      existing ? 'health.article.update' : 'health.article.create',
      `shop=${ctx.shop.id} article=${row.id}`,
    );
    const [view] = await this.articleRows(ctx.shop.id, [row]);
    return view;
  }

  async articleAudit(
    user: CurrentUser,
    body: { shopId: number; id: number; approved: boolean; reason: string },
  ): Promise<HealthArticleRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'content');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthArticle.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '文章不存在');
    const updated = await this.prisma.healthArticle.update({
      where: { id: row.id },
      data: {
        auditStatus: body.approved ? 'APPROVED' : 'REJECTED',
        auditReason: body.approved ? '' : clip(body.reason, 200),
        auditBy: user.userId,
        auditAt: new Date(),
        publishedAt: body.approved
          ? (row.publishedAt ?? new Date())
          : row.publishedAt,
      },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.article.audit',
      `shop=${ctx.shop.id} article=${row.id} approved=${body.approved}`,
    );
    const [view] = await this.articleRows(ctx.shop.id, [updated]);
    return view;
  }

  async articleRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'content');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthArticle.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
      select: { id: true },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '文章不存在');
    await this.prisma.healthArticle.delete({ where: { id: row.id } });
    await audit(
      this.prisma,
      user.userId,
      'health.article.remove',
      `shop=${ctx.shop.id} article=${row.id}`,
    );
    return { ok: true, message: '文章已删除' };
  }

  // ---------- 病友圈 ----------

  async postTags(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthPostTagRow[]> {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'content');
    const [rows, posts] = await Promise.all([
      this.prisma.healthPostTag.findMany({
        where: { shopId: ctx.shop.id },
        orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.healthPost.findMany({
        where: { shopId: ctx.shop.id },
        select: { tagsJson: true },
      }),
    ]);
    const counts = new Map<number, number>();
    for (const post of posts) {
      for (const raw of jsonArr<unknown>(post.tagsJson)) {
        const id = Number(raw);
        if (Number.isInteger(id) && id > 0) {
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
      }
    }
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      sort: row.sort,
      status: onOff(row.status),
      postCount: counts.get(row.id) ?? 0,
    }));
  }

  async postTagSave(
    user: CurrentUser,
    body: {
      shopId: number;
      id: number;
      name: string;
      sort: number;
      status: 'ON' | 'OFF';
    },
  ): Promise<HealthPostTagRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'content');
    await requireShopWritable(ctx);
    const existing =
      body.id > 0
        ? await this.prisma.healthPostTag.findFirst({
            where: { id: body.id, shopId: ctx.shop.id },
          })
        : null;
    if (body.id > 0 && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '标签不存在');
    }
    const duplicated = await this.prisma.healthPostTag.findFirst({
      where: {
        shopId: ctx.shop.id,
        name: body.name,
        id: { not: existing?.id ?? 0 },
      },
      select: { id: true },
    });
    if (duplicated)
      throw new BusinessException(ErrorCode.CONFLICT, '标签名称已存在');
    const row = existing
      ? await this.prisma.healthPostTag.update({
          where: { id: existing.id },
          data: { name: body.name, sort: body.sort, status: body.status },
        })
      : await this.prisma.healthPostTag.create({
          data: {
            shopId: ctx.shop.id,
            name: body.name,
            sort: body.sort,
            status: body.status,
          },
        });
    return {
      id: row.id,
      name: row.name,
      sort: row.sort,
      status: onOff(row.status),
      postCount: 0,
    };
  }

  async postTagRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'content');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthPostTag.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
      select: { id: true },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '标签不存在');
    const posts = await this.prisma.healthPost.findMany({
      where: { shopId: ctx.shop.id },
      select: { id: true, tagsJson: true },
    });
    const used = posts.filter((post) =>
      jsonArr<unknown>(post.tagsJson).some((item) => Number(item) === row.id),
    );
    if (used.length) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `标签仍被 ${used.length} 条帖子使用，请先解绑`,
      );
    }
    await this.prisma.healthPostTag.delete({ where: { id: row.id } });
    await audit(
      this.prisma,
      user.userId,
      'health.postTag.remove',
      `shop=${ctx.shop.id} tag=${row.id}`,
    );
    return { ok: true, message: '标签已删除' };
  }

  private async postAuthorNames(
    shopId: number,
    rows: {
      authorKind: string;
      authorPractitionerId: number;
      customerId: number;
    }[],
  ) {
    const practitionerIds = [
      ...new Set(
        rows
          .filter((row) => row.authorKind === 'PRACTITIONER')
          .map((row) => row.authorPractitionerId)
          .filter((id) => id > 0),
      ),
    ];
    const customerIds = [
      ...new Set(
        rows
          .filter((row) => row.authorKind !== 'PRACTITIONER')
          .map((row) => row.customerId)
          .filter((id) => id > 0),
      ),
    ];
    const [practitioners, customers] = await Promise.all([
      practitionerIds.length
        ? this.prisma.healthPractitioner.findMany({
            where: { shopId, id: { in: practitionerIds } },
            select: { id: true, name: true },
          })
        : [],
      customerIds.length
        ? this.prisma.healthCustomer.findMany({
            where: { shopId, id: { in: customerIds } },
            select: { id: true, nickname: true },
          })
        : [],
    ]);
    return {
      practitionerMap: new Map(practitioners.map((row) => [row.id, row.name])),
      customerMap: new Map(customers.map((row) => [row.id, row.nickname])),
    };
  }

  private async postRows(
    shopId: number,
    rows: {
      id: number;
      customerId: number;
      authorKind: string;
      authorPractitionerId: number;
      title: string;
      content: string;
      imagesJson: unknown;
      tagsJson: unknown;
      status: string;
      auditStatus: string;
      auditReason: string;
      likeCount: number;
      commentCount: number;
      reportCount: number;
      createdAt: Date;
    }[],
  ): Promise<HealthPostRow[]> {
    if (!rows.length) return [];
    const tagIds = [
      ...new Set(
        rows.flatMap((row) =>
          jsonArr<unknown>(row.tagsJson)
            .map((item) => Number(item))
            .filter((id) => Number.isInteger(id) && id > 0),
        ),
      ),
    ];
    const [tags, authors] = await Promise.all([
      tagIds.length
        ? this.prisma.healthPostTag.findMany({
            where: { shopId, id: { in: tagIds } },
            select: { id: true, name: true },
          })
        : [],
      this.postAuthorNames(shopId, rows),
    ]);
    const tagMap = new Map(tags.map((row) => [row.id, row.name]));
    return rows.map((row) => {
      const ids = jsonArr<unknown>(row.tagsJson)
        .map((item) => Number(item))
        .filter((id) => Number.isInteger(id) && id > 0);
      return {
        id: row.id,
        title: row.title,
        content: row.content,
        images: jsonArr<string>(row.imagesJson).map((item) => String(item)),
        authorKind: row.authorKind as HealthPostRow['authorKind'],
        authorId:
          row.authorKind === 'PRACTITIONER'
            ? row.authorPractitionerId
            : row.customerId,
        authorName:
          row.authorKind === 'PRACTITIONER'
            ? (authors.practitionerMap.get(row.authorPractitionerId) ?? '')
            : (authors.customerMap.get(row.customerId) ?? ''),
        tagIds: ids,
        tagNames: ids.map((id) => tagMap.get(id) ?? '').filter(Boolean),
        auditStatus: auditOf(row.auditStatus),
        auditReason: row.auditReason,
        status: onOff(row.status),
        likeCount: row.likeCount,
        commentCount: row.commentCount,
        reportCount: row.reportCount,
        createdAt: toIso(row.createdAt),
      };
    });
  }

  async posts(user: CurrentUser, query: Record<string, unknown>) {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'content');
    const { page, pageSize, skip, keyword } = this.pager(query);
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (keyword) {
      where.OR = [
        { title: { contains: keyword } },
        { content: { contains: keyword } },
      ];
    }
    const audit = strOf(query.postIdAudit, 16, 'all');
    if (audit !== 'all') where.auditStatus = audit;
    const tagId = intIn(query.tagId, 0, 2_000_000_000, 0);
    const [rows, total] = await Promise.all([
      this.prisma.healthPost.findMany({
        where,
        orderBy: [{ topFlag: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.healthPost.count({ where }),
    ]);
    const list = await this.postRows(ctx.shop.id, rows);
    // 标签过滤放在读取后（tagsJson 不便进 SQL），分页总数也按同一口径重算。
    if (tagId > 0) {
      const filtered = list.filter((row) => row.tagIds.includes(tagId));
      return { list: filtered, total: filtered.length, page, pageSize };
    }
    return { list, total, page, pageSize };
  }

  async postDetail(user: CurrentUser, query: Record<string, unknown>) {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'content');
    const id = intIn(query.id, 0, 2_000_000_000, 0);
    const row = await this.prisma.healthPost.findFirst({
      where: { id, shopId: ctx.shop.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '帖子不存在');
    const [post] = await this.postRows(ctx.shop.id, [row]);
    const comments = await this.prisma.healthPostComment.findMany({
      where: { shopId: ctx.shop.id, postId: row.id },
      orderBy: { id: 'asc' },
      take: 500,
    });
    const authors = await this.postAuthorNames(
      ctx.shop.id,
      comments.map((item) => ({
        authorKind: item.authorKind,
        authorPractitionerId: 0,
        customerId: item.customerId,
      })),
    );
    return {
      post,
      comments: comments.map<HealthPostCommentRow>((item) => ({
        id: item.id,
        postId: item.postId,
        postTitle: row.title,
        parentId: item.parentId,
        authorKind: item.authorKind as HealthPostCommentRow['authorKind'],
        authorName: authors.customerMap.get(item.customerId) ?? '',
        content: item.content,
        likeCount: item.likeCount,
        auditStatus: auditOf(item.status),
        createdAt: toIso(item.createdAt),
      })),
    };
  }

  async postAudit(
    user: CurrentUser,
    body: { shopId: number; id: number; approved: boolean; reason: string },
  ): Promise<HealthPostRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'content');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthPost.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '帖子不存在');
    const updated = await this.prisma.healthPost.update({
      where: { id: row.id },
      data: {
        auditStatus: body.approved ? 'APPROVED' : 'REJECTED',
        auditReason: body.approved ? '' : clip(body.reason, 200),
        auditBy: user.userId,
      },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.post.audit',
      `shop=${ctx.shop.id} post=${row.id} approved=${body.approved}`,
    );
    const [view] = await this.postRows(ctx.shop.id, [updated]);
    return view;
  }

  async postRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'content');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthPost.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
      select: { id: true },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '帖子不存在');
    await this.prisma.$transaction([
      this.prisma.healthPostComment.deleteMany({
        where: { shopId: ctx.shop.id, postId: row.id },
      }),
      this.prisma.healthPost.delete({ where: { id: row.id } }),
    ]);
    await audit(
      this.prisma,
      user.userId,
      'health.post.remove',
      `shop=${ctx.shop.id} post=${row.id}`,
    );
    return { ok: true, message: '帖子已删除' };
  }

  async postCommentAudit(
    user: CurrentUser,
    body: { shopId: number; id: number; approved: boolean; reason: string },
  ): Promise<HealthPostCommentRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'content');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthPostComment.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '评论不存在');
    const updated = await this.prisma.healthPostComment.update({
      where: { id: row.id },
      data: { status: body.approved ? 'APPROVED' : 'REJECTED' },
    });
    const post = await this.prisma.healthPost.findFirst({
      where: { id: row.postId, shopId: ctx.shop.id },
      select: { title: true },
    });
    const author = await this.prisma.healthCustomer.findFirst({
      where: { id: row.customerId, shopId: ctx.shop.id },
      select: { nickname: true },
    });
    return {
      id: updated.id,
      postId: updated.postId,
      postTitle: post?.title ?? '',
      parentId: updated.parentId,
      authorKind: updated.authorKind as HealthPostCommentRow['authorKind'],
      authorName: author?.nickname ?? '',
      content: updated.content,
      likeCount: updated.likeCount,
      auditStatus: auditOf(updated.status),
      createdAt: toIso(updated.createdAt),
    };
  }

  async postCommentRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'content');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthPostComment.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '评论不存在');
    await this.prisma.$transaction([
      this.prisma.healthPostComment.delete({ where: { id: row.id } }),
      this.prisma.healthPost.update({
        where: { id: row.postId },
        data: { commentCount: { decrement: 1 } },
      }),
    ]);
    await audit(
      this.prisma,
      user.userId,
      'health.postComment.remove',
      `shop=${ctx.shop.id} comment=${row.id}`,
    );
    return { ok: true, message: '评论已删除' };
  }

  // ---------- 公开问答 ----------

  private async questionRows(
    shopId: number,
    rows: {
      id: number;
      customerId: number;
      patientId: number;
      title: string;
      detail: string;
      crowdKind: string;
      bountyCents: number;
      isPublic: boolean;
      answerCount: number;
      adoptedAnswerId: number;
      status: string;
      createdAt: Date;
    }[],
  ): Promise<HealthQuestionRow[]> {
    if (!rows.length) return [];
    const patientIds = [
      ...new Set(rows.map((row) => row.patientId).filter((id) => id > 0)),
    ];
    const customerIds = [
      ...new Set(rows.map((row) => row.customerId).filter((id) => id > 0)),
    ];
    const [patients, customers] = await Promise.all([
      patientIds.length
        ? this.prisma.healthPatient.findMany({
            where: { shopId, id: { in: patientIds } },
            select: { id: true, name: true },
          })
        : [],
      customerIds.length
        ? this.prisma.healthCustomer.findMany({
            where: { shopId, id: { in: customerIds } },
            select: { id: true, nickname: true },
          })
        : [],
    ]);
    const patientMap = new Map(patients.map((row) => [row.id, row.name]));
    const customerMap = new Map(customers.map((row) => [row.id, row.nickname]));
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      detail: row.detail,
      patientId: row.patientId,
      patientName: patientMap.get(row.patientId) ?? '',
      customerId: row.customerId,
      customerName: customerMap.get(row.customerId) ?? '',
      crowdKind: (CROWD_KINDS.has(row.crowdKind)
        ? row.crowdKind
        : 'ALL') as HealthQuestionRow['crowdKind'],
      bountyCents: row.bountyCents,
      isPublic: row.isPublic,
      answerCount: row.answerCount,
      adoptedAnswerId: row.adoptedAnswerId,
      status: (['OPEN', 'ANSWERED', 'ADOPTED', 'CLOSED'] as const).includes(
        row.status as never,
      )
        ? (row.status as HealthQuestionRow['status'])
        : 'OPEN',
      createdAt: toIso(row.createdAt),
    }));
  }

  async questions(user: CurrentUser, query: Record<string, unknown>) {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'content');
    const { page, pageSize, skip, keyword } = this.pager(query);
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (keyword) {
      where.OR = [
        { title: { contains: keyword } },
        { detail: { contains: keyword } },
      ];
    }
    const status = strOf(query.questionStatus, 16, 'all');
    if (status !== 'all') where.status = status;
    const [rows, total] = await Promise.all([
      this.prisma.healthQuestion.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.healthQuestion.count({ where }),
    ]);
    return {
      list: await this.questionRows(ctx.shop.id, rows),
      total,
      page,
      pageSize,
    };
  }

  async questionDetail(user: CurrentUser, query: Record<string, unknown>) {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'content');
    const id = intIn(query.id, 0, 2_000_000_000, 0);
    const row = await this.prisma.healthQuestion.findFirst({
      where: { id, shopId: ctx.shop.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '问题不存在');
    const [question] = await this.questionRows(ctx.shop.id, [row]);
    const answers = await this.prisma.healthAnswer.findMany({
      where: { shopId: ctx.shop.id, questionId: row.id },
      orderBy: [{ adopted: 'desc' }, { id: 'asc' }],
      take: 200,
    });
    const practitionerIds = [
      ...new Set(
        answers.map((item) => item.practitionerId).filter((id) => id > 0),
      ),
    ];
    const practitioners = practitionerIds.length
      ? await this.prisma.healthPractitioner.findMany({
          where: { shopId: ctx.shop.id, id: { in: practitionerIds } },
          select: { id: true, name: true, title: true },
        })
      : [];
    const practitionerMap = new Map(
      practitioners.map((item) => [item.id, item]),
    );
    return {
      question,
      answers: answers.map<HealthAnswerRow>((item) => {
        const practitioner = practitionerMap.get(item.practitionerId);
        return {
          id: item.id,
          questionId: item.questionId,
          questionTitle: row.title,
          practitionerId: item.practitionerId,
          practitionerName: practitioner?.name ?? '',
          practitionerTitle: practitioner?.title ?? '',
          content: item.content,
          likeCount: item.likeCount,
          adopted: item.adopted,
          auditStatus: auditOf(item.auditStatus),
          createdAt: toIso(item.createdAt),
        };
      }),
    };
  }

  async answerAudit(
    user: CurrentUser,
    body: { shopId: number; id: number; approved: boolean; reason: string },
  ): Promise<HealthAnswerRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'content');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthAnswer.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '回答不存在');
    const updated = await this.prisma.healthAnswer.update({
      where: { id: row.id },
      data: {
        auditStatus: body.approved ? 'APPROVED' : 'REJECTED',
        auditReason: body.approved ? '' : clip(body.reason, 200),
      },
    });
    if (body.approved) {
      const question = await this.prisma.healthQuestion.findFirst({
        where: { id: row.questionId, shopId: ctx.shop.id },
        select: { id: true, status: true },
      });
      if (question && question.status === 'OPEN') {
        await this.prisma.healthQuestion.update({
          where: { id: question.id },
          data: { status: 'ANSWERED' },
        });
      }
    }
    const [question, practitioner] = await Promise.all([
      this.prisma.healthQuestion.findFirst({
        where: { id: row.questionId, shopId: ctx.shop.id },
        select: { title: true },
      }),
      row.practitionerId
        ? this.prisma.healthPractitioner.findFirst({
            where: { id: row.practitionerId, shopId: ctx.shop.id },
            select: { name: true, title: true },
          })
        : null,
    ]);
    return {
      id: updated.id,
      questionId: updated.questionId,
      questionTitle: question?.title ?? '',
      practitionerId: updated.practitionerId,
      practitionerName: practitioner?.name ?? '',
      practitionerTitle: practitioner?.title ?? '',
      content: updated.content,
      likeCount: updated.likeCount,
      adopted: updated.adopted,
      auditStatus: auditOf(updated.auditStatus),
      createdAt: toIso(updated.createdAt),
    };
  }

  async answerRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'content');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthAnswer.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '回答不存在');
    const question = await this.prisma.healthQuestion.findFirst({
      where: { id: row.questionId, shopId: ctx.shop.id },
    });
    await this.prisma.$transaction([
      this.prisma.healthAnswer.delete({ where: { id: row.id } }),
      ...(question
        ? [
            this.prisma.healthQuestion.update({
              where: { id: question.id },
              data: {
                answerCount: { decrement: 1 },
                adoptedAnswerId:
                  question.adoptedAnswerId === row.id
                    ? 0
                    : question.adoptedAnswerId,
                status:
                  question.adoptedAnswerId === row.id &&
                  question.status === 'ADOPTED'
                    ? 'ANSWERED'
                    : question.status,
              },
            }),
          ]
        : []),
    ]);
    await audit(
      this.prisma,
      user.userId,
      'health.answer.remove',
      `shop=${ctx.shop.id} answer=${row.id}`,
    );
    return { ok: true, message: '回答已删除' };
  }

  // ---------- 评价 ----------

  private async reviewRows(
    shopId: number,
    rows: {
      id: number;
      orderId: number;
      patientId: number;
      customerId: number;
      targetType: string;
      targetId: number;
      targetName: string;
      score: number;
      effectScore: number;
      serviceScore: number;
      tagsJson: unknown;
      content: string;
      imagesJson: unknown;
      anonymous: boolean;
      status: string;
      replyContent: string;
      repliedAt: Date | null;
      appealStatus: string;
      createdAt: Date;
    }[],
  ): Promise<HealthReviewRow[]> {
    if (!rows.length) return [];
    const orderIds = [
      ...new Set(rows.map((row) => row.orderId).filter((id) => id > 0)),
    ];
    const patientIds = [
      ...new Set(rows.map((row) => row.patientId).filter((id) => id > 0)),
    ];
    const customerIds = [
      ...new Set(rows.map((row) => row.customerId).filter((id) => id > 0)),
    ];
    const [orders, patients, customers] = await Promise.all([
      orderIds.length
        ? this.prisma.healthOrder.findMany({
            where: { shopId, id: { in: orderIds } },
            select: { id: true, orderNo: true, orderType: true },
          })
        : [],
      patientIds.length
        ? this.prisma.healthPatient.findMany({
            where: { shopId, id: { in: patientIds } },
            select: { id: true, name: true },
          })
        : [],
      customerIds.length
        ? this.prisma.healthCustomer.findMany({
            where: { shopId, id: { in: customerIds } },
            select: { id: true, nickname: true },
          })
        : [],
    ]);
    const orderMap = new Map(orders.map((row) => [row.id, row]));
    const patientMap = new Map(patients.map((row) => [row.id, row.name]));
    const customerMap = new Map(customers.map((row) => [row.id, row.nickname]));
    return rows.map((row) => {
      const order = orderMap.get(row.orderId);
      return {
        id: row.id,
        orderId: row.orderId,
        orderNo: order?.orderNo ?? '',
        bizType: (order?.orderType ??
          'CONSULT_TEXT') as HealthReviewRow['bizType'],
        targetKind: safeTargetKind(row.targetType),
        targetId: row.targetId,
        targetName: row.targetName,
        customerId: row.customerId,
        customerLabel: row.anonymous
          ? '匿名用户'
          : (customerMap.get(row.customerId) ?? ''),
        patientName: patientMap.get(row.patientId) ?? '',
        score: row.score,
        scores: { effect: row.effectScore, service: row.serviceScore },
        tags: jsonArr<string>(row.tagsJson).map((item) => String(item)),
        content: row.content,
        images: jsonArr<string>(row.imagesJson).map((item) => String(item)),
        anonymous: row.anonymous,
        auditStatus: auditOf(row.status),
        appealStatus: appealOf(row.appealStatus),
        reply: row.replyContent,
        repliedAt: toIso(row.repliedAt),
        createdAt: toIso(row.createdAt),
      };
    });
  }

  async reviews(user: CurrentUser, query: Record<string, unknown>) {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'review');
    const { page, pageSize, skip, keyword } = this.pager(query);
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (keyword) where.content = { contains: keyword };
    const targetKind = strOf(query.targetKind, 16, 'all');
    if (targetKind !== 'all') {
      where.targetType =
        targetKind === 'ORGAN' ? { in: ['ORGAN', 'HOSPITAL'] } : targetKind;
    }
    const targetId = intIn(query.targetId, 0, 2_000_000_000, 0);
    if (targetId > 0) where.targetId = targetId;
    const auditStatus = strOf(query.auditStatus, 16, 'all');
    if (auditStatus !== 'all') {
      where.status =
        auditStatus === 'APPROVED'
          ? { in: ['APPROVED', 'PUBLISHED'] }
          : auditStatus;
    }
    const minScore = intIn(query.minScore, 0, 5, 0);
    const maxScore = intIn(query.maxScore, 0, 5, 0);
    if (minScore > 0 || maxScore > 0) {
      where.score = {
        ...(minScore > 0 ? { gte: minScore } : {}),
        ...(maxScore > 0 ? { lte: maxScore } : {}),
      };
    }
    const [rows, total] = await Promise.all([
      this.prisma.healthReview.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.healthReview.count({ where }),
    ]);
    return {
      list: await this.reviewRows(ctx.shop.id, rows),
      total,
      page,
      pageSize,
    };
  }

  async reviewStats(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthReviewStatRow[]> {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'review');
    const targetKind = strOf(query.targetKind, 16, 'all');
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (targetKind !== 'all') {
      where.targetType =
        targetKind === 'ORGAN' ? { in: ['ORGAN', 'HOSPITAL'] } : targetKind;
    }
    const rows = await this.prisma.healthReview.findMany({
      where,
      select: {
        targetType: true,
        targetId: true,
        targetName: true,
        score: true,
        appealStatus: true,
      },
    });
    const buckets = new Map<
      string,
      {
        kind: HealthReviewStatRow['targetKind'];
        id: number;
        name: string;
        scores: number[];
        bad: number;
        appeals: number;
      }
    >();
    for (const row of rows) {
      const kind = safeTargetKind(row.targetType);
      const key = `${kind}:${row.targetId}`;
      const bucket = buckets.get(key) ?? {
        kind,
        id: row.targetId,
        name: row.targetName,
        scores: [],
        bad: 0,
        appeals: 0,
      };
      bucket.scores.push(Number(row.score) || 0);
      if (Number(row.score) <= 2) bucket.bad += 1;
      if (appealOf(row.appealStatus) === 'PENDING') bucket.appeals += 1;
      if (!bucket.name && row.targetName) bucket.name = row.targetName;
      buckets.set(key, bucket);
    }
    const list = [...buckets.values()].map<HealthReviewStatRow>((bucket) => {
      const count = bucket.scores.length;
      const avg =
        count > 0
          ? Math.round(
              (bucket.scores.reduce((sum, item) => sum + item, 0) / count) * 10,
            ) / 10
          : 0;
      const good = bucket.scores.filter((item) => item >= 4).length;
      return {
        targetKind: bucket.kind,
        targetId: bucket.id,
        targetName: bucket.name,
        count,
        avgScore: avg,
        goodPercent: count > 0 ? Math.round((good / count) * 100) : 0,
        badCount: bucket.bad,
        pendingAppeal: bucket.appeals,
      };
    });
    return list.sort((a, b) => b.count - a.count).slice(0, 100);
  }

  async reviewReply(
    user: CurrentUser,
    body: HealthReviewReplyBody,
  ): Promise<HealthReviewRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'review');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthReview.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '评价不存在');
    const updated = await this.prisma.healthReview.update({
      where: { id: row.id },
      data: { replyContent: clip(body.reply, 1000), repliedAt: new Date() },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.review.reply',
      `shop=${ctx.shop.id} review=${row.id}`,
    );
    const [view] = await this.reviewRows(ctx.shop.id, [updated]);
    return view;
  }

  async reviewAudit(
    user: CurrentUser,
    body: { shopId: number; id: number; approved: boolean; reason: string },
  ): Promise<HealthReviewRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'review');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthReview.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '评价不存在');
    const updated = await this.prisma.healthReview.update({
      where: { id: row.id },
      data: {
        status: body.approved ? 'APPROVED' : 'REJECTED',
        auditReason: body.approved ? '' : clip(body.reason, 200),
      },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.review.audit',
      `shop=${ctx.shop.id} review=${row.id} approved=${body.approved}`,
    );
    const [view] = await this.reviewRows(ctx.shop.id, [updated]);
    return view;
  }

  async reviewAppealHandle(
    user: CurrentUser,
    body: { shopId: number; id: number; approved: boolean; note: string },
  ): Promise<HealthReviewRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'review');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthReview.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '评价不存在');
    // 申诉通过 = 认可商家/医护理由，评价转 OFFLINE；不通过保持原审核态。
    const updated = await this.prisma.healthReview.update({
      where: { id: row.id },
      data: {
        appealStatus: body.approved ? 'APPROVED' : 'REJECTED',
        appealContent: clip(body.note, 500),
        status: body.approved ? 'OFFLINE' : row.status,
      },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.review.appeal',
      `shop=${ctx.shop.id} review=${row.id} approved=${body.approved}`,
    );
    const [view] = await this.reviewRows(ctx.shop.id, [updated]);
    return view;
  }

  async reviewRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'review');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthReview.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
      select: { id: true },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '评价不存在');
    await this.prisma.healthReview.delete({ where: { id: row.id } });
    await audit(
      this.prisma,
      user.userId,
      'health.review.remove',
      `shop=${ctx.shop.id} review=${row.id}`,
    );
    return { ok: true, message: '评价已删除' };
  }

  // ---------- 群发 ----------

  private broadcasterOf(row: {
    id: number;
    title: string;
    content: string;
    channel: string;
    targetJson: unknown;
    status: string;
    createdAt: Date;
  }): HealthBroadcastRow {
    const extra = jsonObj<Record<string, unknown>>(row.targetJson, {});
    const channel = BROADCAST_CHANNELS.has(row.channel)
      ? (row.channel as HealthBroadcastRow['channel'])
      : 'IN_APP';
    const status = (['DRAFT', 'SENT', 'FAILED', 'CANCELLED'] as const).includes(
      row.status as never,
    )
      ? (row.status as HealthBroadcastRow['status'])
      : 'DRAFT';
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      channel,
      templateKey: strOf(extra.templateKey, 40),
      crowdGroupIds: jsonArr<unknown>(extra.crowdGroupIds)
        .map((item) => Number(item))
        .filter((id) => Number.isInteger(id) && id > 0),
      crowdNames: jsonArr<unknown>(extra.crowdNames).map((item) =>
        String(item),
      ),
      targetCount: intIn(extra.targetCount, 0, 2_000_000_000, 0),
      sentCount: intIn(extra.sentCount, 0, 2_000_000_000, 0),
      failedCount: intIn(extra.failedCount, 0, 2_000_000_000, 0),
      status,
      lastError: strOf(extra.lastError, 200),
      scheduledAt: strOf(extra.scheduledAt, 32),
      createdAt: toIso(row.createdAt),
    };
  }

  async broadcasts(user: CurrentUser, query: Record<string, unknown>) {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'content');
    const { page, pageSize, skip, keyword } = this.pager(query);
    const where: Record<string, unknown> = { shopId: ctx.shop.id };
    if (keyword) where.title = { contains: keyword };
    const [rows, total] = await Promise.all([
      this.prisma.healthBroadcast.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.healthBroadcast.count({ where }),
    ]);
    return {
      list: rows.map((row) => this.broadcasterOf(row)),
      total,
      page,
      pageSize,
    };
  }

  async broadcastCreate(
    user: CurrentUser,
    body: HealthBroadcastCreateBody,
  ): Promise<HealthBroadcastRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'content');
    await requireShopWritable(ctx);
    const groupIds = body.crowdGroupIds.filter((id) => id > 0);
    const groups = groupIds.length
      ? await this.prisma.healthCrowdGroup.findMany({
          where: { shopId: ctx.shop.id, id: { in: groupIds } },
          select: { id: true, name: true },
        })
      : [];
    const customers = await this.audienceOf(
      ctx.shop.id,
      groups.map((row) => row.id),
    );
    const scheduledAt = clip(body.scheduledAt, 32);
    const extra: Record<string, unknown> = {
      templateKey: body.templateKey,
      crowdGroupIds: groups.map((row) => row.id),
      crowdNames: groups.map((row) => row.name),
      page: body.page,
      targetCount: customers.length,
      sentCount: 0,
      failedCount: 0,
      lastError: '',
      scheduledAt,
    };
    let status: HealthBroadcastRow['status'] = 'DRAFT';
    let lastError = '';
    if (scheduledAt) {
      // 定时任务由调度器按 scheduledAt 取 DRAFT 行，这里只落计划。
      extra.lastError = '';
    } else if (!customers.length) {
      status = 'FAILED';
      lastError = '人群分组内没有可触达的顾客';
      extra.lastError = lastError;
    } else if (body.channel === 'IN_APP') {
      await this.prisma.healthNotice.create({
        data: {
          shopId: ctx.shop.id,
          title: `[群发] ${clip(body.title, 70)}`,
          content: body.content,
          status: 'ON',
        },
      });
      status = 'SENT';
      extra.sentCount = customers.length;
    } else {
      const result = await this.sendSubscribe(ctx.shop.id, body, customers);
      status = result.failed > 0 ? 'FAILED' : 'SENT';
      extra.sentCount = result.sent;
      extra.failedCount = result.failed;
      extra.lastError = result.error;
    }
    const row = await this.prisma.healthBroadcast.create({
      data: {
        shopId: ctx.shop.id,
        title: clip(body.title, 120),
        content: body.content,
        channel: body.channel,
        targetJson: extra as never,
        status,
        sentAt: status === 'SENT' ? new Date() : null,
        createdBy: user.userId,
      },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.broadcast.create',
      `shop=${ctx.shop.id} broadcast=${row.id} channel=${body.channel} status=${status}`,
    );
    return this.broadcasterOf(row);
  }

  private async audienceOf(shopId: number, groupIds: number[]) {
    if (!groupIds.length) {
      return this.prisma.healthCustomer.findMany({
        where: { shopId, status: 'ON' },
        select: { id: true, openid: true },
      });
    }
    const members = await this.prisma.healthCrowdMember.findMany({
      where: { shopId, groupId: { in: groupIds } },
      select: { patientId: true },
    });
    const patientIds = [
      ...new Set(members.map((row) => row.patientId).filter((id) => id > 0)),
    ];
    const patients = patientIds.length
      ? await this.prisma.healthPatient.findMany({
          where: { shopId, id: { in: patientIds } },
          select: { customerId: true },
        })
      : [];
    const customerIds = [
      ...new Set(patients.map((row) => row.customerId).filter((id) => id > 0)),
    ];
    if (!customerIds.length) return [];
    return this.prisma.healthCustomer.findMany({
      where: { shopId, id: { in: customerIds }, status: 'ON' },
      select: { id: true, openid: true },
    });
  }

  private async sendSubscribe(
    shopId: number,
    body: HealthBroadcastCreateBody,
    customers: { id: number; openid: string }[],
  ) {
    const shop = await this.prisma.healthShop.findFirst({
      where: { id: shopId },
      select: { id: true, ownerUserId: true, name: true },
    });
    if (!shop)
      return { sent: 0, failed: customers.length, error: '店铺不存在' };
    const subject = subjectOfShop(shop);
    const [runtime, templates] = await Promise.all([
      this.miniApp.runtime(subject).catch(() => null),
      this.miniApp.templates(subject).catch(() => null),
    ]);
    const templateId = templates?.[body.templateKey] || '';
    if (!runtime || !templateId) {
      return {
        sent: 0,
        failed: customers.length,
        error: body.templateKey
          ? `订阅消息模板 ${body.templateKey} 未在底座配置`
          : '未选择订阅消息模板',
      };
    }
    let sent = 0;
    let failed = 0;
    let error = '';
    // 单次群发最多尝试 500 人，避免一个请求长期占用；剩余人群建议拆批。
    for (const customer of customers.slice(0, 500)) {
      if (!customer.openid) {
        failed += 1;
        continue;
      }
      try {
        const result = await this.client.sendSubscribeMessage(runtime, {
          templateId,
          openId: customer.openid,
          page: body.page,
          data: {
            thing1: { value: clip(body.title, 20) },
            thing2: { value: clip(body.content, 20) },
          },
        });
        if (result?.sent === false) {
          failed += 1;
        } else {
          sent += 1;
        }
      } catch (cause) {
        failed += 1;
        if (!error)
          error = String((cause as Error)?.message || '订阅消息发送失败').slice(
            0,
            200,
          );
      }
    }
    if (customers.length > 500) {
      failed += customers.length - 500;
      if (!error) error = '超出单次群发上限 500 人，剩余人群未发送';
    }
    return { sent, failed, error };
  }

  async broadcastCancel(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'content');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthBroadcast.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '群发任务不存在');
    if (row.status !== 'DRAFT') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '已发送或已失败的群发不能取消',
      );
    }
    const updated = await this.prisma.healthBroadcast.update({
      where: { id: row.id },
      data: { status: 'CANCELLED' },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.broadcast.cancel',
      `shop=${ctx.shop.id} broadcast=${row.id}`,
    );
    return this.broadcasterOf(updated);
  }

  // ---------- 搜索热词、搜索日志与常用语 ----------

  async hotKeywords(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthHotKeywordRow[]> {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'content');
    const rows = await this.prisma.healthHotKeyword.findMany({
      where: { shopId: ctx.shop.id },
      orderBy: [{ searchNum: 'desc' }, { id: 'asc' }],
      take: 200,
    });
    return rows.map((row) => ({
      id: row.id,
      keyword: row.word,
      manual: row.source === 'MANUAL',
      searchCount: row.searchNum,
      status: onOff(row.status),
    }));
  }

  async hotKeywordSave(
    user: CurrentUser,
    body: { shopId: number; id: number; keyword: string; status: 'ON' | 'OFF' },
  ): Promise<HealthHotKeywordRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'content');
    await requireShopWritable(ctx);
    const existing =
      body.id > 0
        ? await this.prisma.healthHotKeyword.findFirst({
            where: { id: body.id, shopId: ctx.shop.id },
          })
        : await this.prisma.healthHotKeyword.findFirst({
            where: { shopId: ctx.shop.id, word: body.keyword },
          });
    if (body.id > 0 && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '热词不存在');
    }
    if (existing && existing.word !== body.keyword) {
      const duplicated = await this.prisma.healthHotKeyword.findFirst({
        where: {
          shopId: ctx.shop.id,
          word: body.keyword,
          id: { not: existing.id },
        },
        select: { id: true },
      });
      if (duplicated)
        throw new BusinessException(ErrorCode.CONFLICT, '热词已存在');
    }
    const row = existing
      ? await this.prisma.healthHotKeyword.update({
          where: { id: existing.id },
          data: { word: body.keyword, status: body.status, source: 'MANUAL' },
        })
      : await this.prisma.healthHotKeyword.create({
          data: {
            shopId: ctx.shop.id,
            word: body.keyword,
            status: body.status,
            source: 'MANUAL',
          },
        });
    return {
      id: row.id,
      keyword: row.word,
      manual: row.source === 'MANUAL',
      searchCount: row.searchNum,
      status: onOff(row.status),
    };
  }

  async hotKeywordRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'content');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthHotKeyword.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
      select: { id: true },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '热词不存在');
    await this.prisma.healthHotKeyword.delete({ where: { id: row.id } });
    await audit(
      this.prisma,
      user.userId,
      'health.hotKeyword.remove',
      `shop=${ctx.shop.id} hotword=${row.id}`,
    );
    return { ok: true, message: '热词已删除' };
  }

  async searchLogs(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthSearchLogRow[]> {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'content');
    const days = intIn(query.days, 1, 90, 7);
    const zeroOnly = intIn(query.zeroOnly, 0, 1, 0) === 1;
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await this.prisma.healthSearchLog.findMany({
      where: { shopId: ctx.shop.id, createdAt: { gte: since } },
      orderBy: { id: 'desc' },
      take: 5_000,
      select: { keyword: true, resultNum: true, createdAt: true },
    });
    const buckets = new Map<
      string,
      { count: number; zero: number; lastAt: Date }
    >();
    for (const row of rows) {
      const key = clip(row.keyword, 60);
      if (!key) continue;
      const bucket = buckets.get(key) ?? {
        count: 0,
        zero: 0,
        lastAt: row.createdAt,
      };
      bucket.count += 1;
      if (row.resultNum <= 0) bucket.zero += 1;
      if (row.createdAt > bucket.lastAt) bucket.lastAt = row.createdAt;
      buckets.set(key, bucket);
    }
    return [...buckets.entries()]
      .filter(([, bucket]) => (zeroOnly ? bucket.zero > 0 : true))
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 100)
      .map<HealthSearchLogRow>(([keyword, bucket]) => ({
        keyword,
        count: bucket.count,
        zeroResultCount: bucket.zero,
        lastAt: toIso(bucket.lastAt),
      }));
  }

  async cannedList(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthCannedRow[]> {
    const ctx = await requireShop(this.prisma, user, query.shopId, 'content');
    const groupKey = strOf(query.groupKey, 40, '');
    const rows = await this.prisma.healthCannedResponse.findMany({
      where: {
        shopId: ctx.shop.id,
        ...(groupKey ? { group: groupKey } : {}),
      },
      orderBy: [{ group: 'asc' }, { sort: 'asc' }, { id: 'asc' }],
      take: 500,
    });
    return rows.map((row) => ({
      id: row.id,
      groupKey: row.group,
      content: row.content,
      sort: row.sort,
      status: onOff(row.status),
    }));
  }

  async cannedSave(
    user: CurrentUser,
    body: {
      shopId: number;
      id: number;
      groupKey: string;
      content: string;
      sort: number;
      status: 'ON' | 'OFF';
    },
  ): Promise<HealthCannedRow> {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'content');
    await requireShopWritable(ctx);
    const existing =
      body.id > 0
        ? await this.prisma.healthCannedResponse.findFirst({
            where: { id: body.id, shopId: ctx.shop.id },
          })
        : null;
    if (body.id > 0 && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '常用语不存在');
    }
    const data = {
      shopId: ctx.shop.id,
      group: clip(body.groupKey, 30) || 'DEFAULT',
      content: clip(body.content, 500),
      sort: body.sort,
      status: body.status,
    };
    const row = existing
      ? await this.prisma.healthCannedResponse.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.healthCannedResponse.create({ data });
    return {
      id: row.id,
      groupKey: row.group,
      content: row.content,
      sort: row.sort,
      status: onOff(row.status),
    };
  }

  async cannedRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    const ctx = await requireShop(this.prisma, user, body.shopId, 'content');
    await requireShopWritable(ctx);
    const row = await this.prisma.healthCannedResponse.findFirst({
      where: { id: body.id, shopId: ctx.shop.id },
      select: { id: true },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '常用语不存在');
    await this.prisma.healthCannedResponse.delete({ where: { id: row.id } });
    await audit(
      this.prisma,
      user.userId,
      'health.canned.remove',
      `shop=${ctx.shop.id} canned=${row.id}`,
    );
    return { ok: true, message: '常用语已删除' };
  }
}
