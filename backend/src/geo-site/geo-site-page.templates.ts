/**
 * 页面级模板：给「新建页面」用的骨架，元素结构与站点模板同构（Framely EditorElement[]）。
 * 与站点模板的区别：页面模板只铺一屏结构，且允许出现动态元素（postGrid/articleBody 等），
 * 内容由渲染上下文在发布后填充，因此这里只写「版式」，不写任何真实文案来源。
 */
import type { GeoSiteElement } from './geo-site.shared';

let seq = 0;
function newId(): string {
  seq += 1;
  return `p${Date.now().toString(36)}${seq.toString(36)}`;
}

type Styles = Record<string, string | number>;

function el(
  type: string,
  name: string,
  category: string,
  content: unknown,
  styles: Styles = {},
): GeoSiteElement {
  return {
    id: newId(),
    name,
    type,
    category,
    styles,
    content,
  } as GeoSiteElement;
}

const box = (name: string, content: GeoSiteElement[], styles: Styles = {}) =>
  el('container', name, 'container', content, {
    width: '100%',
    padding: '40px 24px',
    ...styles,
  });

const h1 = (text: string, styles: Styles = {}) =>
  el(
    'h1',
    '主标题',
    'text',
    { innerText: text },
    {
      fontSize: 38,
      lineHeight: 1.25,
      color: '#0f172a',
      margin: '0 0 14px',
      ...styles,
    },
  );

const h2 = (text: string, styles: Styles = {}) =>
  el(
    'h2',
    '小节标题',
    'text',
    { innerText: text },
    {
      fontSize: 26,
      lineHeight: 1.3,
      color: '#0f172a',
      margin: '0 0 12px',
      ...styles,
    },
  );

const p = (text: string, styles: Styles = {}) =>
  el(
    'p',
    '正文',
    'text',
    { innerText: text },
    {
      fontSize: 15,
      lineHeight: 1.85,
      color: '#475569',
      margin: '0 0 12px',
      ...styles,
    },
  );

const button = (text: string, href: string) =>
  el(
    'button',
    '按钮',
    'basic',
    { innerText: text, href },
    {
      display: 'inline-block',
      padding: '12px 28px',
      fontSize: 15,
      color: '#ffffff',
      background: '#2563eb',
      borderRadius: 999,
    },
  );

/** 动态元素的默认样式：卡片网格/纵向列表在渲染层只认版式类样式，取数由上下文决定。 */
const grid = (kind: 'post' | 'product') =>
  el(
    kind === 'post' ? 'postGrid' : 'productGrid',
    kind === 'post' ? '文章网格' : '产品网格',
    'basic',
    {
      columns: 3,
      showSummary: true,
      showCover: true,
      showDate: true,
      empty: '还没有内容，先去内容库发布一条。',
    },
    { gap: 20 },
  );

const rail = (kind: 'post' | 'product') =>
  el(
    kind === 'post' ? 'postList' : 'productList',
    kind === 'post' ? '文章列表' : '产品列表',
    'basic',
    {
      showSummary: true,
      showCover: true,
      showDate: true,
      empty: '还没有内容。',
    },
    { gap: 18 },
  );

const h3 = (text: string) =>
  el(
    'h3',
    '小标题',
    'text',
    { innerText: text },
    {
      fontSize: 19,
      lineHeight: 1.5,
      color: '#0f172a',
      margin: '22px 0 8px',
    },
  );

export type PageTemplateMeta = {
  key: string;
  label: string;
  group: string;
  desc: string;
  build: () => GeoSiteElement[];
};

export const PAGE_TEMPLATES: PageTemplateMeta[] = [
  {
    key: 'blank',
    label: '空白页',
    group: '基础',
    desc: '只有一个主标题与说明，适合完全自己搭',
    build: () => [
      box(
        '页头',
        [h1('新页面'), p('这一段可以在右侧属性面板里改成页面导语。')],
        {
          maxWidth: 960,
          margin: '0 auto',
          padding: '56px 24px 24px',
        },
      ),
    ],
  },
  {
    key: 'section',
    label: '单区块',
    group: '基础',
    desc: '一个带背景的区块，适合插在大页中间',
    build: () => [
      box('区块', [h2('小标题'), p('把要强调的一段话放在这里。')], {
        background: '#f8fafc',
        borderRadius: 16,
        maxWidth: 960,
        margin: '24px auto',
      }),
    ],
  },
  {
    key: 'hero',
    label: '大标题 + 行动按钮',
    group: '基础',
    desc: '次级页面的顶部区，带一个主行动',
    build: () => [
      box(
        '主视觉',
        [
          h1('一句话讲清你能提供什么', { fontSize: 44 }),
          p('用两行说明补充关键差异点，让访客在 3 秒内决定是否继续往下看。'),
          el(
            'row',
            '按钮组',
            'container',
            [button('立即咨询', '#contact'), button('查看方案', '#plans')],
            {
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              alignItems: 'center',
            },
          ),
        ],
        { maxWidth: 960, margin: '0 auto', padding: '64px 24px' },
      ),
    ],
  },
  {
    key: 'twoCol',
    label: '图文两栏',
    group: '基础',
    desc: '左文右图的对照版式',
    build: () => [
      box(
        '图文对照',
        [
          el(
            '2Col',
            '两列',
            'container',
            [
              box(
                '文字',
                [h2('为什么选择我们'), p('列三条最有力的理由，每条一行。')],
                { padding: '16px 20px 16px 0' },
              ),
              box(
                '配图',
                [
                  el(
                    'image',
                    '图片',
                    'basic',
                    { imageUrl: '', altText: '示意图' },
                    { width: '100%', borderRadius: 12 },
                  ),
                ],
                {
                  padding: '16px 0 16px 20px',
                },
              ),
            ],
            {
              display: 'flex',
              gap: 24,
              flexWrap: 'wrap',
              alignItems: 'stretch',
            },
          ),
        ],
        { maxWidth: 1080, margin: '0 auto' },
      ),
    ],
  },
  {
    key: 'articleGrid',
    label: '文章列表（网格）',
    group: '内容',
    desc: '自动展示内容库已发布文章，带分页',
    build: () => [
      box(
        '文章',
        [
          h1('最新动态'),
          p('这里的内容由内容库自动填充，不需要手工维护。'),
          grid('post'),
        ],
        {
          maxWidth: 1080,
          margin: '0 auto',
        },
      ),
    ],
  },
  {
    key: 'articleRail',
    label: '文章列表（纵向）',
    group: '内容',
    desc: '带摘要与封面的纵向清单，适合资讯站',
    build: () => [
      box('文章', [h1('全部文章'), rail('post')], {
        maxWidth: 880,
        margin: '0 auto',
      }),
    ],
  },
  {
    key: 'productGrid',
    label: '产品列表（网格）',
    group: '内容',
    desc: '自动展示内容库已发布产品，带价格',
    build: () => [
      box('产品', [h1('产品与方案'), grid('product')], {
        maxWidth: 1120,
        margin: '0 auto',
      }),
    ],
  },
  {
    key: 'productRail',
    label: '产品列表（纵向）',
    group: '内容',
    desc: '左图右参数的产品清单',
    build: () => [
      box('产品', [h1('全部产品'), rail('product')], {
        maxWidth: 960,
        margin: '0 auto',
      }),
    ],
  },
  {
    key: 'articleDetail',
    label: '文章详情骨架',
    group: '内容',
    desc: '标题区 + 正文 + 相关推荐，正文取自被访问的文章',
    build: () => [
      box(
        '正文容器',
        [
          el(
            'articleMeta',
            '文章信息',
            'basic',
            {
              showAuthor: true,
              showDate: true,
              showCategory: true,
              showViews: true,
            },
            {
              color: '#94a3b8',
              fontSize: 13,
              marginBottom: 18,
            },
          ),
          el('articleBody', '文章正文', 'basic', {}, {}),
          el(
            'divider',
            '分隔线',
            'basic',
            {},
            {
              border: 'none',
              borderTop: '1px solid #e2e8f0',
              margin: '32px 0',
            },
          ),
          el(
            'relatedPosts',
            '相关推荐',
            'basic',
            { title: '相关阅读', columns: 3 },
            {},
          ),
        ],
        { maxWidth: 760, margin: '0 auto', padding: '48px 24px' },
      ),
    ],
  },
  {
    key: 'productDetail',
    label: '产品详情骨架',
    group: '内容',
    desc: '价格与规格 + 详情正文 + 相关推荐',
    build: () => [
      box(
        '详情',
        [
          el(
            '2Col',
            '两列',
            'container',
            [
              el(
                'image',
                '主图',
                'basic',
                { imageUrl: '', altText: '产品图' },
                { width: '100%', borderRadius: 12 },
              ),
              el(
                'productInfo',
                '产品信息',
                'basic',
                { showPrice: true, showSpecs: true, showBuy: true },
                { padding: '0 0 0 20px' },
              ),
            ],
            {
              display: 'flex',
              gap: 28,
              flexWrap: 'wrap',
              alignItems: 'flex-start',
            },
          ),
          el('articleBody', '详情正文', 'basic', {}, {}),
          el(
            'relatedPosts',
            '相关推荐',
            'basic',
            { title: '配套方案', columns: 3 },
            {},
          ),
        ],
        { maxWidth: 1080, margin: '0 auto', padding: '48px 24px' },
      ),
    ],
  },
  {
    key: 'navFooter',
    label: '导航 + 页脚',
    group: '版式',
    desc: '页面顶部导航条与页脚导航，配合菜单管理使用',
    build: () => [
      el(
        'navBar',
        '顶部导航',
        'basic',
        { brand: '', sticky: true },
        {
          padding: '14px 24px',
          borderBottom: '1px solid #e2e8f0',
          background: '#ffffff',
        },
      ),
      box('页面主体', [h1('页面标题'), p('主体内容放在这里。')], {
        maxWidth: 960,
        margin: '0 auto',
      }),
      el(
        'footerNav',
        '页脚导航',
        'basic',
        { columns: 3, showCopyright: true },
        {
          padding: '36px 24px',
          background: '#0f172a',
          color: '#cbd5e1',
        },
      ),
    ],
  },
  {
    key: 'about',
    label: '关于我们',
    group: '版式',
    desc: '介绍 + 三点优势 + 联系方式',
    build: () => [
      box(
        '介绍',
        [h1('关于我们'), p('用一段话讲清公司是谁、服务谁、凭什么可信。')],
        {
          maxWidth: 860,
          margin: '0 auto',
        },
      ),
      box(
        '优势',
        [
          h2('我们的优势'),
          el(
            '3Col',
            '三列',
            'container',
            [
              box('优势一', [h2('更快'), p('交付周期压缩到 7 天。')], {
                background: '#f8fafc',
                borderRadius: 12,
                padding: '20px',
              }),
              box('优势二', [h2('更省'), p('一次配置，多站点复用。')], {
                background: '#f8fafc',
                borderRadius: 12,
                padding: '20px',
              }),
              box('优势三', [h2('更稳'), p('平台级监控与告警。')], {
                background: '#f8fafc',
                borderRadius: 12,
                padding: '20px',
              }),
            ],
            {
              display: 'flex',
              gap: 18,
              flexWrap: 'wrap',
              alignItems: 'stretch',
            },
          ),
        ],
        { maxWidth: 1080, margin: '0 auto' },
      ),
      box(
        '联系',
        [
          h2('联系我们'),
          p('电话 / 微信 / 邮箱任选其一放在这里。'),
          button('预约演示', '#contact'),
        ],
        {
          maxWidth: 860,
          margin: '0 auto',
        },
      ),
    ],
  },
  {
    key: 'contact',
    label: '联系我们',
    group: '版式',
    desc: '联系方式 + 表单占位',
    build: () => [
      box(
        '联系',
        [
          h1('联系我们'),
          p('把联系方式写清楚，转化率取决于访客能否在三秒内找到入口。'),
          el(
            'list',
            '联系方式',
            'basic',
            {
              innerText:
                '电话：400-000-0000\n邮箱：hello@example.com\n地址：上海市浦东新区',
            },
            {
              paddingLeft: 20,
              lineHeight: 1.9,
              color: '#475569',
            },
          ),
          button('发送邮件', 'mailto:hello@example.com'),
        ],
        { maxWidth: 760, margin: '0 auto', padding: '56px 24px' },
      ),
    ],
  },
  {
    key: 'faq',
    label: '常见问题',
    group: '版式',
    desc: '问答式小标题，利于 AI 摘录',
    build: () => [
      box(
        '问答',
        [
          h1('常见问题'),
          h3('你们怎么收费？'),
          p('按站点按月计费，费用在积分中心出账，可随时下线停止计费。'),
          h3('可以绑定自己的域名吗？'),
          p('可以。在站点编辑器点「域名」按提示加一条 TXT 记录即可完成校验。'),
          h3('页面能加统计代码吗？'),
          p('可以。在页面属性里添加脚本地址，域名需通过平台白名单校验。'),
        ],
        { maxWidth: 760, margin: '0 auto' },
      ),
    ],
  },
];

export const PAGE_TEMPLATE_KEYS = PAGE_TEMPLATES.map((item) => ({
  key: item.key,
  label: item.label,
  group: item.group,
  desc: item.desc,
}));

export function pageTemplateElements(key: string): GeoSiteElement[] {
  const hit = PAGE_TEMPLATES.find(
    (item) => item.key === String(key || '').trim(),
  );
  return hit ? hit.build() : [];
}

/** 页面类型 → 默认骨架：新建时不选模板就走这份，保证列表/详情页天生带动态元素。 */
export function pageTemplateOf(
  kind: string,
  contentType: string,
): GeoSiteElement[] {
  switch (kind) {
    case 'articleList':
      return pageTemplateElements(
        contentType === 'product' ? 'productGrid' : 'articleGrid',
      );
    case 'productList':
      return pageTemplateElements('productGrid');
    case 'articleDetail':
      return pageTemplateElements('articleDetail');
    case 'productDetail':
      return pageTemplateElements('productDetail');
    case 'blank':
      return pageTemplateElements('blank');
    case 'landing':
      return pageTemplateElements('hero');
    default:
      return pageTemplateElements('blank');
  }
}
