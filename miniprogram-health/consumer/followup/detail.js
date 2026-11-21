const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const labels = require("../../utils/labels");

const pad = (v) => (v < 10 ? "0" + v : String(v));
const nowText = () => {
  const now = new Date();
  return (
    now.getFullYear() +
    "-" +
    pad(now.getMonth() + 1) +
    "-" +
    pad(now.getDate()) +
    " " +
    pad(now.getHours()) +
    ":" +
    pad(now.getMinutes())
  );
};

Page({
  data: {
    loading: true,
    task: null,
    metricNames: [],
    metrics: [],
    rows: [],
    note: "",
    submitting: false,
  },

  onLoad(options) {
    this.taskId = Number(options && options.id) || 0;
    this.load();
  },

  async load() {
    try {
      await auth.requireLogin();
      const [tasks, metrics] = await Promise.all([api.followups(), api.metrics()]);
      const task = (tasks || []).find((row) => row.id === this.taskId);
      if (!task) {
        this.setData({ loading: false, task: null });
        return;
      }
      const metricList = metrics || [];
      this.setData({
        loading: false,
        task: {
          ...task,
          wayLabel: labels.pick(labels.FOLLOWUP_WAY_LABELS, task.way),
          dueText: task.dueAt ? format.dateTime(task.dueAt) : "未设置截止时间",
        },
        metrics: metricList,
        metricNames: metricList.map((row) => row.name),
      });
    } catch (error) {
      this.setData({ loading: false });
      if (error && error.code !== 401) {
        wx.showToast({ title: error.message || "随访任务加载失败", icon: "none" });
      }
    }
  },

  onNote(e) {
    this.setData({ note: e.detail.value });
  },

  onAddRow() {
    if (!this.data.metrics.length) {
      wx.showToast({ title: "本店尚未配置指标", icon: "none" });
      return;
    }
    this.setData({
      rows: this.data.rows.concat([{ metricIndex: 0, value: "" }]),
    });
  },

  onRowMetric(e) {
    const index = Number(e.currentTarget.dataset.index);
    const metricIndex = Number(e.detail.value) || 0;
    this.setData({ ["rows[" + index + "].metricIndex"]: metricIndex });
  },

  onRowValue(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.setData({ ["rows[" + index + "].value"]: e.detail.value });
  },

  onRemoveRow(e) {
    const index = Number(e.currentTarget.dataset.index);
    const rows = this.data.rows.slice();
    rows.splice(index, 1);
    this.setData({ rows });
  },

  async onSubmit() {
    if (this.data.submitting) return;
    if (!String(this.data.note).trim()) {
      wx.showToast({ title: "请填写随访结果", icon: "none" });
      return;
    }
    const measuredAt = nowText();
    const entries = [];
    for (const row of this.data.rows) {
      if (String(row.value).trim() === "") continue;
      const metric = this.data.metrics[row.metricIndex];
      const value = Number(row.value);
      if (!metric || !Number.isFinite(value)) continue;
      entries.push({ metricId: metric.id, value, measuredAt });
    }
    this.setData({ submitting: true });
    try {
      await api.completeFollowup({
        taskId: this.taskId,
        note: String(this.data.note).trim(),
        metrics: entries,
      });
      wx.showToast({ title: "已提交" });
      setTimeout(() => wx.navigateBack(), 600);
    } catch (error) {
      this.setData({ submitting: false });
      wx.showToast({ title: error.message || "提交失败", icon: "none" });
    }
  },
});
