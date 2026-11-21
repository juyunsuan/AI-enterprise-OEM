const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const labels = require("../../utils/labels");

Page({
  data: {
    loading: true,
    tasks: [],
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
      const rows = (await api.followups()) || [];
      this.setData({
        loading: false,
        tasks: rows.map((row) => ({
          ...row,
          wayLabel: labels.pick(labels.FOLLOWUP_WAY_LABELS, row.way),
          dueText: row.dueAt ? format.dateTime(row.dueAt) : "未设置截止时间",
        })),
      });
    } catch (error) {
      this.setData({ loading: false });
      if (error && error.code !== 401) {
        wx.showToast({ title: error.message || "随访任务加载失败", icon: "none" });
      }
    }
  },

  onTask(e) {
    wx.navigateTo({ url: "/consumer/followup/detail?id=" + e.currentTarget.dataset.id });
  },
});
