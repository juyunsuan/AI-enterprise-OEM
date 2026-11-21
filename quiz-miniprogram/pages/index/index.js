var api = require("../../utils/api");
var session = require("../../utils/session");

Page({
  data: {
    loading: true,
    error: "",
    site: { settings: {} },
    banks: [],
    profile: {},
    viewer: null,
    viewerStatus: "",
    needSetup: false,
    showSetup: false,
    setupApiBase: "",
    setupSiteCode: "",
  },

  onShow: function () {
    this.setData({
      profile: session.getProfile(),
      setupApiBase: session.getApiBase(),
      setupSiteCode: session.getSiteCode(),
    });
    this.load();
  },

  onPullDownRefresh: function () {
    var that = this;
    Promise.resolve(this.load()).then(function () {
      wx.stopPullDownRefresh();
      that.setData({ loading: false });
    });
  },

  load: function () {
    var that = this;
    var code = session.getSiteCode();
    if (!code) {
      this.setData({ loading: false, needSetup: true, showSetup: true, error: "" });
      return Promise.resolve();
    }
    this.setData({ loading: true, error: "" });
    return getApp()
      .ensureReady()
      .then(function (data) {
        if (data) return data;
        return api.bootstrap(code, session.getProfile().participantId);
      })
      .then(function (data) {
        var site = (data && data.site) || {};
        var banks = (data && data.banks) || [];
        var viewer = (data && data.viewer) || null;
        var labels = { PENDING: "待审核", APPROVED: "已通过", REJECTED: "已驳回" };
        that.setData({
          loading: false,
          site: site,
          banks: banks,
          viewer: viewer,
          viewerStatus: viewer ? labels[viewer.status] || "待审核" : "未提交",
          needSetup: false,
          error: "",
        });
        if (banks.length) session.setLastBank(banks[0].code);
      })
      .catch(function (error) {
        that.setData({
          loading: false,
          error: (error && error.message) || "答题服务加载失败",
          showSetup: !getApp().bootstrap().site,
        });
      });
  },

  onSetupInput: function (event) {
    var field = event.currentTarget.dataset.field;
    var patch = {};
    patch[field] = event.detail.value;
    this.setData(patch);
  },

  saveSetup: function () {
    var base = String(this.data.setupApiBase || "").trim();
    var code = String(this.data.setupSiteCode || "").trim();
    if (!base || !code) {
      wx.showToast({ title: "请填写服务器地址和站点码", icon: "none" });
      return;
    }
    session.setApiBase(base);
    session.setSiteCode(code);
    this.setData({ showSetup: false, loading: true, error: "" });
    var that = this;
    getApp()
      .reload()
      .then(function () {
        that.load();
      });
  },

  toggleSetup: function () {
    this.setData({ showSetup: !this.data.showSetup });
  },

  ensureProfile: function () {
    var site = this.data.site || {};
    var settings = site.settings || {};
    var profile = session.getProfile();
    var that = this;
    if (settings.registerRequired !== false && !profile.nickname) {
      wx.navigateTo({ url: "/pages/profile/profile" });
      return false;
    }
    if (settings.checkUser) {
      var viewer = this.data.viewer;
      if (!viewer) {
        wx.showModal({
          title: "需要参赛资料",
          content: "本站开启审核制，请先提交参赛资料。",
          showCancel: false,
          success: function () {
            that.goProfile();
          },
        });
        return false;
      }
      if (viewer.status === "REJECTED") {
        wx.showModal({
          title: "资料已驳回",
          content: viewer.note || "请修改资料后重新提交。",
          confirmText: "去修改",
          success: function (res) {
            if (res.confirm) that.goProfile();
          },
        });
        return false;
      }
      if (viewer.status !== "APPROVED") {
        wx.showModal({
          title: "资料待审核",
          content: "管理员审核通过后才能开始练习或考试。",
          showCancel: false,
        });
        return false;
      }
    }
    return true;
  },

  goPractice: function (event) {
    if (!this.ensureProfile()) return;
    var bankCode = event.currentTarget.dataset.code;
    var bankTitle = event.currentTarget.dataset.title || "";
    session.setLastBank(bankCode);
    wx.navigateTo({
      url:
        "/pages/quiz/quiz?bankCode=" + bankCode +
        "&mode=practice&title=" + encodeURIComponent(bankTitle),
    });
  },

  goExam: function (event) {
    if (!this.ensureProfile()) return;
    var bankCode = event.currentTarget.dataset.code;
    var bankTitle = event.currentTarget.dataset.title || "";
    session.setLastBank(bankCode);
    wx.navigateTo({
      url:
        "/pages/quiz/quiz?bankCode=" + bankCode +
        "&mode=exam&title=" + encodeURIComponent(bankTitle),
    });
  },

  currentBankCode: function () {
    var banks = this.data.banks || [];
    var last = session.getLastBank();
    for (var i = 0; i < banks.length; i += 1) {
      if (banks[i].code === last) return last;
    }
    return banks.length ? banks[0].code : "";
  },

  ensureApproved: function () {
    var settings = (this.data.site && this.data.site.settings) || {};
    if (!settings.checkUser) return true;
    if (this.data.viewer && this.data.viewer.status === "APPROVED") return true;
    wx.showModal({
      title: "尚未通过审核",
      content: "审核通过后才能查看答题记录与错题本。",
      showCancel: false,
    });
    return false;
  },

  goWrong: function () {
    if (!this.ensureApproved()) return;
    var code = this.currentBankCode();
    if (!code) return wx.showToast({ title: "还没有可答的题库", icon: "none" });
    wx.navigateTo({ url: "/pages/wrong/wrong?bankCode=" + code });
  },

  goRank: function () {
    wx.switchTab({ url: "/pages/rank/rank" });
  },

  goRecord: function () {
    if (!this.ensureApproved()) return;
    var code = this.currentBankCode();
    if (!code) return wx.showToast({ title: "还没有可答的题库", icon: "none" });
    wx.navigateTo({ url: "/pages/record/record?bankCode=" + code });
  },

  goMaterials: function () {
    wx.navigateTo({ url: "/pages/materials/materials" });
  },

  goService: function () {
    var site = this.data.site || {};
    if (!site.deskSiteKey) {
      wx.showToast({ title: "管理员还没有绑定 AI 客服", icon: "none" });
      return;
    }
    wx.navigateTo({ url: "/pages/service/service" });
  },

  goProfile: function () {
    wx.navigateTo({ url: "/pages/profile/profile" });
  },

  scrollToBanks: function () {
    wx.pageScrollTo({ selector: "#bank-list", duration: 300 });
  },

  onShareAppMessage: function () {
    var site = this.data.site || {};
    return {
      title: (site.name || "智汇答题") + "，一起来答题",
      path: "/pages/index/index",
    };
  },
});