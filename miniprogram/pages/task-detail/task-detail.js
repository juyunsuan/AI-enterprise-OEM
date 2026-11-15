const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

Page({
  data: {
    task: null,
    fields: [],
    note: "",
    loading: true,
    closed: false,
    canSubmit: false,
  },

  onLoad(query) {
    this.taskId = query.id;
    if (!auth.ensureLogin()) return;
    this.load();
  },

  load() {
    this.setData({ loading: true });
    return api
      .myTask(this.taskId)
      .then((task) => {
        const closed = task.status === "DONE" || task.status === "CANCELED";
        const formSchema = task.formSchema || null;
        const values = task.formData || {};
        const fields = (formSchema && formSchema.fields ? formSchema.fields : []).map(
          (field) =>
            Object.assign({}, field, { value: values[field.key] || "" }),
        );
        this.setData({
          task: Object.assign({}, task, {
            createdAtText: format.dateTime(task.createdAt),
            dueAtText: task.dueAt ? format.dateTime(task.dueAt) : "",
          }),
          closed: closed,
          fields: fields,
          canSubmit: fields.length > 0 && !closed,
          note: task.closeNote || "",
          loading: false,
        });
        wx.setNavigationBarTitle({ title: task.title || "任务详情" });
      })
      .catch((error) => {
        this.setData({ loading: false });
        auth.showError(error);
      });
  },

  onFieldInput(event) {
    const key = event.currentTarget.dataset.key;
    const fields = this.data.fields.map((field) =>
      field.key === key ? Object.assign({}, field, { value: event.detail.value }) : field,
    );
    this.setData({ fields: fields });
  },

  onNote(event) {
    this.setData({ note: event.detail.value });
  },

  collectValues() {
    const values = {};
    this.data.fields.forEach((field) => {
      values[field.key] = String(field.value || "");
    });
    return values;
  },

  onSubmit() {
    const values = this.collectValues();
    const missing = this.data.fields.filter(
      (field) => field.required && !String(field.value || "").trim(),
    );
    if (missing.length) {
      wx.showToast({ title: "请填写：" + missing[0].label, icon: "none" });
      return;
    }
    this.run(() => api.submitTaskForm(this.taskId, values, this.data.note));
  },

  onClose() {
    this.run(() => api.closeTask(this.taskId, this.data.note));
  },

  onReopen() {
    this.run(() => api.reopenTask(this.taskId));
  },

  run(action) {
    wx.showLoading({ title: "提交中", mask: true });
    action()
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: "已提交", icon: "success" });
        setTimeout(() => wx.navigateBack(), 700);
      })
      .catch((error) => {
        wx.hideLoading();
        auth.showError(error);
      });
  },
});
