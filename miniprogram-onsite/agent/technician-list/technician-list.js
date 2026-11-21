const api = require("../../utils/api");
const agent = require("../../utils/agent");

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
      const result = await api.agentTechnicians({ page: page, pageSize: PAGE_SIZE });
      const rows = ((result && result.list) || []).map((row) => ({
        id: row.id,
        name: row.name,
        avatar: row.avatar,
        statusLabel: row.status === "ONLINE" ? "在岗" : "休息中",
        statusTone: row.status === "ONLINE" ? "tag-green" : "tag-orange",
        ratingText: Number(row.rating || 0).toFixed(1) + " 分 / " + row.reviewCount + " 条评价",
        orderText: "累计 " + row.orderCount + " 单",
        cityText: row.serviceCity || "",
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
        errorText: (error && error.message) || "技师列表加载失败",
      });
    }
  },
});
