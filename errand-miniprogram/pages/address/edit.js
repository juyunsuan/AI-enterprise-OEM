const api = require("../../utils/api");
const auth = require("../../utils/auth");

Page({
  data: {
    type: "FROM",
    id: 0,
    name: "",
    mobile: "",
    province: "",
    city: "",
    district: "",
    address: "",
    lng: 0,
    lat: 0,
    isDefault: false,
    saving: false,
  },

  onLoad(options) {
    this.setData({
      type: options.type === "TO" ? "TO" : "FROM",
      id: Number(options.id) || 0,
    });
    if (Number(options.id) > 0) this.load(Number(options.id));
  },

  load(id) {
    auth
      .ensureLogin()
      .then(() => api.addresses())
      .then((rows) => {
        const row = (rows || []).find((item) => item.id === id);
        if (!row) return;
        this.setData({
          name: row.name,
          mobile: row.mobile,
          province: row.province,
          city: row.city,
          district: row.district,
          address: row.address,
          lng: row.lng || 0,
          lat: row.lat || 0,
          isDefault: row.isDefault,
        });
      })
      .catch(() => {});
  },

  chooseLocation() {
    wx.chooseLocation({
      success: (result) => {
        this.setData({
          address: result.address || result.name || this.data.address,
          lng: result.longitude || 0,
          lat: result.latitude || 0,
        });
      },
      fail: () => wx.showToast({ title: "未选择位置", icon: "none" }),
    });
  },

  bind(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [field]: event.detail.value });
  },

  toggleDefault(event) {
    this.setData({ isDefault: !!event.detail.value.length });
  },

  save() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    auth
      .ensureLogin()
      .then(() =>
        api.saveAddress({
          id: this.data.id,
          type: this.data.type,
          name: this.data.name,
          mobile: this.data.mobile,
          province: this.data.province,
          city: this.data.city,
          district: this.data.district,
          address: this.data.address,
          lng: this.data.lng,
          lat: this.data.lat,
          isDefault: this.data.isDefault,
        })
      )
      .then(() => {
        wx.showToast({ title: "已保存" });
        setTimeout(() => wx.navigateBack(), 400);
      })
      .catch((error) => wx.showToast({ title: (error && error.message) || "保存失败", icon: "none" }))
      .then(() => this.setData({ saving: false }));
  },
});