Page({
  data: {
    url: "",
    error: "",
  },

  onLoad(options) {
    const params = options || {};
    let url = "";
    let title = "";
    try {
      url = params.url ? decodeURIComponent(params.url) : "";
    } catch (error) {
      url = "";
    }
    try {
      title = params.title ? decodeURIComponent(params.title) : "";
    } catch (error) {
      title = "";
    }
    if (title) wx.setNavigationBarTitle({ title: title });
    if (!/^https?:\/\//i.test(url)) {
      this.setData({
        error: url ? "链接地址不受支持，请返回重试" : "缺少链接地址，请返回重试",
      });
      return;
    }
    this.setData({ url: url, error: "" });
  },
});
