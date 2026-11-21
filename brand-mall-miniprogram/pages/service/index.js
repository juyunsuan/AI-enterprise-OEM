const diy = require("../../utils/diy-render");

/**
 * 在线客服：绑定了 AI 客服站点时用 web-view 打开会话（业务域名需在微信侧登记），
 * 未绑定或站点停用时回落客服电话。本页不含任何客服逻辑，会话都在 service-desk 侧。
 */
Page({
  data: {
    themeColor: "#fa3534",
    chatUrl: "",
    phone: "",
    hasPhone: false,
    orderNo: "",
    shopName: "",
  },

  onLoad(query) {
    const app = getApp();
    app.ensureReady().then(() => {
      const entry = app.serviceEntry();
      const bootstrap = app.bootstrap();
      this.setData({
        themeColor: diy.buildCtx(bootstrap, "SERVICE").themeColor,
        chatUrl: entry.url || "",
        phone: entry.phone || "",
        hasPhone: !!entry.phone,
        orderNo: String(query.orderNo || ""),
        shopName: bootstrap.name || "商城",
      });
      if (this.data.orderNo) {
        wx.setNavigationBarTitle({ title: "客服 · 订单咨询" });
      }
    });
  },

  callPhone() {
    if (!this.data.phone) {
      wx.showToast({ title: "商家未填写客服电话", icon: "none" });
      return;
    }
    wx.makePhoneCall({ phoneNumber: this.data.phone, fail() {} });
  },

  copyPhone() {
    if (!this.data.phone) return;
    wx.setClipboardData({ data: this.data.phone, fail() {} });
  },

  copyOrderNo() {
    if (!this.data.orderNo) return;
    wx.setClipboardData({ data: this.data.orderNo, fail() {} });
  },

  goOrders() {
    wx.navigateTo({ url: "/pages/order/list?status=ALL" });
  },

  goHome() {
    wx.switchTab({ url: "/pages/index/index" });
  },

  onShareAppMessage() {
    return {
      title: this.data.shopName || "商城",
      path: "/pages/index/index",
    };
  },
});
