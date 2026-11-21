const api = require("../../utils/api");
const format = require("../../utils/format");

Page({
  data: {
    themeStyle: "",
    id: 0,
    goods: null,
    needVisitPassword: false,
    visitPassword: "",
    message: "",
    quantity: 1,
    loading: true,
    error: "",
    stockMode: "ACTUAL",
    priceText: "0.00",
    stockText: "",
    tiers: [],
    canBuy: false,
  },

  onLoad(query) {
    const app = getApp();
    this.setData({
      themeStyle: app.globalData.themeStyle,
      id: Number(query.id || 0),
    });
    app.ensureReady().then(() => {
      this.setData({
        themeStyle: app.globalData.themeStyle,
        stockMode: (app.bootstrap() || {}).stockDisplayMode || "ACTUAL",
      });
      this.load();
    });
  },

  load() {
    this.setData({ loading: true, error: "" });
    return api
      .goodsDetail(this.data.id, this.data.visitPassword)
      .then((data) => {
        const goods = data && data.goods;
        if (!goods) {
          this.setData({
            loading: false,
            needVisitPassword: !!(data && data.needVisitPassword),
            message: (data && data.message) || "商品不存在或已下架",
            goods: null,
          });
          return;
        }
        const min = Math.max(1, Number(goods.limitQuantity || 0));
        const quantity = Math.max(min, this.data.quantity || 1);
        const stockMode = this.data.stockMode;
        this.setData({
          loading: false,
          goods: goods,
          needVisitPassword: false,
          message: "",
          quantity: quantity,
          priceText: format.money(goods.price),
          stockText: format.stockText(goods.stock, stockMode),
          tiers: (goods.wholesaleTiers || []).map((tier) => ({
            min: tier.min,
            priceText: format.money(tier.price),
          })),
          canBuy:
            stockMode !== "ACTUAL" ||
            Number((goods.stock && goods.stock.available) || 0) > 0,
        });
        wx.setNavigationBarTitle({ title: goods.name || "商品详情" });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "商品加载失败",
        });
      });
  },

  onPasswordInput(event) {
    this.setData({ visitPassword: event.detail.value });
  },

  unlock() {
    if (!this.data.visitPassword) {
      wx.showToast({ title: "请输入访问密码", icon: "none" });
      return;
    }
    this.load();
  },

  changeQuantity(event) {
    const delta = Number(event.currentTarget.dataset.delta || 0);
    const goods = this.data.goods;
    if (!goods) return;
    const min = Math.max(1, Number(goods.limitQuantity || 0));
    const max = Number(goods.maxQuantity || 0);
    let next = this.data.quantity + delta;
    if (next < min) next = min;
    if (max > 0 && next > max) next = max;
    this.setData({ quantity: next });
  },

  buy() {
    const goods = this.data.goods;
    if (!goods) return;
    if (!this.data.canBuy) {
      wx.showToast({ title: "已售罄，请稍后再来", icon: "none" });
      return;
    }
    wx.navigateTo({
      url:
        "/pages/order/confirm?id=" +
        goods.id +
        "&quantity=" +
        this.data.quantity,
    });
  },

  goService() {
    wx.navigateTo({ url: "/pages/service/index" });
  },

  goQuery() {
    wx.navigateTo({ url: "/pages/query/query" });
  },

  previewImage(event) {
    const goods = this.data.goods;
    if (!goods) return;
    const images = [goods.coverImage].concat(goods.images || []).filter((url) => !!url);
    if (!images.length) return;
    wx.previewImage({ current: event.currentTarget.dataset.url, urls: images });
  },

  onShareAppMessage() {
    const goods = this.data.goods;
    return {
      title: goods ? goods.name : getApp().globalData.siteName,
      path: "/pages/goods/detail?id=" + this.data.id,
    };
  },
});
