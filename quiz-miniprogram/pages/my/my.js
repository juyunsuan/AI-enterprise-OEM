var session = require("../../utils/session");

Page({
  data: {
    site: {},
    profile: {},
    viewer: null,
    viewerStatus: "",
    initial: "答",
    aboutOpen: false,
    apiBase: "",
    siteCode: "",
  },

  onShow: function () {
    var profile = session.getProfile();
    var viewer = getApp().viewer ? getApp().viewer() : null;
    var labels = { PENDING: "待审核", APPROVED: "已通过", REJECTED: "已驳回" };
    this.setData({
      site: getApp().site(),
      profile: profile,
      viewer: viewer,
      viewerStatus: viewer ? labels[viewer.status] || "待审核" : "",
      initial: (profile.nickname || "答").slice(0, 1),
      apiBase: session.getApiBase(),
      siteCode: session.getSiteCode(),
    });
  },

  goProfile: function () {
    wx.navigateTo({ url: "/pages/profile/profile" });
  },

  ensureApproved: function () {
    var site = this.data.site || {};
    if (!site.settings || !site.settings.checkUser) return true;
    if (this.data.viewer && this.data.viewer.status === "APPROVED") return true;
    wx.showModal({
      title: "尚未通过审核",
      content: "审核通过后才能查看答题记录与错题本。",
      showCancel: false,
    });
    return false;
  },

  goRecord: function () {
    if (!this.ensureApproved()) return;
    wx.navigateTo({ url: "/pages/record/record" });
  },

  goWrong: function () {
    if (!this.ensureApproved()) return;
    wx.navigateTo({ url: "/pages/wrong/wrong" });
  },

  goMaterials: function () {
    wx.navigateTo({ url: "/pages/materials/materials" });
  },

  goService: function () {
    if (!this.data.site.deskSiteKey) {
      wx.showToast({ title: "管理员还没有绑定 AI 客服", icon: "none" });
      return;
    }
    wx.navigateTo({ url: "/pages/service/service" });
  },

  goHome: function () {
    wx.switchTab({ url: "/pages/index/index" });
  },

  toggleAbout: function () {
    this.setData({ aboutOpen: !this.data.aboutOpen });
  },

  onShareAppMessage: function () {
    return {
      title: (this.data.site.name || "智汇答题") + "，一起来答题",
      path: "/pages/index/index",
    };
  },
});