/**
 * 网页容器：装修里的 WEBVIEW 链接落在这里。
 * 只放行 https，域名必须在小程序后台登记过，否则微信会白屏；
 * 宁可停在提示页，也不摆一个打不开的容器给顾客。
 */
Page({
  data: {
    url: "",
    error: "",
  },

  onLoad(query) {
    let url = "";
    try {
      url = decodeURIComponent((query && query.url) || "");
    } catch (error) {
      url = String((query && query.url) || "");
    }
    if (!url) {
      this.setData({ error: "缺少页面地址" });
      return;
    }
    if (url.indexOf("https://") !== 0) {
      this.setData({ error: "只允许打开 https 页面，当前地址：" + url });
      return;
    }
    this.setData({ url: url });
    wx.setNavigationBarTitle({
      title: (query && query.title) || "详情",
    });
  },

  onShareAppMessage() {
    const market = getApp().bootstrap().market || {};
    return { title: market.name || "商城", path: "/pages/index/index" };
  },
});
