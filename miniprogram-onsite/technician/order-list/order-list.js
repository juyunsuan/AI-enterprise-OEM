const api = require("../../utils/api");
const staff = require("../../utils/staff");
const format = require("../../utils/format");

/** 与后端 onsite.staff-api.ts 的 status 过滤逐字对齐：一次只查一个状态。 */
const TABS = [
  { key: "all", label: "全部" },
  { key: "PAID", label: "待接单" },
  { key: "ACCEPTED", label: "已接单" },
  { key: "EN_ROUTE", label: "服务出发" },
  { key: "ON_SITE", label: "已到达" },
  { key: "SERVING", label: "服务中" },
  { key: "COMPLETED", label: "已完成" },
];

const STATUS_LABELS = {
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

const PAGE_SIZE = 20;

Page({
  data: {
    tabs: TABS,
    activeKey: "all",
    list: [],
    page: 1,
    total: 0,
    loading: true,
    finished: false,
    errorText: "",
  },

  onLoad(query) {
    const wanted = query && query.status;
    for (let i = 0; i < TABS.length; i += 1) {
      if (TABS[i].key === wanted) this.setData({ activeKey: wanted });
    }
    this.gate = staff.ensureStaff();
  },

  async onShow() {
    const gate = this.gate || staff.ensureStaff();
    this.gate = null;
    let profile = null;
    try {
      profile = await gate;
    } catch (error) {
      wx.showToast({ title: (error && error.message) || "登录失败，请稍后重试", icon: "none" });
      return;
    }
    if (!profile) return;
    await this.refresh();
  },

  onPullDownRefresh() {
    this.refresh().then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.finished || this.data.loading) return;
    this.fetch(this.data.page + 1);
  },

  switchTab(event) {
    const key = event.currentTarget.dataset.key;
    if (!key || key === this.data.activeKey) return;
    this.setData({ activeKey: key });
    this.refresh();
  },

  async refresh() {
    this.setData({ finished: false, page: 1 });
    await this.fetch(1);
  },

  async fetch(page) {
    if (this.data.loading && page > 1) return;
    this.setData({ loading: true, errorText: "" });
    try {
      const result = await api.staffOrders({
        page: page,
        pageSize: PAGE_SIZE,
        status: this.data.activeKey,
      });
      const rows = (result && result.list) || [];
      const mapped = rows.map((row) => {
        const titles = row.serviceTitles || [];
        return {
          id: row.id,
          orderNo: row.orderNo,
          serviceText: titles.length ? titles.join("、") : "服务明细见详情",
          timeText: format.dateTime(row.startAt),
          amountText: format.yuan(row.payAmountCents),
          statusLabel: STATUS_LABELS[row.status] || row.status,
          customerText: row.customerName || "",
        };
      });
      const list = page === 1 ? mapped : this.data.list.concat(mapped);
      const total = Number(result && result.total) || 0;
      this.setData({
        list: list,
        total: total,
        page: page,
        loading: false,
        finished: list.length >= total || rows.length < PAGE_SIZE,
      });
    } catch (error) {
      this.setData({
        loading: false,
        errorText: (error && error.message) || "订单加载失败",
      });
    }
  },

  openOrder(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: "/technician/order-detail/order-detail?orderId=" + id });
  },

  copyOrderNo(event) {
    const orderNo = event.currentTarget.dataset.no;
    if (!orderNo) return;
    wx.setClipboardData({ data: orderNo });
  },
});
