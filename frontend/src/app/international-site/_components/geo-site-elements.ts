/**
 * GEO 建站器元素目录：与后端 geo-site.shared.ts 的类型白名单一一对应。
 * 新增类型必须同时改后端白名单，否则保存会被 assertElementTree 拒绝。
 */

export type GeoSiteNode = {
  id: string;
  name: string;
  type: string;
  category: string;
  styles: Record<string, string | number>;
  content: GeoSiteNode[] | Record<string, unknown>;
};

export const CONTAINER_TYPES = new Set([
  "__body",
  "container",
  "2Col",
  "3Col",
  "row",
]);

export const isContainer = (node: GeoSiteNode) => CONTAINER_TYPES.has(node.type);

let seq = 0;
/** 元素 id 只要在全站树里唯一（后端限 64 字符），渲染不依赖它的形态。 */
export function newId(): string {
  seq += 1;
  return `n${Date.now().toString(36)}${seq.toString(36)}`;
}

function column(name: string, styles: Record<string, string | number>): GeoSiteNode {
  return { id: newId(), name, type: "container", category: "container", styles, content: [] };
}

export type PaletteItem = {
  type: string;
  label: string;
  group: string;
  hint: string;
  create: () => GeoSiteNode;
};

const textItem = (
  type: string,
  label: string,
  innerText: string,
  styles: Record<string, string | number> = {},
  hint = "",
): PaletteItem => ({
  type,
  label,
  group: "文本",
  hint,
  create: () => ({
    id: newId(),
    name: label,
    type,
    category: "text",
    styles,
    content: { innerText },
  }),
});

const basicItem = (
  type: string,
  label: string,
  group: string,
  content: Record<string, unknown>,
  styles: Record<string, string | number> = {},
  hint = "",
): PaletteItem => ({
  type,
  label,
  group,
  hint,
  create: () => ({
    id: newId(),
    name: label,
    type,
    category: "basic",
    styles,
    content: { ...content },
  }),
});

const layoutItem = (
  type: string,
  label: string,
  build: () => GeoSiteNode[],
  styles: Record<string, string | number> = {},
  hint = "",
): PaletteItem => ({
  type,
  label,
  group: "布局",
  hint,
  create: () => ({
    id: newId(),
    name: label,
    type,
    category: "container",
    styles,
    content: build(),
  }),
});

/**
 * 站点模块（动态区块）：元素本身不存内容，发布时由渲染层按菜单树 / 内容库取数。
 * 默认样式与后端 CMS_CSS 同值，编辑器与发布页才不会各画一套；
 * 用户改这些样式就走普通样式面板，所以菜单是可以设计的，不是只能自动补位。
 */
const dynamicItem = (
  type: string,
  label: string,
  hint: string,
  styles: Record<string, string | number> = {},
): PaletteItem => ({
  type,
  label,
  group: "站点模块",
  hint,
  create: () => ({
    id: newId(),
    name: label,
    type,
    category: "basic",
    styles,
    content: {},
  }),
});

const CARD_GRID = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))",
  gap: 20,
  padding: "24px",
};

const CARD_COLUMN = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  padding: "24px",
};

export const PALETTE: PaletteItem[] = [
  layoutItem("container", "区块", () => [], { width: "100%", padding: "32px 24px" }, "承载内容的通用区块"),
  layoutItem(
    "2Col",
    "两列",
    () => [column("左列", { flex: "1 1 300px" }), column("右列", { flex: "1 1 300px" })],
    { display: "flex", gap: 24, flexWrap: "wrap", alignItems: "stretch" },
    "并排两栏，适合图文对照",
  ),
  layoutItem(
    "3Col",
    "三列",
    () => [
      column("第 1 列", { flex: "1 1 220px", padding: "20px", background: "#f8fafc", borderRadius: 12 }),
      column("第 2 列", { flex: "1 1 220px", padding: "20px", background: "#f8fafc", borderRadius: 12 }),
      column("第 3 列", { flex: "1 1 220px", padding: "20px", background: "#f8fafc", borderRadius: 12 }),
    ],
    { display: "flex", gap: 18, flexWrap: "wrap", alignItems: "stretch" },
    "卖点卡片区",
  ),
  layoutItem("row", "横向排列", () => [], {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "center",
  }),
  basicItem("spacer", "空白间距", "布局", {}, { height: 48 }, "调节留白节奏"),
  basicItem("divider", "分隔线", "布局", {}, { border: "none", borderTop: "1px solid #e2e8f0", margin: "24px 0" }),
  dynamicItem(
    "languageSwitcher",
    "语言切换",
    "按站点启用的语言生成切换入口，缺译的语言不出现在列表中；通常放在导航条右侧",
    {
      display: "flex",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap",
      fontSize: 14,
      color: "#334155",
    },
  ),
  dynamicItem(
    "navBar",
    "导航菜单",
    "取「菜单」里位置为顶部导航的菜单项，可拖到任意区块并改配色、间距、背景",
    {
      display: "flex",
      alignItems: "center",
      gap: 20,
      flexWrap: "wrap",
      padding: "16px 24px",
      background: "#ffffff",
      borderBottom: "1px solid #e2e8f0",
    },
  ),
  dynamicItem(
    "footerNav",
    "页脚导航",
    "取「菜单」里位置为页脚导航的菜单项，通常放在页面最后一个区块",
    {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap",
      padding: "20px 24px",
      color: "#64748b",
      fontSize: 14,
    },
  ),
  dynamicItem("postList", "文章列表", "纵向排列内容卡片（取当前页内容类型的已发布内容）", CARD_COLUMN),
  dynamicItem("postGrid", "文章网格", "网格排列内容卡片（取当前页内容类型的已发布内容）", CARD_GRID),
  dynamicItem("productList", "产品列表", "纵向排列产品卡片（在产品类型页面上使用）", CARD_COLUMN),
  dynamicItem("productGrid", "产品网格", "网格排列产品卡片（在产品类型页面上使用）", CARD_GRID),
  dynamicItem("articleBody", "文章正文", "详情页正文位：发布后填入当前文章正文", {
    padding: "24px",
    lineHeight: 1.9,
  }),
  dynamicItem("articleMeta", "文章信息", "发布时间、作者、标签", {
    padding: "0 24px 12px",
    color: "#94a3b8",
    fontSize: 13,
  }),
  dynamicItem("productInfo", "产品信息", "价格、单位、规格表与购买链接", {
    padding: "16px 24px",
  }),
  dynamicItem("relatedPosts", "相关推荐", "同分类的其它已发布内容", { padding: "8px 24px 24px" }),
  textItem("h1", "一级标题", "在这里写主论点", {
    fontSize: 40,
    lineHeight: 1.25,
    color: "#0f172a",
    margin: "0 0 16px",
  }, "每页只放一个，AI 摘录首选"),
  textItem("h2", "二级标题", "小节标题", {
    fontSize: 28,
    lineHeight: 1.3,
    color: "#0f172a",
    margin: "0 0 12px",
  }),
  textItem("h3", "三级标题", "问答式小标题", {
    fontSize: 20,
    lineHeight: 1.4,
    color: "#0f172a",
    margin: "0 0 10px",
  }),
  textItem("h4", "四级标题", "小标题", { fontSize: 17, color: "#0f172a", margin: "0 0 8px" }),
  textItem("h5", "五级标题", "小标题", { fontSize: 15, color: "#0f172a", margin: "0 0 8px" }),
  textItem("h6", "六级标题", "小标题", { fontSize: 13, color: "#475569", margin: "0 0 6px" }),
  textItem("p", "正文", "在这里写正文，双击即可修改。", {
    fontSize: 15,
    lineHeight: 1.85,
    color: "#475569",
    margin: "0 0 12px",
  }),
  textItem("span", "行内文本", "行内文本", { color: "#2563eb" }),
  basicItem(
    "image",
    "图片",
    "媒体",
    { imageUrl: "", altText: "图片说明", destinationUrl: "" },
    { width: "100%", borderRadius: 12 },
    "粘贴图片链接或从数字资产选择",
  ),
  basicItem(
    "video",
    "视频",
    "媒体",
    { href: "", altText: "视频" },
    { width: "100%" },
    "支持 YouTube / B 站 / Vimeo 链接与 mp4 直链",
  ),
  basicItem(
    "button",
    "按钮",
    "交互",
    { innerText: "了解更多", href: "#contact" },
    {
      display: "inline-block",
      padding: "12px 28px",
      fontSize: 15,
      color: "#ffffff",
      background: "#2563eb",
      borderRadius: 999,
    },
    "行动号召，落地页转化位",
  ),
  basicItem("link", "文字链接", "交互", { innerText: "查看详情", href: "#" }, { color: "#2563eb" }),
  basicItem(
    "list",
    "要点列表",
    "交互",
    { innerText: "第一条要点\n第二条要点\n第三条要点" },
    { paddingLeft: 20, lineHeight: 1.9, color: "#475569" },
    "一行一条",
  ),
];

export const paletteByType = (type: string): PaletteItem | undefined =>
  PALETTE.find((item) => item.type === type);

export const PALETTE_GROUPS = ["布局", "站点模块", "文本", "媒体", "交互"];

/**
 * 动态区块的取数口径：必须与后端 render.service.ts 的 renderDynamic 一致，
 * 否则画布里的菜单/列表和发布出去的不是同一份东西。
 */
export type DynamicPreview =
  | { kind: "nav"; location: "HEADER" | "FOOTER" }
  | { kind: "cards"; contentKind: "article" | "product" }
  | { kind: "languages" }
  | { kind: "detail"; label: string; note: string };

export const DYNAMIC_PREVIEW: Record<string, DynamicPreview> = {
  navBar: { kind: "nav", location: "HEADER" },
  footerNav: { kind: "nav", location: "FOOTER" },
  languageSwitcher: { kind: "languages" },
  postList: { kind: "cards", contentKind: "article" },
  postGrid: { kind: "cards", contentKind: "article" },
  productList: { kind: "cards", contentKind: "product" },
  productGrid: { kind: "cards", contentKind: "product" },
  articleBody: { kind: "detail", label: "文章正文", note: "发布后自动填入当前文章的正文" },
  articleMeta: { kind: "detail", label: "文章信息", note: "发布后显示当前文章的发布时间、作者与标签" },
  productInfo: { kind: "detail", label: "产品信息", note: "发布后显示当前产品的价格、规格与购买链接" },
  relatedPosts: { kind: "detail", label: "相关推荐", note: "发布后显示同分类的其它已发布内容" },
};

export const isDynamicType = (type: string): boolean =>
  Object.prototype.hasOwnProperty.call(DYNAMIC_PREVIEW, type);

/** 元素类型中文名：图层面板与面包屑用。 */
export const TYPE_LABELS: Record<string, string> = PALETTE.reduce<
  Record<string, string>
>((acc, item) => {
  acc[item.type] = item.label;
  return acc;
}, { __body: "页面" });

/** 样式面板按分组展示常用属性，其余属性走「自定义属性」行内编辑。 */
export const STYLE_FIELDS: {
  group: string;
  items: { key: string; label: string }[];
}[] = [
  {
    group: "尺寸与间距",
    items: [
      { key: "width", label: "宽度" },
      { key: "maxWidth", label: "最大宽度" },
      { key: "padding", label: "内边距" },
      { key: "margin", label: "外边距" },
      { key: "gap", label: "子项间距" },
      { key: "height", label: "高度" },
    ],
  },
  {
    group: "文字",
    items: [
      { key: "fontSize", label: "字号" },
      { key: "lineHeight", label: "行高" },
      { key: "fontWeight", label: "字重" },
      { key: "color", label: "文字颜色" },
      { key: "textAlign", label: "对齐" },
    ],
  },
  {
    group: "背景与边框",
    items: [
      { key: "background", label: "背景" },
      { key: "border", label: "边框" },
      { key: "borderRadius", label: "圆角" },
      { key: "boxShadow", label: "阴影" },
    ],
  },
  {
    group: "弹性布局",
    items: [
      { key: "display", label: "display" },
      { key: "flex", label: "flex" },
      { key: "flexWrap", label: "flex-wrap" },
      { key: "alignItems", label: "align-items" },
      { key: "justifyContent", label: "justify-content" },
    ],
  },
];
