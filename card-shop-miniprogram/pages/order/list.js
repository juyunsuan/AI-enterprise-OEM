const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

/**
 * 我的订单：顾客态列表，只给状态与金额；点进详情再用查单三要素换卡密。
 * 未登录或登录失败时保留「去查单」入口——匿名查单永远可用。
 */
Page({
  data: {
    themeStyle: "",
    enabled: true,
    logged: false,
    filter: "",
    filters: [
      { key: "", label: "全部" },
      { key: "PENDING", label: "待支付" },
      { key: "PAID", label: "已支付" },
    ],
    orders: [],
    page: 1,
    pageSize: 10,
    loading: false,
    finished: false,
    error: "",
    loginError: "",
  },

  onShow() {
    const app = getApp();
    this.setData({
      themeStyle: app.globalData.themeStyle,
      enabled: app.toggle("myOrders"),
    });
    app.ensureReady().then(() => {
      this.setData({
        themeStyle: app.globalData.themeStyle,
        enabled: app.toggle("myOrders"),
      });
      if (!this.data.enabled) return;
      this.ensureLogin(true);
    });
  },

  onPullDownRefresh() {
    if (!this.data.enabled) {
      wx.stopPullDownRefresh();
      return;
    }
    this.ensureLogin(true).then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (!this.data.enabled || this.data.loading || this.data.finished) return;
    this.load();
  },

  ensureLogin(reset) {
    const token = !!getApp().hasToken();
    if (token) {
      this.setData({ logged: true, loginError: "" });
      return this.load(reset);
    }
    return auth
      .login()
      .then(() => {
        this.setData({ logged: true, loginError: "" });
        return this.load(reset);
      })
      .catch((error) => {
        this.setData({
          logged: false,
          loading: false,
          loginError: (error && error.message) || "微信登录失败",
        });
      });
  },

  load(reset) {
    const page = reset ? 1 : this.data.page + 1;
    this.setData({ loading: true, error: "" });
    return api
      .myOrders(this.data.filter, page)
      .then((data) => {
        const list = ((data && data.list) || []).map((order) =>
          Object.assign({}, order, {
            totalText: format.money(order.totalAmount),
            createdText: format.dateTime(order.createdAt),
          }),
        );
        this.setData({
          orders: reset ? list : this.data.orders.concat(list),
          page: page,
          loading: false,
          finished: !data || list.length < this.data.pageSize,
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "订单加载失败",
        });
      });
  },

  switchFilter(event) {
    const key = String(event.currentTarget.dataset.key || "");
    if (key === this.data.filter) return;
    this.setData({ filter: key, orders: [], finished: false });
    this.load(true);
  },

  openOrder(event) {
    const order = this.data.orders[Number(event.currentTarget.dataset.index || 0)];
    if (!order) return;
    wx.navigateTo({
      url:
        "/pages/order/detail?orderNo=" +
        encodeURIComponent(order.orderNo) +
        "&contact=" +
        encodeURIComponent(order.contact || ""),
    });
  },

  goQuery() {
    wx.navigateTo({ url: "/pages/query/query" });
  },

  goSearch() {
    wx.navigateTo({ url: "/pages/search/search" });
  },
});
