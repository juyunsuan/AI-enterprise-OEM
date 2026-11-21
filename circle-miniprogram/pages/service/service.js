var session = require("../../utils/session");

Page({
  data: { url: "", community: null, failed: false },

  onLoad: function () {
    var app = getApp();
    var community = (app.globalData.bootstrap && app.globalData.bootstrap.community) || {};
    var key = community.deskSiteKey || session.deskSiteKey || "";
    var base = session.getApiBase();
    this.setData({
      community: community,
      url: key && base ? base + "/embed/service-desk?key=" + encodeURIComponent(key) : ""
    });
  },

  onWebError: function () {
    this.setData({ failed: true });
  },

  copyPhone: function () {
    var phone = (this.data.community && this.data.community.servicePhone) || "";
    if (!phone) return;
    wx.setClipboardData({ data: phone });
  },

  copyWechat: function () {
    var wechat = (this.data.community && this.data.community.serviceWechat) || "";
    if (!wechat) return;
    wx.setClipboardData({ data: wechat });
  }
});