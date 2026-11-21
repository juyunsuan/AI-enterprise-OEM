/**
 * 我的（个人中心）：会员身份与积分/会员状态、签到、各功能入口与说明类弹层。
 */
const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const session = require("../../utils/session");

Page({
  data: {
    themeStyle: "",
    siteName: "",
    member: {},
    avatarText: "会",
    vipText: "",
    pointsText: "0",
    signInTitle: "签到",
    nextRewardText: "",
    show: {
      signIn: true,
      vipPage: true,
      faq: true,
      about: true,
      contact: true,
      adTab: false,
    },
    adUnit: "",
    entries: [],
    popup: { visible: false, title: "", content: "" },
    loading: true,
    signing: false,
    loginFailed: false,
  },

  onShow() {
    const app = getApp();
    this.setData({
      themeStyle: app.globalData.themeStyle,
      siteName: app.globalData.siteName,
    });
    app.ensureReady().then(() => {
      this.syncRuntime(app);
      this.loadMember();
    });
  },

  onPullDownRefresh() {
    this.loadMember().then(() => wx.stopPullDownRefresh());
  },

  /** 入口列表按开关过滤：关掉的功能连入口都不出现，比点了报错更合理。 */
  syncRuntime(app) {
    const entries = [];
    entries.push({ key: "myLearning", title: "我的学习", url: "/pages/my-learning/my-learning" });
    entries.push({ key: "myContent", title: "我获取的课程", url: "/pages/my-content/my-content" });
    entries.push({ key: "favorites", title: "我的收藏", url: "/pages/my-favorites/my-favorites" });
    entries.push({ key: "myOrders", title: "支付订单", url: "/pages/my-orders/my-orders" });
    if (app.toggle("vipPage")) {
      entries.push({ key: "vip", title: "会员中心", url: "/pages/member-vip/member-vip" });
    }
    entries.push({ key: "more", title: "精选推荐", url: "/pages/more/more" });
    entries.push({ key: "notice", title: "站点公告", url: "/pages/notice/notice" });
    if (app.toggle("faq")) entries.push({ key: "faq", title: "使用说明", popup: "faq" });
    if (app.toggle("about")) entries.push({ key: "about", title: "关于我们", popup: "about" });

    this.setData({
      show: {
        signIn: app.toggle("signIn"),
        vipPage: app.toggle("vipPage"),
        faq: app.toggle("faq"),
        about: app.toggle("about"),
        contact: app.toggle("contact"),
        adTab: app.toggle("adTab"),
      },
      adUnit: app.configValue("adUnitTab", ""),
      entries: entries,
    });
  },

  loadMember() {
    const task = auth.ensureMember().catch(() => null);
    return task.then((member) => {
      if (!member) {
        // 拿不到会员身份时保留公告/说明类入口：匿名也能看的内容不该被登录失败挡掉。
        this.setData({ loading: false, loginFailed: true });
        return null;
      }
      this.setData({ loading: false, loginFailed: false });
      return this.refreshMember();
    });
  },

  refreshMember() {
    return api
      .member()
      .then((member) => {
        session.setMember(member || null);
        const app = getApp();
        app.globalData.member = member || null;
        this.renderMember(member || {});
      })
      .catch((error) => {
        // 令牌过期时 ensureMember 已清 token，这里只提示一次，不打断浏览。
        auth.showError(error);
      });
  },

  renderMember(member) {
    const config = getApp().globalData.config || {};
    const rewards = config.signRewards || [];
    const streak = Number(member.signInStreak) || 0;
    const nextReward = rewards.length ? rewards[Math.min(streak, rewards.length - 1)] : 0;
    this.setData({
      member: member,
      avatarText: String(member.nickname || "会").slice(0, 1),
      pointsText: String(member.points || 0),
      vipText: member.vipActive
        ? "会员有效期至 " + format.dateText(member.vipUntil)
        : member.vipUntil
          ? "会员已于 " + format.dateText(member.vipUntil) + " 到期"
          : "还不是会员",
      nextRewardText: "已连续签到 " + streak + " 天，今日签到可得 " + nextReward + " 积分",
    });
  },

  onSignIn() {
    if (this.data.signing) return;
    this.setData({ signing: true });
    auth
      .ensureMember()
      .then(() => api.signIn())
      .then((data) => {
        this.setData({ signing: false });
        // 后端 message 里带了「已签到/重复签到」的准确说法，直接展示。
        wx.showToast({ title: (data && data.message) || "签到成功", icon: "none", duration: 2500 });
        this.refreshMember();
      })
      .catch((error) => {
        this.setData({ signing: false });
        auth.showError(error);
      });
  },

  openEntry(event) {
    const item = this.data.entries[event.currentTarget.dataset.index];
    if (!item) return;
    if (item.popup) {
      this.openPopupByName(item.popup);
      return;
    }
    wx.navigateTo({ url: item.url });
  },

  openPopupByName(name) {
    const config = getApp().globalData.config || {};
    const isFaq = name === "faq";
    const content = isFaq ? config.faq || "" : config.about || "";
    if (!content) {
      wx.showToast({ title: "站点暂未填写该内容", icon: "none" });
      return;
    }
    this.setData({
      popup: { visible: true, title: isFaq ? "使用说明" : "关于我们", content: content },
    });
  },

  closePopup() {
    this.setData({ "popup.visible": false });
  },

  /** 弹层内部点击阻止冒泡用，本身不做任何事。 */
  noop() {},

  goVip() {
    wx.navigateTo({ url: "/pages/member-vip/member-vip" });
  },

  goFavorites() {
    wx.navigateTo({ url: "/pages/my-favorites/my-favorites" });
  },

  goLearning() {
    wx.navigateTo({ url: "/pages/my-learning/my-learning" });
  },

  retryLogin() {
    auth
      .login()
      .then(() => {
        wx.showToast({ title: "已登录", icon: "success" });
        this.loadMember();
      })
      .catch((error) => auth.showError(error));
  },
});
