/** 我的：资产概览 + 个人中心入口，按站点开关裁剪菜单。 */
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const request = require("../../utils/request");
const session = require("../../utils/session");

Page({
  data: {
    themeStyle: "",
    siteName: "",
    member: null,
    vipText: "",
    loading: true,
    menus: [],
    deskUrl: "",
    agreements: [],
  },

  onShow() {
    const app = getApp();
    this.setData({ themeStyle: app.globalData.themeStyle, siteName: app.globalData.siteName });
    app.ensureReady().then(() => {
      this.buildMenus(app);
      this.loadMember();
    });
  },

  onPullDownRefresh() {
    this.loadMember().then(() => wx.stopPullDownRefresh());
  },

  buildMenus(app) {
    const toggle = (key) => app.toggle(key);
    const config = app.globalData.config || {};
    const base = request.baseUrl();
    const deskKey = config.serviceDeskSiteKey || "";
    const menus = [];
    if (toggle("worksPage")) menus.push({ key: "works", title: "我的作品", url: "/pages/works/works" });
    menus.push({ key: "orders", title: "我的订单", url: "/pages/orders/orders" });
    if (toggle("vipPage") || toggle("card")) {
      menus.push({ key: "member", title: "会员与充值", url: "/pages/member/member" });
    }
    if (toggle("commissionPage")) {
      menus.push({ key: "promoter", title: "推广中心", url: "/pages/promoter/promoter" });
    }
    if (toggle("poster")) menus.push({ key: "poster", title: "分享海报", url: "/pages/poster/poster" });
    if (toggle("feedback")) menus.push({ key: "feedback", title: "意见反馈", url: "/pages/feedback/feedback" });
    this.setData({ menus: menus });

    const agreements = [];
    if (toggle("agreement")) {
      agreements.push(
        { key: "help", title: "使用教程", url: "/pages/articles/articles?type=help" },
        { key: "about", title: "关于我们", url: "/pages/articles/articles?type=about" },
        { key: "agreement", title: "用户协议", url: "/pages/articles/articles?type=agreement" },
        { key: "privacy", title: "隐私政策", url: "/pages/articles/articles?type=privacy" },
      );
    }
    const deskUrl =
      toggle("serviceDesk") && deskKey && base
        ? base + "/embed/service-desk?key=" + encodeURIComponent(deskKey)
        : "";
    this.setData({ deskUrl: deskUrl, agreements: agreements });
  },

  applyMember(member) {
    this.setData({
      member: member,
      vipText: member
        ? member.isVip
          ? "会员有效期至 " + format.day(member.vipExpireAt)
          : "普通用户"
        : "",
    });
  },

  loadMember() {
    const cached = session.getMember();
    if (cached) this.applyMember(cached);
    return auth
      .ensureMember()
      .then((member) => {
        this.applyMember(member);
        this.setData({ loading: false });
        return auth.refreshMember();
      })
      .then((member) => {
        this.applyMember(member);
        this.setData({ loading: false });
      })
      .catch(() => {
        this.setData({ loading: false });
      });
  },

  openMenu(event) {
    const url = event.currentTarget.dataset.url;
    if (url) wx.navigateTo({ url: url });
  },

  openDesk() {
    if (!this.data.deskUrl) {
      wx.showToast({ title: "站点暂未开通在线客服", icon: "none" });
      return;
    }
    wx.navigateTo({
      url: "/pages/webview/webview?url=" + encodeURIComponent(this.data.deskUrl),
    });
  },

  goMember() {
    wx.navigateTo({ url: "/pages/member/member" });
  },

  onLoginTap() {
    auth
      .ensureMember()
      .then((member) => this.applyMember(member))
      .catch(auth.showError);
  },
});
