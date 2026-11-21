/**
 * 外链承载页：用 web-view 打开站外网页，域名未配置业务域名时给出可操作的提示。
 */
Page({
  data: {
    src: "",
    host: "",
    valid: false,
    failed: false,
    message: "",
  },

  onLoad(query) {
    const raw = (query && query.url) || "";
    const url = decodeURIComponent(raw);
    // web-view 只接受 http(s) 绝对地址：拦掉空值与 javascript: 之类的脏数据。
    const matched = /^(https?):\/\/([^/?#]+)/i.exec(url);
    if (!matched) {
      this.setData({
        valid: false,
        message: url ? "链接格式不正确，无法打开" : "缺少链接参数",
      });
      return;
    }
    this.setData({ src: url, host: matched[2], valid: true, failed: false });
    if (query && query.title) {
      wx.setNavigationBarTitle({ title: decodeURIComponent(query.title) });
    }
  },

  /** web-view 加载失败最常见的原因是域名没在小程序后台配成业务域名，这里把结论直说。 */
  onError() {
    this.setData({ failed: true });
  },

  copyLink() {
    wx.setClipboardData({
      data: this.data.src,
      success() {
        wx.showToast({ title: "链接已复制", icon: "none" });
      },
    });
  },

  goHome() {
    wx.switchTab({ url: "/pages/index/index" });
  },
});
