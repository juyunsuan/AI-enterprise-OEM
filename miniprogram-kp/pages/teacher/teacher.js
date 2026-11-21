/**
 * 讲师主页：讲师档案 + 全部已上架课程。
 */
const api = require("../../utils/api");
const format = require("../../utils/format");

Page({
  data: {
    id: "",
    themeStyle: "",
    themeColor: "#3370ff",
    teacher: {},
    initial: "",
    courses: [],
    loading: true,
    error: "",
  },

  onLoad(query) {
    const app = getApp();
    this.setData({
      id: (query && query.id) || "",
      themeStyle: app.globalData.themeStyle,
      themeColor: app.globalData.themeColor,
    });
    this.load();
  },

  load() {
    if (!this.data.id) {
      this.setData({ loading: false, error: "缺少讲师参数" });
      return Promise.resolve();
    }
    return api
      .teacher({ id: this.data.id })
      .then((data) => {
        this.setData({
          teacher: data || {},
          initial: String((data && data.name) || "师").slice(0, 1),
          courses: format.decorateList((data && data.courses) || []),
          loading: false,
          error: "",
        });
        if (data && data.name) wx.setNavigationBarTitle({ title: data.name });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "讲师加载失败",
        });
      });
  },

  openCourse(event) {
    const item = this.data.courses[event.currentTarget.dataset.index];
    if (item) wx.navigateTo({ url: "/pages/details/details?id=" + item.id });
  },
});
