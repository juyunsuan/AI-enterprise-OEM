const auth = require("../../utils/auth");
const session = require("../../utils/session");

/**
 * 兜底登录页：正常路径是端内静默登录，只有静默失败（未配凭据、域名未登记、网络异常）
 * 才会到这里，所以页面要把「为什么失败 + 下一步做什么」写清楚，而不是只摆一个按钮。
 */
Page({
  data: {
    appName: "",
    shopCode: "",
    apiBase: "",
    error: "",
    busy: false,
    misconfigured: false,
  },

  onLoad() {
    const app = getApp();
    app.ensureReady().then(() => {
      const bootstrap = app.bootstrap() || {};
      this.setData({
        appName: bootstrap.name || session.getAppName() || "商城",
        shopCode: session.getShopCode(),
        apiBase: session.getApiBase(),
        misconfigured: !session.getApiBase(),
      });
    });
  },

  retry() {
    this.setData({ busy: true, error: "" });
    auth
      .login()
      .then(() => {
        this.setData({ busy: false });
        wx.switchTab({ url: "/pages/index/index" });
      })
      .catch((error) => {
        this.setData({ busy: false, error: (error && error.message) || "登录失败，请稍后再试" });
      });
  },

  back() {
    wx.switchTab({ url: "/pages/index/index" });
  },
});
