const api = require("../../../utils/api");
const staff = require("../../../utils/staff");

Page({
  data: {
    kind: "HANDOVER",
    kindLabel: "取车验车",
    next: "",
    orderId: 0,
    mileage: "",
    fuelPercent: "100",
    damage: "",
    damageFee: "",
    note: "",
    images: [],
    submitting: false,
    uploading: false,
  },

  onLoad(options) {
    const kind = options.kind === "RETURN" ? "RETURN" : "HANDOVER";
    this.setData({
      kind: kind,
      kindLabel: kind === "RETURN" ? "还回验车" : "取车验车",
      next: options.next || "",
      orderId: Number(options.orderId || 0),
    });
    staff.requireStaff();
  },

  onMileage(event) {
    this.setData({ mileage: event.detail.value });
  },
  onFuel(event) {
    this.setData({ fuelPercent: event.detail.value });
  },
  onDamage(event) {
    this.setData({ damage: event.detail.value });
  },
  onDamageFee(event) {
    this.setData({ damageFee: event.detail.value });
  },
  onNote(event) {
    this.setData({ note: event.detail.value });
  },

  chooseImage() {
    if (this.data.uploading) return;
    wx.chooseMedia({
      count: 9 - this.data.images.length,
      mediaType: ["image"],
      sizeType: ["compressed"],
      success: (res) => {
        const files = (res.tempFiles || []).map((file) => file.tempFilePath);
        if (!files.length) return;
        this.setData({ uploading: true });
        wx.showLoading({ title: "上传中…", mask: true });
        Promise.all(files.map((path) => api.upload(path, "inspection", true)))
          .then((uploads) => {
            wx.hideLoading();
            this.setData({
              uploading: false,
              images: this.data.images.concat(uploads.map((item) => item.url)),
            });
          })
          .catch((error) => {
            wx.hideLoading();
            this.setData({ uploading: false });
            wx.showToast({ title: (error && error.message) || "上传失败", icon: "none" });
          });
      },
    });
  },

  removeImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    const images = this.data.images.slice();
    images.splice(index, 1);
    this.setData({ images: images });
  },

  submit() {
    if (this.data.submitting) return;
    if (!this.data.orderId) {
      wx.showToast({ title: "缺少租单标识", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    wx.showLoading({ title: "保存验车…", mask: true });
    api
      .staffInspection({
        orderId: this.data.orderId,
        kind: this.data.kind,
        mileage: Number(this.data.mileage || 0),
        fuelPercent: Number(this.data.fuelPercent || 100),
        damage: this.data.damage.trim(),
        damageFee: Number(this.data.damageFee || 0),
        images: this.data.images,
        note: this.data.note.trim(),
      })
      .then(() => {
        if (!this.data.next) return null;
        return api.staffAction({
          orderId: this.data.orderId,
          action: this.data.next,
          note: this.data.note.trim(),
        });
      })
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: "已保存", icon: "success" });
        setTimeout(() => wx.navigateBack({ delta: 1 }), 600);
      })
      .catch((error) => {
        wx.hideLoading();
        this.setData({ submitting: false });
        wx.showToast({ title: (error && error.message) || "保存失败", icon: "none" });
      });
  },
});