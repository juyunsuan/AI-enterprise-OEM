const api = require("../../utils/api");
const auth = require("../../utils/auth");
const session = require("../../utils/session");

Page({
  data: {
    nickname: "",
    avatar: "",
    saving: false,
  },

  onLoad() {
    const customer = session.getCustomer() || {};
    this.setData({
      nickname: customer.nickname || "",
      avatar: customer.avatar || "",
    });
    auth.ensureLogin().catch(() => {});
  },

  bindNickname(event) {
    this.setData({ nickname: event.detail.value });
  },

  chooseAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      success: (result) => {
        const file = result.tempFiles && result.tempFiles[0];
        if (!file) return;
        wx.showLoading({ title: "上传中" });
        api
          .upload(file.tempFilePath)
          .then((uploaded) => this.setData({ avatar: uploaded.url }))
          .catch((error) =>
            wx.showToast({ title: (error && error.message) || "上传失败", icon: "none" })
          )
          .then(() => wx.hideLoading());
      },
    });
  },

  save() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    auth
      .ensureLogin()
      .then(() => api.saveProfile(this.data.nickname, this.data.avatar))
      .then((customer) => {
        session.setLogin({
          token: session.getToken(),
          customerId: customer.customerId,
          nickname: customer.nickname,
          avatar: customer.avatar,
        });
        wx.showToast({ title: "资料已保存" });
        setTimeout(() => wx.navigateBack(), 400);
      })
      .catch((error) =>
        wx.showToast({ title: (error && error.message) || "保存失败", icon: "none" })
      )
      .then(() => this.setData({ saving: false }));
  },
});