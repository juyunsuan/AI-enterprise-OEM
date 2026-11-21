const api = require("../../utils/api");
const format = require("../../utils/format");
const staff = require("../../utils/staff");

const ITEM_TYPE_LABELS = {
  PAST: "既往史",
  ALLERGY: "过敏史",
  FAMILY: "家族史",
  LIFESTYLE: "生活方式",
  SYMPTOM: "症状",
  IMMUNE: "接种史",
};

const EVENT_KIND_LABELS = {
  OUTPATIENT: "门诊",
  INPATIENT: "住院",
  OPERATION: "手术",
  EMERGENCY: "急诊",
  OTHER: "其他",
};

Page({
  data: {
    loading: true,
    patientId: 0,
    patient: null,
    basicsRows: [],
    recordItems: [],
    events: [],
    followups: [],
    prescriptions: [],
    metrics: [],
  },

  onLoad(options) {
    this.patientId = Number(options && options.id) || 0;
    this.load();
  },

  onShow() {
    if (this.patientId) this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  async load() {
    try {
      await staff.requireStaff();
      const data = await api.staffPatient(this.patientId);
      const patient = (data && data.patient) || null;
      const basics = (data && data.record && data.record.basics) || {};
      const basicsRows = Object.keys(basics)
        .map((key) => {
          const value = basics[key];
          const text =
            value === null || value === undefined || value === ""
              ? ""
              : typeof value === "object"
                ? JSON.stringify(value)
                : String(value);
          return { key, label: key, value: text };
        })
        .filter((row) => row.value);
      this.setData({
        loading: false,
        patientId: this.patientId,
        patient: patient
          ? {
              ...patient,
              sexLabel:
                patient.gender === "M" ? "男" : patient.gender === "F" ? "女" : patient.gender || "未填",
            }
          : null,
        basicsRows,
        recordItems: ((data && data.recordItems) || []).map((row) => ({
          ...row,
          typeLabel: staff.pick(ITEM_TYPE_LABELS, row.type),
        })),
        events: ((data && data.medicalEvents) || []).map((row) => ({
          ...row,
          kindLabel: staff.pick(EVENT_KIND_LABELS, row.kind),
          timeText: format.dateOnly(row.occurAt),
        })),
        followups: ((data && data.followups) || []).map((row) => ({
          ...row,
          statusLabel: staff.pick(staff.TASK_STATUS_LABELS, row.status),
          dueText: format.dateTime(row.dueAt),
        })),
        prescriptions: ((data && data.prescriptions) || []).map((row) => ({
          ...row,
          statusLabel: staff.pick(staff.RX_STATUS_LABELS, row.status),
          amountText: format.yuan(row.totalCents),
          timeText: format.dateTime(row.createdAt),
        })),
        metrics: ((data && data.metrics) || []).map((row) => ({
          ...row,
          valueText: row.latestValue === null ? "未记录" : row.latestValue + (row.unit || ""),
          timeText: row.latestAt ? format.dateTime(row.latestAt) : "",
          rangeText: row.normalMax ? row.normalMin + "-" + row.normalMax + (row.unit || "") : "",
        })),
      });
    } catch (error) {
      this.setData({ loading: false });
      staff.handleError(error, "档案加载失败");
    }
  },

  onMetrics() {
    wx.navigateTo({ url: "/practitioner/metrics/index?patientId=" + this.patientId });
  },

  onFollowup(e) {
    wx.navigateTo({ url: "/practitioner/followup/detail?id=" + e.currentTarget.dataset.id });
  },
});
