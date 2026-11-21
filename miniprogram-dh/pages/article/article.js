/** 图文详情：article 渲染富文本，video 播视频，link 打开外部网页。 */
const api = require("../../utils/api");
const format = require("../../utils/format");

Page({
  data: {
    themeStyle: "",
    article: null,
    createdAt: "",
    loading: true,
    error: "",
  },

  onLoad(options) {
    this.id = Number(options.id || 0);
    this.setData({ themeStyle: getApp().globalData.themeStyle });
    this.load();
  },

  load() {
    if (!this.id) {
      this.setData({ loading: false, error: "文章不存在" });
      return;
    }
    api
      .article(this.id)
      .then((article) => {
        wx.setNavigationBarTitle({ title: article.title || "详情" });
        this.setData({
          article: article,
          createdAt: format.day(article.createdAt),
          loading: false,
        });
      })
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "加载失败" });
      });
  },

  openLink() {
    const link = this.data.article && this.data.article.link;
    if (!link) return;
    wx.navigateTo({
      url: "/pages/webview/webview?url=" + encodeURIComponent(link),
    });
  },
});
