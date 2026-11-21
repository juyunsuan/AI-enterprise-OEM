const api = require("../../utils/api");
const format = require("../../utils/format");
const labels = require("../../utils/labels");

const FILTERS = [
  { key: "", label: "全部" },
  { key: "REGISTER", label: "挂号" },
  { key: "CONSULT_TEXT", label: "图文问诊" },
  { key: "CONSULT_PHONE", label: "电话问诊" },
  { key: "CONSULT_VIDEO", label: "视频问诊" },
  { key: "EXAM", label: "体检" },
  { key: "GREEN", label: "绿通" },
  { key: "CONCIERGE", label: "私人医生" },
  { key: "REPORT_READ", label: "报告解读" },
  { key: "SIGN_PKG", label: "家医签约" },
  { key: "YEAR_CARD", label: "医生年卡" },
];

Page({
  data: {
    filters: FILTERS,
    bizType: "",
    list: [],
    page: 1,
    pageSize: 10,
    total: 0,
    hasMore: true,
    loading: false,
  },

  onLoad() {
    this.load(true);
  },

  onPullDownRefresh() {
    this.load(true).then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.loading || !this.data.hasMore) return;
    this.load(false);
  },

  onFilter(e) {
    const bizType = e.currentTarget.dataset.key;
    if (bizType === this.data.bizType) return;
    this.setData({ bizType });
    this.load(true);
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
        total: (data && data.total) || 0,
        hasMore: rows.length >= this.data.pageSize,
        loading: false,
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: (error && error.message) || "加载失败", icon: "none" });
    }
  },

  onSearch() {
    wx.navigateTo({ url: "/consumer/search/index" });
  },

  onService(e) {
    wx.navigateTo({ url: "/consumer/service/detail?id=" + e.currentTarget.dataset.id });
  },
});
