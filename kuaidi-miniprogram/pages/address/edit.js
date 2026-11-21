const app = getApp();
const api = require("../../utils/api");
const auth = require("../../utils/auth");

const TYPES = ["SENDER", "RECEIVER"];
const TYPE_LABELS = ["寄件地址", "收件地址"];
const MOBILE = /^1[3-9]\d{9}$/;

function trim(value) {
  return String(value === undefined || value === null ? "" : value).trim();
}

Page({
  data: {
    id: 0,
    loading: false,
    saving: false,
    typeIndex: 0,
    typeLabels: TYPE_LABELS,
    form: {
      name: "",
      mobile: "",
      province: "",
      city: "",
      district: "",
      address: "",
      isDefault: false,
    },
  },

  onLoad(options) {
    const type = options.type === "RECEIVER" ? "RECEIVER" : "SENDER";
    const id = Number(options.id) || 0;
    this.setData({ id: id, typeIndex: TYPES.indexOf(type) });
    wx.setNavigationBarTitle({ title: id ? "编辑地址" : "新增地址" });
    if (id) this.load(id);
  },

  load(id) {
    this.setData({ loading: true });
    app
      .ensureReady()
      .then(() => auth.ensureLogin())
      .then(() => api.addresses())
      .then((rows) => {
        const row = (rows || []).filter((item) => item.id === id)[0];
        if (!row) {
          wx.showToast({ title: "地址不存在", icon: "none" });
          this.setData({ loading: false });
          return;
        }
        this.setData({
          loading: false,
          typeIndex: TYPES.indexOf(row.type),
          form: {
            name: row.name,
            mobile: row.mobile,
            province: row.province,
            city: row.city,
            district: row.district,
            address: row.address,
            isDefault: !!row.isDefault,
          },
        });
      })
      .catch((error) => {
        this.setData({ loading: false });
        wx.showToast({ title: error.message || "读取失败", icon: "none" });
      });
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    const form = Object.assign({}, this.data.form);
    form[field] = event.detail.value;
    this.setData({ form: form });
  },

  onTypeChange(event) {
    this.setData({ typeIndex: Number(event.detail.value) });
  },

  onDefaultChange(event) {
    const form = Object.assign({}, this.data.form);
    form.isDefault = !!event.detail.value;
    this.setData({ form: form });
  },

  save() {
    if (this.data.saving) return;
    const form = this.data.form;
    if (!trim(form.name)) {
      wx.showToast({ title: "请填写联系人姓名", icon: "none" });
      return;
    }
    if (!MOBILE.test(trim(form.mobile))) {
      wx.showToast({ title: "请填写 11 位手机号", icon: "none" });
      return;
    }
    if (!trim(form.province)) {
      wx.showToast({ title: "请填写省份", icon: "none" });
      return;
    }
    if (!trim(form.address)) {
      wx.showToast({ title: "请填写详细地址", icon: "none" });
      return;
    }
    this.setData({ saving: true });
    auth
      .ensureLogin()
      .then(() =>
        api.saveAddress({
          id: this.data.id,
          type: TYPES[this.data.typeIndex],
          name: trim(form.name),
          mobile: trim(form.mobile),
          province: trim(form.province),
          city: trim(form.city),
          district: trim(form.district),
          address: trim(form.address),
          isDefault: !!form.isDefault,
        }),
      )
      .then(() => {
        wx.showToast({ title: "已保存", icon: "success" });
        setTimeout(() => wx.navigateBack(), 500);
        this.setData({ saving: false });
      })
      .catch((error) => {
        this.setData({ saving: false });
        wx.showToast({ title: error.message || "保存失败", icon: "none" });
      });
  },
});
