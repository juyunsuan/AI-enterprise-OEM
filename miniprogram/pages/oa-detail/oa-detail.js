const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

function displayValue(value) {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.length ? value.join("、") : "—";
  if (typeof value === "boolean") return value ? "是" : "否";
  const text = String(value);
  return text ? text : "—";
}

Page({
  data: {
    application: null,
    displayFields: [],
    records: [],
    amountText: "",
    canApprove: false,
    comment: "",
    targetUserId: "",
    loading: true,
  },

  onLoad(query) {
    this.applicationId = query.id;
    this.taskId = 0;
    if (!auth.ensureLogin()) return;
    this.load();
  },

  load() {
    this.setData({ loading: true });
    return api
      .oaApplication(this.applicationId)
      .then((application) => {
        this.taskId = application.myTaskId || 0;
        const formData = application.formData || {};
        const displayFields = (application.fields || [])
          .filter((field) => field.type !== "list")
          .map((field) => ({
            label: field.label,
            value: displayValue(formData[field.key]),
          }))
          .filter((item) => item.value !== "—");
        this.setData({
          application: application,
          amountText: format.amount(application.amount),
          displayFields: displayFields,
          records: (application.records || []).map((record) =>
            Object.assign({}, record, {
              createdAtText: format.dateTime(record.createdAt),
            }),
          ),
          canApprove: !!application.canApprove && this.taskId > 0,
          loading: false,
        });
        wx.setNavigationBarTitle({ title: application.title || "审批详情" });
      })
      .catch((error) => {
        this.setData({ loading: false });
        auth.showError(error);
      });
  },

  onComment(event) {
    this.setData({ comment: event.detail.value });
  },
  onTarget(event) {
    this.setData({ targetUserId: event.detail.value });
  },

  onApprove() {
    this.run(() => api.oaApprove(this.taskId, this.data.comment), "已通过");
  },

  onReject() {
    if (!String(this.data.comment || "").trim()) {
      wx.showToast({ title: "驳回请填写意见", icon: "none" });
      return;
    }
    this.run(() => api.oaReject(this.taskId, this.data.comment), "已驳回");
  },

  onTransfer() {
    const target = String(this.data.targetUserId || "").trim();
    if (!target) {
      wx.showToast({ title: "请填写转交人账号 ID", icon: "none" });
      return;
    }
    this.run(
      () => api.oaTransfer(this.taskId, target, this.data.comment),
      "已转交",
    );
  },

  run(action, successTitle) {
    wx.showLoading({ title: "提交中", mask: true });
    action()
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: successTitle, icon: "success" });
        setTimeout(() => wx.navigateBack(), 700);
      })
      .catch((error) => {
        wx.hideLoading();
        auth.showError(error);
      });
  },
});
