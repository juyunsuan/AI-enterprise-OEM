const api = require("./utils/api");
const auth = require("./utils/auth");
const session = require("./utils/session");

App({
  globalData: {
    bootstrap: null,
    error: "",
    ready: null,
  },

  onLaunch() {
    this.globalData.ready = this.loadBootstrap();
    this.globalData.ready.then(() => {
      auth.ensureLogin().catch(() => {});
    });
  },

  loadBootstrap() {
    return api
      .bootstrap()
      .then((data) => {
        this.applyBootstrap(data);
        return data;
      })
      .catch((error) => {
        this.globalData.error =
          (error && error.message) || "园区服务暂不可用";
        this.globalData.bootstrap = null;
        return null;
      });
  },

  applyBootstrap(data) {
    const value = data || {};
    const site = value.site || {};
    this.globalData.bootstrap = value;
    this.globalData.error = "";
    try {
      wx.setNavigationBarColor({
        frontColor: "#ffffff",
        backgroundColor: site.themeColor || session.themeColor || "#3370FF",
      });
      wx.setNavigationBarTitle({
        title: site.name || session.appName || "园区服务",
      });
    } catch (error) {
      // 启动阶段页面尚未就绪时忽略；页面 onShow 会再次应用。
    }
  },

  ensureReady() {
    if (!this.globalData.ready) this.globalData.ready = this.loadBootstrap();
    return this.globalData.ready;
  },

  reloadBootstrap() {
    this.globalData.bootstrap = null;
    this.globalData.error = "";
    this.globalData.ready = this.loadBootstrap();
    return this.globalData.ready;
  },

  bootstrap() {
    return this.globalData.bootstrap || {};
  },

  setParkCode(code) {
    session.setParkCode(code);
    session.clear();
    session.clearStaff();
    return this.reloadBootstrap();
  },

  hasToken() {
    return Boolean(session.getToken());
  },

  hasStaffToken() {
    return Boolean(session.getStaffToken());
  },
});
