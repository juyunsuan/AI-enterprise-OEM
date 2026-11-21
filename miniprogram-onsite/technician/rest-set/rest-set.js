const api = require("../../utils/api");
const staff = require("../../utils/staff");
const format = require("../../utils/format");

function pad(value) {
  return value < 10 ? "0" + value : String(value);
}

function dayKeyOf(date) {
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

function clockOf(value) {
  const date = format.toDate(value);
  if (!date) return "—";
  return pad(date.getHours()) + ":" + pad(date.getMinutes());
}

const ROLE_TEXT = {
  STAFF: "本人设置",
  OWNER: "店主设置",
  SYSTEM: "系统生成",
};

/**
 * 休息段：
 * rest/save 的 schema 只有 day + startAt + endAt + reason，**没有整天标记**，
 * 所以「整天」在这里落成 00:00-23:59 的一段，并如实告诉用户这是占满全天的方式。
 * 后端也不做与已排订单的冲突校验，冲突只在档期里体现（休息段会盖住可约时段）。
 */
Page({
  data: {
    loading: true,
    list: [],
    day: dayKeyOf(new Date()),
    startAt: "12:00",
    endAt: "13:00",
    allDay: false,
    reason: "",
    submitting: false,
    errorText: "",
  },

  onLoad() {
    this.gate = staff.ensureStaff();
  },

  async onShow() {
    const gate = this.gate || staff.ensureStaff();
    this.gate = null;
    let profile = null;
    try {
      profile = await gate;
    } catch (error) {
      wx.showToast({ title: (error && error.message) || "登录失败，请稍后重试", icon: "none" });
      return;
    }
    if (!profile) return;
    await this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  async load() {
    this.setData({ loading: true });
    try {
      // 不带 day：接口的 day 过滤只有下界（含之后的休息段），这里要一次看全
      const result = await api.staffRestList({});
      const rows = (result && result.list) || [];
      const list = rows.map((row) => ({
        id: row.id,
        dayText: format.dayLabel(row.startAt),
        rangeText: row.allDay ? "整天" : clockOf(row.startAt) + " - " + clockOf(row.endAt),
        reason: row.reason || "",
        roleText: ROLE_TEXT[row.createdByRole] || row.createdByRole || "",
      }));
      this.setData({ loading: false, list: list });
    } catch (error) {
      this.setData({
        loading: false,
        list: [],
        errorText: (error && error.message) || "休息段加载失败",
      });
    }
  },

  pickDay(event) {
    this.setData({ day: event.detail.value, errorText: "" });
  },

  pickStart(event) {
    this.setData({ startAt: event.detail.value, errorText: "" });
  },

  pickEnd(event) {
    this.setData({ endAt: event.detail.value, errorText: "" });
  },

  toggleAllDay(event) {
    this.setData({ allDay: !!event.detail.value, errorText: "" });
  },

  onReasonInput(event) {
    this.setData({ reason: event.detail.value });
  },

  async save() {
    if (this.data.submitting) return;
    const day = this.data.day;
    const startAt = this.data.allDay ? "00:00" : this.data.startAt;
    const endAt = this.data.allDay ? "23:59" : this.data.endAt;
    const reason = String(this.data.reason || "").trim();
    if (!day) {
      this.setData({ errorText: "请选择休息日期" });
      return;
    }
    if (reason.length > 200) {
      this.setData({ errorText: "事由最多 200 个字" });
      return;
    }
    if (startAt >= endAt) {
      this.setData({ errorText: "休息结束时间必须晚于开始时间" });
      return;
    }
    this.setData({ submitting: true, errorText: "" });
    wx.showLoading({ title: "保存中", mask: true });
    try {
      await api.staffRestSave({
        day: day,
        startAt: startAt,
        endAt: endAt,
        reason: reason,
      });
      wx.hideLoading();
      this.setData({ submitting: false });
      wx.showToast({ title: "已保存", icon: "success" });
      await this.load();
    } catch (error) {
      wx.hideLoading();
      const message = (error && error.message) || "保存失败，请稍后重试";
      const hint = message.indexOf("冲突") >= 0 ? "（请先去接单列表处理已排订单，再重试）" : "";
      this.setData({ submitting: false, errorText: message + hint });
    }
  },

  remove(event) {
    const id = Number(event.currentTarget.dataset.id) || 0;
    if (!id) return;
    wx.showModal({
      title: "删除休息段",
      content: "删除后该时段恢复为可约，确定删除？",
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: "删除中", mask: true });
        try {
          await api.staffRestRemove(id);
          wx.hideLoading();
          wx.showToast({ title: "已删除", icon: "success" });
          await this.load();
        } catch (error) {
          wx.hideLoading();
          this.setData({ errorText: (error && error.message) || "删除失败，请稍后重试" });
        }
      },
    });
  },
});
