const api = require("./api");
const session = require("./session");

/**
 * 装修快照的归一化与取数。
 *
 * 后端回传的 `components` 是 `[{ type, props }]`，props 里任何字段都可能缺失
 * 或类型不对（编辑器改默认值、老数据、手工改库都可能），这里按
 * `backend/src/marketplace/mp.diy-widgets.ts` 的 defaultProps 补齐一遍，
 * 端上渲染只认补齐后的值，模板里不再各写一套兜底。
 *
 * 尺寸口径与编辑器预览一致：props 里的像素值就是 750rpx 设计稿的 rpx。
 */

const WIDGET_DEFAULTS = {
  searchBar: { placeholder: "搜索商品", disabled: true, radius: 28 },
  imageAds: {
    mode: "swiper",
    height: 320,
    interval: 4,
    gutter: 16,
    radius: 12,
    items: [],
  },
  imageCube: { layout: "FOUR", gutter: 8, radius: 8, items: [] },
  nav: { columns: 4, items: [] },
  notice: { text: "", icon: "", speed: 60 },
  title: { main: "标题", sub: "", align: "left", bold: true },
  richText: { html: "" },
  goodsList: {
    source: "RECOMMEND",
    shopId: 0,
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
  storeHead: { showLogo: true, showSlogan: true, showFollow: true },
  shopList: { limit: 6, columns: 2, style: "CARD", showIntro: true },
  assist: { mode: "PHONE", label: "联系客服" },
  spacer: { height: 12, color: "transparent" },
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
  return Math.min(max, Math.max(min, Math.round(num(value, fallback))));
}

function bool(value, fallback) {
  return typeof value === "boolean" ? value : fallback === undefined ? false : fallback;
}

/** 对象数组（图片项/导航项/券）：脏项退化成空对象而不是崩掉渲染。 */
function list(value) {
  return Array.isArray(value)
    ? value.map(function (item) {
        return item && typeof item === "object" ? item : {};
      })
    : [];
}

function numbers(value) {
  return Array.isArray(value)
    ? value
        .map(function (item) {
          return Number(item);
        })
        .filter(function (item) {
          return Number.isFinite(item) && item > 0;
        })
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

/** 单个组件实例 → 渲染用的 { key, type, props, data }。 */
function normalizeOne(component, index) {
  const item = component && typeof component === "object" ? component : {};
  const type = str(item.type);
  const defaults = WIDGET_DEFAULTS[type];
  const rawProps = item.props && typeof item.props === "object" ? item.props : {};
  const props = Object.assign({}, defaults || {}, rawProps);

  if (type === "imageAds" || type === "imageCube") {
    props.items = list(props.items).map(function (entry) {
      return {
        image: str(entry.image),
        link: linkOf(entry.link),
      };
    });
  }
  if (type === "nav") {
    props.columns = numIn(props.columns, 2, 5, 4);
    props.items = list(props.items).map(function (entry) {
      return {
        image: str(entry.image),
        text: str(entry.text),
        link: linkOf(entry.link),
      };
    });
  }
  if (type === "goodsList") {
    props.columns = numIn(props.columns, 1, 3, 2);
    props.limit = numIn(props.limit, 1, 30, 10);
    props.productIds = numbers(props.productIds);
  }
  if (type === "coupon") props.couponIds = numbers(props.couponIds);
  if (type === "shopList") {
    props.columns = numIn(props.columns, 1, 3, 2);
    props.limit = numIn(props.limit, 1, 30, 6);
  }
  if (type === "categoryLine") props.limit = numIn(props.limit, 1, 30, 10);
  if (type === "spacer") props.height = numIn(props.height, 0, 200, 12);

  return {
    key: type + "-" + index,
    type: type,
    props: props,
    data: {},
  };
}

function normalizeComponents(components) {
  return (Array.isArray(components) ? components : []).map(normalizeOne);
}

function normalizeStyles(raw) {
  const styles = raw && typeof raw === "object" ? raw : {};
  return {
    backgroundColor: str(styles.backgroundColor, ""),
    backgroundImage: str(styles.backgroundImage),
    paddingTop: Math.min(200, Math.max(0, num(styles.paddingTop, 0))),
    themeColor: str(styles.themeColor),
  };
}

/** styles → 页面内联样式；装修首页不铺底色，避免盖住模板默认灰底。 */
function pageStyle(raw) {
  const styles = normalizeStyles(raw);
  const parts = [];
  if (styles.backgroundColor) parts.push("background-color:" + styles.backgroundColor);
  if (styles.paddingTop) parts.push("padding-top:" + styles.paddingTop * 2 + "rpx");
  if (styles.backgroundImage) {
    parts.push("background-image:url(" + styles.backgroundImage + ")");
    parts.push("background-size:100% auto");
    parts.push("background-repeat:no-repeat");
  }
  return parts.join(";");
}

function themeOf(diy, ctx) {
  const styles = normalizeStyles(diy && diy.styles);
  return styles.themeColor || ctx.themeColor;
}

/**
 * 组件共用的页面上下文：市场/店铺信息来自 bootstrap（匿名接口），
 * 装修 props 里只存 id，名称/价格/券一律现查，上下文只带主体信息。
 */
function buildCtx(bootstrap, options) {
  const data = bootstrap && typeof bootstrap === "object" ? bootstrap : {};
  const market = data.market || {};
  const shop = options && options.shop ? options.shop : null;
  const categories = (Array.isArray(data.categories) ? data.categories : []).filter(
    function (item) {
      return !item.parentId;
    },
  );
  return {
    themeColor:
      (shop && shop.themeColor) || market.themeColor || session.themeColor || "#3370ff",
    market: {
      name: str(market.name),
      logo: str(market.logo),
      description: str(market.description),
    },
    shop: shop
      ? {
          id: num(shop.id),
          name: str(shop.name),
          logo: str(shop.logo),
          intro: str(shop.intro),
          followed: bool(shop.followed),
        }
      : null,
    shopId: shop ? num(shop.id) : 0,
    shops: Array.isArray(data.shops) ? data.shops : [],
    categories: categories,
    desk: {
      siteKey: str(market.deskSiteKey),
      embedUrl: str(market.deskEmbedUrl),
    },
  };
}

function couponText(item) {
  return item.type === "DISCOUNT" ? item.value + " 折" : "减 " + item.value + " 元";
}

function couponThreshold(item) {
  return item.threshold > 0 ? "满 " + item.threshold + " 元可用" : "无门槛";
}

function couponHint(item) {
  if (!item.claimable) {
    if (item.remaining === 0) return "已领完";
    return item.claimed > 0 ? "已领取" : "不可领";
  }
  return item.claimed > 0 ? "再领一张" : "领取";
}

function gridWidth(columns) {
  if (columns === 1) return "width:100%;";
  if (columns === 3) return "width:calc(33.33% - 8rpx);";
  return "width:calc(50% - 8rpx);";
}

/** 商品楼层取数：券/分类等 id 过滤在端上做，接口只按店铺/分类/关键词查。 */
function loadGoods(block, ctx) {
  const props = block.props;
  const params = {
    page: 1,
    pageSize: Math.max(props.limit, props.productIds.length || 0, 10),
  };
  if (props.categoryId) params.categoryId = props.categoryId;
  const shopId = props.shopId || ctx.shopId;
  if (shopId) params.shopId = shopId;
  return api.products(params).then(function (result) {
    let items = (result && result.list) || [];
    if (props.productIds.length) {
      items = items.filter(function (item) {
        return props.productIds.indexOf(item.id) >= 0;
      });
    }
    items = items.slice(0, props.limit).map(function (item) {
      return {
        id: item.id,
        title: item.title,
        subtitle: item.subtitle,
        coverImage: item.coverImage,
        priceText: (Number(item.price) || 0).toFixed(2),
        sales: item.sales,
        shopName: item.shopName,
      };
    });
    block.data = { items: items, cardStyle: gridWidth(props.columns) };
    return block;
  });
}

function loadCoupons(block, ctx) {
  return api.coupons(ctx.shopId).then(function (rows) {
    let items = Array.isArray(rows) ? rows : [];
    const ids = block.props.couponIds;
    if (ids.length) {
      items = items.filter(function (item) {
        return ids.indexOf(item.id) >= 0;
      });
    }
    block.data = {
      items: items.slice(0, 6).map(function (item) {
        return Object.assign({}, item, {
          couponText: couponText(item),
          thresholdText: couponThreshold(item),
          hintText: couponHint(item),
        });
      }),
      cardStyle: block.props.style === "ONE" ? "width:100%;" : "width:calc(50% - 8rpx);",
    };
    return block;
  });
}

function loadBlock(block, ctx) {
  if (block.type === "goodsList") return loadGoods(block, ctx);
  if (block.type === "coupon") return loadCoupons(block, ctx);
  if (block.type === "categoryLine") {
    block.data = { items: ctx.categories.slice(0, block.props.limit) };
    return Promise.resolve(block);
  }
  if (block.type === "shopList") {
    const items = ctx.shops
      .filter(function (shop) {
        return num(shop.id) !== ctx.shopId;
      })
      .slice(0, block.props.limit);
    block.data = { items: items, cardStyle: gridWidth(block.props.columns) };
    return Promise.resolve(block);
  }
  if (block.type === "storeHead") {
    // 市场首页没有具体店铺：头部退化成市场门面，且不渲染关注按钮
    block.data = {
      info: ctx.shop || {
        name: ctx.market.name,
        logo: ctx.market.logo,
        intro: ctx.market.description,
        followed: true,
      },
      canFollow: !!ctx.shop,
    };
    return Promise.resolve(block);
  }
  if (block.type === "assist") {
    block.data = { usesDesk: !!ctx.desk.embedUrl };
    return Promise.resolve(block);
  }
  if (block.type === "imageCube") {
    const width =
      block.props.layout === "TWO"
        ? "50%"
        : block.props.layout === "THREE"
          ? "33.33%"
          : "25%";
    block.data = { cellStyle: "width:" + width + ";" };
    return Promise.resolve(block);
  }
  if (block.type === "nav") {
    block.data = { cellStyle: "width:" + (100 / block.props.columns).toFixed(2) + "%;" };
    return Promise.resolve(block);
  }
  return Promise.resolve(block);
}

/**
 * 装修页入口：返回 { blocks, style, themeColor }。
 * 单个楼层取数失败只让该楼层空着，不把一个组件的错误放大成整页报错。
 */
function loadPage(diy, ctx) {
  if (!diy || !Array.isArray(diy.components) || diy.components.length === 0) {
    return Promise.resolve(null);
  }
  const blocks = normalizeComponents(diy.components);
  const jobs = blocks.map(function (block) {
    return loadBlock(block, ctx).catch(function () {
      block.data = null;
      return block;
    });
  });
  return Promise.all(jobs).then(function (loaded) {
    return {
      blocks: loaded,
      style: pageStyle(diy.styles),
      themeColor: themeOf(diy, ctx),
    };
  });
}

module.exports = {
  WIDGET_DEFAULTS: WIDGET_DEFAULTS,
  str: str,
  num: num,
  bool: bool,
  list: list,
  linkOf: linkOf,
  normalizeComponents: normalizeComponents,
  buildCtx: buildCtx,
  pageStyle: pageStyle,
  loadPage: loadPage,
};
