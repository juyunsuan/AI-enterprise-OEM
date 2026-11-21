const api = require("../../utils/api");
const agent = require("../../utils/agent");
const format = require("../../utils/format");

/** 状态文案与技师端订单列表同口径；代理只看不改，所以没有操作按钮。 */
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
    list: [],
    page: 1,
    total: 0,
    loading: true,
    finished: false,
    errorText: "",
  },

  onLoad() {
    this.gate = agent.ensureAgent();
  },

  async onShow() {
    const gate = this.gate || agent.ensureAgent();
    this.gate = null;
    const profile = await gate.catch(() => null);
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

  refresh() {
    this.setData({ list: [], page: 1, finished: false });
    return this.fetch(1);
  },

  async fetch(page) {
    this.setData({ loading: true, errorText: "" });
    try {
      const result = await api.agentOrders({ page: page, pageSize: PAGE_SIZE });
      const rows = ((result && result.list) || []).map((row) => ({
        id: row.id,
        orderNo: row.orderNo,
        statusLabel: STATUS_LABELS[row.status] || row.status,
        timeText: format.dateTime(row.startAt),
        staffText: row.staffName || "待派单",
        customerText: row.customerName || "",
        payText: format.yuan(row.payAmountCents),
        commissionText: format.yuan(row.commissionCents),
        reversedText: Number(row.reversedCents) ? "已冲销 " + format.yuan(row.reversedCents) : "",
      }));
      const merged = page > 1 ? this.data.list.concat(rows) : rows;
      const total = (result && result.total) || 0;
      this.setData({
        loading: false,
        list: merged,
        total: total,
        page: page,
        finished: merged.length >= total,
      });
    } catch (error) {
      this.setData({
        loading: false,
        errorText: (error && error.message) || "订单加载失败",
      });
    }
  },

  copyOrderNo(event) {
    const value = event.currentTarget.dataset.no;
    if (!value) return;
    wx.setClipboardData({ data: value });
  },
});
