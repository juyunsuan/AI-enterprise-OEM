const api = require("../../utils/api");
const diy = require("../../utils/diy-render");

/** 活动页：按页面 id 取已发布快照渲染（装修里的专题页跳转就落在这里）。 */
Page({
  data: { pageId: 0, blocks: [], ctx: {}, pageStyle: "", title: "", error: "", loading: true },

  onLoad(query) {
    const id = Number((query && query.id) || 0);
    const app = getApp();
    this.setData({ pageId: id });
    if (!id) {
      this.setData({ loading: false, error: "缺少活动页 id" });
      return;
    }
    app.ensureReady().then(() => {
      this.setData({ ctx: diy.buildCtx(app.bootstrap(), "ACTIVITY") });
      this.load();
    });
  },

  load() {
    return api
      .diyPage(this.data.pageId)
      .then((page) => {
        if (!page) throw new Error("活动页不存在或未发布");
        this.setData({
          title: page.name || "活动专题",
          blocks: diy.normalizeComponents(page.components),
          pageStyle: diy.pageStyle(page.styles),
          loading: false,
          error: "",
        });
        if (page.name) wx.setNavigationBarTitle({ title: page.name });
      })
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "活动页加载失败" });
      });
  },

  onPullDownRefresh() {
    if (!this.data.pageId) {
      wx.stopPullDownRefresh();
      return;
    }
    this.load().then(() => wx.stopPullDownRefresh());
  },

  onShareAppMessage() {
    return {
      title: this.data.title || getApp().bootstrap().name || "商城活动",
      path: "/pages/diy/page?id=" + this.data.pageId,
    };
  },
});
