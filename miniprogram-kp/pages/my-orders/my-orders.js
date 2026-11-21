/**
 * 我的支付订单：微信支付的课程/会员订单与退款状态。
 */
const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

const STATUS_TEXT = {
  pending: "待支付",
  paid: "已支付",
  closed: "已关闭",
  refunded: "已退款",
};

Page({
  data: {
    themeStyle: "",
    list: [],
    loading: true,
    loginFailed: false,
  },

  onShow() {
    const app = getApp();
    this.setData({ themeStyle: app.globalData.themeStyle });
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    this.setData({ loading: true });
    return auth
      .ensureMember()
      .then(() => api.cashOrders({ page: 1, pageSize: 50 }))
      .then((data) => {
        const list = ((data && data.list) || []).map((item) =>
          Object.assign({}, item, {
            statusText: STATUS_TEXT[item.status] || item.status,
            amountText: "¥" + ((item.amountCents || 0) / 100).toFixed(2),
            timeText: format.dateTime(item.paidAt || item.createdAt),
          }),
        );
        this.setData({ list, loading: false, loginFailed: false });
      })
      .catch((error) => {
        this.setData({ loading: false, loginFailed: true });
        auth.showError(error);
      });
  },

  retryLogin() {
    auth
      .login()
      .then(() => this.load())
      .catch((error) => auth.showError(error));
  },

  goHome() {
    wx.switchTab({ url: "/pages/index/index" });
  },
});
