/**
 * 发现页：运营配置的导航入口 + 讲师列表，站点开关 faxianPage 控制整页可用。
 */
const api = require("../../utils/api");
const linkHelper = require("../../utils/link");

Page({
  data: {
    themeStyle: "",
    themeColor: "#3370ff",
    siteName: "",
    navs: [],
    teachers: [],
    enabled: true,
    loading: true,
    error: "",
  },

  onShow() {
    const app = getApp();
    this.setData({
      themeStyle: app.globalData.themeStyle,
      themeColor: app.globalData.themeColor,
      siteName: app.globalData.siteName,
      enabled: app.toggle("faxianPage"),
    });
    app.ensureReady().then(() => {
      const enabled = app.toggle("faxianPage");
      this.setData({ enabled });
      if (enabled) this.load();
      else this.setData({ loading: false, navs: [], teachers: [] });
    });
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    return Promise.all([
      api.navs().catch(() => ({ list: [] })),
      api.teachers().catch(() => ({ list: [] })),
    ]).then(([navData, teacherData]) => {
      this.setData({
        navs: ((navData && navData.list) || []).map((item) =>
          Object.assign({}, item, {
            initial: String(item.title || "发").slice(0, 1),
          }),
        ),
        teachers: ((teacherData && teacherData.list) || []).map((item) =>
          Object.assign({}, item, {
            initial: String(item.name || "师").slice(0, 1),
          }),
        ),
        loading: false,
        error: "",
      });
    });
  },

  onNavTap(event) {
    const item = this.data.navs[event.currentTarget.dataset.index];
    if (item) linkHelper.open(item.link);
  },

  openTeacher(event) {
    const item = this.data.teachers[event.currentTarget.dataset.index];
    if (item) wx.navigateTo({ url: "/pages/teacher/teacher?id=" + item.id });
  },

  goSearch() {
    wx.navigateTo({ url: "/pages/search/search" });
  },
});
