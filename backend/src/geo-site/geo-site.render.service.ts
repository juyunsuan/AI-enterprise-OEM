import type { GeoSiteElement } from './geo-site.shared';
import {
  cssTextFromStyles,
  escapeHtml,
  GEO_SITE_CONTAINER_TYPES,
  GEO_SITE_DYNAMIC_TYPES,
  safeSiteUrl,
} from './geo-site.shared';

/**
 * 元素树 → 公开 HTML 的服务端渲染器。
 *
 * 安全口径（公开页无登录态，任何一处放行都是全站域名下的存储型 XSS）：
 * - 文本一律 HTML 转义，样式过白名单（禁 url() / expression / @import / 反斜杠）；
 * - 所有链接与图片只认 http(s) 与站内相对路径，javascript:/data: 直接丢弃；
 * - 视频仅允许已知播放器域名出 iframe，且带 sandbox；其余按普通链接渲染；
 * - 响应头由公开路由统一加 CSP / x-frame-options，这里只负责产出干净的正文。
 */

export type GeoSiteSeoView = {
  title: string;
  description: string;
  keywords: string[];
  ogImage: string;
  themeColor: string;
  lang: string;
  noindex: boolean;
  llmsTxt: boolean;
  jsonld: {
    organization: boolean;
    website: boolean;
    product: boolean;
    faq: boolean;
  };
};

export type GeoSiteRenderInput = {
  siteId: number;
  slug: string;
  /** 规范链接：平台子域或主域名的绝对地址（不带结尾斜杠）。 */
  canonical: string;
  /** 面包屑/JSON-LD 用的站点名（SEO 标题为空时回落此处）。 */
  name: string;
  seo: GeoSiteSeoView;
  elements: GeoSiteElement[];
  favicon: string;
  /** 备案/主体信息，展示在页脚；缺省不渲染。 */
  footerText: string;
  orgName: string;
  /** 多语言互链：同页各语言版本 + x-default（默认语言版本） */
  alternates?: { lang: string; href: string }[];
};

const VIDEO_HOSTS = new Set([
  'www.youtube.com',
  'youtube.com',
  'm.youtube.com',
  'player.bilibili.com',
  'vimeo.com',
]);

/**
 * 动态元素的渲染上下文：由 geo-site.render-data.service 一次性批量取数后构造。
 * 渲染器只认这份只读结构，不认识 Prisma，也不发任何查询——公开页的 SQL 扇出次数
 * 因此与页面元素数量完全无关，只与「一次页面请求」绑定。
 */
export type GeoSiteRenderNav = {
  label: string;
  href: string;
  children: GeoSiteRenderNav[];
  /** 外部链接新标签打开 */
  newTab: boolean;
  /**
   * 是否为站外链接：由菜单的目标类型决定，不能靠 href 前缀猜。
   * 站内导航在泛子域下也是绝对地址（`https://xxx/page`），按前缀判会把自家页面当外链挂 nofollow。
   */
  external: boolean;
};

/** 内容卡片：文章与产品折叠成同一种展示行，取不到的字段留空即不展示。 */
export type GeoSiteRenderCard = {
  kind: 'article' | 'product';
  id: number;
  /** 内容标识：详情页当前语言链接需要按 slug 回拼 */
  slug?: string;
  title: string;
  href: string;
  summary?: string;
  cover?: string;
  /** YYYY-MM-DD，无发布时间不展示 */
  date?: string;
  category?: string;
  tags?: string[];
  author?: string;
  views?: number;
  price?: string;
  unit?: string;
  priceOnAsk?: boolean;
  specs?: { name: string; value: string }[];
  buyUrl?: string;
  faqs?: { question: string; answer: string }[];
  /** 详情正文元素树：articleBody 递归渲染用 */
  elements?: GeoSiteElement[];
};

export type GeoSiteRenderPager = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** 第 n 页的站内链接（1 页回落列表页本身，避免出现 ?page=1 双地址） */
  hrefOf: (page: number) => string;
};

export type GeoSiteRenderScript = {
  src: string;
  host: string;
  position: 'head' | 'body';
};

export type GeoSiteRenderLanguage = {
  code: string;
  label: string;
  /** 目标语言下的当前页（无翻译时回落到该语言首页） */
  href: string;
  current: boolean;
};

export type GeoSiteRenderContext = {
  /** 顶部导航（已解析成 href 的线上快照） */
  nav: GeoSiteRenderNav[];
  /** 页脚导航 */
  footerNav: GeoSiteRenderNav[];
  /** 品牌名链接（点 logo 回首页，随当前语言变化） */
  homeHref: string;
  /** 站点根（默认语言根路径），供全站级文件引用：llms.txt 不分语言 */
  siteHref?: string;
  /** 导航栏品牌位：站点标题，空则不展示 */
  brand: string;
  /** 当前页面；未启用页面体系时为空 */
  page?: { title: string; path: string; kind: string } | null;
  /** 列表数据（postList/postGrid/productList/productGrid） */
  list?: GeoSiteRenderCard[];
  pager?: GeoSiteRenderPager | null;
  /**
   * 按内容类型分组的列表数据：区块自带类型时以它为准（产品网格就该显示产品），
   * 没带时回落上面的 list。同页混放两类区块也能各自取到自己的数据。
   */
  listsByKind?: Record<
    'article' | 'product',
    { list: GeoSiteRenderCard[]; pager: GeoSiteRenderContext['pager'] }
  >;
  /** 详情数据（articleBody/articleMeta/productInfo/relatedPosts） */
  detail?: GeoSiteRenderCard | null;
  related?: GeoSiteRenderCard[];
  /** 面包屑（详情页自动补，列表页可为空） */
  crumbs?: { label: string; href: string }[];
  /** 已通过平台白名单校验的第三方脚本（host 用于动态 CSP） */
  scripts?: GeoSiteRenderScript[];
  /** 启用语言与互链：languageSwitcher 区块直接消费 */
  languages?: GeoSiteRenderLanguage[];
};

export const EMPTY_RENDER_CONTEXT: GeoSiteRenderContext = {
  nav: [],
  footerNav: [],
  homeHref: '/',
  siteHref: '/',
  brand: '',
  page: null,
  list: undefined,
  pager: null,
  detail: null,
  related: undefined,
  crumbs: [],
  scripts: [],
  languages: [],
};

const VIDEO_FILE_RE = /\.(mp4|webm|ogg|m4v)(\?|#|$)/i;

/**
 * SEO 档案归一化：库里存的是用户提交的 JSON，任何读取方（渲染、契约回显）都先过这里，
 * 保证字段齐、类型对、长度受限，不必在每个使用点重复兜底。
 */
export function seoViewOf(raw: unknown): GeoSiteSeoView {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  const str = (key: string, max: number) => {
    const value = input[key];
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
  };
  const bool = (key: string, fallback: boolean) =>
    typeof input[key] === 'boolean' ? input[key] : fallback;
  const keywords = Array.isArray(input.keywords)
    ? input.keywords
        .map((item) =>
          String(item ?? '')
            .trim()
            .slice(0, 60),
        )
        .filter(Boolean)
        .slice(0, 30)
    : [];
  const jsonld = (
    input.jsonld && typeof input.jsonld === 'object' ? input.jsonld : {}
  ) as Record<string, unknown>;
  return {
    title: str('title', 120),
    description: str('description', 500),
    keywords,
    ogImage: str('ogImage', 1000),
    themeColor: str('themeColor', 32),
    lang: str('lang', 16) || 'zh-CN',
    noindex: bool('noindex', false),
    llmsTxt: bool('llmsTxt', true),
    jsonld: {
      organization: bool2(jsonld.organization, true),
      website: bool2(jsonld.website, true),
      product: bool2(jsonld.product, false),
      faq: bool2(jsonld.faq, false),
    },
  };
}

function bool2(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function attrStyle(
  styles: Record<string, string | number> | undefined,
): string {
  const css = cssTextFromStyles(styles);
  return css ? ` style="${escapeHtml(css)}"` : '';
}

function contentOf(element: GeoSiteElement): Record<string, unknown> {
  const content = element.content;
  return content && !Array.isArray(content) ? content : {};
}

function childrenOf(element: GeoSiteElement): GeoSiteElement[] {
  return Array.isArray(element.content) ? element.content : [];
}

function textOf(element: GeoSiteElement): string {
  const raw = contentOf(element).innerText;
  return typeof raw === 'string' ? raw.trim() : '';
}

/** 播放器地址：只放行白名单域名，其余不生成 iframe。 */
function embedSrc(url: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const isYtbShort = host === 'youtu.be';
    if (!VIDEO_HOSTS.has(host) && !isYtbShort) return '';
    if (isYtbShort) {
      const id = parsed.pathname.replace(/^\//, '').split('/')[0];
      return /^[\w-]{6,20}$/.test(id)
        ? `https://www.youtube-nocookie.com/embed/${id}`
        : '';
    }
    if (host === 'vimeo.com') {
      const id = parsed.pathname.replace(/\D/g, '');
      return id ? `https://player.vimeo.com/video/${id}` : '';
    }
    if (host.endsWith('bilibili.com')) {
      const path = parsed.pathname.replace(/^[?/]/, '').replace(/&amp;/g, '&');
      return `https://player.bilibili.com/player.html?${path}`;
    }
    return url;
  } catch {
    return '';
  }
}

function renderLeaf(element: GeoSiteElement): string {
  const content = contentOf(element);
  const style = attrStyle(element.styles);
  const inner = escapeHtml(
    typeof content.innerText === 'string' ? content.innerText : '',
  );
  switch (element.type) {
    case 'image': {
      const src = safeSiteUrl(content.imageUrl);
      const alt = escapeHtml(
        typeof content.altText === 'string'
          ? content.altText.slice(0, 300)
          : '',
      );
      const href = safeSiteUrl(content.destinationUrl || content.href);
      if (!src) {
        return `<div class="gs-ph"${style}>图片待替换</div>`;
      }
      const img = `<img src="${escapeHtml(src)}" alt="${alt}" loading="lazy" decoding="async"${style}>`;
      const external = /^https?:/i.test(href);
      return href
        ? `<a href="${escapeHtml(href)}"${
            external ? ' target="_blank" rel="noopener"' : ''
          }>${img}</a>`
        : img;
    }
    case 'link': {
      const href = safeSiteUrl(content.href) || '#';
      return `<a href="${escapeHtml(href)}"${style}>${inner || escapeHtml(href)}</a>`;
    }
    case 'button': {
      const href = safeSiteUrl(content.href || content.destinationUrl);
      const label = inner || '了解更多';
      if (!href)
        return `<span class="gs-btn"${style}>${escapeHtml(label)}</span>`;
      const external = /^https?:/i.test(href);
      return `<a class="gs-btn"${style} href="${escapeHtml(href)}"${
        external ? ' target="_blank" rel="noopener nofollow"' : ''
      }>${escapeHtml(label)}</a>`;
    }
    case 'list': {
      const raw =
        typeof content.innerText === 'string' ? content.innerText : '';
      const items = raw
        .split(/\r?\n/)
        .map((item) => item.replace(/^[-•*\d.、\s]+/, '').trim())
        .filter(Boolean)
        .slice(0, 200);
      if (!items.length) return '';
      return `<ul${style}>${items
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join('')}</ul>`;
    }
    case 'video': {
      const url = safeSiteUrl(content.href || content.imageUrl);
      const embed = embedSrc(url);
      if (embed) {
        return `<div class="gs-video"${style}><iframe src="${escapeHtml(
          embed,
        )}" title="${escapeHtml(typeof content.altText === 'string' ? content.altText : '视频')}" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" sandbox="allow-scripts allow-presentation" referrerpolicy="no-referrer"></iframe></div>`;
      }
      if (VIDEO_FILE_RE.test(url)) {
        return `<video src="${escapeHtml(url)}" controls preload="metadata"${style}></video>`;
      }
      return url
        ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener nofollow"${style}>观看视频</a>`
        : '';
    }
    case 'divider':
      return `<hr${style}>`;
    case 'spacer':
      return `<div class="gs-spacer"${style}></div>`;
    case 'span':
      return `<span${style}>${inner}</span>`;
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      if (!inner) return '';
      return `<${element.type}${style}>${inner}</${element.type}>`;
    case 'p':
    default:
      return `<p${style}>${inner}</p>`;
  }
}

/**
 * 动态元素：内容来自渲染上下文（列表/详情/菜单数据），本身不存任何用户内容，
 * 因此可以在服务端整段覆盖用户写的 innerText——这是「套用模板」的实现点。
 * 取不到数据时回落骨架文案，保证预览态不出现空洞。
 */
function renderDynamic(
  element: GeoSiteElement,
  ctx: GeoSiteRenderContext,
): string {
  const style = attrStyle(element.styles);
  switch (element.type) {
    case 'navBar': {
      if (!ctx.nav.length && !ctx.brand) return '';
      return [
        `<nav class="gs-nav"${style}>`,
        ctx.brand
          ? `<a class="gs-brand" href="${escapeHtml(
              safeSiteUrl(ctx.homeHref) || '/',
            )}">${escapeHtml(ctx.brand)}</a>`
          : '',
        `<div class="gs-nav-links">${ctx.nav
          .map((item) => navItemHtml(item))
          .join('')}</div>`,
        '</nav>',
      ]
        .filter(Boolean)
        .join('');
    }
    case 'footerNav': {
      if (!ctx.footerNav.length) return '';
      return `<nav class="gs-footer-nav"${style}>${ctx.footerNav
        .map((item) => navItemHtml(item, true))
        .join('<span class="gs-nav-sep">·</span>')}</nav>`;
    }
    case 'postList':
      return renderCards(ctx, style, 'gs-post-list gs-cards--col', 'article');
    case 'postGrid':
      return renderCards(ctx, style, 'gs-post-grid gs-cards--grid', 'article');
    case 'productList':
      return renderCards(
        ctx,
        style,
        'gs-product-list gs-cards--col',
        'product',
      );
    case 'productGrid':
      return renderCards(
        ctx,
        style,
        'gs-product-grid gs-cards--grid',
        'product',
      );
    case 'articleBody':
      return renderArticleBody(ctx, style);
    case 'articleMeta':
      return renderArticleMeta(ctx, style);
    case 'productInfo':
      return renderProductInfo(ctx, style);
    case 'relatedPosts': {
      const related = ctx.related || [];
      if (!related.length) return '';
      return `<div class="gs-related"${style}><h3>${escapeHtml(
        textOf(element) || '相关推荐',
      )}</h3>${renderCards(
        { ...ctx, list: related, pager: null },
        '',
        'gs-cards--grid',
      )}</div>`;
    }
    case 'languageSwitcher': {
      const languages = ctx.languages || [];
      // 单语言站点不渲染语言切换：没有可去的目标，只会占一块空位
      if (languages.length < 2) return '';
      return `<nav class="gs-langs"${style} aria-label="Language">${languages
        .map(
          (item) =>
            `<a class="gs-lang${item.current ? ' is-current' : ''}" href="${escapeHtml(
              safeSiteUrl(item.href) || '#',
            )}" hreflang="${escapeHtml(item.code)}"${
              item.current ? ' aria-current="true"' : ''
            }>${escapeHtml(item.label)}</a>`,
        )
        .join('')}</nav>`;
    }
    default:
      return '';
  }
}

/** 一条菜单：外链补 rel，二级项输出成下拉；href 过协议白名单，脏值落回 #。 */
function navLinkAttr(item: GeoSiteRenderNav): string {
  const rel = [item.newTab ? 'noopener' : '', item.external ? 'nofollow' : '']
    .filter(Boolean)
    .join(' ');
  return `${item.newTab ? ' target="_blank"' : ''}${rel ? ` rel="${rel}"` : ''}`;
}

function navItemHtml(item: GeoSiteRenderNav, flat = false): string {
  const href = escapeHtml(safeSiteUrl(item.href) || '#');
  const label = escapeHtml(item.label);
  const link = `<a class="gs-nav-item" href="${href}"${navLinkAttr(item)}>${label}</a>`;
  if (flat || !item.children.length) return link;
  return `<div class="gs-nav-has-child">${link}<div class="gs-nav-sub">${item.children
    .map(
      (child) =>
        `<a class="gs-nav-subitem" href="${escapeHtml(
          safeSiteUrl(child.href) || '#',
        )}"${navLinkAttr(child)}>${escapeHtml(child.label)}</a>`,
    )
    .join('')}</div></div>`;
}

/** 列表卡片：postList/postGrid 与 product 两族共用一套骨架。 */
function renderCards(
  ctx: GeoSiteRenderContext,
  style: string,
  cls: string,
  kind?: 'article' | 'product',
): string {
  // 区块自带类型时按内容类型取数；相关推荐等调用方直接传 ctx.list，保持原行为
  const boxed = kind ? ctx.listsByKind?.[kind] : undefined;
  const list = boxed ? boxed.list : ctx.list || [];
  const pager = boxed ? boxed.pager : ctx.pager;
  if (!list.length) {
    return `<div class="${cls} gs-cards--empty"${style}><p class="gs-empty">暂无内容，稍后再来看看。</p></div>`;
  }
  return `<div class="${cls}"${style}>${list
    .map((card) => renderCard(card))
    .join('')}${pagerHtml(pager)}</div>`;
}

function renderCard(card: GeoSiteRenderCard): string {
  const cover = safeSiteUrl(card.cover);
  const href = safeSiteUrl(card.href) || '#';
  const meta: string[] = [];
  if (card.category) meta.push(escapeHtml(card.category));
  if (card.date) meta.push(escapeHtml(card.date));
  if (card.price)
    meta.push(
      `<span class="gs-price">${escapeHtml(card.price)}${escapeHtml(
        card.unit || '',
      )}</span>`,
    );
  return [
    '<article class="gs-card">',
    cover
      ? `<a class="gs-card-media" href="${escapeHtml(
          href,
        )}"><img src="${escapeHtml(cover)}" alt="${escapeHtml(
          card.title,
        )}" loading="lazy" decoding="async"></a>`
      : '',
    `<a class="gs-card-title" href="${escapeHtml(href)}">${escapeHtml(
      card.title,
    )}</a>`,
    meta.length ? `<div class="gs-card-meta">${meta.join(' · ')}</div>` : '',
    card.summary
      ? `<p class="gs-card-summary">${escapeHtml(card.summary)}</p>`
      : '',
    '</article>',
  ]
    .filter(Boolean)
    .join('');
}

function pagerHtml(pager: GeoSiteRenderPager | null | undefined): string {
  if (!pager || pager.totalPages <= 1) return '';
  const links: string[] = [];
  for (let page = 1; page <= pager.totalPages; page += 1) {
    if (
      page === 1 ||
      page === pager.totalPages ||
      Math.abs(page - pager.page) <= 2
    ) {
      links.push(
        page === pager.page
          ? `<span class="gs-page is-current">${page}</span>`
          : `<a class="gs-page" href="${escapeHtml(
              safeSiteUrl(pager.hrefOf(page)) || '#',
            )}">${page}</a>`,
      );
    } else if (!links[links.length - 1]?.includes('gs-gap')) {
      links.push('<span class="gs-gap">…</span>');
    }
  }
  return `<nav class="gs-pager">${links.join('')}</nav>`;
}

/** 文章正文：内容库里存的就是元素树，直接递归渲染，样式沿用站点模板。 */
function renderArticleBody(ctx: GeoSiteRenderContext, style: string): string {
  const elements = ctx.detail?.elements;
  if (!elements?.length) {
    return `<div class="gs-article-body"${style}><p>${escapeHtml(
      ctx.detail?.summary || '正文待填充。',
    )}</p></div>`;
  }
  return `<div class="gs-article-body"${style}>${elements
    .map((element) => renderNode(element, { ...ctx, detail: null }))
    .join('\n')}</div>`;
}

function renderArticleMeta(ctx: GeoSiteRenderContext, style: string): string {
  const detail = ctx.detail;
  if (!detail) return '';
  const parts = [
    detail.author ? `撰文 · ${escapeHtml(detail.author)}` : '',
    detail.date ? `发布于 ${escapeHtml(detail.date)}` : '',
    detail.views ? `${detail.views} 次浏览` : '',
  ].filter(Boolean);
  const tags = (detail.tags || [])
    .map((tag) => `<span class="gs-tag">${escapeHtml(tag)}</span>`)
    .join('');
  if (!parts.length && !tags) return '';
  return `<div class="gs-article-meta"${style}>${parts.join(
    ' · ',
  )}${tags ? `<div class="gs-tags">${tags}</div>` : ''}</div>`;
}

/** 产品规格表：只渲染 name/value 两列纯文本，不接受任何富文本。 */
function renderProductInfo(ctx: GeoSiteRenderContext, style: string): string {
  const detail = ctx.detail;
  if (!detail) return '';
  const rows = (detail.specs || [])
    .map(
      (spec) =>
        `<tr><th scope="row">${escapeHtml(
          String(spec?.name ?? ''),
        )}</th><td>${escapeHtml(String(spec?.value ?? ''))}</td></tr>`,
    )
    .join('');
  const buy = safeSiteUrl(detail.buyUrl);
  const cta = buy
    ? `<a class="gs-btn" href="${escapeHtml(
        buy,
      )}" rel="nofollow noopener" target="_blank">立即购买</a>`
    : '';
  const price = detail.price
    ? `<p class="gs-product-price">${escapeHtml(detail.price)}${escapeHtml(
        detail.unit || '',
      )}</p>`
    : detail.priceOnAsk
      ? '<p class="gs-product-price">价格面议</p>'
      : '';
  if (!rows && !cta && !price) return '';
  return [
    '<div class="gs-product-info"' + style + '>',
    price,
    rows ? `<table class="gs-specs"><tbody>${rows}</tbody></table>` : '',
    cta,
    '</div>',
  ].join('');
}

function renderNode(
  element: GeoSiteElement,
  ctx: GeoSiteRenderContext,
): string {
  if (
    !element ||
    typeof element !== 'object' ||
    typeof element.type !== 'string'
  ) {
    return '';
  }
  if (GEO_SITE_DYNAMIC_TYPES.has(element.type)) {
    return renderDynamic(element, ctx);
  }
  if (element.type === '__body') {
    // 根节点样式落到 <body>，正文递归
    return childrenOf(element)
      .map((child) => renderNode(child, ctx))
      .join('');
  }
  if (GEO_SITE_CONTAINER_TYPES.has(element.type)) {
    const style = attrStyle(element.styles);
    const cls = element.type === 'row' ? ' class="gs-row"' : '';
    return `<div${cls}${style}>${childrenOf(element)
      .map((child) => renderNode(child, ctx))
      .join('')}</div>`;
  }
  return renderLeaf(element);
}

function renderBody(
  elements: GeoSiteElement[],
  ctx: GeoSiteRenderContext,
): string {
  return elements.map((element) => renderNode(element, ctx)).join('\n');
}

/**
 * 第三方脚本标签：URL 已在保存时过「https + 平台白名单」校验，这里只兜底再确认一次协议，
 * 绝不拼接任何用户可控的内联内容；async 让统计脚本不阻塞首屏。
 */
function scriptTags(
  scripts: GeoSiteRenderScript[] | undefined,
  position: 'head' | 'body',
): string {
  const list = (scripts || []).filter(
    (script) => script.position === position && /^https:\/\//i.test(script.src),
  );
  if (!list.length) return '';
  return list
    .map(
      (script) =>
        `<script src="${escapeHtml(script.src)}" async${
          script.host ? ` data-gs-host="${escapeHtml(script.host)}"` : ''
        }></script>`,
    )
    .join('\n');
}

/**
 * 按页动态 CSP：与公开路由原本的静态策略同一条基线，只把「本页实际注入的脚本主机」
 * 追加进 script-src / connect-src / frame-src 三档。没有脚本的页面输出与旧策略一致，
 * 因此开启 CMS 不会让存量站点的任何一档安全边界变松。
 */
export function buildCsp(scripts?: GeoSiteRenderScript[]): string {
  const hosts = [
    ...new Set(
      (scripts || [])
        .map((script) => script.host)
        .filter((host): host is string => /^[a-z0-9.-]+$/i.test(host || '')),
    ),
  ].sort();
  const frameSrc = [
    'https://www.youtube-nocookie.com',
    'https://player.bilibili.com',
    'https://player.vimeo.com',
    ...hosts.map((host) => `https://${host}`),
  ];
  return [
    `default-src 'none'`,
    'img-src https: data:',
    'media-src https:',
    `style-src 'unsafe-inline'`,
    `script-src 'unsafe-inline'${hosts.map((h) => ` https://${h}`).join('')}`,
    `frame-src ${frameSrc.join(' ')}`,
    'font-src data:',
    `connect-src${hosts.map((h) => ` https://${h}`).join('') || " 'none'"}`,
    `base-uri 'none'`,
    `form-action 'none'`,
  ].join('; ');
}

function bodyStyles(elements: GeoSiteElement[]): string {
  const root = elements.find((item) => item?.type === '__body');
  return cssTextFromStyles(root?.styles);
}

/** 收集标题层级（供 llms.txt 与描述兜底）：h1-h3 及紧随其后的首个段落。 */
export function collectHeadings(
  elements: GeoSiteElement[],
): { level: number; text: string; body: string }[] {
  const out: { level: number; text: string; body: string }[] = [];
  const walk = (list: GeoSiteElement[]) => {
    list.forEach((element, index) => {
      if (!element || typeof element !== 'object') return;
      const level = /^h([1-3])$/.exec(element.type || '');
      if (level) {
        const text = textOf(element);
        if (text) {
          const next = list[index + 1];
          const body =
            next && (next.type === 'p' || next.type === 'span')
              ? textOf(next)
              : '';
          out.push({ level: Number(level[1]), text, body });
        }
      }
      if (Array.isArray(element.content)) walk(element.content);
    });
  };
  walk(elements);
  return out;
}

/**
 * FAQ 结构化数据：在同一个容器里出现「h3 + 紧随其后的 p」即视为一问一答。
 * 只承认这种确定性结构，绝不把散落的句子拼成假问答。
 */
export function collectFaqs(
  elements: GeoSiteElement[],
): { question: string; answer: string }[] {
  const out: { question: string; answer: string }[] = [];
  const walk = (list: GeoSiteElement[]) => {
    const h3s = list.filter((item) => item?.type === 'h3' && textOf(item));
    if (h3s.length >= 2) {
      list.forEach((item, index) => {
        if (item?.type !== 'h3') return;
        const question = textOf(item);
        if (!question) return;
        const answer = list.slice(index + 1).find((next) => textOf(next));
        const answerText = answer ? textOf(answer) : '';
        if (answerText && answerText !== question) {
          out.push({
            question: question.slice(0, 300),
            answer: answerText.slice(0, 2000),
          });
        }
      });
    }
    for (const item of list) {
      if (Array.isArray(item?.content)) walk(item.content);
    }
  };
  for (const element of elements) {
    if (Array.isArray(element?.content)) walk(element.content);
  }
  return out.slice(0, 30);
}

function jsonLdOf(
  input: GeoSiteRenderInput,
  faqs: { question: string; answer: string }[],
  ctx: GeoSiteRenderContext = EMPTY_RENDER_CONTEXT,
) {
  const nodes: Record<string, unknown>[] = [];
  const org = input.orgName || input.name;
  let bodyFaqs = faqs;
  if (input.seo.jsonld.organization && org) {
    nodes.push({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: org,
      url: input.canonical || undefined,
      logo: input.seo.ogImage || undefined,
    });
  }
  if (input.seo.jsonld.website && input.canonical) {
    nodes.push({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: input.seo.title || input.name,
      url: input.canonical,
      inLanguage: input.seo.lang || 'zh-CN',
    });
  }
  if (input.seo.jsonld.product && input.canonical) {
    nodes.push({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: input.seo.title || input.name,
      description: input.seo.description || undefined,
      image: input.seo.ogImage || undefined,
    });
  }
  if (ctx.detail) {
    // 内容详情页：结构化数据跟着内容类型走，比站级开关更准
    const detail = ctx.detail;
    if (detail.kind === 'product') {
      nodes.push({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: detail.title,
        description: detail.summary || undefined,
        image: detail.cover || undefined,
        ...(detail.price
          ? {
              offers: {
                '@type': 'Offer',
                price: detail.price.replace(/[^\d.]/g, ''),
                priceCurrency: 'CNY',
                url: detail.buyUrl || input.canonical,
              },
            }
          : detail.priceOnAsk
            ? {
                offers: {
                  '@type': 'AggregateOffer',
                  priceCurrency: 'CNY',
                  availability: 'https://schema.org/InStock',
                },
              }
            : {}),
      });
    } else {
      nodes.push({
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: detail.title,
        description: detail.summary || undefined,
        image: detail.cover || undefined,
        datePublished: detail.date || undefined,
        author: detail.author
          ? { '@type': 'Person', name: detail.author }
          : undefined,
        publisher: org ? { '@type': 'Organization', name: org } : undefined,
        mainEntityOfPage: input.canonical
          ? { '@type': 'WebPage', '@id': input.canonical }
          : undefined,
        inLanguage: input.seo.lang || 'zh-CN',
      });
    }
    // 内容库里的 FAQ 优先于正文里猜出来的问答
    const contentFaqs = (detail.faqs || []).filter(
      (item) => item.question && item.answer,
    );
    if (input.seo.jsonld.faq && contentFaqs.length) {
      nodes.push({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: contentFaqs.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      });
      bodyFaqs = [];
    }
  }
  if (input.seo.jsonld.faq && bodyFaqs.length) {
    nodes.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: bodyFaqs.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    });
  }
  return nodes;
}

/**
 * CMS 部件样式：只在页面真的用到导航/卡片/分页时追加。
 * 单页老站点拼不到这一段，输出与升级前逐字节一致，存量 SEO 快照不会因发布而抖动。
 */
const CMS_CSS = `.gs-nav{display:flex;align-items:center;gap:20px;flex-wrap:wrap;padding:16px 24px;border-bottom:1px solid #e2e8f0}.gs-brand{font-weight:700;font-size:18px;color:#0f172a}.gs-brand:hover{text-decoration:none}.gs-nav-links{display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-left:auto}.gs-nav-item{display:inline-block;padding:8px 14px;color:#334155;border-radius:8px}.gs-nav-item:hover{background:#f1f5f9;text-decoration:none}.gs-nav-has-child{position:relative}.gs-nav-sub{display:none;position:absolute;left:0;top:100%;min-width:180px;padding:8px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 12px 32px rgba(15,23,42,.12);z-index:20}.gs-nav-has-child:hover .gs-nav-sub,.gs-nav-has-child:focus-within .gs-nav-sub{display:block}.gs-nav-subitem{display:block;padding:8px 12px;color:#334155;border-radius:8px}.gs-nav-subitem:hover{background:#f1f5f9;text-decoration:none}.gs-footer-nav{display:flex;justify-content:center;flex-wrap:wrap;gap:8px;padding:20px 24px;color:#64748b;font-size:14px}.gs-nav-sep{color:#cbd5e1}.gs-cards--grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:20px;padding:24px}.gs-cards--col{display:flex;flex-direction:column;gap:16px;padding:24px}.gs-card{display:flex;flex-direction:column;gap:8px;padding:16px;background:#fff;border:1px solid #e2e8f0;border-radius:14px}.gs-card-media{display:block;border-radius:10px;overflow:hidden;background:#f1f5f9}.gs-card-title{font-weight:600;font-size:17px;color:#0f172a}.gs-card-title:hover{text-decoration:none;color:#2563eb}.gs-card-meta{color:#94a3b8;font-size:13px}.gs-card-summary{color:#475569;font-size:14px;line-height:1.7;margin:0}.gs-price{color:#ea580c;font-weight:600}.gs-cards--empty{color:#94a3b8}.gs-empty{margin:0;padding:32px;text-align:center}.gs-pager{display:flex;justify-content:center;align-items:center;gap:6px;flex-wrap:wrap;margin-top:24px}.gs-page{display:inline-block;min-width:34px;padding:6px 10px;text-align:center;border:1px solid #e2e8f0;border-radius:8px;color:#334155}.gs-page.is-current{background:#2563eb;border-color:#2563eb;color:#fff}.gs-gap{color:#94a3b8}.gs-article-body{padding:24px;line-height:1.9}.gs-article-meta{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:0 24px 12px;color:#94a3b8;font-size:13px}.gs-tags{display:flex;gap:6px;flex-wrap:wrap}.gs-tag{padding:2px 10px;background:#f1f5f9;color:#475569;border-radius:999px;font-size:12px}.gs-product-info{display:flex;flex-direction:column;gap:12px;padding:16px 24px}.gs-product-price{margin:0;font-size:22px;font-weight:700;color:#ea580c}.gs-specs{border-collapse:collapse;width:100%;font-size:14px}.gs-specs th,.gs-specs td{border:1px solid #e2e8f0;padding:8px 12px;text-align:left;font-weight:400}.gs-specs th{background:#f8fafc;color:#64748b;width:32%}.gs-related{padding:8px 24px 24px}.gs-crumbs{padding:12px 24px;color:#94a3b8;font-size:13px}.gs-langs{display:flex;justify-content:center;align-items:center;gap:6px;flex-wrap:wrap;padding:12px 24px}.gs-lang{padding:4px 10px;border:1px solid #e2e8f0;border-radius:999px;color:#475569;font-size:13px}.gs-lang:hover{background:#f1f5f9;text-decoration:none}.gs-lang.is-current{background:#0f172a;border-color:#0f172a;color:#fff}@media (max-width:640px){.gs-nav-links{margin-left:0;width:100%}.gs-cards--grid{grid-template-columns:1fr;padding:16px}}`;

/** 本页是否需要 CMS 样式：只有出现动态部件才追加，保证老站点输出零变化。 */
function hasDynamicElement(elements: GeoSiteElement[]): boolean {
  for (const element of elements) {
    if (!element || typeof element !== 'object') continue;
    if (GEO_SITE_DYNAMIC_TYPES.has(element.type)) return true;
    if (Array.isArray(element.content) && hasDynamicElement(element.content)) {
      return true;
    }
  }
  return false;
}

function sitemapEntry(
  url: string,
  opts?: {
    images?: string[];
    lastmod?: Date | null;
    changefreq?: string;
    priority?: string;
  },
): string {
  const loc = safeSiteUrl(url).replace(/\/+$/, '') || '/';
  const lastmod = opts?.lastmod
    ? `<lastmod>${opts.lastmod.toISOString().replace(/\.\d{3}Z$/, 'Z')}</lastmod>`
    : '';
  const images = (opts?.images || [])
    .slice(0, 5)
    .map((img) => safeSiteUrl(img))
    .filter(Boolean);
  const imageTags = images.length
    ? images
        .map(
          (img) =>
            `<image:image><image:loc>${escapeHtml(img)}</image:loc></image:image>`,
        )
        .join('')
    : '';
  return `<url><loc>${escapeHtml(loc)}</loc>${lastmod}<changefreq>${
    opts?.changefreq || 'weekly'
  }</changefreq><priority>${
    opts?.priority || '0.6'
  }</priority>${imageTags}</url>`;
}

const BASE_CSS = `*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:#0f172a;background:#fff;-webkit-font-smoothing:antialiased}img,video{max-width:100%;height:auto;display:block}a{color:#2563eb;text-decoration:none}a:hover{text-decoration:underline}h1,h2,h3,h4,h5,h6{line-height:1.3}p{line-height:1.8}[class]{max-width:100%}.gs-row{display:flex;flex-wrap:wrap;gap:16px}.gs-btn{display:inline-block;padding:12px 28px;background:#2563eb;color:#fff;border-radius:999px}.gs-btn:hover{text-decoration:none}.gs-ph{display:flex;align-items:center;justify-content:center;min-height:180px;background:#f1f5f9;color:#94a3b8;border:1px dashed #cbd5e1;border-radius:12px}.gs-video{position:relative;width:100%;padding-top:56.25%;background:#0f172a;border-radius:12px;overflow:hidden}.gs-video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}.gs-spacer{min-height:32px}@media (max-width:640px){body{font-size:15px}}`;

/** 渲染完整 HTML 文档（无外部依赖，可直接作为 public 路由响应体）。 */
export function renderSiteHtml(
  input: GeoSiteRenderInput,
  context: GeoSiteRenderContext = EMPTY_RENDER_CONTEXT,
): string {
  const ctx: GeoSiteRenderContext = { ...EMPTY_RENDER_CONTEXT, ...context };
  // 品牌位缺省用站点名：导航栏不需要调用方再传一遍
  if (!ctx.brand) ctx.brand = input.name;
  const headings = collectHeadings(input.elements);
  const faqs = collectFaqs(input.elements);
  const title =
    input.seo.title ||
    headings.find((item) => item.level === 1)?.text ||
    input.name;
  const description =
    input.seo.description ||
    headings.find((item) => item.body)?.body?.slice(0, 200) ||
    title;
  const lang = escapeHtml(input.seo.lang || 'zh-CN');
  const canonical = safeSiteUrl(input.canonical);
  // 站点根：llms.txt 与导航回落都用它，多页站点的 canonical 是页面地址，不能当根用
  const siteRoot =
    safeSiteUrl(ctx.homeHref) ||
    (canonical ? `${canonical.replace(/\/+$/, '')}/` : '');
  // llms.txt 是整站文件，不随语言分叉：固定在默认语言根路径，且拼之前补尾斜杠，
  // 否则非默认语言首页（/geo-site/x/en）会拼成 /enllms.txt。
  const llmsRoot = safeSiteUrl(ctx.siteHref || '');
  const llmsHref = llmsRoot
    ? `${llmsRoot.replace(/\/+$/, '')}/llms.txt`
    : `${siteRoot.replace(/\/+$/, '')}/llms.txt`;
  const jsonLd = jsonLdOf(input, faqs, ctx);
  const favicon = safeSiteUrl(input.favicon);
  const ogImage = safeSiteUrl(input.seo.ogImage);
  const head = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width,initial-scale=1">`,
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    input.seo.keywords.length
      ? `<meta name="keywords" content="${escapeHtml(input.seo.keywords.join(',').slice(0, 400))}">`
      : '',
    `<meta name="robots" content="${input.seo.noindex ? 'noindex,nofollow' : 'index,follow,max-image-preview:large'}">`,
    input.seo.themeColor
      ? `<meta name="theme-color" content="${escapeHtml(input.seo.themeColor)}">`
      : '',
    canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}">` : '',
    ...(input.alternates || []).slice(0, 16).flatMap((item) => {
      const href = safeSiteUrl(item.href);
      if (!href || !item.lang) return [];
      return [
        `<link rel="alternate" hreflang="${escapeHtml(item.lang)}" href="${escapeHtml(href)}">`,
      ];
    }),
    favicon ? `<link rel="icon" href="${escapeHtml(favicon)}">` : '',
    `<meta property="og:type" content="${
      ctx.detail?.kind === 'article' ? 'article' : 'website'
    }">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:locale" content="${escapeHtml(lang.replace(/-/g, '_'))}">`,
    canonical
      ? `<meta property="og:url" content="${escapeHtml(canonical)}">`
      : '',
    ogImage
      ? `<meta property="og:image" content="${escapeHtml(ogImage)}">`
      : '',
    canonical ? `<meta name="twitter:card" content="summary_large_image">` : '',
    input.seo.llmsTxt && (llmsRoot || siteRoot)
      ? `<link rel="alternate" type="text/plain" title="llms.txt" href="${escapeHtml(
          llmsHref,
        )}">`
      : '',
    `<style>${BASE_CSS}${hasDynamicElement(input.elements) ? CMS_CSS : ''}</style>`,
    jsonLd.length
      ? `<script type="application/ld+json">${escapeHtml(
          JSON.stringify(jsonLd.length === 1 ? jsonLd[0] : jsonLd),
        )}</script>`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
  const bodyStyle = bodyStyles(input.elements);
  const footer = input.footerText
    ? `<footer style="padding:24px;text-align:center;color:#94a3b8;font-size:13px;line-height:1.8">${escapeHtml(
        input.footerText,
      )}</footer>`
    : '';
  // 导航只由页面里的 navBar/footerNav 区块产生：加不加、放在哪、长什么样都由站长设计，
  // 渲染层不再兜底补一条，避免出现「没设计过却固定顶着一条导航」的页面。
  const headScripts = scriptTags(ctx.scripts, 'head');
  const bodyScripts = scriptTags(ctx.scripts, 'body');
  return [
    '<!doctype html>',
    `<html lang="${lang}">`,
    `<head>${head}${headScripts}</head>`,
    bodyStyle ? `<body style="${escapeHtml(bodyStyle)}">` : '<body>',
    ...[bodyScripts].filter(Boolean),
    renderBody(input.elements, ctx),
    footer,
    '</body>',
    '</html>',
  ].join('\n');
}

/** robots.txt：noindex 站点连抓取一起拒，省下对方爬虫配额也避免收录残页。 */
export function renderRobotsTxt(input: {
  canonical: string;
  noindex: boolean;
}): string {
  const lines = input.noindex
    ? ['User-agent: *', 'Disallow: /']
    : ['User-agent: *', 'Allow: /'];
  const site = safeSiteUrl(input.canonical).replace(/\/+$/, '');
  if (site && !input.noindex) lines.push(`Sitemap: ${site}/sitemap.xml`);
  if (site && !input.noindex)
    lines.push(`# llms.txt 提供本站的纯文本摘要视图：${site}/llms.txt`);
  return `${lines.join('\n')}\n`;
}

/** llms.txt：Markdown 摘要视图，让生成式引擎一次抓取拿到全篇结构。 */
export function renderLlmsTxt(input: {
  name: string;
  title: string;
  description: string;
  canonical: string;
  elements: GeoSiteElement[];
}): string {
  const headings = collectHeadings(input.elements);
  const title = input.title || input.name;
  const lines = [
    `# ${title}`,
    '',
    `> ${input.description || title}`,
    '',
    input.canonical ? `URL: ${input.canonical}` : '',
    '',
    '## 页面结构',
    '',
  ].filter((line) => line !== null);
  if (!headings.length) {
    lines.push('（本站暂无标题结构）');
  }
  for (const heading of headings.slice(0, 200)) {
    lines.push(`${'#'.repeat(Math.min(6, heading.level + 1))} ${heading.text}`);
    if (heading.body) lines.push('', heading.body);
    lines.push('');
  }
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}

/**
 * sitemap：只有已发布且允许收录的站点才生成。
 * 传 `urls` 时输出全站多页地图（页面 + 内容详情 + 封面图）；不传则退回单页老格式，
 * 存量站点的 sitemap 字节不变，不会因为升级 CMS 而让搜索引擎看到结构突变。
 */
export function renderSitemapXml(input: {
  canonical: string;
  lastModified: Date | null;
  urls?: {
    loc: string;
    lastmod?: Date | null;
    changefreq?: string;
    priority?: string;
    images?: string[];
  }[];
}): string {
  const loc = safeSiteUrl(input.canonical).replace(/\/+$/, '');
  if (input.urls?.length) {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
      ...input.urls.map((item) =>
        sitemapEntry(item.loc, {
          images: item.images,
          lastmod: item.lastmod,
          changefreq: item.changefreq,
          priority: item.priority,
        }),
      ),
      '</urlset>',
    ].join('');
  }
  if (!loc)
    return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>';
  const lastmod = input.lastModified
    ? `<lastmod>${input.lastModified.toISOString().replace(/\.\d{3}Z$/, 'Z')}</lastmod>`
    : '';

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    `<url><loc>${escapeHtml(loc)}/</loc>${lastmod}<changefreq>weekly</changefreq><priority>1.0</priority></url>`,
    '</urlset>',
  ].join('');
}

/** 从元素树里取纯文本摘要（列表页/预览用），避免把 HTML 带进 JSON。 */
export function plainTextOf(elements: GeoSiteElement[], limit = 200): string {
  const collected: string[] = [];
  const walk = (list: GeoSiteElement[]) => {
    for (const element of list) {
      if (!element || typeof element !== 'object') continue;
      const text = textOf(element);
      if (text) collected.push(text);
      if (Array.isArray(element.content)) walk(element.content);
      if (collected.join(' ').length > limit * 3) return;
    }
  };
  walk(elements);
  return collected.join(' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}
