const api = require("../../utils/api");
const auth = require("../../utils/auth");
const session = require("../../utils/session");

Page({
  data: {
    loading: true,
    error: "",
    customer: {},
    market: {},
    entries: [
      { key: "PENDING_PAYMENT", label: "待付款" },
      { key: "PAID", label: "待发货" },
      { key: "SHIPPED", label: "已发货" },
      { key: "COMPLETED", label: "已完成" },
    ],
  },

  onShow() {
    this.load();
  },

  load() {
    this.setData({ loading: !this.data.customer.id, error: "" });
    auth
      .ensureLogin()
      .then(() => api.profile())
      .then((customer) => {
        session.setCustomer(customer);
        this.setData({
          loading: false,
          customer: customer,
          market: getApp().bootstrap().market || {},
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "个人信息读取失败",
        });
      });
  },

  goOrders(event) {
    const status = event.currentTarget.dataset.status || "";
    wx.navigateTo({ url: "/pages/orders/orders?status=" + status });
  },

  goAddress() {
    wx.navigateTo({ url: "/pages/address/list" });
  },

  goCoupons() {
    wx.navigateTo({ url: "/pages/coupon/coupon" });
  },

  goFollows() {
    wx.navigateTo({ url: "/pages/follow/follow" });
  },

  goService() {
    wx.navigateTo({ url: "/pages/service/service" });
  },

  goAfterSales() {
    wx.navigateTo({ url: "/pages/aftersale/list" });
  },

  goShopping() {
    wx.switchTab({ url: "/pages/index/index" });
  },
});
