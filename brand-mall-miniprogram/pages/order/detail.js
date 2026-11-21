const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

/** 订单详情：状态、金额、时间线、物流单号都在这里，售后按行项目发起。 */
Page({
  data: {
    id: 0,
    order: null,
    statusLabel: "",
    payTypeLabel: "",
    items: [],
    logs: [],
    refunds: [],
    receiverText: "",
    goodsAmountText: "0.00",
    freightText: "0.00",
    discountText: "0.00",
    payAmountText: "0.00",
    expireText: "",
    canCancel: false,
    canPay: false,
    canReceive: false,
    refundEnabled: true,
    loading: true,
    error: "",
  },

  onLoad(query) {
    this.setData({ id: Number(query.id || 0) });
  },

  onShow() {
    this.load();
  },

  onUnload() {
    this.stopCountdown();
  },

  onHide() {
    this.stopCountdown();
  },

  load() {
    if (!this.data.id) return Promise.resolve();
    return api
      .order(this.data.id)
      .then((data) => this.apply(data))
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "订单加载失败" });
      });
  },

  apply(data) {
    const trade = ((getApp().bootstrap() || {}).trade) || {};
    this.setData({
      order: data,
      createdAtText: format.dateTime(data.createdAt),
      paidAtText: format.dateTime(data.paidAt),
      shippedAtText: format.dateTime(data.shippedAt),
      completedAtText: format.dateTime(data.completedAt),
      cancelledAtText: format.dateTime(data.cancelledAt),
      loading: false,
      error: "",
      statusLabel: format.ORDER_STATUS_LABELS[data.status] || data.status,
      payTypeLabel: (data.payType || "") === "WECHAT" ? "微信支付" : data.payType === "OFFLINE" ? "线下支付" : "其他",
      goodsAmountText: format.money(data.goodsAmount),
      freightText: format.money(data.freightAmount),
      discountText: format.money(data.discountAmount),
      payAmountText: format.money(data.payAmount),
      items: (data.items || []).map((item) => ({
        id: item.id,
        productId: item.productId,
        title: item.title,
        skuName: item.skuName,
        image: item.image,
        priceText: format.money(item.price),
        quantity: item.quantity,
        totalText: format.money(item.totalPrice),
        refundable: format.money(Number(item.totalPrice || 0) - Number(item.refundedAmount || 0)),
        refundStatus: item.refundStatus,
        refundLabel: format.REFUND_STATUS_LABELS[item.refundStatus] || "",
        reviewed: !!item.reviewed,
      })),
      logs: (data.logs || []).map((row) => ({
        id: row.id,
        title: row.action || "更新",
        text: row.content,
        timeText: format.dateTime(row.createdAt),
      })),
      refunds: (data.refunds || []).map((row) => ({
        id: row.id,
        refundNo: row.refundNo,
        statusLabel: format.REFUND_STATUS_LABELS[row.status] || row.status,
        amountText: format.money(row.amount),
        reason: row.reason,
        createdAtText: format.dateTime(row.createdAt),
      })),
      receiverText: this.receiverText(data.receiver),
      canPay: data.status === "PENDING_PAYMENT",
      canCancel: data.status === "PENDING_PAYMENT" && trade.selfCancelEnabled !== false,
      canReceive: data.status === "SHIPPED",
      refundEnabled: trade.refundEnabled !== false,
    });
    wx.setNavigationBarTitle({ title: format.ORDER_STATUS_LABELS[data.status] || "订单详情" });
    if (data.status === "PENDING_PAYMENT") this.startCountdown(data.expireAt);
  },

  receiverText(receiver) {
    if (!receiver) return "";
    return [receiver.province, receiver.city, receiver.district, receiver.detail]
      .filter(Boolean)
      .join(" ");
  },

  startCountdown(expireAt) {
    this.stopCountdown();
    this.timer = setInterval(() => {
      const text = format.countdown(expireAt);
      this.setData({ expireText: text });
      if (!text || text === "00:00") this.stopCountdown();
    }, 1000);
    this.setData({ expireText: format.countdown(expireAt) });
  },

  stopCountdown() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  },

  goPay() {
    wx.navigateTo({ url: "/pages/order/pay?id=" + this.data.id });
  },

  cancel() {
    wx.showModal({
      title: "取消订单",
      content: "取消后库存会退回，确定吗？",
      success: (res) => {
        if (!res.confirm) return;
        api
          .cancelOrder(this.data.id)
          .then(() => {
            wx.showToast({ title: "订单已取消", icon: "none" });
            this.load();
          })
          .catch((error) => auth.showError(error));
      },
    });
  },

  receive() {
    wx.showModal({
      title: "确认收货",
      content: "确认后订单进入已完成，售后时限开始倒计时。",
      success: (res) => {
        if (!res.confirm) return;
        api
          .receiveOrder(this.data.id)
          .then(() => {
            wx.showToast({ title: "已确认收货", icon: "none" });
            this.load();
          })
          .catch((error) => auth.showError(error));
      },
    });
  },

  copyOrderNo() {
    wx.setClipboardData({
      data: String((this.data.order || {}).orderNo || ""),
      success() {
        wx.showToast({ title: "订单号已复制", icon: "none" });
      },
      fail() {},
    });
  },

  copyExpressNo() {
    const order = this.data.order || {};
    if (!order.expressNo) return;
    wx.setClipboardData({
      data: String(order.expressNo),
      success() {
        wx.showToast({ title: "快递单号已复制", icon: "none" });
      },
      fail() {},
    });
  },

  /** 契约里没有公开的物流轨迹接口，只能展示快递公司 + 单号，轨迹靠复制单号自查。 */
  applyRefund(event) {
    const dataset = event.currentTarget.dataset;
    wx.navigateTo({
      url:
        "/pages/refund/apply?orderId=" +
        this.data.id +
        "&itemId=" +
        dataset.id +
        "&type=" +
        encodeURIComponent(dataset.type || ""),
    });
  },

  openGoods(event) {
    wx.navigateTo({ url: "/pages/goods/detail?id=" + event.currentTarget.dataset.id });
  },

  goRefundList() {
    wx.navigateTo({ url: "/pages/refund/list" });
  },

  callService() {
    // 带上订单号，客服页会提示复制单号，店主定位更快
    const orderNo = String(((this.data.order || {}).orderNo) || "");
    wx.navigateTo({
      url: "/pages/service/index" + (orderNo ? "?orderNo=" + encodeURIComponent(orderNo) : ""),
    });
  },
});
