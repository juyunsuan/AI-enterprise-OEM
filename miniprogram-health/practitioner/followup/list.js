const api = require("../../utils/api");
const format = require("../../utils/format");
const staff = require("../../utils/staff");

const TABS = [
  { key: "PENDING", label: "待随访" },
  { key: "OVERDUE", label: "已逾期" },
  { key: "DONE", label: "已完成" },
  { key: "all", label: "全部" },
];

Page({
  data: {
    loading: true,
    status: "PENDING",
    tabs: TABS,
    list: [],
    total: 0,
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  onTab(e) {
    this.setData({ status: e.currentTarget.dataset.key, loading: true, list: [] });
    this.load();
  },

  async load() {
    try {
      await staff.requireStaff();
      const data = await api.staffFollowups({ status: this.data.status, pageSize: 50 });
      this.setData({
        loading: false,
        list: ((data && data.list) || []).map((row) => ({
          ...row,
          statusLabel: staff.pick(staff.TASK_STATUS_LABELS, row.status),
          dueText: format.dateTime(row.dueAt),
          sourceLabel: row.source === "ALERT" ? "预警触发" : row.source === "MANUAL" ? "人工创建" : "方案计划",
        })),
        total: (data && data.total) || 0,
      });
    } catch (error) {
      this.setData({ loading: false });
      staff.handleError(error, "随访加载失败");
    }
  },

  onTask(e) {
    wx.navigateTo({ url: "/practitioner/followup/detail?id=" + e.currentTarget.dataset.id });
  },
});
