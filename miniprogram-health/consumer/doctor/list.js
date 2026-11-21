const api = require("../../utils/api");
const labels = require("../../utils/labels");

Page({
  data: {
    keyword: "",
    list: [],
    page: 1,
    pageSize: 10,
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

  onKeyword(e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearch() {
    this.load(true);
  },

  async load(reset) {
    if (this.data.loading) return;
    const page = reset ? 1 : this.data.page + 1;
    this.setData({ loading: true });
    try {
      const data = await api.practitioners({
        keyword: this.data.keyword,
        page,
        pageSize: this.data.pageSize,
      });
      const rows = ((data && data.list) || []).map((row) => ({
        ...row,
        roleLabel: labels.pick(
          { DOCTOR: "医生", MANAGER: "健管师", PHARMACIST: "药师", GUIDE: "导诊师" },
          row.role,
        ),
        scoreText: row.score > 0 ? row.score.toFixed(1) : "",
        goodAtText: (row.goodAt || []).slice(0, 3).join("、"),
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

  onDoctor(e) {
    wx.navigateTo({ url: "/consumer/doctor/detail?id=" + e.currentTarget.dataset.id });
  },
});
