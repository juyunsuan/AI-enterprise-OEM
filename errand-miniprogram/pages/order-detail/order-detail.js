const api = require("../../utils/api");
const auth = require("../../utils/auth");
const fmt = require("../../utils/format");

Page({
  data: {
    loading: true,
    error: "",
    orderNo: "",
    order: null,
    events: [],
    statusText: "",
    payText: "",
    paying: false,
    rating: 0,
    comment: "",
    stars: [1, 2, 3, 4, 5],
  },

  onLoad(options) {
    this.setData({ orderNo: decodeURIComponent(options.orderNo || "") });
  },

  onShow() {
    this.load();
  },

  load() {
    if (!this.data.orderNo) return;
    this.setData({ loading: true, error: "" });
    auth
      .ensureLogin()
      .then(() => api.queryOrder(this.data.orderNo, ""))
      .then((order) => {
        this.setData({
          loading: false,
          order: order,
          events: order.events || [],
          statusText: fmt.ORDER_STATE[order.status] || order.status,
          payText: order.payState === "PAID" ? "已支付" : order.payState === "PENDING" ? "待支付" : order.payState,
        });
      })
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "订单读取失败" });
      });
  },

  repay() {
    if (this.data.paying) return;
    this.setData({ paying: true });
    api
      .repay(this.data.orderNo)
      .then((created) => {
        if (!created || !created.payParams) {
          wx.showToast({ title: (created && created.message) || "暂不能在线支付", icon: "none" });
          return null;
        }
        return new Promise((resolve, reject) => {
          wx.requestPayment(
            Object.assign({}, created.payParams, { success: resolve, fail: reject })
          );
        });
      })
      .then(() => this.load())
      .catch((error) => {
        wx.showToast({ title: (error && error.message) || "支付未完成", icon: "none" });
      })
      .then(() => this.setData({ paying: false }));
  },

  payExtra() {
    if (this.data.paying) return;
    this.setData({ paying: true });
    api
      .payExtra(this.data.orderNo)
      .then((created) => {
        if (!created || !created.payParams) {
          wx.showToast({ title: (created && created.message) || "暂不能补款", icon: "none" });
          return null;
        }
        return new Promise((resolve, reject) => {
          wx.requestPayment(
            Object.assign({}, created.payParams, { success: resolve, fail: reject })
          );
        });
      })
      .then(() => this.load())
      .catch((error) =>
        wx.showToast({ title: (error && error.message) || "补款未完成", icon: "none" })
      )
      .then(() => this.setData({ paying: false }));
  },

  cancel() {
    wx.showModal({
      title: "取消订单",
      content: "确定取消这笔跑腿订单吗？",
      success: (result) => {
        if (!result.confirm) return;
        api
          .cancelOrder(this.data.orderNo, "", "顾客取消")
          .then(() => {
            wx.showToast({ title: "已取消" });
            this.load();
          })
          .catch((error) => wx.showToast({ title: (error && error.message) || "取消失败", icon: "none" }));
      },
    });
  },

  pickRating(event) {
    this.setData({ rating: Number(event.currentTarget.dataset.value) || 0 });
  },

  saveRating() {
    if (!this.data.rating) {
      wx.showToast({ title: "请选择星级", icon: "none" });
      return;
    }
    api
      .rateOrder(this.data.orderNo, this.data.rating, this.data.comment)
      .then(() => {
        wx.showToast({ title: "评价已提交" });
        this.load();
      })
      .catch((error) =>
        wx.showToast({ title: (error && error.message) || "评价失败", icon: "none" })
      );
  },

  bindComment(event) {
    this.setData({ comment: event.detail.value });
  },

  previewPhoto(event) {
    const current = event.currentTarget.dataset.url;
    wx.previewImage({ current: current, urls: this.data.order.photos || [] });
  },

  goService() {
    const app = getApp();
    const url = app.bootstrap().deskEmbedUrl || "";
    if (!url) {
      wx.showToast({ title: "请联系店主", icon: "none" });
      return;
    }
    wx.navigateTo({ url: "/pages/service/service?url=" + encodeURIComponent(url) });
  },
});