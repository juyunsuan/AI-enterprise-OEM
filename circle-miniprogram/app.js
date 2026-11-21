var api = require("./utils/api");
var auth = require("./utils/auth");

App({
  globalData: {
    bootstrap: null,
    bootstrapError: "",
    viewer: null
  },

  onLaunch: function (options) {
    this.applyEntryCode(options);
    this.globalData.ready = this.loadBootstrap();
    this.globalData.ready.then(function () {
      auth.ensureLogin().catch(function () {});
    });
  },

  /** 分享链接/扫码带 community 码时写入本地，便于本地调试与跨环境预览。 */
  applyEntryCode: function (options) {
    var query = (options && options.query) || {};
    var scene = String((options && options.scene) || "");
    try {
      scene = decodeURIComponent(scene);
    } catch (error) {
      scene = "";
    }
    var code = String(query.community || query.code || scene || "").trim().toUpperCase();
    if (/^[0-9A-Z]{6,16}$/.test(code)) {
      wx.setStorageSync("circle_community_code", code);
    }
  },

  loadBootstrap: function () {
    var that = this;
    return api
      .bootstrap()
      .then(function (data) {
        that.globalData.bootstrap = data;
        that.globalData.viewer = data.viewer || null;
        wx.setNavigationBarTitle({ title: (data.community && data.community.name) || "圈子社区" });
        return data;
      })
      .catch(function (error) {
        that.globalData.bootstrapError = (error && error.message) || "社区服务暂不可用";
        return null;
      });
  }
});