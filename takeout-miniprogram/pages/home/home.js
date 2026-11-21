const api = require("../../utils/api");
const fmt = require("../../utils/format");

Page({
  data: {
    loading: true,
    error: "",
    shop: null,
    hot: [],
    info: "",
    statusText: "加载中",
    open: false,
    modes: [],
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    const app = getApp();
    return app
      .ensureReady()
      .then((bootstrap) => {
        const shop = bootstrap || app.bootstrap();
        if (!shop || !shop.shopId) {
          this.setData({
            loading: false,
            error: app.globalData.bootstrapError || "门店暂不可用",
            shop: null,
          });
          return null;
        }
        this.setData({
          loading: true,
          error: "",
          shop: shop,
          open: shop.open === true,
          statusText: shop.open === true ? "营业中" : "休息中",
          info:
            "起送 ¥" +
            fmt.money(shop.minOrderAmount) +
            " · 配送 ¥" +
            fmt.money(shop.deliveryFee) +
            " · 约 " +
            (shop.estimatedMinutes || 30) +
            " 分钟",
          modes: (shop.modes || []).map((mode) => fmt.modeText(mode)),
        });
        return api.menu();
      })
      .then((menu) => {
        if (!menu) return;
        const hot = (menu.products || [])
          .filter((item) => item.isHot && !item.soldOut)
          .slice(0, 8)
          .map((item) =>
            Object.assign({}, item, {
              priceText: fmt.money(item.price),
            }),
          );
        this.setData({ hot: hot, loading: false });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "加载失败，请下拉重试",
        });
      });
  },

  goMenu(event) {
    const id = event && event.currentTarget ? event.currentTarget.dataset.id : 0;
    wx.switchTab({ url: "/pages/menu/menu" });
    if (id) getApp().globalData.focusProductId = Number(id);
  },

  goOrders() {
    wx.switchTab({ url: "/pages/order/list" });
  },

  goCoupons() {
    wx.navigateTo({ url: "/pages/coupon/list" });
  },

  goAddress() {
    wx.navigateTo({ url: "/pages/address/list" });
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

  onShareAppMessage() {
    const shop = this.data.shop || {};
    return {
      title: shop.name || "外卖点餐",
      path: "/pages/home/home",
    };
  },
});