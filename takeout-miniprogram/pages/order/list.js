const api = require("../../utils/api");
const auth = require("../../utils/auth");
const fmt = require("../../utils/format");

const TABS = [
  { key: "ALL", label: "全部" },
  { key: "PENDING_PAYMENT", label: "待支付" },
  { key: "PAID", label: "备餐中" },
  { key: "SHIPPED", label: "待取餐/配送" },
  { key: "COMPLETED", label: "已完成" },
];

function decorate(order) {
  const items = order.items || [];
  return Object.assign({}, order, {
    statusText: fmt.statusText(order),
    statusHint: fmt.statusHint(order),
    modeText: fmt.modeText(order.orderMode),
    payAmountText: fmt.money(order.payAmount),
    createdAtText: fmt.dateTime(order.createdAt),
    expireText: order.expireAt ? fmt.clock(order.expireAt) : "",
    itemsText: items
      .map((item) => item.title + (item.skuName ? "(" + item.skuName + ")" : "") + " ×" + item.quantity)
      .join("、"),
    canPay: order.status === "PENDING_PAYMENT",
    canCancel: order.status === "PENDING_PAYMENT",
    canReceive: order.status === "SHIPPED",
    canAgain: order.status === "COMPLETED" || order.status === "CANCELLED",
    countdownText:
      order.status === "PENDING_PAYMENT" ? fmt.countdown(order.expireAt) : "",
  });
}

Page({
  data: {
    tabs: TABS,
    tab: "ALL",
    page: 1,
    list: [],
    loading: false,
    hasMore: true,
    error: "",
  },

  onLoad(query) {
    const tab = String(query.tab || "");
    if (TABS.some((item) => item.key === tab)) this.setData({ tab: tab });
  },

  onShow() {
    const app = getApp();
    const wanted = app.globalData.orderTab;
    if (wanted) {
      app.globalData.orderTab = "";
      if (TABS.some((item) => item.key === wanted)) this.setData({ tab: wanted });
    }
    this.load(true);
    app.refreshCartBadge();
  },

  onPullDownRefresh() {
    this.load(true).then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.loading || !this.data.hasMore) return;
    this.load(false);
  },

  onUnload() {
    this.stopTick();
  },

  onHide() {
    this.stopTick();
  },

  pickTab(event) {
    const key = event.currentTarget.dataset.key;
    if (key === this.data.tab) return;
    this.setData({ tab: key });
    this.load(true);
  },

  load(reset) {
    if (this.data.loading) return Promise.resolve();
    const page = reset ? 1 : this.data.page;
    this.setData({ loading: true, error: reset ? "" : this.data.error });
    return auth
      .ensureLogin()
      .then(() => api.orders(this.data.tab, page, 10))
      .then((data) => {
        const rows = ((data && data.list) || []).map(decorate);
        const list = reset ? rows : this.data.list.concat(rows);
        const total = Number((data && data.total) || list.length);
        this.setData({
          list: list,
          page: page + 1,
          hasMore: list.length < total,
          loading: false,
        });
        this.startTick();
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "订单加载失败",
        });
      });
  },

  startTick() {
    this.stopTick();
    if (!this.data.list.some((order) => order.canPay)) return;
    this.tick();
    this.timer = setInterval(() => this.tick(), 1000);
  },

  stopTick() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  tick() {
    let alive = false;
    const list = this.data.list.map((order) => {
      if (!order.canPay || !order.expireAt) return order;
      const text = fmt.countdown(order.expireAt);
      if (text && text !== "00:00") alive = true;
      return Object.assign({}, order, { countdownText: text });
    });
    this.setData({ list: list });
    if (!alive) this.stopTick();
  },

  goDetail(event) {
    const id = event.currentTarget.dataset.id;
    wx.navigateTo({ url: "/pages/order/detail?id=" + id });
  },

  payOrder(event) {
    const id = Number(event.currentTarget.dataset.id);
    api
      .payParams(id)
      .then((data) => {
        if (!data || !data.payParams) {
          wx.showToast({ title: "该订单无需在线支付", icon: "none" });
          this.load(true);
          return;
        }
        wx.requestPayment(
          Object.assign({}, data.payParams, {
            success: () => {
              wx.showToast({ title: "支付成功", icon: "success" });
              this.load(true);
            },
            fail: () => wx.showToast({ title: "支付未完成", icon: "none" }),
          }),
        );
      })
      .catch((error) => auth.showError(error));
  },

  cancelOrder(event) {
    const id = Number(event.currentTarget.dataset.id);
    wx.showModal({
      title: "取消订单",
      content: "取消后不可恢复，确定取消这单吗？",
      success: (result) => {
        if (!result.confirm) return;
        api
          .cancelOrder(id)
          .then(() => {
            wx.showToast({ title: "订单已取消", icon: "none" });
            this.load(true);
          })
          .catch((error) => auth.showError(error));
      },
    });
  },

  receiveOrder(event) {
    const id = Number(event.currentTarget.dataset.id);
    wx.showModal({
      title: "确认完成",
      content: "确认已取餐/已收到餐品？",
      success: (result) => {
        if (!result.confirm) return;
        api
          .receiveOrder(id)
          .then(() => {
            wx.showToast({ title: "订单已完成", icon: "success" });
            this.load(true);
          })
          .catch((error) => auth.showError(error));
      },
    });
  },

  again(event) {
    const id = Number(event.currentTarget.dataset.id);
    const order = this.data.list.filter((item) => item.id === id)[0];
    if (!order || !order.items || !order.items.length) return;
    auth
      .ensureLogin()
      .then(() => {
        const tasks = order.items.map((item) => api.addCart(item.productId, item.skuId, item.quantity));
        return Promise.all(tasks);
      })
      .then(() => {
        getApp().refreshCartBadge();
        wx.switchTab({ url: "/pages/menu/menu" });
      })
      .catch((error) => auth.showError(error));
  },

  goMenu() {
    wx.switchTab({ url: "/pages/menu/menu" });
  },

  onShareAppMessage() {
    return { title: "我的外卖订单", path: "/pages/order/list" };
  },
});