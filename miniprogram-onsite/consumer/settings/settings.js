const session = require("../../utils/session");
const config = require("../../config");

Page({
  data: {
    apiBase: "",
    shopCode: "",
    version: config.templateVersion || "",
    apiInput: "",
    notReady: false,
    readyReason: "",
  },

  onLoad() {
    this.sync();
    this.checkShop();
  },

  onShow() {
    this.sync();
  },

  sync() {
    const apiBase = session.getApiBase();
    this.setData({
      apiBase: apiBase,
      shopCode: session.getShopCode(),
      apiInput: apiBase,
    });
  },

  /** 店铺没开通也照常显示设置：本地调试正需要改服务器地址。 */
  checkShop() {
    const self = this;
    getApp()
      .ensureReady()
      .then((shop) => {
        if (!shop || !shop.shopCode) {
          self.setData({
            notReady: true,
            readyReason: getApp().globalData.bootstrapError || "店铺尚未开通，请联系店铺方",
          });
          return;
        }
        self.setData({ notReady: false, readyReason: "" });
      })
      .catch((error) => {
        self.setData({
          notReady: true,
          readyReason: (error && error.message) || "店铺服务暂不可用",
        });
      });
  },

  onApiInput(event) {
    this.setData({ apiInput: event.detail.value });
  },

  saveApiBase() {
    const value = String(this.data.apiInput || "").trim().replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(value)) {
      wx.showToast({ title: "请填写 http:// 或 https:// 开头的地址", icon: "none" });
      return;
    }
    session.setApiBase(value);
    this.sync();
    wx.showModal({
      title: "已保存",
      content: "服务器地址已保存，需要重新启动小程序（或在开发者工具里重新编译）后生效。",
      showCancel: false,
    });
  },

  resetApiBase() {
    session.setApiBase("");
    this.sync();
    wx.showToast({ title: "已恢复出包默认地址", icon: "none" });
  },

  clearLogin() {
    wx.showModal({
      title: "清除登录状态",
      content: "清除后需要重新进入小程序才会重新登录，确认退出？",
      success(res) {
        if (!res.confirm) return;
        session.clearToken();
        session.clearStaffToken();
        wx.showToast({ title: "已退出登录", icon: "none" });
      },
    });
  },
});
