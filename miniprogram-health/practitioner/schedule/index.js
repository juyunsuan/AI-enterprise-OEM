const api = require("../../utils/api");
const format = require("../../utils/format");
const staff = require("../../utils/staff");

Page({
  data: {
    loading: true,
    list: [],
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  async load() {
    try {
      await staff.requireStaff();
      const data = await api.staffSchedule({});
      this.setData({
        loading: false,
        list: ((data && data.list) || []).map((day) => ({
          ...day,
          dayLabel: format.dayLabel(day.date + "T00:00:00"),
          shiftsText: (day.shifts || [])
            .map((row) => row.startText + "-" + row.endText + "（" + row.totalQuota + "）")
            .join("  "),
          slots: (day.slots || []).map((row) => ({
            ...row,
            text: row.startTime + "-" + row.endTime,
            statusLabel: staff.pick(staff.SLOT_STATUS_LABELS, row.status),
          })),
        })),
      });
    } catch (error) {
      this.setData({ loading: false });
      staff.handleError(error, "排班加载失败");
    }
  },

  onSlot(e) {
    const id = e.currentTarget.dataset.id;
    const status = e.currentTarget.dataset.status;
    if (status === "BOOKED" || status === "LOCKED") {
      wx.showToast({ title: "该号源已被占用", icon: "none" });
      return;
    }
    const blocked = status !== "BLOCKED";
    wx.showModal({
      title: blocked ? "停诊该号源" : "恢复该号源",
      content: blocked ? "停诊后顾客不能再预约这个时段。" : "恢复后该时段重新开放预约。",
      success: (res) => {
        if (!res.confirm) return;
        api
          .staffBlockSlot({ slotId: id, blocked, reason: blocked ? "医护停诊" : "" })
          .then(() => {
            wx.showToast({ title: blocked ? "已停诊" : "已恢复" });
            this.load();
          })
          .catch((error) => staff.handleError(error, "操作失败"));
      },
    });
  },
});
