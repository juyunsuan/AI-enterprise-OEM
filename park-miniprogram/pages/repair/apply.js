const api = require("../../utils/api");
const auth = require("../../utils/auth");

Page({
  data: {
    categories: ["报修", "投诉建议", "保洁", "其他"],
    categoryValues: ["REPAIR", "COMPLAINT", "CLEANING", "OTHER"],
    categoryIndex: 0,
    urgency: ["普通", "紧急", "不急"],
    urgencyValues: ["NORMAL", "HIGH", "LOW"],
    urgencyIndex: 0,
    title: "",
    description: "",
    location: "",
    images: [],
    submitting: false,
  },

  onCategoryChange(event) {
    this.setData({ categoryIndex: Number(event.detail.value) });
  },

  onUrgencyChange(event) {
    this.setData({ urgencyIndex: Number(event.detail.value) });
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [field]: event.detail.value });
  },

  goList() {
    wx.navigateTo({ url: "/pages/repair/list" });
  },

  chooseImages() {
    const remain = 9 - this.data.images.length;
    if (remain <= 0) return;
    wx.chooseMedia({
      count: remain,
      mediaType: ["image"],
      success: (res) => {
        const files = (res.tempFiles || []).map((item) => item.tempFilePath);
        Promise.all(files.map((file) => api.uploadImage(file, "repair")))
          .then((uploaded) => {
            this.setData({
              images: this.data.images.concat(uploaded.map((item) => item.url)),
            });
          })
          .catch((error) =>
            wx.showToast({
              title: (error && error.message) || "上传失败",
              icon: "none",
            }),
          );
      },
    });
  },

  removeImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    const images = this.data.images.slice();
    images.splice(index, 1);
    this.setData({ images });
  },

  submit() {
    if (this.data.submitting) return;
    if (!this.data.title.trim()) {
      wx.showToast({ title: "请填写问题标题", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    auth
      .ensureLogin()
      .then(() =>
        api.createWorkOrder({
          category: this.data.categoryValues[this.data.categoryIndex],
          title: this.data.title,
          description: this.data.description,
          location: this.data.location,
          urgency: this.data.urgencyValues[this.data.urgencyIndex],
          images: this.data.images,
        }),
      )
      .then(() => {
        wx.showToast({ title: "已提交", icon: "success" });
        this.setData({
          title: "",
          description: "",
          location: "",
          images: [],
          submitting: false,
        });
        setTimeout(() => wx.navigateTo({ url: "/pages/repair/list" }), 600);
      })
      .catch((error) => {
        this.setData({ submitting: false });
        wx.showToast({
          title: (error && error.message) || "提交失败",
          icon: "none",
        });
      });
  },
});
