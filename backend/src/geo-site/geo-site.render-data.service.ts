import type { Prisma } from '../../generated/prisma';
import type {
  GeoSiteRenderCard,
  GeoSiteRenderContext,
  GeoSiteRenderNav,
  GeoSiteRenderScript,
} from './geo-site.render.service';
import { seoViewOf } from './geo-site.render.service';
import { GeoSiteContentService } from './geo-site-content.service';
import {
  GeoSiteMenuService,
  type GeoSiteMenuNode,
} from './geo-site-menu.service';
import { GeoSiteSettingsService } from './geo-site.settings.service';
import { pageTemplateElements } from './geo-site-page.templates';
import { PrismaService } from '../prisma/prisma.service';
import {
  GEO_SITE_CONTENT_PREFIX,
  GEO_SITE_LANGUAGE_LABELS,
  languageHref,
  normalizeLanguage,
  normalizeLanguageList,
  normalizeScriptEntries,
  splitLanguagePath,
  type GeoSiteElement,
  toText,
} from './geo-site.shared';

/**
 * 公开页取数装配：把「一次页面请求」要用的导航、列表、详情、脚本一次性批量取齐，
 * 交给渲染层。渲染层因此完全不碰数据库——SQL 次数与页面元素数量无关，只与页面类型有关：
 * 站点 1 次 + 已发布页面 1 次 + （列表页）内容 2 次 + （详情页）内容 1-2 次。
 *
 * 三条口径：
 * 1) 只读已发布快照（published*），草稿永不外泄；
 * 2) 导航链接按当前访问域名现算，绝不把绝对地址钉进库里；
 * 3) 第三方脚本只在独立域名/泛子域投递时注入，本站路径下永远不带。
 */

export type GeoSiteContentKind = 'article' | 'product';

export type GeoSiteDelivery =
  | {
      status: 'ok';
      /** 渲染元素树：页面快照，或内容详情套站点详情模板 */
      elements: GeoSiteElement[];
      seo: ReturnType<typeof seoViewOf>;
      context: GeoSiteRenderContext;
      pageTitle: string;
      /** 站内路径（'' = 首页，blog/xxx = 文章详情） */
      pagePath: string;
      publishedAt: Date | null;
      /** 实际渲染语言：决定 <html lang>、og:locale 与 hreflang */
      lang: string;
      /** 同页其他语言版本 + x-default */
      alternates: { lang: string; href: string }[];
      /** 内容详情页才带：渲染成功后由调用方累加浏览数 */
      viewTarget: { kind: GeoSiteContentKind; id: number } | null;
    }
  | { status: 'not_found'; reason: string };

type SiteRow = {
  id: number;
  slug: string;
  title: string;
  status: string;
  favicon: string;
  defaultLanguage: string;
  languages: Prisma.JsonValue;
  publishedContent: Prisma.JsonValue;
  publishedSeo: Prisma.JsonValue;
  publishedMenus: Prisma.JsonValue;
  scriptsEnabled: number;
  publishedAt: Date | null;
};

type PageRow = {
  id: number;
  path: string;
  lang: string;
  title: string;
  kind: string;
  contentType: string;
  pageSize: number;
  status: string;
  publishedContent: Prisma.JsonValue;
  publishedSeo: Prisma.JsonValue;
  publishedScripts: Prisma.JsonValue;
  publishedAt: Date | null;
};

type ContentRow = {
  id: number;
  title: string;
  slug: string;
  lang: string;
  summary: string;
  category: string;
  coverImage: string;
  tags: unknown;
  faqs: unknown;
  relatedIds: unknown;
  seo: unknown;
  body?: Prisma.JsonValue;
  gallery?: Prisma.JsonValue;
  authorName?: string;
  viewCount?: number;
  price?: unknown;
  unit?: string;
  priceOnAsk?: number;
  specs?: unknown;
  buyUrl?: string;
  publishedAt: Date | null;
};

const SITE_SELECT = {
  id: true,
  slug: true,
  title: true,
  status: true,
  favicon: true,
  defaultLanguage: true,
  languages: true,
  publishedContent: true,
  publishedSeo: true,
  publishedMenus: true,
  scriptsEnabled: true,
  publishedAt: true,
} as const;

const PAGE_SELECT = {
  id: true,
  path: true,
  lang: true,
  title: true,
  kind: true,
  contentType: true,
  pageSize: true,
  status: true,
  publishedContent: true,
  publishedSeo: true,
  publishedScripts: true,
  publishedAt: true,
} as const;

const LIST_TYPES = new Set([
  'postList',
  'postGrid',
  'productList',
  'productGrid',
]);
const DETAIL_TYPES = new Set([
  'articleBody',
  'articleMeta',
  'productInfo',
  'relatedPosts',
]);

function elementsOf(value: unknown): GeoSiteElement[] {
  return Array.isArray(value) ? (value as GeoSiteElement[]) : [];
}

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isoDate(value: Date | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function strArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === 'string' ? item : ''))
        .filter(Boolean)
        .slice(0, 20)
    : [];
}

function intArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item) && item > 0)
        .slice(0, 20)
    : [];
}

function specArray(value: unknown): { name: string; value: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 40)
    .map((item) => {
      const raw = objectOf(item);
      return {
        name: toText(raw.name).slice(0, 60),
        value: toText(raw.value).slice(0, 300),
      };
    })
    .filter((item) => item.name);
}

function faqArray(value: unknown): { question: string; answer: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 30)
    .map((item) => {
      const raw = objectOf(item);
      return {
        question: toText(raw.question).slice(0, 300),
        answer: toText(raw.answer).slice(0, 2000),
      };
    })
    .filter((item) => item.question && item.answer);
}

function priceText(row: ContentRow): string {
  const num = Number(row.price ?? 0);
  if (!Number.isFinite(num) || num <= 0) return '';
  return Number.isInteger(num) ? `¥${num}` : `¥${num.toFixed(2)}`;
}

/** 元素树里是否出现某类动态元素：决定要不要为它取列表/详情数据。 */
function hasAnyType(elements: GeoSiteElement[], types: Set<string>): boolean {
  for (const element of elements) {
    if (!element || typeof element !== 'object') continue;
    if (types.has(String(element.type || ''))) return true;
    if (Array.isArray(element.content) && hasAnyType(element.content, types)) {
      return true;
    }
  }
  return false;
}

/**
 * 树里用到的列表内容类型：区块名自带 product 的算产品，其余列表区块算文章。
 * 站长在同一页混放两类区块时这里会给出两个类型，取数就各取一次（最多两条查询）。
 */
function listKindsUsed(
  elements: GeoSiteElement[],
  fallback: 'article' | 'product',
): Set<'article' | 'product'> {
  const kinds = new Set<'article' | 'product'>();
  const walk = (list: GeoSiteElement[]) => {
    for (const element of list) {
      if (!element || typeof element !== 'object') continue;
      const type = String(element.type || '');
      if (LIST_TYPES.has(type))
        kinds.add(type.startsWith('product') ? 'product' : 'article');
      if (Array.isArray(element.content)) walk(element.content);
    }
  };
  walk(elements);
  // 只放了区块但页面本身有内容类型时，按页面类型补一份，模板页不用改区块名也能出数
  if (!kinds.size && hasAnyType(elements, LIST_TYPES)) kinds.add(fallback);
  return kinds;
}

/** 菜单目标 → 绝对链接：按目标内容自己的语言出地址，缺翻译时自然落回默认语言版本。 */
type LinkTable = {
  base: string;
  pageHrefById: Map<number, string>;
  contentHrefById: Map<GeoSiteContentKind, Map<number, string>>;
  defaultHomeHref: string;
};

function hrefOfNode(node: GeoSiteMenuNode, table: LinkTable): string {
  const { base } = table;
  if (node.targetType === 'ANCHOR') return node.url || '#';
  if (node.targetType === 'URL') return node.url || base;
  if (node.targetType === 'PAGE') {
    return table.pageHrefById.get(node.targetId) ?? table.defaultHomeHref;
  }
  const kind: GeoSiteContentKind =
    node.targetType === 'PRODUCT' ? 'product' : 'article';
  const prefix = GEO_SITE_CONTENT_PREFIX[kind];
  return (
    table.contentHrefById.get(kind)?.get(node.targetId) ?? `${base}/${prefix}`
  );
}

export class GeoSiteRenderDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: GeoSiteSettingsService,
    private readonly content: GeoSiteContentService,
  ) {}

  /**
   * @param base 站点绝对根地址（不带结尾斜杠），站内路径直接拼在其后
   * @param path 站内路径（'' = 首页），调用方已剥掉站点前缀与首尾斜杠
   * @param fromHost 是否由独立域名/泛子域投递——第三方脚本只认这种形态
   */
  async resolve(input: {
    siteId: number;
    base: string;
    path: string;
    page?: number;
    pageSize?: number;
    fromHost: boolean;
  }): Promise<GeoSiteDelivery> {
    const site = await this.prisma.geoSite.findUnique({
      where: { id: Number(input.siteId) },
      select: SITE_SELECT,
    });
    if (!site) return { status: 'not_found', reason: '站点不存在' };
    if (site.status !== 'PUBLISHED') {
      return { status: 'not_found', reason: '站点尚未发布' };
    }

    const pages = (await this.prisma.geoSitePage.findMany({
      where: { siteId: site.id, status: 'PUBLISHED' },
      select: PAGE_SELECT,
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    })) as PageRow[];
    const base = input.base.replace(/\/+$/, '');
    const defaultLanguage = normalizeLanguage(site.defaultLanguage);
    const languages = normalizeLanguageList(site.languages, defaultLanguage);
    const parsed = splitLanguagePath(input.path, languages, defaultLanguage);
    const lang = parsed.lang;
    const prefix = parsed.prefix;
    const path = parsed.rest;
    const byPath = new Map(
      pages
        .filter((row) => normalizeLanguage(row.lang, defaultLanguage) === lang)
        .map((row) => [row.path, row]),
    );

    const articlePrefix = `${GEO_SITE_CONTENT_PREFIX.article}/`;
    const productPrefix = `${GEO_SITE_CONTENT_PREFIX.product}/`;
    if (path.startsWith(articlePrefix) || path.startsWith(productPrefix)) {
      const kind: GeoSiteContentKind = path.startsWith(articlePrefix)
        ? 'article'
        : 'product';
      const slug = path.slice(articlePrefix.length).replace(/\/+$/, '');
      return this.renderDetail({
        site,
        pages,
        kind,
        slug,
        base,
        lang,
        prefix,
        fromHost: input.fromHost,
      });
    }

    const page = (path ? byPath.get(path) : byPath.get('')) ?? null;
    if (path && !page) {
      return { status: 'not_found', reason: '页面不存在或未发布' };
    }
    if (!path && !page && lang !== defaultLanguage) {
      return {
        status: 'not_found',
        reason: '该语言还没有首页，请切换到其他语言',
      };
    }
    // 存量站点没有页面行：继续用站点列的整站快照，行为与升级前完全一致
    const elements = page
      ? elementsOf(page.publishedContent)
      : elementsOf(site.publishedContent);
    if (!elements.length) {
      return { status: 'not_found', reason: '页面还没有内容' };
    }
    const alternates = this.alternatesOf({
      pages,
      base,
      path: page?.path ?? '',
      languages,
      defaultLanguage,
    });
    const table = await this.linkTable({ site, pages, base, elements: null });
    const context = await this.contextOf({
      site,
      page,
      elements,
      base,
      lang,
      prefix,
      pages,
      fromHost: input.fromHost,
      pageIndex: Math.max(1, Number(input.page || 1) || 1),
      table,
    });
    const seoBase = seoViewOf(page ? page.publishedSeo : site.publishedSeo);
    return {
      status: 'ok',
      elements,
      seo: {
        ...seoBase,
        lang,
        title: seoBase.title || page?.title || site.title,
      },
      context,
      pageTitle: page?.title || site.title,
      pagePath: [prefix, page?.path ?? ''].filter(Boolean).join('/'),
      lang,
      alternates,
      publishedAt: page?.publishedAt ?? site.publishedAt,
      viewTarget: null,
    };
  }

  /** 详情页：内容行 + 站点里对应的详情模板页（站长没建就用内置骨架）。 */
  private async renderDetail(input: {
    site: SiteRow;
    pages: PageRow[];
    kind: GeoSiteContentKind;
    slug: string;
    base: string;
    lang: string;
    prefix: string;
    fromHost: boolean;
  }): Promise<GeoSiteDelivery> {
    const { site, kind, base, lang } = input;
    const defaultLanguage = normalizeLanguage(site.defaultLanguage);
    if (!input.slug || input.slug.length > 120) {
      return { status: 'not_found', reason: '内容不存在' };
    }
    const row = (await this.content.publicBySlug(
      kind,
      site.id,
      input.slug,
      lang,
    )) as ContentRow | null;
    if (!row) return { status: 'not_found', reason: '内容不存在或未发布' };

    const shell =
      input.pages.find(
        (item) =>
          normalizeLanguage(item.lang, defaultLanguage) === lang &&
          (kind === 'article'
            ? item.kind === 'articleDetail'
            : item.kind === 'productDetail'),
      ) ?? null;
    const elements = shell
      ? elementsOf(shell.publishedContent)
      : fallbackShell(kind);
    if (!elements.length) {
      return { status: 'not_found', reason: '详情页还没有模板' };
    }
    const card = this.cardOf(kind, row, base, defaultLanguage);
    const relatedIds =
      kind === 'article'
        ? intArray(row.relatedIds)
        : intArray(objectOf(row.relatedIds).article);
    const relatedRows = relatedIds.length
      ? ((await this.content.publicByIds(
          kind,
          site.id,
          relatedIds,
          lang,
        )) as ContentRow[])
      : [];
    const table = await this.linkTable({
      site,
      pages: input.pages,
      base,
      extraIds: {
        article: kind === 'article' ? [row.id, ...relatedIds] : [],
        product: kind === 'product' ? [row.id, ...relatedIds] : [],
      },
    });
    const context = await this.contextOf({
      site,
      page: shell,
      elements,
      base,
      lang,
      prefix: input.prefix,
      pages: input.pages,
      fromHost: input.fromHost,
      pageIndex: 1,
      table,
      detail: card,
      related: relatedRows.map((item) =>
        this.cardOf(kind, item, base, defaultLanguage),
      ),
    });
    const siteSeo = seoViewOf(site.publishedSeo);
    const own = seoViewOf({ ...objectOf(row.seo), title: undefined });
    return {
      status: 'ok',
      elements,
      seo: {
        ...siteSeo,
        lang,
        title: own.title || row.title,
        description: own.description || row.summary || row.title,
        keywords: own.keywords.length ? own.keywords : strArray(row.tags),
        ogImage: own.ogImage || row.coverImage || siteSeo.ogImage,
        jsonld: {
          ...siteSeo.jsonld,
          // 详情页的结构化数据按内容类型切换：产品出 Product，文章靠正文 FAQ
          product: kind === 'product' ? true : siteSeo.jsonld.product,
          faq: faqArray(row.faqs).length > 0 || siteSeo.jsonld.faq,
        },
      },
      context,
      pageTitle: row.title,
      pagePath: [input.prefix, `${GEO_SITE_CONTENT_PREFIX[kind]}/${row.slug}`]
        .filter(Boolean)
        .join('/'),
      lang,
      alternates: [],
      publishedAt: row.publishedAt,
      viewTarget: { kind, id: row.id },
    };
  }

  private cardOf(
    kind: GeoSiteContentKind,
    row: ContentRow,
    base: string,
    defaultLanguage: string,
  ): GeoSiteRenderCard {
    const prefix = GEO_SITE_CONTENT_PREFIX[kind];
    return {
      kind,
      id: row.id,
      slug: row.slug,
      title: row.title,
      href: languageHref(
        base,
        `${prefix}/${row.slug}`,
        row.lang,
        defaultLanguage,
      ),
      summary: row.summary,
      cover: row.coverImage,
      date: isoDate(row.publishedAt),
      category: row.category,
      tags: strArray(row.tags),
      author: row.authorName || '',
      views: Number(row.viewCount ?? 0) || 0,
      price: kind === 'product' ? priceText(row) : '',
      unit: kind === 'product' ? String(row.unit || '') : '',
      priceOnAsk: kind === 'product' ? row.priceOnAsk === 1 : false,
      specs: kind === 'product' ? specArray(row.specs) : [],
      buyUrl: kind === 'product' ? String(row.buyUrl || '') : '',
      faqs: faqArray(row.faqs),
      elements: elementsOf(row.body),
    };
  }

  /**
   * 链接表：页面路径来自已发布页面，内容 slug 只在导航/相关推荐真的引用时才查，
   * 一次请求最多两条内容查询，避免为导航把整张内容表读进内存。
   */
  private async linkTable(opts: {
    site: SiteRow;
    pages: PageRow[];
    base: string;
    elements?: GeoSiteElement[] | null;
    extraIds?: Partial<Record<GeoSiteContentKind, number[]>>;
  }): Promise<LinkTable> {
    const nodes = GeoSiteMenuService.deserialize(opts.site.publishedMenus);
    const wanted: Record<GeoSiteContentKind, Set<number>> = {
      article: new Set(opts.extraIds?.article || []),
      product: new Set(opts.extraIds?.product || []),
    };
    const walk = (list: GeoSiteMenuNode[]) => {
      for (const node of list) {
        if (node.targetType === 'ARTICLE') wanted.article.add(node.targetId);
        if (node.targetType === 'PRODUCT') wanted.product.add(node.targetId);
        walk(node.children || []);
      }
    };
    walk(nodes);
    const defaultLanguage = normalizeLanguage(opts.site.defaultLanguage);
    const contentHrefById = new Map<GeoSiteContentKind, Map<number, string>>();
    for (const kind of ['article', 'product'] as GeoSiteContentKind[]) {
      const ids = [...wanted[kind]].filter((id) => id > 0);
      const map = new Map<number, string>();
      if (ids.length) {
        const rows = (await this.content.publicByIds(
          kind,
          opts.site.id,
          ids,
        )) as ContentRow[];
        for (const row of rows) {
          map.set(
            row.id,
            languageHref(
              opts.base,
              `${GEO_SITE_CONTENT_PREFIX[kind]}/${row.slug}`,
              row.lang,
              defaultLanguage,
            ),
          );
        }
      }
      contentHrefById.set(kind, map);
    }
    return {
      base: opts.base,
      pageHrefById: new Map(
        opts.pages.map((row) => [
          row.id,
          languageHref(opts.base, row.path, row.lang, defaultLanguage),
        ]),
      ),
      contentHrefById,
      defaultHomeHref: `${opts.base}/`,
    };
  }

  /** 组装渲染上下文：导航 + 列表 + 详情 + 脚本。 */
  private async contextOf(input: {
    site: SiteRow;
    page: PageRow | null;
    elements: GeoSiteElement[];
    base: string;
    lang: string;
    prefix: string;
    pages: PageRow[];
    fromHost: boolean;
    pageIndex: number;
    table: LinkTable;
    detail?: GeoSiteRenderCard | null;
    related?: GeoSiteRenderCard[];
  }): Promise<GeoSiteRenderContext> {
    const defaultLanguage = normalizeLanguage(input.site.defaultLanguage);
    const { nav, footerNav } = this.navOf(
      input.site,
      input.table,
      input.lang,
      defaultLanguage,
    );
    const pageKind =
      input.page?.contentType === 'product' ? 'product' : 'article';
    const listKinds = listKindsUsed(input.elements, pageKind);
    const detailWanted =
      Boolean(input.detail) || hasAnyType(input.elements, DETAIL_TYPES);
    let list: GeoSiteRenderCard[] | undefined;
    let pager: GeoSiteRenderContext['pager'] = null;
    const listsByKind: GeoSiteRenderContext['listsByKind'] = {
      article: { list: [], pager: null },
      product: { list: [], pager: null },
    };
    if (listKinds.size) {
      const boxed = await Promise.all(
        [...listKinds].map((kind) =>
          this.listCards({
            site: input.site,
            kind,
            base: input.base,
            lang: input.lang,
            pageSize: clampPageSize(input.page?.pageSize),
            pageIndex: input.pageIndex,
          }),
        ),
      );
      [...listKinds].forEach((kind, index) => {
        listsByKind[kind] = boxed[index];
      });
      // 老口径保留：页面自身类型的列表仍是 ctx.list
      const primary = listsByKind[pageKind];
      list = primary.list;
      pager = primary.pager;
    }
    const currentDetailPath = input.detail
      ? `${GEO_SITE_CONTENT_PREFIX[input.detail.kind]}/${
          input.detail.slug || ''
        }`
      : '';
    return {
      nav,
      footerNav,
      homeHref: languageHref(input.base, '', input.lang, defaultLanguage),
      // 整站文件（llms.txt）固定挂默认语言根路径，不随当前语言变
      siteHref: languageHref(input.base, '', defaultLanguage, defaultLanguage),
      brand: input.site.title,
      page: input.page
        ? {
            title: input.page.title,
            path: input.page.path,
            kind: input.page.kind,
          }
        : null,
      list,
      pager,
      listsByKind,
      detail: detailWanted ? (input.detail ?? null) : null,
      related: input.related,
      crumbs: [],
      scripts: await this.scriptsOf(input.site, input.page, input.fromHost),
      languages: this.languagesFor({
        site: input.site,
        pages: input.pages,
        base: input.base,
        lang: input.lang,
        path: input.page?.path ?? '',
        // 详情页按内容自己的地址作为当前语言链接，避免切回自己时掉到首页
        currentHref:
          input.detail && currentDetailPath
            ? languageHref(
                input.base,
                currentDetailPath,
                input.lang,
                defaultLanguage,
              )
            : '',
      }),
    };
  }

  /** 列表取数：一页一次 findMany + count，第 1 页回到列表页本身。 */
  private async listCards(opts: {
    site: SiteRow;
    kind: GeoSiteContentKind;
    base: string;
    lang: string;
    pageSize: number;
    pageIndex: number;
  }): Promise<{
    list: GeoSiteRenderCard[];
    pager: GeoSiteRenderContext['pager'];
  }> {
    const prefix = GEO_SITE_CONTENT_PREFIX[opts.kind];
    const defaultLanguage = normalizeLanguage(opts.site.defaultLanguage);
    const { rows, total } = await this.content.publicList(
      opts.kind,
      opts.site.id,
      {
        limit: opts.pageSize,
        offset: (opts.pageIndex - 1) * opts.pageSize,
        lang: opts.lang,
      },
    );
    const totalPages = Math.max(
      1,
      Math.ceil(total / Math.max(1, opts.pageSize)),
    );
    return {
      list: (rows as ContentRow[]).map((row) =>
        this.cardOf(opts.kind, row, opts.base, defaultLanguage),
      ),
      pager: {
        page: Math.min(opts.pageIndex, totalPages),
        pageSize: opts.pageSize,
        total,
        totalPages,
        hrefOf: (page: number) => {
          const href = languageHref(
            opts.base,
            prefix,
            opts.lang,
            defaultLanguage,
          );
          return page <= 1 ? href : `${href}?page=${page}`;
        },
      },
    };
  }

  /**
   * 脚本三闸门：平台总开关 → 站点开关 → 仅独立域名/泛子域投递。
   * 再过一次白名单：平台收紧之后，线上快照里的旧脚本即刻停止注入。
   */
  private async scriptsOf(
    site: SiteRow,
    page: PageRow | null,
    fromHost: boolean,
  ): Promise<GeoSiteRenderScript[]> {
    if (!fromHost || site.scriptsEnabled !== 1) return [];
    const settings = await this.settings.view();
    if (!settings.customScriptEnabled) return [];
    const raw = page?.publishedScripts ?? [];
    const { accepted } = normalizeScriptEntries(
      Array.isArray(raw) ? raw : [],
      settings.scriptHostWhitelist,
    );
    return accepted.slice(0, settings.maxScriptsPerPage).map((item) => ({
      src: item.src,
      host: item.host,
      position:
        item.position === 'head' ? ('head' as const) : ('body' as const),
    }));
  }

  /**
   * 全站 sitemap 条目：已发布页面 + 已发布内容详情（含封面图）。
   * 每种最多 500 条，超出部分不进 sitemap——搜索引擎对超大 sitemap 的抓取效率反而更低。
   */
  async sitemapEntries(
    siteId: number,
    base: string,
  ): Promise<
    {
      loc: string;
      lastmod?: Date | null;
      changefreq?: string;
      priority?: string;
      images?: string[];
    }[]
  > {
    const root = base.replace(/\/+$/, '');
    const site = await this.prisma.geoSite.findUnique({
      where: { id: siteId },
      select: { defaultLanguage: true, languages: true },
    });
    const defaultLanguage = normalizeLanguage(site?.defaultLanguage);
    const languages = normalizeLanguageList(site?.languages, defaultLanguage);
    const pages = await this.prisma.geoSitePage.findMany({
      where: { siteId, status: 'PUBLISHED' },
      select: {
        path: true,
        lang: true,
        publishedAt: true,
        publishedContent: true,
      },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      take: 500,
    });
    const out: {
      loc: string;
      lastmod?: Date | null;
      changefreq?: string;
      priority?: string;
      images?: string[];
    }[] = pages.map((row) => ({
      loc: languageHref(root, row.path, row.lang, defaultLanguage),
      lastmod: row.publishedAt,
      changefreq: row.path ? 'weekly' : 'daily',
      priority: row.path ? '0.7' : '1.0',
    }));
    for (const lang of languages) {
      for (const kind of ['article', 'product'] as GeoSiteContentKind[]) {
        const { rows } = await this.content.publicList(kind, siteId, {
          limit: 500,
          offset: 0,
          lang,
        });
        const prefix = GEO_SITE_CONTENT_PREFIX[kind];
        for (const row of rows as ContentRow[]) {
          const cover = String(row.coverImage || '');
          out.push({
            loc: languageHref(
              root,
              `${prefix}/${row.slug}`,
              lang,
              defaultLanguage,
            ),
            lastmod: row.publishedAt,
            changefreq: kind === 'product' ? 'weekly' : 'monthly',
            priority: kind === 'product' ? '0.8' : '0.6',
            images: cover ? [cover] : undefined,
          });
        }
      }
    }
    return out;
  }

  /** 导航：读站点发布快照，按位置分栏；当前语言没有该位置菜单时回落默认语言。 */
  private navOf(
    site: SiteRow,
    table: LinkTable,
    lang: string,
    defaultLanguage: string,
  ): { nav: GeoSiteRenderNav[]; footerNav: GeoSiteRenderNav[] } {
    const nodes = GeoSiteMenuService.deserialize(site.publishedMenus);
    const map = (list: GeoSiteMenuNode[]): GeoSiteRenderNav[] =>
      list.map((node) => ({
        label: node.label,
        href: hrefOfNode(node, table),
        newTab: node.newTab,
        external: node.targetType === 'URL',
        children: map(node.children || []),
      }));
    const pick = (location: string) => {
      const localized = nodes.filter(
        (node) =>
          node.location === location &&
          normalizeLanguage(node.lang, defaultLanguage) === lang,
      );
      if (localized.length) return localized;
      // 快照里的老菜单没有 lang 字段：按默认语言处理，正好作为回落
      return nodes.filter(
        (node) =>
          node.location === location &&
          normalizeLanguage(node.lang, defaultLanguage) === defaultLanguage,
      );
    };
    return {
      nav: map(pick('HEADER')),
      footerNav: map(pick('FOOTER')),
    };
  }

  /** 同页各语言版本 → hreflang；x-default 指向默认语言版本。 */
  private alternatesOf(opts: {
    pages: PageRow[];
    base: string;
    path: string;
    languages: string[];
    defaultLanguage: string;
  }): { lang: string; href: string }[] {
    if (opts.languages.length < 2) return [];
    const out: { lang: string; href: string }[] = [];
    for (const code of opts.languages) {
      const page = opts.pages.find(
        (row) =>
          normalizeLanguage(row.lang, opts.defaultLanguage) === code &&
          row.path === opts.path,
      );
      if (!page) continue;
      out.push({
        lang: code,
        href: languageHref(opts.base, page.path, code, opts.defaultLanguage),
      });
    }
    // 只有一个版本时 hreflang 没有意义，不如不输出
    if (out.length < 2) return [];
    const fallback = out.find((item) => item.lang === opts.defaultLanguage);
    if (fallback) out.push({ lang: 'x-default', href: fallback.href });
    return out;
  }

  /** 语言切换目标：优先当前页翻译，其次该语言首页；两者都没有则不展示该语言。 */
  private languagesFor(opts: {
    site: SiteRow;
    pages: PageRow[];
    base: string;
    lang: string;
    path: string;
    currentHref: string;
  }) {
    const defaultLanguage = normalizeLanguage(opts.site.defaultLanguage);
    return normalizeLanguageList(opts.site.languages, defaultLanguage).flatMap(
      (code) => {
        const page = opts.pages.find(
          (row) =>
            normalizeLanguage(row.lang, defaultLanguage) === code &&
            row.path === opts.path,
        );
        const home = opts.pages.find(
          (row) =>
            normalizeLanguage(row.lang, defaultLanguage) === code &&
            row.path === '',
        );
        const href =
          code === opts.lang && opts.currentHref
            ? opts.currentHref
            : page
              ? languageHref(opts.base, page.path, code, defaultLanguage)
              : home
                ? languageHref(opts.base, '', code, defaultLanguage)
                : '';
        if (!href) return [];
        return [
          {
            code,
            label: GEO_SITE_LANGUAGE_LABELS[code] || code,
            href,
            current: code === opts.lang,
          },
        ];
      },
    );
  }
}

/** 站长没建详情模板时的兜底：直接用内置的文章/产品详情版式，内容一定出得来。 */
function fallbackShell(kind: GeoSiteContentKind): GeoSiteElement[] {
  return pageTemplateElements(
    kind === 'article' ? 'articleDetail' : 'productDetail',
  );
}

/** 每页条数：库里已有 1-60 校验，这里只兜住脏值，不让公开页把整表拖出来。 */
function clampPageSize(value: unknown): number {
  const num = Number(value ?? 9);
  if (!Number.isFinite(num)) return 9;
  return Math.max(1, Math.min(60, Math.round(num)));
}
