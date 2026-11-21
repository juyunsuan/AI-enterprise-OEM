const auth = require("../../utils/auth");

/**
 * 在线客服：绑定了 AI 客服服务站时用 web-view 打开会话（业务域名需在微信侧登记），
 * 否则回落店主联系方式名片。本页不含任何客服逻辑，会话都在 service-desk 侧。
 */
Page({
  data: {
    themeStyle: "",
    chatUrl: "",
    contact: null,
    hasContact: false,
    contactEnabled: true,
    orderNo: "",
    siteName: "",
  },

  onLoad(query) {
    const app = getApp();
    const entry = app.serviceEntry();
    const contact = entry.contact || {};
    const hasContact = !!(
      contact.phone ||
      contact.qq ||
      contact.wechat ||
      contact.email
    );
    this.setData({
      themeStyle: app.globalData.themeStyle,
      chatUrl: entry.url || "",
      contact: contact,
      hasContact: hasContact,
      contactEnabled: app.toggle("contact"),
      orderNo: String(query.orderNo || ""),
      siteName: app.globalData.siteName,
    });
    if (this.data.orderNo) {
      wx.setNavigationBarTitle({ title: "客服 · 订单咨询" });
    }
  },

  copy(event) {
    const value = String(event.currentTarget.dataset.value || "");
    if (!value) return;
    wx.setClipboardData({ data: value });
  },

  copyOrderNo() {
    if (!this.data.orderNo) return;
    wx.setClipboardData({ data: this.data.orderNo });
  },

  goQuery() {
    wx.navigateTo({ url: "/pages/query/query" });
  },

  onShareAppMessage() {
    return {
      title: this.data.siteName || "卡密商城",
      path: "/pages/index/index",
    };
  },
});
