const api = require("./utils/api");
const session = require("./utils/session");

App({
  globalData: {
    bootstrap: null,
    bootstrapError: "",
    ready: null,
  },

  onLaunch() {
    this.globalData.ready = this.loadBootstrap();
  },

  /**
   * 店铺配置只拉一次；失败时页面按「未开通」渲染并保留原因，
   * 顾客看到的提示要和店主后台的引导口径一致，不能只说“加载失败”。
   */
  loadBootstrap() {
    return api
      .bootstrap({ shopCode: session.getShopCode() })
      .then((data) => {
        this.applyBootstrap(data);
        return data;
      })
      .catch((error) => {
        this.globalData.bootstrapError = (error && error.message) || "店铺服务暂不可用";
        return null;
      });
  },

  applyBootstrap(data) {
    const themeColor = (data && data.themeColor) || "#3370ff";
    this.globalData.bootstrap = data || null;
    wx.setNavigationBarColor({ frontColor: "#ffffff", backgroundColor: themeColor });
    wx.setNavigationBarTitle({
      title: (data && (data.navigationTitle || data.shopName)) || "上门服务",
    });
  },

  ensureReady() {
    if (!this.globalData.ready) this.globalData.ready = this.loadBootstrap();
    return this.globalData.ready;
  },

  bootstrap() {
    return this.globalData.bootstrap || {};
  },

  /** 功能开关关闭的入口整块不渲染（到店 / 加钟 / 分销 / 动态各一块）。 */
  featureEnabled(key) {
    const data = this.globalData.bootstrap;
    return !!(data && data.features && data.features[key]);
  },

  hasToken() {
    return !!session.getToken();
  },
});
