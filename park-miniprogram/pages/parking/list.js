const api = require("../../utils/api");
const auth = require("../../utils/auth");

Page({
  data: {
    loading: true,
    list: [],
    plateNo: "",
    vehicleTypes: ["小型车", "两轮车", "货车"],
    vehicleValues: ["CAR", "BIKE", "TRUCK"],
    vehicleIndex: 0,
    validFrom: "",
    validTo: "",
    note: "",
    submitting: false,
  },
  onShow() { this.load(); },
  onPullDownRefresh() { this.load(); },
  load() {
    this.setData({ loading: true });
    auth.ensureLogin()
      .then(() => api.parking())
      .then((list) => { this.setData({ loading: false, list: Array.isArray(list) ? list : [] }); wx.stopPullDownRefresh(); })
      .catch((error) => { this.setData({ loading: false }); wx.stopPullDownRefresh(); wx.showToast({ title: (error && error.message) || "读取失败", icon: "none" }); });
  },
  onInput(event) { this.setData({ [event.currentTarget.dataset.field]: event.detail.value }); },
  onPicker(event) { this.setData({ [event.currentTarget.dataset.field]: event.detail.value }); },
  onVehicle(event) { this.setData({ vehicleIndex: Number(event.detail.value) }); },
  submit() {
    if (this.data.submitting) return;
    if (!this.data.plateNo.trim()) { wx.showToast({ title: "请填写车牌号", icon: "none" }); return; }
    this.setData({ submitting: true });
    auth.ensureLogin()
      .then(() => api.applyParking({
        plateNo: this.data.plateNo,
        vehicleType: this.data.vehicleValues[this.data.vehicleIndex],
        validFrom: this.data.validFrom,
        validTo: this.data.validTo,
        note: this.data.note,
      }))
      .then(() => { wx.showToast({ title: "已提交", icon: "success" }); this.setData({ plateNo: "", note: "", submitting: false }); this.load(); })
      .catch((error) => { this.setData({ submitting: false }); wx.showToast({ title: (error && error.message) || "提交失败", icon: "none" }); });
  },
});
