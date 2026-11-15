import { randomBytes } from 'node:crypto';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';

/**
 * GEO 独立站公共口径：元素树校验、slug 与域名规范化、访问地址拼装。
 * 元素树结构与开源 Framely 的 EditorElement 同构（样式走内联 CSSProperties），
 * 但类型目录扩到营销落地页所需，且任何 URL 字段都要过协议白名单。
 */

/** 元素类型目录：前端 elements 面板与渲染器共用同一份，避免两处漂移。 */
export const GEO_SITE_ELEMENT_TYPES = [
  '__body',
  'container',
  '2Col',
  '3Col',
  'row',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'span',
  'image',
  'link',
  'button',
  'list',
  'video',
  'divider',
  'spacer',
  // 站点 CMS：以下类型不存内容本身，渲染时按页面上下文动态取数（导航/内容列表/详情正文）。
  'navBar',
  'footerNav',
  'postList',
  'postGrid',
  'articleBody',
  'articleMeta',
  'relatedPosts',
  'productList',
  'productGrid',
  'productInfo',
  'languageSwitcher',
] as const;

/** 动态元素：内容来自渲染上下文（菜单树、内容列表、详情行），不来自元素自身。 */
export const GEO_SITE_DYNAMIC_TYPES = new Set<string>([
  'navBar',
  'footerNav',
  'postList',
  'postGrid',
  'articleBody',
  'articleMeta',
  'relatedPosts',
  'productList',
  'productGrid',
  'productInfo',
  'languageSwitcher',
]);

/**
 * 独立站语言口径：与平台「站点设置 · 默认语言」同一份清单。
 * 默认语言走无前缀地址，其余语言在站内路径前加语言码（`/en/about`）。
 */
export const GEO_SITE_LANGUAGES = [
  'zh-CN',
  'en',
  'vi',
  'ja',
  'ar',
  'fr',
  'es',
  'ru',
] as const;

export const GEO_SITE_LANGUAGE_LABELS: Record<string, string> = {
  'zh-CN': '简体中文',
  en: 'English',
  vi: 'Tiếng Việt',
  ja: '日本語',
  ar: 'العربية',
  fr: 'Français',
  es: 'Español',
  ru: 'Русский',
};

/** 语言码归一化：大小写不敏感，未收录的语言一律落回默认值。 */
export function normalizeLanguage(value: unknown, fallback = 'zh-CN'): string {
  const raw = (typeof value === 'string' ? value : '').trim();
  const hit = GEO_SITE_LANGUAGES.find(
    (lang) => lang.toLowerCase() === raw.toLowerCase(),
  );
  return hit || fallback;
}

/** 启用语言列表：默认语言永远在内，按平台清单顺序去重。 */
export function normalizeLanguageList(
  raw: unknown,
  defaultLanguage: string,
): string[] {
  const def = normalizeLanguage(defaultLanguage);
  const list = Array.isArray(raw) ? raw : [];
  const enabled = new Set<string>([def]);
  for (const item of list) {
    const lang = normalizeLanguage(item, '');
    if (lang) enabled.add(lang);
  }
  return GEO_SITE_LANGUAGES.filter((lang) => enabled.has(lang));
}

/** 默认语言不带前缀；其余语言返回语言码，拼站内地址时用。 */
export function languagePrefix(lang: string, defaultLanguage: string): string {
  const normalized = normalizeLanguage(lang);
  return normalized === normalizeLanguage(defaultLanguage) ? '' : normalized;
}

/**
 * 公开路径拆语言：首段是已启用语言码时剥掉并返回语言，
 * 默认语言允许带前缀访问（`/zh-CN/about`），但规范地址仍然无前缀。
 */
export function splitLanguagePath(
  path: string,
  languages: string[],
  defaultLanguage: string,
): { lang: string; prefix: string; rest: string } {
  const def = normalizeLanguage(defaultLanguage);
  const raw = String(path || '').replace(/^\/+|\/+$/g, '');
  if (!raw) return { lang: def, prefix: '', rest: '' };
  const parts = raw.split('/');
  const first = parts[0] || '';
  const hit = languages.find(
    (lang) => lang.toLowerCase() === first.toLowerCase(),
  );
  if (!hit) return { lang: def, prefix: '', rest: raw.toLowerCase() };
  return {
    lang: hit,
    prefix: hit === def ? '' : hit,
    rest: parts.slice(1).join('/').toLowerCase(),
  };
}

/** 站内路径按语言拼出绝对地址（base 不带结尾斜杠）。 */
export function languageHref(
  base: string,
  path: string,
  lang: string,
  defaultLanguage: string,
): string {
  const root = base.replace(/\/+$/, '');
  const prefix = languagePrefix(lang, defaultLanguage);
  const clean = String(path || '').replace(/^\/+|\/+$/g, '');
  const joined = [prefix, clean].filter(Boolean).join('/');
  return joined ? `${root}/${joined}` : `${root}/`;
}

/** 容器类元素：content 是子元素数组。 */
export const GEO_SITE_CONTAINER_TYPES = new Set<string>([
  '__body',
  'container',
  '2Col',
  '3Col',
  'row',
]);

/** 数据类元素：content 是 { innerText | imageUrl | href | ... } 对象。 */
export const GEO_SITE_DATA_TYPES = new Set<string>([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'span',
  'image',
  'link',
  'button',
  'list',
  'video',
]);

export const GEO_SITE_STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  SUSPENDED: '欠费停服',
};

/**
 * 停服有两种成因，列表要分得清：欠费是钱的事，处置是合规的事。
 * 库里只有 SUSPENDED 一个状态，靠 offReason（平台下线时必写）区分展示口径。
 */
export function geoSiteStatusLabel(status: string, offReason?: string) {
  if (offReason && status === 'SUSPENDED') return '平台下线';
  return GEO_SITE_STATUS_LABELS[status] || status;
}

export const GEO_SITE_DOMAIN_STATUS_LABELS: Record<string, string> = {
  PENDING: '待校验',
  VERIFYING: '校验中',
  ACTIVE: '已生效',
  ERROR: '校验失败',
  DISABLED: '平台停用',
};

/** 站点规模硬上限：元素树是发布时直接渲染的公开内容，不设上限就能把渲染与存储打挂。 */
export const GEO_SITE_LIMITS = {
  maxNodes: 2000,
  maxDepth: 12,
  maxJsonBytes: 2 * 1024 * 1024,
  maxSitesDefault: 20,
  maxDomainsPerSiteDefault: 5,
  /** 页面路径最多三级：再深就没人点了，且会放大 sitemap 与取数扇出。 */
  maxPathSegments: 3,
  maxPathLength: 160,
  maxPagesPerSite: 100,
  maxMenusPerSite: 200,
  /** 单页脚本条数缺省上限：平台设置可在 1-50 之间调整。 */
  maxScriptsPerPage: 20,
  /** 列表页每页条数区间：上限同时兜住 sitemap 与批量取数的单次内存。 */
  minPageSize: 1,
  maxPageSize: 60,
  maxGalleryItems: 20,
  maxTagCount: 12,
  maxFaqCount: 30,
};

const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/;
/** 保留字：与站内路由、常见服务子域冲突，一律不许当站点 slug。 */
const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'app',
  'assets',
  'by-host',
  'dashboard',
  'editor',
  'geo',
  'geo-site',
  'm',
  'mail',
  'www',
  's',
  'static',
  'public',
  'probe',
]);

/** 只认标量：对象/数组一律当空串，免得把 [object Object] 渲染进公开页面。 */
export function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

export function normalizeSlug(raw: unknown): string {
  const value = toText(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-');
  if (!value) return '';
  const slug = value.replace(/^-+|-+$/g, '').slice(0, 63);
  if (!SLUG_PATTERN.test(slug) || RESERVED_SLUGS.has(slug)) {
    throw new BusinessException(
      ErrorCode.BAD_REQUEST,
      '站点标识只能用 2-63 位小写字母、数字或连字符，且不能以连字符开头结尾、不使用保留字',
    );
  }
  return slug;
}

/**
 * 用户绑定域名归一化：只保留小写主机名。
 * 带协议/路径/端口/凭据、裸 IP、下划线主机名一律拒绝——端口与 IP 无法签发证书，
 * 平台自身域名与站点根域会被用来伪造他人站点，都不能进这张表。
 */
export function normalizeSiteDomain(
  raw: unknown,
  blockedHosts: string[],
): string {
  const input = toText(raw).trim().toLowerCase();
  if (!input) {
    throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写要绑定的域名');
  }
  let host = input.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (host.includes('@')) {
    host = host.split('@').pop() || '';
  }
  host = host.split(':')[0];
  if (!host || host.length > 253) {
    throw new BusinessException(ErrorCode.BAD_REQUEST, '域名格式不正确');
  }
  if (
    !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(
      host,
    )
  ) {
    throw new BusinessException(
      ErrorCode.BAD_REQUEST,
      '域名只能用小写字母、数字与连字符，并且必须带一个点（例：shop.example.com）',
    );
  }
  // 点分十进制的裸 IP 签不出证书也挂不了所有权 TXT 记录（正则里数字标签是合法的，得单独拦）
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    throw new BusinessException(
      ErrorCode.BAD_REQUEST,
      '请填写域名，不要直接填 IP 地址（例：shop.example.com）',
    );
  }
  const blocked = blockedHosts
    .map((item) => item.toLowerCase())
    .filter(Boolean);
  if (
    blocked.some(
      (item) =>
        host === item || host.endsWith(`.${item}`) || item.endsWith(`.${host}`),
    )
  ) {
    throw new BusinessException(
      ErrorCode.BAD_REQUEST,
      '不能使用本站或平台域名作为独立站域名',
    );
  }
  return host;
}

/** 校验令牌：仿活码 domainKey，随机 16 字节十六进制，探针与 TXT 记录都用它。 */
export function newVerifyToken(): string {
  return randomBytes(16).toString('hex');
}

/** URL 白名单：只放 http(s)，挡掉 javascript:/data:/file: 这类注入面。 */
export function safeSiteUrl(value: unknown): string {
  const raw = toText(value).trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString().slice(0, 1000);
  } catch {
    // 站内相对路径（/about、#anchor）与协议相对写法照样放行
    if (raw.startsWith('/') || raw.startsWith('#') || raw.startsWith('.')) {
      return raw.slice(0, 1000);
    }
    return '';
  }
}

/** 样式值白名单：数值与常见长度/颜色/字体串，挡掉 url()、expression 与注入。 */
const STYLE_OK = /^[a-zA-Z0-9 ,.%()#'+:/-]*$/;
export function safeStyleValue(value: unknown): string {
  const raw = toText(value);
  if (!raw) return '';
  if (raw.length > 120) return '';
  if (/javascript|expression|url\s*\(|@import|\\/i.test(raw)) return '';
  return STYLE_OK.test(raw) ? raw : '';
}

/**
 * 无单位也能生效的 CSS 属性：这份名单与 React 内联样式的行为对齐。
 * 编辑器把元素树交给 React 渲染（数字自动补 px），发布页是服务端拼的 style 串，
 * 两边规则不一致就会出现「编辑器里字号生效、发布后掉回默认值」的所见非所得。
 */
const UNITLESS_STYLE_KEYS = new Set([
  'animationIterationCount',
  'aspectRatio',
  'columnCount',
  'columns',
  'flex',
  'flexGrow',
  'flexShrink',
  'flexOrder',
  'fontWeight',
  'gridArea',
  'gridColumn',
  'gridColumnEnd',
  'gridColumnStart',
  'gridRow',
  'gridRowEnd',
  'gridRowStart',
  'lineHeight',
  'opacity',
  'order',
  'orphans',
  'tabSize',
  'widows',
  'zIndex',
  'zoom',
]);

/** 样式值出白名单后统一补单位：数字只在需要长度的属性上补 px，0 保持无单位。 */
function cssValueOf(key: string, value: string | number): string {
  if (typeof value === 'number') {
    if (value === 0 || UNITLESS_STYLE_KEYS.has(key)) return String(value);
    return `${value}px`;
  }
  return safeStyleValue(value);
}

export function cssTextFromStyles(
  styles: Record<string, string | number> | undefined | null,
): string {
  if (!styles || typeof styles !== 'object') return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(styles)) {
    // 只认合法 CSS 属性名，且必须能通过值白名单，两者都不过就整条丢弃
    if (
      !/^[a-zA-Z][a-zA-Z0-9-]*$/.test(key) &&
      !/^--[a-zA-Z0-9-]+$/.test(key)
    ) {
      continue;
    }
    const name = key.startsWith('--')
      ? key
      : key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    const text = cssValueOf(key, value);
    if (!text) continue;
    parts.push(`${name}:${text}`);
  }
  return parts.join(';');
}

export function escapeHtml(value: unknown): string {
  return toText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export type GeoSiteElement = {
  id: string;
  name: string;
  type: string;
  category: string;
  styles: Record<string, string | number>;
  content: GeoSiteElement[] | Record<string, unknown>;
};

/**
 * 元素树结构校验（契约已做一次 zod 形状校验，这里补规模与类型约束）：
 * 深度、节点数、体积三重封顶，容器必须是数组、数据元素必须是对象。
 */
export function assertElementTree(input: unknown): GeoSiteElement[] {
  if (!Array.isArray(input)) {
    throw new BusinessException(ErrorCode.BAD_REQUEST, '页面内容格式不正确');
  }
  let nodes = 0;
  const walk = (list: unknown[], depth: number): void => {
    if (depth > GEO_SITE_LIMITS.maxDepth) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `页面嵌套层级超过 ${GEO_SITE_LIMITS.maxDepth} 层，请精简布局`,
      );
    }
    for (const item of list) {
      if (!item || typeof item !== 'object') {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '页面存在无效元素');
      }
      const node = item as Record<string, unknown>;
      if (typeof node.id !== 'string' || !node.id || node.id.length > 64) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '元素缺少合法标识');
      }
      if (typeof node.type !== 'string') {
        throw new BusinessException(ErrorCode.BAD_REQUEST, '元素缺少类型');
      }
      if (
        node.styles !== undefined &&
        (!node.styles ||
          typeof node.styles !== 'object' ||
          Array.isArray(node.styles))
      ) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '元素样式必须是键值对象',
        );
      }
      if (!(GEO_SITE_ELEMENT_TYPES as readonly string[]).includes(node.type)) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          `暂不支持的元素类型：${node.type}`,
        );
      }
      nodes += 1;
      if (nodes > GEO_SITE_LIMITS.maxNodes) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          `页面元素超过 ${GEO_SITE_LIMITS.maxNodes} 个，请拆分或精简`,
        );
      }
      const content = node.content;
      if (GEO_SITE_CONTAINER_TYPES.has(node.type)) {
        if (content === undefined || content === null) continue;
        if (!Array.isArray(content)) {
          throw new BusinessException(
            ErrorCode.BAD_REQUEST,
            '容器元素的子节点必须是列表',
          );
        }
        walk(content, depth + 1);
      } else if (
        content !== undefined &&
        (typeof content !== 'object' || Array.isArray(content))
      ) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '文本 / 图片元素的内容必须是对象',
        );
      } else if (content && typeof content === 'object') {
        // 契约侧 content 收任意 JSON（递归树无法进 OpenAPI），这里补回字段长度上限
        const leaf = content as Record<string, unknown>;
        const over = (key: string, max: number) =>
          typeof leaf[key] === 'string' && leaf[key].length > max;
        if (
          over('innerText', 20000) ||
          over('imageUrl', 1000) ||
          over('altText', 300) ||
          over('href', 1000) ||
          over('destinationUrl', 1000)
        ) {
          throw new BusinessException(
            ErrorCode.BAD_REQUEST,
            '元素文案或链接长度超出上限',
          );
        }
      }
    }
  };
  walk(input, 1);
  let bytes = 0;
  try {
    bytes = Buffer.byteLength(JSON.stringify(input));
  } catch {
    throw new BusinessException(ErrorCode.BAD_REQUEST, '页面内容无法序列化');
  }
  if (bytes > GEO_SITE_LIMITS.maxJsonBytes) {
    throw new BusinessException(
      ErrorCode.BAD_REQUEST,
      '页面内容超过 2MB 上限，请减少图片或嵌套',
    );
  }
  return input as GeoSiteElement[];
}

/** 站点访问地址：{slug}.{rootDomain}；根域名缺失时退回本站路径，保证任何部署下都有可点开的链接。 */
export function siteUrlOf(slug: string, rootDomain: string): string {
  const host = rootDomain.trim().toLowerCase();
  if (!host) return `/geo-site/${slug}`;
  return `https://${slug}.${host}`;
}

// ---------------------------------------------------------------------------
// 站点 CMS：页面路径、菜单目标、动态内容与第三方脚本口径
// ---------------------------------------------------------------------------

/** 页面模板类型：列表/详情类走动态取数，custom 为纯拖拽，landing 为整套落地页。 */
export const GEO_SITE_PAGE_KINDS = [
  'landing',
  'articleList',
  'articleDetail',
  'productList',
  'productDetail',
  'blank',
  'custom',
] as const;

export const GEO_SITE_PAGE_KIND_LABELS: Record<string, string> = {
  landing: '落地页',
  articleList: '文章列表',
  articleDetail: '文章详情',
  productList: '产品列表',
  productDetail: '产品详情',
  blank: '空白页',
  custom: '自由页面',
};

export const GEO_SITE_MENU_LOCATIONS = ['HEADER', 'FOOTER'] as const;
export const GEO_SITE_MENU_TARGETS = [
  'PAGE',
  'ARTICLE',
  'PRODUCT',
  'URL',
  'ANCHOR',
] as const;
/** 内容类型：与内容库两张表一一对应，也是页面 contentType 的取值域。 */
export const GEO_SITE_CONTENT_KINDS = ['article', 'product'] as const;

/** 无对应列表页时，详情页兜底使用的路径前缀。 */
export const GEO_SITE_CONTENT_PREFIX: Record<string, string> = {
  article: 'blog',
  product: 'products',
};

/** 菜单/动态内容里锚点与保留分页参数不能当页面路径。 */
const RESERVED_PATHS = new Set(['page', 'amp', 'preview', 'raw']);

const PATH_SEGMENT_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * 页面路径归一化：站内相对路径（无前后斜杠、可多段）。
 * 首页固定为 ''，其余必须逐段命中「小写字母/数字/连字符」且避开保留字，
 * 因为这段路径会直接拼进公开 URL 与 sitemap，绝不能带查询串、协议头或目录穿越。
 */
export function normalizePagePath(input: unknown): string {
  const raw = toText(input)
    .trim()
    .toLowerCase()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  if (!raw) return '';
  const segments = raw.split('/').filter(Boolean);
  if (segments.length > GEO_SITE_LIMITS.maxPathSegments) {
    throw new BusinessException(
      ErrorCode.BAD_REQUEST,
      `页面路径最多 ${GEO_SITE_LIMITS.maxPathSegments} 级`,
    );
  }
  if (raw.length > GEO_SITE_LIMITS.maxPathLength) {
    throw new BusinessException(ErrorCode.BAD_REQUEST, '页面路径过长');
  }
  for (const segment of segments) {
    if (!PATH_SEGMENT_PATTERN.test(segment)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '页面路径只允许小写字母、数字与连字符',
      );
    }
    if (RESERVED_SLUGS.has(segment) || RESERVED_PATHS.has(segment)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `页面路径不能使用保留字：${segment}`,
      );
    }
  }
  return segments.join('/');
}

/** 内容 slug（文章/产品）：与页面路径同规则的单段标识，直接进 URL。 */
export function normalizeContentSlug(input: unknown): string {
  const slug = normalizePagePath(input);
  if (!slug) {
    throw new BusinessException(ErrorCode.BAD_REQUEST, '内容标识不能为空');
  }
  if (slug.includes('/')) {
    throw new BusinessException(
      ErrorCode.BAD_REQUEST,
      '内容标识不需要带路径，只用一段即可',
    );
  }
  return slug;
}

/**
 * 脚本主机白名单匹配：支持 `*.analytics.example.com` 后缀通配（含自身）。
 * 空白名单等于全禁——默认拒绝，新增平台级配置才放开，避免上线即打开注入面。
 */
export function hostMatchesScriptPattern(
  host: string,
  patterns: string[],
): boolean {
  const target = host.trim().toLowerCase();
  if (!target) return false;
  return patterns.some((raw) => {
    const pattern = String(raw ?? '')
      .trim()
      .toLowerCase();
    if (!pattern) return false;
    if (pattern.startsWith('*.')) {
      const base = pattern.slice(2);
      return Boolean(base) && (target === base || target.endsWith(`.${base}`));
    }
    return target === pattern;
  });
}

/** 脚本位置：统计类进 head，客服/挂件类进页尾，两者都只认这两个值。 */
export const GEO_SITE_SCRIPT_POSITIONS = ['head', 'body'] as const;

/**
 * 预置脚本厂商：平台管理员在后台一键加入白名单，避免手抄域名抄错。
 * 只收主流统计/客服/广告标签厂商，且全部是公开 CDN 域，不含任何要付费才能用的私有域。
 */
export const GEO_SITE_SCRIPT_PRESETS: {
  key: string;
  label: string;
  desc: string;
  hosts: string[];
}[] = [
  {
    key: 'cnzz',
    label: 'CNZZ / 友盟统计',
    desc: 'cnzz.com 与 umeng 系图标统计',
    hosts: ['*.cnzz.com', '*.umservice.cn', '*.umeng.com'],
  },
  {
    key: 'baidu',
    label: '百度统计',
    desc: 'hm.baidu.com 站点分析',
    hosts: ['hm.baidu.com'],
  },
  {
    key: 'google',
    label: 'Google Analytics / Tag',
    desc: 'gtag.js 与 GTM 容器',
    hosts: ['*.google-analytics.com', '*.googletagmanager.com'],
  },
  {
    key: 'gtag',
    label: 'Google Ads 转化',
    desc: 'adsservices 转化回传',
    hosts: ['*.doubleclick.net'],
  },
  {
    key: 'tencent',
    label: '腾讯广告 / 妙思',
    desc: 'qq.com 广告转化与报表脚本',
    hosts: ['*.qq.com'],
  },
  {
    key: 'sina',
    label: '新浪统计',
    desc: 'w.cnzz.com 老站点常用',
    hosts: ['w.cnzz.com'],
  },
  {
    key: 'wechat-kf',
    label: '企业微信客服',
    desc: 'wwcdn 客服会话组件',
    hosts: ['*.wwcdn.weixin.qq.com'],
  },
  {
    key: 'wanlai',
    label: '快客服 / 网来云商',
    desc: 'kf 对话挂件',
    hosts: ['*.live800.com', '*.wanlai.com'],
  },
  {
    key: 'sentry',
    label: 'Sentry 前端监控',
    desc: 'browser 上报（脚本 + fetch 同源）',
    hosts: ['*.ingest.sentry.io', 'browser.sentry-cdn.com'],
  },
  {
    key: 'cloudflare',
    label: 'Cloudflare 站点分析',
    desc: 'beacon.min.js 流量分析',
    hosts: ['static.cloudflareinsights.com'],
  },
];

/** 默认白名单：只放开跨云统计四大家，其余厂商由平台管理员按需添加。 */
export const GEO_SITE_SCRIPT_PRESET_DEFAULT_KEYS = [
  'cnzz',
  'baidu',
  'google',
  'cloudflare',
];

export const GEO_SITE_SCRIPT_PRESET_HOSTS: string[] = Array.from(
  new Set(
    GEO_SITE_SCRIPT_PRESETS.filter((item) =>
      GEO_SITE_SCRIPT_PRESET_DEFAULT_KEYS.includes(item.key),
    ).flatMap((item) => item.hosts),
  ),
);

/**
 * 第三方脚本 src 校验：只接受无端口、无凭据、无查询串的 https 绝对地址。
 * 返回主机名供上层做白名单判定；任何内联脚本、http、协议相对路径一律判 null。
 */
export function scriptHostOf(value: unknown): string | null {
  const raw = toText(value).trim();
  if (!raw || raw.length > 500) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.port) return null;
  const host = url.hostname.toLowerCase();
  // 主机名必须至少两段且不含 IP 之外的怪字符；单标签（localhost）不可能是 CDN
  if (!host.includes('.') || host.startsWith('.') || host.endsWith('.')) {
    return null;
  }
  return host;
}

export type GeoSiteScriptEntry = {
  src: string;
  host: string;
  label: string;
  position: 'head' | 'body';
};

/**
 * 归一化脚本列表并按白名单过滤，同时给出被拒项原因。
 * 保存与渲染都调它：渲染时再过滤一次，平台收紧白名单后线上旧脚本即刻失效。
 */
export function normalizeScriptEntries(
  input: unknown,
  whitelist: string[],
): {
  accepted: GeoSiteScriptEntry[];
  rejected: { src: string; reason: string }[];
} {
  const list = Array.isArray(input)
    ? input.slice(0, GEO_SITE_LIMITS.maxScriptsPerPage)
    : [];
  const accepted: GeoSiteScriptEntry[] = [];
  const rejected: { src: string; reason: string }[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const row = (
      item && typeof item === 'object' && !Array.isArray(item)
        ? item
        : { src: item }
    ) as Record<string, unknown>;
    const src = toText(row.src).trim();
    const host = scriptHostOf(src);
    if (!host) {
      rejected.push({
        src: src.slice(0, 120),
        reason: '只允许 https 绝对地址，且不支持内联脚本',
      });
      continue;
    }
    if (!hostMatchesScriptPattern(host, whitelist)) {
      rejected.push({
        src: src.slice(0, 120),
        reason: `脚本域名 ${host} 不在平台白名单内`,
      });
      continue;
    }
    if (seen.has(src)) continue;
    seen.add(src);
    const position =
      row.position === 'head'
        ? 'head'
        : row.position === 'body'
          ? 'body'
          : 'body';
    accepted.push({
      src,
      host,
      label: toText(row.label).trim().slice(0, 60),
      position,
    });
  }
  return { accepted, rejected };
}

/** 脚本主机集合：动态 CSP 的 script-src / connect-src 附加来源。 */
export function scriptHostsOf(entries: unknown): string[] {
  if (!Array.isArray(entries)) return [];
  const hosts = new Set<string>();
  for (const item of entries) {
    const row = (
      item && typeof item === 'object' && !Array.isArray(item)
        ? item
        : { src: item }
    ) as Record<string, unknown>;
    const host = scriptHostOf(row.src);
    if (host) hosts.add(host);
  }
  return [...hosts];
}

/** 元素树里是否存在某类型（决定站点外壳要不要自动补导航）。 */
export function hasElementType(
  list: unknown,
  type: string,
  depth = 0,
): boolean {
  if (!Array.isArray(list) || depth > GEO_SITE_LIMITS.maxDepth) return false;
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const node = item as Record<string, unknown>;
    if (node.type === type) return true;
    if (
      GEO_SITE_CONTAINER_TYPES.has(String(node.type)) &&
      hasElementType(node.content, type, depth + 1)
    ) {
      return true;
    }
  }
  return false;
}

/* --------------------------- 内容库字段归一化 --------------------------- */

/** 标签：去空去重、限条数、单条限长，脏值一律丢弃而不是报错——标签是展示件，不值得打断保存。 */
export function normalizeTagList(value: unknown): string[] {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,，\s]+/)
      : [];
  const out: string[] = [];
  for (const item of list) {
    const tag = String(item ?? '')
      .trim()
      .slice(0, 30);
    if (!tag || out.includes(tag)) continue;
    out.push(tag);
    if (out.length >= GEO_SITE_LIMITS.maxTagCount) break;
  }
  return out;
}

/** 问答对：q/a 都非空才留，公开页面与 JSON-LD 都用同一份，避免两处口径漂移。 */
export function normalizeFaqList(value: unknown): { q: string; a: string }[] {
  if (!Array.isArray(value)) return [];
  const out: { q: string; a: string }[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const q = toText(row.q ?? row.question)
      .trim()
      .slice(0, 200);
    const a = toText(row.a ?? row.answer)
      .trim()
      .slice(0, 2000);
    if (!q || !a) continue;
    out.push({ q, a });
    if (out.length >= GEO_SITE_LIMITS.maxFaqCount) break;
  }
  return out;
}

/** 规格参数：只认 name/value 两个字段，渲染成表格时再各自截断。 */
export function normalizeSpecList(
  value: unknown,
): { name: string; value: string }[] {
  if (!Array.isArray(value)) return [];
  const out: { name: string; value: string }[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const name = toText(row.name).trim().slice(0, 60);
    const specValue = toText(row.value).trim().slice(0, 300);
    if (!name || !specValue) continue;
    out.push({ name, value: specValue });
    if (out.length >= 40) break;
  }
  return out;
}

/** 图集：图片地址走 safeSiteUrl 白名单，非法链接直接丢掉。 */
export function normalizeGallery(
  value: unknown,
): { url: string; alt: string }[] {
  if (!Array.isArray(value)) return [];
  const out: { url: string; alt: string }[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const url = safeSiteUrl(row.url ?? row.imageUrl);
    if (!url) continue;
    out.push({
      url,
      alt: toText(row.alt).trim().slice(0, 200),
    });
    if (out.length >= GEO_SITE_LIMITS.maxGalleryItems) break;
  }
  return out;
}

/** 关联内容 id：正整数去重，上限防止一次取数把整站内容拉空。 */
export function normalizeIdList(value: unknown, max = 12): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  for (const item of value) {
    const id = Number(item);
    if (!Number.isInteger(id) || id <= 0 || out.includes(id)) continue;
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

/** 文本字段：统一 trim + 截断，避免各服务重复写同一串样板。 */
export function clipText(value: unknown, max: number): string {
  return toText(value).trim().slice(0, max);
}
