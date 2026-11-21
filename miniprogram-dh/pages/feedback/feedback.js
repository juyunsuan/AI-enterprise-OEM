/** 意见反馈：文字 + 联系方式 + 最多 3 张图，未登录也可提交。 */
const api = require("../../utils/api");
const auth = require("../../utils/auth");
const upload = require("../../utils/upload");

Page({
  data: {
    themeStyle: "",
    content: "",
    contact: "",
    images: [],
    submitting: false,
    uploading: false,
  },

  onShow() {
    this.setData({ themeStyle: getApp().globalData.themeStyle });
  },

  onContent(event) {
    this.setData({ content: String(event.detail.value || "") });
  },

  onContact(event) {
    this.setData({ contact: String(event.detail.value || "") });
  },

  addImage() {
    if (this.data.images.length >= 3 || this.data.uploading) return;
    this.setData({ uploading: true });
    upload
      .chooseImage()
      .then((path) => upload.upload(path))
      .then((result) => {
        this.setData({
          images: this.data.images.concat([result.url]),
          uploading: false,
        });
      })
      .catch((error) => {
        this.setData({ uploading: false });
        if (error && error.message !== "已取消选择") auth.showError(error);
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
    const content = String(this.data.content || "").trim();
    if (!content) {
      wx.showToast({ title: "请填写反馈内容", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    api
      .feedback({
        content: content,
        contact: String(this.data.contact || "").trim(),
        images: this.data.images,
      })
      .then(() => {
        this.setData({ submitting: false, content: "", images: [] });
        wx.showToast({ title: "已提交，感谢反馈" });
        setTimeout(() => wx.navigateBack({ fail() {} }), 800);
      })
      .catch((error) => {
        this.setData({ submitting: false });
        auth.showError(error);
      });
  },
});
