const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const labels = require("../../utils/labels");
const pay = require("../../utils/pay");

const GREEN_NEED_LABELS = {
  OUTPATIENT: "门诊绿通",
  EXAM: "检查加急",
  HOSPITAL: "住院安排",
  OPERATION: "手术快约",
};

const SIGN_STATUS_LABELS = {
  PENDING_PAYMENT: "待支付",
  SIGNED: "已签约待生效",
  EFFECTIVE: "服务中",
  EXPIRED: "已到期",
  CANCELLED: "已取消",
  REFUNDED: "已退款",
};

/** 与后端 applyAftersale / reviewOrder 的状态白名单保持一致。 */
const AFTERSALE_STATUSES = ["PAID", "ACCEPTED", "DELIVERED", "SERVING", "COMPLETED", "VERIFIED"];
const REVIEW_STATUSES = ["COMPLETED", "VERIFIED", "DELIVERED", "REVIEWED"];

const stars = (score) => {
  const value = Math.max(0, Math.min(5, Number(score) || 0));
  return "★★★★★".slice(0, value) + "☆☆☆☆☆".slice(0, 5 - value);
};

Page({
  data: {
    loading: true,
    order: null,
    items: [],
    priceFlows: [],
    statusLogs: [],
    verifyCode: "",
    shipment: null,
    consult: null,
    sign: null,
    green: null,
    review: null,
    canPay: false,
    canCancel: false,
    canAftersale: false,
    canReview: false,
    hasActions: false,
  },

  onLoad(options) {
    this.orderId = Number(options && options.id) || 0;
    this.load();
  },

  onShow() {
    if (this.loaded) this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  async load() {
    try {
      await auth.requireLogin();
      const data = (await api.orderDetail(this.orderId)) || {};
      this.loaded = true;
      const order = data.order || {};
      const status = order.status || "";
      const receiver = order.receiver || {};
      const receiverText = [receiver.name, receiver.phone, receiver.address]
        .filter(Boolean)
        .join(" ");
      const canPay = status === "PENDING_PAYMENT";
      const canAftersale = AFTERSALE_STATUSES.indexOf(status) >= 0;
      const canReview = REVIEW_STATUSES.indexOf(status) >= 0 && !data.review;
      const canCancel = canPay;
      this.setData({
        loading: false,
        order: {
          ...order,
          bizTypeLabel: order.bizTypeLabel || labels.pick(labels.BIZ_LABELS, order.bizType),
          statusLabel: labels.pick(labels.ORDER_STATUS_LABELS, status),
          payLabel: labels.pick(labels.PAY_STATUS_LABELS, order.payStatus),
          amountText: format.yuan(order.payAmountCents),
          timeText: format.dateTime(order.createdAt),
          paidText: order.paidAt ? format.shortTime(order.paidAt) : "",
          expireText: order.expireAt ? format.shortTime(order.expireAt) : "",
          receiverText,
        },
        items: (data.items || []).map((item) => ({
          ...item,
          amountText: format.yuan(item.amountCents),
        })),
        priceFlows: (data.priceFlows || []).map((flow) => ({
          ...flow,
          amountText:
            (flow.amountCents < 0 ? "-" : "") + format.money(Math.abs(flow.amountCents)),
        })),
        statusLogs: (data.statusLogs || [])
          .slice()
          .reverse()
          .map((log) => ({
            ...log,
            toLabel: labels.pick(labels.ORDER_STATUS_LABELS, log.to, "状态更新"),
            timeText: format.shortTime(log.createdAt),
          })),
        verifyCode: data.verifyCode || "",
        shipment: data.shipment
          ? {
              ...data.shipment,
              shippedText: data.shipment.shippedAt
                ? format.shortTime(data.shipment.shippedAt)
                : "",
            }
          : null,
        consult: data.consult
          ? {
              ...data.consult,
              statusLabel: labels.pick(labels.CONSULT_STATUS_LABELS, data.consult.status),
              appointText: data.consult.appointAt
                ? format.dateTime(data.consult.appointAt)
                : "",
            }
          : null,
        sign: data.sign
          ? {
              ...data.sign,
              statusLabel: labels.pick(SIGN_STATUS_LABELS, data.sign.status),
              rangeText:
                format.dateOnly(data.sign.startAt) +
                (data.sign.endAt ? " 至 " + format.dateOnly(data.sign.endAt) : ""),
            }
          : null,
        green: data.green
          ? {
              ...data.green,
              needLabel: labels.pick(GREEN_NEED_LABELS, data.green.needType, "就医协助"),
            }
          : null,
        review: data.review
          ? { ...data.review, starsText: stars(data.review.score) }
          : null,
        canPay,
        canCancel,
        canAftersale,
        canReview,
        hasActions: canPay || canAftersale || canReview,
      });
    } catch (error) {
      this.setData({ loading: false });
      if (error && error.code !== 401) {
        wx.showToast({ title: error.message || "订单加载失败", icon: "none" });
      }
    }
  },

  async onPay() {
    const result = await pay.payOrder(this.orderId);
    if (result.paid) {
      wx.showToast({ title: "支付成功" });
      this.load();
      return;
    }
    if (result.reason && result.reason !== "已取消支付") {
      wx.showToast({ title: result.reason, icon: "none", duration: 2500 });
    }
  },

  onCancel() {
    wx.showModal({
      title: "取消订单",
      content: "取消后号源与库存会释放，确定取消吗？",
      editable: true,
      placeholderText: "填写取消原因（选填）",
      success: (res) => {
        if (!res.confirm) return;
        api
          .cancelOrder(this.orderId, (res.content || "").trim())
          .then(() => {
            wx.showToast({ title: "已取消" });
            this.load();
          })
          .catch((error) =>
            wx.showToast({ title: error.message || "取消失败", icon: "none" }),
          );
      },
    });
  },

  onCopy(e) {
    const value = e.currentTarget.dataset.value;
    if (!value) return;
    wx.setClipboardData({ data: String(value) });
  },

  onConsult() {
    if (!this.data.consult) return;
    wx.navigateTo({ url: "/consumer/consult/detail?id=" + this.data.consult.id });
  },

  onReview() {
    wx.navigateTo({ url: "/consumer/order/review?orderId=" + this.orderId });
  },

  onAftersale() {
    wx.navigateTo({ url: "/consumer/order/aftersale?orderId=" + this.orderId });
  },
});
