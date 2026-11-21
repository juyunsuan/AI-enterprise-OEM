/**
 * 我的学习：按课程展示最近进度，点卡片直接回到上次学习的课时。
 */
const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

Page({
  data: {
    themeStyle: "",
    themeColor: "#3370ff",
    list: [],
    loading: true,
    loginFailed: false,
    error: "",
  },

  onShow() {
    const app = getApp();
    this.setData({
      themeStyle: app.globalData.themeStyle,
      themeColor: app.globalData.themeColor,
    });
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    this.setData({ loading: true, error: "" });
    return auth
      .ensureMember()
      .then(() => api.myLearning({ page: 1, pageSize: 50 }))
      .then((data) => {
        const list = ((data && data.list) || []).map((item) =>
          Object.assign({}, item, {
            updatedText: format.dateTime(item.updatedAt),
            percentText: (item.percent || 0) + "%",
          }),
        );
        this.setData({ list: list, loading: false, loginFailed: false });
      })
      .catch((error) => {
        this.setData({ loading: false, loginFailed: true });
        auth.showError(error);
      });
  },

  openItem(event) {
    const item = this.data.list[event.currentTarget.dataset.index];
    if (!item) return;
    if (item.lastLessonId) {
      wx.navigateTo({
        url: "/pages/learn/learn?id=" + item.resourceId + "&lessonId=" + item.lastLessonId,
      });
      return;
    }
    wx.navigateTo({ url: "/pages/details/details?id=" + item.resourceId });
  },

  goHome() {
    wx.switchTab({ url: "/pages/index/index" });
  },

  retryLogin() {
    auth
      .login()
      .then(() => this.load())
      .catch((error) => auth.showError(error));
  },
});
