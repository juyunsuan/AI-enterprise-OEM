const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const pay = require("../../utils/pay");

Page({
  data: {
    loading: true,
    error: "",
    order: null,
    busy: false,
    attributes: [],
    inspection: null,
  },

  onLoad(options) {
    this.orderId = Number(options.id || 0);
    this.load();
  },

  load() {
    if (!this.orderId) {
      this.setData({ loading: false, error: "缺少租单标识" });
      return;
    }
    this.setData({ loading: true, error: "" });
    auth
      .ensureLogin()
      .then(() => api.orderDetail(this.orderId))
      .then((order) => {
        const snapshot = order.itemSnapshot || {};
        const attributes = snapshot.attributes || {};
        const inspection = order.returnInspection;
        this.setData({
          loading: false,
          order: {
            ...order,
            payText: format.yuan(order.payCents),
            rentText: format.yuan(order.rentCents),
            depositText: format.yuan(order.depositCents),
            refundText: format.yuan(order.refundCents),
            damageText: format.yuan(order.damageFeeCents),
            periodText: order.startAt.slice(0, 10) + " 至 " + order.endAt.slice(0, 10),
            createdText: format.dateTime(order.createdAt),
          },
          attributes: Object.keys(attributes).map((key) => ({ key: key, value: attributes[key] })),
          inspection: inspection
            ? {
                ...inspection,
                damageText: format.yuan(Math.round(Number(inspection.damageFee) * 100)),
                timeText: format.dateTime(inspection.createdAt),
              }
            : null,
        });
      })
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "租单加载失败" });
      });
  },

  payNow() {
    if (this.data.busy) return;
    this.setData({ busy: true });
    pay.payOrder(this.orderId).then((result) => {
      this.setData({ busy: false });
      wx.showToast({
        title: result.paid ? "支付成功" : result.reason,
        icon: result.paid ? "success" : "none",
      });
      if (result.paid) this.load();
    });
  },

  cancelOrder() {
    if (this.data.busy) return;
    wx.showModal({
      title: "取消租单",
      content: "确定取消这笔待付款租单吗？",
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ busy: true });
        api
          .cancelOrder(this.orderId)
          .then(() => {
            this.setData({ busy: false });
            wx.showToast({ title: "已取消", icon: "success" });
            this.load();
          })
          .catch((error) => {
            this.setData({ busy: false });
            wx.showToast({ title: (error && error.message) || "取消失败", icon: "none" });
          });
      },
    });
  },

  callShop() {
    const shop = getApp().bootstrap();
    if (!shop.servicePhone) return;
    wx.makePhoneCall({ phoneNumber: shop.servicePhone });
  },

  copyOrderNo() {
    wx.setClipboardData({ data: this.data.order.orderNo });
  },
});