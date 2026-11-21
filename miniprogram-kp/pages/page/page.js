/**
 * 自定义单页：关于我们 / 用户协议 / 活动说明，正文按富文本渲染。
 */
const api = require("../../utils/api");

Page({
  data: {
    themeStyle: "",
    page: {},
    loading: true,
    error: "",
  },

  onLoad(query) {
    const app = getApp();
    this.setData({ themeStyle: app.globalData.themeStyle });
    const id = (query && query.id) || "";
    const slug = (query && query.slug) || "";
    this.load(id, slug);
  },

  load(id, slug) {
    return api
      .pageDetail({ id: id || undefined, slug: slug || undefined })
      .then((data) => {
        this.setData({ page: data || {}, loading: false, error: "" });
        if (data && data.title) wx.setNavigationBarTitle({ title: data.title });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "页面加载失败",
        });
      });
  },

  onShareAppMessage() {
    const page = this.data.page || {};
    return {
      title: page.title || getApp().globalData.siteName,
      path: "/pages/page/page?id=" + (page.id || ""),
    };
  },
});
