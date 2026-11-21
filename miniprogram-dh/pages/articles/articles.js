/** 图文栏目：help/notice/about/privacy/agreement 五类共用一张列表页。 */
const api = require("../../utils/api");
const format = require("../../utils/format");

const TITLES = {
  help: "使用教程",
  notice: "公告",
  about: "关于我们",
  privacy: "隐私政策",
  agreement: "用户协议",
};

Page({
  data: {
    themeStyle: "",
    title: "",
    list: [],
    loading: true,
    error: "",
  },

  onLoad(options) {
    this.type = String(options.type || "help");
    const title = TITLES[this.type] || "图文";
    wx.setNavigationBarTitle({ title: title });
    this.setData({ themeStyle: getApp().globalData.themeStyle, title: title });
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    return api
      .articles(this.type)
      .then((rows) => {
        this.setData({
          list: (rows || []).map((row) => ({
            id: row.id,
            title: row.title,
            cover: row.cover,
            summary: row.summary,
            contentType: row.contentType,
            createdAt: format.day(row.createdAt),
          })),
          loading: false,
          error: "",
        });
      })
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "加载失败" });
      });
  },

  open(event) {
    const id = event.currentTarget.dataset.id;
    const contentType = event.currentTarget.dataset.type;
    if (contentType === "link") {
      api
        .article(id)
        .then((article) => {
          if (!article || !article.link) {
            wx.showToast({ title: "链接暂不可用", icon: "none" });
            return;
          }
          wx.navigateTo({
            url: "/pages/webview/webview?url=" + encodeURIComponent(article.link),
          });
        })
        .catch(() => undefined);
      return;
    }
    wx.navigateTo({ url: "/pages/article/article?id=" + id });
  },
});
