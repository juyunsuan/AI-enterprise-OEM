const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const session = require("../../utils/session");

const nowParts = () => {
  const now = new Date();
  const pad = (v) => (v < 10 ? "0" + v : String(v));
  return {
    date: now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate()),
    time: pad(now.getHours()) + ":" + pad(now.getMinutes()),
  };
};

Page({
  data: {
    loading: true,
    patients: [],
    patientNames: [],
    patientIndex: -1,
    patientId: 0,
    metrics: [],
    metricNames: [],
    metricIndex: 0,
    metricId: 0,
    metric: null,
    trend: [],
    logs: [],
    today: nowParts().date,
    form: { value: "", date: nowParts().date, time: nowParts().time, note: "" },
    saving: false,
  },

  onLoad(options) {
    this.presetMetricId = Number(options && options.metricId) || 0;
    this.presetPatientId = Number(options && options.patientId) || 0;
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
      const [patients, metrics] = await Promise.all([api.patients(), api.metrics()]);
      const list = patients || [];
      let index = list.findIndex(
        (row) => row.id === (this.presetPatientId || session.getPatientId()),
      );
      if (index < 0) index = list.findIndex((row) => row.isDefault);
      if (index < 0 && list.length) index = 0;
      const metricList = metrics || [];
      let metricIndex = metricList.findIndex((row) => row.id === this.presetMetricId);
      if (metricIndex < 0) metricIndex = 0;
      const patientId = index >= 0 ? list[index].id : 0;
      const metric = metricList[metricIndex] || null;
      this.setData({
        loading: false,
        patients: list,
        patientNames: list.map((row) => row.name),
        patientIndex: index,
        patientId,
        metrics: metricList,
        metricNames: metricList.map((row) => row.name),
        metricIndex,
        metricId: metric ? metric.id : 0,
        metric,
      });
      if (patientId && metric) {
        await this.loadTrend(patientId, metric.id);
        await this.loadLogs(patientId);
      }
    } catch (error) {
      this.setData({ loading: false });
      if (error && error.code !== 401) {
        wx.showToast({ title: error.message || "指标加载失败", icon: "none" });
      }
    }
  },

  async loadTrend(patientId, metricId) {
    try {
      const data = (await api.metricTrend(patientId, metricId)) || {};
      const points = data.points || [];
      const values = points.map((point) => Number(point.value) || 0);
      const max = Math.max.apply(null, values.concat([0]));
      const min = Math.min.apply(null, values.concat([0]));
      const span = max - min || 1;
      this.setData({
        trend: points.slice(-14).map((point) => ({
          ...point,
          valueText: format.number(point.value),
          timeText: format.shortTime(point.measuredAt),
          barHeight:
            24 + Math.round(((Number(point.value) - min) / span) * 160),
        })),
      });
    } catch (error) {
      this.setData({ trend: [] });
    }
  },

  async loadLogs(patientId) {
    try {
      const rows = (await api.metricLogs(patientId)) || [];
      const nameMap = {};
      this.data.metrics.forEach((row) => {
        nameMap[row.id] = row.name + (row.unit ? "（" + row.unit + "）" : "");
      });
      this.setData({
        logs: rows.slice(0, 30).map((row) => ({
          ...row,
          nameText: nameMap[row.metricId] || row.metricKey,
          valueText: row.valueText || format.number(row.value),
          timeText: format.shortTime(row.measuredAt),
        })),
      });
    } catch (error) {
      this.setData({ logs: [] });
    }
  },

  async onPatient(e) {
    const index = Number(e.detail.value) || 0;
    const patient = this.data.patients[index];
    if (!patient) return;
    session.setPatientId(patient.id);
    this.setData({ patientIndex: index, patientId: patient.id });
    if (this.data.metricId) {
      await this.loadTrend(patient.id, this.data.metricId);
      await this.loadLogs(patient.id);
    }
  },

  async onMetric(e) {
    await this.selectMetric(Number(e.detail.value) || 0);
  },

  onMetricTap(e) {
    this.selectMetric(Number(e.currentTarget.dataset.index) || 0);
  },

  async selectMetric(index) {
    const metric = this.data.metrics[index];
    if (!metric || metric.id === this.data.metricId) return;
    this.setData({ metricIndex: index, metricId: metric.id, metric });
    if (this.data.patientId) {
      await this.loadTrend(this.data.patientId, metric.id);
    }
  },

  onInput(e) {
    this.setData({ ["form." + e.currentTarget.dataset.field]: e.detail.value });
  },

  onDate(e) {
    this.setData({ "form.date": e.detail.value });
  },

  onTime(e) {
    this.setData({ "form.time": e.detail.value });
  },

  onAddPatient() {
    wx.navigateTo({ url: "/consumer/patient/edit" });
  },

  async onSave() {
    if (this.data.saving) return;
    if (!this.data.patientId) {
      wx.showToast({ title: "请先添加就诊人", icon: "none" });
      return;
    }
    if (!this.data.metricId) {
      wx.showToast({ title: "请选择指标", icon: "none" });
      return;
    }
    const value = Number(this.data.form.value);
    if (!Number.isFinite(value) || String(this.data.form.value).trim() === "") {
      wx.showToast({ title: "请填写指标数值", icon: "none" });
      return;
    }
    this.setData({ saving: true });
    try {
      await api.saveMetricLog({
        patientId: this.data.patientId,
        metricId: this.data.metricId,
        value,
        valueText: String(this.data.form.value).trim(),
        measuredAt: this.data.form.date + " " + this.data.form.time,
        note: String(this.data.form.note || "").trim(),
      });
      wx.showToast({ title: "已记录" });
      this.setData({ saving: false, "form.value": "", "form.note": "" });
      await this.loadTrend(this.data.patientId, this.data.metricId);
      await this.loadLogs(this.data.patientId);
    } catch (error) {
      this.setData({ saving: false });
      wx.showToast({ title: error.message || "记录失败", icon: "none" });
    }
  },
});
