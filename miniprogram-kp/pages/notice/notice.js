/**
 * 公告列表页：展示站点公告标题与时间，点击进入详情。
 */
const api = require("../../utils/api");
const format = require("../../utils/format");

const NOTICE_LIMIT = 50;

Page({
  data: {
    themeStyle: "",
    list: [],
    loading: true,
    error: "",
  },

  onLoad() {
    this.setData({ themeStyle: getApp().globalData.themeStyle });
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    return api
      .notices({ limit: NOTICE_LIMIT })
      .then((data) => {
        this.setData({
          list: ((data && data.list) || []).map((item) =>
            Object.assign({}, item, { dateText: format.dateText(item.createdAt) }),
          ),
          loading: false,
          error: "",
        });
      })
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "公告加载失败" });
      });
  },

  openItem(event) {
    wx.navigateTo({
      url: "/pages/notice-detail/notice-detail?id=" + event.currentTarget.dataset.id,
    });
  },
});
