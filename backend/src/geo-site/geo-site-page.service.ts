import type { Prisma } from '../../generated/prisma';
import { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { toJsonInput } from '../common/json-input';
import { PrismaService } from '../prisma/prisma.service';
import { GeoSiteService } from './geo-site.service';
import { writeGeoSitePublishLog } from './geo-site-publish-log';
import { GeoSiteSettingsService } from './geo-site.settings.service';
import { seoViewOf } from './geo-site.render.service';
import {
  assertElementTree,
  GEO_SITE_CONTENT_KINDS,
  GEO_SITE_LANGUAGES,
  GEO_SITE_LANGUAGE_LABELS,
  GEO_SITE_LIMITS,
  GEO_SITE_PAGE_KIND_LABELS,
  languageHref,
  normalizeLanguage,
  normalizeLanguageList,
  normalizePagePath,
  normalizeScriptEntries,
  type GeoSiteScriptEntry,
  toText,
} from './geo-site.shared';
import {
  PAGE_TEMPLATE_KEYS,
  pageTemplateElements,
  pageTemplateOf,
} from './geo-site-page.templates';

/**
 * 站点页面服务：一个站点多页面，path 为站内路径（'' = 首页）。
 *
 * 三条不变量：
 * 1) 归属只认站点——页面表虽冗余存了 ownerUserId，读写一律先过 GeoSiteService.requireSite；
 * 2) 首页唯一——isHome 靠「同站点内 path=''」这个唯一键保证，不额外做全表扫描；
 * 3) 存量站点零迁移——老站点没有页面行，由 ensureHome() 懒建首页并把 geo_sites.content 灌进去，
 *    之后首页保存双写回该列，回滚或老链路（管理端预览、rendered-html）依然可读。
 */

/** 页面行（Prisma 生成的类型在各处形态不同，这里只声明服务真正用到的列）。 */
type PageRow = {
  id: number;
  siteId: number;
  ownerUserId: string;
  path: string;
  lang: string;
  title: string;
  kind: string;
  isHome: number;
  contentType: string;
  pageSize: number;
  sort: number;
  status: string;
  content: Prisma.JsonValue;
  seo: Prisma.JsonValue;
  scripts: Prisma.JsonValue;
  publishedContent: Prisma.JsonValue;
  publishedSeo: Prisma.JsonValue;
  publishedScripts: Prisma.JsonValue;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type GeoSitePageView = {
  id: number;
  siteId: number;
  /** 站内路径（'' = 该语言的首页） */
  path: string;
  /** 页面语言码：默认语言也存实际语言码，地址不带前缀。 */
  lang: string;
  langLabel: string;
  /** 相对站根的链接（非默认语言带语言前缀），编辑器与菜单选择器直接用 */
  href: string;
  title: string;
  kind: string;
  kindLabel: string;
  isHome: boolean;
  contentType: string;
  pageSize: number;
  sort: number;
  status: string;
  /** 草稿是否有内容：列表页据此显示「空页面」标记 */
  hasContent: boolean;
  published: boolean;
  scriptCount: number;
  publishedAt: Date | null;
  updatedAt: Date;
};

function hrefOf(path: string, lang: string, defaultLanguage: string): string {
  return languageHref('', path, lang, defaultLanguage);
}

function viewOf(
  row: PageRow,
  scriptCount: number,
  defaultLanguage = 'zh-CN',
): GeoSitePageView {
  const lang = normalizeLanguage(row.lang, defaultLanguage);
  return {
    id: row.id,
    siteId: row.siteId,
    path: row.path,
    lang,
    langLabel: GEO_SITE_LANGUAGE_LABELS[lang] || lang,
    href: hrefOf(row.path, lang, defaultLanguage),
    title: row.title,
    kind: row.kind,
    kindLabel: GEO_SITE_PAGE_KIND_LABELS[row.kind] || '自由页面',
    isHome: row.isHome === 1 || row.path === '',
    contentType: row.contentType,
    pageSize: row.pageSize,
    sort: row.sort,
    status: row.status,
    hasContent: Array.isArray(row.content) && row.content.length > 0,
    published: !!row.publishedContent,
    scriptCount,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
  };
}

function scriptsOf(value: unknown): GeoSiteScriptEntry[] {
  return Array.isArray(value) ? (value as GeoSiteScriptEntry[]) : [];
}

export class GeoSitePageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: GeoSiteService,
    private readonly settings: GeoSiteSettingsService,
  ) {}

  /* ---------------------------- 读 ---------------------------- */

  /** 页面列表：附带脚本条数，编辑器左侧页面面板一次拿全（含全部语言）。 */
  async list(user: CurrentUser, siteId: number) {
    const site = await this.sites.requireSite(user, Number(siteId));
    const rows = (await this.prisma.geoSitePage.findMany({
      where: { siteId: site.id },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    })) as PageRow[];
    return rows.map((row) =>
      viewOf(row, scriptsOf(row.scripts).length, site.defaultLanguage),
    );
  }

  async detail(user: CurrentUser, id: number) {
    const row = await this.requirePage(user, Number(id));
    const site = await this.sites.requireSite(user, row.siteId);
    const view = viewOf(
      row,
      scriptsOf(row.scripts).length,
      site.defaultLanguage,
    );
    return {
      ...view,
      content: Array.isArray(row.content) ? row.content : [],
      seo: seoViewOf(row.seo),
      scripts: scriptsOf(row.scripts),
      publishedContent: Array.isArray(row.publishedContent)
        ? row.publishedContent
        : [],
    };
  }

  /* ---------------------------- 建 ---------------------------- */

  /**
   * 新建页面：path 命中已有页面直接报冲突（唯一键也兜底），kind 决定初始骨架。
   * kind=articleList/productList 时 contentType 必填，详情路径前缀即由列表页 path 推出。
   */
  async create(
    user: CurrentUser,
    body: {
      siteId: number;
      path?: string;
      lang?: string;
      title: string;
      kind?: string;
      contentType?: string;
      template?: string;
      pageSize?: number;
      sort?: number;
    },
  ) {
    const site = await this.sites.requireSite(user, Number(body.siteId));
    const title = String(body.title ?? '')
      .trim()
      .slice(0, 120);
    if (!title)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写页面标题');
    const lang = this.langOf(site, body.lang);
    const path = normalizePagePath(body.path);
    await this.assertCapacity(site.id);
    const exist = await this.prisma.geoSitePage.findUnique({
      where: { siteId_lang_path: { siteId: site.id, lang, path } },
    });
    if (exist) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        path === ''
          ? `${this.langLabel(lang)}的首页已存在，请直接编辑或另建带路径的页面`
          : `${this.langLabel(lang)}下路径 /${path} 已被「${exist.title}」占用，换一个标识`,
      );
    }
    const kind = this.normalizeKind(body.kind);
    const contentType = this.normalizeContentType(kind, body.contentType ?? '');
    const templateKey = String(body.template || '').trim();
    const content = templateKey
      ? pageTemplateElements(templateKey)
      : pageTemplateOf(kind, contentType);
    const maxSort = await this.prisma.geoSitePage.count({
      where: { siteId: site.id },
    });
    const row = await this.prisma.geoSitePage.create({
      data: {
        siteId: site.id,
        ownerUserId: site.ownerUserId,
        path,
        lang,
        title,
        kind,
        contentType,
        isHome: path === '' ? 1 : 0,
        pageSize: this.normalizePageSize(body.pageSize),
        sort: Number(body.sort ?? maxSort),
        content: toJsonInput(content),
        seo: seoViewOf({ title }),
        scripts: toJsonInput([]),
      },
    });
    return viewOf(row, 0, site.defaultLanguage);
  }

  /* ---------------------------- 改 ---------------------------- */

  async update(
    user: CurrentUser,
    body: {
      id: number;
      path?: string;
      lang?: string;
      title?: string;
      kind?: string;
      contentType?: string;
      pageSize?: number;
      sort?: number;
      seo?: Record<string, unknown>;
    },
  ) {
    const row = await this.requirePage(user, Number(body.id));
    const site = await this.sites.requireSite(user, row.siteId);
    const data: Record<string, unknown> = {};
    if (body.title !== undefined) {
      const title = String(body.title).trim().slice(0, 120);
      if (!title)
        throw new BusinessException(ErrorCode.BAD_REQUEST, '页面标题不能为空');
      data.title = title;
    }
    let nextLang = normalizeLanguage(row.lang, site.defaultLanguage);
    let nextPath = row.path;
    if (body.lang !== undefined) {
      nextLang = this.langOf(site, body.lang);
      if (nextLang !== normalizeLanguage(row.lang, site.defaultLanguage)) {
        data.lang = nextLang;
      }
    }
    const isHome = row.isHome === 1 || row.path === '';
    if (body.path !== undefined && !isHome) {
      nextPath = normalizePagePath(body.path);
      if (nextPath === '') {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '页面路径不能为空：首页请用「设为首页」，不要清空路径',
        );
      }
    }
    if (
      nextLang !== normalizeLanguage(row.lang, site.defaultLanguage) ||
      nextPath !== row.path
    ) {
      const exist = await this.prisma.geoSitePage.findUnique({
        where: {
          siteId_lang_path: {
            siteId: row.siteId,
            lang: nextLang,
            path: nextPath,
          },
        },
      });
      if (exist && exist.id !== row.id) {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          nextPath === ''
            ? `${this.langLabel(nextLang)}的首页已被「${exist.title}」占用`
            : `${this.langLabel(nextLang)}下路径 /${nextPath} 已被「${exist.title}」占用，换一个标识`,
        );
      }
      if (nextPath !== row.path) data.path = nextPath;
    }
    if (body.kind !== undefined) {
      const kind = this.normalizeKind(body.kind);
      data.kind = kind;
      if (kind !== 'articleList' && kind !== 'productList') {
        data.contentType = '';
      }
    }
    if (body.contentType !== undefined) {
      const kind = String(body.kind ?? row.kind);
      data.contentType = this.normalizeContentType(kind, body.contentType);
    }
    if (body.pageSize !== undefined) {
      data.pageSize = this.normalizePageSize(body.pageSize);
    }
    if (body.sort !== undefined)
      data.sort = Math.max(0, Number(body.sort) || 0);
    if (body.seo !== undefined) {
      data.seo = seoViewOf({ ...seoRecord(row.seo), ...body.seo });
    }
    if (!Object.keys(data).length) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '没有需要保存的内容');
    }
    await this.prisma.geoSitePage.update({ where: { id: row.id }, data });
    return this.detail(user, row.id);
  }

  /**
   * 页面复制到另一种语言：路径保持一致、内容整棵带过去，新页面从草稿起步。
   * 多语言站点最费时的是「把已有页面翻一遍」，先给一份可改的副本比让用户从空页重建省事。
   */
  async copyToLanguage(
    user: CurrentUser,
    body: { id: number; lang: string; title?: string },
  ) {
    const row = await this.requirePage(user, Number(body.id));
    const site = await this.sites.requireSite(user, row.siteId);
    const sourceLang = normalizeLanguage(row.lang, site.defaultLanguage);
    const lang = this.langOf(site, body.lang);
    if (lang === sourceLang) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '目标语言与源页面相同，请选择另一种语言',
      );
    }
    const exist = await this.prisma.geoSitePage.findUnique({
      where: {
        siteId_lang_path: { siteId: row.siteId, lang, path: row.path },
      },
    });
    if (exist) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `${this.langLabel(lang)}下已存在${row.path ? `路径 /${row.path}` : '首页'}（${exist.title}），请先改名或删除`,
      );
    }
    await this.assertCapacity(row.siteId);
    const copy = await this.prisma.geoSitePage.create({
      data: {
        siteId: row.siteId,
        ownerUserId: row.ownerUserId,
        path: row.path,
        lang,
        title:
          String(body.title ?? '')
            .trim()
            .slice(0, 120) || row.title,
        kind: row.kind,
        contentType: row.contentType,
        isHome: row.path === '' ? 1 : 0,
        pageSize: row.pageSize,
        sort: row.sort,
        status: 'DRAFT',
        content: toJsonInput(row.content),
        seo: toJsonInput(seoRecord(row.seo)),
        scripts: toJsonInput(scriptsOf(row.scripts)),
      },
    });
    return viewOf(copy, scriptsOf(copy.scripts).length, site.defaultLanguage);
  }

  /**
   * 保存页面草稿：元素树整棵覆盖。
   * 首页额外双写 geo_sites.content——老链路（管理端站点预览、rendered-html 调试口）
   * 读的是站点列，不写就会在两处内容之间来回打架。
   */
  async saveContent(
    user: CurrentUser,
    body: { id: number; content: unknown[] },
  ) {
    const row = await this.requirePage(user, Number(body.id));
    const site = await this.sites.requireSite(user, row.siteId);
    const tree = assertElementTree(body.content ?? []);
    await this.prisma.geoSitePage.update({
      where: { id: row.id },
      data: { content: toJsonInput(tree) },
    });
    if (
      (row.isHome || row.path === '') &&
      normalizeLanguage(row.lang, site.defaultLanguage) ===
        normalizeLanguage(site.defaultLanguage)
    ) {
      await this.prisma.geoSite.update({
        where: { id: row.siteId },
        data: { content: toJsonInput(tree) },
      });
    }
    return this.detail(user, row.id);
  }

  /**
   * 保存页面第三方脚本：逐条过平台白名单，不合格的直接拒回并给原因，
   * 库里只可能存「https + 白名单主机」的条目，渲染层因此不必再做净化。
   */
  async saveScripts(
    user: CurrentUser,
    body: { id: number; scripts: unknown[] },
  ) {
    const row = await this.requirePage(user, Number(body.id));
    const settings = await this.settings.view();
    if (!settings.customScriptEnabled) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '平台已关闭第三方脚本注入，请联系平台管理员在「独立站 · 平台参数」开启',
      );
    }
    const { accepted, rejected } = normalizeScriptEntries(
      body.scripts ?? [],
      settings.scriptHostWhitelist,
    );
    await this.prisma.geoSitePage.update({
      where: { id: row.id },
      data: { scripts: toJsonInput(accepted) },
    });
    return {
      pageId: row.id,
      scripts: accepted,
      rejected,
      whitelist: settings.scriptHostWhitelist,
      message: rejected.length
        ? `已保存 ${accepted.length} 条，${rejected.length} 条被拒绝`
        : `已保存 ${accepted.length} 条脚本`,
    };
  }

  /** 页面排序：整站一次性写回，避免前端逐条调用产生中间态。 */
  async reorder(user: CurrentUser, body: { siteId: number; ids: number[] }) {
    const site = await this.sites.requireSite(user, Number(body.siteId));
    const ids = (Array.isArray(body.ids) ? body.ids : []).map((id) =>
      Number(id),
    );
    const rows = await this.prisma.geoSitePage.findMany({
      where: { siteId: site.id },
      select: { id: true },
    });
    const valid = new Set(rows.map((row) => row.id));
    await this.prisma.$transaction(
      ids
        .filter((id) => valid.has(id))
        .map((id, index) =>
          this.prisma.geoSitePage.update({
            where: { id },
            data: { sort: index },
          }),
        ),
    );
    return this.list(user, site.id);
  }

  /** 首页归属切换：同一站点每种语言只允许一个首页，改完原首页要腾出路径。 */
  async setHome(user: CurrentUser, body: { id: number }) {
    const row = await this.requirePage(user, Number(body.id));
    const site = await this.sites.requireSite(user, row.siteId);
    if (row.isHome || row.path === '') {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '该页面已经是首页');
    }
    const lang = normalizeLanguage(row.lang, site.defaultLanguage);
    const current = await this.prisma.geoSitePage.findFirst({
      where: { siteId: row.siteId, lang, path: '' },
    });
    await this.prisma.$transaction([
      this.prisma.geoSitePage.updateMany({
        where: { siteId: row.siteId, lang, isHome: 1 },
        data: { isHome: 0 },
      }),
      // 原首页先让路（路径改成 page-{id}，内容不丢），再把新首页占住 ''
      current
        ? this.prisma.geoSitePage.update({
            where: { id: current.id },
            data: { path: `page-${current.id}`, isHome: 0 },
          })
        : this.prisma.geoSitePage.update({
            where: { id: row.id },
            data: { path: row.path },
          }),
      this.prisma.geoSitePage.update({
        where: { id: row.id },
        data: { isHome: 1, path: '' },
      }),
    ]);
    return this.list(user, row.siteId);
  }

  /* ---------------------------- 发布 / 删 ---------------------------- */

  /** 单页发布：只冻结这一页的快照，整站发布时会被覆盖为同一份内容。 */
  async publish(user: CurrentUser, body: { id: number }) {
    const row = await this.requirePage(user, Number(body.id));
    const tree = assertElementTree(row.content);
    if (!tree.length) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '页面还是空的，先添加内容再发布',
      );
    }
    const seo = seoViewOf({ ...seoRecord(row.seo), title: row.title });
    const whitelist = (await this.settings.view()).scriptHostWhitelist;
    // 平台白名单可能已经收紧：发布时再过滤一次，线上快照只留当下仍合规的脚本
    const { accepted } = normalizeScriptEntries(row.scripts, whitelist);
    await this.prisma.geoSitePage.update({
      where: { id: row.id },
      data: {
        status: 'PUBLISHED',
        content: toJsonInput(tree),
        seo: toJsonInput(seo),
        scripts: toJsonInput(accepted),
        publishedContent: toJsonInput(tree),
        publishedSeo: toJsonInput(seo),
        publishedScripts: toJsonInput(accepted),
        publishedAt: row.publishedAt ?? new Date(),
      },
    });
    // 单页发布也进台账：排障时要能看出「这一页是谁在什么时候发的」
    await writeGeoSitePublishLog(this.prisma, user, {
      siteId: row.siteId,
      ownerUserId: row.ownerUserId,
      target: 'PAGE',
      targetId: row.id,
      label: `${row.title}（/${row.path}）`,
      note: `${tree.length} 个顶层区块 · ${accepted.length} 条脚本`,
    });
    return this.detail(user, row.id);
  }

  async offline(user: CurrentUser, body: { id: number }) {
    const row = await this.requirePage(user, Number(body.id));
    if (row.isHome || row.path === '') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '首页不能下线：整站下线请用站点列表的「下线」',
      );
    }
    await this.prisma.geoSitePage.update({
      where: { id: row.id },
      data: { status: 'DRAFT' },
    });
    await writeGeoSitePublishLog(this.prisma, user, {
      siteId: row.siteId,
      ownerUserId: row.ownerUserId,
      target: 'PAGE',
      targetId: row.id,
      label: `${row.title}（/${row.path}）`,
      note: '页面下线：从导航与站点地图移除，草稿保留',
    });
    return this.detail(user, row.id);
  }

  async remove(user: CurrentUser, body: { id: number }) {
    const row = await this.requirePage(user, Number(body.id));
    if (row.isHome || row.path === '') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '首页不能删除：站点至少要保留一个首页',
      );
    }
    await this.prisma.$transaction([
      // 指向该页的菜单项一并清掉，否则导航会留下永远 404 的死链
      this.prisma.geoSiteMenuItem.deleteMany({
        where: { siteId: row.siteId, targetType: 'PAGE', targetId: row.id },
      }),
      this.prisma.geoSitePage.delete({ where: { id: row.id } }),
    ]);
    return { ok: true, message: '页面已删除' };
  }

  /* ---------------------------- 懒建与快照 ---------------------------- */

  /**
   * 懒建首页：存量站点没有页面行，首次进入 CMS 链路时把 geo_sites.content 变成默认语言首页。
   * 幂等靠 (siteId, lang, path='') 唯一键，并发重复调用只会多算一次模板，不会写出两行。
   */
  async ensureHome(siteId: number): Promise<PageRow | null> {
    const site = await this.prisma.geoSite.findUnique({
      where: { id: siteId },
    });
    if (!site) return null;
    const lang = normalizeLanguage(site.defaultLanguage);
    const existing = await this.prisma.geoSitePage.findUnique({
      where: { siteId_lang_path: { siteId, lang, path: '' } },
    });
    if (existing) return existing;
    const created = await this.prisma.geoSitePage.create({
      data: {
        siteId,
        ownerUserId: site.ownerUserId,
        path: '',
        lang,
        title: site.title,
        kind: 'landing',
        isHome: 1,
        sort: 0,
        status: site.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
        content: toJsonInput(Array.isArray(site.content) ? site.content : []),
        seo: toJsonInput(seoViewOf(site.seo)),
        scripts: toJsonInput([]),
        publishedContent: site.publishedContent
          ? toJsonInput(site.publishedContent)
          : undefined,
        publishedSeo: site.publishedSeo
          ? toJsonInput(site.publishedSeo)
          : undefined,
        publishedScripts: toJsonInput([]),
        publishedAt: site.publishedAt,
      },
    });
    return created;
  }

  /** 站点发布调用：把每个「草稿已发布」的页面冻结进各自的线上快照，并整站标记 PUBLISHED。 */
  async snapshotForSite(siteId: number, tx: Prisma.TransactionClient) {
    const rows = (await tx.geoSitePage.findMany({
      where: { siteId },
    })) as PageRow[];
    for (const row of rows) {
      const tree = assertElementTree(row.content);
      const seo = seoViewOf({ ...seoRecord(row.seo), title: row.title });
      await tx.geoSitePage.update({
        where: { id: row.id },
        data: {
          status: 'PUBLISHED',
          publishedContent: toJsonInput(tree),
          publishedSeo: toJsonInput(seo),
          publishedScripts: toJsonInput(row.scripts),
          publishedAt: row.publishedAt ?? new Date(),
        },
      });
    }
  }

  /** 整站发布前置：保证有首页，且首页草稿与站点列同步（站点列是发布校验的入口）。 */
  async prepareSitePublish(siteId: number): Promise<PageRow> {
    const home = await this.ensureHome(siteId);
    if (!home) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '站点不存在');
    }
    return home;
  }

  /** 编辑器进入站点时调用：没有页面行的站点先补出首页，前端页面面板立刻可见。 */
  async bootstrap(user: CurrentUser, siteId: number) {
    const site = await this.sites.requireSite(user, Number(siteId));
    const home = await this.ensureHome(site.id);
    return {
      pages: await this.list(user, site.id),
      homeId: home?.id ?? 0,
      templates: PAGE_TEMPLATE_KEYS,
      defaultLanguage: normalizeLanguage(site.defaultLanguage),
      languages: normalizeLanguageList(site.languages, site.defaultLanguage),
      languageOptions: GEO_SITE_LANGUAGES.map((code) => ({
        code,
        label: GEO_SITE_LANGUAGE_LABELS[code] || code,
      })),
    };
  }

  /* ---------------------------- 内部 ---------------------------- */

  private async requirePage(user: CurrentUser, id: number): Promise<PageRow> {
    const row = await this.prisma.geoSitePage.findUnique({
      where: { id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '页面不存在');
    // 归属闸在站点上：能拿到页面就必须能拿到它所属站点
    await this.sites.requireSite(user, row.siteId);
    return row;
  }

  private async assertCapacity(siteId: number) {
    const count = await this.prisma.geoSitePage.count({ where: { siteId } });
    if (count >= GEO_SITE_LIMITS.maxPagesPerSite) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `单个站点最多 ${GEO_SITE_LIMITS.maxPagesPerSite} 个页面`,
      );
    }
  }

  /** 语言必须已启用：未勾选的语言在编辑面板里也选不到，接口侧再兜一层。 */
  private langOf(
    site: { defaultLanguage: string; languages: Prisma.JsonValue },
    value: unknown,
  ): string {
    const defaultLanguage = normalizeLanguage(site.defaultLanguage);
    const lang = normalizeLanguage(value, defaultLanguage);
    const enabled = normalizeLanguageList(site.languages, defaultLanguage);
    if (!enabled.includes(lang)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `站点未启用${this.langLabel(lang)}：请先在「站点设置 · 多语言」勾选该语言`,
      );
    }
    return lang;
  }

  private langLabel(lang: string): string {
    return `「${GEO_SITE_LANGUAGE_LABELS[lang] || lang}」`;
  }

  private normalizeKind(value: unknown): string {
    const kind = toText(value).trim() || 'custom';
    const allowed = Object.keys(GEO_SITE_PAGE_KIND_LABELS);
    return allowed.includes(kind) ? kind : 'custom';
  }

  private normalizeContentType(kind: string, value: unknown): string {
    const raw = toText(value).trim().toLowerCase();
    if (kind !== 'articleList' && kind !== 'productList') return '';
    if (
      !GEO_SITE_CONTENT_KINDS.includes(
        raw as (typeof GEO_SITE_CONTENT_KINDS)[number],
      )
    ) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '列表页需要绑定内容类型：article 或 product',
      );
    }
    return raw;
  }

  private normalizePageSize(value: unknown): number {
    const num = Number(value ?? 9);
    if (!Number.isFinite(num)) return 9;
    return Math.min(
      GEO_SITE_LIMITS.maxPageSize,
      Math.max(GEO_SITE_LIMITS.minPageSize, Math.round(num)),
    );
  }
}

function seoRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
