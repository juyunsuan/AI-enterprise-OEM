var api = require("../../utils/api");
var session = require("../../utils/session");

Page({
  data: {
    nickname: "",
    company: "",
    department: "",
    participantId: "",
    required: true,
    checkUser: false,
    approved: false,
    statusText: "",
    note: "",
    saving: false,
  },

  onLoad: function () {
    var profile = session.getProfile();
    var site = getApp().site();
    var settings = site.settings || {};
    this.setData({
      nickname: profile.nickname,
      company: profile.company,
      department: profile.department,
      participantId: profile.participantId,
      required: settings.registerRequired !== false || settings.checkUser === true,
      checkUser: settings.checkUser === true,
    });
    this.refreshStatus(profile);
  },

  refreshStatus: function (profile) {
    var that = this;
    api
      .bootstrap(session.getSiteCode(), profile.participantId)
      .then(function (data) {
        var viewer = (data && data.viewer) || null;
        var labels = { PENDING: "待审核", APPROVED: "已通过", REJECTED: "已驳回" };
        that.setData({
          viewer: viewer,
          approved: !!viewer && viewer.status === "APPROVED",
          statusText: viewer ? labels[viewer.status] || "待审核" : "未提交",
          note: (viewer && viewer.note) || "",
          nickname: (viewer && viewer.nickname) || that.data.nickname,
          company: (viewer && viewer.company) || that.data.company,
          department: (viewer && viewer.department) || that.data.department,
        });
      })
      .catch(function () {});
  },

  onInput: function (event) {
    var field = event.currentTarget.dataset.field;
    var patch = {};
    patch[field] = event.detail.value;
    this.setData(patch);
  },

  save: function () {
    if (this.data.saving) return;
    if (this.data.checkUser && this.data.approved) {
      wx.showToast({ title: "审核已通过，资料不可修改", icon: "none" });
      return;
    }
    var nickname = String(this.data.nickname || "").trim();
    if (this.data.required && !nickname) {
      wx.showToast({ title: "请填写昵称", icon: "none" });
      return;
    }
    var that = this;
    var profile = session.saveProfile({
      nickname: nickname,
      company: String(this.data.company || "").trim(),
      department: String(this.data.department || "").trim(),
    });
    var siteCode = session.getSiteCode();
    if (!siteCode) {
      wx.showToast({ title: "还没有配置站点码", icon: "none" });
      return;
    }
    this.setData({ saving: true });
    api
      .register(siteCode, {
        participantId: profile.participantId,
        nickname: profile.nickname,
        company: profile.company,
        department: profile.department,
      })
      .then(function (viewer) {
        var status = (viewer && viewer.status) || "PENDING";
        var labels = { PENDING: "已提交，等待审核", APPROVED: "已保存", REJECTED: "已驳回" };
        wx.showToast({ title: labels[status] || "已保存", icon: "none" });
        getApp().reload();
        that.setData({
          saving: false,
          viewer: viewer,
          approved: status === "APPROVED",
          statusText:
            status === "APPROVED" ? "已通过" : status === "REJECTED" ? "已驳回" : "待审核",
          note: (viewer && viewer.note) || "",
        });
        setTimeout(function () {
          wx.navigateBack({ delta: 1 });
        }, 700);
      })
      .catch(function (error) {
        that.setData({ saving: false });
        wx.showToast({
          title: (error && error.message) || "提交失败，请重试",
          icon: "none",
        });
      });
  },
});