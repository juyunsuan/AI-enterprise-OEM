/**
 * 分类页：分类宫格 + 最新/热门/会员专区三个榜单入口。
 */
const api = require("../../utils/api");

const KIND_ENTRIES = [
  { kind: "new", title: "最新上线" },
  { kind: "hot", title: "热门推荐" },
  { kind: "vip", title: "会员专区" },
];

Page({
  data: {
    themeStyle: "",
    enabled: true,
    categories: [],
    entries: KIND_ENTRIES,
    loading: true,
    error: "",
  },

  onShow() {
    const app = getApp();
    this.setData({
      themeStyle: app.globalData.themeStyle,
      enabled: app.toggle("typePage"),
    });
    if (!this.data.enabled) return;
    app.ensureReady().then(() => {
      this.setData({ enabled: app.toggle("typePage") });
      this.load();
    });
  },

  onPullDownRefresh() {
    this.load(true).then(() => wx.stopPullDownRefresh());
  },

  load(force) {
    if (this.loadingPromise && !force) return this.loadingPromise;
    this.loadingPromise = api
      .categories()
      .then((data) => {
        this.setData({
          categories: (data && data.list) || [],
          loading: false,
          error: "",
        });
        this.loadingPromise = null;
      })
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "分类加载失败" });
        this.loadingPromise = null;
      });
    return this.loadingPromise;
  },

  openCategory(event) {
    const item = this.data.categories[event.currentTarget.dataset.index];
    if (!item) return;
    wx.navigateTo({
      url:
        "/pages/list/list?categoryId=" +
        item.id +
        "&title=" +
        encodeURIComponent(item.title || "分类"),
    });
  },

  openKind(event) {
    const item = this.data.entries[event.currentTarget.dataset.index];
    if (!item) return;
    wx.navigateTo({
      url: "/pages/list/list?kind=" + item.kind + "&title=" + encodeURIComponent(item.title),
    });
  },

  goNoticeList() {
    wx.navigateTo({ url: "/pages/notice/notice" });
  },

  goSearch() {
    wx.navigateTo({ url: "/pages/search/search" });
  },
});
