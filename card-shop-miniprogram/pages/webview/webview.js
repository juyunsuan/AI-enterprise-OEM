/** 外链视图：只接受 https 地址；非 https 直接退回，避免 web-view 白屏。 */
Page({
  data: {
    url: "",
  },

  onLoad(query) {
    let url = "";
    try {
      url = decodeURIComponent(String(query.url || ""));
    } catch (e) {
      url = "";
    }
    if (!/^https:\/\//i.test(url)) {
      wx.showToast({ title: "链接无效", icon: "none" });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.setData({ url: url });
  },
});
