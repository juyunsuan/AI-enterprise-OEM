const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

/** 公告列表：只拉 NOTICE；文章开关关掉时后端会拒，页面按开关先拦一层。 */
Page({
  data: {
    themeStyle: "",
    enabled: true,
    list: [],
    page: 1,
    pageSize: 20,
    loading: false,
    finished: false,
    error: "",
  },

  onLoad() {
    const app = getApp();
    this.setData({
      themeStyle: app.globalData.themeStyle,
      enabled: app.toggle("article"),
    });
    app.ensureReady().then(() => {
      this.setData({
        themeStyle: app.globalData.themeStyle,
        enabled: app.toggle("article"),
      });
      if (this.data.enabled) this.load(true);
    });
  },

  onPullDownRefresh() {
    if (!this.data.enabled) {
      wx.stopPullDownRefresh();
      return;
    }
    this.load(true).then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (!this.data.enabled || this.data.loading || this.data.finished) return;
    this.load();
  },

  load(reset) {
    const page = reset ? 1 : this.data.page + 1;
    this.setData({ loading: true, error: "" });
    return api
      .contents("NOTICE", page)
      .then((data) => {
        const list = ((data && data.list) || []).map((item) =>
          Object.assign({}, item, {
            createdText: format.dateTime(item.createdAt),
          }),
        );
        this.setData({
          list: reset ? list : this.data.list.concat(list),
          page: page,
          loading: false,
          finished: !data || list.length < this.data.pageSize,
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "公告加载失败",
        });
      });
  },

  openNotice(event) {
    wx.navigateTo({
      url: "/pages/article/detail?id=" + event.currentTarget.dataset.id + "&kind=NOTICE",
    });
  },
});
