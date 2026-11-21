const api = require("../../utils/api");
const format = require("../../utils/format");

Page({
  data: {
    loading: true,
    error: "",
    notReady: false,
    readyReason: "",
    articleId: 0,
    article: null,
    hasForm: false,
    pvText: "",
    timeText: "",
  },

  onLoad(options) {
    const articleId = Number((options && options.articleId) || 0);
    this.setData({ articleId: articleId });
    if (!articleId) {
      this.setData({ loading: false, error: "缺少文章标识" });
      return;
    }
    this.start();
  },

  start() {
    const app = getApp();
    app
      .ensureReady()
      .then((shop) => {
        if (!shop || !shop.shopCode) {
          this.setData({
            loading: false,
            notReady: true,
            readyReason: app.globalData.bootstrapError || "店铺尚未开通，请联系店铺方",
          });
          return null;
        }
        return this.load();
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "内容加载失败",
        });
      });
  },

  load() {
    this.setData({ loading: true, error: "" });
    const self = this;
    return api
      .articleDetail(this.data.articleId)
      .then((data) => {
        const fields = (data && data.fields) || [];
        const article = {
          id: data.id,
          title: data.title || "店铺资讯",
          summary: data.summary || "",
          content: data.content || "",
          cover: data.cover || "",
          formPurpose: data.formPurpose || "",
        };
        self.setData({
          loading: false,
          article: article,
          hasForm: !!(data.formEnabled && fields.length),
        });
        wx.setNavigationBarTitle({ title: article.title });
        self.enrich();
      })
      .catch((error) => {
        self.setData({
          loading: false,
          error: (error && error.message) || "内容加载失败",
        });
      });
  },

  /**
   * 文章详情不回 pv / createdAt（只有列表回），用一次列表查询补齐；
   * 不在前 20 条里就保持空白，不编造浏览数与发布时间。
   */
  enrich() {
    const self = this;
    api
      .articles({ page: 1, pageSize: 20 })
      .then((res) => {
        const list = (res && res.list) || [];
        for (let i = 0; i < list.length; i += 1) {
          if (Number(list[i].id) === self.data.articleId) {
            self.setData({
              pvText: list[i].pv ? "浏览 " + list[i].pv : "",
              timeText: list[i].createdAt ? format.dateTime(list[i].createdAt) : "",
            });
            return;
          }
        }
      })
      .catch(() => {
        // 补齐失败不影响正文
      });
  },

  previewCover() {
    const cover = this.data.article && this.data.article.cover;
    if (!cover) return;
    wx.previewImage({ current: cover, urls: [cover] });
  },

  openForm() {
    wx.navigateTo({
      url: "/consumer/form-submit/form-submit?articleId=" + this.data.articleId,
    });
  },

  onShareAppMessage() {
    const article = this.data.article || {};
    return {
      title: article.title || "店铺资讯",
      path: "/consumer/article/article?articleId=" + this.data.articleId,
    };
  },
});
