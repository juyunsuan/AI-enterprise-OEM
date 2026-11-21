const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

const TABS = [
  { key: "ALL", label: "全部" },
  { key: "PENDING_PAYMENT", label: "待付款" },
  { key: "PAID", label: "待发货" },
  { key: "SHIPPED", label: "待收货" },
  { key: "COMPLETED", label: "已完成" },
];

const PAGE_SIZE = 10;

Page({
  data: {
    tabs: TABS,
    status: "ALL",
    orders: [],
    page: 1,
    total: 0,
    loading: false,
    noMore: false,
    error: "",
  },

  onLoad(query) {
    const status = String(query.status || "ALL");
    this.setData({ status: status });
  },

  onShow() {
    this.load(false);
  },

  onReachBottom() {
    this.load(true);
  },

  onPullDownRefresh() {
    this.load(false).then(() => wx.stopPullDownRefresh());
  },

  switchTab(event) {
    const status = event.currentTarget.dataset.status;
    if (status === this.data.status) return;
    this.setData({ status: status, orders: [], page: 1, total: 0 });
    this.load(false);
  },

  load(append) {
    if (this.data.loading) return Promise.resolve();
    const page = append ? this.data.page + 1 : 1;
    this.setData({ loading: true });
    return api
      .orders(this.data.status, page, PAGE_SIZE)
      .then((data) => {
        const list = ((data && data.list) || []).map((row) => this.decorate(row));
        const orders = append ? this.data.orders.concat(list) : list;
        const total = Number((data && data.total) || 0);
        this.setData({
          orders: orders,
          page: page,
          total: total,
          noMore: orders.length >= total,
          loading: false,
          error: "",
        });
      })
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "订单加载失败" });
      });
  },

  decorate(row) {
    const items = row.items || [];
    return {
      id: row.id,
      orderNo: row.orderNo,
      status: row.status,
      statusLabel: format.ORDER_STATUS_LABELS[row.status] || row.status,
      payStatus: row.payStatus,
      refundStatus: row.refundStatus,
      refundLabel: format.REFUND_STATUS_LABELS[row.refundStatus] || "",
      payAmountText: format.money(row.payAmount),
      itemCount: Number(row.itemCount || items.length || 0),
      createdAtText: format.dateTime(row.createdAt),
      expireText: row.status === "PENDING_PAYMENT" ? format.countdown(row.expireAt) : "",
      thumbs: items.slice(0, 3).map((item) => ({
        image: item.image,
        title: item.title,
        skuName: item.skuName,
        priceText: format.money(item.price),
        quantity: item.quantity,
      })),
      summary: items
        .slice(0, 2)
        .map((item) => item.title + " ×" + item.quantity)
        .join(" / "),
    };
  },

  openDetail(event) {
    wx.navigateTo({ url: "/pages/order/detail?id=" + event.currentTarget.dataset.id });
  },

  goPay(event) {
    wx.navigateTo({ url: "/pages/order/pay?id=" + event.currentTarget.dataset.id });
  },

  cancel(event) {
    const id = Number(event.currentTarget.dataset.id);
    wx.showModal({
      title: "取消订单",
      content: "取消后库存会退回，确定吗？",
      success: (res) => {
        if (!res.confirm) return;
        api
          .cancelOrder(id)
          .then(() => {
            wx.showToast({ title: "订单已取消", icon: "none" });
            this.load(false);
          })
          .catch((error) => auth.showError(error));
      },
    });
  },

  receive(event) {
    const id = Number(event.currentTarget.dataset.id);
    wx.showModal({
      title: "确认收货",
      content: "请收到货后再确认，确认后进入售后时限倒计时。",
      success: (res) => {
        if (!res.confirm) return;
        api
          .receiveOrder(id)
          .then(() => {
            wx.showToast({ title: "已确认收货", icon: "none" });
            this.load(false);
          })
          .catch((error) => auth.showError(error));
      },
    });
  },

  goIndex() {
    wx.switchTab({ url: "/pages/index/index" });
  },
});
