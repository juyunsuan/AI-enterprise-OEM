const api = require("../../utils/api");
const auth = require("../../utils/auth");

Page({
  data: {
    loading: true,
    logged: false,
    profile: null,
    points: [],
    shop: null,
  },

  onShow() {
    const app = getApp();
    app.ensureReady().then((bootstrap) => {
      this.setData({ shop: bootstrap || app.bootstrap() });
    });
    this.load();
    app.refreshCartBadge();
  },

  load() {
    this.setData({ loading: true });
    auth
      .ensureLogin()
      .then(() => Promise.all([api.profile(), api.points(1)]))
      .then((results) => {
        this.setData({
          loading: false,
          logged: true,
          profile: results[0] || null,
          points: (results[1] || []).slice(0, 5),
        });
      })
      .catch(() => {
        this.setData({ loading: false, logged: false, profile: null, points: [] });
      });
  },

  retryLogin() {
    auth
      .login()
      .then(() => this.load())
      .catch((error) => auth.showError(error));
  },

  goOrders(event) {
    const tab = event.currentTarget.dataset.tab || "ALL";
    getApp().globalData.orderTab = tab;
    wx.switchTab({ url: "/pages/order/list" });
  },

  goCoupons() {
    wx.navigateTo({ url: "/pages/coupon/list" });
  },

  goAddress() {
    wx.navigateTo({ url: "/pages/address/list" });
  },

  goMenu() {
    wx.switchTab({ url: "/pages/menu/menu" });
  },

  openService() {
    const entry = getApp().serviceEntry();
    if (entry.url) {
      wx.navigateTo({ url: "/pages/service/service" });
      return;
    }
    this.callShop();
  },

  callShop() {
    const phone = (this.data.shop && this.data.shop.servicePhone) || "";
    if (!phone) return wx.showToast({ title: "门店未留电话", icon: "none" });
    wx.makePhoneCall({ phoneNumber: phone });
  },

  about() {
    wx.showModal({
      title: "关于",
      content:
        "本小程序与门店商城共用顾客身份、订单、优惠券、积分与 SCRM，数据实时同步。",
      showCancel: false,
    });
  },
});