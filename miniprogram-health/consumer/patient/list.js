const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const labels = require("../../utils/labels");
const session = require("../../utils/session");

Page({
  data: {
    loading: true,
    patients: [],
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
      const rows = (await api.patients()) || [];
      this.setData({
        loading: false,
        patients: rows.map((row) => ({
          ...row,
          relationLabel: labels.pick(labels.PATIENT_RELATION_LABELS, row.relation),
          genderLabel: labels.pick(labels.GENDER_LABELS, row.gender, "未填"),
          birthdayText: row.birthday ? format.dateOnly(row.birthday) : "",
          bodyText: [
            row.heightCm ? "身高 " + format.number(row.heightCm) + "cm" : "",
            row.weightKg ? "体重 " + format.number(row.weightKg) + "kg" : "",
            row.bloodType ? row.bloodType + " 型" : "",
          ]
            .filter(Boolean)
            .join(" · "),
        })),
      });
    } catch (error) {
      this.setData({ loading: false });
      if (error && error.code !== 401) {
        wx.showToast({ title: error.message || "就诊人加载失败", icon: "none" });
      }
    }
  },

  onAdd() {
    wx.navigateTo({ url: "/consumer/patient/edit" });
  },

  onEdit(e) {
    const id = Number(e.currentTarget.dataset.id) || 0;
    session.setPatientId(id);
    wx.navigateTo({ url: "/consumer/patient/edit?id=" + id });
  },

  onArchive(e) {
    const id = Number(e.currentTarget.dataset.id) || 0;
    session.setPatientId(id);
    wx.navigateTo({ url: "/consumer/patient/archive?id=" + id });
  },

  onRemove(e) {
    const id = Number(e.currentTarget.dataset.id) || 0;
    wx.showModal({
      title: "删除就诊人",
      content: "删除后该就诊人将不再出现在预约与档案列表中，确定删除吗？",
      confirmColor: "#f5413d",
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.removePatient(id);
          wx.showToast({ title: "已删除" });
          if (session.getPatientId() === id) session.setPatientId(0);
          this.load();
        } catch (error) {
          wx.showToast({ title: error.message || "删除失败", icon: "none" });
        }
      },
    });
  },
});
