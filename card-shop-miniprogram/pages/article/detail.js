const api = require("../../utils/api");
const format = require("../../utils/format");

/** 内容详情：公告 / 资讯 / 单页共用；正文是后端下发的富文本子集。 */
Page({
  data: {
    themeStyle: "",
    id: 0,
    kind: "ARTICLE",
    item: null,
    loading: true,
    error: "",
  },

  onLoad(query) {
    const app = getApp();
    this.setData({
      themeStyle: app.globalData.themeStyle,
      id: Number(query.id || 0),
      kind: String(query.kind || "ARTICLE"),
    });
    app.ensureReady().then(() => {
      this.setData({ themeStyle: app.globalData.themeStyle });
      this.load();
    });
  },

  load() {
    if (!this.data.id) {
      this.setData({ loading: false, error: "内容不存在或已下架" });
      return;
    }
    this.setData({ loading: true, error: "" });
    api
      .content(this.data.id)
      .then((data) => {
        if (!data) {
          this.setData({ loading: false, error: "内容不存在或已下架" });
          return;
        }
        this.setData({
          loading: false,
          item: Object.assign({}, data, {
            createdText: format.dateTime(data.createdAt),
          }),
        });
        wx.setNavigationBarTitle({ title: data.title || "详情" });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "内容加载失败",
        });
      });
  },

  previewImage(event) {
    const images = (this.data.item && this.data.item.images) || [];
    if (!images.length) return;
    wx.previewImage({ current: event.currentTarget.dataset.url, urls: images });
  },

  onShareAppMessage() {
    const item = this.data.item;
    return {
      title: (item && item.title) || getApp().globalData.siteName,
      path: "/pages/article/detail?id=" + this.data.id,
    };
  },
});
