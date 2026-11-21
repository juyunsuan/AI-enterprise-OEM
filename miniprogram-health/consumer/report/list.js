const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const labels = require("../../utils/labels");

Page({
  data: {
    loading: true,
    reports: [],
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  async load() {
    try {
      await auth.requireLogin();
      const rows = (await api.reports()) || [];
      this.setData({
        loading: false,
        reports: rows.map((row) => ({
          ...row,
          typeLabel: labels.pick(labels.REPORT_TYPE_LABELS, row.type, "报告"),
          timeText: row.reportAt ? format.shortTime(row.reportAt) : "",
          unread: row.readStatus !== "READ",
        })),
      });
    } catch (error) {
      this.setData({ loading: false });
      if (error && error.code !== 401) {
        wx.showToast({ title: error.message || "报告加载失败", icon: "none" });
      }
    }
  },

  onReport(e) {
    wx.navigateTo({ url: "/consumer/report/detail?id=" + e.currentTarget.dataset.id });
  },
});
