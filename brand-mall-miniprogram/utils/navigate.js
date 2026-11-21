/**
 * 装修链接的唯一出口。
 *
 * 链接对象统一是契约里的 `{ type, name, path, targetId }`（packages/contracts/src/brand-mall.ts
 * 的 brandDiyLinkSchema）：PAGE/WEBVIEW 用 path，PRODUCT/CATEGORY/COUPON 用 targetId。
 * 所有可点组件（图片广告/魔方/图标导航/商品列表/券/底部导航/搜索框）都只调这里的
 * open()，一处保证「同一个链接在首页、活动页、底部导航里表现一致」。
 */
const TAB_PAGES = [
  "/pages/index/index",
  "/pages/category/category",
  "/pages/cart/cart",
  "/pages/me/me",
];

/**
 * 装修编辑器的 PAGE 候选路径与本模板真实页面路径的对照：
 * 编辑器里存的是通用命名（pages/goods-list/index 等），本模板按目录分组
 * （pages/goods/list），不改后端数据，只在端上落地时改名，
 * 否则店主装修好的跳转会全部点不开。
 */
const PATH_ALIASES = {
  "pages/index/index": "pages/index/index",
  "pages/category/index": "pages/category/category",
  "pages/cart/index": "pages/cart/cart",
  "pages/me/index": "pages/me/me",
  "pages/goods-list/index": "pages/goods/list",
  "pages/goods-detail/index": "pages/goods/detail",
  "pages/goods-search/index": "pages/search/search",
  "pages/coupon-list/index": "pages/coupon/list",
  "pages/order-list/index": "pages/order/list",
  "pages/order-confirm/index": "pages/order/confirm",
  "pages/address-list/index": "pages/address/list",
  "pages/diy-page/index": "pages/diy/page",
};

function str(value) {
  return value === undefined || value === null ? "" : String(value);
}

/** 脏数据（类型不认识、id 为 0）一律当「不跳转」，绝不能把 undefined 拼进 url。 */
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

/** 统一跳转：tab 页必须走 switchTab，其余 navigateTo（失败退成 redirectTo，避免连点卡死）。 */
function push(url, title) {
  if (!url) return;
  if (title) wx.setNavigationBarTitle({ title: String(title) });
  if (isTab(url)) {
    wx.switchTab({
      url: url,
      fail() {
        toast("页面不可用");
      },
    });
    return;
  }
  wx.navigateTo({
    url: url,
    fail() {
      wx.redirectTo({
        url: url,
        fail() {
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
  const url = link.path;
  if (url.indexOf("https://") !== 0) {
    toast("外链必须是 https 地址");
    return "";
  }
  return "/pages/webview/webview?url=" + encodeURIComponent(url);
}

function open(rawLink) {
  const link = normalize(rawLink);
  if (link.type === "NONE" || !link.type) return;
  if (link.type === "PRODUCT") {
    if (!link.targetId) return toast("还没选择商品");
    return push("/pages/goods/detail?id=" + link.targetId);
  }
  if (link.type === "CATEGORY") {
    if (!link.targetId) return push("/pages/category/category");
    return push(
      "/pages/goods/list?categoryId=" +
        link.targetId +
        "&title=" +
        encodeURIComponent(link.name || "分类商品"),
      link.name || "分类商品",
    );
  }
  if (link.type === "COUPON") {
    return push("/pages/coupon/list" + (link.targetId ? "?couponId=" + link.targetId : ""));
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
  goCategory: function (id, name) {
    open({ type: "CATEGORY", targetId: id, name: name || "" });
  },
  goSearch: function () {
    push("/pages/search/search");
  },
  goCart: function () {
    push("/pages/cart/cart");
  },
};
