const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

function normalize(row) {
  const snapshot = row.snapshot && typeof row.snapshot === "object"
    ? row.snapshot
    : {};
  const fields = (Array.isArray(snapshot.fields) ? snapshot.fields : [])
    .filter((field) => field && field.label)
    .map((field) => ({
      label: String(field.label),
      value:
        field.value === undefined || field.value === null
          ? ""
          : String(field.value),
    }))
    .filter((field) => field.value && field.value !== "—");
  const statusField = (Array.isArray(snapshot.fields) ? snapshot.fields : []).find(
    (field) => field && field.label === "经营状态",
  );
  return {
    id: row.id,
    title: row.title || "工商年报记录",
    createdAtText: format.dateTime(row.createdAt),
    summary:
      String(snapshot.summary || "") ||
      (statusField
        ? "经营状态：" + String(statusField.value || "")
        : "工商年报填报记录"),
    sourceLabel:
      snapshot.source === "MINIPROGRAM" ? "小程序填报" : "网页端填报",
    fields: fields,
    expanded: false,
  };
}

Page({
  data: {
    loading: true,
    list: [],
    expandedId: null,
  },

  onShow() {
    if (!auth.ensureLogin()) return;
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    this.setData({ loading: true });
    return api
      .annualReportRecords()
      .then((rows) => {
        const list = (Array.isArray(rows) ? rows : []).map(normalize);
        this.setData({ list: list, loading: false });
      })
      .catch((error) => {
        this.setData({ loading: false });
        auth.showError(error);
      });
  },

  toggleDetail(event) {
    const id = event.currentTarget.dataset.id;
    this.setData({
      expandedId: this.data.expandedId === id ? null : id,
    });
  },

  goForm() {
    wx.navigateTo({ url: "/pages/annual-report-form/annual-report-form" });
  },
});
