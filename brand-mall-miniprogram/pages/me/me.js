const api = require("../../utils/api");
const auth = require("../../utils/auth");
const diy = require("../../utils/diy-render");
const format = require("../../utils/format");
const navigate = require("../../utils/navigate");
const session = require("../../utils/session");

/**
 * 我的：装修了 MINE 页就渲染快照，没装修就用这套默认入口。
 * 只有「待付款」带角标——那是唯一会被超时自动取消的状态，其余状态用列表页看即可，
 * 公开接口没有状态计数汇总，不值得为角标打四个请求。
 */
Page({
  data: {
    blocks: [],
    ctx: {},
    pageStyle: "",
    decorated: false,
    customer: null,
    logged: false,
    nickname: "微信用户",
    avatar: "",
    pointsText: "",
    balanceText: "",
    pendingCount: 0,
    apiBase: "",
    themeColor: "#fa3534",
  },

  onShow() {
    const app = getApp();
    app.ensureReady().then(() => this.syncDiy(app));
    this.loadCustomer();
  },

  onPullDownRefresh() {
    this.loadCustomer(true);
    setTimeout(() => wx.stopPullDownRefresh(), 600);
  },

  syncDiy(app) {
    const bootstrap = app.bootstrap();
    const snapshot = app.pageSnapshot("MINE");
    const ctx = diy.buildCtx(bootstrap, "MINE");
    const decorated = !!(snapshot && Array.isArray(snapshot.components) && snapshot.components.length);
    this.setData({
      blocks: decorated ? diy.normalizeComponents(snapshot.components) : [],
      ctx: ctx,
      pageStyle: diy.pageStyle(snapshot && snapshot.styles),
      decorated: decorated,
      themeColor: ctx.themeColor,
      apiBase: session.getApiBase(),
    });
  },

  loadCustomer(force) {
    if (!force && session.getToken() && session.getCustomer()) {
      this.applyCustomer(session.getCustomer());
    }
    auth
      .ensureLogin()
      .then(() => api.profile())
      .then((data) => {
        session.setCustomer(data || null);
        this.applyCustomer(data);
      })
      .catch(() => {
        // 静默登录失败时不打扰：页面照常展示，动作按钮会再提示一次。
        this.setData({ logged: false });
      });
    api
      .orders("PENDING_PAYMENT", 1, 1)
      .then((data) => this.setData({ pendingCount: Number((data && data.total) || 0) }))
      .catch(() => {});
  },

  applyCustomer(customer) {
    if (!customer) return;
    this.setData({
      logged: true,
      customer: customer,
      nickname: customer.nickname || "微信用户",
      avatar: customer.avatar || "",
      pointsText: customer.points ? String(customer.points) : "",
      balanceText: format.money(customer.balance),
    });
  },

  goOrders(event) {
    const status = event.currentTarget.dataset.status || "ALL";
    wx.navigateTo({ url: "/pages/order/list?status=" + status });
  },

  goAddress() {
    wx.navigateTo({ url: "/pages/address/list" });
  },

  goCoupons() {
    wx.navigateTo({ url: "/pages/coupon/list" });
  },

  goRefunds() {
    wx.navigateTo({ url: "/pages/refund/list" });
  },

  goProfile() {
    wx.navigateTo({ url: "/pages/me/profile" });
  },

  goCart() {
    navigate.goCart();
  },

  goService() {
    // 客服页自己判断：绑定站点走会话，否则回落客服电话
    wx.navigateTo({ url: "/pages/service/index" });
  },

  callService() {
    const phone = ((getApp().bootstrap() || {}).servicePhone || "").trim();
    if (!phone) {
      wx.showToast({ title: "商家未填写客服电话", icon: "none" });
      return;
    }
    wx.makePhoneCall({ phoneNumber: phone, fail() {} });
  },

  /** 本地调试口子：config.js 里的 apiBase 不对时，可以现场填一次并记住（只存本机）。 */
  setApiBase() {
    wx.showModal({
      title: "服务器地址",
      editable: true,
      placeholderText: "https://你的域名",
      success: (res) => {
        if (!res.confirm) return;
        const value = String(res.content || "").trim();
        if (value && value.indexOf("https://") !== 0) {
          wx.showToast({ title: "必须以 https:// 开头", icon: "none" });
          return;
        }
        session.setApiBase(value);
        const app = getApp();
        app.globalData.ready = app.loadBootstrap();
        app.globalData.ready.then(() => {
          this.syncDiy(app);
          this.loadCustomer(true);
        });
      },
    });
  },
});
