import { geoSiteSeoDefaults } from '@enterprise/contracts';

/**
 * GEO 独立站内建模板：直接给出元素树（与 Framely 的 EditorElement 同构），
 * 用户新建站点时挑一套即可得到结构完整的营销页，之后在编辑器里改文案/图片。
 *
 * 组织方式：Scheme（配色令牌）→ 区块构造器（首屏/要点/图文/流程/方案/图集/评价/问答…）→ 模板文案。
 * 十套模板共用一套版式代码，改一处排版全部跟着变，不会出现「模板三和模板一规范不一样」的漂移。
 *
 * 每套模板都按 GEO（生成式引擎优化）口径写：唯一可被模型直接摘录的 H1 论点、
 * 问答式 H2 小节、要点列表，以及唯一一处 FAQ 区块（发布时据此输出 FAQPage JSON-LD）。
 *
 * 三条硬约束（写模板时必须守，否则编辑器与发布页不一致）：
 * 1. 长度一律写成 px 字符串，数字只留给 lineHeight / zIndex 这类无单位属性；
 * 2. 段落文案不要带换行——发布端是 HTML（换行会折叠），只有 list 类型按行拆条目；
 * 3. 除 faqSection 外，任何容器的直接子元素里最多只放一个 h3，否则会被误判成 FAQ 结构化数据。
 */

export type GeoSiteTemplate = {
  key: string;
  name: string;
  desc: string;
  /** 选择器上的分类标签，例：产品 · SaaS。 */
  tag: string;
  theme: 'light' | 'dark';
  /** 主色，用于选择器缩略图。 */
  accent: string;
  /** 首屏背景，用于选择器缩略图。 */
  heroBg: string;
  /** 模板自带的站点级 SEO 默认值（用户可改）。 */
  seo: Record<string, unknown>;
  elements: Record<string, unknown>[];
};

let seq = 0;
function newId(): string {
  seq += 1;
  return `tpl${seq.toString(36)}`;
}

type Styles = Record<string, string | number>;

/** 元素构造器：样式只写与版式相关的属性，其余交给渲染层默认值。 */
function el(
  type: string,
  category: string,
  content: unknown,
  styles: Styles = {},
  name = '',
): Record<string, unknown> {
  return { id: newId(), name: name || type, type, category, styles, content };
}

const container = (
  children: Record<string, unknown>[],
  styles: Styles = {},
  name = '容器',
) => el('container', 'container', children, styles, name);

const text = (type: string, innerText: string, styles: Styles = {}) =>
  el(type, 'text', { innerText }, styles, type.toUpperCase());

const image = (altText: string, styles: Styles = {}, name = '图片') =>
  el('image', 'basic', { imageUrl: '', altText }, styles, name);

/** 要点列表：一行一条，发布端与编辑器都按换行拆 li。 */
const bullets = (items: string[], styles: Styles = {}) =>
  el(
    'list',
    'basic',
    { innerText: items.join('\n') },
    { paddingLeft: '20px', margin: '0 0 20px', ...styles },
    '列表',
  );

/* ------------------------------- 配色令牌 ------------------------------- */

type Scheme = {
  theme: 'light' | 'dark';
  /** 主色（按钮、强调、themeColor）。 */
  accent: string;
  onAccent: string;
  heroBg: string;
  /** 首屏是否深色底：决定首屏文字、胶囊与描边按钮用哪套色值。 */
  heroDark: boolean;
  heroInk: string;
  heroSub: string;
  page: string;
  band: string;
  card: string;
  line: string;
  ink: string;
  body: string;
  muted: string;
  tint: string;
  tintInk: string;
  shadow: string;
  /** 标题字体（衬线模板用），不写则跟随全局无衬线。 */
  headFont?: string;
};

/** 只有衬线模板才产出 fontFamily，其余模板返回空对象，免得写入空字符串样式。 */
const headFontOf = (sch: Scheme): Record<string, string> =>
  sch.headFont ? { fontFamily: sch.headFont } : {};

const INDIGO: Scheme = {
  theme: 'light',
  accent: '#4f46e5',
  onAccent: '#ffffff',
  heroBg: 'linear-gradient(140deg,#111827,#312e81 55%,#4f46e5)',
  heroDark: true,
  heroInk: '#f8fafc',
  heroSub: '#c7d2fe',
  page: '#ffffff',
  band: '#f8fafc',
  card: '#f8fafc',
  line: '#e2e8f0',
  ink: '#0f172a',
  body: '#475569',
  muted: '#64748b',
  tint: '#eef2ff',
  tintInk: '#4338ca',
  shadow: '0 12px 32px rgba(15,23,42,0.08)',
};

const EMERALD: Scheme = {
  theme: 'light',
  accent: '#059669',
  onAccent: '#ffffff',
  heroBg: 'linear-gradient(140deg,#022c22,#065f46 58%,#059669)',
  heroDark: true,
  heroInk: '#f0fdf9',
  heroSub: '#a7f3d0',
  page: '#ffffff',
  band: '#f6faf8',
  card: '#f0fdf4',
  line: '#d6ecdf',
  ink: '#06342a',
  body: '#3f6255',
  muted: '#6b8f83',
  tint: '#ecfdf5',
  tintInk: '#047857',
  shadow: '0 12px 32px rgba(6,78,59,0.10)',
};

const VIOLET: Scheme = {
  theme: 'light',
  accent: '#7c3aed',
  onAccent: '#ffffff',
  heroBg: 'linear-gradient(140deg,#1e1b4b,#4c1d95 55%,#7c3aed)',
  heroDark: true,
  heroInk: '#f8f7ff',
  heroSub: '#ddd6fe',
  page: '#ffffff',
  band: '#faf9ff',
  card: '#f9f5ff',
  line: '#e9e2fb',
  ink: '#241a4d',
  body: '#5b5470',
  muted: '#7c7691',
  tint: '#f3eeff',
  tintInk: '#6d28d9',
  shadow: '0 12px 34px rgba(76,29,149,0.10)',
};

const MINIMAL: Scheme = {
  theme: 'light',
  accent: '#111827',
  onAccent: '#ffffff',
  heroBg: '#f5f5f4',
  heroDark: false,
  heroInk: '#0b1220',
  heroSub: '#4b5563',
  page: '#ffffff',
  band: '#fafafa',
  card: '#ffffff',
  line: '#e5e7eb',
  ink: '#0b1220',
  body: '#4b5563',
  muted: '#9ca3af',
  tint: '#f3f4f6',
  tintInk: '#111827',
  shadow: '0 10px 30px rgba(17,24,39,0.06)',
};

const CARBON: Scheme = {
  theme: 'dark',
  accent: '#38bdf8',
  onAccent: '#04121f',
  heroBg: 'linear-gradient(140deg,#020617,#0b2545 55%,#075985)',
  heroDark: true,
  heroInk: '#f1f5f9',
  heroSub: '#93c5fd',
  page: '#0b1020',
  band: '#0e1526',
  card: '#121a2e',
  line: '#243149',
  ink: '#e8eefb',
  body: '#a9b7d0',
  muted: '#7e8db0',
  tint: '#0f2136',
  tintInk: '#7dd3fc',
  shadow: '0 18px 44px rgba(2,6,23,0.55)',
};

const CORAL: Scheme = {
  theme: 'light',
  accent: '#e11d48',
  onAccent: '#ffffff',
  heroBg: 'linear-gradient(140deg,#4c0519,#9f1239 55%,#e11d48)',
  heroDark: true,
  heroInk: '#fff5f6',
  heroSub: '#fecdd3',
  page: '#ffffff',
  band: '#fff6f7',
  card: '#fff5f6',
  line: '#fbd5da',
  ink: '#3d1018',
  body: '#5c4249',
  muted: '#8b7178',
  tint: '#ffeef0',
  tintInk: '#be123c',
  shadow: '0 12px 32px rgba(159,18,57,0.10)',
};

const AMBER: Scheme = {
  theme: 'light',
  accent: '#ea580c',
  onAccent: '#ffffff',
  heroBg: 'linear-gradient(140deg,#431407,#9a3412 55%,#ea580c)',
  heroDark: true,
  heroInk: '#fffaf5',
  heroSub: '#fed7aa',
  page: '#ffffff',
  band: '#fffaf3',
  card: '#fff7ed',
  line: '#f6dfc4',
  ink: '#33190a',
  body: '#57534e',
  muted: '#8c7c6b',
  tint: '#ffedd5',
  tintInk: '#c2410c',
  shadow: '0 12px 30px rgba(120,53,15,0.10)',
};

const EDITORIAL: Scheme = {
  theme: 'light',
  accent: '#9a3412',
  onAccent: '#ffffff',
  heroBg: '#f2efe8',
  heroDark: false,
  heroInk: '#1a1a18',
  heroSub: '#6b6a63',
  page: '#fbfaf7',
  band: '#f5f2ec',
  card: '#ffffff',
  line: '#e4ded1',
  ink: '#1a1a18',
  body: '#4b4a45',
  muted: '#8a887f',
  tint: '#f0ebe0',
  tintInk: '#9a3412',
  shadow: '0 12px 30px rgba(26,26,24,0.07)',
  headFont: 'Georgia, Times, serif',
};

const PAPER: Scheme = {
  theme: 'light',
  accent: '#1d4ed8',
  onAccent: '#ffffff',
  heroBg: '#f6f1e6',
  heroDark: false,
  heroInk: '#1c1917',
  heroSub: '#57534e',
  page: '#fffdf8',
  band: '#f8f3e9',
  card: '#faf6ee',
  line: '#e6ddcc',
  ink: '#1c1917',
  body: '#44403c',
  muted: '#8c8477',
  tint: '#f2ead9',
  tintInk: '#1d4ed8',
  shadow: '0 10px 26px rgba(68,64,60,0.07)',
  headFont: 'Georgia, Times, serif',
};

/* ------------------------------- 版式原子 ------------------------------- */

type Tone = 'solid' | 'outline' | 'soft' | 'hero';

/** 内容列：全宽色带里再套一层居中容器，色块能通栏、文字有安全边距。 */
function band(
  sch: Scheme,
  name: string,
  children: Record<string, unknown>[],
  opts: { bg?: string; pad?: string; maxW?: string } = {},
) {
  const inner = container(children, {
    width: '100%',
    maxWidth: opts.maxW ?? '1120px',
    margin: '0 auto',
    padding: opts.pad ?? '76px 24px',
  });
  return container(
    [inner],
    { width: '100%', background: opts.bg ?? sch.page },
    name,
  );
}

const flexRow = (
  children: Record<string, unknown>[],
  extra: Styles = {},
): Record<string, unknown> =>
  container(children, {
    display: 'flex',
    gap: '22px',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    ...extra,
  });

/** 标题上方的小胶囊：深色首屏用半透明白，浅色区用主色浅底。 */
function eyebrow(sch: Scheme, label: string, onHero = false) {
  const base: Styles = {
    display: 'inline-block',
    margin: '0 0 18px',
    padding: '7px 16px',
    fontSize: '13px',
    fontWeight: '600',
    letterSpacing: '0.8px',
    lineHeight: '1.6',
    borderRadius: '999px',
  };
  return text(
    'p',
    label,
    onHero && sch.heroDark
      ? {
          ...base,
          color: sch.heroInk,
          background: 'rgba(255,255,255,0.14)',
          border: '1px solid rgba(255,255,255,0.24)',
        }
      : { ...base, color: sch.tintInk, background: sch.tint },
  );
}

/** 区块标题三件套：小标签 + H2 + 引导段。 */
function headingBlock(
  sch: Scheme,
  input: {
    eyebrow?: string;
    title: string;
    sub?: string;
    align?: 'center' | 'left';
  },
) {
  const align = input.align ?? 'center';
  const nodes: Record<string, unknown>[] = [];
  if (input.eyebrow) nodes.push(eyebrow(sch, input.eyebrow));
  // 没有引导段时把间距补到标题上，否则标题会紧贴下一块内容
  nodes.push(
    text('h2', input.title, {
      margin: input.sub ? '0 0 14px' : '0 0 36px',
      fontSize: '34px',
      lineHeight: '1.3',
      fontWeight: '700',
      color: sch.ink,
      ...headFontOf(sch),
      textAlign: align,
    }),
  );
  if (input.sub) {
    nodes.push(
      text('p', input.sub, {
        margin: align === 'center' ? '0 auto 44px' : '0 0 28px',
        maxWidth: '700px',
        fontSize: '17px',
        lineHeight: '1.85',
        color: sch.muted,
        textAlign: align,
      }),
    );
  }
  return nodes;
}

function buttonStyle(sch: Scheme, tone: Tone): Styles {
  const base: Styles = {
    display: 'inline-block',
    padding: '14px 32px',
    fontSize: '16px',
    fontWeight: '600',
    lineHeight: '1.5',
    textAlign: 'center',
    borderRadius: '999px',
    border: 'none',
  };
  if (tone === 'hero')
    return {
      ...base,
      color: sch.heroInk,
      background: 'rgba(255,255,255,0.12)',
      border: '1px solid rgba(255,255,255,0.34)',
    };
  if (tone === 'soft')
    return { ...base, color: sch.tintInk, background: sch.tint };
  if (tone === 'outline')
    return {
      ...base,
      color: sch.ink,
      background: 'transparent',
      border: `1px solid ${sch.line}`,
    };
  return { ...base, color: sch.onAccent, background: sch.accent };
}

const buttonEl = (
  label: string,
  href: string,
  style: Styles,
): Record<string, unknown> =>
  el('button', 'basic', { innerText: label, href }, style, '按钮');

function ctaRow(
  sch: Scheme,
  buttons: { label: string; href?: string; tone?: Tone }[],
  align: 'center' | 'left' = 'center',
) {
  return container(
    buttons.map((item) =>
      buttonEl(
        item.label,
        item.href ?? '#contact',
        buttonStyle(sch, item.tone ?? 'solid'),
      ),
    ),
    {
      display: 'flex',
      gap: '14px',
      flexWrap: 'wrap',
      justifyContent: align === 'center' ? 'center' : 'flex-start',
    },
  );
}

const cardStyle = (sch: Scheme, extra: Styles = {}): Styles => ({
  flex: '1 1 300px',
  padding: '28px 26px',
  background: sch.card,
  border: `1px solid ${sch.line}`,
  borderRadius: '18px',
  boxShadow: sch.shadow,
  ...extra,
});

/* ------------------------------- 区块构造器 ------------------------------- */

function heroCenter(
  sch: Scheme,
  input: {
    eyebrow?: string;
    title: string;
    sub: string;
    stats?: { value: string; label: string }[];
    buttons?: { label: string; href?: string; tone?: Tone }[];
  },
) {
  const children: Record<string, unknown>[] = [
    ...(input.eyebrow ? [eyebrow(sch, input.eyebrow, true)] : []),
    text('h1', input.title, {
      margin: '0 auto 20px',
      maxWidth: '860px',
      fontSize: '46px',
      lineHeight: '1.2',
      fontWeight: '700',
      color: sch.heroInk,
      ...headFontOf(sch),
      textAlign: 'center',
    }),
    text('p', input.sub, {
      margin: '0 auto 34px',
      maxWidth: '680px',
      fontSize: '18px',
      lineHeight: '1.9',
      color: sch.heroSub,
      textAlign: 'center',
    }),
    ctaRow(sch, input.buttons ?? [{ label: '联系我们', href: '#contact' }]),
  ];
  if (input.stats?.length) {
    children.push(
      flexRow(
        input.stats.map((stat) =>
          container(
            [
              text('p', stat.value, {
                margin: '0 0 4px',
                fontSize: '28px',
                fontWeight: '700',
                lineHeight: '1.25',
                color: sch.heroInk,
                textAlign: 'center',
              }),
              text('p', stat.label, {
                margin: 0,
                fontSize: '14px',
                lineHeight: '1.6',
                color: sch.heroSub,
                textAlign: 'center',
              }),
            ],
            { flex: '1 1 160px', padding: '0 10px' },
          ),
        ),
        { gap: '18px', margin: '44px 0 0', justifyContent: 'center' },
      ),
    );
  }
  return band(sch, '首屏', children, { bg: sch.heroBg, pad: '108px 24px' });
}

function heroSplit(
  sch: Scheme,
  input: {
    eyebrow?: string;
    title: string;
    sub: string;
    bullets?: string[];
    imageAlt: string;
    stats?: { value: string; label: string }[];
    buttons?: { label: string; href?: string; tone?: Tone }[];
  },
) {
  const copy = container(
    [
      ...(input.eyebrow ? [eyebrow(sch, input.eyebrow, true)] : []),
      text('h1', input.title, {
        margin: '0 0 18px',
        fontSize: '42px',
        lineHeight: '1.22',
        fontWeight: '700',
        color: sch.heroInk,
        ...headFontOf(sch),
      }),
      text('p', input.sub, {
        margin: '0 0 26px',
        fontSize: '18px',
        lineHeight: '1.9',
        color: sch.heroSub,
      }),
      ...(input.bullets?.length
        ? [
            bullets(input.bullets, {
              margin: '0 0 26px',
              fontSize: '16px',
              lineHeight: '2',
              color: sch.heroSub,
            }),
          ]
        : []),
      ctaRow(sch, input.buttons ?? [{ label: '开始使用' }], 'left'),
      ...(input.stats?.length
        ? [
            flexRow(
              input.stats.map((stat) =>
                container(
                  [
                    text('p', stat.value, {
                      margin: '0 0 2px',
                      fontSize: '24px',
                      fontWeight: '700',
                      lineHeight: '1.3',
                      color: sch.heroInk,
                    }),
                    text('p', stat.label, {
                      margin: 0,
                      fontSize: '13px',
                      lineHeight: '1.6',
                      color: sch.heroSub,
                    }),
                  ],
                  { flex: '1 1 120px', padding: '0 18px 0 0' },
                ),
              ),
              { gap: '10px', margin: '34px 0 0' },
            ),
          ]
        : []),
    ],
    { flex: '1 1 460px' },
  );
  const media = container(
    [
      image(input.imageAlt, {
        width: '100%',
        minHeight: '320px',
        borderRadius: '22px',
        boxShadow: sch.shadow,
      }),
    ],
    {
      flex: '1 1 360px',
      padding: '10px',
      borderRadius: '26px',
      background: sch.heroDark ? 'rgba(255,255,255,0.07)' : sch.card,
      border: `1px solid ${sch.heroDark ? 'rgba(255,255,255,0.16)' : sch.line}`,
    },
  );
  return band(
    sch,
    '首屏',
    [flexRow([copy, media], { gap: '46px', alignItems: 'center' })],
    { bg: sch.heroBg, pad: '104px 24px' },
  );
}

function cardsSection(
  sch: Scheme,
  input: {
    eyebrow?: string;
    title: string;
    sub?: string;
    items: { badge?: string; title: string; desc: string; points?: string[] }[];
    bg?: string;
  },
) {
  const cards = input.items.map((item) =>
    container(
      [
        ...(item.badge
          ? [
              container(
                [
                  text('span', item.badge, {
                    fontSize: '14px',
                    fontWeight: '700',
                    color: sch.tintInk,
                  }),
                ],
                {
                  width: '40px',
                  height: '40px',
                  lineHeight: '40px',
                  textAlign: 'center',
                  borderRadius: '12px',
                  background: sch.tint,
                  margin: '0 0 16px',
                },
              ),
            ]
          : []),
        text('h3', item.title, {
          margin: '0 0 10px',
          fontSize: '20px',
          lineHeight: '1.4',
          fontWeight: '700',
          color: sch.ink,
          ...headFontOf(sch),
        }),
        text('p', item.desc, {
          margin: item.points?.length ? '0 0 12px' : 0,
          fontSize: '15px',
          lineHeight: '1.85',
          color: sch.body,
        }),
        ...(item.points?.length
          ? [
              bullets(item.points, {
                margin: '0',
                fontSize: '14px',
                lineHeight: '1.9',
                color: sch.muted,
              }),
            ]
          : []),
      ],
      cardStyle(sch),
      '卡片',
    ),
  );
  return band(
    sch,
    '要点',
    [...headingBlock(sch, input), flexRow(cards, { gap: '20px' })],
    { bg: input.bg ?? sch.page },
  );
}

function featureSection(
  sch: Scheme,
  input: {
    eyebrow?: string;
    title: string;
    desc: string;
    points?: string[];
    button?: { label: string; href?: string; tone?: Tone };
    imageAlt: string;
    reverse?: boolean;
    bg?: string;
  },
) {
  const copy = container(
    [
      ...(input.eyebrow ? [eyebrow(sch, input.eyebrow)] : []),
      text('h2', input.title, {
        margin: '0 0 14px',
        fontSize: '30px',
        lineHeight: '1.32',
        fontWeight: '700',
        color: sch.ink,
        ...headFontOf(sch),
      }),
      text('p', input.desc, {
        margin: '0 0 18px',
        fontSize: '16px',
        lineHeight: '1.9',
        color: sch.body,
      }),
      ...(input.points?.length
        ? [
            bullets(input.points, {
              margin: '0 0 22px',
              fontSize: '15px',
              lineHeight: '2',
              color: sch.body,
            }),
          ]
        : []),
      ...(input.button ? [ctaRow(sch, [input.button], 'left')] : []),
    ],
    { flex: '1 1 460px' },
  );
  const media = container(
    [
      image(input.imageAlt, {
        width: '100%',
        minHeight: '300px',
        borderRadius: '20px',
        boxShadow: sch.shadow,
      }),
    ],
    {
      flex: '1 1 380px',
      padding: '10px',
      background: sch.band,
      border: `1px solid ${sch.line}`,
      borderRadius: '24px',
    },
  );
  return band(
    sch,
    '图文',
    [
      flexRow(input.reverse ? [media, copy] : [copy, media], {
        gap: '44px',
        alignItems: 'center',
      }),
    ],
    { bg: input.bg ?? sch.page, pad: '68px 24px' },
  );
}

function stepsSection(
  sch: Scheme,
  input: {
    eyebrow?: string;
    title: string;
    sub?: string;
    items: { title: string; desc: string }[];
    bg?: string;
  },
) {
  const steps = input.items.map((item, index) =>
    container(
      [
        container(
          [
            text('span', String(index + 1).padStart(2, '0'), {
              fontSize: '15px',
              fontWeight: '700',
              color: sch.tintInk,
            }),
          ],
          {
            width: '42px',
            height: '42px',
            lineHeight: '42px',
            textAlign: 'center',
            borderRadius: '999px',
            background: sch.tint,
            margin: '0 0 16px',
          },
        ),
        text('h3', item.title, {
          margin: '0 0 8px',
          fontSize: '18px',
          lineHeight: '1.45',
          fontWeight: '700',
          color: sch.ink,
          ...headFontOf(sch),
        }),
        text('p', item.desc, {
          margin: 0,
          fontSize: '15px',
          lineHeight: '1.85',
          color: sch.body,
        }),
      ],
      cardStyle(sch, { flex: '1 1 220px', background: sch.page }),
      '步骤',
    ),
  );
  return band(
    sch,
    '流程',
    [...headingBlock(sch, input), flexRow(steps, { gap: '18px' })],
    { bg: input.bg ?? sch.band },
  );
}

function plansSection(
  sch: Scheme,
  input: {
    eyebrow?: string;
    title: string;
    sub?: string;
    note?: string;
    items: {
      name: string;
      price: string;
      unit?: string;
      desc: string;
      points: string[];
      button: string;
      featured?: boolean;
    }[];
  },
) {
  const cards = input.items.map((item) =>
    container(
      [
        ...(item.featured
          ? [
              text('p', '最受欢迎', {
                display: 'inline-block',
                margin: '0 0 12px',
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: '700',
                lineHeight: '1.6',
                color: sch.onAccent,
                background: sch.accent,
                borderRadius: '999px',
              }),
            ]
          : []),
        text('h3', item.name, {
          margin: '0 0 6px',
          fontSize: '18px',
          lineHeight: '1.5',
          fontWeight: '700',
          color: sch.ink,
          ...headFontOf(sch),
        }),
        text('p', item.desc, {
          margin: '0 0 18px',
          fontSize: '14px',
          lineHeight: '1.8',
          color: sch.muted,
        }),
        container(
          [
            text('span', item.price, {
              fontSize: '34px',
              fontWeight: '700',
              lineHeight: '1.2',
              color: sch.ink,
            }),
            ...(item.unit
              ? [
                  text('span', item.unit, {
                    margin: '0 0 0 6px',
                    fontSize: '14px',
                    lineHeight: '1.2',
                    color: sch.muted,
                  }),
                ]
              : []),
          ],
          { margin: '0 0 18px' },
        ),
        bullets(item.points, {
          margin: '0 0 22px',
          fontSize: '14px',
          lineHeight: '2',
          color: sch.body,
        }),
        ctaRow(
          sch,
          [{ label: item.button, tone: item.featured ? 'solid' : 'outline' }],
          'left',
        ),
      ],
      cardStyle(sch, {
        flex: '1 1 260px',
        padding: '30px 28px',
        background: item.featured ? sch.band : sch.page,
        border: item.featured
          ? `2px solid ${sch.accent}`
          : `1px solid ${sch.line}`,
      }),
      '方案',
    ),
  );
  const nodes: Record<string, unknown>[] = [
    ...headingBlock(sch, input),
    flexRow(cards, { gap: '20px' }),
  ];
  if (input.note) {
    nodes.push(
      text('p', input.note, {
        margin: '26px 0 0',
        fontSize: '13px',
        lineHeight: '1.8',
        color: sch.muted,
        textAlign: 'center',
      }),
    );
  }
  return band(sch, '方案', nodes, { bg: sch.page });
}

function gallerySection(
  sch: Scheme,
  input: {
    eyebrow?: string;
    title: string;
    sub?: string;
    items: { alt: string; caption: string }[];
  },
) {
  const cards = input.items.map((item) =>
    container(
      [
        image(item.alt, {
          width: '100%',
          minHeight: '190px',
          borderRadius: '14px',
        }),
        text('p', item.caption, {
          margin: '12px 0 0',
          fontSize: '14px',
          lineHeight: '1.7',
          color: sch.body,
        }),
      ],
      cardStyle(sch, { flex: '1 1 250px', padding: '12px 12px 18px' }),
      '图集',
    ),
  );
  return band(
    sch,
    '案例',
    [...headingBlock(sch, input), flexRow(cards, { gap: '18px' })],
    { bg: sch.band },
  );
}

function quotesSection(
  sch: Scheme,
  input: {
    eyebrow?: string;
    title: string;
    sub?: string;
    items: { quote: string; who: string; role: string }[];
  },
) {
  const cards = input.items.map((item) =>
    container(
      [
        text('p', `「${item.quote}」`, {
          margin: '0 0 16px',
          fontSize: '16px',
          lineHeight: '1.9',
          color: sch.ink,
          ...headFontOf(sch),
        }),
        text('p', `${item.who} · ${item.role}`, {
          margin: 0,
          fontSize: '14px',
          lineHeight: '1.7',
          color: sch.muted,
        }),
      ],
      cardStyle(sch, {
        flex: '1 1 300px',
        borderLeft: `3px solid ${sch.accent}`,
      }),
      '评价',
    ),
  );
  return band(
    sch,
    '评价',
    [...headingBlock(sch, input), flexRow(cards, { gap: '20px' })],
    { bg: sch.page },
  );
}

/**
 * FAQ 区块：所有问答放在同一个容器的直接子级里（h3 + p 交替），
 * 发布时 render.service 靠这个形状抽取 FAQPage JSON-LD，拆成卡片就抽不到了。
 */
function faqSection(
  sch: Scheme,
  input: {
    eyebrow?: string;
    title: string;
    sub?: string;
    items: { q: string; a: string }[];
  },
) {
  const pairs = input.items.flatMap((item) => [
    text('h3', item.q, {
      margin: '22px 0 8px',
      fontSize: '17px',
      lineHeight: '1.55',
      fontWeight: '700',
      color: sch.ink,
      ...headFontOf(sch),
    }),
    text('p', item.a, {
      margin: '0 0 6px',
      fontSize: '15px',
      lineHeight: '1.9',
      color: sch.body,
    }),
  ]);
  const list = container(pairs, {
    width: '100%',
    padding: '10px 30px 26px',
    background: sch.card,
    border: `1px solid ${sch.line}`,
    borderRadius: '18px',
  });
  return band(sch, '常见问题', [...headingBlock(sch, input), list], {
    bg: sch.band,
  });
}

function contactSection(
  sch: Scheme,
  input: {
    eyebrow?: string;
    title: string;
    sub?: string;
    items: { label: string; value: string; hint?: string }[];
    button?: string;
  },
) {
  const cards = input.items.map((item) =>
    container(
      [
        text('h4', item.label, {
          margin: '0 0 6px',
          fontSize: '13px',
          lineHeight: '1.6',
          fontWeight: '600',
          letterSpacing: '0.4px',
          color: sch.muted,
        }),
        text('p', item.value, {
          margin: 0,
          fontSize: '17px',
          lineHeight: '1.6',
          fontWeight: '600',
          color: sch.ink,
        }),
        ...(item.hint
          ? [
              text('p', item.hint, {
                margin: '6px 0 0',
                fontSize: '13px',
                lineHeight: '1.7',
                color: sch.muted,
              }),
            ]
          : []),
      ],
      cardStyle(sch, { flex: '1 1 230px', padding: '24px 22px' }),
      '联系方式',
    ),
  );
  const nodes: Record<string, unknown>[] = [
    ...headingBlock(sch, input),
    flexRow(cards, { gap: '18px' }),
    container([ctaRow(sch, [{ label: input.button ?? '预约沟通' }])], {
      margin: '36px 0 0',
      textAlign: 'center',
    }),
  ];
  return band(sch, '联系', nodes, { bg: sch.page });
}

function ctaBand(
  sch: Scheme,
  input: {
    title: string;
    desc: string;
    primary: string;
    secondary?: string;
  },
) {
  return band(
    sch,
    '行动号召',
    [
      text('h2', input.title, {
        margin: '0 auto 12px',
        maxWidth: '720px',
        fontSize: '32px',
        lineHeight: '1.35',
        fontWeight: '700',
        color: sch.heroInk,
        ...headFontOf(sch),
        textAlign: 'center',
      }),
      text('p', input.desc, {
        margin: '0 auto 30px',
        maxWidth: '620px',
        fontSize: '17px',
        lineHeight: '1.85',
        color: sch.heroSub,
        textAlign: 'center',
      }),
      ctaRow(sch, [
        { label: input.primary, href: '#contact', tone: 'solid' },
        ...(input.secondary
          ? [
              {
                label: input.secondary,
                href: '#content',
                tone: 'hero' as Tone,
              },
            ]
          : []),
      ]),
    ],
    { bg: sch.heroBg, pad: '78px 24px' },
  );
}

/** 整页外壳：根节点样式落到 body，深色主题靠这里换底色与正文色。 */
function pageShell(sch: Scheme, sections: Record<string, unknown>[]) {
  return [
    el(
      '__body',
      'root',
      sections,
      { background: sch.page, color: sch.body, margin: '0', padding: '0' },
      '页面',
    ),
  ];
}

function makeTemplate(input: {
  key: string;
  name: string;
  desc: string;
  tag: string;
  sch: Scheme;
  seo: Record<string, unknown>;
  sections: Record<string, unknown>[];
}): GeoSiteTemplate {
  const { key, name, desc, tag, sch, seo, sections } = input;
  return {
    key,
    name,
    desc,
    tag,
    theme: sch.theme,
    accent: sch.accent,
    heroBg: sch.heroBg,
    seo: {
      ...geoSiteSeoDefaults,
      themeColor: sch.accent,
      title: name,
      ...seo,
    },
    elements: pageShell(sch, sections),
  };
}

/* --------------------------------- 模板集 --------------------------------- */

export const GEO_SITE_TEMPLATES: GeoSiteTemplate[] = [
  makeTemplate({
    key: 'geo-landing',
    name: 'GEO 品牌落地页',
    desc: '深蓝渐变首屏 + 卖点 + 图文 + 流程 + 问答，品牌官网首页首选',
    tag: '品牌官网',
    sch: INDIGO,
    seo: {
      title: '让品牌被 AI 搜索看见',
      description:
        '面向生成式引擎优化的品牌独立站：结论式首屏、可核验数据、问答式小节，发布即输出 sitemap 与 llms.txt。',
      keywords: ['GEO', '生成式引擎优化', '品牌独立站'],
      jsonld: { organization: true, website: true, product: false, faq: true },
    },
    sections: [
      heroCenter(INDIGO, {
        eyebrow: 'GEO 建站 · 一次搭建多端收录',
        title: '让品牌被 AI 搜索看见',
        sub: '面向生成式引擎的内容结构：清晰论点、可核验数据、问答式小节。不用写代码，也不用排队等技术。',
        stats: [
          { value: '2 周', label: '平均收录见效' },
          { value: '12 项', label: '结构化标记自动输出' },
          { value: '0 行', label: '需要你自己写的代码' },
        ],
        buttons: [
          { label: '免费建一套', href: '#contact' },
          { label: '看看怎么做', href: '#content', tone: 'hero' },
        ],
      }),
      cardsSection(INDIGO, {
        eyebrow: '我们能解决什么',
        title: '三个让内容被引用的关键点',
        sub: '搜索引擎给的是一次点击，生成式引擎给的是一次引用。我们把站点做成两者都读得懂的样子。',
        items: [
          {
            badge: '01',
            title: '结构化内容',
            desc: '标题层级与问答小节按模型摘录习惯编排，结论前置，论点成段。',
            points: [
              '一屏一个核心论点',
              '小节标题用问句写',
              '段落控制在三行内',
            ],
          },
          {
            badge: '02',
            title: '数据可核验',
            desc: '每个结论都配来源、时间与口径，模型引用时更敢用，客户追问时答得上。',
            points: ['指标写明统计周期', '案例带可复现结果'],
          },
          {
            badge: '03',
            title: '一键发布',
            desc: '发布即生成 sitemap、robots、llms.txt 与结构化数据，不必再找技术排期。',
            points: ['站点级 SEO 可改', 'FAQ 自动输出结构化数据'],
          },
        ],
      }),
      featureSection(INDIGO, {
        eyebrow: '内容方法',
        title: '从关键词到答案：把官网改成 AI 读得懂的结构',
        desc: '我们把品牌信息拆成「问题—结论—证据」三段式，配合结构化标记，让检索引擎与生成式引擎都能稳定抽取同一条答案。',
        points: [
          '先定结论：每个小节第一句就是答案',
          '再补证据：数据、客户名、时间一个不少',
          '最后对齐：问答互不重复、互不矛盾',
        ],
        button: { label: '要一份内容结构诊断' },
        imageAlt: '内容结构示意：问题—结论—证据三段式',
        bg: INDIGO.band,
      }),
      featureSection(INDIGO, {
        eyebrow: '发布与收录',
        title: '上线当天就能被检索到的技术底座',
        desc: '页面服务端直出 HTML，不依赖前端框架；站点地图、robots 与 llms.txt 随发布同步刷新，改动当天生效。',
        points: [
          '首屏即完整内容，不等脚本执行',
          '绑定自有域名只需两条解析记录',
        ],
        button: { label: '看绑定指引', tone: 'outline' },
        imageAlt: '发布链路示意：草稿、发布、收录、引用',
        reverse: true,
      }),
      stepsSection(INDIGO, {
        eyebrow: '合作流程',
        title: '四步把站点立起来',
        sub: '每一步都有明确交付物与验收口径，不做黑盒。',
        items: [
          {
            title: '选题与口径',
            desc: '确认目标客户常问的 10 个问题，统一品牌结论与数据口径。',
          },
          {
            title: '套模板改文案',
            desc: '在拖拽编辑器里替换首屏论点、卖点与案例，当天可预览。',
          },
          {
            title: '发布与解析',
            desc: '一键发布到平台子域，再绑自有域名，校验通过即生效。',
          },
          {
            title: '按月复盘',
            desc: '看收录量、引用来源与咨询转化，逐月增补问答小节。',
          },
        ],
      }),
      quotesSection(INDIGO, {
        eyebrow: '客户怎么说',
        title: '已经跑通的团队',
        items: [
          {
            quote:
              '以前写博客是给人看，现在才知道也要给模型看。改完结构第三周，就有三个咨询说是在 AI 里看到我们。',
            who: '陈女士',
            role: '企业服务商 市场负责人',
          },
          {
            quote:
              '最省事的不是建站，是发布这一步把 sitemap 和 llms.txt 都替我生成了。',
            who: '刘先生',
            role: '硬件品牌 电商经理',
          },
          {
            quote:
              '模板里的问答写法直接教会了我们怎么排内容，新人上手一天就能出一版页面。',
            who: '王女士',
            role: '连锁门店 品牌主管',
          },
        ],
      }),
      faqSection(INDIGO, {
        eyebrow: 'FAQ',
        title: '常见问题',
        sub: '这里的问题本身也是模板的一部分：写成问句，模型才摘录得到。',
        items: [
          {
            q: '独立站和平台店铺有什么区别？',
            a: '独立站的域名、内容与数据都归你所有，不受平台规则变动影响，也能长期沉淀属于自己的搜索资产。',
          },
          {
            q: '不会写代码能维护吗？',
            a: '可以。编辑器是拖拽式的，改文案直接双击文字，图片粘贴链接或从数字资产里选，改完点保存即可。',
          },
          {
            q: '能绑定自己的域名吗？',
            a: '能。在站点设置里填域名，按提示加一条 TXT 与一条 CNAME 记录，校验通过即刻生效；未校验前先用平台子域访问。',
          },
          {
            q: '多久能看到收录变化？',
            a: '结构改造后一般两周内的收录条数就有变化，引用与转化按月复盘；内容是持续增补的，不是一次性交付。',
          },
          {
            q: '欠费或到期后内容会被删掉吗？',
            a: '不会。停止付费只冻结站点访问，内容与域名记录原样保留，补齐后立刻恢复，不做自动删除。',
          },
        ],
      }),
      ctaBand(INDIGO, {
        title: '现在开始，把品牌内容交给 AI 检索',
        desc: '留下行业与目标，我们在一个工作日内给出一版内容与结构建议，含首屏论点与问答清单。',
        primary: '获取内容建议',
        secondary: '先看模板效果',
      }),
      contactSection(INDIGO, {
        eyebrow: '联系我们',
        title: '把需求说清楚，方案给得更快',
        sub: '工作日内两小时首次响应；急件请说明截止时间，可安排加急。',
        items: [
          {
            label: '咨询邮箱',
            value: 'hello@example.com',
            hint: '附需求清单与现有站点地址',
          },
          {
            label: '咨询电话',
            value: '400-000-0000',
            hint: '工作日 9:30-18:30',
          },
          {
            label: '首次方案',
            value: '1 个工作日内',
            hint: '含首屏论点与问答清单',
          },
        ],
      }),
    ],
  }),
  makeTemplate({
    key: 'product',
    name: '产品营销页',
    desc: '结论式首屏 + 功能矩阵 + 价格方案 + 购买问答，适合单品 / SaaS',
    tag: '产品 · SaaS',
    sch: EMERALD,
    seo: {
      title: '一款让团队效率翻倍的产品',
      description:
        '产品独立站模板：结论式首屏、功能矩阵、价格方案与购买问答，自动输出商品结构化数据，适配搜索引擎与生成式引擎抽取。',
      keywords: ['产品页', 'SaaS 官网', '价格方案'],
      jsonld: { organization: true, website: true, product: true, faq: true },
    },
    sections: [
      heroSplit(EMERALD, {
        eyebrow: '当天可用 · 按人按模块计费',
        title: '一款让团队效率翻倍的产品',
        sub: '先说结论：它把分散在四五个工具里的流程收在一处，上线不改造现有系统，当天就能跑起来。',
        bullets: [
          '模板先行，选好场景即得完整流程',
          '开放接口与回调，接入不改造',
          '用量、费用、效果同屏，账单按天可追溯',
        ],
        imageAlt: '产品界面主视觉',
        buttons: [
          { label: '免费开始', href: '#contact' },
          { label: '看价格', href: '#content', tone: 'hero' },
        ],
      }),
      cardsSection(EMERALD, {
        eyebrow: '核心能力',
        title: '三个模块，替代你现在的四五个工具',
        sub: '每个模块都能单独用，组合起来是一条完整链路，不做数据孤岛。',
        items: [
          {
            badge: '01',
            title: '内容生产',
            desc: '从选题、撰写到审校排期一条流水线走完，历史版本可回溯。',
          },
          {
            badge: '02',
            title: '发布分发',
            desc: '一次编辑多渠道投递，失败自动重试并给出可读原因。',
          },
          {
            badge: '03',
            title: '效果监测',
            desc: '收录、访问、咨询按天归集，指标能下钻到具体内容。',
          },
        ],
      }),
      featureSection(EMERALD, {
        eyebrow: '接入成本',
        title: '不改造现有系统也能用',
        desc: '提供标准接口、回调与批量导入模板；有中台的同学半天接完，没有的用内置表单也能先跑起来。',
        points: [
          '标准接口 + 沙箱环境先验证',
          '字段映射可视化配置',
          '权限按企业隔离',
        ],
        button: { label: '要一份接入文档' },
        imageAlt: '集成链路示意',
        bg: EMERALD.band,
      }),
      featureSection(EMERALD, {
        eyebrow: '看得清',
        title: '用量与费用同屏，账单按天可追溯',
        desc: '每一次能力调用都记账，月底不再对不上数；免费额、超出部分与预扣一目了然。',
        points: ['按天出账，随时导出明细', '余额不足提前预警'],
        button: { label: '看计费说明', tone: 'outline' },
        imageAlt: '费用看板示意',
        reverse: true,
      }),
      stepsSection(EMERALD, {
        eyebrow: '上手三步',
        title: '从注册到第一条内容发布',
        items: [
          { title: '选场景', desc: '挑一个模板，系统按场景预置字段与流程。' },
          { title: '导数据', desc: '上传表格或走接口同步，字段自动对齐。' },
          { title: '发出去', desc: '点发布，同步生成站点地图与结构化数据。' },
        ],
      }),
      plansSection(EMERALD, {
        eyebrow: '价格',
        title: '按团队规模选档，不绑长约',
        sub: '所有档位功能同权，只差席位与用量；随时升降档，按剩余天数折算。',
        items: [
          {
            name: '体验版',
            price: '0',
            unit: '积分 / 月',
            desc: '个人验证想法，含建站免费额度',
            points: ['1 个站点', '3 个协作席位', '平台子域访问'],
            button: '免费开始',
          },
          {
            name: '团队版',
            price: '299',
            unit: '积分 / 月起',
            desc: '小团队日常运营，含自定义域名',
            points: [
              '10 个站点',
              '不限协作席位',
              '自定义域名与证书',
              '效果看板与明细导出',
            ],
            button: '升级团队版',
            featured: true,
          },
          {
            name: '企业版',
            price: '定制',
            desc: '多品牌矩阵与私有部署要求',
            points: ['站点数量可扩展', '专属模型通道', '审计与权限策略'],
            button: '联系我们',
          },
        ],
        note: '以上档位为模板示例，套用后请在站点设置里改成你自己的价格。',
      }),
      quotesSection(EMERALD, {
        eyebrow: '客户评价',
        title: '用起来的团队怎么说',
        items: [
          {
            quote: '原来五个工具的活现在一处做完，周会不用再对齐口径。',
            who: '张经理',
            role: '消费品牌 电商运营',
          },
          {
            quote: '账单按天可查，财务第一次没来找我核对用量。',
            who: '李女士',
            role: 'SaaS 公司 财务',
          },
          {
            quote: '接入用了半天，接口文档写得比我们自己还细。',
            who: '周工',
            role: '技术负责人',
          },
        ],
      }),
      faqSection(EMERALD, {
        eyebrow: '购买前常问',
        title: 'FAQ',
        items: [
          {
            q: '支持试用吗？',
            a: '支持。站内建站在免费额度内不扣积分，超出部分按月计费，试用不需要绑卡。',
          },
          {
            q: '数据归谁？',
            a: '数据、域名与内容都归你，随时可导出；停止付费只冻结站点，不删除任何内容。',
          },
          {
            q: '能几个人一起编辑？',
            a: '同一企业下的账号共享站点，按企业隔离，跨企业不可见；席位不够可随时加。',
          },
          {
            q: '能对接我们现有的系统吗？',
            a: '可以，提供接口与回调，另有批量导入模板；复杂场景可申请沙箱先验证。',
          },
        ],
      }),
      ctaBand(EMERALD, {
        title: '今天就把产品页发出去',
        desc: '挑一个模板，改三处文案，点发布——从注册到线上通常不超过半小时。',
        primary: '免费开始',
        secondary: '预约演示',
      }),
      contactSection(EMERALD, {
        eyebrow: '联系我们',
        title: '需要一份贴合你业务的方案？',
        items: [
          {
            label: '销售咨询',
            value: 'sales@example.com',
            hint: '含价格与合同条款',
          },
          {
            label: '技术支持',
            value: 'support@example.com',
            hint: '接入问题优先响应',
          },
          {
            label: '演示预约',
            value: '30 分钟线上演示',
            hint: '按你的场景走一遍流程',
          },
        ],
        button: '预约演示',
      }),
    ],
  }),
  makeTemplate({
    key: 'service',
    name: '服务介绍页',
    desc: '服务范围 + 交付流程 + 案例图集 + 报价问答，适合服务商 / 代理商',
    tag: '服务行业',
    sch: VIOLET,
    seo: {
      title: '把专业服务做成可被搜索到的答案',
      description:
        '服务介绍独立站：服务范围、交付流程、案例图集与报价问答，便于搜索引擎与生成式引擎直接摘录结论。',
      keywords: ['服务介绍', '代理商建站', 'GEO'],
      jsonld: { organization: true, website: true, product: false, faq: true },
    },
    sections: [
      heroCenter(VIOLET, {
        eyebrow: '服务介绍 · 流程透明',
        title: '把专业服务做成可被搜索到的答案',
        sub: '服务范围、流程、案例与报价方式一次讲清，客户与 AI 都能在三十秒内得到结论。',
        stats: [
          { value: '2 小时', label: '工作日首次响应' },
          { value: '46 个', label: '已服务行业' },
          { value: '4 步', label: '标准化交付' },
        ],
      }),
      cardsSection(VIOLET, {
        eyebrow: '服务范围',
        title: '能接什么、不能接什么，先说清楚',
        items: [
          {
            badge: '01',
            title: '站点搭建与改版',
            desc: '从结构到视觉重做一套可被收录的官网，含域名与解析配置。',
          },
          {
            badge: '02',
            title: '内容体系咨询',
            desc: '梳理客户常问问题，产出问答清单与统一写作口径。',
          },
          {
            badge: '03',
            title: '长期代运营',
            desc: '按月增补内容、盯收录与转化，出可复盘的报告。',
          },
        ],
      }),
      stepsSection(VIOLET, {
        eyebrow: '服务流程',
        title: '四步交付，每步的输入输出都写明',
        sub: '需求梳理 → 方案设计 → 执行交付 → 复盘迭代，每阶段都有交付物清单与验收标准。',
        items: [
          {
            title: '需求梳理',
            desc: '输入：行业、目标客户、现有站点。输出：问题清单与结构方案。',
          },
          {
            title: '方案设计',
            desc: '输入：确认后的结构。输出：首页与核心小节文案初稿。',
          },
          {
            title: '执行交付',
            desc: '输入：初稿反馈。输出：可访问站点，含解析与发布。',
          },
          {
            title: '复盘迭代',
            desc: '输入：一个月数据。输出：收录与转化报告与下月计划。',
          },
        ],
      }),
      featureSection(VIOLET, {
        eyebrow: '验收口径',
        title: '交付物清单可核验，不靠感觉验收',
        desc: '每个阶段结束都给一份清单：哪些页面、哪些结构化数据、哪些指标已达标，逐项打勾后再进入下一阶段。',
        points: ['页面与结构化数据可在线核验', '未达标项不进入下一阶段计费'],
        button: { label: '要一份清单模板' },
        imageAlt: '交付物清单示意',
        bg: VIOLET.band,
      }),
      gallerySection(VIOLET, {
        eyebrow: '案例',
        title: '按行业整理的案例页',
        sub: '每个案例都带可核验的结果数据与统计周期，不写「大幅提升」这类没法验证的话。',
        items: [
          {
            alt: '律所官网改版案例',
            caption: '法律服务：改造后 6 周，品牌词外咨询增长 38%。',
          },
          {
            alt: '制造企业官网案例',
            caption: '工业制造：产品页结构化后，收录条数从 42 增至 210。',
          },
          {
            alt: '连锁门店官网案例',
            caption: '本地生活：绑定自有域名后，地图与问答来源同时起量。',
          },
        ],
      }),
      plansSection(VIOLET, {
        eyebrow: '报价方式',
        title: '按项目一次性报价，也可按月结算',
        items: [
          {
            name: '单页建站',
            price: '2800',
            unit: '元起',
            desc: '一个落地页 + 绑定域名',
            points: ['1 套模板改造', '首屏与问答文案', '发布与解析配置'],
            button: '咨询这个',
          },
          {
            name: '整站改版',
            price: '9800',
            unit: '元起',
            desc: '结构重做 + 内容体系',
            points: [
              '问题清单与口径',
              '核心 8-15 个页面',
              '结构化数据全量输出',
              '一个月数据跟踪',
            ],
            button: '获取报价',
            featured: true,
          },
          {
            name: '长期代运营',
            price: '按月',
            desc: '持续增补内容与复盘',
            points: ['每月 4 篇深度内容', '月度收录与转化报告'],
            button: '联系洽谈',
          },
        ],
        note: '示例价格，套用后请改成你自己的报价口径与交付范围。',
      }),
      faqSection(VIOLET, {
        eyebrow: '服务问答',
        title: '常见问题',
        items: [
          {
            q: '怎么收费？',
            a: '按项目范围一次性报价，长期合作可按月结算；明细都写在合同里，中途不加价。',
          },
          {
            q: '多久能看到效果？',
            a: '内容与结构改造后两周内可见收录变化，转化指标按月复盘。效果依赖行业竞争度，我们不用不可验证的话作承诺。',
          },
          {
            q: '不做内容能只做建站吗？',
            a: '可以，建站与内容服务能分开采购；只做建站时我们会给一份问答清单，你内部填也能用。',
          },
          {
            q: '交付后站点归谁？',
            a: '域名、内容与数据全部归你，账号与解析都在你自己手里，我们只保留协作权限直到验收。',
          },
        ],
      }),
      ctaBand(VIOLET, {
        title: '聊聊你的需求',
        desc: '说明行业与目标，我们给一版可执行的方案，含结构建议与交付周期。',
        primary: '预约沟通',
        secondary: '看案例',
      }),
      contactSection(VIOLET, {
        eyebrow: '联系方式',
        title: '两个渠道，哪个方便用哪个',
        items: [
          {
            label: '商务对接',
            value: 'bd@example.com',
            hint: '附行业与目标，回复更快',
          },
          { label: '电话', value: '400-000-0000', hint: '工作日 9:00-19:00' },
          { label: '首次响应', value: '2 小时内', hint: '急件请说明截止时间' },
        ],
        button: '发送需求',
      }),
    ],
  }),
  makeTemplate({
    key: 'brand-minimal',
    name: '极简品牌页',
    desc: '大量留白 + 单色强调 + 克制的排版，适合设计咨询与工作室',
    tag: '极简风格',
    sch: MINIMAL,
    seo: {
      title: '少说，说准',
      description:
        '极简风格品牌独立站：大量留白、单一强调色、结论前置的内容结构，适合设计咨询与个人工作室。',
      keywords: ['极简官网', '设计工作室', '品牌介绍'],
      jsonld: { organization: true, website: true, product: false, faq: true },
    },
    sections: [
      heroCenter(MINIMAL, {
        eyebrow: 'DESIGN STUDIO',
        title: '少说，说准',
        sub: '我们只做一件事：把你想表达的东西，压到对方三秒内能读懂。',
        buttons: [
          { label: '看作品', href: '#content' },
          { label: '联系我们', href: '#contact', tone: 'outline' },
        ],
      }),
      cardsSection(MINIMAL, {
        title: '三件我们坚持的事',
        sub: '没有多余的装饰，也没有需要解释的排版。',
        items: [
          {
            title: '结论前置',
            desc: '先给答案，再给理由。读者没有耐心，模型也没有。',
          },
          { title: '去掉装饰', desc: '不能帮助理解的元素，一律不留在页面上。' },
          {
            title: '可被验证',
            desc: '写进页面的每个数字，都要说清统计口径与周期。',
          },
        ],
      }),
      featureSection(MINIMAL, {
        title: '从一份简报开始，而不是从一次会议开始',
        desc: '你把要解决的问题写清楚，我们回一版结构与首屏文案。看得见东西之后，再谈怎么合作。',
        points: ['一页纸简报', '一版初稿', '一次定稿讨论'],
        button: { label: '要简报模板', tone: 'outline' },
        imageAlt: '工作现场',
        bg: MINIMAL.band,
      }),
      featureSection(MINIMAL, {
        title: '交付只给必要的东西',
        desc: '一套站点、一份内容口径、一张后续维护清单。不做用不上的附加物。',
        button: { label: '看交付清单', tone: 'outline' },
        imageAlt: '交付物',
        reverse: true,
      }),
      faqSection(MINIMAL, {
        title: '常见问题',
        items: [
          {
            q: '合作怎么开始？',
            a: '先发一页简报，说明行业、目标客户与要解决的问题；我们回一版结构建议，双方认可后再签。',
          },
          {
            q: '周期多长？',
            a: '单页两周，整站四到六周，取决于内容确认速度，不按加班算钱。',
          },
          {
            q: '后续维护谁做？',
            a: '站点在你自己账号里，日常改文案你自己就能做；需要长期迭代可另签月度服务。',
          },
        ],
      }),
      ctaBand(MINIMAL, {
        title: '把你的想法压成一句话',
        desc: '如果你还说不清要说什么，那正好是我们的起点。',
        primary: '开始沟通',
      }),
      contactSection(MINIMAL, {
        title: '联系',
        items: [
          { label: 'EMAIL', value: 'hi@example.com' },
          { label: 'WECHAT', value: 'your-id' },
          { label: 'CITY', value: '上海 · 可远程' },
        ],
        button: '写封邮件',
      }),
    ],
  }),
  makeTemplate({
    key: 'tech-dark',
    name: '科技深色页',
    desc: '深色渐变首屏 + 数据条 + 六宫格能力 + 技术问答，适合 AI / 开发者工具',
    tag: '科技深色',
    sch: CARBON,
    seo: {
      title: '为高并发场景准备的推理网关',
      description:
        '深色科技风产品站点：架构说明、能力矩阵、接入流程与性能问答，适合 AI 基础设施与开发者工具。',
      keywords: ['推理网关', '开发者工具', '接口'],
      jsonld: { organization: true, website: true, product: true, faq: true },
    },
    sections: [
      heroCenter(CARBON, {
        eyebrow: 'v3.2 已发布 · 支持流式输出',
        title: '为高并发场景准备的推理网关',
        sub: '一个入口接多家模型，路由、限流、缓存与计费收在一层解决；十行代码接入，不改业务逻辑。',
        stats: [
          { value: '38 ms', label: '网关自身 P99 开销' },
          { value: '99.95%', label: '过去 90 天可用性' },
          { value: '12 家', label: '已接入模型渠道' },
        ],
        buttons: [
          { label: '查看文档', href: '#content' },
          { label: '联系方案', href: '#contact', tone: 'hero' },
        ],
      }),
      cardsSection(CARBON, {
        eyebrow: '能力矩阵',
        title: '六个你绕不开的问题，一次解决',
        sub: '指标来自内部压测环境（64 并发、1k token 输入），实际表现随渠道与提示长度变化。',
        items: [
          {
            badge: '01',
            title: '智能路由',
            desc: '按成本、延迟与可用性打分选路，故障渠道秒级摘除。',
          },
          {
            badge: '02',
            title: '统一计费',
            desc: '把各家 token 口径折算成统一额度，超支自动降级或熔断。',
          },
          {
            badge: '03',
            title: '语义缓存',
            desc: '相似问题命中缓存，重复场景平均省掉 41% 调用量。',
          },
          {
            badge: '04',
            title: '流式转发',
            desc: '完整支持增量输出，首字延迟与直连几乎无差。',
          },
          {
            badge: '05',
            title: '可观测',
            desc: '每次调用留全链路追踪，慢请求可按渠道下钻。',
          },
          {
            badge: '06',
            title: '私有部署',
            desc: '同一套程序支持内网离线部署，密钥留在你自己的环境。',
          },
        ],
      }),
      featureSection(CARBON, {
        eyebrow: '接入方式',
        title: '十行代码，替换一个服务地址',
        desc: '保持主流兼容协议，SDK 里只改域名与密钥；灰度期间可按比例回切原渠道，出问题不用回滚代码。',
        points: [
          '主流兼容协议，无需改调用',
          '多语言 SDK 与示例',
          '按渠道灰度切流',
        ],
        button: { label: '看接入示例' },
        imageAlt: '调用链路示意',
        bg: CARBON.band,
      }),
      stepsSection(CARBON, {
        eyebrow: '上线四步',
        title: '从注册到全量切流',
        items: [
          { title: '建密钥', desc: '创建项目与只读密钥，先在沙箱跑通。' },
          { title: '配路由', desc: '选定主备渠道与预算上限。' },
          { title: '灰度', desc: '按 5% 到 30% 到 100% 切流，随时可回退。' },
          { title: '看账单', desc: '按天核对用量与命中率，调整缓存策略。' },
        ],
      }),
      gallerySection(CARBON, {
        eyebrow: '落地场景',
        title: '已经在跑的三类系统',
        items: [
          {
            alt: '客服问答系统',
            caption: '智能客服：语义缓存命中 46%，月调用成本下降三成。',
          },
          {
            alt: '代码助手',
            caption: '研发提效：流式转发保持首字延迟低于 600 ms。',
          },
          {
            alt: '内容生产流水线',
            caption: '内容工厂：按预算自动降级模型，产出量翻倍。',
          },
        ],
      }),
      plansSection(CARBON, {
        eyebrow: '档位',
        title: '按调用量选档，支持私有部署',
        items: [
          {
            name: '开发者',
            price: '0',
            unit: '元 / 月',
            desc: '个人项目与验证',
            points: ['每月 100 万次请求内免费', '社区支持'],
            button: '开始使用',
          },
          {
            name: '生产',
            price: '按量',
            desc: '线上业务，含服务保障',
            points: ['全渠道与路由策略', '99.9% 可用性承诺', '工单 4 小时响应'],
            button: '联系我们',
            featured: true,
          },
          {
            name: '专有云',
            price: '定制',
            desc: '内网离线部署',
            points: ['源码审计可选', '专属技术支持'],
            button: '洽谈',
          },
        ],
      }),
      faqSection(CARBON, {
        eyebrow: '技术问答',
        title: 'FAQ',
        items: [
          {
            q: '会不会成为新的单点故障？',
            a: '网关无状态、多可用区部署，渠道级熔断后自动摘除并切备用。即使网关不可用，把地址改回原渠道业务就不中断。',
          },
          {
            q: '请求内容会被留存吗？',
            a: '默认只记录元数据（长度、耗时、状态码），不落盘提示词与响应；排障可临时开启，保留期最长 7 天。',
          },
          {
            q: '支持哪些模型渠道？',
            a: '已接 12 家公开渠道与任意主流兼容端点，私有模型可通过自建兼容网关接入。',
          },
          {
            q: '限流怎么算？',
            a: '按项目维度同时限制每分钟请求数与 token 数，超阈值返回标准错误并带建议重试时间，客户端可直接沿用。',
          },
        ],
      }),
      ctaBand(CARBON, {
        title: '把模型调用收在一层里管起来',
        desc: '注册即可拿到测试密钥，沙箱环境与生产同构，跑通再切流。',
        primary: '获取测试密钥',
        secondary: '阅读文档',
      }),
      contactSection(CARBON, {
        eyebrow: '架构师支持',
        title: '需要评估你的场景？',
        items: [
          {
            label: '技术支持',
            value: 'dev@example.com',
            hint: '附调用量与渠道清单',
          },
          { label: '企业方案', value: 'enterprise@example.com' },
          {
            label: '服务状态',
            value: 'status.example.com',
            hint: '可用性可自查',
          },
        ],
        button: '预约架构评审',
      }),
    ],
  }),
  makeTemplate({
    key: 'shop-single',
    name: '单品电商页',
    desc: '主视觉首屏 + 卖点 + 细节图集 + 规格套餐 + 售后问答',
    tag: '电商单品',
    sch: CORAL,
    seo: {
      title: '一床被子，把南方冬天的湿冷解决掉',
      description:
        '单品电商落地页：主视觉、材质卖点、细节图集、规格套餐与售后问答，含商品结构化数据，便于搜索与生成式引擎直接摘录参数。',
      keywords: ['单品落地页', '电商详情', '商品参数'],
      jsonld: { organization: true, website: true, product: true, faq: true },
    },
    sections: [
      heroSplit(CORAL, {
        eyebrow: '现货 48 小时内发出',
        title: '一床被子，把南方冬天的湿冷解决掉',
        sub: '结论先说：填充克重 320g、面料经防螨处理、机洗不变形，适合 5-15 度的湿冷环境，不是给北方暖气房用的。',
        bullets: [
          '320g 填充，实测 8 度室内不必额外加毯',
          '整床可机洗，40 度水温不结团',
          '7 天无理由，退货运费我们承担',
        ],
        imageAlt: '商品主图',
        buttons: [
          { label: '立即选购', href: '#content' },
          { label: '看参数', href: '#contact', tone: 'hero' },
        ],
      }),
      cardsSection(CORAL, {
        eyebrow: '为什么是这床',
        title: '三个能被验证的差别',
        items: [
          {
            badge: '01',
            title: '填充不结团',
            desc: '七区绗缝固定，实验室机洗 20 次后蓬松度保留 92%。',
          },
          {
            badge: '02',
            title: '面料透气',
            desc: '40 支长绒棉内胆，湿度透过率比常规涤棉高 35%。',
          },
          {
            badge: '03',
            title: '尺码不缩水',
            desc: '预缩水处理，洗后尺寸偏差控制在 1.5% 以内。',
          },
        ],
      }),
      featureSection(CORAL, {
        eyebrow: '材质说明',
        title: '把成分写清楚，不写「高级面料」',
        desc: '面料 100% 长绒棉（40 支）、填充 100% 聚酯纤维（仿丝棉 320g）、缝线双针加固。第三方检测报告随包裹附赠。',
        points: ['成分逐项标注，不写模糊词', '检测报告可扫码核验'],
        button: { label: '问客服要报告' },
        imageAlt: '面料细节',
        bg: CORAL.band,
      }),
      gallerySection(CORAL, {
        eyebrow: '细节',
        title: '看得到做工，再决定买不买',
        items: [
          { alt: '绗缝细节', caption: '七区绗缝，针距 3.2cm，不跑棉。' },
          { alt: '包边细节', caption: '双层包边加隐蔽拉链，内胆可拆洗。' },
          { alt: '水洗标', caption: '成分与洗涤方式印在水洗标上，有据可查。' },
          { alt: '包装', caption: '真空压缩袋加手提外箱，自用送礼都合适。' },
        ],
      }),
      stepsSection(CORAL, {
        eyebrow: '下单流程',
        title: '四步收到货',
        items: [
          {
            title: '选规格',
            desc: '1.5m / 1.8m / 2.0m，被套可选单件或四件套。',
          },
          { title: '下单', desc: '支持货到付款与分期，大促期间锁价。' },
          { title: '48 小时发出', desc: '现货仓直发，物流单号短信同步。' },
          { title: '7 天无理由', desc: '不满意直接退，运费险已含在价格里。' },
        ],
      }),
      plansSection(CORAL, {
        eyebrow: '规格与价格',
        title: '选一个适合你床的尺寸',
        items: [
          {
            name: '1.5m 单件',
            price: '399',
            unit: '元',
            desc: '单人床 / 宿舍',
            points: ['被芯 200x230cm', '含收纳袋'],
            button: '加入购物车',
          },
          {
            name: '1.8m 四件套',
            price: '699',
            unit: '元',
            desc: '大多数家庭的选择',
            points: [
              '被芯 220x240cm',
              '被套加枕套两只',
              '含运费险',
              '7 天无理由',
            ],
            button: '加入购物车',
            featured: true,
          },
          {
            name: '2.0m 加大',
            price: '799',
            unit: '元',
            desc: '双人怕冷 / 大床',
            points: ['被芯 240x260cm', '填充加至 360g'],
            button: '加入购物车',
          },
        ],
        note: '示例价格，套用后请改成你自己的规格与售价。',
      }),
      quotesSection(CORAL, {
        eyebrow: '买家说',
        title: '三条来自评价区的原话',
        items: [
          {
            quote: '南方的魔法攻击刚好扛得住，不用半夜被冻醒。',
            who: '王同学',
            role: '1.8m 四件套',
          },
          {
            quote: '机洗两次没结团，比之前那床便宜货强多了。',
            who: '李先生',
            role: '2.0m 加大',
          },
          {
            quote: '包装挺体面，送爸妈没犹豫就下单了。',
            who: '张女士',
            role: '1.5m 单件',
          },
        ],
      }),
      faqSection(CORAL, {
        eyebrow: '售后问答',
        title: '买之前你可能想问',
        items: [
          {
            q: '能机洗吗？会不会洗坏？',
            a: '整床可机洗，建议 40 度以下温和模式、不要漂白；洗后晾干拍打即可恢复蓬松，避免高温烘干。',
          },
          {
            q: '暖气房能用吗？',
            a: '不太建议。320g 填充对应 5-15 度环境，供暖室内会偏热，可选同系列的 240g 薄款。',
          },
          {
            q: '退换货运费谁出？',
            a: '价格已含运费险，7 天无理由退货由我们承担寄回费用，不影响二次销售即可。',
          },
          {
            q: '多久发货？',
            a: '现货 48 小时内发出，大促期间顺延至 72 小时，物流单号会短信同步。',
          },
        ],
      }),
      ctaBand(CORAL, {
        title: '今年冬天，先睡个好觉',
        desc: '48 小时内发出，7 天无理由；不合适直接退，不用解释理由。',
        primary: '立即选购',
        secondary: '咨询客服',
      }),
      contactSection(CORAL, {
        eyebrow: '客服与售后',
        title: '有问题直接找我们',
        items: [
          { label: '在线客服', value: '9:00-22:00', hint: '平均 3 分钟回复' },
          { label: '售后邮箱', value: 'service@example.com' },
          {
            label: '退换地址',
            value: '下单后随短信发送',
            hint: '含运费险，无需垫付',
          },
        ],
        button: '联系在线客服',
      }),
    ],
  }),
  makeTemplate({
    key: 'local-store',
    name: '本地门店页',
    desc: '门店首屏 + 服务项目 + 环境图集 + 价目 + 到店问答',
    tag: '本地门店',
    sch: AMBER,
    seo: {
      title: '家门口的第三空间',
      description:
        '本地门店独立站：服务项目、环境图集、价目表与到店问答，含地址与营业时间信息，便于本地搜索与生成式引擎推荐。',
      keywords: ['本地门店', '咖啡馆', '到店服务'],
      jsonld: { organization: true, website: true, product: false, faq: true },
    },
    sections: [
      heroCenter(AMBER, {
        eyebrow: '工作日 7:30 开门 · 周末 9:00',
        title: '家门口的第三空间',
        sub: '在同一个位置开了六年，豆子自己烘，座位够坐一天，不催客。附近的人需要一个待着舒服的地方，这就是我们开店的原因。',
        stats: [
          { value: '6 年', label: '同一地址经营' },
          { value: '32 座', label: '含 8 个带插座工位' },
          { value: '48h', label: '烘焙到出品间隔' },
        ],
      }),
      cardsSection(AMBER, {
        eyebrow: '服务项目',
        title: '来这儿能做什么',
        items: [
          {
            badge: '01',
            title: '手冲与意式',
            desc: '单品豆每季换四支，标准出品与浅焙可选，也都能带走豆子。',
          },
          {
            badge: '02',
            title: '轻食与甜点',
            desc: '每天现做，两点后折扣，闭店前售罄不补。',
          },
          {
            badge: '03',
            title: '场地与活动',
            desc: '晚上九点后可包场，最多 40 人，适合读书会与小型分享。',
          },
        ],
      }),
      featureSection(AMBER, {
        eyebrow: '自烘豆',
        title: '烘焙在本市，48 小时内到店',
        desc: '每周一、周四各烘一次，豆袋上印烘焙日期与养豆建议，不写模糊的「新鲜烘焙」。',
        points: ['烘焙日期印在豆袋上', '可指定浅中深焙度', '支持企业月度供豆'],
        button: { label: '订豆咨询' },
        imageAlt: '烘焙现场',
        bg: AMBER.band,
      }),
      gallerySection(AMBER, {
        eyebrow: '环境',
        title: '先看看再决定来不来',
        items: [
          { alt: '临窗座位', caption: '临窗四人桌，上午光线最好。' },
          { alt: '带插座工位', caption: '长桌八个工位，全部带插座与台灯。' },
          { alt: '吧台手冲区', caption: '吧台可看手冲全过程，能边做边聊。' },
          { alt: '夜间包场', caption: '九点后清场包场，投影与音响都能用。' },
        ],
      }),
      plansSection(AMBER, {
        eyebrow: '价目',
        title: '价格写在页面上，不用问',
        items: [
          {
            name: '经典款',
            price: '22',
            unit: '元起',
            desc: '拿铁 / 澳白 / 美式',
            points: ['中深烘拼配', '可换燕麦奶加 3 元'],
            button: '到店点单',
          },
          {
            name: '单品手冲',
            price: '38',
            unit: '元起',
            desc: '每季四支轮换',
            points: ['15g 粉 250ml 水', '可选浅焙或中焙', '含风味说明卡'],
            button: '到店点单',
            featured: true,
          },
          {
            name: '包场',
            price: '600',
            unit: '元 / 晚',
            desc: '21:00 后清场',
            points: ['最多 40 人', '含投影与音响', '可自带餐饮'],
            button: '洽谈档期',
          },
        ],
        note: '示例价目，套用后请替换成你自己的菜单与价格。',
      }),
      quotesSection(AMBER, {
        eyebrow: '常客说',
        title: '几条店里的真实反馈',
        items: [
          {
            quote: '带电脑坐一天没人催，插座够用，这是最重要的。',
            who: '陈先生',
            role: '附近办公的设计师',
          },
          {
            quote: '手冲会讲豆子的产地和烘焙日期，喝得明白。',
            who: '刘女士',
            role: '周末常客',
          },
          {
            quote: '包场办读书会，投影提前帮忙调好了。',
            who: '共读小组',
            role: '活动组织方',
          },
        ],
      }),
      faqSection(AMBER, {
        eyebrow: '到店问答',
        title: '来之前你可能想问',
        items: [
          {
            q: '有停车位吗？',
            a: '门口两个临时位，满了可停隔壁商场地下车库，凭消费小票免两小时。',
          },
          {
            q: '能带宠物吗？',
            a: '户外座可以，室内需装包或推车；导盲犬不受限制。',
          },
          {
            q: '可以办公待一整天吗？',
            a: '可以，不低消不赶客。周末下午人多，工位建议工作日来。',
          },
          {
            q: '怎么包场？',
            a: '提前三天说日期与人数，付一半定金锁档期；活动结束按实际结算，超时按小时加收。',
          },
        ],
      }),
      ctaBand(AMBER, {
        title: '路过就进来坐坐',
        desc: '不用预约，进门有位就坐。想留工位或包场，提前一天说一声。',
        primary: '导航到店',
        secondary: '看菜单',
      }),
      contactSection(AMBER, {
        eyebrow: '到店信息',
        title: '地址、时间与联系方式',
        items: [
          {
            label: '地址',
            value: '某市某区某路 128 号',
            hint: '地铁 B 出口步行 400m',
          },
          {
            label: '营业时间',
            value: '工作日 7:30-22:00',
            hint: '周末 9:00-22:00',
          },
          {
            label: '联系',
            value: 'store@example.com',
            hint: '包场与供豆都走这里',
          },
        ],
        button: '预约包场',
      }),
    ],
  }),
  makeTemplate({
    key: 'portfolio',
    name: '作品集页',
    desc: '衬线标题 + 自我介绍 + 项目图集 + 合作流程，适合个人与团队作品展示',
    tag: '作品集',
    sch: EDITORIAL,
    seo: {
      title: '把做过的事，讲成能被找到的答案',
      description:
        '作品集独立站：项目图集、方法说明、合作流程与档期问答，衬线标题的编辑风格版式，适合设计师、写作者与独立团队。',
      keywords: ['作品集', '设计师个人站', '案例展示'],
      jsonld: { organization: true, website: true, product: false, faq: true },
    },
    sections: [
      heroSplit(EDITORIAL, {
        eyebrow: '独立设计 · 2016 年至今',
        title: '把做过的事，讲成能被找到的答案',
        sub: '我是一名做品牌与信息设计的独立设计师，服务对象主要是专业服务机构与早期团队。',
        bullets: [
          '12 年品牌与信息设计经验',
          '完整交付：策略、视觉、落地文件',
          '同时最多接两个项目，不排长队',
        ],
        imageAlt: '个人形象照',
        buttons: [
          { label: '看项目', href: '#content' },
          { label: '聊聊需求', href: '#contact', tone: 'outline' },
        ],
      }),
      cardsSection(EDITORIAL, {
        eyebrow: '我能帮上的忙',
        title: '三类活，接得比较熟',
        items: [
          {
            title: '品牌视觉体系',
            desc: '标识、色彩、字体规范与应用物料，交付可编辑源文件。',
          },
          {
            title: '信息设计',
            desc: '把复杂流程、数据与制度画成看得懂的图表与页面。',
          },
          {
            title: '官网与内容结构',
            desc: '站点版式、页面层级与文案结构，一并考虑被检索到的事。',
          },
        ],
      }),
      gallerySection(EDITORIAL, {
        eyebrow: '选过的项目',
        title: '六个代表项目',
        sub: '每个项目都写了它当时要解决的问题，不只是放图。',
        items: [
          {
            alt: '律所品牌重塑',
            caption: '某商事律所：把 20 页介绍压成一页能读完的图谱。',
          },
          {
            alt: '医疗机构导视',
            caption: '某专科门诊：重新设计楼层导视与预约流程。',
          },
          {
            alt: '年度报告设计',
            caption: '某基金会：年度报告从 96 页精简到 32 页。',
          },
          {
            alt: '产品官网改版',
            caption: '某工具产品：重写首页层级后咨询转化明显提升。',
          },
          {
            alt: '课程手册',
            caption: '某培训机构：把课程表做成可自助比对的表格。',
          },
          { alt: '展览视觉', caption: '某行业展览：主视觉延展到十七种物料。' },
        ],
      }),
      featureSection(EDITORIAL, {
        eyebrow: '工作方式',
        title: '先解决问题，再谈好看',
        desc: '每个项目都从「这份东西要给谁看、看完要做什么」开始。判断标准是可读、可执行、可交付，风格服务于这三件事。',
        points: [
          '开工前写一页问题定义',
          '反馈集中在两个节点',
          '交付包含规范说明',
        ],
        imageAlt: '工作过程',
        bg: EDITORIAL.band,
      }),
      stepsSection(EDITORIAL, {
        eyebrow: '合作流程',
        title: '四步走完一个项目',
        items: [
          {
            title: '需求沟通',
            desc: '一次 45 分钟的通话，说清背景、目标与约束。',
          },
          {
            title: '报价与排期',
            desc: '三个工作日内给方案、周期与费用，确认后开工。',
          },
          {
            title: '两轮提案',
            desc: '方向提案加深化提案，其余时间用于细化与答疑。',
          },
          {
            title: '交付与规范',
            desc: '源文件、导出文件与使用规范一并交付，附一次答疑会。',
          },
        ],
      }),
      quotesSection(EDITORIAL, {
        eyebrow: '合作方评价',
        title: '客户怎么说',
        items: [
          {
            quote: '难得有设计师愿意先读我们的业务材料，再动手画。',
            who: '某律所',
            role: '管理合伙人',
          },
          {
            quote: '交付文件整理得很规矩，内部接手完全没障碍。',
            who: '某产品',
            role: '市场负责人',
          },
          {
            quote: '反馈节点集中，团队不用被零散消息打断。',
            who: '某基金会',
            role: '传播主管',
          },
        ],
      }),
      faqSection(EDITORIAL, {
        eyebrow: '常见问题',
        title: '关于费用、周期与协作',
        items: [
          {
            q: '怎么收费？',
            a: '按项目范围报价，不按小时计费。报价包含两轮提案、一次深化与全部源文件交付，超出范围另议。',
          },
          {
            q: '一般多久？',
            a: '品牌视觉四到六周，信息设计两到四周，官网结构与版式三到五周，具体看内容确认速度。',
          },
          {
            q: '能只做一部分吗？',
            a: '可以。只出方向、只做规范或只画图表都接，前提是把边界写清楚。',
          },
          {
            q: '有档期吗？',
            a: '同时最多两个项目，通常提前两到三周排队；急件可加急，费用增加三成。',
          },
        ],
      }),
      ctaBand(EDITORIAL, {
        title: '有想法？先聊二十分钟',
        desc: '不用准备完整的简报，说清现在卡在哪，我会判断这个活适不适合我。',
        primary: '预约沟通',
        secondary: '看项目',
      }),
      contactSection(EDITORIAL, {
        eyebrow: '联系方式',
        title: '找到我最快的方式',
        items: [
          {
            label: '邮箱',
            value: 'studio@example.com',
            hint: '附项目背景与期望时间',
          },
          { label: '作品集文件', value: '可来信索取', hint: '含完整案例说明' },
          { label: '响应时间', value: '1 个工作日内' },
        ],
        button: '发一封邮件',
      }),
    ],
  }),
  makeTemplate({
    key: 'content-column',
    name: '内容专栏页',
    desc: '窄栏长文排版：编者按 + 三篇导读 + 订阅引导，适合写作者与研究机构',
    tag: '内容专栏',
    sch: PAPER,
    seo: {
      title: '把复杂的事写短',
      description:
        '长文专栏独立站：窄栏排版、结论前置、每篇配要点清单，同时输出 llms.txt，便于搜索引擎与生成式引擎摘录观点。',
      keywords: ['内容专栏', '长文排版', '研究笔记'],
      jsonld: { organization: true, website: true, product: false, faq: true },
    },
    sections: [
      heroCenter(PAPER, {
        eyebrow: '每周三更新 · 已写 148 篇',
        title: '把复杂的事写短',
        sub: '一个只写「读完能直接用」的研究笔记。每篇不超过 1800 字，结论在第一段，来源附在末尾。',
        buttons: [
          { label: '订阅更新', href: '#contact' },
          { label: '先读三篇', href: '#content', tone: 'outline' },
        ],
      }),
      band(
        PAPER,
        '编者按',
        [
          text('h2', '这个专栏在解决什么问题', {
            margin: '0 0 18px',
            fontSize: '28px',
            lineHeight: '1.4',
            fontWeight: '700',
            color: PAPER.ink,
            ...headFontOf(PAPER),
          }),
          text(
            'p',
            '现在的信息不是太少，是太吵。很多文章读完记不住一句能用的话，因为它们把结论藏在第四屏。这个专栏反过来写：先给结论，再给论证，最后给来源。',
            {
              margin: '0 0 18px',
              fontSize: '17px',
              lineHeight: '2',
              color: PAPER.body,
            },
          ),
          text(
            'p',
            '同样的结构也是为了被机器读：每篇都按「问题—结论—证据」组织，站点同时输出纯文本索引，你可以直接把地址贴给模型，看它会怎么转述。',
            { margin: 0, fontSize: '17px', lineHeight: '2', color: PAPER.body },
          ),
        ],
        { bg: PAPER.page, pad: '64px 24px', maxW: '760px' },
      ),
      featureSection(PAPER, {
        eyebrow: '最新文章',
        title: '为什么对 AI 友好的写法更有效',
        desc: '模型的引用偏好和人的阅读耐心其实是同一件事：段落短、结论显、少用代词。我们把三篇对照实验整理成一份可执行的清单。',
        points: [
          '同一篇文章改版后，被引用次数从 0 到 7',
          '三条立刻能用的改写规则',
        ],
        button: { label: '读这一篇', tone: 'soft' },
        imageAlt: '文章配图',
        bg: PAPER.band,
      }),
      featureSection(PAPER, {
        eyebrow: '往期精选',
        title: '内容排期是伪命题吗',
        desc: '多数团队的周更并不是策略，只是没敢停下来。这篇讲我们如何改成「有货才发」，以及三个月后的数据变化。',
        points: ['产量下降 40%，咨询量上升 25%', '一套判断值不值得写的四问'],
        button: { label: '读这一篇', tone: 'soft' },
        imageAlt: '文章配图',
        reverse: true,
      }),
      featureSection(PAPER, {
        eyebrow: '方法笔记',
        title: '怎样给一段数据写说明',
        desc: '图表不会自己解释自己。这篇给一个模板：口径、周期、对比基准、异常点，四句话讲清一张图。',
        points: ['四句话模板，可直接抄', '三个常见误读案例'],
        button: { label: '读这一篇', tone: 'soft' },
        imageAlt: '文章配图',
        bg: PAPER.band,
      }),
      faqSection(PAPER, {
        eyebrow: '读者来信',
        title: '被问得最多的四个问题',
        items: [
          {
            q: '怎么订阅更新？',
            a: '留邮箱即可，每周三有更新才发，不发广告，随时一封邮件退订。',
          },
          {
            q: '可以转载吗？',
            a: '可以，注明作者与出处并保留原文链接即可；商用转载请先打个招呼。',
          },
          {
            q: '观点能引用吗？',
            a: '鼓励引用。引用时请注明出处与发布日期，我们会在站点里保留原始版本便于核对。',
          },
          {
            q: '接不接约稿？',
            a: '接研究类与内容方法类约稿，不接软文；报价在回信里说明。',
          },
        ],
      }),
      ctaBand(PAPER, {
        title: '每周三，一封不超过 900 字的信',
        desc: '只写我们真的想清楚的事。写完才发，写不出就不发。',
        primary: '订阅更新',
        secondary: '看往期',
      }),
      contactSection(PAPER, {
        eyebrow: '联系',
        title: '读者来信与约稿',
        items: [
          {
            label: '邮箱',
            value: 'notes@example.com',
            hint: '回信通常需要两个工作日',
          },
          { label: '约稿', value: '研究类 / 内容方法类' },
          { label: '转载', value: '注明来源即可' },
        ],
        button: '写信给我',
      }),
    ],
  }),
  {
    key: 'blank',
    name: '空白页',
    desc: '只有一个可编辑的正文容器，完全自己搭',
    tag: '从零开始',
    theme: 'light',
    accent: '#2563eb',
    heroBg: '#f8fafc',
    seo: { ...geoSiteSeoDefaults },
    elements: [
      el('__body', 'root', [
        container(
          [
            text('h1', '点这里修改标题', {
              margin: '0 0 14px',
              fontSize: '34px',
              lineHeight: '1.3',
              color: '#0f172a',
            }),
            text(
              'p',
              '从左侧元素面板拖入需要的模块，双击文字即可编辑；想省事可以回去换一套模板。',
              {
                margin: 0,
                fontSize: '16px',
                lineHeight: '1.9',
                color: '#64748b',
              },
            ),
          ],
          {
            width: '100%',
            maxWidth: '1120px',
            margin: '0 auto',
            padding: '96px 24px',
          },
          '首屏',
        ),
      ]),
    ],
  },
];

export function templateByKey(key: string): GeoSiteTemplate | undefined {
  return GEO_SITE_TEMPLATES.find((item) => item.key === key);
}

/** 新建站点但未指定模板时的缺省选择。 */
export const DEFAULT_TEMPLATE_KEY = 'geo-landing';

/** 取根节点下的顶层区块名，选择器用它展示「这套模板包含哪些部分」。 */
function sectionNames(elements: Record<string, unknown>[]): string[] {
  const root = elements.find((item) => item?.type === '__body');
  const children = Array.isArray(root?.content)
    ? (root.content as Record<string, unknown>[])
    : [];
  return children.map((item) => {
    const name = typeof item?.name === 'string' ? item.name : '';
    const type = typeof item?.type === 'string' ? item.type : '';
    return name || type || '区块';
  });
}

function countNodes(list: unknown[]): number {
  let total = 0;
  const walk = (nodes: unknown[]) => {
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      total += 1;
      const content = (node as Record<string, unknown>).content;
      if (Array.isArray(content)) walk(content);
    }
  };
  walk(list);
  return total;
}

export function templateViews() {
  return GEO_SITE_TEMPLATES.map((item) => ({
    key: item.key,
    name: item.name,
    desc: item.desc,
    tag: item.tag,
    theme: item.theme,
    accent: item.accent,
    heroBg: item.heroBg,
    sections: sectionNames(item.elements).slice(0, 12),
    elements: countNodes(item.elements),
  }));
}
