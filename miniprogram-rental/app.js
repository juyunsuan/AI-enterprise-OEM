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

  loadBootstrap() {
    return api
      .bootstrap({ shopCode: session.getShopCode() })
      .then((data) => {
        this.applyBootstrap(data);
        return data;
      })
      .catch((error) => {
        this.globalData.bootstrapError =
          (error && error.message) || "门店服务暂不可用";
        return null;
      });
  },

  applyBootstrap(data) {
    const themeColor = (data && data.themeColor) || "#3370ff";
    this.globalData.bootstrap = data || null;
    wx.setNavigationBarColor({ frontColor: "#ffffff", backgroundColor: themeColor });
    wx.setNavigationBarTitle({
      title: (data && (data.navigationTitle || data.shopName)) || "租赁管理",
    });
  },

  ensureReady() {
    if (!this.globalData.ready) this.globalData.ready = this.loadBootstrap();
    return this.globalData.ready;
  },

  bootstrap() {
    return this.globalData.bootstrap || {};
  },

  hasToken() {
    return !!session.getToken();
  },
});