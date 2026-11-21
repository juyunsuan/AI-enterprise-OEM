const api = require("../../utils/api");
const staff = require("../../utils/staff");

/**
 * 可改字段严格按后端 profile/update 的 schema，且只留会被店主端合并的白名单：
 * name / avatar / intro / serviceCity / address / serviceStartAt / serviceEndAt / crossDay。
 * workYears、gender、lng、lat 虽然 schema 收，但不在合并白名单里，提交也会被丢弃，故不渲染。
 * 简介、服务城市、地址后端没有下发给端上，只能留空表示「不修改」，不能在这里清空。
 */
function minutesOf(clock) {
  const parts = String(clock || "").split(":");
  if (parts.length !== 2) return -1;
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return -1;
  return hour * 60 + minute;
}

Page({
  data: {
    loading: true,
    name: "",
    avatar: "",
    intro: "",
    serviceCity: "",
    address: "",
    serviceStartAt: "",
    serviceEndAt: "",
    crossDay: false,
    uploading: false,
    submitting: false,
    errorText: "",
  },

  onLoad() {
    this.gate = staff.ensureStaff();
  },

  async onShow() {
    const gate = this.gate || staff.ensureStaff();
    this.gate = null;
    let profile = null;
    try {
      profile = await gate;
    } catch (error) {
      wx.showToast({ title: (error && error.message) || "登录失败，请稍后重试", icon: "none" });
      return;
    }
    if (!profile) return;
    const card = profile.staff || {};
    this.original = {
      name: card.name || "",
      avatar: card.avatar || "",
      serviceStartAt: card.serviceStartAt || "",
      serviceEndAt: card.serviceEndAt || "",
      crossDay: !!card.crossDay,
    };
    // 用户已经动过表单就不要用档案覆盖回去
    if (this.dirty) {
      this.setData({ loading: false });
      return;
    }
    this.setData({
      loading: false,
      name: this.original.name,
      avatar: this.original.avatar,
      serviceStartAt: this.original.serviceStartAt,
      serviceEndAt: this.original.serviceEndAt,
      crossDay: this.original.crossDay,
    });
  },

  onNameInput(event) {
    this.dirty = true;
    this.setData({ name: event.detail.value, errorText: "" });
  },

  onIntroInput(event) {
    this.dirty = true;
    this.setData({ intro: event.detail.value, errorText: "" });
  },

  onCityInput(event) {
    this.dirty = true;
    this.setData({ serviceCity: event.detail.value, errorText: "" });
  },

  onAddressInput(event) {
    this.dirty = true;
    this.setData({ address: event.detail.value, errorText: "" });
  },

  onStartChange(event) {
    this.dirty = true;
    this.setData({ serviceStartAt: event.detail.value, errorText: "" });
  },

  onEndChange(event) {
    this.dirty = true;
    this.setData({ serviceEndAt: event.detail.value, errorText: "" });
  },

  onCrossDayChange(event) {
    this.dirty = true;
    this.setData({ crossDay: event.detail.value, errorText: "" });
  },

  chooseAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sizeType: ["compressed"],
      success: (res) => {
        const files = res.tempFiles || [];
        if (!files.length) return;
        this.uploadAvatar(files[0].tempFilePath);
      },
    });
  },

  uploadAvatar(filePath) {
    if (this.data.uploading) return;
    this.setData({ uploading: true, errorText: "" });
    wx.showLoading({ title: "上传中", mask: true });
    api
      .upload(filePath, "avatar")
      .then((data) => {
        wx.hideLoading();
        this.dirty = true;
        this.setData({ uploading: false, avatar: data.url });
      })
      .catch((error) => {
        wx.hideLoading();
        this.setData({
          uploading: false,
          errorText: (error && error.message) || "头像上传失败",
        });
      });
  },

  previewAvatar() {
    if (!this.data.avatar) return;
    wx.previewImage({ urls: [this.data.avatar], current: this.data.avatar });
  },

  buildBody() {
    const original = this.original || {};
    const body = {};
    const name = String(this.data.name || "").trim();
    if (name !== (original.name || "")) body.name = name;
    if (this.data.avatar && this.data.avatar !== (original.avatar || "")) body.avatar = this.data.avatar;
    // 简介/城市/地址没有下发，留空即不改，避免用空值把店主维护的内容冲掉
    const intro = String(this.data.intro || "").trim();
    if (intro) body.intro = intro;
    const serviceCity = String(this.data.serviceCity || "").trim();
    if (serviceCity) body.serviceCity = serviceCity;
    const address = String(this.data.address || "").trim();
    if (address) body.address = address;
    if (this.data.serviceStartAt && this.data.serviceStartAt !== (original.serviceStartAt || "")) {
      body.serviceStartAt = this.data.serviceStartAt;
    }
    if (this.data.serviceEndAt && this.data.serviceEndAt !== (original.serviceEndAt || "")) {
      body.serviceEndAt = this.data.serviceEndAt;
    }
    if (!!this.data.crossDay !== !!original.crossDay) body.crossDay = !!this.data.crossDay;
    return body;
  },

  validate() {
    const name = String(this.data.name || "").trim();
    if (!name) return "请填写姓名";
    if (name.length > 60) return "姓名最多 60 个字";
    if (String(this.data.intro || "").length > 2000) return "简介最多 2000 个字";
    if (String(this.data.serviceCity || "").length > 60) return "服务城市最多 60 个字";
    if (String(this.data.address || "").length > 200) return "常驻地址最多 200 个字";
    const startAt = minutesOf(this.data.serviceStartAt);
    const endAt = minutesOf(this.data.serviceEndAt);
    if (startAt < 0 || endAt < 0) return "请选择完整的可服务开始与结束时间";
    if (!this.data.crossDay && endAt <= startAt) {
      return "结束时间必须晚于开始时间；夜班跨零点请打开「允许跨零点」";
    }
    return "";
  },

  submit() {
    if (this.data.submitting) return;
    const errorText = this.validate();
    if (errorText) {
      this.setData({ errorText: errorText });
      return;
    }
    const body = this.buildBody();
    if (!Object.keys(body).length) {
      wx.showToast({ title: "没有需要提交的修改", icon: "none" });
      return;
    }
    this.setData({ submitting: true, errorText: "" });
    wx.showLoading({ title: "提交中", mask: true });
    api
      .staffUpdateProfile(body)
      .then(() => {
        wx.hideLoading();
        this.setData({ submitting: false });
        wx.showToast({ title: "已提交审核", icon: "success" });
        setTimeout(() => wx.navigateBack(), 700);
      })
      .catch((error) => {
        wx.hideLoading();
        this.setData({
          submitting: false,
          errorText: (error && error.message) || "提交失败，请稍后重试",
        });
      });
  },
});
