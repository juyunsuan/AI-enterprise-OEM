const api = require("../../utils/api");
const auth = require("../../utils/auth");

Page({
  data: { loading: true, list: [] },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load();
  },

  pay(event) {
    const id = Number(event.currentTarget.dataset.id);
    api
      .orderPayParams(id)
      .then((result) => {
        if (!result || !result.payable || !result.params) {
          wx.showToast({
            title: (result && result.reason) || "暂不可在线支付",
            icon: "none",
          });
          return;
        }
        wx.requestPayment({
          ...result.params,
          success: () => {
            wx.showToast({ title: "支付成功", icon: "success" });
            this.load();
          },
          fail: () => {
            wx.showToast({ title: "支付未完成", icon: "none" });
          },
        });
      })
      .catch((error) =>
        wx.showToast({
          title: (error && error.message) || "支付发起失败",
          icon: "none",
        }),
      );
  },

  load() {
    this.setData({ loading: true });
    auth
      .ensureLogin()
      .then(() => api.orders())
      .then((list) => {
        this.setData({ loading: false, list: Array.isArray(list) ? list : [] });
        wx.stopPullDownRefresh();
      })
      .catch((error) => {
        this.setData({ loading: false });
        wx.stopPullDownRefresh();
        wx.showToast({
          title: (error && error.message) || "读取失败",
          icon: "none",
        });
      });
  },
});
