const api = require("../../utils/api");
const auth = require("../../utils/auth");

Page({
  data: {
    id: 0,
    loading: false,
    saving: false,
    realName: "",
    phone: "",
    province: "",
    city: "",
    district: "",
    regionText: "",
    detail: "",
    isDefault: false,
  },

  onLoad(options) {
    const id = Number((options && options.id) || 0);
    this.setData({ id: id });
    if (id) this.load(id);
  },

  load(id) {
    this.setData({ loading: true });
    auth
      .ensureLogin()
      .then(() => api.addresses())
      .then((list) => {
        const item = (list || []).filter(function (row) {
          return row.id === id;
        })[0];
        if (!item) throw new Error("地址不存在或已删除");
        this.setData({
          loading: false,
          realName: item.realName || "",
          phone: item.phone || "",
          province: item.province || "",
          city: item.city || "",
          district: item.district || "",
          regionText: [item.province, item.city, item.district]
            .filter(Boolean)
            .join(" "),
          detail: item.detail || "",
          isDefault: !!item.isDefault,
        });
      })
      .catch((error) => {
        this.setData({ loading: false });
        wx.showToast({ title: (error && error.message) || "地址读取失败", icon: "none" });
      });
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    if (!field) return;
    const data = {};
    data[field] = event.detail.value;
    this.setData(data);
  },

  onRegion(event) {
    const value = event.detail.value || [];
    const data = {
      province: value[0] || "",
      city: value[1] || "",
      district: value[2] || "",
    };
    data.regionText = [data.province, data.city, data.district].filter(Boolean).join(" ");
    this.setData(data);
  },

  onDefault(event) {
    this.setData({ isDefault: !!event.detail.value });
  },

  save() {
    if (this.data.saving) return;
    const realName = String(this.data.realName || "").trim();
    const phone = String(this.data.phone || "").trim();
    const detail = String(this.data.detail || "").trim();
    if (!realName) {
      wx.showToast({ title: "请填写收货人", icon: "none" });
      return;
    }
    if (!/^[0-9+\-\s]{5,20}$/.test(phone)) {
      wx.showToast({ title: "手机号格式不正确", icon: "none" });
      return;
    }
    if (!detail) {
      wx.showToast({ title: "请填写详细地址", icon: "none" });
      return;
    }
    this.setData({ saving: true });
    api
      .saveAddress({
        id: this.data.id,
        realName: realName,
        phone: phone,
        province: this.data.province,
        city: this.data.city,
        district: this.data.district,
        detail: detail,
        isDefault: this.data.isDefault,
      })
      .then(() => {
        wx.showToast({ title: "已保存", icon: "success" });
        setTimeout(function () {
          wx.navigateBack();
        }, 500);
      })
      .catch((error) => {
        wx.showToast({ title: (error && error.message) || "保存失败", icon: "none" });
      })
      .then(() => this.setData({ saving: false }));
  },
});
