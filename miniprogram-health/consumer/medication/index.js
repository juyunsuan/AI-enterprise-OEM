const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const labels = require("../../utils/labels");
const session = require("../../utils/session");

const today = () => {
  const now = new Date();
  const pad = (v) => (v < 10 ? "0" + v : String(v));
  return now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
};

const STATUS_ACTIONS = [
  { key: "TAKEN", label: "已服用" },
  { key: "SKIPPED", label: "本次跳过" },
  { key: "MISSED", label: "漏服" },
];

Page({
  data: {
    loading: true,
    patients: [],
    patientNames: [],
    patientIndex: -1,
    patientId: 0,
    date: today(),
    today: today(),
    medications: [],
    takenCount: 0,
    totalCount: 0,
  },

  onLoad(options) {
    this.presetPatientId = Number(options && options.patientId) || 0;
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  async load() {
    try {
      await auth.requireLogin();
      const patients = (await api.patients()) || [];
      let index = patients.findIndex(
        (row) => row.id === (this.presetPatientId || session.getPatientId()),
      );
      if (index < 0) index = patients.findIndex((row) => row.isDefault);
      if (index < 0 && patients.length) index = 0;
      this.setData({
        patients,
        patientNames: patients.map((row) => row.name),
        patientIndex: index,
        patientId: index >= 0 ? patients[index].id : 0,
      });
      if (index >= 0) await this.loadMeds(patients[index].id);
      else this.setData({ loading: false });
    } catch (error) {
      this.setData({ loading: false });
      if (error && error.code !== 401) {
        wx.showToast({ title: error.message || "用药方案加载失败", icon: "none" });
      }
    }
  },

  cacheKey(patientId, date) {
    return "health:medicationStatus:" + patientId + ":" + date;
  },

  readCache(patientId, date) {
    try {
      return wx.getStorageSync(this.cacheKey(patientId, date)) || {};
    } catch (e) {
      return {};
    }
  },

  writeCache(patientId, date, value) {
    try {
      wx.setStorageSync(this.cacheKey(patientId, date), value);
    } catch (e) {
      /* 缓存写不进去不影响提交 */
    }
  },

  async loadMeds(patientId) {
    try {
      const rows = (await api.medications(patientId)) || [];
      const cache = this.readCache(patientId, this.data.date);
      let takenCount = 0;
      let totalCount = 0;
      const medications = rows.map((row) => ({
        ...row,
        times: (row.times || []).map((time) => {
          const status = cache[row.id + "|" + time] || "";
          totalCount += 1;
          if (status === "TAKEN") takenCount += 1;
          return {
            time,
            status,
            statusLabel: status ? labels.pick(labels.MEDICATION_STATUS_LABELS, status) : "",
          };
        }),
        rangeText: [row.startAt, row.endAt].filter(Boolean).join(" ~ "),
      }));
      this.setData({
        loading: false,
        medications,
        takenCount,
        totalCount,
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: error.message || "用药方案加载失败", icon: "none" });
    }
  },

  async onPatient(e) {
    const index = Number(e.detail.value) || 0;
    const patient = this.data.patients[index];
    if (!patient) return;
    session.setPatientId(patient.id);
    this.setData({ patientIndex: index, patientId: patient.id, loading: true });
    await this.loadMeds(patient.id);
  },

  async onDate(e) {
    const date = e.detail.value;
    if (!date || date === this.data.date) return;
    this.setData({ date, loading: true });
    await this.loadMeds(this.data.patientId);
  },

  onAddPatient() {
    wx.navigateTo({ url: "/consumer/patient/edit" });
  },

  onTimeTap(e) {
    const { med, time } = e.currentTarget.dataset;
    wx.showActionSheet({
      itemList: STATUS_ACTIONS.map((item) => item.label),
      success: (res) => {
        const action = STATUS_ACTIONS[res.tapIndex];
        this.mark(Number(med), time, action.key);
      },
    });
  },

  async mark(medicationId, planTime, status) {
    try {
      await api.medicationLog({
        patientId: this.data.patientId,
        medicationId,
        planDate: this.data.date,
        planTime,
        status,
        remark: "",
      });
      const cache = this.readCache(this.data.patientId, this.data.date);
      cache[medicationId + "|" + planTime] = status;
      this.writeCache(this.data.patientId, this.data.date, cache);
      wx.showToast({ title: "已记录" });
      await this.loadMeds(this.data.patientId);
    } catch (error) {
      wx.showToast({ title: error.message || "记录失败", icon: "none" });
    }
  },
});
