import type { Prisma } from '../../generated/prisma';
import { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { toJsonInput } from '../common/json-input';
import { PrismaService } from '../prisma/prisma.service';
import { GeoSiteService } from './geo-site.service';
import { writeGeoSitePublishLog } from './geo-site-publish-log';
import { seoViewOf } from './geo-site.render.service';
import {
  assertElementTree,
  clipText,
  GEO_SITE_CONTENT_KINDS,
  GEO_SITE_LANGUAGES,
  GEO_SITE_LANGUAGE_LABELS,
  languageHref,
  normalizeContentSlug,
  normalizeFaqList,
  normalizeGallery,
  normalizeIdList,
  normalizeLanguage,
  normalizeLanguageList,
  normalizeSpecList,
  normalizeTagList,
  safeSiteUrl,
  toText,
} from './geo-site.shared';

/**
 * 站点内容库：文章与产品共用一套读写逻辑，差异全部收在 ContentStore 适配层里。
 *
 * 两条口径必须钉住：
 * 1) 正文存元素树（与页面 content 同构），公开渲染走同一套转义与样式白名单——
 *    项目里没有通用 HTML sanitizer，绝不允许第二种「富文本直接落 HTML」的路径出现；
 * 2) 发布 = 直接改 status，不做二级快照。内容要出现在公开页必须同时满足
 *    「站点已发布」+「内容已发布」，站点发布是总闸，所以内容侧不需要再冻结一份。
 */

export type GeoSiteContentKind = 'article' | 'product';

const KINDS = new Set<string>(GEO_SITE_CONTENT_KINDS);

/** 两张表的公共列：适配层把行收敛成这个形状，业务逻辑只认它。 */
type ContentRow = {
  id: number;
  siteId: number;
  ownerUserId: string;
  title: string;
  slug: string;
  lang: string;
  summary: string;
  category: string;
  coverImage: string;
  status: string;
  viewCount: number;
  sort: number;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  body: unknown;
  gallery: unknown;
  tags: unknown;
  faqs: unknown;
  seo: unknown;
  /** 文章侧：作者与关联产品；产品侧：价格与规格。适配层按列存在与否填一侧。 */
  authorName?: string;
  relatedIds?: unknown;
  price?: unknown;
  unit?: string;
  priceOnAsk?: number;
  specs?: unknown;
  buyUrl?: string;
  featured?: number;
};

type ContentArgs = {
  where: Record<string, unknown>;
  orderBy?: unknown;
  skip?: number;
  take?: number;
  select?: Record<string, unknown>;
};

/** 表适配：把两个 Prisma delegate 折叠成同一组方法，越界处只做一次类型收口。 */
type ContentStore = {
  findMany(args: ContentArgs): Promise<ContentRow[]>;
  findFirst(args: ContentArgs): Promise<ContentRow | null>;
  count(where: Record<string, unknown>): Promise<number>;
  create(data: Record<string, unknown>): Promise<ContentRow>;
  update(id: number, data: Record<string, unknown>): Promise<void>;
  incView(id: number): Promise<void>;
};

function asRows(value: unknown): ContentRow[] {
  return Array.isArray(value) ? (value as ContentRow[]) : [];
}

export type GeoSiteContentView = {
  id: number;
  siteId: number;
  kind: GeoSiteContentKind;
  title: string;
  slug: string;
  lang: string;
  langLabel: string;
  summary: string;
  category: string;
  coverImage: string;
  tags: string[];
  status: string;
  viewCount: number;
  sort: number;
  publishedAt: Date | null;
  updatedAt: Date;
  authorName?: string;
  relatedIds?: number[];
  price?: number;
  unit?: string;
  priceOnAsk?: boolean;
  specs?: { name: string; value: string }[];
  buyUrl?: string;
  featured?: boolean;
};

function viewOf(
  row: ContentRow,
  kind: GeoSiteContentKind,
  defaultLanguage = 'zh-CN',
): GeoSiteContentView {
  const lang = normalizeLanguage(row.lang, defaultLanguage);
  const base: GeoSiteContentView = {
    id: row.id,
    siteId: row.siteId,
    kind,
    title: row.title,
    slug: row.slug,
    lang,
    langLabel: GEO_SITE_LANGUAGE_LABELS[lang] || lang,
    summary: row.summary,
    category: row.category,
    coverImage: row.coverImage,
    tags: strArray(row.tags),
    status: row.status,
    viewCount: row.viewCount,
    sort: row.sort,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
  };
  if (kind === 'article') {
    base.authorName = row.authorName || '';
    base.relatedIds = intArray(row.relatedIds);
  } else {
    base.price = Number(row.price ?? 0);
    base.unit = row.unit || '';
    base.priceOnAsk = row.priceOnAsk === 1;
    base.specs = specArray(row.specs);
    base.buyUrl = row.buyUrl || '';
    base.featured = row.featured === 1;
  }
  return base;
}

function strArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function intArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0)
    : [];
}

function specArray(value: unknown): { name: string; value: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): { name: string; value: string }[] => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    return [{ name: clipText(row.name, 60), value: clipText(row.value, 300) }];
  });
}

/** 价格归一化：负数与超界值一律夹回区间，非法输入直接归零而不是报错卡住表单。 */
function normalizePrice(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.min(999_999_999_999.99, Math.round(num * 100) / 100);
}

export class GeoSiteContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: GeoSiteService,
  ) {}

  /* ---------------------------- 读 ---------------------------- */

  async page(
    user: CurrentUser,
    kind: GeoSiteContentKind,
    query: {
      siteId: number;
      status?: string;
      q?: string;
      category?: string;
      lang?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const site = await this.sites.requireSite(user, Number(query.siteId));
    const store = this.store(kind);
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)));
    const where: Record<string, unknown> = { siteId: site.id };
    if (query.lang !== undefined && String(query.lang).trim()) {
      where.lang = this.langOf(site, query.lang);
    }
    const status = String(query.status || '')
      .trim()
      .toUpperCase();
    if (['DRAFT', 'PUBLISHED', 'OFFLINE'].includes(status))
      where.status = status;
    const category = clipText(query.category, 60);
    if (category) where.category = category;
    const q = clipText(query.q, 60);
    if (q) {
      where.OR = [
        { title: { contains: q } },
        { slug: { contains: q.toLowerCase() } },
        { summary: { contains: q } },
      ];
    }
    const [rows, total] = await Promise.all([
      store.findMany({
        where,
        orderBy: [{ sort: 'desc' }, { publishedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      store.count(where),
    ]);
    return {
      kind,
      page,
      pageSize,
      total,
      items: rows.map((row) => viewOf(row, kind, site.defaultLanguage)),
    };
  }

  async detail(user: CurrentUser, kind: GeoSiteContentKind, id: number) {
    const row = await this.requireRow(user, kind, Number(id));
    const site = await this.sites.requireSite(user, row.siteId);
    return {
      ...viewOf(row, kind, site.defaultLanguage),
      body: Array.isArray(row.body) ? row.body : [],
      gallery: Array.isArray(row.gallery) ? row.gallery : [],
      faqs: Array.isArray(row.faqs) ? row.faqs : [],
      seo: seoViewOf(row.seo),
    };
  }

  /** 编辑器/菜单的候选清单：只给公开可见的线上数据，避免把草稿链到线上页面。 */
  async pickers(user: CurrentUser, siteId: number) {
    const site = await this.sites.requireSite(user, Number(siteId));
    const [pages, articles, products] = await Promise.all([
      this.prisma.geoSitePage.findMany({
        where: { siteId: site.id },
        orderBy: [{ sort: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          path: true,
          lang: true,
          title: true,
          kind: true,
          isHome: true,
          status: true,
        },
      }),
      this.store('article').findMany({
        where: { siteId: site.id },
        orderBy: [{ id: 'desc' }],
        take: 200,
      }),
      this.store('product').findMany({
        where: { siteId: site.id },
        orderBy: [{ id: 'desc' }],
        take: 200,
      }),
    ]);
    return {
      defaultLanguage: normalizeLanguage(site.defaultLanguage),
      languages: normalizeLanguageList(site.languages, site.defaultLanguage),
      languageOptions: GEO_SITE_LANGUAGES.map((code) => ({
        code,
        label: GEO_SITE_LANGUAGE_LABELS[code] || code,
      })),
      pages: pages.map((page) => ({
        id: page.id,
        title: page.title,
        path: page.path,
        lang: normalizeLanguage(page.lang, site.defaultLanguage),
        kind: page.kind,
        isHome: page.isHome === 1,
        status: page.status,
        href: languageHref('', page.path, page.lang, site.defaultLanguage),
      })),
      articles: articles.map((row) => ({
        id: row.id,
        title: row.title,
        slug: row.slug,
        lang: normalizeLanguage(row.lang, site.defaultLanguage),
        status: row.status,
        category: row.category,
      })),
      products: products.map((row) => ({
        id: row.id,
        title: row.title,
        slug: row.slug,
        lang: normalizeLanguage(row.lang, site.defaultLanguage),
        status: row.status,
        category: row.category,
      })),
    };
  }

  /* ---------------------------- 写 ---------------------------- */

  async create(
    user: CurrentUser,
    kind: GeoSiteContentKind,
    body: Record<string, unknown>,
  ) {
    const site = await this.sites.requireSite(
      user,
      Number((body as { siteId?: number }).siteId),
    );
    const title = clipText(body.title, 200);
    if (!title)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写标题');
    const lang = this.langOf(site, body.lang);
    const slug = await this.uniqueSlug(kind, site.id, lang, body.slug, title);
    const store = this.store(kind);
    const maxSort = await store.count({ siteId: site.id });
    const data: Record<string, unknown> = {
      siteId: site.id,
      ownerUserId: site.ownerUserId,
      title,
      slug,
      lang,
      summary: clipText(body.summary, 500),
      category: clipText(body.category, 60),
      coverImage: safeSiteUrl(body.coverImage) || '',
      gallery: toJsonInput(
        normalizeGallery(Array.isArray(body.gallery) ? body.gallery : []),
      ),
      tags: toJsonInput(normalizeTagList(body.tags)),
      faqs: toJsonInput(normalizeFaqList(body.faqs)),
      seo: toJsonInput(seoViewOf({ title, ...objectOf(body.seo) })),
      body: toJsonInput([]),
      sort: Number(body.sort ?? maxSort) || 0,
      status: 'DRAFT',
    };
    this.applyKindFields(kind, data, body);
    const row = await store.create(data);
    return this.detail(user, kind, row.id);
  }

  async update(
    user: CurrentUser,
    kind: GeoSiteContentKind,
    body: Record<string, unknown>,
  ) {
    const id = Number(body.id);
    const row = await this.requireRow(user, kind, id);
    const site = await this.sites.requireSite(user, row.siteId);
    const store = this.store(kind);
    const data: Record<string, unknown> = {};
    let nextLang = normalizeLanguage(row.lang, site.defaultLanguage);
    if (body.lang !== undefined) {
      nextLang = this.langOf(site, body.lang);
      if (nextLang !== normalizeLanguage(row.lang, site.defaultLanguage)) {
        data.lang = nextLang;
      }
    }
    if (body.title !== undefined) {
      const title = clipText(body.title, 200);
      if (!title)
        throw new BusinessException(ErrorCode.BAD_REQUEST, '标题不能为空');
      data.title = title;
    }
    if (body.slug !== undefined || data.lang !== undefined) {
      data.slug = await this.uniqueSlug(
        kind,
        row.siteId,
        nextLang,
        body.slug ?? row.slug,
        toText(body.title ?? row.title),
        row.id,
      );
    }
    if (body.summary !== undefined) data.summary = clipText(body.summary, 500);
    if (body.category !== undefined)
      data.category = clipText(body.category, 60);
    if (body.coverImage !== undefined) {
      const url = safeSiteUrl(body.coverImage);
      if (clipText(body.coverImage, 1) && !url) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '封面图片只支持 http(s) 链接或本站相对路径',
        );
      }
      data.coverImage = url || '';
    }
    if (body.gallery !== undefined) {
      data.gallery = toJsonInput(normalizeGallery(body.gallery));
    }
    if (body.tags !== undefined)
      data.tags = toJsonInput(normalizeTagList(body.tags));
    if (body.faqs !== undefined)
      data.faqs = toJsonInput(normalizeFaqList(body.faqs));
    if (body.seo !== undefined) {
      data.seo = toJsonInput(
        seoViewOf({ ...objectOf(row.seo), ...objectOf(body.seo) }),
      );
    }
    if (body.sort !== undefined) data.sort = Number(body.sort) || 0;
    this.applyKindFields(kind, data, body);
    if (!Object.keys(data).length) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '没有需要保存的内容');
    }
    await store.update(row.id, data);
    return this.detail(user, kind, row.id);
  }

  /** 正文保存：与页面草稿同一套元素树校验，2MB/2000 节点/12 层三重封顶照旧生效。 */
  async saveBody(
    user: CurrentUser,
    kind: GeoSiteContentKind,
    body: { id: number; content: unknown[] },
  ) {
    const row = await this.requireRow(user, kind, Number(body.id));
    const tree = assertElementTree(body.content ?? []);
    await this.store(kind).update(row.id, { body: toJsonInput(tree) });
    return this.detail(user, kind, row.id);
  }

  async publish(user: CurrentUser, kind: GeoSiteContentKind, id: number) {
    const row = await this.requireRow(user, kind, Number(id));
    const tree = assertElementTree(row.body);
    if (!tree.length) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `${kind === 'article' ? '文章' : '产品'}正文还是空的，先写内容再发布`,
      );
    }
    await this.store(kind).update(row.id, {
      status: 'PUBLISHED',
      body: toJsonInput(tree),
      publishedAt: row.publishedAt ?? new Date(),
    });
    // 内容发布同样留痕：文章/产品是「发上去就能被搜到」的东西，出问题时要有时间线
    await writeGeoSitePublishLog(this.prisma, user, {
      siteId: row.siteId,
      ownerUserId: row.ownerUserId,
      target: kind === 'article' ? 'ARTICLE' : 'PRODUCT',
      targetId: row.id,
      label: `${row.title}（/${row.slug}）`,
      note: `${tree.length} 个正文区块`,
    });
    return this.detail(user, kind, row.id);
  }

  async offline(user: CurrentUser, kind: GeoSiteContentKind, id: number) {
    const row = await this.requireRow(user, kind, Number(id));
    await this.store(kind).update(row.id, { status: 'OFFLINE' });
    await writeGeoSitePublishLog(this.prisma, user, {
      siteId: row.siteId,
      ownerUserId: row.ownerUserId,
      target: kind === 'article' ? 'ARTICLE' : 'PRODUCT',
      targetId: row.id,
      label: `${row.title}（/${row.slug}）`,
      note: '内容下线：详情页转占位页并从站点地图移除',
    });
    return this.detail(user, kind, row.id);
  }

  async remove(user: CurrentUser, kind: GeoSiteContentKind, id: number) {
    const row = await this.requireRow(user, kind, Number(id));
    const targetType = kind === 'article' ? 'ARTICLE' : 'PRODUCT';
    // 先清指向它的菜单再删内容：菜单目标解析不到时公开渲染会直接跳过该项，
    // 因此中途失败最多留下一个不显示的菜单，不会出现可点的死链。
    await this.prisma.geoSiteMenuItem.deleteMany({
      where: { siteId: row.siteId, targetType, targetId: row.id },
    });
    if (kind === 'article') {
      await this.prisma.geoSiteArticle.delete({ where: { id: row.id } });
    } else {
      await this.prisma.geoSiteProduct.delete({ where: { id: row.id } });
    }
    return { ok: true, message: '内容已删除' };
  }

  /* ---------------------------- 公开侧读 ---------------------------- */

  /** 公开列表：只认已发布，排序按发布时间倒序（sort 大的置顶）。 */
  async publicList(
    kind: GeoSiteContentKind,
    siteId: number,
    opts: {
      limit: number;
      offset: number;
      category?: string;
      tag?: string;
      lang?: string;
    },
  ) {
    const where: Record<string, unknown> = { siteId, status: 'PUBLISHED' };
    if (opts.lang) where.lang = opts.lang;
    if (opts.category) where.category = clipText(opts.category, 60);
    if (opts.tag) where.tags = { array_contains: clipText(opts.tag, 30) };
    const store = this.store(kind);
    const [rows, total] = await Promise.all([
      store.findMany({
        where,
        orderBy: [{ sort: 'desc' }, { publishedAt: 'desc' }],
        skip: opts.offset,
        take: opts.limit,
      }),
      store.count(where),
    ]);
    return { rows, total };
  }

  async publicBySlug(
    kind: GeoSiteContentKind,
    siteId: number,
    slug: string,
    lang?: string,
  ): Promise<ContentRow | null> {
    const where: Record<string, unknown> = {
      siteId,
      slug,
      status: 'PUBLISHED',
    };
    if (lang) where.lang = lang;
    const row = await this.store(kind).findFirst({ where });
    return row ?? null;
  }

  async publicByIds(
    kind: GeoSiteContentKind,
    siteId: number,
    ids: number[],
    lang?: string,
  ): Promise<ContentRow[]> {
    if (!ids.length) return [];
    const where: Record<string, unknown> = {
      siteId,
      id: { in: ids },
      status: 'PUBLISHED',
    };
    if (lang) where.lang = lang;
    return this.store(kind).findMany({
      where,
      take: ids.length,
    });
  }

  /** 浏览计数：公开页每次渲染点一次，增量写不做读回，失败也不影响出页。 */
  async touchView(kind: GeoSiteContentKind, id: number): Promise<void> {
    try {
      await this.store(kind).incView(id);
    } catch {
      // 计数是尽力而为的统计口径，绝不能把公开页打挂
    }
  }

  /* ---------------------------- 内部 ---------------------------- */

  /** 语言必须已启用：内容库列表/详情按语言隔离，避免把未启用语言的条目写进站点。 */
  private langOf(
    site: { defaultLanguage: string; languages: unknown },
    value: unknown,
  ): string {
    const def = normalizeLanguage(site.defaultLanguage);
    const lang = normalizeLanguage(value, def);
    if (!normalizeLanguageList(site.languages, def).includes(lang)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `站点未启用「${GEO_SITE_LANGUAGE_LABELS[lang] || lang}」：请先在「站点设置 · 多语言」勾选该语言`,
      );
    }
    return lang;
  }

  private normalizeKind(value: unknown): GeoSiteContentKind {
    const kind = clipText(value, 10).toLowerCase();
    if (!KINDS.has(kind)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '内容类型只支持 article（文章）与 product（产品）',
      );
    }
    return kind as GeoSiteContentKind;
  }

  /** 供控制器把外部 kind 参数收敛成联合类型（非法值报 400，不带进 SQL）。 */
  parseKind(value: unknown): GeoSiteContentKind {
    return this.normalizeKind(value);
  }

  private async requireRow(
    user: CurrentUser,
    kind: GeoSiteContentKind,
    id: number,
  ): Promise<ContentRow> {
    const row = await this.store(kind).findFirst({ where: { id } });
    if (!row) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        kind === 'article' ? '文章不存在' : '产品不存在',
      );
    }
    await this.sites.requireSite(user, row.siteId);
    return row;
  }

  private applyKindFields(
    kind: GeoSiteContentKind,
    data: Record<string, unknown>,
    body: Record<string, unknown>,
  ) {
    if (kind === 'article') {
      if (body.authorName !== undefined) {
        data.authorName = clipText(body.authorName, 60);
      }
      if (body.relatedIds !== undefined) {
        data.relatedIds = toJsonInput(normalizeIdList(body.relatedIds, 12));
      }
      return;
    }
    if (body.price !== undefined) data.price = normalizePrice(body.price);
    if (body.unit !== undefined) data.unit = clipText(body.unit, 20);
    if (body.priceOnAsk !== undefined)
      data.priceOnAsk = body.priceOnAsk ? 1 : 0;
    if (body.specs !== undefined)
      data.specs = toJsonInput(normalizeSpecList(body.specs));
    if (body.buyUrl !== undefined) {
      const url = safeSiteUrl(body.buyUrl);
      if (clipText(body.buyUrl, 1) && !url) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '购买/咨询链接只支持 http(s) 地址或站内相对路径',
        );
      }
      data.buyUrl = url || '';
    }
    if (body.featured !== undefined) data.featured = body.featured ? 1 : 0;
  }

  /** slug 唯一：同站点同语言内不撞车；换语言时按目标语言重新判重。 */
  private async uniqueSlug(
    kind: GeoSiteContentKind,
    siteId: number,
    lang: string,
    raw: unknown,
    title: string,
    currentId?: number,
  ): Promise<string> {
    const store = this.store(kind);
    const given = raw !== undefined && toText(raw).trim();
    if (given) {
      const slug = normalizeContentSlug(raw);
      const conflict = await store.findFirst({
        where: {
          siteId,
          lang,
          slug,
          ...(currentId ? { id: { not: currentId } } : {}),
        },
      });
      if (conflict) {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          `标识 ${slug} 已被「${conflict.title}」占用，换一个`,
        );
      }
      return slug;
    }
    const seed = slugSeed(title);
    for (let i = 0; i < 60; i += 1) {
      const slug = i ? `${seed}-${i + 1}` : seed;
      // 唯一键限长 191，这里留足余量；超出说明标题退化，直接用序号形态
      if (slug.length > 80) continue;
      if (!(await store.findFirst({ where: { siteId, lang, slug } }))) {
        return slug;
      }
    }
    return `${seed}-${Date.now().toString(36)}`.slice(0, 80);
  }

  private store(kind: GeoSiteContentKind): ContentStore {
    const prisma = this.prisma;
    if (kind === 'article') {
      const table = prisma.geoSiteArticle;
      return {
        findMany: async (args) =>
          asRows(
            await table.findMany(args as Prisma.GeoSiteArticleFindManyArgs),
          ),
        findFirst: async (args) =>
          await table.findFirst(args as Prisma.GeoSiteArticleFindManyArgs),
        count: async (where) => table.count({ where }),
        create: async (data) =>
          await table.create({
            data: data as Prisma.GeoSiteArticleCreateInput,
          }),
        update: async (id, data) => {
          await table.update({
            where: { id },
            data: data,
          });
        },
        incView: async (id) => {
          await table.update({
            where: { id },
            data: { viewCount: { increment: 1 } },
          });
        },
      };
    }
    const table = prisma.geoSiteProduct;
    return {
      findMany: async (args) =>
        asRows(await table.findMany(args as Prisma.GeoSiteProductFindManyArgs)),
      findFirst: async (args) =>
        await table.findFirst(args as Prisma.GeoSiteProductFindManyArgs),
      count: async (where) => table.count({ where }),
      create: async (data) =>
        await table.create({
          data: data as Prisma.GeoSiteProductCreateInput,
        }),
      update: async (id, data) => {
        await table.update({
          where: { id },
          data: data,
        });
      },
      incView: async (id) => {
        await table.update({
          where: { id },
          data: { viewCount: { increment: 1 } },
        });
      },
    };
  }
}

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** slug 兜底：非 ASCII 标题（中文为主）退化成 c-{id} 形态前先给一个可读前缀。 */
function slugSeed(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || `c-${Date.now().toString(36)}`;
}
