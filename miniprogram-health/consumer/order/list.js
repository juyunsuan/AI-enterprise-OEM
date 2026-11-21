const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const labels = require("../../utils/labels");
const pay = require("../../utils/pay");

const TABS = [
  { key: "", label: "全部" },
  { key: "UNPAID", label: "待付款" },
  { key: "AFTER_SALE", label: "售后" },
  { key: "DONE", label: "已完成" },
];

Page({
  data: {
    tabs: TABS,
    status: "",
    list: [],
    page: 1,
    pageSize: 10,
    hasMore: true,
    loading: false,
  },

  onLoad(options) {
    const status = (options && options.status) || "";
    this.setData({ status });
    this.load(true);
  },

  onShow() {
    if (this.loaded) this.load(true);
  },

  onPullDownRefresh() {
    this.load(true).then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.loading || !this.data.hasMore) return;
    this.load(false);
  },

  onTab(e) {
    const status = e.currentTarget.dataset.key;
    if (status === this.data.status) return;
    this.setData({ status });
    this.load(true);
  },

  async load(reset) {
    if (this.data.loading) return;
    const page = reset ? 1 : this.data.page + 1;
    this.setData({ loading: true });
    try {
      await auth.requireLogin();
      this.loaded = true;
      const data = await api.orders({ status: this.data.status, page, pageSize: this.data.pageSize });
      const rows = ((data && data.list) || []).map((row) => ({
        ...row,
        statusLabel: labels.pick(labels.ORDER_STATUS_LABELS, row.status),
        payLabel: labels.pick(labels.PAY_STATUS_LABELS, row.payStatus),
        amountText: format.yuan(row.payAmountCents),
        timeText: format.shortTime(row.createdAt),
        canPay: row.status === "PENDING_PAYMENT",
      }));
      this.setData({
        list: reset ? rows : this.data.list.concat(rows),
        page,
        hasMore: rows.length >= this.data.pageSize,
        loading: false,
      });
    } catch (error) {
      this.setData({ loading: false });
      if (error && error.code !== 401) {
        wx.showToast({ title: error.message || "订单加载失败", icon: "none" });
      }
    }
  },

  onOrder(e) {
    wx.navigateTo({ url: "/consumer/order/detail?id=" + e.currentTarget.dataset.id });
  },

  async onPay(e) {
    const orderId = Number(e.currentTarget.dataset.id) || 0;
    const result = await pay.payOrder(orderId);
    if (result.paid) {
      wx.showToast({ title: "支付成功" });
      this.load(true);
    } else if (result.reason && result.reason !== "已取消支付") {
      wx.showToast({ title: result.reason, icon: "none", duration: 2500 });
    }
  },
});
