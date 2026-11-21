const app = getApp();
const api = require("../../utils/api");
const auth = require("../../utils/auth");
const fmt = require("../../utils/format");

const PAGE_SIZE = 10;

const FILTERS = [
  { key: "", label: "全部" },
  { key: "PENDING", label: "待支付" },
  { key: "PAID", label: "已支付" },
];

function viewModel(order) {
  return {
    orderNo: order.orderNo,
    mobile: (order.sender && order.sender.mobile) || "",
    companyName: order.companyName,
    stateText: fmt.orderStateText(order),
    stateColor: fmt.stateColor(order),
    feeText: fmt.money(order.totalAmount),
    timeText: fmt.time(order.createdAt),
    routeText:
      ((order.sender && order.sender.province) || "-") +
      " → " +
      ((order.receiver && order.receiver.province) || "-"),
    receiverName: (order.receiver && order.receiver.name) || "",
    trackingNo: order.trackingNo || "",
    unpaid: order.payState === "PENDING",
  };
}

Page({
  data: {
    filters: FILTERS,
    filter: "",
    loading: true,
    loadingMore: false,
    error: "",
    loginError: "",
    needSite: false,
    list: [],
    page: 1,
    total: 0,
    hasMore: false,
  },

  onShow() {
    this.refresh();
  },

  onPullDownRefresh() {
    this.refresh().then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore) this.load(this.data.page + 1);
  },

  switchFilter(event) {
    const filter = event.currentTarget.dataset.key || "";
    if (filter === this.data.filter) return;
    this.setData({ filter: filter });
    this.refresh();
  },

  refresh() {
    this.setData({ loading: true, error: "", loginError: "", needSite: false });
    return app
      .ensureReady()
      .then(() => {
        if (app.globalData.needSite) {
          this.setData({ loading: false, needSite: true });
          return;
        }
        return auth.ensureLogin().then(() => this.load(1));
      })
      .catch((error) => {
        this.setData({
          loading: false,
          loginError: error.message || "登录失败，请重新进入小程序",
        });
      });
  },

  load(page) {
    this.setData(page === 1 ? { loading: true } : { loadingMore: true });
    return api
      .myOrders({
        payState: this.data.filter,
        page: page,
        pageSize: PAGE_SIZE,
      })
      .then((result) => {
        const rows = ((result && result.list) || []).map(viewModel);
        const list = page === 1 ? rows : this.data.list.concat(rows);
        const total = (result && result.total) || 0;
        this.setData({
          loading: false,
          loadingMore: false,
          list: list,
          page: page,
          total: total,
          hasMore: list.length < total,
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          loadingMore: false,
          error: error.message || "订单加载失败",
        });
      });
  },

  openDetail(event) {
    const orderNo = event.currentTarget.dataset.order;
    const mobile = event.currentTarget.dataset.mobile;
    wx.navigateTo({
      url:
        "/pages/order-detail/order-detail?orderNo=" +
        encodeURIComponent(orderNo) +
        "&mobile=" +
        encodeURIComponent(mobile || ""),
    });
  },

  goCreate() {
    wx.navigateTo({ url: "/pages/create/create" });
  },

  retry() {
    this.refresh();
  },

  goPickSite() {
    app.goPickSite();
  },
});
