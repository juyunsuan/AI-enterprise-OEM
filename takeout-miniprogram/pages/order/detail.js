const api = require("../../utils/api");
const auth = require("../../utils/auth");
const fmt = require("../../utils/format");

const LOG_OPERATORS = { SYSTEM: "系统", CUSTOMER: "顾客", OWNER: "门店" };

function decorate(order) {
  const items = (order.items || []).map((item) =>
    Object.assign({}, item, {
      priceText: fmt.money(item.price),
      totalText: fmt.money(item.totalPrice),
    }),
  );
  const logs = (order.logs || []).map((log) =>
    Object.assign({}, log, {
      timeText: fmt.dateTime(log.createdAt),
      operatorText: LOG_OPERATORS[log.operatorType] || log.operatorType,
    }),
  );
  const receiver = order.receiver || {};
  return {
    order: Object.assign({}, order, {
      statusText: fmt.statusText(order),
      statusHint: fmt.statusHint(order),
      modeText: fmt.modeText(order.orderMode),
      payAmountText: fmt.money(order.payAmount),
      goodsAmountText: fmt.money(order.goodsAmount),
      freightAmountText: fmt.money(order.deliveryFee),
      discountAmountText: fmt.money(order.discountAmount),
      createdText: fmt.dateTime(order.createdAt),
      paidText: fmt.dateTime(order.paidAt),
      shippedText: fmt.dateTime(order.shippedAt),
      completedText: fmt.dateTime(order.completedAt),
      expectedText: order.expectedAt ? fmt.dateTime(order.expectedAt) : "尽快",
      receiverText: [receiver.province, receiver.city, receiver.district, receiver.detail]
        .filter(Boolean)
        .join(""),
      canPay: order.status === "PENDING_PAYMENT",
      canCancel: order.status === "PENDING_PAYMENT",
      canReceive: order.status === "SHIPPED",
      canAgain: order.status === "COMPLETED" || order.status === "CANCELLED",
      countdownText:
        order.status === "PENDING_PAYMENT" ? fmt.countdown(order.expireAt) : "",
    }),
    items: items,
    logs: logs,
    receiver: receiver,
  };
}

Page({
  data: {
    id: 0,
    loading: true,
    error: "",
    order: null,
    items: [],
    logs: [],
    receiver: null,
    paying: false,
  },

  onLoad(query) {
    this.setData({ id: Number(query.id || 0) });
    this.load();
  },

  onShow() {
    if (this.data.order) this.load();
  },

  onUnload() {
    this.stopTimers();
  },

  onHide() {
    this.stopTimers();
  },

  load() {
    if (!this.data.id) {
      this.setData({ loading: false, error: "缺少订单编号" });
      return Promise.resolve();
    }
    return auth
      .ensureLogin()
      .then(() => api.order(this.data.id))
      .then((order) => {
        const decorated = decorate(order);
        decorated.order.shopName = getApp().bootstrap().name || "本店";
        this.setData(
          Object.assign({ loading: false, error: "" }, decorated),
        );
        this.startTimers(order);
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "订单加载失败",
        });
      });
  },

  startTimers(order) {
    this.stopTimers();
    if (order.status === "PENDING_PAYMENT") {
      this.tickTimer = setInterval(() => {
        const order = this.data.order;
        if (!order) return;
        const text = fmt.countdown(order.expireAt);
        this.setData({ order: Object.assign({}, order, { countdownText: text }) });
        if (!text || text === "00:00") this.stopTimers();
      }, 1000);
    }
    if (order.status === "PENDING_PAYMENT" || order.status === "PAID" || order.status === "SHIPPED") {
      this.pollTimer = setInterval(() => {
        api
          .order(this.data.id)
          .then((fresh) => {
            const decorated = decorate(fresh);
            decorated.order.shopName = getApp().bootstrap().name || "本店";
            this.setData(decorated);
            if (fresh.status === "COMPLETED" || fresh.status === "CANCELLED") {
              this.stopTimers();
            }
          })
          .catch(() => {});
      }, 10000);
    }
  },

  stopTimers() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  },

  pay() {
    const order = this.data.order;
    if (!order || this.data.paying) return;
    this.setData({ paying: true });
    api
      .payParams(order.id)
      .then((data) => {
        if (!data || !data.payParams) {
          wx.showToast({ title: "该订单无需在线支付", icon: "none" });
          this.setData({ paying: false });
          this.load();
          return;
        }
        wx.requestPayment(
          Object.assign({}, data.payParams, {
            success: () => {
              wx.showToast({ title: "支付成功", icon: "success" });
              this.setData({ paying: false });
              this.load();
            },
            fail: () => {
              this.setData({ paying: false });
              wx.showToast({ title: "支付未完成", icon: "none" });
            },
          }),
        );
      })
      .catch((error) => {
        this.setData({ paying: false });
        auth.showError(error);
      });
  },

  cancel() {
    const order = this.data.order;
    if (!order) return;
    wx.showModal({
      title: "取消订单",
      content: "取消后不可恢复，确定取消这单吗？",
      success: (result) => {
        if (!result.confirm) return;
        api
          .cancelOrder(order.id)
          .then(() => {
            wx.showToast({ title: "订单已取消", icon: "none" });
            this.load();
          })
          .catch((error) => auth.showError(error));
      },
    });
  },

  receive() {
    const order = this.data.order;
    if (!order) return;
    wx.showModal({
      title: "确认完成",
      content: "确认已取餐/已收到餐品？",
      success: (result) => {
        if (!result.confirm) return;
        api
          .receiveOrder(order.id)
          .then(() => {
            wx.showToast({ title: "订单已完成", icon: "success" });
            this.load();
          })
          .catch((error) => auth.showError(error));
      },
    });
  },

  again() {
    const items = this.data.items || [];
    if (!items.length) return;
    auth
      .ensureLogin()
      .then(() => Promise.all(items.map((item) => api.addCart(item.productId, item.skuId, item.quantity))))
      .then(() => {
        getApp().refreshCartBadge();
        wx.switchTab({ url: "/pages/menu/menu" });
      })
      .catch((error) => auth.showError(error));
  },

  callShop() {
    const shop = getApp().bootstrap();
    if (!shop.servicePhone) {
      wx.showToast({ title: "门店未留电话", icon: "none" });
      return;
    }
    wx.makePhoneCall({ phoneNumber: shop.servicePhone });
  },

  onShareAppMessage() {
    return { title: "外卖订单 " + (this.data.order ? this.data.order.orderNo : ""), path: "/pages/home/home" };
  },
});