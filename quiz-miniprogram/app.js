var api = require("./utils/api");
var session = require("./utils/session");

App({
  globalData: {
    bootstrap: null,
    bootstrapError: "",
    viewer: null,
    ready: null,
  },

  onLaunch: function () {
    session.getProfile();
    this.globalData.ready = this.loadBootstrap();
  },

  loadBootstrap: function () {
    var that = this;
    var code = session.getSiteCode();
    if (!code) {
      this.globalData.bootstrapError = "还没有配置站点码";
      return Promise.resolve(null);
    }
    return api
      .bootstrap(code, session.getProfile().participantId)
      .then(function (data) {
        that.applyBootstrap(data);
        return data;
      })
      .catch(function (error) {
        that.globalData.bootstrapError =
          (error && error.message) || "答题服务暂不可用";
        return null;
      });
  },

  applyBootstrap: function (data) {
    this.globalData.bootstrap = data || null;
    this.globalData.viewer = (data && data.viewer) || null;
    var site = (data && data.site) || {};
    var color = site.themeColor || session.themeColor || "#1bd0ad";
    wx.setNavigationBarColor({ frontColor: "#ffffff", backgroundColor: color });
    wx.setNavigationBarTitle({ title: site.name || session.siteName || "智汇答题" });
  },

  ensureReady: function () {
    if (!this.globalData.ready) this.globalData.ready = this.loadBootstrap();
    return this.globalData.ready;
  },

  reload: function () {
    this.globalData.ready = this.loadBootstrap();
    return this.globalData.ready;
  },

  bootstrap: function () {
    return this.globalData.bootstrap || {};
  },

  site: function () {
    var data = this.globalData.bootstrap || {};
    return data.site || {};
  },

  viewer: function () {
    return this.globalData.viewer || null;
  },

  feature: function (key) {
    var site = this.site();
    var settings = site.settings || {};
    return settings[key] !== false;
  },
});