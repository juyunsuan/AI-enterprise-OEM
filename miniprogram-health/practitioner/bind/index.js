const api = require("../../utils/api");
const auth = require("../../utils/auth");
const session = require("../../utils/session");
const staff = require("../../utils/staff");

Page({
  data: {
    bound: false,
    practitioner: null,
    phone: "",
    licenseNo: "",
    submitting: false,
  },

  onShow() {
    const token = session.getStaffToken();
    this.setData({
      bound: !!token,
      practitioner: token ? session.getStaffProfile() : null,
    });
    if (token) this.refreshProfile();
  },

  async refreshProfile() {
    try {
      const profile = await api.staffProfile();
      session.setStaffToken(session.getStaffToken(), profile);
      this.setData({ practitioner: profile });
    } catch (error) {
      if (error && error.code === 401) this.setData({ bound: false, practitioner: null });
    }
  },

  onPhone(e) {
    this.setData({ phone: e.detail.value });
  },

  onLicense(e) {
    this.setData({ licenseNo: e.detail.value });
  },

  async onSubmit() {
    if (this.data.submitting) return;
    const phone = String(this.data.phone || "").trim();
    const licenseNo = String(this.data.licenseNo || "").trim();
    if (!phone) {
      wx.showToast({ title: "请填写医护登记手机号", icon: "none" });
      return;
    }
    if (!licenseNo) {
      wx.showToast({ title: "请填写执业证号", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    try {
      await auth.requireLogin({ redirect: false });
      const data = await api.staffBind(phone, licenseNo);
      session.setStaffToken(data.token, data.practitioner);
      wx.showToast({ title: "绑定成功" });
      setTimeout(() => wx.redirectTo({ url: "/practitioner/workbench/index" }), 500);
    } catch (error) {
      this.setData({ submitting: false });
      staff.handleError(error, "绑定失败");
    }
  },

  onEnter() {
    wx.redirectTo({ url: "/practitioner/workbench/index" });
  },

  onRebind() {
    wx.showModal({
      title: "重新绑定",
      content: "将清除本机医护登录，需要重新输入手机号与执业证号。",
      success: (res) => {
        if (!res.confirm) return;
        session.clearStaffToken();
        this.setData({ bound: false, practitioner: null, phone: "", licenseNo: "" });
      },
    });
  },

  onSettings() {
    wx.navigateTo({ url: "/consumer/settings/settings" });
  },
});
