const api = require("../../../utils/api");
const session = require("../../../utils/session");
const staff = require("../../../utils/staff");

Page({
  data: {
    loading: true,
    error: "",
    staff: null,
    summary: null,
  },

  onShow() {
    const current = staff.requireStaff();
    if (!current) return;
    this.setData({ staff: current });
    api
      .staffWorkbench()
      .then((summary) => this.setData({ loading: false, summary: summary }))
      .catch((error) =>
        this.setData({ loading: false, error: (error && error.message) || "工作台加载失败" }),
      );
  },

  openOrders(event) {
    const status = event.currentTarget.dataset.status || "all";
    wx.navigateTo({ url: "/pages/staff/orders/orders?status=" + status });
  },

  openCustomers() {
    wx.navigateTo({ url: "/pages/staff/customers/customers" });
  },

  openCustomerSide() {
    wx.switchTab({ url: "/pages/index/index" });
  },

  unbind() {
    wx.showModal({
      title: "解绑员工身份",
      content: "解绑后需要重新用手机号 + 工号绑定，确定继续吗？",
      success: (res) => {
        if (!res.confirm) return;
        session.clearStaffToken();
        wx.redirectTo({ url: "/pages/staff/bind/bind" });
      },
    });
  },
});