import {
  AppstoreOutlined,
  BarsOutlined,
  ColumnHeightOutlined,
  EditOutlined,
  FileTextOutlined,
  GiftOutlined,
  HomeOutlined,
  MenuOutlined,
  NotificationOutlined,
  PartitionOutlined,
  PictureOutlined,
  ProfileOutlined,
  SearchOutlined,
  ShopOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import {
  BRAND_DEFAULT_DIY_STYLES,
  BRAND_DIY_PAGE_TYPES,
  BRAND_LINK_TYPES,
  type BrandDiyComponent,
  type BrandDiyLink,
  type BrandDiyPage,
  type BrandDiyPageStyles,
  type BrandDiyPageType,
  type BrandDiySaveBody,
  type BrandDiyWidget,
  type BrandDiyWidgetMeta,
} from "@enterprise/contracts";
import { normalizeDiyStyles } from "../../_components/diy-preview";

/**
 * 装修编辑器的数据模型：草稿 <-> 契约请求体、组件 id 生成、属性表单用到的枚举文案。
 *
 * 组件类型只能取自 `BrandMall_diyWidgets` 下发的白名单：后端会丢掉白名单外的类型，
 * 并把未知属性与 defaultProps 合并，所以这里新增组件时直接复制 defaultProps 作为初值。
 */

export type DiyDraft = {
  id: number;
  name: string;
  type: BrandDiyPageType;
  coverImage: string;
  sortOrder: number;
  components: BrandDiyComponent[];
  styles: BrandDiyPageStyles;
};

/** 契约 `components` 上限 60 个，编辑器先挡住，不给后端报错的机会。 */
export const DIY_COMPONENT_LIMIT = 60;
/** 契约 id 上限 64 字符。 */
const DIY_ID_LIMIT = 64;

export function draftFromPage(page: BrandDiyPage): DiyDraft {
  return {
    id: page.id,
    name: page.name,
    type: page.type,
    coverImage: page.coverImage ?? "",
    sortOrder: page.sortOrder ?? 0,
    components: (Array.isArray(page.components) ? page.components : []).map((item) => ({
      id: item.id,
      type: item.type,
      props: { ...(item.props ?? {}) },
    })),
    styles: normalizeDiyStyles(page.styles),
  };
}

/** 脏检查只比内容：后端不会改的字段（status/publishedAt）不参与。 */
export function contentKey(draft: DiyDraft): string {
  return JSON.stringify({
    name: draft.name,
    type: draft.type,
    coverImage: draft.coverImage,
    sortOrder: draft.sortOrder,
    styles: draft.styles,
    components: draft.components,
  });
}

export function saveBodyOf(shopId: number, draft: DiyDraft): BrandDiySaveBody {
  return {
    shopId,
    id: draft.id > 0 ? draft.id : undefined,
    name: draft.name.trim().slice(0, 40) || "未命名页面",
    type: draft.type,
    components: draft.components
      .slice(0, DIY_COMPONENT_LIMIT)
      .map((item) => ({ id: item.id, type: item.type, props: { ...item.props } })),
    styles: { ...draft.styles },
    coverImage: draft.coverImage.slice(0, 500),
    sortOrder: Math.min(9999, Math.max(0, Math.round(draft.sortOrder || 0))),
  };
}

let idCounter = 0;

/**
 * 组件实例 id：小程序端按它 key 复用节点，必须稳定且同页唯一。
 * 时间戳（36 进制）+ 递增序号，冲突时继续递增，长度控制在契约上限内。
 */
export function componentId(type: BrandDiyWidget, taken: string[]): string {
  const used = new Set(taken);
  let id = "";
  do {
    idCounter += 1;
    id = `${type}-${Date.now().toString(36)}-${idCounter}`;
  } while (used.has(id));
  return id.slice(0, DIY_ID_LIMIT);
}

export function makeComponent(
  meta: BrandDiyWidgetMeta,
  taken: string[],
): BrandDiyComponent {
  return {
    id: componentId(meta.type, taken),
    type: meta.type,
    props: cloneProps(meta.defaultProps),
  };
}

/** props 里只有对象/数组/原始值（装修数据本身是 JSON），深拷贝用 JSON 足够。 */
export function cloneProps(source: Record<string, unknown> | undefined): Record<string, unknown> {
  try {
    return source ? (JSON.parse(JSON.stringify(source)) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function patchProps(
  component: BrandDiyComponent,
  patch: Record<string, unknown>,
): BrandDiyComponent {
  return { ...component, props: { ...component.props, ...patch } };
}

export function duplicateComponent(
  component: BrandDiyComponent,
  taken: string[],
): BrandDiyComponent {
  return {
    ...component,
    id: componentId(component.type, taken),
    props: cloneProps(component.props),
  };
}

export function moveComponent(
  list: BrandDiyComponent[],
  index: number,
  offset: number,
): BrandDiyComponent[] {
  const target = index + offset;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  const [row] = next.splice(index, 1);
  next.splice(target, 0, row);
  return next;
}

export function widgetName(
  widgets: BrandDiyWidgetMeta[],
  type: BrandDiyWidget,
): string {
  return widgets.find((item) => item.type === type)?.name ?? type;
}

/** 组件库分组：按目录（后端）顺序聚合，groupLabel 用后端下发的中文组名。 */
export function groupWidgets(
  widgets: BrandDiyWidgetMeta[],
): { group: string; label: string; items: BrandDiyWidgetMeta[] }[] {
  const buckets = new Map<string, { group: string; label: string; items: BrandDiyWidgetMeta[] }>();
  for (const item of widgets) {
    const current = buckets.get(item.group);
    if (current) current.items.push(item);
    else buckets.set(item.group, { group: item.group, label: item.groupLabel, items: [item] });
  }
  return [...buckets.values()];
}

// ---------------------------------------------------------------- 图标与文案

/** 后端 `icon` 字段是 CRMEB 风格的名字，这里映射到 antd 图标，不认识的回退通用图标。 */
export const WIDGET_ICONS: Record<string, typeof SearchOutlined> = {
  search: SearchOutlined,
  picture: PictureOutlined,
  appstore: AppstoreOutlined,
  menu: MenuOutlined,
  horn: NotificationOutlined,
  "file-text": FileTextOutlined,
  edit: EditOutlined,
  shop: ShopOutlined,
  category: PartitionOutlined,
  gift: GiftOutlined,
  home: HomeOutlined,
  tool: ToolOutlined,
  "column-height": ColumnHeightOutlined,
  bar: ProfileOutlined,
};

export function widgetIcon(icon: string) {
  return WIDGET_ICONS[icon] ?? BarsOutlined;
}

type Option<T extends string = string> = { value: T; label: string };

export const LINK_TYPE_LABELS: Record<string, string> = {
  NONE: "不跳转",
  PAGE: "站内页面",
  PRODUCT: "商品",
  CATEGORY: "商品分类",
  COUPON: "优惠券",
  WEBVIEW: "外部网页",
};

export const LINK_TYPE_OPTIONS: Option[] = BRAND_LINK_TYPES.map((value) => ({
  value,
  label: LINK_TYPE_LABELS[value] ?? value,
}));

export const PAGE_TYPE_OPTIONS: Option[] = BRAND_DIY_PAGE_TYPES.map((value) => ({
  value,
  label:
    value === "HOME"
      ? "首页（默认页）"
      : value === "CATEGORY"
        ? "分类页（默认页）"
        : value === "MINE"
          ? "个人中心（默认页）"
          : "活动页",
}));

export const IMAGE_ADS_MODES: Option[] = [
  { value: "swiper", label: "轮播图" },
  { value: "list", label: "平铺大图" },
];

export const CUBE_LAYOUTS: Option[] = [
  { value: "FOUR", label: "四宫格（2×2）" },
  { value: "TWO", label: "两栏一行" },
];

export const TITLE_ALIGNS: Option[] = [
  { value: "left", label: "左对齐" },
  { value: "center", label: "居中" },
  { value: "right", label: "右对齐" },
];

export const GOODS_SOURCES: Option[] = [
  { value: "RECOMMEND", label: "推荐商品（热销/新品）" },
  { value: "CATEGORY", label: "指定分类" },
  { value: "ALL", label: "全部商品" },
  { value: "MANUAL", label: "手动选品" },
];

export const GOODS_STYLES: Option[] = [
  { value: "CARD", label: "卡片（多列）" },
  { value: "LIST", label: "列表（单列）" },
];

export const COUPON_STYLES: Option[] = [
  { value: "TWO", label: "两张并排" },
  { value: "ONE", label: "一行一张" },
];

export const ASSIST_MODES: Option[] = [
  { value: "PHONE", label: "拨打客服电话" },
  { value: "COPY", label: "复制微信号" },
  { value: "QRCODE", label: "显示二维码" },
];

export const SPACER_COLORS: Option[] = [
  { value: "transparent", label: "透明（纯留白）" },
  { value: "#ffffff", label: "白色分隔条" },
  { value: "#f5f5f5", label: "灰色分隔条" },
  { value: "#eeeeee", label: "浅灰分隔条" },
];

/**
 * 站内页面路径候选：契约的 `link.path` 是自由字符串（小程序页面路径），
 * 平台侧没有下发路由表，这里按设计方案 §七 的小程序页面清单给候选，
 * 用 AutoComplete 允许店主填自己小程序里的真实路径。
 */
export const PAGE_PATH_OPTIONS: { value: string; label: string }[] = [
  { value: "pages/index/index", label: "首页 pages/index/index" },
  { value: "pages/category/index", label: "分类页 pages/category/index" },
  { value: "pages/cart/index", label: "购物车 pages/cart/index" },
  { value: "pages/me/index", label: "个人中心 pages/me/index" },
  { value: "pages/goods-list/index", label: "商品列表 pages/goods-list/index" },
  { value: "pages/goods-search/index", label: "商品搜索 pages/goods-search/index" },
  { value: "pages/coupon-list/index", label: "领券中心 pages/coupon-list/index" },
  { value: "pages/order-list/index", label: "我的订单 pages/order-list/index" },
];

export const WEBVIEW_TIP =
  "外部网页需在微信小程序后台配好业务域名，端上用 web-view 打开。";

export const DEFAULT_STYLES = BRAND_DEFAULT_DIY_STYLES;

/** 链接摘要：属性面板与列表里显示当前跳转目标，不用展开选择器也能看懂。 */
export function linkSummary(link: BrandDiyLink): string {
  if (!link || link.type === "NONE") return "不跳转";
  const label = LINK_TYPE_LABELS[link.type] ?? link.type;
  if (link.type === "PAGE" || link.type === "WEBVIEW") {
    return `${label}：${link.name || link.path || "未填路径"}`;
  }
  return `${label}：${link.name || (link.targetId ? `#${link.targetId}` : "未选择")}`;
}

export function emptyLink(): BrandDiyLink {
  return { type: "NONE", name: "", path: "", targetId: 0 };
}

/** 列表型 props（图片项/导航项/tabBar 项）的统一读取。 */
export function listOf(props: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const raw = props[key];
  return Array.isArray(raw)
    ? raw.map((item) =>
        item && typeof item === "object" ? (item as Record<string, unknown>) : {},
      )
    : [];
}

/** 数字型 props 的受控读写：InputNumber 允许清空（null），落到 props 时按兜底值存。 */
export function numValue(value: unknown, fallback: number): number {
  const raw = Number(value);
  return Number.isFinite(raw) ? raw : fallback;
}
