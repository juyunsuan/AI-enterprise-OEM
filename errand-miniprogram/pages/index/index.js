const app = getApp();
const session = require("../../utils/session");

Page({
  data: {
    loading: true,
    error: "",
    site: {},
    themeColor: "#3370FF",
    notice: "",
    myOrders: true,
    addressBook: true,
    coupon: true,
    desk: false,
    showContact: false,
    contact: {},
    buyEnabled: true,
    riderApply: true,
    protocolEnabled: false,
    coupons: [],
    cities: [],
    cityId: 0,
    cityName: "",
  },

  onShow() {
    this.load();
  },

  load() {
    this.setData({ loading: !app.globalData.bootstrap, error: "" });
    app.ensureReady().then((data) => {
      if (!data) {
        this.setData({
          loading: false,
          error: app.globalData.bootstrapError || "站点服务暂不可用",
        });
        return;
      }
      this.setData({
        loading: false,
        site: data,
        themeColor: data.themeColor || "#3370FF",
        notice: app.toggle("indexNotice") ? data.notice : "",
        myOrders: app.toggle("myOrders"),
        addressBook: app.toggle("addressBook"),
        coupon: app.toggle("coupon"),
        desk: app.toggle("deskChat") && !!data.deskEmbedUrl,
        showContact:
          app.toggle("contact") &&
          !!(data.contact && (data.contact.phone || data.contact.wechat || data.contact.email)),
        contact: data.contact || {},
        buyEnabled: app.toggle("buyService"),
        riderApply: app.toggle("riderApply"),
        protocolEnabled: app.toggle("protocol") && !!data.protocolText,
        coupons: data.coupons || [],
        cities: data.cities || [],
        cityId: data.cityId || 0,
        cityName: data.cityName || "",
      });
    });
  },

  pickCity(event) {
    const index = Number(event.detail.value);
    const city = this.data.cities[index];
    if (!city || city.id === this.data.cityId) return;
    session.setCityId(city.id);
    this.setData({ loading: true });
    app.reloadBootstrap().then(() => this.load());
  },

  goCreate(event) {
    const type = event.currentTarget.dataset.type || "SEND";
    wx.navigateTo({ url: "/pages/create/create?type=" + type });
  },

  goOrders() {
    wx.switchTab({ url: "/pages/order-list/order-list" });
  },

  goCoupons() {
    wx.navigateTo({ url: "/pages/coupon/coupon" });
  },

  goAddress() {
    wx.navigateTo({ url: "/pages/address/list" });
  },

  goProfile() {
    wx.navigateTo({ url: "/pages/profile/profile" });
  },

  goService() {
    const url = app.bootstrap().deskEmbedUrl || "";
    if (!url) return;
    wx.navigateTo({ url: "/pages/service/service?url=" + encodeURIComponent(url) });
  },

  goRider() {
    wx.switchTab({ url: "/pages/rider/workbench" });
  },

  callPhone() {
    const phone = this.data.contact.phone || this.data.site.phone || "";
    if (phone) wx.makePhoneCall({ phoneNumber: phone });
  },

  retry() {
    app.globalData.bootstrap = null;
    app.globalData.bootstrapError = "";
    app.globalData.ready = null;
    this.load();
  },
});