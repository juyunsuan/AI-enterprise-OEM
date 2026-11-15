import type { Prisma } from '../../generated/prisma';
import { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { toJsonInput } from '../common/json-input';
import { IdentityService } from '../identity/identity.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertElementTree,
  GEO_SITE_DOMAIN_STATUS_LABELS,
  GEO_SITE_LANGUAGES,
  GEO_SITE_LANGUAGE_LABELS,
  geoSiteStatusLabel,
  normalizeLanguage,
  normalizeLanguageList,
  normalizeSlug,
  siteUrlOf,
  type GeoSiteElement,
} from './geo-site.shared';
import { seoViewOf } from './geo-site.render.service';
import {
  GeoSiteSettingsService,
  type GeoSiteSettings,
} from './geo-site.settings.service';
import {
  DEFAULT_TEMPLATE_KEY,
  templateByKey,
  templateViews,
} from './geo-site.templates';
import { planMonthlyCharges } from './geo-site.billing.service';
import {
  geoSitePublishTargetLabel,
  writeGeoSitePublishLog,
} from './geo-site-publish-log';
import type { GeoSiteContentService } from './geo-site-content.service';
import type { GeoSiteMenuService } from './geo-site-menu.service';
import type { GeoSitePageService } from './geo-site-page.service';

/**
 * GEO 独立站主体服务：站点增删改查、发布快照、企业隔离与平台侧处置。
 *
 * 归属与可见性沿用 GEO 项目口径：站点记 ownerUserId（建站的账号）+ enterpriseId/enterpriseUserId
 * （品牌方当事人），平台管理员全量可见，其余账号只能看到自己或自己企业下的站点。
 * 内容分两份：content 是草稿，publishedContent 是线上快照，编辑不影响已发布页面。
 */

/** 计费用量：module_pricing 的 geo_site 行（单价＝站/月积分）。 */
export type GeoSitePricing = {
  monthPrice: number;
  freeSites: number;
  minCharge: number;
  pricingEnabled: boolean;
};

const round4 = (value: number) => Math.round(value * 10000) / 10000;

function jsonOf(row: Prisma.JsonValue, fallback: unknown): unknown {
  return row === null || row === undefined ? fallback : row;
}

function elementsOf(value: unknown): GeoSiteElement[] {
  return Array.isArray(value) ? (value as GeoSiteElement[]) : [];
}

type SiteRow = {
  id: number;
  title: string;
  slug: string;
  status: string;
  geoProjectId: number;
  ownerUserId: string;
  enterpriseId: number;
  favicon: string;
  coverImage: string;
  /** 站点默认语言：该语言的内容 lang 为空串，访问地址不带语言前缀。 */
  defaultLanguage: string;
  /** 已启用语言（JSON string[]，含默认语言）。 */
  languages: Prisma.JsonValue;
  publishedAt: Date | null;
  suspendedAt: Date | null;
  offReason: string;
  createdAt: Date;
  updatedAt: Date;
  /** 站点级脚本注入开关（tinyint），视图里折成布尔给前端做开关态。 */
  scriptsEnabled: number;
};

/** 站点列表/详情视图（日期字段由 serializeResponse 统一转成 ISO 字符串）。 */
export type GeoSiteView = {
  id: number;
  title: string;
  slug: string;
  status: string;
  statusLabel: string;
  geoProjectId: number;
  geoProjectBrand: string;
  ownerUserId: string;
  enterpriseId: number;
  favicon: string;
  coverImage: string;
  url: string;
  defaultLanguage: string;
  languages: string[];
  primaryDomain: string;
  domainCount: number;
  activeDomainCount: number;
  publishedAt: Date | null;
  suspendedAt: Date | null;
  /** 平台强制下线原因：建站者在编辑器停服提示里看到自己的处置说明。 */
  offReason: string;
  createdAt: Date;
  updatedAt: Date;
  monthlyPoints: number;
  billingNote: string;
  /** 本站是否允许注入第三方脚本（平台总开关与域名闸门之外的站点级一道）。 */
  scriptsEnabled: boolean;
};

/**
 * 站点 CMS 协作者：页面 / 菜单 / 内容库三个服务都要回查站点归属，反过来站点服务又要在
 * 发布与删除时驱动它们，构造期会成环。装配时由 services.ts 用 attachCms 回填。
 */
export type GeoSiteCmsPort = {
  pages: GeoSitePageService;
  menus: GeoSiteMenuService;
  contents: GeoSiteContentService;
};

export class GeoSiteService {
  private cms: GeoSiteCmsPort | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
    private readonly settings: GeoSiteSettingsService,
  ) {}

  attachCms(cms: GeoSiteCmsPort) {
    this.cms = cms;
  }

  /* ------------------------------ 元信息 ------------------------------ */

  async pricing(): Promise<GeoSitePricing> {
    const row = await this.prisma.modulePricing.findUnique({
      where: { code: 'geo_site' },
    });
    const enabled = !!row && row.enabled === 1;
    return {
      monthPrice: round4(Number(row?.unitPriceAmount ?? 0)),
      freeSites: round4(Number(row?.freeQuotaAmount ?? 0)),
      minCharge: round4(Number(row?.minChargeAmount ?? 0)),
      pricingEnabled: enabled && row?.mode === 'METERED',
    };
  }

  async meta(user: CurrentUser) {
    const [settings, pricing, rootDomain] = await Promise.all([
      this.settings.view(),
      this.pricing(),
      this.settings.rootDomain(),
    ]);
    const scope = await this.visibilityScope(user);
    const total = await this.prisma.geoSite.count({ where: scope });
    return {
      templates: templateViews(),
      rootDomain,
      maxSites: settings.maxSitesPerOwner,
      maxDomainsPerSite: settings.maxDomainsPerSite,
      customDomainEnabled: settings.customDomainEnabled,
      needsIcpAck: settings.needsIcpAck,
      monthPrice: pricing.monthPrice,
      freeSites: pricing.freeSites,
      minCharge: pricing.minCharge,
      pricingEnabled: pricing.pricingEnabled,
      graceHours: settings.graceHours,
      total,
      remaining: Math.max(0, settings.maxSitesPerOwner - total),
      // 脚本面板的前置信息：编辑器据此提示「只允许这些域名，单页最多 N 条」
      customScriptEnabled: settings.customScriptEnabled,
      scriptHostWhitelist: settings.scriptHostWhitelist,
      maxScriptsPerPage: settings.maxScriptsPerPage,
      scriptPresets: this.settings.scriptPresets(),
      // 独立站语言口径与平台站点设置同源：默认语言 + 可启用语言清单
      languageOptions: GEO_SITE_LANGUAGES.map((code) => ({
        code,
        label: GEO_SITE_LANGUAGE_LABELS[code] || code,
      })),
    };
  }

  /* ------------------------------ 列表/详情 ------------------------------ */

  async list(user: CurrentUser) {
    const scope = await this.visibilityScope(user);
    const rows = await this.prisma.geoSite.findMany({
      where: scope,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 200,
    });
    const views = await this.toViews(rows);
    await this.attachProjectBrand(views);
    return views;
  }

  async detail(user: CurrentUser, id: number) {
    const row = await this.requireSite(user, id);
    const [view] = await this.toViews([row]);
    await this.attachProjectBrand([view]);
    const domains = await this.domainViews(row.id);
    return {
      ...view,
      seo: seoViewOf(row.seo),
      content: elementsOf(jsonOf(row.content, [])),
      published: !!row.publishedContent,
      publishedContent: elementsOf(jsonOf(row.publishedContent, [])),
      domains,
    };
  }

  /* ------------------------------ 增删改 ------------------------------ */

  async create(
    user: CurrentUser,
    body: {
      title: string;
      template?: string;
      geoProjectId?: number;
      defaultLanguage?: string;
      languages?: string[];
    },
  ) {
    const title = String(body.title ?? '')
      .trim()
      .slice(0, 120);
    if (!title)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写站点名称');
    const settings = await this.settings.view();
    const scope = await this.visibilityScope(user);
    const total = await this.prisma.geoSite.count({ where: scope });
    if (total >= settings.maxSitesPerOwner) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `站点数量已达上限 ${settings.maxSitesPerOwner} 个：请先删除不再使用的站点，或联系平台管理员调整上限`,
      );
    }
    const template =
      templateByKey(String(body.template || '')) ||
      templateByKey(DEFAULT_TEMPLATE_KEY)!;
    const isAdmin = this.identity.isPlatformAdmin(user);
    const enterprise = isAdmin
      ? null
      : (await this.identity.myEnterprises(user.userId))[0] || null;
    const geoProjectId = Number(body.geoProjectId ?? 0) || 0;
    if (geoProjectId > 0) await this.assertProjectVisible(user, geoProjectId);
    const defaultLanguage = normalizeLanguage(body.defaultLanguage);
    const row = await this.prisma.geoSite.create({
      data: {
        ownerUserId: user.userId,
        enterpriseId: enterprise?.id || 0,
        enterpriseUserId: enterprise?.userId || '',
        geoProjectId,
        title,
        slug: await this.uniqueSlug(slugSeed(title)),
        defaultLanguage,
        languages: normalizeLanguageList(body.languages, defaultLanguage),
        content: template.elements as Prisma.InputJsonValue,
        seo: template.seo as Prisma.InputJsonValue,
      },
    });
    return this.detail(user, row.id);
  }

  async update(
    user: CurrentUser,
    body: {
      id: number;
      title?: string;
      slug?: string;
      geoProjectId?: number;
      favicon?: string;
      coverImage?: string;
      seo?: Record<string, unknown>;
      scriptsEnabled?: boolean;
      defaultLanguage?: string;
      languages?: string[];
    },
  ) {
    const row = await this.requireSite(user, Number(body.id));
    const data: Record<string, unknown> = {};
    let defaultLanguage = normalizeLanguage(row.defaultLanguage);
    let languages = normalizeLanguageList(row.languages, defaultLanguage);
    if (body.defaultLanguage !== undefined) {
      defaultLanguage = normalizeLanguage(body.defaultLanguage);
      data.defaultLanguage = defaultLanguage;
    }
    if (body.languages !== undefined || body.defaultLanguage !== undefined) {
      languages = normalizeLanguageList(
        body.languages ?? languages,
        defaultLanguage,
      );
      data.languages = languages;
    }
    if (body.title !== undefined) {
      const title = String(body.title).trim().slice(0, 120);
      if (!title)
        throw new BusinessException(ErrorCode.BAD_REQUEST, '站点名称不能为空');
      data.title = title;
    }
    if (body.slug !== undefined && body.slug !== row.slug) {
      const slug = normalizeSlug(body.slug);
      const exist = await this.prisma.geoSite.findUnique({ where: { slug } });
      if (exist)
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '该站点标识已被占用，换一个试试',
        );
      data.slug = slug;
    }
    if (body.geoProjectId !== undefined) {
      const projectId = Number(body.geoProjectId) || 0;
      if (projectId > 0) await this.assertProjectVisible(user, projectId);
      data.geoProjectId = projectId;
    }
    if (body.favicon !== undefined)
      data.favicon = String(body.favicon).trim().slice(0, 500);
    if (body.coverImage !== undefined)
      data.coverImage = String(body.coverImage).trim().slice(0, 500);
    if (body.seo !== undefined)
      data.seo = seoViewOf({
        ...asRecord(row.seo),
        ...body.seo,
      });
    if (body.scriptsEnabled !== undefined)
      data.scriptsEnabled = body.scriptsEnabled ? 1 : 0;
    if (!Object.keys(data).length) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '没有需要保存的内容');
    }
    await this.prisma.geoSite.update({ where: { id: row.id }, data });
    return this.detail(user, row.id);
  }

  /**
   * 保存草稿：编辑器每次「保存」调一次，整棵树覆盖式写入。
   * 结构校验（类型目录 + 深度/节点/体积三重封顶）在这里收口，渲染层因此可信任库内数据。
   */
  async saveContent(
    user: CurrentUser,
    body: { id: number; content: unknown[] },
  ) {
    const row = await this.requireSite(user, Number(body.id));
    const tree = assertElementTree(body.content ?? []);
    await this.prisma.geoSite.update({
      where: { id: row.id },
      data: { content: toJsonInput(tree) },
    });
    return this.detail(user, row.id);
  }

  /**
   * 整站发布：首页草稿 → 站点快照，所有页面 → 页面快照，可见且能解析到线上目标的菜单 → 导航快照。
   * 三份快照在同一事务里落库，避免出现「导航已更新、页面还是上一版」的半发布状态。
   */
  async publish(user: CurrentUser, id: number) {
    const row = await this.requireSite(user, Number(id));
    // 平台合规下线只能由平台解除：否则强制下线点一下「发布」就复活了
    if (row.offBy) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        `站点已被平台下线处置（${row.offBy}）：${row.offReason || '内容需整改'}，请整改后联系平台复核恢复`,
      );
    }
    const home = this.cms
      ? await this.cms.pages.prepareSitePublish(row.id)
      : null;
    const tree = assertElementTree(jsonOf(home?.content ?? row.content, []));
    if (!tree.length) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '页面还是空的，先添加内容再发布',
      );
    }
    const seo = seoViewOf(row.seo);
    const title = seo.title || row.title;
    await this.prisma.$transaction(async (tx) => {
      if (this.cms) await this.cms.pages.snapshotForSite(row.id, tx);
      const publishedMenus = this.cms
        ? await this.cms.menus.snapshot(
            row.id,
            await this.onlineIds(tx, row.id),
          )
        : undefined;
      await tx.geoSite.update({
        where: { id: row.id },
        data: {
          status: 'PUBLISHED',
          suspendedAt: null,
          publishedContent: toJsonInput(tree),
          publishedSeo: { ...seo, title },
          publishedAt: row.publishedAt ?? new Date(),
          seo: seo,
          ...(publishedMenus === undefined
            ? {}
            : { publishedMenus: toJsonInput(publishedMenus) }),
        },
      });
    });
    // 台账是旁路：统计与写入都放在事务之后，失败只打 warn，绝不把已成功的发布变成失败
    const note = await this.publishSummary(row.id);
    await writeGeoSitePublishLog(this.prisma, user, {
      siteId: row.id,
      ownerUserId: row.ownerUserId,
      target: 'SITE',
      targetId: row.id,
      label: row.title,
      note,
    });
    return this.detail(user, row.id);
  }

  /** 发布摘要：线上页面/文章/产品各多少，只用于台账展示。 */
  private async publishSummary(siteId: number) {
    try {
      const [pages, articles, products] = await Promise.all([
        this.prisma.geoSitePage.count({
          where: { siteId, status: 'PUBLISHED' },
        }),
        this.prisma.geoSiteArticle.count({
          where: { siteId, status: 'PUBLISHED' },
        }),
        this.prisma.geoSiteProduct.count({
          where: { siteId, status: 'PUBLISHED' },
        }),
      ]);
      return `线上 ${pages} 页 · ${articles} 篇文章 · ${products} 个产品`;
    } catch {
      return '';
    }
  }

  /** 发布台账：倒序分页，只给站点归属内的账号看（合规处置记录也在这条流里）。 */
  async publishLog(
    user: CurrentUser,
    query: { siteId: number; page?: number; pageSize?: number },
  ) {
    const row = await this.requireSite(user, Number(query.siteId));
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)));
    const [total, rows] = await Promise.all([
      this.prisma.geoSitePublishLog.count({ where: { siteId: row.id } }),
      this.prisma.geoSitePublishLog.findMany({
        where: { siteId: row.id },
        orderBy: [{ id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      page,
      pageSize,
      total,
      items: rows.map((item) => ({
        id: item.id,
        siteId: item.siteId,
        targetKind: item.targetKind,
        targetKindLabel: geoSitePublishTargetLabel(
          item.targetKind as 'SITE' | 'PAGE' | 'ARTICLE' | 'PRODUCT',
        ),
        targetId: item.targetId,
        label: item.label,
        note: item.note,
        operator: item.operator,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }

  /** 发布时的「线上 id 集合」：菜单只保留指向已发布页面/文章/产品的项。 */
  private async onlineIds(tx: Prisma.TransactionClient, siteId: number) {
    const [pages, articles, products] = await Promise.all([
      tx.geoSitePage.findMany({
        where: { siteId, status: 'PUBLISHED' },
        select: { id: true },
      }),
      tx.geoSiteArticle.findMany({
        where: { siteId, status: 'PUBLISHED' },
        select: { id: true },
      }),
      tx.geoSiteProduct.findMany({
        where: { siteId, status: 'PUBLISHED' },
        select: { id: true },
      }),
    ]);
    const ids = (rows: { id: number }[]) =>
      new Set(rows.map((item) => item.id));
    return {
      pages: ids(pages),
      articles: ids(articles),
      products: ids(products),
    };
  }

  async unpublish(user: CurrentUser, id: number) {
    const row = await this.requireSite(user, Number(id));
    await this.prisma.geoSite.update({
      where: { id: row.id },
      data: { status: 'DRAFT' },
    });
    await writeGeoSitePublishLog(this.prisma, user, {
      siteId: row.id,
      ownerUserId: row.ownerUserId,
      target: 'SITE',
      targetId: row.id,
      label: row.title,
      note: '整站下线：公开地址即刻停服，草稿与快照保留',
    });
    return this.detail(user, row.id);
  }

  async duplicate(user: CurrentUser, id: number) {
    const row = await this.requireSite(user, Number(id));
    const copy = await this.prisma.geoSite.create({
      data: {
        ownerUserId: user.userId,
        enterpriseId: row.enterpriseId,
        enterpriseUserId: row.enterpriseUserId,
        geoProjectId: row.geoProjectId,
        title: `${row.title} 副本`.slice(0, 120),
        slug: await this.uniqueSlug(`${row.slug}-copy`),
        defaultLanguage: normalizeLanguage(row.defaultLanguage),
        languages: normalizeLanguageList(row.languages, row.defaultLanguage),
        content: jsonOf(row.content, []) as Prisma.InputJsonValue,
        seo: jsonOf(row.seo, {}) as Prisma.InputJsonValue,
        favicon: row.favicon,
        coverImage: row.coverImage,
      },
    });
    return this.detail(user, copy.id);
  }

  /** 删除站点：连带清掉域名与账单行（账单是扣费幂等键，站点没了就不该再拦下一次出账）。 */
  async remove(user: CurrentUser, id: number) {
    const row = await this.requireSite(user, Number(id));
    await this.prisma.$transaction([
      this.prisma.geoSiteDomain.deleteMany({ where: { siteId: row.id } }),
      this.prisma.geoSiteBill.deleteMany({ where: { siteId: row.id } }),
      // CMS 附属数据按站点归属，站点没了留着只会变成孤儿与死链
      this.prisma.geoSitePage.deleteMany({ where: { siteId: row.id } }),
      this.prisma.geoSiteMenuItem.deleteMany({ where: { siteId: row.id } }),
      this.prisma.geoSiteArticle.deleteMany({ where: { siteId: row.id } }),
      this.prisma.geoSiteProduct.deleteMany({ where: { siteId: row.id } }),
      this.prisma.geoSitePublishLog.deleteMany({ where: { siteId: row.id } }),
      this.prisma.geoSiteTemplate.deleteMany({ where: { siteId: row.id } }),
      this.prisma.geoSite.delete({ where: { id: row.id } }),
    ]);
    return { ok: true, message: '站点已删除' };
  }

  /* ------------------------------ 计费视图 ------------------------------ */

  /** 单站本月费用与历史账单：出账口径与日批共用 planMonthlyCharges，展示与扣费不会两张嘴。 */
  async billing(user: CurrentUser, siteId: number) {
    const row = await this.requireSite(user, Number(siteId));
    const [pricing, plan] = await Promise.all([
      this.pricing(),
      this.planForOwner(row.ownerUserId),
    ]);
    const entry = plan.find((item) => item.siteId === row.id);
    const bills = await this.prisma.geoSiteBill.findMany({
      where: { siteId: row.id },
      orderBy: { periodMonth: 'desc' },
      take: 24,
    });
    const now = new Date();
    return {
      code: 'geo_site',
      siteId: row.id,
      monthPrice: pricing.monthPrice,
      freeSites: pricing.freeSites,
      pricingEnabled: pricing.pricingEnabled,
      currentMonthPoints: entry?.amount ?? 0,
      nextChargeDate: nextChargeDate(now),
      bills: bills.map((bill) => ({
        periodMonth: bill.periodMonth,
        days: bill.days,
        pointsAmount: round4(Number(bill.pointsAmount)),
        status: bill.status,
      })),
    };
  }

  /* ------------------------------ 平台管理侧 ------------------------------ */

  async adminPage(
    _user: CurrentUser,
    query: { page?: number; pageSize?: number; q?: string; status?: string },
  ) {
    if (!this.identity.isPlatformAdmin(_user)) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '仅平台管理员可访问');
    }
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)));
    const where: Record<string, unknown> = {};
    const status = String(query.status || '')
      .trim()
      .toUpperCase();
    if (['DRAFT', 'PUBLISHED', 'SUSPENDED'].includes(status))
      where.status = status;
    const q = String(query.q || '').trim();
    if (q) {
      where.OR = [
        { title: { contains: q } },
        { slug: { contains: q.toLowerCase() } },
        { ownerUserId: { contains: q } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.geoSite.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.geoSite.count({ where }),
    ]);
    const views = await this.toViews(rows);
    await this.attachProjectBrand(views);
    // 归属账号展示：userId 就是 accounts.id 的字符串形态
    const accountIds = Array.from(
      new Set(
        rows
          .map((row) => Number(row.ownerUserId))
          .filter((value) => Number.isInteger(value) && value > 0),
      ),
    );
    const accounts = accountIds.length
      ? await this.prisma.account.findMany({
          where: { id: { in: accountIds } },
          select: { id: true, username: true },
        })
      : [];
    const nameByUser = new Map(
      accounts.map((item) => [String(item.id), item.username]),
    );
    return {
      list: views.map((view) => ({
        ...view,
        ownerLabel: nameByUser.get(view.ownerUserId) || view.ownerUserId,
      })),
      total,
      page,
      pageSize,
    };
  }

  async adminStats(user: CurrentUser) {
    if (!this.identity.isPlatformAdmin(user)) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '仅平台管理员可访问');
    }
    const now = new Date();
    const [
      total,
      published,
      suspended,
      draft,
      pages,
      pagesPublished,
      articles,
      articlesPublished,
      products,
      productsPublished,
      domains,
      charged,
    ] = await Promise.all([
      this.prisma.geoSite.count(),
      this.prisma.geoSite.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.geoSite.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.geoSite.count({ where: { status: 'DRAFT' } }),
      // CMS 体量：页面/文章/产品三张表各算「总量 + 已进线上快照」，合规排查先看产量异常高的站
      this.prisma.geoSitePage.count(),
      this.prisma.geoSitePage.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.geoSiteArticle.count(),
      this.prisma.geoSiteArticle.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.geoSiteProduct.count(),
      this.prisma.geoSiteProduct.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.geoSiteDomain.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.geoSiteBill.aggregate({
        where: { periodMonth: monthKey(now), status: 'CHARGED' },
        _sum: { pointsAmount: true },
      }),
    ]);
    const byStatus = new Map(
      domains.map((row) => [row.status, row._count._all]),
    );
    return {
      total,
      published,
      suspended,
      draft,
      domains: {
        total: domains.reduce((sum, row) => sum + row._count._all, 0),
        active: byStatus.get('ACTIVE') || 0,
        error: byStatus.get('ERROR') || 0,
      },
      chargedThisMonth: round4(Number(charged._sum.pointsAmount ?? 0)),
      pages: { total: pages, published: pagesPublished },
      articles: { total: articles, published: articlesPublished },
      products: { total: products, published: productsPublished },
    };
  }

  /** 平台强制下线（合规处置）：保留数据与账单，只停止公开访问。 */
  async adminOffline(user: CurrentUser, body: { id: number; reason?: string }) {
    if (!this.identity.isPlatformAdmin(user)) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '仅平台管理员可访问');
    }
    const row = await this.prisma.geoSite.findUnique({
      where: { id: Number(body.id) },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '站点不存在');
    await this.prisma.geoSite.update({
      where: { id: row.id },
      data: {
        status: 'SUSPENDED',
        suspendedAt: new Date(),
        offBy: user.username || user.userId,
        // 原因永远留痕：用户侧停服提示与发布拦截都以 offReason 作为「平台处置」的判据
        offReason:
          String(body.reason ?? '')
            .trim()
            .slice(0, 500) || '内容需整改后重新发布，请联系平台复核',
      },
    });
    // 处置也进发布台账：企业侧只看到「被平台下线」，台账里要能查到是谁下的、理由是什么
    await writeGeoSitePublishLog(this.prisma, user, {
      siteId: row.id,
      ownerUserId: row.ownerUserId,
      target: 'ADMIN',
      targetId: row.id,
      label: row.title,
      note: `平台强制下线：${String(body.reason ?? '').trim() || '内容需整改后重新发布，请联系平台复核'}`,
    });
    return this.detail(user, row.id);
  }

  /**
   * 解除平台下线处置：清掉处置标记后按「还有欠费账单吗」决定落回发布态还是继续停服。
   * 没有这一步，强制下线就成了死胡同——用户侧发布被处置拦着，只能改库恢复。
   */
  async adminOnline(user: CurrentUser, id: number) {
    if (!this.identity.isPlatformAdmin(user)) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '仅平台管理员可访问');
    }
    const row = await this.prisma.geoSite.findUnique({
      where: { id: Number(id) },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '站点不存在');
    const unpaid = await this.prisma.geoSiteBill.count({
      where: { siteId: row.id, status: 'ARREARS' },
    });
    await this.prisma.geoSite.update({
      where: { id: row.id },
      data: {
        offBy: '',
        offReason: '',
        suspendedAt: null,
        status: unpaid
          ? 'SUSPENDED'
          : row.publishedContent
            ? 'PUBLISHED'
            : 'DRAFT',
      },
    });
    // 解除处置同样留痕：台账里成对出现「平台强制下线 / 解除平台处置」，复核时才知道站点是谁放行的
    await writeGeoSitePublishLog(this.prisma, user, {
      siteId: row.id,
      ownerUserId: row.ownerUserId,
      target: 'ADMIN',
      targetId: row.id,
      label: row.title,
      note: unpaid
        ? '解除平台处置后仍有欠费账单，站点继续停服'
        : '平台解除处置，站点按快照恢复对外访问',
    });
    return this.detail(user, row.id);
  }

  /* ------------------------------ 内部工具 ------------------------------ */

  private async toViews(rows: SiteRow[]): Promise<GeoSiteView[]> {
    if (!rows.length) return [];
    const [domains, settings, rootDomain, plan] = await Promise.all([
      this.prisma.geoSiteDomain.findMany({
        where: { siteId: { in: rows.map((row) => row.id) } },
      }),
      this.settings.view(),
      this.settings.rootDomain(),
      this.planForOwners(rows.map((row) => row.ownerUserId)),
    ]);
    const bySite = new Map<number, typeof domains>();
    for (const domain of domains) {
      const bucket = bySite.get(domain.siteId) || [];
      bucket.push(domain);
      bySite.set(domain.siteId, bucket);
    }
    return rows.map((row) => {
      const list = bySite.get(row.id) || [];
      const primary = list.find(
        (item) => item.isPrimary === 1 && item.status === 'ACTIVE',
      );
      const entry = plan.find((item) => item.siteId === row.id);
      return {
        id: row.id,
        title: row.title,
        slug: row.slug,
        status: row.status,
        statusLabel: geoSiteStatusLabel(row.status, row.offReason),
        geoProjectId: row.geoProjectId,
        geoProjectBrand: '',
        ownerUserId: row.ownerUserId,
        enterpriseId: row.enterpriseId,
        favicon: row.favicon,
        coverImage: row.coverImage,
        url: siteUrlOf(row.slug, rootDomain),
        defaultLanguage: normalizeLanguage(row.defaultLanguage),
        languages: normalizeLanguageList(row.languages, row.defaultLanguage),
        primaryDomain: primary?.domain || '',
        domainCount: list.length,
        activeDomainCount: list.filter((item) => item.status === 'ACTIVE')
          .length,
        publishedAt: row.publishedAt,
        suspendedAt: row.suspendedAt,
        offReason: row.offReason,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        monthlyPoints: entry?.amount ?? 0,
        billingNote: billingNote(entry, settings),
        scriptsEnabled: row.scriptsEnabled === 1,
      };
    });
  }

  private async attachProjectBrand(
    views: { geoProjectId: number; geoProjectBrand: string }[],
  ) {
    const ids = Array.from(
      new Set(
        views
          .filter((view) => view.geoProjectId > 0)
          .map((view) => view.geoProjectId),
      ),
    );
    if (!ids.length) return;
    const projects = await this.prisma.geoProject.findMany({
      where: { id: { in: ids } },
      select: { id: true, brand: true },
    });
    const byId = new Map(projects.map((item) => [item.id, item.brand]));
    for (const view of views) {
      view.geoProjectBrand = byId.get(view.geoProjectId) || '';
    }
  }

  async domainViews(siteId: number) {
    const rows = await this.prisma.geoSiteDomain.findMany({
      where: { siteId },
      orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
    });
    const cname = await this.settings.cnameTarget();
    return rows.map((row) => ({
      id: row.id,
      siteId: row.siteId,
      domain: row.domain,
      status: row.status,
      statusLabel: GEO_SITE_DOMAIN_STATUS_LABELS[row.status] || row.status,
      isPrimary: row.isPrimary === 1,
      verifyToken: row.verifyToken,
      txtName: `_geo-site-verify.${row.domain}`,
      txtValue: row.verifyToken,
      cnameTarget: cname,
      lastError: row.lastError,
      lastCheckAt: row.lastCheckAt,
      createdAt: row.createdAt,
    }));
  }

  /** 账号维度排本月账单计划：站点列表里的「本月费用」与日批扣费必须同一份算法。 */
  private async planForOwner(ownerUserId: string) {
    return this.planForOwners([ownerUserId]);
  }

  private async planForOwners(ownerUserIds: string[]) {
    const unique = Array.from(new Set(ownerUserIds.filter(Boolean)));
    if (!unique.length) return [] as ReturnType<typeof planMonthlyCharges>;
    const [pricing, sites] = await Promise.all([
      this.pricing(),
      this.prisma.geoSite.findMany({
        where: { ownerUserId: { in: unique } },
        select: { id: true, ownerUserId: true, billingFrom: true },
        orderBy: [{ billingFrom: 'asc' }, { id: 'asc' }],
      }),
    ]);
    return planMonthlyCharges(
      sites.map((site) => ({
        id: site.id,
        ownerUserId: site.ownerUserId,
        billingFrom: site.billingFrom,
      })),
      {
        monthPrice: pricing.monthPrice,
        freeSites: pricing.freeSites,
        minCharge: pricing.minCharge,
        pricingEnabled: pricing.pricingEnabled,
      },
    );
  }

  private async visibilityScope(
    user: CurrentUser,
  ): Promise<Record<string, unknown>> {
    if (this.identity.isPlatformAdmin(user)) return {};
    const enterprises = await this.identity.myEnterprises(user.userId);
    return {
      OR: [
        { ownerUserId: user.userId },
        { enterpriseUserId: user.userId },
        { enterpriseId: { in: enterprises.map((item) => item.id) } },
      ],
    };
  }

  async requireSite(user: CurrentUser, id: number) {
    const row = await this.prisma.geoSite.findUnique({
      where: { id: Number(id) },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '站点不存在');
    if (this.identity.isPlatformAdmin(user)) return row;
    if (
      row.ownerUserId === user.userId ||
      (row.enterpriseUserId && row.enterpriseUserId === user.userId)
    ) {
      return row;
    }
    const enterprises = await this.identity.myEnterprises(user.userId);
    if (
      row.enterpriseId &&
      enterprises.some((item) => item.id === row.enterpriseId)
    ) {
      return row;
    }
    throw new BusinessException(
      ErrorCode.FORBIDDEN,
      '该站点不属于当前账号或其企业',
    );
  }

  private async assertProjectVisible(user: CurrentUser, projectId: number) {
    const row = await this.prisma.geoProject.findUnique({
      where: { id: projectId },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, 'GEO 项目不存在');
    if (this.identity.isPlatformAdmin(user)) return;
    if (row.ownerUserId === user.userId || row.enterpriseUserId === user.userId)
      return;
    const enterprises = await this.identity.myEnterprises(user.userId);
    if (
      row.enterpriseId &&
      enterprises.some((item) => item.id === row.enterpriseId)
    )
      return;
    throw new BusinessException(
      ErrorCode.FORBIDDEN,
      '只能关联自己或本企业可见的 GEO 项目',
    );
  }

  /** slug 冲突时追加序号：站点名重复很常见，不能让用户为了一个网址后缀反复试错。 */
  private async uniqueSlug(seed: string): Promise<string> {
    const base = normalizeSlug(seed) || `site-${Date.now().toString(36)}`;
    let candidate = base;
    for (let index = 2; index <= 50; index += 1) {
      const exist = await this.prisma.geoSite.findUnique({
        where: { slug: candidate },
      });
      if (!exist) return candidate;
      candidate = normalizeSlug(`${base}-${index}`);
    }
    return normalizeSlug(`${base}-${Date.now().toString(36)}`);
  }
}

function asRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function slugSeed(title: string): string {
  const latin = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (latin.length >= 3) return latin.slice(0, 40);
  // 中文站名转不出拉丁字符：用时间戳后缀保证唯一且可手改
  return `site-${Date.now().toString(36)}`;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** 下次出账日：每月 1 日凌晨的日批；今天已过 1 号则指向下月 1 号。 */
function nextChargeDate(now: Date): string {
  const next =
    now.getDate() === 1
      ? now
      : new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return next.toISOString().slice(0, 10);
}

function billingNote(
  entry: { amount: number; waived: boolean; rank: number } | undefined,
  settings: GeoSiteSettings,
): string {
  if (!entry) return '';
  if (entry.waived) return '本月在免费站点额度内，不扣积分';
  if (entry.amount <= 0) return '当前未启用计费或单价为 0';
  if (settings.graceHours > 0) {
    return `按月扣费，余额不足超 ${settings.graceHours} 小时停止公开访问（数据保留）`;
  }
  return '按月扣费，余额不足将停止公开访问（数据保留）';
}
