const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const labels = require("../../utils/labels");
const session = require("../../utils/session");

const RECORD_TYPES = ["PAST", "ALLERGY", "FAMILY", "LIFESTYLE", "SYMPTOM", "IMMUNE"];

const BASIC_FIELDS = [
  { key: "bloodType", label: "血型" },
  { key: "heightCm", label: "身高（cm）" },
  { key: "weightKg", label: "体重（kg）" },
  { key: "smoke", label: "吸烟情况" },
  { key: "drink", label: "饮酒情况" },
  { key: "exercise", label: "运动习惯" },
  { key: "sleep", label: "睡眠情况" },
  { key: "remark", label: "其他说明" },
];

Page({
  data: {
    loading: true,
    patientId: 0,
    patient: null,
    basics: [],
    groups: [],
    metricLogs: [],
    medications: [],
    followups: [],
    reports: [],
    editorOpen: false,
    editor: { id: 0, type: "PAST", label: "", value: "", startAt: "", endAt: "" },
    typeLabels: RECORD_TYPES.map((key) => labels.pick(labels.RECORD_TYPE_LABELS, key)),
    typeIndex: 0,
    types: RECORD_TYPES,
  },

  onLoad(options) {
    const id = Number(options && options.id) || session.getPatientId();
    this.setData({ patientId: id });
    if (id) session.setPatientId(id);
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  async load() {
    if (!this.data.patientId) {
      this.setData({ loading: false });
      return;
    }
    try {
      await auth.requireLogin();
      const data = (await api.archive(this.data.patientId)) || {};
      const items = data.items || [];
      const groups = RECORD_TYPES.map((type) => ({
        type,
        label: labels.pick(labels.RECORD_TYPE_LABELS, type),
        items: items
          .filter((item) => item.type === type)
          .map((item) => ({
            ...item,
            rangeText: [item.startAt, item.endAt].filter(Boolean).join(" ~ "),
          })),
      })).filter((group) => group.items.length);
      const rawBasics = (data.record && data.record.basics) || {};
      const basics = BASIC_FIELDS.map((field) => {
        const value = rawBasics[field.key];
        return {
          key: field.key,
          label: field.label,
          value: value === 0 || value ? String(value) : "",
        };
      }).filter((field) => field.value);
      this.setData({
        loading: false,
        patient: data.patient
          ? {
              ...data.patient,
              relationLabel: labels.pick(labels.PATIENT_RELATION_LABELS, data.patient.relation),
              genderLabel: labels.pick(labels.GENDER_LABELS, data.patient.gender, "未填"),
              birthdayText: data.patient.birthday ? format.dateOnly(data.patient.birthday) : "",
            }
          : null,
        basics,
        groups,
        metricLogs: (data.metricLogs || []).map((row) => ({
          ...row,
          valueText: row.valueText || format.number(row.value),
          timeText: format.shortTime(row.measuredAt),
        })),
        medications: (data.medications || []).map((row) => ({
          ...row,
          timesText: (row.times || []).join("、"),
          rangeText: [row.startAt, row.endAt].filter(Boolean).join(" ~ "),
        })),
        followups: (data.followups || []).map((row) => ({
          ...row,
          dueText: format.shortTime(row.dueAt),
        })),
        reports: (data.reports || []).map((row) => ({
          ...row,
          timeText: format.shortTime(row.reportAt),
        })),
      });
    } catch (error) {
      this.setData({ loading: false });
      if (error && error.code !== 401) {
        wx.showToast({ title: error.message || "档案加载失败", icon: "none" });
      }
    }
  },

  onAddItem() {
    this.setData({
      editorOpen: true,
      typeIndex: 0,
      editor: { id: 0, type: RECORD_TYPES[0], label: "", value: "", startAt: "", endAt: "" },
    });
  },

  onEditItem(e) {
    const type = e.currentTarget.dataset.type;
    const item = this.data.groups
      .reduce((all, group) => all.concat(group.items), [])
      .find((row) => row.id === Number(e.currentTarget.dataset.id));
    if (!item) return;
    this.setData({
      editorOpen: true,
      typeIndex: Math.max(0, RECORD_TYPES.indexOf(type)),
      editor: {
        id: item.id,
        type,
        label: item.label || "",
        value: item.value || "",
        startAt: item.startAt || "",
        endAt: item.endAt || "",
      },
    });
  },

  onEditorType(e) {
    const typeIndex = Number(e.detail.value) || 0;
    this.setData({ typeIndex, "editor.type": RECORD_TYPES[typeIndex] });
  },

  onEditorInput(e) {
    this.setData({ ["editor." + e.currentTarget.dataset.field]: e.detail.value });
  },

  onEditorStart(e) {
    this.setData({ "editor.startAt": e.detail.value });
  },

  onEditorEnd(e) {
    this.setData({ "editor.endAt": e.detail.value });
  },

  onEditorClose() {
    this.setData({ editorOpen: false });
  },

  async onEditorSave() {
    const editor = this.data.editor;
    if (!String(editor.value).trim()) {
      wx.showToast({ title: "请填写档案内容", icon: "none" });
      return;
    }
    try {
      await api.saveArchiveItem({
        patientId: this.data.patientId,
        id: editor.id,
        type: editor.type,
        label: String(editor.label || "").trim(),
        value: String(editor.value).trim(),
        startAt: editor.startAt || "",
        endAt: editor.endAt || "",
      });
      wx.showToast({ title: "已保存" });
      this.setData({ editorOpen: false });
      this.load();
    } catch (error) {
      wx.showToast({ title: error.message || "保存失败", icon: "none" });
    }
  },

  onMetricTrend(e) {
    wx.navigateTo({
      url:
        "/consumer/metrics/index?patientId=" +
        this.data.patientId +
        "&metricId=" +
        (e.currentTarget.dataset.metric || 0),
    });
  },

  onFollowup(e) {
    wx.navigateTo({ url: "/consumer/followup/detail?id=" + e.currentTarget.dataset.id });
  },

  onReport(e) {
    wx.navigateTo({ url: "/consumer/report/detail?id=" + e.currentTarget.dataset.id });
  },

  onMedication() {
    wx.navigateTo({ url: "/consumer/medication/index?patientId=" + this.data.patientId });
  },
});
