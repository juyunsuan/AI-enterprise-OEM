const api = require("../../utils/api");
const auth = require("../../utils/auth");
const labels = require("../../utils/labels");
const session = require("../../utils/session");

const RELATIONS = [
  { key: "SELF", label: "本人" },
  { key: "SPOUSE", label: "配偶" },
  { key: "CHILD", label: "子女" },
  { key: "PARENT", label: "父母" },
  { key: "OTHER", label: "其他" },
];

const GENDERS = [
  { key: "MALE", label: "男" },
  { key: "FEMALE", label: "女" },
  { key: "UNKNOWN", label: "未填" },
];

const BLOOD_TYPES = [
  { key: "", label: "未填" },
  { key: "A", label: "A 型" },
  { key: "B", label: "B 型" },
  { key: "AB", label: "AB 型" },
  { key: "O", label: "O 型" },
  { key: "RH-", label: "Rh 阴性" },
];

const today = () => {
  const now = new Date();
  const pad = (v) => (v < 10 ? "0" + v : String(v));
  return now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
};

Page({
  data: {
    id: 0,
    saving: false,
    relations: RELATIONS.map((item) => item.label),
    genders: GENDERS.map((item) => item.label),
    bloodTypes: BLOOD_TYPES.map((item) => item.label),
    relationIndex: 0,
    genderIndex: 2,
    bloodIndex: 0,
    today: today(),
    phoneHint: "",
    form: {
      name: "",
      birthday: "",
      phone: "",
      idCard: "",
      heightCm: "",
      weightKg: "",
      remark: "",
      isDefault: false,
    },
  },

  onLoad(options) {
    const id = Number(options && options.id) || 0;
    this.setData({ id });
    wx.setNavigationBarTitle({ title: id ? "编辑就诊人" : "添加就诊人" });
    this.load(id);
  },

  async load(id) {
    if (!id) return;
    try {
      await auth.requireLogin();
      const rows = (await api.patients()) || [];
      const row = rows.find((item) => item.id === id);
      if (!row) {
        wx.showToast({ title: "就诊人不存在", icon: "none" });
        setTimeout(() => wx.navigateBack(), 600);
        return;
      }
      const relationIndex = Math.max(0, RELATIONS.findIndex((item) => item.key === row.relation));
      const genderIndex = Math.max(0, GENDERS.findIndex((item) => item.key === row.gender));
      const bloodIndex = Math.max(0, BLOOD_TYPES.findIndex((item) => item.key === row.bloodType));
      const masked = String(row.phone || "").indexOf("*") >= 0;
      this.setData({
        relationIndex,
        genderIndex,
        bloodIndex,
        phoneHint: masked ? "原手机号 " + row.phone + "，留空则不修改" : "",
        form: {
          name: row.name || "",
          birthday: row.birthday || "",
          phone: masked ? "" : row.phone || "",
          idCard: "",
          heightCm: row.heightCm ? String(row.heightCm) : "",
          weightKg: row.weightKg ? String(row.weightKg) : "",
          remark: row.remark || "",
          isDefault: Boolean(row.isDefault),
        },
      });
    } catch (error) {
      wx.showToast({ title: error.message || "加载失败", icon: "none" });
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ["form." + field]: e.detail.value });
  },

  onRelation(e) {
    this.setData({ relationIndex: Number(e.detail.value) || 0 });
  },

  onGender(e) {
    this.setData({ genderIndex: Number(e.detail.value) || 0 });
  },

  onBlood(e) {
    this.setData({ bloodIndex: Number(e.detail.value) || 0 });
  },

  onBirthday(e) {
    this.setData({ "form.birthday": e.detail.value });
  },

  onDefault(e) {
    this.setData({ "form.isDefault": Boolean(e.detail.value) });
  },

  async onSubmit() {
    if (this.data.saving) return;
    const form = this.data.form;
    if (!String(form.name).trim()) {
      wx.showToast({ title: "请填写姓名", icon: "none" });
      return;
    }
    this.setData({ saving: true });
    try {
      await auth.requireLogin();
      const saved = await api.savePatient({
        id: this.data.id,
        name: String(form.name).trim(),
        relation: RELATIONS[this.data.relationIndex].key,
        gender: GENDERS[this.data.genderIndex].key,
        birthday: form.birthday || "",
        phone: String(form.phone || "").trim(),
        idCard: String(form.idCard || "").trim(),
        bloodType: BLOOD_TYPES[this.data.bloodIndex].key,
        heightCm: Number(form.heightCm) || 0,
        weightKg: Number(form.weightKg) || 0,
        remark: String(form.remark || "").trim(),
        isDefault: Boolean(form.isDefault),
      });
      if (saved && saved.id) session.setPatientId(saved.id);
      wx.showToast({ title: "已保存" });
      setTimeout(() => wx.navigateBack(), 500);
    } catch (error) {
      this.setData({ saving: false });
      wx.showToast({ title: error.message || "保存失败", icon: "none" });
    }
  },
});
