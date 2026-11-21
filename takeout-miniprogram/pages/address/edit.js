const api = require("../../utils/api");
const auth = require("../../utils/auth");

Page({
  data: {
    id: 0,
    loading: false,
    saving: false,
    form: {
      realName: "",
      phone: "",
      province: "",
      city: "",
      district: "",
      detail: "",
      tag: "",
      isDefault: false,
    },
    region: [],
    regionText: "请选择省 / 市 / 区",
  },

  onLoad(query) {
    const id = Number(query.id || 0);
    this.setData({ id: id });
    if (!id) return;
    this.setData({ loading: true });
    auth
      .ensureLogin()
      .then(() => api.addresses())
      .then((rows) => {
        const item = (rows || []).filter((row) => row.id === id)[0];
        if (!item) throw new Error("地址不存在或已删除");
        this.setData({
          loading: false,
          form: {
            realName: item.realName,
            phone: item.phone,
            province: item.province || "",
            city: item.city || "",
            district: item.district || "",
            detail: item.detail,
            tag: item.tag || "",
            isDefault: item.isDefault === true,
          },
          region: [item.province || "", item.city || "", item.district || ""],
          regionText:
            [item.province, item.city, item.district].filter(Boolean).join(" ") ||
            "请选择省 / 市 / 区",
        });
      })
      .catch((error) => {
        this.setData({ loading: false });
        wx.showToast({ title: (error && error.message) || "地址加载失败", icon: "none" });
      });
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ ["form." + field]: event.detail.value });
  },

  onRegion(event) {
    const values = event.detail.value || [];
    this.setData({
      region: values,
      regionText: values.filter(Boolean).join(" ") || "请选择省 / 市 / 区",
      "form.province": values[0] || "",
      "form.city": values[1] || "",
      "form.district": values[2] || "",
    });
  },

  onDefault(event) {
    this.setData({ "form.isDefault": event.detail.value === true });
  },

  save() {
    const form = this.data.form;
    if (!form.realName.trim()) return wx.showToast({ title: "请填写收货人", icon: "none" });
    if (!/^[0-9+\-\s]{5,20}$/.test(form.phone.trim())) {
      return wx.showToast({ title: "请填写正确手机号", icon: "none" });
    }
    if (!form.city && !form.province) {
      return wx.showToast({ title: "请选择省市区", icon: "none" });
    }
    if (!form.detail.trim()) return wx.showToast({ title: "请填写详细地址", icon: "none" });
    if (this.data.saving) return;
    this.setData({ saving: true });
    const payload = {
      realName: form.realName.trim(),
      phone: form.phone.trim(),
      province: form.province,
      city: form.city,
      district: form.district,
      detail: form.detail.trim(),
      postalCode: "",
      isDefault: form.isDefault,
      tag: form.tag.trim(),
    };
    if (this.data.id) payload.id = this.data.id;
    api
      .saveAddress(payload)
      .then(() => {
        wx.showToast({ title: "已保存", icon: "success" });
        setTimeout(() => wx.navigateBack(), 400);
      })
      .catch((error) => {
        this.setData({ saving: false });
        auth.showError(error);
      });
  },
});