const auth = require("../../utils/auth");

Page({
  data: {
    busy: false,
    error: "",
    redirect: "",
    configError: "",
  },

  onLoad(query) {
    this.setData({
      redirect: String(query.redirect || ""),
      configError: getApp().globalData.configError || "",
    });
  },

  login() {
    if (this.data.busy) return;
    if (this.data.configError) {
      this.setData({ error: "请先补全 config.js：" + this.data.configError });
      return;
    }
    this.setData({ busy: true, error: "" });
    auth
      .login()
      .then(() => {
        const redirect = this.data.redirect;
        if (redirect) {
          wx.redirectTo({ url: decodeURIComponent(redirect) });
          return;
        }
        const pages = getCurrentPages();
        if (pages.length > 1) wx.navigateBack();
        else wx.switchTab({ url: "/pages/home/home" });
      })
      .catch((error) => {
        this.setData({
          busy: false,
          error: (error && error.message) || "登录失败，请稍后重试",
        });
      });
  },
});