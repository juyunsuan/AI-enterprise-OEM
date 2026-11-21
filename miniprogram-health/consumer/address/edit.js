const api = require("../../utils/api");
const auth = require("../../utils/auth");

const TAGS = ["家", "公司", "学校", "其他"];

Page({
  data: {
    id: 0,
    saving: false,
    tags: TAGS,
    phoneHint: "",
    regionText: "",
    form: {
      receiver: "",
      phone: "",
      region: [],
      detail: "",
      tag: "",
      isDefault: false,
    },
  },

  onLoad(options) {
    const id = Number(options && options.id) || 0;
    this.setData({ id });
    wx.setNavigationBarTitle({ title: id ? "编辑地址" : "新增地址" });
    this.load(id);
  },

  async load(id) {
    if (!id) return;
    try {
      await auth.requireLogin();
      const rows = (await api.addresses()) || [];
      const row = rows.find((item) => item.id === id);
      if (!row) {
        wx.showToast({ title: "地址不存在", icon: "none" });
        setTimeout(() => wx.navigateBack(), 600);
        return;
      }
      const masked = String(row.phone || "").indexOf("*") >= 0;
      const region = [row.province, row.city, row.district].filter(Boolean);
      this.setData({
        phoneHint: masked ? "原手机号 " + row.phone + "，留空则不修改" : "",
        regionText: region.join(" "),
        form: {
          receiver: row.receiver || "",
          phone: masked ? "" : row.phone || "",
          region,
          detail: row.detail || "",
          tag: row.tag || "",
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

  onRegion(e) {
    const region = e.detail.value || [];
    this.setData({ "form.region": region, regionText: region.join(" ") });
  },

  onTag(e) {
    const tag = e.currentTarget.dataset.tag || "";
    this.setData({ "form.tag": this.data.form.tag === tag ? "" : tag });
  },

  onDefault(e) {
    this.setData({ "form.isDefault": Boolean(e.detail.value) });
  },

  async onSubmit() {
    if (this.data.saving) return;
    const form = this.data.form;
    const receiver = String(form.receiver || "").trim();
    const phone = String(form.phone || "").trim();
    const detail = String(form.detail || "").trim();
    if (!receiver || !detail) {
      wx.showToast({ title: "请填写收货人与详细地址", icon: "none" });
      return;
    }
    if (!this.data.id && !phone) {
      wx.showToast({ title: "请填写手机号", icon: "none" });
      return;
    }
    this.setData({ saving: true });
    try {
      await auth.requireLogin();
      await api.saveAddress({
        id: this.data.id,
        receiver,
        phone,
        province: form.region[0] || "",
        city: form.region[1] || "",
        district: form.region[2] || "",
        detail,
        tag: form.tag || "",
        isDefault: Boolean(form.isDefault),
      });
      wx.showToast({ title: "已保存" });
      setTimeout(() => wx.navigateBack(), 500);
    } catch (error) {
      this.setData({ saving: false });
      wx.showToast({ title: error.message || "保存失败", icon: "none" });
    }
  },
});
