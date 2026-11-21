/**
 * 公告详情页：标题 + 时间 + 富文本正文。
 */
const api = require("../../utils/api");
const format = require("../../utils/format");

Page({
  data: {
    themeStyle: "",
    detail: { title: "", content: "", dateText: "" },
    loading: true,
    error: "",
  },

  onLoad(query) {
    this.setData({ themeStyle: getApp().globalData.themeStyle });
    if (!query || !query.id) {
      this.setData({ loading: false, error: "缺少公告参数" });
      return;
    }
    api
      .notice({ id: query.id })
      .then((data) => {
        const info = data || {};
        this.setData({
          detail: {
            title: info.title || "",
            // 后端正文是富文本 HTML，rich-text 直接吃字符串，省掉解析。
            content: info.content || "",
            dateText: format.dateTime(info.createdAt),
          },
          loading: false,
          error: "",
        });
        if (info.title) wx.setNavigationBarTitle({ title: info.title });
      })
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "公告加载失败" });
      });
  },
});
