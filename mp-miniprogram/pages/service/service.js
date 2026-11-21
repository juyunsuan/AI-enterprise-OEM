const navigate = require("../../utils/navigate");

Page({
  data: {
    chatUrl: "",
    orderNo: "",
    shopName: "",
    marketName: "",
  },

  onLoad(query) {
    const options = query || {};
    let url = "";
    try {
      url = decodeURIComponent(options.url || "");
    } catch (error) {
      url = String(options.url || "");
    }
    if (!url) {
      const entry = getApp().serviceEntry();
      // 会话上下文拼进 ctx，AI 客服侧能据此把顾客导到对应店铺/订单
      const context = [];
      if (options.shopName) context.push("小程序·店铺:" + options.shopName);
      if (options.orderNo) context.push("订单号:" + options.orderNo);
      if (entry.url) {
        url =
          entry.url +
          (entry.url.indexOf("?") >= 0 ? "&" : "?") +
          "ctx=" +
          encodeURIComponent(context.join(" ") || "小程序咨询");
      }
    }
    if (url && url.indexOf("https://") !== 0) {
      url = "";
      wx.showToast({ title: "客服链接必须是 https 地址", icon: "none" });
    }
    const entry = getApp().serviceEntry();
    this.setData({
      chatUrl: url,
      orderNo: String(options.orderNo || ""),
      shopName: String(options.shopName || ""),
      marketName: entry.marketName || "市场",
    });
    if (this.data.orderNo) {
      wx.setNavigationBarTitle({ title: "客服 · 订单咨询" });
    }
  },

  copyOrderNo() {
    if (!this.data.orderNo) return;
    wx.setClipboardData({ data: this.data.orderNo, fail: function () {} });
  },

  goOrders() {
    navigate.push("/pages/orders/orders?status=");
  },

  goShopping() {
    wx.switchTab({ url: "/pages/index/index" });
  },

  onShareAppMessage() {
    return {
      title: this.data.marketName || "商城",
      path: "/pages/index/index",
    };
  },
});
