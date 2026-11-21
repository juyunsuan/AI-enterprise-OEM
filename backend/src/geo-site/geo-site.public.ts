import type { Context } from 'hono';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { ApiEnv } from '../http/types';
import type { Services } from '../http/services';
import {
  buildCsp,
  renderLlmsTxt,
  renderRobotsTxt,
  renderSiteHtml,
  renderSitemapXml,
  seoViewOf,
} from './geo-site.render.service';
import { escapeHtml, type GeoSiteElement } from './geo-site.shared';
import { toolOpen } from '../tool-launch/tool-launch.holder';

/**
 * GEO 独立站公开访问通道（免登录）。
 *
 * 三种寻址方式共用同一条投递逻辑（解析站点 → 算出规范地址 → 渲染已发布快照）：
 * - 平台泛子域 / 用户自定义域名：Nginx 把站点域名的任意路径转到 `/api/public/geo-sites/by-host/*`，
 *   按 Host 反查站点，站内路径（`` / `products` / `blog/xxx`）原样带过来；
 * - 本站路径：`/geo-site/:slug/*`，由 next.config 的 rewrite 转来，没配泛域名时也能访问整个站点；
 * - 直接 API 路径：`/api/public/geo-sites/:slug`，只回首页，供探针与排障使用。
 *
 * 只渲染已发布快照：草稿、欠费停服、被平台下线的站点各回各的状态码，
 * robots / sitemap / llms.txt 与正文同源，不会出现「正文没发但 sitemap 里有」。
 * 页面取数与导航/列表/详情装配全部在 render-data 服务里，本文件只管寻址、状态与响应头。
 */

/** 静态基线 CSP：提示页与文本类响应没有外部资源，按最紧的口径出。 */
const BASE_CSP = [
  "default-src 'none'",
  'img-src https: data:',
  'media-src https:',
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  'frame-src https://www.youtube-nocookie.com https://player.bilibili.com https://player.vimeo.com',
  'font-src data:',
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const HTML_HEADERS: Record<string, string> = {
  'content-type': 'text/html; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  // 渲染器已把文本与属性全量转义、样式与 URL 过白名单；这里再收一层。
  // 正文页会按页面脚本用 buildCsp() 覆盖本行——只在白名单主机上放开 script-src/connect-src。
  'content-security-policy': BASE_CSP,
};

/** 进程内限流：公开入口按 IP 计数，够爬虫用但挡不住脚本刷。 */
const hits = new Map<string, { count: number; resetAt: number }>();
function limited(ip: string, limit = 120) {
  const now = Date.now();
  const row = hits.get(ip);
  if (!row || row.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  row.count += 1;
  return row.count > limit;
}

const clientIp = (c: Context<ApiEnv>) =>
  (c.req.header('x-forwarded-for') || '').split(',')[0].trim() ||
  c.req.header('x-real-ip') ||
  '0.0.0.0';

const hostOf = (c: Context<ApiEnv>) =>
  (
    (c.req.header('x-forwarded-host') || c.req.header('host') || '')
      .toLowerCase()
      .split(':')[0] || ''
  ).trim();

/**
 * 带端口的 Host：只用来拼绝对地址（canonical / 导航 href）。
 * 域名反查必须用剥掉端口的 hostOf，否则 `shop.com:8443` 匹配不到已绑定域名。
 */
const hostWithPortOf = (c: Context<ApiEnv>) => {
  const raw = (c.req.header('x-forwarded-host') || c.req.header('host') || '')
    .toLowerCase()
    .split(',')[0]
    .trim();
  // Host 头是外部输入，只允许主机名/IPv6 字面量与端口，脏值直接当没配
  return /^[a-z0-9.:[\]-]{1,250}$/.test(raw) ? raw : '';
};

function originOf(c: Context<ApiEnv>) {
  const host = hostWithPortOf(c);
  if (!host) return '';
  // 协议判定看裸主机名：回环地址走 http，其余一律 https
  const bare = host.replace(/:\d+$/, '');
  const forwarded = (
    (c.req.header('x-forwarded-proto') || '')
      .toLowerCase()
      .split(',')[0]
      .trim() || ''
  ).replace(/:\d+$/, '');
  const local =
    bare === 'localhost' ||
    bare === '127.0.0.1' ||
    bare === '[::1]' ||
    bare === '::1';
  const proto =
    forwarded === 'https' || forwarded === 'http'
      ? forwarded
      : local
        ? 'http'
        : 'https';
  return `${proto}://${host}`;
}

function html(body: string, status = 200, extra: Record<string, string> = {}) {
  return new Response(body, {
    status,
    headers: {
      ...HTML_HEADERS,
      'cache-control': status === 200 ? 'no-cache' : 'no-store, max-age=0',
      'x-robots-tag': status === 200 ? 'noindex' : 'noindex, nofollow',
      ...extra,
    },
  });
}

function textResponse(body: string, contentType: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'content-type': contentType,
      'cache-control': 'public, max-age=300',
      'x-content-type-options': 'nosniff',
      'access-control-allow-origin': '*',
    },
  });
}

function notice(title: string, desc: string, status: number) {
  return html(
    [
      '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
      `<title>${escapeHtml(title)}</title>`,
      '<style>body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;background:#f8fafc;color:#0f172a;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}.card{max-width:520px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:36px;text-align:center}h1{font-size:20px;margin:0 0 12px}p{color:#475569;line-height:1.8;margin:0;font-size:14px}</style>',
      `</head><body><div class="card"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(
        desc,
      )}</p></div></body></html>`,
    ].join(''),
    status,
  );
}

const SITE_SELECT = {
  id: true,
  slug: true,
  ownerUserId: true,
  title: true,
  status: true,
  publishedContent: true,
  publishedSeo: true,
  seo: true,
  favicon: true,
  offReason: true,
  publishedAt: true,
} as const;

type PublicSite = {
  id: number;
  slug: string;
  ownerUserId: string;
  title: string;
  status: string;
  publishedContent: unknown;
  publishedSeo: unknown;
  seo: unknown;
  favicon: string;
  offReason: string;
  publishedAt: Date | null;
};

function elementsOf(site: PublicSite): GeoSiteElement[] {
  return Array.isArray(site.publishedContent)
    ? (site.publishedContent as GeoSiteElement[])
    : [];
}

/** 站内路径：剥掉投递前缀后的剩余段，百分号编码解不动就原样交给渲染层判 404。 */
function tailOf(c: Context<ApiEnv>, prefix: string) {
  const raw = c.req.path.slice(prefix.length).replace(/^\/+/, '');
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

const pageNo = (c: Context<ApiEnv>) =>
  Math.max(1, Number(c.req.query('page') || 1) || 1);

/** by-host 投递的固定前缀：站内路径就是它后面的那一段。 */
const HOST_PREFIX = '/api/public/geo-sites/by-host';

export function registerGeoSitePublic(
  app: OpenAPIHono<ApiEnv>,
  services: Services,
) {
  const prisma = services.prisma.geoSite;
  const render = services.geoSite.render;

  /** 域名校验回源探针：只回显令牌，不查库（校验动作由后端发起，本身已限频）。 */
  const probe = (c: Context<ApiEnv>) => {
    const token = String(c.req.query('token') || '')
      .replace(/[^a-f0-9]/gi, '')
      .slice(0, 64);
    if (!token)
      return html(
        '<!doctype html><html><body>missing token</body></html>',
        404,
      );
    return html(
      `<!doctype html><html><body data-gs-probe="${token}">ok</body></html>`,
    );
  };
  app.get('/_geo-site/probe', probe);
  app.get('/api/public/geo-sites/probe', probe);

  /** 按 Host 找站：自定义域名只认校验通过（ACTIVE）的记录。 */
  const siteByHost = async (c: Context<ApiEnv>) => {
    const resolved = await services.geoSite.domain.resolveSiteIdByHost(
      hostOf(c),
    );
    if (!resolved) return null;
    return prisma.findFirst({
      where: { id: resolved.siteId },
      select: SITE_SELECT,
    });
  };

  const siteBySlug = (slug: string) =>
    prisma.findFirst({ where: { slug }, select: SITE_SELECT });

  /**
   * 本站路径投递前缀：`/geo-site/{标识}`。没有独立域名时，站内链接与 sitemap 都必须带上它，
   * 否则导航与抓取地址会指向主站上不存在的路径。
   */
  const sitePath = (slug: string | undefined) => `/geo-site/${slug ?? ''}`;

  /**
   * 规范地址：访客实际用的域名优先，其次站点生效的主域名/平台子域。
   * `localPrefix` 是本站路径投递时的回落前缀——没有独立域名时，站内链接必须带上
   * `/geo-site/{标识}`，否则导航会指向主站上不存在的路径。
   */
  const canonicalFor = async (
    c: Context<ApiEnv>,
    site: PublicSite,
    fromHost: boolean,
    localPrefix = '',
  ) => {
    if (fromHost) return originOf(c);
    const best = await services.geoSite.domain.canonicalOf(site);
    return best || `${originOf(c)}${localPrefix}`;
  };

  const guard = (c: Context<ApiEnv>) =>
    limited(clientIp(c))
      ? notice('访问过于频繁', '请求太密集了，请稍后重试。', 429)
      : null;

  /** 正文投递：状态判定在这里，取数与渲染交给 render-data。 */
  const respond = async (
    c: Context<ApiEnv>,
    site: PublicSite | null,
    fromHost: boolean,
    path: string,
    localPrefix = '',
  ) => {
    if (!site) {
      return notice(
        '站点不存在',
        `该地址（${hostOf(c) || '未知域名'}）还没有对应的独立站，或站点已被删除。`,
        404,
      );
    }
    if (site.status === 'SUSPENDED') {
      return notice(
        '站点暂时停止访问',
        site.offReason
          ? `站点已被平台下线处置：${site.offReason}`
          : '站点因积分欠费暂停公开访问，充值后自动恢复，站内数据完整保留。',
        503,
      );
    }
    // 启动闸门：工具未启动/欠费/平台停用，正文投递沿用同一状态码提示页
    if (!(await toolOpen('global-site', site.ownerUserId))) {
      return notice(
        '站点暂时停止访问',
        '该站点尚未启动（或已停服），请到「建站管理 → 启动设置」启动后重试。',
        503,
      );
    }
    if (site.status !== 'PUBLISHED' || !elementsOf(site).length) {
      return notice(
        '站点尚未发布',
        '建站者还没有发布这个页面，请稍后再来访问。',
        404,
      );
    }
    const base = await canonicalFor(c, site, fromHost, localPrefix);
    const delivery = await render.resolve({
      siteId: site.id,
      base,
      path,
      page: pageNo(c),
      fromHost,
    });
    if (delivery.status === 'not_found') {
      return notice(
        '页面不存在',
        `${delivery.reason}，请检查地址或从首页导航进入。`,
        404,
      );
    }
    const canonical = `${base}${delivery.pagePath ? `/${delivery.pagePath}` : ''}`;
    const body = renderSiteHtml(
      {
        siteId: site.id,
        slug: site.slug,
        canonical,
        name: site.title,
        seo: delivery.seo,
        elements: delivery.elements,
        favicon: site.favicon,
        footerText: '',
        orgName: site.title,
        alternates: delivery.alternates,
      },
      delivery.context,
    );
    if (delivery.viewTarget) {
      // 浏览数只统计成功渲染的详情页，失败请求不该把数字刷上去
      void services.geoSite.content
        .touchView(delivery.viewTarget.kind, delivery.viewTarget.id)
        .catch(() => undefined);
    }
    return html(body, 200, {
      // 页面脚本按白名单扩 CSP：没有脚本时与静态基线逐字一致
      'content-security-policy': buildCsp(delivery.context.scripts),
      'x-gs-site': String(site.id),
    });
  };

  const byHost = async (c: Context<ApiEnv>) => {
    const blocked = guard(c);
    if (blocked) return blocked;
    return respond(c, await siteByHost(c), true, tailOf(c, HOST_PREFIX));
  };

  // ---------- 爬虫三件套 ----------

  type Meta = {
    site: PublicSite;
    canonical: string;
    seo: ReturnType<typeof seoViewOf>;
    elements: GeoSiteElement[];
  };

  const metaOf = async (
    site: PublicSite | null,
    canonical: string,
  ): Promise<Meta | null> => {
    if (!site || site.status !== 'PUBLISHED' || !elementsOf(site).length)
      return null;
    // 启动闸门：未启动/停服时爬虫三件套一并下线（视同站点不可用）
    if (!(await toolOpen('global-site', site.ownerUserId))) return null;
    return {
      site,
      canonical,
      seo: seoViewOf(site.publishedSeo ?? site.seo),
      elements: elementsOf(site),
    };
  };

  const robots = (meta: Meta | null) =>
    meta
      ? textResponse(
          renderRobotsTxt({
            canonical: meta.canonical,
            noindex: meta.seo.noindex,
          }),
          'text/plain; charset=utf-8',
        )
      : textResponse(
          'User-agent: *\nDisallow: /\n',
          'text/plain; charset=utf-8',
          404,
        );

  const sitemap = async (meta: Meta | null) => {
    if (!meta || meta.seo.noindex || !meta.canonical) {
      return textResponse(
        '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>',
        'application/xml; charset=utf-8',
        404,
      );
    }
    // 全站地图：页面 + 内容详情；存量单页站点没有任何页面行，退回单 URL 老格式
    const urls = await render.sitemapEntries(meta.site.id, meta.canonical);
    return textResponse(
      renderSitemapXml({
        canonical: meta.canonical,
        lastModified: meta.site.publishedAt,
        urls: urls.length ? urls : undefined,
      }),
      'application/xml; charset=utf-8',
    );
  };

  const llms = (meta: Meta | null) =>
    meta && meta.seo.llmsTxt
      ? textResponse(
          renderLlmsTxt({
            name: meta.site.title,
            title: meta.seo.title || meta.site.title,
            description: meta.seo.description,
            canonical: meta.canonical,
            elements: meta.elements,
          }),
          'text/plain; charset=utf-8',
        )
      : textResponse('本站未开放 llms.txt\n', 'text/plain; charset=utf-8', 404);

  /** 爬虫三件套每次都要查库，同样按 IP 限流，不能当免费静态文件刷。 */
  const throttled =
    (make: (c: Context<ApiEnv>) => Response | Promise<Response>) =>
    async (c: Context<ApiEnv>) =>
      guard(c) ?? (await make(c));

  const slugMeta = async (c: Context<ApiEnv>, localPrefix = '') => {
    const slug = String(c.req.param('slug') || '');
    const site = slug ? await siteBySlug(slug) : null;
    return metaOf(
      site,
      site ? await canonicalFor(c, site, false, localPrefix) : '',
    );
  };
  const hostMeta = async (c: Context<ApiEnv>) => {
    const site = await siteByHost(c);
    return metaOf(site, originOf(c));
  };

  // 静态路由先注册：`/by-host/robots.txt` 不能被 `/by-host/*` 的通配投递吃掉
  // 两个入口的站点根不同：本站路径要带 `/geo-site/{标识}`，API 入口直接落在 origin 下
  for (const [path, prefixOf] of [
    ['/geo-site/:slug', (c: Context<ApiEnv>) => sitePath(c.req.param('slug'))],
    ['/api/public/geo-sites/:slug', () => ''],
  ] as const) {
    app.get(
      `${path}/robots.txt`,
      throttled(async (c) => robots(await slugMeta(c, prefixOf(c)))),
    );
    app.get(
      `${path}/sitemap.xml`,
      throttled(async (c) => sitemap(await slugMeta(c, prefixOf(c)))),
    );
    app.get(
      `${path}/llms.txt`,
      throttled(async (c) => llms(await slugMeta(c, prefixOf(c)))),
    );
  }
  app.get(
    '/api/public/geo-sites/by-host/robots.txt',
    throttled(async (c) => robots(await hostMeta(c))),
  );
  app.get(
    '/api/public/geo-sites/by-host/sitemap.xml',
    throttled(async (c) => sitemap(await hostMeta(c))),
  );
  app.get(
    '/api/public/geo-sites/by-host/llms.txt',
    throttled(async (c) => llms(await hostMeta(c))),
  );

  // ---------- 正文投递 ----------

  app.get('/api/public/geo-sites/by-host/*', byHost);
  app.get('/api/public/geo-sites/by-host', async (c) => {
    const blocked = guard(c);
    if (blocked) return blocked;
    return respond(c, await siteByHost(c), true, '');
  });

  /**
   * 本站路径投递：`/geo-site/{标识}` 首页，`/geo-site/{标识}/blog/xxx` 子页。
   */
  app.get('/geo-site/:slug', async (c) => {
    const blocked = guard(c);
    if (blocked) return blocked;
    const slug = c.req.param('slug');
    return respond(
      c,
      slug ? await siteBySlug(slug) : null,
      false,
      '',
      sitePath(slug),
    );
  });
  app.get('/geo-site/:slug/*', async (c) => {
    const blocked = guard(c);
    if (blocked) return blocked;
    const slug = c.req.param('slug');
    return respond(
      c,
      slug ? await siteBySlug(slug) : null,
      false,
      tailOf(c, sitePath(slug)),
      sitePath(slug),
    );
  });
  app.get('/api/public/geo-sites/:slug', async (c) => {
    const blocked = guard(c);
    if (blocked) return blocked;
    const slug = c.req.param('slug');
    return respond(c, slug ? await siteBySlug(slug) : null, false, '');
  });
}
