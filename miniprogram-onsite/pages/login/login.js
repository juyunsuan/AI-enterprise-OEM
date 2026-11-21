const auth = require("../../utils/auth");

Page({
  data: {
    agreed: false,
    loading: false,
    error: "",
    shopName: "",
  },

  onLoad() {
    getApp()
      .ensureReady()
      .then(() => {
        const shop = getApp().bootstrap();
        if (shop && shop.shopName) this.setData({ shopName: shop.shopName });
      })
      .catch(() => undefined);
  },

  onAgreeChange(event) {
    const values = (event.detail && event.detail.value) || [];
    this.setData({ agreed: values.indexOf("agree") >= 0 });
  },

  /** 顾客没有注册这一步：wx.login 换令牌，成功即回首页。 */
  submit() {
    if (this.data.loading) return;
    if (!this.data.agreed) {
      wx.showToast({ title: "请先勾选同意用户协议", icon: "none" });
      return;
    }
    this.setData({ loading: true, error: "" });
    auth
      .ensureLogin()
      .then(() => {
        wx.switchTab({ url: "/pages/index/index" });
      })
      .catch((error) => {
        this.setData({ loading: false, error: this.readable(error) });
      });
  },

  /** 失败原因原样给顾客看；域名白名单这类只有店主能处理，补一句说明。 */
  readable(error) {
    const message = (error && error.message) || "";
    if (!message) return "登录失败，请稍后重试";
    if (message.indexOf("domain") >= 0) {
      return "服务器地址未在小程序后台登记为合法域名，请联系店主处理";
    }
    return message;
  },
});
