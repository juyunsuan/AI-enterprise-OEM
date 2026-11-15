const api = require("../../utils/api");
const session = require("../../utils/session");

function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success(res) {
        if (res && res.code) resolve(res.code);
        else reject(new Error(res && res.errMsg ? res.errMsg : "微信登录失败"));
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || "微信登录失败"));
      },
    });
  });
}

Page({
  data: {
    appName: "AIworkin",
    themeColor: "#3370ff",
    apiBase: "",
    username: "",
    password: "",
    showAccount: false,
    loading: false,
    message: "",
  },

  onLoad() {
    const app = getApp();
    wx.setNavigationBarColor({
      frontColor: "#ffffff",
      backgroundColor: app.globalData.bootstrap
        ? app.globalData.bootstrap.themeColor
        : "#3370ff",
    });
    this.setData({
      apiBase: session.getApiBase(),
      appName: app.bootstrap().appName || "AIworkin",
      themeColor: (app.bootstrap() && app.bootstrap().themeColor) || "#3370ff",
    });
  },

  onUsername(event) {
    this.setData({ username: event.detail.value });
  },
  onPassword(event) {
    this.setData({ password: event.detail.value });
  },
  onApiBase(event) {
    this.setData({ apiBase: event.detail.value });
  },

  onSaveApiBase() {
    const value = String(this.data.apiBase || "").trim();
    if (!value) {
      this.setData({ message: "请填写服务器地址" });
      return;
    }
    session.setApiBase(value);
    this.setData({ message: "已保存服务器地址" });
  },

  onWechatLogin() {
    if (this.data.loading) return;
    if (!session.getApiBase()) {
      this.setData({ message: "请先填写并保存服务器地址" });
      return;
    }
    this.setData({ loading: true, message: "" });
    let code = "";
    wxLogin()
      .then((value) => {
        code = value;
        return api.login({ code: value });
      })
      .then((result) => {
        if (result && result.bound && result.token) {
          session.setToken(result.token);
          session.setProfile(result.profile || null);
          this.enterApp();
          return;
        }
        this.setData({
          loading: false,
          showAccount: true,
          message: "该微信号尚未绑定账号，请用账号密码登录完成绑定。",
          pendingCode: code,
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          message: (error && error.message) || "登录失败",
        });
      });
  },

  onAccountLogin() {
    if (this.data.loading) return;
    const username = String(this.data.username || "").trim();
    const password = String(this.data.password || "");
    if (!username || !password) {
      this.setData({ message: "请填写账号与密码" });
      return;
    }
    this.setData({ loading: true, message: "" });
    let code = this.data.pendingCode || "";
    const ensureCode = code
      ? Promise.resolve(code)
      : wxLogin().then((value) => {
          code = value;
          return value;
        });
    ensureCode
      .then((value) =>
        api.login({ code: value, username: username, password: password }),
      )
      .then((result) => {
        if (!result || !result.token) {
          throw new Error(result && result.bound === false
            ? "绑定未完成，请稍后重试"
            : "登录失败");
        }
        session.setToken(result.token);
        session.setProfile(result.profile || null);
        this.enterApp();
      })
      .catch((error) => {
        this.setData({
          loading: false,
          message: (error && error.message) || "登录失败",
        });
      });
  },

  enterApp() {
    this.setData({ loading: false, message: "" });
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.switchTab({ url: "/pages/index/index" });
  },
});
