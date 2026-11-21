const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const pay = require("../../utils/pay");

const STATUS_TEXT = {
  PENDING_PAYMENT: "待付款",
  PAID: "待接单",
  ACCEPTED: "已接单",
  EN_ROUTE: "服务出发",
  ON_SITE: "已到达",
  SERVING: "服务中",
  COMPLETED: "已完成",
  SIGNED: "已签收",
  REVIEWED: "已评价",
  CANCELLED: "已取消",
  EXPIRED: "超时关闭",
  REJECTED: "技师拒单",
  REFUND_PENDING: "退款中",
  REFUNDED: "已退款",
};

Page({
  data: {
    loading: true,
    error: "",
    notReady: false,
    readyReason: "",
    paid: false,
    amountText: "",
    orderNo: "",
    statusText: "",
    reason: "",
    hint: "",
    paying: false,
  },

  onLoad(options) {
    const params = options || {};
    this.orderId = Number(params.orderId || 0);
    const reason = params.reason ? decodeURIComponent(params.reason) : "";
    this.setData({ reason: reason });
    this.start();
  },

  start() {
    if (!this.orderId) {
      this.setData({ loading: false, error: "缺少订单号，请到「订单」里查看" });
      return Promise.resolve();
    }
    const app = getApp();
    return app
      .ensureReady()
      .then((shop) => {
        if (!shop || !shop.shopCode) {
          this.setData({
            loading: false,
            notReady: true,
            readyReason: app.globalData.bootstrapError || "店铺尚未开通，请联系店铺方",
          });
          return null;
        }
        return auth.ensureLogin().then(() => this.load());
      })
      .catch((error) => {
        this.setData({
          loading: false,
          notReady: false,
          error: (error && error.message) || "登录失败，请重新进入小程序",
        });
      });
  },

  load() {
    if (!this.orderId) {
      this.setData({ loading: false, error: "缺少订单号，请到「订单」里查看" });
      return Promise.resolve();
    }
    this.setData({ loading: true, error: "", notReady: false });
    return api
      .orderDetail(this.orderId)
      .then((row) => {
        const paid = row && row.payStatus === "PAID";
        this.setData({
          loading: false,
          paid: paid,
          amountText: format.yuan(row && row.payAmountCents),
          orderNo: (row && row.orderNo) || "",
          statusText: STATUS_TEXT[row && row.status] || (row && row.status) || "",
          hint: paid
            ? "已支付，店铺会尽快接单，可在订单详情里查看进度"
            : "订单已创建但尚未支付，超时未付会自动关闭",
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "订单状态加载失败",
        });
      });
  },

  retryPay() {
    if (this.data.paying) return;
    const self = this;
    this.setData({ paying: true, reason: "" });
    pay.payOrder(this.orderId).then((result) => {
      self.setData({ paying: false });
      if (result.paid) {
        wx.showToast({ title: "支付成功", icon: "success" });
        self.load();
        return;
      }
      self.setData({ reason: result.reason });
      wx.showToast({ title: result.reason || "支付未完成", icon: "none" });
    });
  },

  openOrder() {
    wx.redirectTo({
      url: "/consumer/order-detail/order-detail?orderId=" + this.orderId,
    });
  },

  goHome() {
    wx.switchTab({ url: "/pages/index/index" });
  },
});
