const api = require("../../utils/api");
const format = require("../../utils/format");
const staff = require("../../utils/staff");

Page({
  data: {
    loading: true,
    patient: null,
    metrics: [],
    metricNames: [],
    metricIndex: 0,
    value: "",
    note: "",
    submitting: false,
    logs: [],
  },

  onLoad(options) {
    this.patientId = Number(options && options.patientId) || 0;
    if (!this.patientId) {
      wx.showToast({ title: "请先从就诊人档案进入", icon: "none" });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.load();
  },

  async load() {
    try {
      await staff.requireStaff();
      const data = await api.staffMetrics(this.patientId);
      const metrics = (data && data.list) || [];
      this.setData({
        loading: false,
        patient: (data && data.patient) || null,
        metrics: metrics.map((row) => ({
          ...row,
          rangeText: row.normalMax ? row.normalMin + "-" + row.normalMax + (row.unit || "") : "",
        })),
        metricNames: metrics.map((row) =>
          row.unit ? row.name + "（" + row.unit + "）" : row.name,
        ),
        logs: ((data && data.logs) || []).map((row) => ({
          ...row,
          valueText: row.value + (row.unit || ""),
          timeText: format.dateTime(row.measuredAt),
        })),
      });
    } catch (error) {
      this.setData({ loading: false });
      staff.handleError(error, "指标加载失败");
    }
  },

  onPickMetric(e) {
    this.setData({ metricIndex: Number(e.detail.value) || 0 });
  },

  onValue(e) {
    this.setData({ value: e.detail.value });
  },

  onNote(e) {
    this.setData({ note: e.detail.value });
  },

  async onSubmit() {
    if (this.data.submitting) return;
    const metric = this.data.metrics[this.data.metricIndex];
    const value = Number(this.data.value);
    if (!metric) {
      wx.showToast({ title: "本店尚未配置指标", icon: "none" });
      return;
    }
    if (!Number.isFinite(value) || String(this.data.value).trim() === "") {
      wx.showToast({ title: "请填写有效读数", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    try {
      const now = new Date().toISOString();
      await api.staffSaveMetric({
        patientId: this.patientId,
        metricId: metric.id,
        value,
        measuredAt: now,
        note: String(this.data.note || "").trim(),
      });
      wx.showToast({ title: "已记录" });
      this.setData({ value: "", note: "", submitting: false });
      this.load();
    } catch (error) {
      this.setData({ submitting: false });
      staff.handleError(error, "保存失败");
    }
  },
});
