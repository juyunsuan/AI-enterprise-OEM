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

  /** 启动配置只拉一次；失败时退化成「全部关闭」，避免白屏且不掩盖错误原因。 */
  loadBootstrap() {
    return api
      .bootstrap()
      .then((data) => {
        this.applyBootstrap(data);
        return data;
      })
      .catch((error) => {
        this.globalData.bootstrapError =
          (error && error.message) || "小程序服务不可用";
        this.applyBootstrap(null);
        return this.globalData.bootstrap;
      });
  },

  applyBootstrap(data) {
    const features = (data && data.features) || {};
    this.globalData.bootstrap = {
      enabled: !!(data && data.enabled),
      appName: (data && data.appName) || "AIworkin",
      siteDomain: (data && data.siteDomain) || "",
      themeColor: (data && data.themeColor) || "#3370ff",
      features: features,
    };
    wx.setNavigationBarColor({
      frontColor: "#ffffff",
      backgroundColor: this.globalData.bootstrap.themeColor,
    });
    wx.setNavigationBarTitle({ title: this.globalData.bootstrap.appName });
  },

  ensureReady() {
    if (!this.globalData.ready) {
      this.globalData.ready = this.loadBootstrap();
    }
    return this.globalData.ready;
  },

  bootstrap() {
    return this.globalData.bootstrap || { enabled: false, features: {} };
  },

  /** 功能开关关闭的入口在端上整个不渲染。 */
  featureEnabled(key) {
    const data = this.globalData.bootstrap;
    return !!(data && data.enabled && data.features && data.features[key]);
  },

  hasToken() {
    return !!session.getToken();
  },
});
