const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

const BILL_LABELS = {
  POINT_EARN: "获得积分",
  POINT_USE: "抵扣积分",
  BALANCE_PAY: "余额支付",
  BALANCE_REFUND: "余额退款",
};

/** 会员中心：积分与流水。余额是二期储值字段，这里如实显示，不做假数字。 */
Page({
  data: { customer: null, bills: [], loading: true, error: "", logged: false },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    return auth
      .ensureLogin()
      .then(() => Promise.all([api.profile(), api.points()]))
      .then((rows) => {
        const customer = rows[0] || {};
        this.setData({
          logged: true,
          loading: false,
          error: "",
          customer: {
            nickname: customer.nickname || "微信用户",
            avatar: customer.avatar || "",
            phone: customer.phone || "",
            points: Number(customer.points || 0),
            balanceText: format.money(customer.balance),
          },
          bills: (rows[1] || []).map((row) => ({
            id: row.id,
            label: BILL_LABELS[row.type] || row.type,
            points: Number(row.points || 0),
            pointsText: (row.points > 0 ? "+" : "") + row.points,
            afterText: "余额 " + row.pointsAfter,
            remark: row.remark || "",
            timeText: format.dateTime(row.createdAt),
          })),
        });
      })
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "请先登录" });
      });
  },

  logout() {
    wx.showModal({
      title: "退出登录",
      content: "退出后需要重新授权才能下单，确定吗？",
      success: (result) => {
        if (!result.confirm) return;
        auth.logout();
        this.setData({ customer: null, bills: [], logged: false });
        wx.reLaunch({ url: "/pages/login/login" });
      },
    });
  },

  goCoupons() {
    wx.navigateTo({ url: "/pages/coupon/list?tab=mine" });
  },

  goAddresses() {
    wx.navigateTo({ url: "/pages/address/list" });
  },

  goOrders() {
    wx.navigateTo({ url: "/pages/order/list" });
  },
});
