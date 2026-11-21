const session = require("./session");

/**
 * 装修发布快照的归一化。
 *
 * 后端回传的 `components` 是 `[{ id, type, props }]`，props 里任何字段都可能缺失
 * 或类型不对（编辑器改默认值、老数据、手工改库都可能），所以这里按
 * `backend/src/brand-mall/brand.diy-widgets.ts` 的 defaultProps 补齐一遍，端上渲染
 * 只认补齐后的值，组件内部不再各写一套兜底。
 *
 * 尺寸口径与编辑器预览一致：props 里的像素值就是小程序 750rpx 设计稿的 rpx，
 * 直接用；只有页面级 styles.paddingTop 契约里写明是 px，渲染时乘 2。
 */

/** 与后端组件目录一一对应的属性初值。 */
const WIDGET_DEFAULTS = {
  searchBar: { placeholder: "搜索商品", disabled: true, radius: 28 },
  imageAds: { mode: "swiper", height: 320, interval: 4, gutter: 16, radius: 12, items: [] },
  imageCube: { layout: "FOUR", gutter: 8, radius: 8, items: [] },
  nav: { columns: 4, items: [] },
  notice: { text: "", icon: "", speed: 60 },
  title: { main: "标题", sub: "", align: "left", bold: true },
  richText: { html: "" },
  goodsList: {
    source: "RECOMMEND",
    categoryId: 0,
    productIds: [],
    limit: 10,
    columns: 2,
    style: "CARD",
    showTitle: true,
    showSubtitle: false,
    showPrice: true,
    showSales: true,
  },
  categoryLine: { limit: 10 },
  coupon: { couponIds: [], style: "TWO" },
  storeHead: { showLogo: true, showSlogan: true, showPhone: true },
  assist: { mode: "PHONE", label: "联系客服" },
  spacer: { height: 12, color: "transparent" },
  pageFoot: { items: [] },
};

const LINK_TYPES = ["NONE", "PAGE", "PRODUCT", "CATEGORY", "COUPON", "WEBVIEW"];

function str(value, fallback) {
  return typeof value === "string" ? value : fallback === undefined ? "" : fallback;
}

function num(value, fallback) {
  const raw = Number(value);
  return Number.isFinite(raw) ? raw : fallback === undefined ? 0 : fallback;
}

function numIn(value, min, max, fallback) {
  const clamped = Math.round(num(value, fallback));
  return Math.min(max, Math.max(min, clamped));
}

function bool(value, fallback) {
  return typeof value === "boolean" ? value : fallback === undefined ? false : fallback;
}

/** props 里的对象数组（图片项/导航项/券/商品 id）：脏项退化成空对象而不是崩掉渲染。 */
function list(value) {
  return Array.isArray(value) ? value.map((item) => (item && typeof item === "object" ? item : {})) : [];
}

function numbers(value) {
  return Array.isArray(value)
    ? value.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0)
    : [];
}

function linkOf(raw) {
  const item = raw && typeof raw === "object" ? raw : {};
  const type = str(item.type, "NONE");
  return {
    type: LINK_TYPES.indexOf(type) >= 0 ? type : "NONE",
    name: str(item.name),
    path: str(item.path),
    targetId: num(item.targetId, 0),
  };
}

/** 单个组件实例 → 渲染用的 { key, type, props }；key 用发布快照里的实例 id。 */
function normalizeOne(component, index) {
  const item = component && typeof component === "object" ? component : {};
  const type = str(item.type);
  const defaults = WIDGET_DEFAULTS[type];
  const rawProps = item.props && typeof item.props === "object" ? item.props : {};
  const props = Object.assign({}, defaults || {}, rawProps);
  return {
    key: str(item.id) || "diy-" + index,
    type: type,
    props: props,
    unknown: !defaults,
  };
}

function normalizeComponents(components) {
  const listValue = Array.isArray(components) ? components : [];
  return listValue.map(normalizeOne);
}

/** 页面级样式：缺字段回落契约默认值。 */
function normalizeStyles(raw) {
  const styles = raw && typeof raw === "object" ? raw : {};
  return {
    backgroundColor: str(styles.backgroundColor, "#F5F5F5"),
    backgroundImage: str(styles.backgroundImage),
    headerColor: str(styles.headerColor, "#FA3534"),
    paddingTop: Math.min(200, Math.max(0, num(styles.paddingTop, 0))),
  };
}

/** styles → 页面容器内联样式（paddingTop 是 px，换算成 rpx 要乘 2）。 */
function pageStyle(raw) {
  const styles = normalizeStyles(raw);
  const parts = [
    "background-color:" + styles.backgroundColor,
    "padding-top:" + styles.paddingTop * 2 + "rpx",
  ];
  if (styles.backgroundImage) {
    parts.push("background-image:url(" + styles.backgroundImage + ")");
    parts.push("background-size:100% auto");
    parts.push("background-repeat:no-repeat");
  }
  return parts.join(";");
}

/**
 * 组件共用的页面上下文：店铺信息来自 bootstrap（匿名接口），
 * 装修 props 里只存 id，名称/价格一律按 id 现查，所以上下文只带店级信息。
 */
function buildCtx(bootstrap, pageType) {
  const data = bootstrap && typeof bootstrap === "object" ? bootstrap : {};
  // 主题色优先取店铺实时装修配置，其次才是 config.js 里填的值（改色不必重出包）。
  const themeColor = str(data.themeColor) || session.getThemeColor() || "#FA3534";
  return {
    themeColor: themeColor,
    pageType: str(pageType, "HOME"),
    shopCode: session.getShopCode(),
    shop: {
      name: str(data.name, "商城"),
      logo: str(data.logo),
      slogan: str(data.slogan),
      servicePhone: str(data.servicePhone),
      payEnabled: bool(data.payEnabled, false),
      pointsEnabled: bool(data.pointsEnabled, false),
      trade: data.trade && typeof data.trade === "object" ? data.trade : {},
    },
    // 在线客服：只有绑定了 AI 客服站点才有地址，assist 组件据此决定走会话还是拨号
    desk: {
      siteKey: str(data.deskSiteKey),
      embedUrl: str(data.deskEmbedUrl),
    },
  };
}

/** 按页面类型从 bootstrap.pages 里取发布快照（HOME/CATEGORY/MINE）。 */
function pageOf(bootstrap, type) {
  const pages = bootstrap && Array.isArray(bootstrap.pages) ? bootstrap.pages : [];
  for (let index = 0; index < pages.length; index += 1) {
    if (str(pages[index].type) === type) return pages[index];
  }
  return null;
}

module.exports = {
  WIDGET_DEFAULTS: WIDGET_DEFAULTS,
  str: str,
  num: num,
  numIn: numIn,
  bool: bool,
  list: list,
  numbers: numbers,
  linkOf: linkOf,
  normalizeOne: normalizeOne,
  normalizeComponents: normalizeComponents,
  normalizeStyles: normalizeStyles,
  pageStyle: pageStyle,
  buildCtx: buildCtx,
  pageOf: pageOf,
};
