Page({
  data: {
    url: "",
    host: "",
  },

  onLoad(options) {
    let url = "";
    let title = "";
    try {
      url = decodeURIComponent((options && options.url) || "");
      title = decodeURIComponent((options && options.title) || "");
    } catch (e) {
      url = "";
      title = "";
    }
    const valid = /^https?:\/\//i.test(url);
    const host = valid ? url.replace(/^https?:\/\//i, "").split("/")[0] : "";
    this.setData({ url: valid ? url : "", host });
    wx.setNavigationBarTitle({ title: title || host || "网页" });
  },
});
