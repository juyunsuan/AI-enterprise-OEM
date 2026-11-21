const app = getApp();
const auth = require("../../utils/auth");
const session = require("../../utils/session");

Page({
  data: {
    loading: true,
    error: "",
    site: {},
    announcements: [],
    quickLinks: [],
    parkCode: "",
    deskEnabled: false,
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    app.reloadBootstrap().then(() => this.load());
  },

  load() {
    this.setData({
      loading: !app.globalData.bootstrap,
      error: "",
      parkCode: session.getParkCode(),
    });
    app
      .ensureReady()
      .then((data) => {
        if (!data) {
          this.setData({
            loading: false,
            error: app.globalData.error || "园区服务暂不可用",
          });
          return;
        }
        const site = data.site || {};
        this.setData({
          loading: false,
          site,
          announcements: (data.announcements || []).slice(0, 6),
          quickLinks: data.quickLinks || [],
          deskEnabled: Boolean(site.deskSiteKey),
        });
        auth.ensureLogin().catch(() => {});
        wx.stopPullDownRefresh();
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "园区服务暂不可用",
        });
      });
  },

  onCodeInput(event) {
    this.setData({ parkCode: event.detail.value });
  },

  saveCode() {
    const code = String(this.data.parkCode || "").trim();
    if (!code) {
      wx.showToast({ title: "请填写园区码", icon: "none" });
      return;
    }
    app.setParkCode(code).then(() => this.load());
  },

  go(event) {
    const path = event.currentTarget.dataset.path;
    if (path) wx.navigateTo({ url: path });
  },

  openAnnouncement(event) {
    const item = event.currentTarget.dataset.item;
    if (!item) return;
    const text = String(item.content || item.summary || "")
      .replace(/<[^>]+>/g, "")
      .slice(0, 800);
    wx.showModal({
      title: item.title,
      content: text || "暂无正文",
      showCancel: false,
    });
  },
});
