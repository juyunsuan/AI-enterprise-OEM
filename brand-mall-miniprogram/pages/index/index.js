const auth = require("../../utils/auth");
const diy = require("../../utils/diy-render");
const navigate = require("../../utils/navigate");

/**
 * 首页：渲染 bootstrap 里 HOME 页的发布快照。
 * 店主还没装修时给一套最小可用首页（搜索框 + 热卖商品），
 * 整页空白会被当成商城坏了。
 */
const FALLBACK_COMPONENTS = [
  { id: "fallback-search", type: "searchBar", props: {} },
  { id: "fallback-goods", type: "goodsList", props: { source: "RECOMMEND", limit: 10 } },
];

Page({
  data: {
    blocks: [],
    ctx: {},
    pageStyle: "",
    error: "",
    fallback: false,
  },

  onShow() {
    const app = getApp();
    app.ensureReady().then(() => this.render());
  },

  onPullDownRefresh() {
    const app = getApp();
    app.globalData.ready = app.loadBootstrap();
    app.globalData.ready.then(() => {
      this.render();
      wx.stopPullDownRefresh();
    });
  },

  render() {
    const app = getApp();
    const bootstrap = app.bootstrap();
    const snapshot = app.pageSnapshot("HOME");
    const hasPublished = !!(snapshot && Array.isArray(snapshot.components) && snapshot.components.length);
    const ctx = diy.buildCtx(bootstrap, "HOME");
    this.setData({
      blocks: diy.normalizeComponents(hasPublished ? snapshot.components : FALLBACK_COMPONENTS),
      ctx: ctx,
      pageStyle: diy.pageStyle(snapshot && snapshot.styles),
      fallback: !hasPublished,
      error: hasPublished ? "" : app.globalData.bootstrapError || "",
    });
  },

  retryLogin() {
    const app = getApp();
    app.globalData.ready = app.loadBootstrap();
    app.globalData.ready.then(() => auth.silentLogin().then(() => this.render()));
  },

  onShareAppMessage() {
    return {
      title: getApp().bootstrap().name || "商城",
      path: "/pages/index/index",
    };
  },
});
