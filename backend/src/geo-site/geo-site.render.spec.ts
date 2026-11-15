import {
  buildCsp,
  renderSiteHtml,
  seoViewOf,
  type GeoSiteRenderContext,
} from './geo-site.render.service';

/**
 * 公开页渲染回归：导航的 rel 与第三方脚本的 CSP 是两套「不能靠肉眼确认」的安全约束，
 * 这里把它们钉死——站内链接被误判成外链会掉 SEO 权重，CSP 被放宽等于把注入面开给任意主机。
 */
/** 导航用例的公共入口：导航现在由页面里的 navBar 区块产生，这里放一个区块再验渲染细节。 */
function htmlOf(context: Partial<GeoSiteRenderContext>): string {
  return renderSiteHtml(
    {
      siteId: 1,
      slug: 'demo',
      canonical: 'https://shop.example.com/geo-site/demo',
      name: '演示站',
      seo: seoViewOf({}),
      elements: [
        {
          id: 'nav',
          name: '顶部导航',
          type: 'navBar',
          category: 'basic',
          styles: {},
          content: {},
        },
      ],
      favicon: '',
      footerText: '',
      orgName: '',
    },
    {
      nav: [],
      footerNav: [],
      homeHref: '',
      brand: '',
      ...context,
    },
  );
}

describe('GEO 独立站导航渲染', () => {
  const nav = (over: Record<string, unknown> = {}) => ({
    label: '产品中心',
    href: 'https://shop.example.com/geo-site/demo/products',
    children: [],
    newTab: false,
    external: false,
    ...over,
  });

  it('站内链接不带 rel：绝对地址不代表站外，挂 nofollow 等于自废 SEO', () => {
    const html = htmlOf({ nav: [nav()] });
    expect(html).toContain('gs-nav-item');
    expect(html).not.toContain('nofollow');
    expect(html).not.toContain('target="_blank"');
  });

  it('非默认语言页面仍指向整站 llms.txt，且不会拼成 /enllms.txt', () => {
    const html = htmlOf({
      homeHref: 'https://shop.example.com/geo-site/demo/en',
      siteHref: 'https://shop.example.com/geo-site/demo/',
    });
    expect(html).toContain(
      'href="https://shop.example.com/geo-site/demo/llms.txt"',
    );
    expect(html).not.toContain('enllms.txt');
    expect(html).not.toContain('/en/llms.txt');
  });

  it('站外链接带 nofollow，新标签再加 noopener', () => {
    const html = htmlOf({ nav: [nav({ external: true })] });
    expect(html).toContain('rel="nofollow"');
    expect(html).not.toContain('target="_blank"');

    const blank = htmlOf({
      nav: [nav({ external: true, newTab: true })],
    });
    expect(blank).toContain('target="_blank"');
    expect(blank).toContain('rel="noopener nofollow"');
  });

  it('站内链接勾选新标签只加 noopener，不加 nofollow', () => {
    const html = htmlOf({ nav: [nav({ newTab: true })] });
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener"');
    expect(html).not.toContain('nofollow');
  });

  it('二级菜单同样按目标类型判定外链', () => {
    const html = htmlOf({
      nav: [
        nav({
          children: [
            nav({ label: '站内子页', href: 'https://shop.example.com/a' }),
            nav({
              label: '站外子页',
              href: 'https://partner.example.org/x',
              external: true,
            }),
          ],
        }),
      ],
    });
    expect(html).toContain(
      '<a class="gs-nav-subitem" href="https://shop.example.com/a">站内子页</a>',
    );
    expect(html).toContain(
      '<a class="gs-nav-subitem" href="https://partner.example.org/x" rel="nofollow">站外子页</a>',
    );
  });

  it('菜单文案与脏 href 一律转义/回落，不给注入留口子', () => {
    const html = htmlOf({
      nav: [
        nav({
          label: '</a><script>alert(1)</script>',
          href: 'javascript:alert(1)',
        }),
      ],
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('href="#"');
  });
});

/**
 * 站点模块（导航/列表区块）：站长在画布里拖出来的就是这一棵元素，
 * 所以「样式能不能改」和「产品网格拿的是不是产品」必须在同一份上下文里钉死。
 */
describe('GEO 独立站站点模块', () => {
  const card = (over: Record<string, unknown> = {}) => ({
    kind: 'article' as const,
    id: 1,
    title: '标题',
    href: 'https://shop.example.com/geo-site/demo/a',
    summary: '',
    cover: '',
    date: '',
    category: '',
    tags: [],
    author: '',
    views: 0,
    ...over,
  });

  const el = (type: string, styles: Record<string, string | number> = {}) => ({
    id: `n-${type}`,
    name: type,
    type,
    category: 'basic',
    styles,
    content: {},
  });

  const nav = (over: Record<string, unknown> = {}) => ({
    label: '产品中心',
    href: 'https://shop.example.com/geo-site/demo/products',
    children: [],
    newTab: false,
    external: false,
    ...over,
  });

  it('页面没放导航区块就不输出导航：顶部那条不是默认项，要站长自己加区块设计', () => {
    const html = renderSiteHtml(
      {
        siteId: 1,
        slug: 'demo',
        canonical: 'https://shop.example.com/geo-site/demo',
        name: '演示站',
        seo: seoViewOf({}),
        elements: [el('p')],
        favicon: '',
        footerText: '',
        orgName: '',
      },
      {
        nav: [nav()],
        footerNav: [nav({ label: '关于我们' })],
        homeHref: '',
        brand: '',
      },
    );
    // 菜单里明明有数据，但页面没放 navBar/footerNav 区块，就不该凭空出现导航
    expect(html).not.toContain('gs-nav');
    expect(html).not.toContain('产品中心');
    expect(html).not.toContain('关于我们');
  });

  it('导航区块的自定义样式随元素走：改背景/间距就是改这个区块，不动全局 CSS', () => {
    const html = renderSiteHtml(
      {
        siteId: 1,
        slug: 'demo',
        canonical: 'https://shop.example.com/geo-site/demo',
        name: '演示站',
        seo: seoViewOf({}),
        elements: [
          el('navBar', {
            background: '#0f172a',
            gap: 32,
            padding: '10px 40px',
          }),
        ],
        favicon: '',
        footerText: '',
        orgName: '',
      },
      {
        nav: [nav()],
        footerNav: [],
        homeHref: 'https://shop.example.com/geo-site/demo/',
        brand: '演示站',
      },
    );
    expect(html).toContain('background:#0f172a');
    expect(html).toContain('gap:32px');
    expect(html).toContain('padding:10px 40px');
  });

  it('产品区块取产品列表、文章区块取文章列表：同页混放也不串数据', () => {
    const html = renderSiteHtml(
      {
        siteId: 1,
        slug: 'demo',
        canonical: 'https://shop.example.com/geo-site/demo',
        name: '演示站',
        seo: seoViewOf({}),
        elements: [el('productGrid'), el('postList')],
        favicon: '',
        footerText: '',
        orgName: '',
      },
      {
        nav: [],
        footerNav: [],
        homeHref: '',
        brand: '',
        // 页面自身是文章类型，产品网格仍要拿到产品数据
        list: [card({ title: '文章标题' })],
        pager: null,
        listsByKind: {
          article: { list: [card({ title: '文章标题' })], pager: null },
          product: { list: [card({ title: '产品标题' })], pager: null },
        },
      },
    );
    expect(html).toContain('gs-product-grid');
    expect(html).toContain('产品标题');
    expect(html).toContain('文章标题');
  });

  it('没有 listsByKind 时回落 ctx.list：单页老站点的输出不因新字段改变', () => {
    const html = renderSiteHtml(
      {
        siteId: 1,
        slug: 'demo',
        canonical: 'https://shop.example.com/geo-site/demo',
        name: '演示站',
        seo: seoViewOf({}),
        elements: [el('postGrid')],
        favicon: '',
        footerText: '',
        orgName: '',
      },
      {
        nav: [],
        footerNav: [],
        homeHref: '',
        brand: '',
        list: [card({ title: '唯一列表' })],
      },
    );
    expect(html).toContain('唯一列表');
  });
});

describe('GEO 独立站脚本 CSP', () => {
  it('无脚本时用基线：default-src/script 全关，只留渲染必需的样式与内联', () => {
    const csp = buildCsp([]);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("connect-src 'none'");
    // 没脚本就不该给任何第三方主机开口子（frame-src 的视频白名单是内置基线，不算脚本位）
    expect(csp).toContain("script-src 'unsafe-inline';");
  });

  it('有脚本时只扩 script/frame/connect 三项，且不带通配符', () => {
    const csp = buildCsp([
      {
        src: 'https://hm.baidu.com/hm.js',
        host: 'hm.baidu.com',
        position: 'head',
      },
    ]);
    expect(csp).toContain('https://hm.baidu.com');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).not.toMatch(/script-src[^;]*\*/);
  });

  it('脏 host（带路径/协议/通配）不进 CSP', () => {
    const csp = buildCsp([
      { src: 'x', host: '*.com', position: 'head' },
      { src: 'x', host: 'https://evil.com/', position: 'head' },
      { src: 'x', host: 'ok.example.com/p', position: 'body' },
    ]);
    expect(csp).not.toContain('*.com');
    expect(csp).not.toContain('evil.com');
    expect(csp).not.toContain('ok.example.com/p');
  });
});
