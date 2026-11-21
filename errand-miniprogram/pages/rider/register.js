const api = require("../../../utils/api");
const auth = require("../../../utils/auth");
const session = require("../../../utils/session");

const app = getApp();

const VEHICLES = [
  { value: "EBIKE", label: "电动车" },
  { value: "MOTO", label: "摩托车" },
  { value: "CAR", label: "汽车" },
  { value: "WALK", label: "步行" },
];

Page({
  data: {
    site: {},
    vehicles: VEHICLES,
    vehicleIndex: 0,
    name: "",
    mobile: "",
    idCardNo: "",
    serviceTypes: ["SEND", "BUY"],
    cities: [],
    cityIndex: 0,
    sendChecked: true,
    buyChecked: true,
    idCardFront: "",
    idCardBack: "",
    vehiclePhoto: "",
    submitting: false,
  },

  onLoad() {
    app.ensureReady().then((data) => {
      if (!data) return;
      const cities = data.cities || [];
      const current = Math.max(0, cities.findIndex((item) => item.id === data.cityId));
      this.setData({ site: data, cities, cityIndex: current });
    });
    auth.ensureLogin().catch(() => {});
  },

  bind(event) {
    this.setData({ [event.currentTarget.dataset.field]: event.detail.value });
  },

  pickCity(event) {
    const index = Number(event.detail.value) || 0;
    const city = this.data.cities[index];
    if (!city) return;
    session.setCityId(city.id);
    this.setData({ cityIndex: index });
  },

  pickVehicle(event) {
    this.setData({ vehicleIndex: Number(event.detail.value) || 0 });
  },

  toggleService(event) {
    const value = event.detail.value || [];
    this.setData({
      serviceTypes: value,
      sendChecked: value.indexOf("SEND") >= 0,
      buyChecked: value.indexOf("BUY") >= 0,
    });
  },

  choosePhoto(event) {
    const field = event.currentTarget.dataset.field;
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (result) => {
        const file = result.tempFiles && result.tempFiles[0];
        if (!file) return;
        wx.showLoading({ title: "上传中" });
        api
          .upload(file.tempFilePath)
          .then((uploaded) => this.setData({ [field]: uploaded.url }))
          .catch((error) => wx.showToast({ title: (error && error.message) || "上传失败", icon: "none" }))
          .then(() => wx.hideLoading());
      },
    });
  },

  submit() {
    if (this.data.submitting) return;
    if (!this.data.name || !this.data.mobile) {
      wx.showToast({ title: "请填写姓名与手机号", icon: "none" });
      return;
    }
    if (!this.data.serviceTypes.length) {
      wx.showToast({ title: "请至少选择一种接单类型", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    auth
      .ensureLogin()
      .then(() =>
        api.riderRegister({
          name: this.data.name,
          mobile: this.data.mobile,
          idCardNo: this.data.idCardNo,
          vehicleType: this.data.vehicles[this.data.vehicleIndex].value,
          serviceTypes: this.data.serviceTypes,
          idCardFront: this.data.idCardFront,
          idCardBack: this.data.idCardBack,
          vehiclePhoto: this.data.vehiclePhoto,
        })
      )
      .then(() => new Promise((resolve) => wx.login({ success: resolve })))
      .then((login) => api.riderLogin(login.code))
      .then((result) => {
        session.setRiderLogin(result);
        wx.showModal({
          title: "报名已提交",
          content: "店主审核通过后即可接单；现在可以先返回首页。",
          showCancel: false,
          success: () => wx.switchTab({ url: "/pages/rider/workbench" }),
        });
      })
      .catch((error) => wx.showToast({ title: (error && error.message) || "提交失败", icon: "none" }))
      .then(() => this.setData({ submitting: false }));
  },
});