const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const session = require("../../utils/session");

Page({
  data: {
    loggedIn: false,
    checking: true,
    enabled: false,
    siteDomain: "",
    recordCount: 0,
    latestTitle: "",
    latestTime: "",
  },

  onShow() {
    const app = getApp();
    const loggedIn = !!session.getToken();
    this.setData({
      loggedIn: loggedIn,
      checking: true,
      siteDomain: app.bootstrap().siteDomain || "",
    });
    if (!loggedIn) {
      this.setData({ checking: false });
      return;
    }
    app.ensureReady().then(() => {
      const bootstrap = app.bootstrap();
      const enabled = app.featureEnabled("annualReport");
      this.setData({
        checking: false,
        enabled: enabled,
        siteDomain: bootstrap.siteDomain || "",
      });
      if (enabled) this.loadSummary();
    });
  },

  loadSummary() {
    return api
      .annualReportRecords()
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        const latest = list[0] || null;
        this.setData({
          recordCount: list.length,
          latestTitle: latest ? latest.title : "",
          latestTime: latest ? format.dateTime(latest.createdAt) : "",
        });
      })
      .catch(() => {
        // 首页摘要失败不阻断办理入口，进入记录页时会再次请求并提示原因。
      });
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/login" });
  },

  goForm() {
    if (!auth.ensureLogin()) return;
    wx.navigateTo({ url: "/pages/annual-report-form/annual-report-form" });
  },

  goRecords() {
    if (!auth.ensureLogin()) return;
    wx.navigateTo({ url: "/pages/annual-report-records/annual-report-records" });
  },

  goGuide(event) {
    const type = event.currentTarget.dataset.type || "annual";
    wx.navigateTo({
      url: "/pages/annual-report-guide/annual-report-guide?type=" + type,
    });
  },

  copyOfficial() {
    wx.setClipboardData({
      data: "https://www.gsxt.gov.cn",
      success: () => wx.showToast({ title: "官方网址已复制", icon: "success" }),
    });
  },

  copyWeb() {
    const base = String(
      this.data.siteDomain || session.getApiBase() || "",
    ).replace(/\/+$/, "");
    if (!base) {
      wx.showToast({ title: "请先在「我的」配置服务器地址", icon: "none" });
      return;
    }
    wx.setClipboardData({
      data: base + "/tax",
      success: () =>
        wx.showToast({ title: "网页端地址已复制", icon: "success" }),
    });
  },
});
