/**
 * 精选推荐页：/links 给的编辑精选条目，按 link 协议决定站内跳转还是外跳。
 */
const api = require("../../utils/api");
const linkHelper = require("../../utils/link");

Page({
  data: {
    themeStyle: "",
    list: [],
    loading: true,
    error: "",
  },

  onLoad(query) {
    const app = getApp();
    this.setData({ themeStyle: app.globalData.themeStyle });
    wx.setNavigationBarTitle({
      title:
        query && query.title
          ? decodeURIComponent(query.title)
          : app.configValue("moreTitle", "更多推荐"),
    });
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    return api
      .links()
      .then((data) => {
        this.setData({
          list: (data && data.list) || [],
          loading: false,
          error: "",
        });
      })
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "推荐内容加载失败" });
      });
  },

  openItem(event) {
    const item = this.data.list[event.currentTarget.dataset.index];
    if (!item) return;
    // link 为空时退化成「看详情」，避免点下去毫无反应。
    if (item.link) linkHelper.open(item.link);
    else wx.showToast({ title: "该条目暂未配置链接", icon: "none" });
  },
});
