const session = require("../../utils/session");
const auth = require("../../utils/auth");
const staff = require("../../utils/staff");

Page({
  data: {
    profile: null,
    apiBase: "",
    staff: null,
  },

  onShow() {
    this.setData({
      profile: session.getProfile() || null,
      apiBase: session.getApiBase(),
      staff: session.getStaff() || null,
    });
  },

  editApiBase() {
    wx.showModal({
      title: "服务器地址",
      editable: true,
      placeholderText: "https://your-domain.com",
      content: this.data.apiBase,
      success: (res) => {
        if (!res.confirm) return;
        session.setApiBase(String(res.content || "").trim());
        getApp().globalData.ready = null;
        this.setData({ apiBase: session.getApiBase() });
        wx.showToast({ title: "已保存", icon: "success" });
      },
    });
  },

  loginNow() {
    auth
      .ensureLogin()
      .then((profile) => {
        this.setData({ profile: profile || session.getProfile() });
        wx.showToast({ title: "已登录", icon: "success" });
      })
      .catch((error) => wx.showToast({ title: (error && error.message) || "登录失败", icon: "none" }));
  },

  logout() {
    auth.logout();
    this.setData({ profile: null });
    wx.showToast({ title: "已退出", icon: "success" });
  },

  openStaff() {
    staff.openWorkbench();
  },

  unbindStaff() {
    session.clearStaffToken();
    this.setData({ staff: null });
    wx.showToast({ title: "已解绑员工身份", icon: "success" });
  },

  openDesk() {
    const shop = getApp().bootstrap();
    const desk = (shop && shop.desk) || {};
    if (!desk.enabled || !desk.siteKey) {
      wx.showToast({ title: "门店尚未绑定在线客服", icon: "none" });
      return;
    }
    wx.navigateTo({
      url:
        "/pages/webview/webview?src=" +
        encodeURIComponent(session.getApiBase() + "/embed/service-desk?key=" + desk.siteKey),
    });
  },

  openOrders() {
    wx.switchTab({ url: "/pages/order-list/order-list" });
  },
});