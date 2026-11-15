import { z } from "zod";
import { pageQuerySchema } from "./pagination";

const envelope = <T extends z.ZodType>(data: T) =>
  z.object({ code: z.number(), message: z.string(), data: data.nullable() });
const emptyQuery = z.object({});
const okResult = z.object({ ok: z.boolean(), message: z.string() });

/**
 * GEO 独立站（营销工具 · GEO · 建站）：拖拽元素树 + 平台子域发布 + 用户自助绑域名 + 按月扣积分。
 * 思路借鉴开源 Framely（MIT），但账号、积分、OSS、企业隔离全部复用本系统，不引入第二套体系。
 */

export const GEO_SITE_STATUSES = ["DRAFT", "PUBLISHED", "SUSPENDED"] as const;
export const GEO_SITE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  PUBLISHED: "已发布",
  SUSPENDED: "欠费停服",
};

/**
 * 停服有两种成因，列表要分得清：欠费是钱的事，处置是合规的事。
 * 库里只有 SUSPENDED 一个状态，靠 offReason（平台下线时必写）区分展示口径。
 */
export function geoSiteStatusLabel(status: string, offReason?: string) {
  if (offReason && status === "SUSPENDED") return "平台下线";
  return GEO_SITE_STATUS_LABELS[status] || status;
}

export const GEO_SITE_DOMAIN_STATUSES = [
  "PENDING",
  "VERIFYING",
  "ACTIVE",
  "ERROR",
  "DISABLED",
] as const;
export const GEO_SITE_DOMAIN_STATUS_LABELS: Record<string, string> = {
  PENDING: "待校验",
  VERIFYING: "校验中",
  ACTIVE: "已生效",
  ERROR: "校验失败",
  DISABLED: "平台停用",
};

/**
 * 元素树的对外 schema：只声明单层节点，子树与文案统一收成 JSON。
 * 递归的 z.lazy 树在 zod-to-openapi 生成 OpenAPI 时会无限展开直接把进程爆栈，
 * 因此深度的类型白名单（20 种元素）、嵌套 12 层、节点 2000 个与 2MB 体积上限
 * 全部由后端 `assertElementTree` 把关（比这里更严），前端编辑器自行声明递归类型。
 */
export const geoSiteElementSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().max(80).default(""),
  type: z.string().min(1).max(32),
  category: z.string().max(32).default(""),
  styles: z.record(z.string(), z.unknown()).default({}),
  content: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]),
});

export type GeoSiteElement = z.infer<typeof geoSiteElementSchema>;

export const geoSiteJsonldSchema = z
  .object({
    organization: z.boolean(),
    website: z.boolean(),
    product: z.boolean(),
    faq: z.boolean(),
  })
  .partial();

/** 站点级 SEO/GEO 档案：发布时写进 HTML 头，同时决定 robots / sitemap / llms.txt 输出。 */
export const geoSiteSeoSchema = z
  .object({
    title: z.string().max(120),
    description: z.string().max(500),
    keywords: z.array(z.string().max(60)).max(30),
    ogImage: z.string().max(1000),
    themeColor: z.string().max(32),
    lang: z.string().max(16),
    noindex: z.boolean(),
    llmsTxt: z.boolean(),
    jsonld: geoSiteJsonldSchema,
  })
  .partial();

export const geoSiteSeoDefaults: Required<z.infer<typeof geoSiteSeoSchema>> = {
  title: "",
  description: "",
  keywords: [],
  ogImage: "",
  themeColor: "",
  lang: "zh-CN",
  noindex: false,
  llmsTxt: true,
  jsonld: { organization: true, website: true, product: false, faq: false },
};

export const geoSiteDomainSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  domain: z.string(),
  status: z.string(),
  statusLabel: z.string(),
  isPrimary: z.boolean(),
  /** 校验指引：TXT 主机名与值、CNAME 目标，前端直接展示成可复制的行。 */
  verifyToken: z.string(),
  txtName: z.string(),
  txtValue: z.string(),
  cnameTarget: z.string(),
  lastError: z.string(),
  lastCheckAt: z.string().nullable(),
  createdAt: z.string(),
});

/** 与平台站点设置同一套语言清单：站点只能启用其中若干项，默认语言永远启用。 */
export const GEO_SITE_LANGUAGES = [
  "zh-CN",
  "en",
  "vi",
  "ja",
  "ar",
  "fr",
  "es",
  "ru",
] as const;

export const geoSiteLanguageSchema = z.enum(GEO_SITE_LANGUAGES);

export type GeoSiteLanguage = z.infer<typeof geoSiteLanguageSchema>;

/** 语言选择器选项：编辑器与站点设置共用，label 直接用本地语言名。 */
export const geoSiteLanguageOptionSchema = z.object({
  code: geoSiteLanguageSchema,
  label: z.string(),
});

export const geoSiteSchema = z.object({
  id: z.number(),
  title: z.string(),
  slug: z.string(),
  status: z.string(),
  statusLabel: z.string(),
  /** 默认语言：站内地址不带语言前缀，也是菜单缺译时的回落语言。 */
  defaultLanguage: geoSiteLanguageSchema,
  /** 已启用语言（含默认语言，按平台清单顺序）。 */
  languages: z.array(geoSiteLanguageSchema),
  geoProjectId: z.number(),
  geoProjectBrand: z.string(),
  ownerUserId: z.string(),
  enterpriseId: z.number(),
  favicon: z.string(),
  coverImage: z.string(),
  /** 平台子域访问地址（含协议），站内可直接点开。 */
  url: z.string(),
  primaryDomain: z.string(),
  domainCount: z.number(),
  activeDomainCount: z.number(),
  publishedAt: z.string().nullable(),
  suspendedAt: z.string().nullable(),
  /** 平台强制下线原因：建站者在停服提示里看到自己的处置说明。 */
  offReason: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** 本站本月费用（积分），0 表示在免费额内或价目未启用。 */
  monthlyPoints: z.number(),
  billingNote: z.string(),
  /** 站点级第三方脚本注入开关：关闭后本站所有页面都不再挂脚本。 */
  scriptsEnabled: z.boolean(),
});

export const geoSiteDetailSchema = geoSiteSchema.extend({
  seo: geoSiteSeoSchema,
  content: z.array(geoSiteElementSchema),
  published: z.boolean(),
  publishedContent: z.array(geoSiteElementSchema),
  domains: z.array(geoSiteDomainSchema),
});

/**
 * 模板卡片所需的全部展示信息：前端选择器靠 tag/theme/accent/heroBg/sections
 * 画出缩略图与要点清单，不需要把整棵元素树拉到列表页。
 */
export const geoSiteTemplateSchema = z.object({
  key: z.string(),
  name: z.string(),
  desc: z.string(),
  /** 分类标签，例：品牌官网 / 电商单品。 */
  tag: z.string(),
  /** 首屏明暗：缩略图上的文字颜色据此决定。 */
  theme: z.enum(["light", "dark"]),
  /** 主色（十六进制）。 */
  accent: z.string().max(32),
  /** 首屏背景，可能是渐变串。 */
  heroBg: z.string().max(120),
  /** 顶层区块名清单（最多 12 个），展示这套模板包含哪些部分。 */
  sections: z.array(z.string().max(24)).max(12),
  /** 元素节点数，用于提示模板体量。 */
  elements: z.number(),
});

/** 平台预置的常用第三方脚本：编辑器只展示「哪些域名已经放行」，用户仍然自己粘外链。 */
export const geoSiteScriptPresetSchema = z.object({
  key: z.string(),
  label: z.string(),
  desc: z.string(),
  /** 已收录进平台白名单的域名模式（可能含 * 通配） */
  hosts: z.array(z.string()),
});

export const geoSiteMetaSchema = z.object({
  templates: z.array(geoSiteTemplateSchema),
  /** 平台子域根域名，例：aiworkin.com → 站点访问 {slug}.aiworkin.com */
  rootDomain: z.string(),
  /** 站点数量上限（按企业/账号），来自平台设置 */
  maxSites: z.number(),
  /** 单站点可绑定域名上限，来自平台设置（域名面板绑定前要用它做前置阻断） */
  maxDomainsPerSite: z.number(),
  customDomainEnabled: z.boolean(),
  needsIcpAck: z.boolean(),
  /** 可选语言清单：站点设置里的多语言勾选项由它渲染。 */
  languageOptions: z.array(geoSiteLanguageOptionSchema),
  monthPrice: z.number(),
  freeSites: z.number(),
  minCharge: z.number(),
  pricingEnabled: z.boolean(),
  graceHours: z.number(),
  /** 当前可见站点总数与剩余额度，列表页头部直接用，省一次分页计数。 */
  total: z.number(),
  remaining: z.number(),
  /** 页面自定义脚本：平台总开关 + 已放行域名 + 单页上限，编辑器脚本面板据此提示 */
  customScriptEnabled: z.boolean(),
  scriptHostWhitelist: z.array(z.string()),
  maxScriptsPerPage: z.number(),
  scriptPresets: z.array(geoSiteScriptPresetSchema),
});

export const geoSiteBillingSchema = z.object({
  code: z.string(),
  siteId: z.number(),
  monthPrice: z.number(),
  freeSites: z.number(),
  pricingEnabled: z.boolean(),
  currentMonthPoints: z.number(),
  nextChargeDate: z.string(),
  bills: z.array(
    z.object({
      periodMonth: z.string(),
      days: z.number(),
      pointsAmount: z.number(),
      status: z.string(),
    }),
  ),
});

export const geoSiteSettingsSchema = z.object({
  customDomainEnabled: z.boolean(),
  /** 域名访问总开关：关闭后 by-host 一律不认站，只保留本站路径 /geo-site/{标识}。 */
  hostAccessEnabled: z.boolean(),
  /** 平台子域根域名覆盖，留空时取「站点域名」的主机名。 */
  rootDomainOverride: z.string().max(253),
  /** 自定义域名 CNAME 目标覆盖，留空时取「站点域名」的主机名。 */
  cnameTargetOverride: z.string().max(253),
  needsIcpAck: z.boolean(),
  maxSitesPerOwner: z.number(),
  maxDomainsPerSite: z.number(),
  graceHours: z.number(),
  suspendOnArrears: z.boolean(),
  /** 第三方脚本总开关：关闭后所有站点一律不注入，保存也拒绝。 */
  customScriptEnabled: z.boolean(),
  /** 脚本域名白名单：支持 `*.example.com` 后缀通配，空数组＝全禁。 */
  scriptHostWhitelist: z.array(z.string().max(120)),
  maxScriptsPerPage: z.number(),
});

/** 「总数 + 已发布数」：平台统计卡片里页面/文章/产品都用这一个形状。 */
const countedSchema = z.object({ total: z.number(), published: z.number() });

export const geoSiteAdminStatsSchema = z.object({
  total: z.number(),
  published: z.number(),
  suspended: z.number(),
  draft: z.number(),
  domains: z.object({ total: z.number(), active: z.number(), error: z.number() }),
  chargedThisMonth: z.number(),
  /** CMS 体量：页面与内容库各有多少、其中多少已进线上快照，供平台侧治理与合规排查用。 */
  pages: countedSchema,
  articles: countedSchema,
  products: countedSchema,
});

/** 平台侧域名台账行：带站点与归属账号，出问题时能直接定位到人。 */
export const geoSiteAdminDomainSchema = geoSiteDomainSchema.extend({
  siteTitle: z.string(),
  siteSlug: z.string(),
  siteStatus: z.string(),
  ownerUserId: z.string(),
  ownerLabel: z.string(),
});

export const geoSiteAdminDomainListSchema = z.object({
  list: z.array(geoSiteAdminDomainSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});

/**
 * 域名接入配置卡：管理端把生效值一次拿全，直接复制到 DNS / 反代配置里。
 * rootDomain/cnameTarget 为空表示平台还没配站点域名，页面要引导先去配置。
 */
export const geoSiteAdminAccessGuideSchema = z.object({
  hostAccessEnabled: z.boolean(),
  customDomainEnabled: z.boolean(),
  needsIcpAck: z.boolean(),
  maxDomainsPerSite: z.number(),
  rootDomain: z.string(),
  cnameTarget: z.string(),
  wildcardDomain: z.string(),
  probePath: z.string(),
  txtPrefix: z.string(),
});

/** 回源自检结果：reason 决定前端展示哪种修复指引。 */
export const geoSiteAdminResolveHostSchema = z.object({
  host: z.string(),
  matched: z.boolean(),
  reason: z.string(),
  message: z.string(),
  siteId: z.number(),
  siteTitle: z.string(),
  siteSlug: z.string(),
  siteStatus: z.string(),
  via: z.string(),
  rootDomain: z.string(),
});

// --- 请求体 ---
const idBody = z.object({ id: z.number().int().positive() });

export const geoSiteCreateBodySchema = z.object({
  title: z.string().min(1).max(120),
  template: z.string().max(40).default(""),
  geoProjectId: z.number().int().nonnegative().default(0),
  defaultLanguage: geoSiteLanguageSchema.optional(),
  /** 启用语言：省略时只启用默认语言。 */
  languages: z.array(geoSiteLanguageSchema).max(8).optional(),
});

export const geoSiteUpdateBodySchema = idBody.extend({
  title: z.string().min(1).max(120).optional(),
  slug: z.string().max(63).optional(),
  geoProjectId: z.number().int().nonnegative().optional(),
  defaultLanguage: geoSiteLanguageSchema.optional(),
  languages: z.array(geoSiteLanguageSchema).max(8).optional(),
  favicon: z.string().max(500).optional(),
  coverImage: z.string().max(500).optional(),
  seo: geoSiteSeoSchema.optional(),
  /** 本站脚本注入开关：平台开关之下、域名闸门之上的站点级一道，默认开启。 */
  scriptsEnabled: z.boolean().optional(),
});

export const geoSiteContentBodySchema = idBody.extend({
  content: z.array(geoSiteElementSchema),
});

export const geoSiteDomainBindBodySchema = z.object({
  siteId: z.number().int().positive(),
  domain: z.string().min(4).max(253),
  /** 备案 / 证书 / 内容责任承诺：平台要求承诺时不勾选即拒绝绑定（与活码域名同口径）。 */
  icpAcknowledged: z.boolean().default(false),
});

export const geoSiteDomainIdBodySchema = z.object({
  domainId: z.number().int().positive(),
});

export const geoSiteOfflineBodySchema = z.object({
  id: z.number().int().positive(),
  reason: z.string().max(500).default(""),
});

export const geoSiteAdminSettingsBodySchema = geoSiteSettingsSchema.partial();

export const geoSiteAdminPageQuerySchema = pageQuerySchema.extend({
  q: z.string().max(120).optional(),
  status: z.string().max(16).optional(),
});

export const geoSiteAdminDomainQuerySchema = pageQuerySchema.extend({
  q: z.string().max(120).optional(),
  status: z.string().max(16).optional(),
});

export const geoSiteAdminResolveQuerySchema = z.object({
  host: z.string().min(1).max(253),
});

export const geoSitePageItemSchema = geoSiteSchema.extend({
  ownerLabel: z.string(),
});

// ---------------------------- 站点 CMS：页面 / 菜单 / 内容 ----------------------------

/**
 * 页面第三方脚本：只允许 https 外链，主机必须在平台白名单内（后端逐条校验并回拒）。
 * 内联脚本、事件属性、javascript:/data: 一律不进契约，前端也没有入口。
 */
export const geoSiteScriptEntrySchema = z.object({
  src: z.string().min(8).max(500),
  /** 注入位置：head 适合统计，body 适合客服悬浮窗 */
  position: z.enum(["head", "body"]).default("body"),
  label: z.string().max(60).default(""),
});

export type GeoSiteScriptEntry = z.infer<typeof geoSiteScriptEntrySchema>;

export const GEO_SITE_PAGE_KINDS = [
  "landing",
  "articleList",
  "articleDetail",
  "productList",
  "productDetail",
  "blank",
  "custom",
] as const;

/** 页面清单行：编辑器左侧页面面板一次拿全，不含正文。 */
export const geoSitePageViewSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  /** 页面语言：默认语言地址不带前缀，其余语言落在 /{lang}/... 下。 */
  lang: geoSiteLanguageSchema,
  langLabel: z.string(),
  /** 站内路径（'' = 该语言首页） */
  path: z.string(),
  /** 相对站根的链接 */
  href: z.string(),
  title: z.string(),
  kind: z.string(),
  kindLabel: z.string(),
  isHome: z.boolean(),
  contentType: z.string(),
  pageSize: z.number(),
  sort: z.number(),
  status: z.string(),
  hasContent: z.boolean(),
  published: z.boolean(),
  scriptCount: z.number(),
  publishedAt: z.string().nullable(),
  updatedAt: z.string(),
});

/** 页面详情：草稿元素树 + SEO + 脚本，编辑器进入一页要用的全部数据。 */
export const geoSitePageDetailSchema = geoSitePageViewSchema.extend({
  content: z.array(geoSiteElementSchema),
  seo: geoSiteSeoSchema,
  scripts: z.array(geoSiteScriptEntrySchema),
  publishedContent: z.array(geoSiteElementSchema),
});

/** 脚本保存结果：被拒的条目连原因一起回，前端才给得出「为什么没生效」。 */
export const geoSiteScriptSaveResultSchema = z.object({
  pageId: z.number(),
  scripts: z.array(geoSiteScriptEntrySchema),
  rejected: z.array(z.object({ src: z.string(), reason: z.string() })),
  whitelist: z.array(z.string()),
  message: z.string(),
});

export const geoSitePageBootstrapSchema = z.object({
  pages: z.array(geoSitePageViewSchema),
  homeId: z.number(),
  /** 站点语言口径：编辑器据此渲染语言切换与「复制到其他语言」的候选。 */
  defaultLanguage: geoSiteLanguageSchema,
  languages: z.array(geoSiteLanguageSchema),
  languageOptions: z.array(geoSiteLanguageOptionSchema),
  templates: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      group: z.string(),
      desc: z.string(),
    }),
  ),
});

/**
 * 菜单节点（草稿态带编辑字段）。
 * children 收成 JSON：z.lazy 的递归 schema 会让 zod-to-openapi 无限展开直接把生成进程爆栈，
 * 与元素树同一套取舍——层级形状由后端 saveTree 的校验把关，契约只描述单层。
 */
export const geoSiteMenuItemSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  /** 菜单语言：公开导航按访客语言取，缺译时整层回落默认语言。 */
  lang: geoSiteLanguageSchema,
  location: z.string(),
  parentId: z.number(),
  label: z.string(),
  /** PAGE | ARTICLE | PRODUCT | URL | ANCHOR */
  targetType: z.string(),
  targetId: z.number(),
  url: z.string(),
  sort: z.number(),
  visible: z.boolean(),
  openNewTab: z.boolean(),
  children: z.array(z.unknown()),
});

export const geoSiteContentItemSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  kind: z.string(),
  /** 内容语言：列表、详情与关联推荐都按语言隔离。 */
  lang: geoSiteLanguageSchema,
  langLabel: z.string(),
  title: z.string(),
  slug: z.string(),
  summary: z.string(),
  category: z.string(),
  coverImage: z.string(),
  tags: z.array(z.string()),
  status: z.string(),
  viewCount: z.number(),
  sort: z.number(),
  publishedAt: z.string().nullable(),
  updatedAt: z.string(),
  authorName: z.string().optional(),
  relatedIds: z.array(z.number()).optional(),
  price: z.number().optional(),
  unit: z.string().optional(),
  priceOnAsk: z.boolean().optional(),
  specs: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
  buyUrl: z.string().optional(),
  featured: z.boolean().optional(),
});

export const geoSiteContentDetailSchema = geoSiteContentItemSchema.extend({
  body: z.array(geoSiteElementSchema),
  gallery: z.array(z.string().max(1000)),
  faqs: z.array(z.object({ question: z.string(), answer: z.string() })),
  seo: geoSiteSeoSchema,
});

/** 菜单/列表页选择器用的候选清单：只给 id、标题、slug，避免把正文拖进编辑器。 */
export const geoSiteContentPickerSchema = z.object({
  defaultLanguage: geoSiteLanguageSchema,
  languages: z.array(geoSiteLanguageSchema),
  languageOptions: z.array(geoSiteLanguageOptionSchema),
  pages: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      path: z.string(),
      lang: geoSiteLanguageSchema,
      kind: z.string(),
      isHome: z.boolean(),
      status: z.string(),
      /** 语言前缀后的站内链接，菜单预览直接可用 */
      href: z.string(),
    }),
  ),
  articles: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      slug: z.string(),
      lang: geoSiteLanguageSchema,
      status: z.string(),
      category: z.string(),
    }),
  ),
  products: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      slug: z.string(),
      lang: geoSiteLanguageSchema,
      status: z.string(),
      category: z.string(),
    }),
  ),
});

const pageIdBody = z.object({ id: z.number().int().positive() });
const siteIdBody = z.object({ siteId: z.number().int().positive() });

export const geoSitePageCreateBodySchema = siteIdBody.extend({
  lang: geoSiteLanguageSchema.optional(),
  path: z.string().max(180).default(""),
  title: z.string().min(1).max(120),
  kind: z.enum(GEO_SITE_PAGE_KINDS).default("custom"),
  contentType: z.string().max(16).default(""),
  template: z.string().max(40).default(""),
  pageSize: z.number().int().min(1).max(60).optional(),
  sort: z.number().int().nonnegative().optional(),
});

export const geoSitePageUpdateBodySchema = pageIdBody.extend({
  lang: geoSiteLanguageSchema.optional(),
  path: z.string().max(180).optional(),
  title: z.string().min(1).max(120).optional(),
  kind: z.enum(GEO_SITE_PAGE_KINDS).optional(),
  contentType: z.string().max(16).optional(),
  pageSize: z.number().int().min(1).max(60).optional(),
  sort: z.number().int().nonnegative().optional(),
  seo: geoSiteSeoSchema.optional(),
});

export const geoSitePageContentBodySchema = pageIdBody.extend({
  content: z.array(geoSiteElementSchema),
});

/** 复制页面到另一种语言：路径保持不变，正文/SEO/脚本整棵带过去，新页面从草稿起步。 */
export const geoSitePageCopyBodySchema = pageIdBody.extend({
  lang: geoSiteLanguageSchema,
  title: z.string().max(120).optional(),
});

export const geoSitePageScriptsBodySchema = pageIdBody.extend({
  scripts: z.array(geoSiteScriptEntrySchema),
});

export const geoSitePageReorderBodySchema = siteIdBody.extend({
  ids: z.array(z.number().int().positive()).max(200),
});

export const geoSitePageQuerySchema = z.object({
  siteId: z.coerce.number().int().positive(),
});

export const geoSitePageIdQuerySchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const geoSiteMenuListQuerySchema = siteIdQuery({
  location: z.string().max(16).optional(),
  lang: geoSiteLanguageSchema.optional(),
});

export const geoSiteMenuCreateBodySchema = siteIdBody.extend({
  lang: geoSiteLanguageSchema.optional(),
  location: z.enum(["HEADER", "FOOTER"]).default("HEADER"),
  parentId: z.number().int().nonnegative().default(0),
  label: z.string().min(1).max(60),
  targetType: z.enum(["PAGE", "ARTICLE", "PRODUCT", "URL", "ANCHOR"]).default("PAGE"),
  targetId: z.number().int().nonnegative().default(0),
  url: z.string().max(500).default(""),
  sort: z.number().int().nonnegative().default(0),
  visible: z.boolean().default(true),
  openNewTab: z.boolean().default(false),
});

export const geoSiteMenuUpdateBodySchema = pageIdBody.extend({
  lang: geoSiteLanguageSchema.optional(),
  label: z.string().min(1).max(60).optional(),
  parentId: z.number().int().nonnegative().optional(),
  targetType: z
    .enum(["PAGE", "ARTICLE", "PRODUCT", "URL", "ANCHOR"])
    .optional(),
  targetId: z.number().int().nonnegative().optional(),
  url: z.string().max(500).optional(),
  sort: z.number().int().nonnegative().optional(),
  visible: z.boolean().optional(),
  openNewTab: z.boolean().optional(),
});

/** 整棵菜单树一次性保存位置与层级：拖拽排序只改 id/parentId/sort，字段编辑走 update。 */
export const geoSiteMenuTreeBodySchema = siteIdBody.extend({
  location: z.enum(["HEADER", "FOOTER"]).default("HEADER"),
  /** 省略时保存该位置下全部语言，前端按当前语言分栏编辑时随附。 */
  lang: geoSiteLanguageSchema.optional(),
  items: z
    .array(
      z.object({
        id: z.number().int().positive(),
        parentId: z.number().int().nonnegative().default(0),
        sort: z.number().int().nonnegative().default(0),
      }),
    )
    .max(200),
});

export const GEO_SITE_CONTENT_KINDS = ["article", "product"] as const;

const contentKindField = {
  kind: z.enum(GEO_SITE_CONTENT_KINDS).default("article"),
};

export const geoSiteContentListQuerySchema = z.object({
  ...contentKindField,
  siteId: z.coerce.number().int().positive(),
  lang: geoSiteLanguageSchema.optional(),
  status: z.string().max(16).optional(),
  q: z.string().max(60).optional(),
  category: z.string().max(60).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const geoSiteContentIdQuerySchema = z.object({
  ...contentKindField,
  id: z.coerce.number().int().positive(),
});

export const geoSiteContentCreateBodySchema = siteIdBody.extend({
  ...contentKindField,
  lang: geoSiteLanguageSchema.optional(),
  title: z.string().min(1).max(200),
  slug: z.string().max(120).default(""),
  summary: z.string().max(500).default(""),
  category: z.string().max(60).default(""),
  coverImage: z.string().max(1000).default(""),
  gallery: z.array(z.string().max(1000)).max(20).default([]),
  tags: z.array(z.string().max(30)).max(12).default([]),
  faqs: z
    .array(z.object({ question: z.string().max(300), answer: z.string().max(2000) }))
    .max(30)
    .default([]),
  authorName: z.string().max(60).default(""),
  relatedIds: z.array(z.number().int().positive()).max(20).default([]),
  price: z.number().nonnegative().default(0),
  unit: z.string().max(20).default(""),
  priceOnAsk: z.boolean().default(false),
  specs: z
    .array(z.object({ name: z.string().max(60), value: z.string().max(300) }))
    .max(40)
    .default([]),
  buyUrl: z.string().max(1000).default(""),
  featured: z.boolean().default(false),
  sort: z.number().int().nonnegative().optional(),
  seo: geoSiteSeoSchema.optional(),
});

export const geoSiteContentUpdateBodySchema = geoSiteContentCreateBodySchema
  .partial()
  .extend({ id: z.number().int().positive(), kind: z.enum(GEO_SITE_CONTENT_KINDS) });

export const geoSiteContentBodyBodySchema = pageIdBody.extend({
  ...contentKindField,
  content: z.array(geoSiteElementSchema),
});

export const geoSiteContentActionBodySchema = pageIdBody.extend(contentKindField);

/**
 * 模板库：BLOCK = 可复用区块（画布选中的单个元素），PAGE = 整页另存。
 * 两者共用元素树，套用只是插入位置不同，因此一张表、一个 kind 字段够用。
 */
export const GEO_SITE_TEMPLATE_KINDS = ["BLOCK", "PAGE"] as const;

export const geoSiteSavedTemplateSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  kind: z.string(),
  kindLabel: z.string(),
  name: z.string(),
  note: z.string(),
  /** 顶层元素个数：列表页据此提示「空模板」 */
  elementCount: z.number(),
  updatedAt: z.string(),
});

export const geoSiteSavedTemplateDetailSchema = geoSiteSavedTemplateSchema.extend({
  content: z.array(geoSiteElementSchema),
});

export const geoSiteTemplateListQuerySchema = siteIdQuery({
  kind: z.enum(GEO_SITE_TEMPLATE_KINDS).optional(),
});

export const geoSiteTemplateSaveBodySchema = siteIdBody.extend({
  id: z.number().int().positive().optional(),
  kind: z.enum(GEO_SITE_TEMPLATE_KINDS).default("BLOCK"),
  name: z.string().min(1).max(60),
  note: z.string().max(200).default(""),
  content: z.array(geoSiteElementSchema).min(1),
});

/** 套用：PAGE 模板整页替换，BLOCK 模板按模式插入。 */
export const geoSiteTemplateApplyBodySchema = z.object({
  templateId: z.number().int().positive(),
  pageId: z.number().int().positive(),
  mode: z.enum(["replace", "append", "prepend"]).default("append"),
});

export const geoSiteTemplateIdBodySchema = z.object({
  id: z.number().int().positive(),
});

/** 查询参数一律 coerce：GET 传的是字符串，不转换会在校验阶段就报 invalid_type。 */
export const geoSiteTemplateIdQuerySchema = z.object({
  id: z.coerce.number().int().positive(),
});

/** 发布台账：一次发布留一行，只读展示，不作为业务状态来源。 */
export const geoSitePublishLogSchema = z.object({
  id: z.number(),
  siteId: z.number(),
  targetKind: z.string(),
  targetKindLabel: z.string(),
  targetId: z.number(),
  label: z.string(),
  note: z.string(),
  operator: z.string(),
  createdAt: z.string(),
});

export const geoSitePublishLogQuerySchema = z.object({
  siteId: z.coerce.number().int().positive(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const geoSitePublishLogResultSchema = z.object({
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  items: z.array(geoSitePublishLogSchema),
});

export const geoSiteContentPageResultSchema = z.object({
  kind: z.string(),
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  items: z.array(geoSiteContentItemSchema),
});

function siteIdQuery<T extends z.ZodRawShape>(extra: T) {
  return z.object({ siteId: z.coerce.number().int().positive(), ...extra });
}

/** GEO 建站端点：`GeoSite_*` 走企业侧站点，`GeoSiteAdmin_*` 走平台管理侧，
 *  `GeoSitePage_*` / `GeoSiteMenu_*` / `GeoSiteContent_*` 是站点 CMS 三块，
 *  全部由 moduleHandlers 按 operationId 前缀自动挂到控制器方法上。 */
export const geoSiteEndpoints = {
  GeoSite_meta: {
    method: "get" as const,
    path: "/enterprise/geo/site/meta",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(geoSiteMetaSchema),
  },
  GeoSite_list: {
    method: "get" as const,
    path: "/enterprise/geo/site/list",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.array(geoSiteSchema)),
  },
  GeoSite_create: {
    method: "post" as const,
    path: "/enterprise/geo/site/create",
    params: z.object({}),
    query: emptyQuery,
    body: geoSiteCreateBodySchema,
    response: envelope(geoSiteDetailSchema),
  },
  GeoSite_detail: {
    method: "get" as const,
    path: "/enterprise/geo/site/detail",
    params: z.object({}),
    query: z.object({ id: z.coerce.number().int().positive() }),
    body: z.undefined(),
    response: envelope(geoSiteDetailSchema),
  },
  GeoSite_update: {
    method: "post" as const,
    path: "/enterprise/geo/site/update",
    params: z.object({}),
    query: emptyQuery,
    body: geoSiteUpdateBodySchema,
    response: envelope(geoSiteDetailSchema),
  },
  GeoSite_saveContent: {
    method: "post" as const,
    path: "/enterprise/geo/site/content",
    params: z.object({}),
    query: emptyQuery,
    body: geoSiteContentBodySchema,
    response: envelope(geoSiteDetailSchema),
  },
  GeoSite_publish: {
    method: "post" as const,
    path: "/enterprise/geo/site/publish",
    params: z.object({}),
    query: emptyQuery,
    body: idBody,
    response: envelope(geoSiteDetailSchema),
  },
  GeoSite_unpublish: {
    method: "post" as const,
    path: "/enterprise/geo/site/unpublish",
    params: z.object({}),
    query: emptyQuery,
    body: idBody,
    response: envelope(geoSiteDetailSchema),
  },
  GeoSite_duplicate: {
    method: "post" as const,
    path: "/enterprise/geo/site/duplicate",
    params: z.object({}),
    query: emptyQuery,
    body: idBody,
    response: envelope(geoSiteDetailSchema),
  },
  GeoSite_remove: {
    method: "post" as const,
    path: "/enterprise/geo/site/remove",
    params: z.object({}),
    query: emptyQuery,
    body: idBody,
    response: envelope(okResult),
  },
  GeoSite_domains: {
    method: "get" as const,
    path: "/enterprise/geo/site/domains",
    params: z.object({}),
    query: z.object({ siteId: z.coerce.number().int().positive() }),
    body: z.undefined(),
    response: envelope(z.array(geoSiteDomainSchema)),
  },
  GeoSite_bindDomain: {
    method: "post" as const,
    path: "/enterprise/geo/site/domain/bind",
    params: z.object({}),
    query: emptyQuery,
    body: geoSiteDomainBindBodySchema,
    response: envelope(geoSiteDomainSchema),
  },
  GeoSite_verifyDomain: {
    method: "post" as const,
    path: "/enterprise/geo/site/domain/verify",
    params: z.object({}),
    query: emptyQuery,
    body: geoSiteDomainIdBodySchema,
    response: envelope(geoSiteDomainSchema),
  },
  GeoSite_removeDomain: {
    method: "post" as const,
    path: "/enterprise/geo/site/domain/remove",
    params: z.object({}),
    query: emptyQuery,
    body: geoSiteDomainIdBodySchema,
    response: envelope(okResult),
  },
  GeoSite_setPrimaryDomain: {
    method: "post" as const,
    path: "/enterprise/geo/site/domain/primary",
    params: z.object({}),
    query: emptyQuery,
    body: geoSiteDomainIdBodySchema,
    response: envelope(z.array(geoSiteDomainSchema)),
  },
  GeoSite_billing: {
    method: "get" as const,
    path: "/enterprise/geo/site/billing",
    params: z.object({}),
    query: z.object({ siteId: z.coerce.number().int().positive() }),
    body: z.undefined(),
    response: envelope(geoSiteBillingSchema),
  },

  // 平台管理后台
  GeoSiteAdmin_getSettings: {
    method: "get" as const,
    path: "/enterprise/admin/geo-site/settings",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(geoSiteSettingsSchema),
  },
  GeoSiteAdmin_saveSettings: {
    method: "put" as const,
    path: "/enterprise/admin/geo-site/settings",
    params: z.object({}),
    query: emptyQuery,
    body: geoSiteAdminSettingsBodySchema,
    response: envelope(geoSiteSettingsSchema),
  },
  GeoSiteAdmin_page: {
    method: "get" as const,
    path: "/enterprise/admin/geo-site/page",
    params: z.object({}),
    query: geoSiteAdminPageQuerySchema,
    body: z.undefined(),
    response: envelope(
      z.object({
        list: z.array(geoSitePageItemSchema),
        total: z.number(),
        page: z.number(),
        pageSize: z.number(),
      }),
    ),
  },
  GeoSiteAdmin_offline: {
    method: "post" as const,
    path: "/enterprise/admin/geo-site/offline",
    params: z.object({}),
    query: emptyQuery,
    body: geoSiteOfflineBodySchema,
    response: envelope(geoSiteDetailSchema),
  },
  /** 解除合规下线：处置是人工下的，也只能由人工撤。 */
  GeoSiteAdmin_online: {
    method: "post" as const,
    path: "/enterprise/admin/geo-site/online",
    params: z.object({}),
    query: emptyQuery,
    body: idBody,
    response: envelope(geoSiteDetailSchema),
  },
  GeoSiteAdmin_stats: {
    method: "get" as const,
    path: "/enterprise/admin/geo-site/stats",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(geoSiteAdminStatsSchema),
  },

  // ---------- 平台管理后台 · 域名接入 ----------
  GeoSiteAdmin_domainGuide: {
    method: "get" as const,
    path: "/enterprise/admin/geo-site/domain/guide",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(geoSiteAdminAccessGuideSchema),
  },
  GeoSiteAdmin_domainList: {
    method: "get" as const,
    path: "/enterprise/admin/geo-site/domains",
    params: z.object({}),
    query: geoSiteAdminDomainQuerySchema,
    body: z.undefined(),
    response: envelope(geoSiteAdminDomainListSchema),
  },
  /** 平台侧手动复检：与用户点「校验」同一条链路，结果写回同一行。 */
  GeoSiteAdmin_domainCheck: {
    method: "post" as const,
    path: "/enterprise/admin/geo-site/domain/check",
    params: z.object({}),
    query: emptyQuery,
    body: geoSiteDomainIdBodySchema,
    response: envelope(geoSiteDomainSchema),
  },
  /** 平台侧解除绑定：确认恶意 / 错误绑定时使用。 */
  GeoSiteAdmin_domainRemove: {
    method: "post" as const,
    path: "/enterprise/admin/geo-site/domain/remove",
    params: z.object({}),
    query: emptyQuery,
    body: geoSiteDomainIdBodySchema,
    response: envelope(okResult),
  },
  /** 回源自检：输入 Host，逐层说明为什么能/不能访问。 */
  GeoSiteAdmin_domainResolve: {
    method: "get" as const,
    path: "/enterprise/admin/geo-site/domain/resolve",
    params: z.object({}),
    query: geoSiteAdminResolveQuerySchema,
    body: z.undefined(),
    response: envelope(geoSiteAdminResolveHostSchema),
  },

  // ---------- 站点 CMS · 页面 ----------
  GeoSitePage_bootstrap: {
    method: "get" as const,
    path: "/enterprise/geo/site/page/bootstrap",
    params: z.object({}),
    query: geoSitePageQuerySchema,
    body: z.undefined(),
    response: envelope(geoSitePageBootstrapSchema),
  },
  GeoSitePage_list: {
    method: "get" as const,
    path: "/enterprise/geo/site/page/list",
    params: z.object({}),
    query: geoSitePageQuerySchema,
    body: z.undefined(),
    response: envelope(z.array(geoSitePageViewSchema)),
  },
  GeoSitePage_detail: {
    method: "get" as const,
    path: "/enterprise/geo/site/page/detail",
    params: z.object({}),
    query: geoSitePageIdQuerySchema,
    body: z.undefined(),
    response: envelope(geoSitePageDetailSchema),
  },
  GeoSitePage_create: {
    method: "post" as const,
    path: "/enterprise/geo/site/page/create",
    params: z.object({}),
    query: emptyQuery,
    body: geoSitePageCreateBodySchema,
    response: envelope(geoSitePageViewSchema),
  },
  GeoSitePage_update: {
    method: "post" as const,
    path: "/enterprise/geo/site/page/update",
    params: z.object({}),
    query: emptyQuery,
    body: geoSitePageUpdateBodySchema,
    response: envelope(geoSitePageDetailSchema),
  },
  GeoSitePage_copyToLanguage: {
    method: "post" as const,
    path: "/enterprise/geo/site/page/copy",
    params: z.object({}),
    query: emptyQuery,
    body: geoSitePageCopyBodySchema,
    response: envelope(geoSitePageViewSchema),
  },
  GeoSitePage_saveContent: {
    method: "post" as const,
    path: "/enterprise/geo/site/page/content",
    params: z.object({}),
    query: emptyQuery,
    body: geoSitePageContentBodySchema,
    response: envelope(geoSitePageDetailSchema),
  },
  GeoSitePage_saveScripts: {
    method: "post" as const,
    path: "/enterprise/geo/site/page/scripts",
    params: z.object({}),
    query: emptyQuery,
    body: geoSitePageScriptsBodySchema,
    response: envelope(geoSiteScriptSaveResultSchema),
  },
  GeoSitePage_reorder: {
    method: "post" as const,
    path: "/enterprise/geo/site/page/reorder",
    params: z.object({}),
    query: emptyQuery,
    body: geoSitePageReorderBodySchema,
    response: envelope(z.array(geoSitePageViewSchema)),
  },
  GeoSitePage_setHome: {
    method: "post" as const,
    path: "/enterprise/geo/site/page/home",
    params: z.object({}),
    query: emptyQuery,
    body: pageIdBody,
    response: envelope(z.array(geoSitePageViewSchema)),
  },
  GeoSitePage_publish: {
    method: "post" as const,
    path: "/enterprise/geo/site/page/publish",
    params: z.object({}),
    query: emptyQuery,
    body: pageIdBody,
    response: envelope(geoSitePageDetailSchema),
  },
  GeoSitePage_offline: {
    method: "post" as const,
    path: "/enterprise/geo/site/page/offline",
    params: z.object({}),
    query: emptyQuery,
    body: pageIdBody,
    response: envelope(geoSitePageDetailSchema),
  },
  GeoSitePage_remove: {
    method: "post" as const,
    path: "/enterprise/geo/site/page/remove",
    params: z.object({}),
    query: emptyQuery,
    body: pageIdBody,
    response: envelope(okResult),
  },

  // ---------- 站点 CMS · 菜单 ----------
  GeoSiteMenu_list: {
    method: "get" as const,
    path: "/enterprise/geo/site/menu/list",
    params: z.object({}),
    query: geoSiteMenuListQuerySchema,
    body: z.undefined(),
    response: envelope(z.array(geoSiteMenuItemSchema)),
  },
  GeoSiteMenu_create: {
    method: "post" as const,
    path: "/enterprise/geo/site/menu/create",
    params: z.object({}),
    query: emptyQuery,
    body: geoSiteMenuCreateBodySchema,
    response: envelope(geoSiteMenuItemSchema),
  },
  GeoSiteMenu_update: {
    method: "post" as const,
    path: "/enterprise/geo/site/menu/update",
    params: z.object({}),
    query: emptyQuery,
    body: geoSiteMenuUpdateBodySchema,
    response: envelope(geoSiteMenuItemSchema),
  },
  GeoSiteMenu_remove: {
    method: "post" as const,
    path: "/enterprise/geo/site/menu/remove",
    params: z.object({}),
    query: emptyQuery,
    body: pageIdBody,
    response: envelope(okResult),
  },
  GeoSiteMenu_saveTree: {
    method: "post" as const,
    path: "/enterprise/geo/site/menu/tree",
    params: z.object({}),
    query: emptyQuery,
    body: geoSiteMenuTreeBodySchema,
    response: envelope(z.array(geoSiteMenuItemSchema)),
  },

  // ---------- 站点 CMS · 内容库（文章 / 产品） ----------
  GeoSiteContent_list: {
    method: "get" as const,
    path: "/enterprise/geo/site/content/list",
    params: z.object({}),
    query: geoSiteContentListQuerySchema,
    body: z.undefined(),
    response: envelope(geoSiteContentPageResultSchema),
  },
  GeoSiteContent_detail: {
    method: "get" as const,
    path: "/enterprise/geo/site/content/detail",
    params: z.object({}),
    query: geoSiteContentIdQuerySchema,
    body: z.undefined(),
    response: envelope(geoSiteContentDetailSchema),
  },
  GeoSiteContent_pickers: {
    method: "get" as const,
    path: "/enterprise/geo/site/content/pickers",
    params: z.object({}),
    query: geoSitePageQuerySchema,
    body: z.undefined(),
    response: envelope(geoSiteContentPickerSchema),
  },
  GeoSiteContent_create: {
    method: "post" as const,
    path: "/enterprise/geo/site/content/create",
    params: z.object({}),
    query: emptyQuery,
    body: geoSiteContentCreateBodySchema,
    response: envelope(geoSiteContentDetailSchema),
  },
  GeoSiteContent_update: {
    method: "post" as const,
    path: "/enterprise/geo/site/content/update",
    params: z.object({}),
    query: emptyQuery,
    body: geoSiteContentUpdateBodySchema,
    response: envelope(geoSiteContentDetailSchema),
  },
  GeoSiteContent_saveBody: {
    method: "post" as const,
    path: "/enterprise/geo/site/content/body",
    params: z.object({}),
    query: emptyQuery,
    body: geoSiteContentBodyBodySchema,
    response: envelope(geoSiteContentDetailSchema),
  },
  GeoSiteContent_publish: {
    method: "post" as const,
    path: "/enterprise/geo/site/content/publish",
    params: z.object({}),
    query: emptyQuery,
    body: geoSiteContentActionBodySchema,
    response: envelope(geoSiteContentDetailSchema),
  },
  GeoSiteContent_offline: {
    method: "post" as const,
    path: "/enterprise/geo/site/content/offline",
    params: z.object({}),
    query: emptyQuery,
    body: geoSiteContentActionBodySchema,
    response: envelope(geoSiteContentDetailSchema),
  },
  GeoSiteContent_remove: {
    method: "post" as const,
    path: "/enterprise/geo/site/content/remove",
    params: z.object({}),
    query: emptyQuery,
    body: geoSiteContentActionBodySchema,
    response: envelope(okResult),
  },

  // ---------- 站点 CMS · 模板库（区块 / 整页另存） ----------
  GeoSiteTemplate_list: {
    method: "get" as const,
    path: "/enterprise/geo/site/template/list",
    params: z.object({}),
    query: geoSiteTemplateListQuerySchema,
    body: z.undefined(),
    response: envelope(z.array(geoSiteSavedTemplateSchema)),
  },
  GeoSiteTemplate_detail: {
    method: "get" as const,
    path: "/enterprise/geo/site/template/detail",
    params: z.object({}),
    query: geoSiteTemplateIdQuerySchema,
    body: z.undefined(),
    response: envelope(geoSiteSavedTemplateDetailSchema),
  },
  GeoSiteTemplate_save: {
    method: "post" as const,
    path: "/enterprise/geo/site/template/save",
    params: z.object({}),
    query: emptyQuery,
    body: geoSiteTemplateSaveBodySchema,
    response: envelope(geoSiteSavedTemplateSchema),
  },
  GeoSiteTemplate_apply: {
    method: "post" as const,
    path: "/enterprise/geo/site/template/apply",
    params: z.object({}),
    query: emptyQuery,
    body: geoSiteTemplateApplyBodySchema,
    response: envelope(geoSitePageDetailSchema),
  },
  GeoSiteTemplate_remove: {
    method: "post" as const,
    path: "/enterprise/geo/site/template/remove",
    params: z.object({}),
    query: emptyQuery,
    body: geoSiteTemplateIdBodySchema,
    response: envelope(okResult),
  },

  // ---------- 发布台账（只读留痕） ----------
  GeoSite_publishLog: {
    method: "get" as const,
    path: "/enterprise/geo/site/publish-log",
    params: z.object({}),
    query: geoSitePublishLogQuerySchema,
    body: z.undefined(),
    response: envelope(geoSitePublishLogResultSchema),
  },
};
