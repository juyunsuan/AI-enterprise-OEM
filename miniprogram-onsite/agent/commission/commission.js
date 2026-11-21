const api = require("../../utils/api");
const agent = require("../../utils/agent");
const format = require("../../utils/format");

const TABS = [
  { key: "all", label: "全部" },
  { key: "ACTIVE", label: "已生效" },
  { key: "PENDING", label: "待生效" },
  { key: "REVERSED", label: "已冲销" },
];

const STATUS_LABELS = {
  PENDING: "待生效",
  ACTIVE: "已生效",
  REVERSED: "已冲销",
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

  switchTab(event) {
    const key = event.currentTarget.dataset.key;
    if (!key || key === this.data.activeKey) return;
    this.setData({ activeKey: key, list: [], page: 1, finished: false });
    this.fetch(1);
  },

  refresh() {
    this.setData({ list: [], page: 1, finished: false });
    return this.fetch(1);
  },

  async fetch(page) {
    this.setData({ loading: true, errorText: "" });
    try {
      const query = { page: page, pageSize: PAGE_SIZE };
      if (this.data.activeKey !== "all") query.status = this.data.activeKey;
      const result = await api.agentCommissions(query);
      const rows = ((result && result.list) || []).map((row) => ({
        id: row.id,
        orderNo: row.orderNo || "订单 " + row.orderId,
        timeText: format.shortTime(row.createdAt),
        rateText: row.totalRate ? "费率 " + row.totalRate + "%" : "",
        amountText: format.yuan(row.amountCents),
        reversedText: Number(row.reversedCents) ? "已冲销 " + format.yuan(row.reversedCents) : "",
        statusText: STATUS_LABELS[row.status] || row.status,
        tone:
          row.status === "ACTIVE" ? "tag-green" : row.status === "REVERSED" ? "tag-red" : "tag-orange",
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
        errorText: (error && error.message) || "佣金加载失败",
      });
    }
  },

  copyOrderNo(event) {
    const value = event.currentTarget.dataset.no;
    if (!value) return;
    wx.setClipboardData({ data: value });
  },
});
