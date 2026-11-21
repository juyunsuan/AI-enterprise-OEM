const api = require("../../utils/api");
const format = require("../../utils/format");
const labels = require("../../utils/labels");

Page({
  data: {
    bizType: "",
    title: "服务",
    list: [],
    page: 1,
    pageSize: 10,
    hasMore: true,
    loading: false,
  },

  onLoad(options) {
    const bizType = (options && options.bizType) || "";
    const title = labels.pick(labels.BIZ_LABELS, bizType, "服务");
    wx.setNavigationBarTitle({ title });
    this.setData({ bizType, title });
    this.load(true);
  },

  onPullDownRefresh() {
    this.load(true).then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.loading || !this.data.hasMore) return;
    this.load(false);
  },

  async load(reset) {
    if (this.data.loading) return;
    const page = reset ? 1 : this.data.page + 1;
    this.setData({ loading: true });
    try {
      const data = await api.services({
        keyword: "",
        bizType: this.data.bizType,
        page,
        pageSize: this.data.pageSize,
      });
      const rows = ((data && data.list) || []).map((row) => ({
        ...row,
        priceText: format.yuan(row.priceCents),
        originText: row.originPriceCents > row.priceCents ? format.yuan(row.originPriceCents) : "",
        bizLabel: labels.pick(labels.BIZ_LABELS, row.bizType),
        durationText: row.durationMinutes ? format.duration(row.durationMinutes) : "",
      }));
      this.setData({
        list: reset ? rows : this.data.list.concat(rows),
        page,
        hasMore: rows.length >= this.data.pageSize,
        loading: false,
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: (error && error.message) || "加载失败", icon: "none" });
    }
  },

  onService(e) {
    wx.navigateTo({ url: "/consumer/service/detail?id=" + e.currentTarget.dataset.id });
  },

  onSearch() {
    wx.navigateTo({ url: "/consumer/search/index" });
  },
});
