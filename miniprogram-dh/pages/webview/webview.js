/** 外链页：客服会话、轮播外链、图文链接统一走这里，只放行 https。 */
Page({
  data: { url: "" },

  onLoad(options) {
    const url = decodeURIComponent(String(options.url || ""));
    if (!/^https:\/\//i.test(url)) {
      wx.showToast({ title: "链接无效", icon: "none" });
      setTimeout(() => wx.navigateBack({ fail() {} }), 800);
      return;
    }
    this.setData({ url: url });
  },
});
