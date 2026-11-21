/**
 * 装修链接的唯一出口。
 *
 * 链接对象统一是契约里的 `{ type, name, path, targetId }`，PAGE/WEBVIEW 用 path，
 * PRODUCT/CATEGORY/COUPON 用 targetId。编辑器里的 PAGE 候选是通用命名，
 * 与本模板目录结构不一致的在这里改名，保证装修好的跳转不会点了没反应。
 */
const TAB_PAGES = [
  "/pages/index/index",
  "/pages/cart/cart",
  "/pages/mine/mine",
];

const PATH_ALIASES = {
  "pages/index/index": "pages/index/index",
  "pages/cart/index": "pages/cart/cart",
  "pages/me/index": "pages/mine/mine",
  "pages/category/index": "pages/index/index",
  "pages/goods-list/index": "pages/index/index",
  "pages/goods-detail/index": "pages/product/product",
  "pages/coupon-list/index": "pages/coupon/coupon",
  "pages/order-list/index": "pages/orders/orders",
  "pages/address-list/index": "pages/address/list",
  "pages/shop/index": "pages/shop/shop",
  "pages/follow-list/index": "pages/follow/follow",
  "pages/service/index": "pages/service/service",
};

function str(value) {
  return value === undefined || value === null ? "" : String(value);
}

/** 脏数据（类型不认识、id 为 0）一律当「不跳转」，不能把 undefined 拼进 url。 */
function normalize(raw) {
  const item = raw && typeof raw === "object" ? raw : {};
  return {
    type: str(item.type) || "NONE",
    name: str(item.name),
    path: str(item.path).trim(),
    targetId: Number(item.targetId || 0),
  };
}

function isTab(url) {
  return TAB_PAGES.indexOf(url.split("?")[0]) >= 0;
}

function toast(title) {
  wx.showToast({ title: title, icon: "none" });
}

/** tab 页必须走 switchTab，其余 navigateTo（失败退成 redirectTo，避免连点卡死）。 */
function push(url, title) {
  if (!url) return;
  if (title) wx.setNavigationBarTitle({ title: String(title) });
  if (isTab(url)) {
    wx.switchTab({
      url: url,
      fail: function () {
        toast("页面不可用");
      },
    });
    return;
  }
  wx.navigateTo({
    url: url,
    fail: function () {
      wx.redirectTo({
        url: url,
        fail: function () {
          toast("页面打开失败");
        },
      });
    },
  });
}

function pageUrl(link) {
  const raw = link.path.replace(/^\/+/, "");
  if (!raw) return "";
  const parts = raw.split("?");
  const route = PATH_ALIASES[parts[0]] || parts[0];
  const query = parts[1] ? "?" + parts[1] : "";
  return "/" + route + query;
}

/** 外部网页：微信只允许 https，且域名要在小程序后台配业务域名。 */
function webviewUrl(link) {
  if (link.path.indexOf("https://") !== 0) {
    toast("外链必须是 https 地址");
    return "";
  }
  return "/pages/webview/webview?url=" + encodeURIComponent(link.path);
}

function open(rawLink) {
  const link = normalize(rawLink);
  if (!link.type || link.type === "NONE") return;
  if (link.type === "PRODUCT") {
    if (!link.targetId) return toast("还没选择商品");
    return push("/pages/product/product?id=" + link.targetId);
  }
  if (link.type === "CATEGORY") {
    // tab 页不能带 query 跳转：分类意图先落缓存，首页 onShow 自取并切到商品列表
    if (link.targetId) wx.setStorageSync("mp_pending_category", link.targetId);
    return push("/pages/index/index");
  }
  if (link.type === "COUPON") {
    return push("/pages/coupon/coupon");
  }
  if (link.type === "WEBVIEW") return push(webviewUrl(link));
  if (link.type === "PAGE") {
    const url = pageUrl(link);
    if (!url) return toast("还没配置跳转页面");
    return push(url, link.name);
  }
  toast("暂不支持的链接类型");
}

module.exports = {
  open: open,
  push: push,
  normalize: normalize,
  pageUrl: pageUrl,
  isTab: isTab,
  goProduct: function (id) {
    open({ type: "PRODUCT", targetId: id });
  },
  goShop: function (id) {
    if (!id) return;
    push("/pages/shop/shop?id=" + id);
  },
  goService: function (context) {
    const params = [];
    if (context && context.shopName) {
      params.push("shopName=" + encodeURIComponent(context.shopName));
    }
    if (context && context.orderNo) {
      params.push("orderNo=" + encodeURIComponent(context.orderNo));
    }
    push("/pages/service/service" + (params.length ? "?" + params.join("&") : ""));
  },
};
