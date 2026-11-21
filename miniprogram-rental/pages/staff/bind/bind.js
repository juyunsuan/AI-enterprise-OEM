const api = require("../../../utils/api");
const auth = require("../../../utils/auth");
const session = require("../../../utils/session");
const staff = require("../../../utils/staff");

Page({
  data: {
    phone: "",
    staffCode: "",
    submitting: false,
  },

  onShow() {
    if (session.getStaffToken()) {
      wx.redirectTo({ url: "/pages/staff/workbench/workbench" });
    }
  },

  onPhone(event) {
    this.setData({ phone: event.detail.value });
  },
  onCode(event) {
    this.setData({ staffCode: event.detail.value });
  },

  submit() {
    if (this.data.submitting) return;
    if (!this.data.phone.trim() || !this.data.staffCode.trim()) {
      wx.showToast({ title: "请填写手机号与工号", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    wx.showLoading({ title: "绑定中…", mask: true });
    auth
      .ensureLogin()
      .then(() =>
        api.staffBind({
          phone: this.data.phone.trim(),
          staffCode: this.data.staffCode.trim(),
        }),
      )
      .then((res) => {
        session.setStaffToken(res.token);
        session.setStaff(res.staff || null);
        wx.hideLoading();
        wx.showToast({ title: "绑定成功", icon: "success" });
        wx.redirectTo({ url: "/pages/staff/workbench/workbench" });
      })
      .catch((error) => {
        wx.hideLoading();
        wx.showToast({ title: (error && error.message) || "绑定失败", icon: "none" });
      })
      .finally(() => this.setData({ submitting: false }));
  },

  back() {
    wx.switchTab({ url: "/pages/index/index" });
  },
});