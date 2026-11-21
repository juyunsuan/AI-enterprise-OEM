const api = require("../../utils/api");
const agent = require("../../utils/agent");
const format = require("../../utils/format");

const STATUS_LABELS = {
  PENDING: "待处理",
  AGREED: "已同意",
  REJECTED: "已驳回",
  REFUNDED: "已退款",
  CANCELLED: "已取消",
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
      const result = await api.agentRefunds({ page: page, pageSize: PAGE_SIZE });
      const rows = ((result && result.list) || []).map((row) => ({
        id: row.id,
        refundNo: row.refundNo,
        orderNo: row.orderNo || "",
        statusLabel: STATUS_LABELS[row.status] || row.status,
        timeText: format.shortTime(row.createdAt),
        reasonText: row.reason || "",
        applyText: format.yuan(row.applyCents),
        refundText: format.yuan(row.refundCents),
        tone:
          row.status === "REFUNDED"
            ? "tag-blue"
            : row.status === "PENDING"
              ? "tag-orange"
              : row.status === "REJECTED"
                ? "tag-red"
                : "tag-green",
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
        errorText: (error && error.message) || "退款记录加载失败",
      });
    }
  },
});
