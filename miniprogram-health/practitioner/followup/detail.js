const api = require("../../utils/api");
const format = require("../../utils/format");
const staff = require("../../utils/staff");

Page({
  data: {
    loading: true,
    taskId: 0,
    task: null,
    records: [],
    metrics: [],
    metricNames: [],
    metricIndex: 0,
    metricValue: "",
    showMetric: false,
    conclusion: "",
    nextAt: "",
    submitting: false,
  },

  onLoad(options) {
    this.taskId = Number(options && options.id) || 0;
    this.load();
  },

  async load() {
    try {
      await staff.requireStaff();
      const data = await api.staffFollowup(this.taskId);
      const task = (data && data.task) || null;
      let metrics = [];
      if (task && task.patientId) {
        const metricData = await api.staffMetrics(task.patientId);
        metrics = (metricData && metricData.list) || [];
      }
      this.setData({
        loading: false,
        taskId: this.taskId,
        task: task
          ? {
              ...task,
              statusLabel: staff.pick(staff.TASK_STATUS_LABELS, task.status),
              dueText: format.dateTime(task.dueAt),
              doneText: task.doneAt ? format.dateTime(task.doneAt) : "",
            }
          : null,
        records: ((data && data.records) || []).map((row) => ({
          ...row,
          timeText: format.dateTime(row.createdAt),
          metricsText: (row.metrics || [])
            .map((item) => item.metricName + " " + item.value + (item.unit || ""))
            .join("；"),
        })),
        metrics,
        metricNames: metrics.map((row) => (row.unit ? row.name + "（" + row.unit + "）" : row.name)),
      });
    } catch (error) {
      this.setData({ loading: false });
      staff.handleError(error, "随访加载失败");
    }
  },

  onConclusion(e) {
    this.setData({ conclusion: e.detail.value });
  },

  onNextAt(e) {
    this.setData({ nextAt: e.detail.value });
  },

  onToggleMetric() {
    this.setData({ showMetric: !this.data.showMetric });
  },

  onPickMetric(e) {
    this.setData({ metricIndex: Number(e.detail.value) || 0 });
  },

  onMetricValue(e) {
    this.setData({ metricValue: e.detail.value });
  },

  buildMetrics() {
    const metric = this.data.metrics[this.data.metricIndex];
    const value = Number(this.data.metricValue);
    if (!this.data.showMetric || !metric || String(this.data.metricValue).trim() === "") return [];
    if (!Number.isFinite(value)) {
      wx.showToast({ title: "指标读数无效", icon: "none" });
      return null;
    }
    return [{ metricId: metric.id, value, measuredAt: new Date().toISOString() }];
  },

  async submit(status) {
    if (this.data.submitting) return;
    const text = String(this.data.conclusion || "").trim();
    if (!text) {
      wx.showToast({ title: status === "DONE" ? "请填写随访结论" : "请填写跳过原因", icon: "none" });
      return;
    }
    const metrics = this.buildMetrics();
    if (metrics === null) return;
    this.setData({ submitting: true });
    try {
      await api.staffSaveFollowup({
        taskId: this.taskId,
        status,
        conclusion: status === "DONE" ? text : "",
        reason: status === "DONE" ? "" : text,
        nextAt: status === "DONE" ? this.data.nextAt : "",
        metrics,
        attachments: [],
      });
      wx.showToast({ title: "已提交" });
      setTimeout(() => wx.navigateBack(), 600);
    } catch (error) {
      this.setData({ submitting: false });
      staff.handleError(error, "提交失败");
    }
  },

  onDone() {
    this.submit("DONE");
  },

  onSkip() {
    wx.showModal({
      title: "跳过该任务",
      content: "跳过会把本页填写的结论作为原因记录，确定继续？",
      success: (res) => {
        if (res.confirm) this.submit("SKIPPED");
      },
    });
  },
});
