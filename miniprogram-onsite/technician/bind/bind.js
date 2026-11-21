const api = require("../../utils/api");
const session = require("../../utils/session");
const staff = require("../../utils/staff");

const WORKBENCH = "/technician/workbench/workbench";

Page({
  data: {
    phone: "",
    staffNo: "",
    error: "",
    submitting: false,
  },

  onLoad() {
    // 本地还留着技师态就先回工作台：令牌真伪由工作台的闸门回库校验，
    // 失效时 ensureStaff 会清态并把人送回本页，不会来回跳。
    if (session.getStaffToken() && session.getStaff()) {
      wx.redirectTo({ url: WORKBENCH });
    }
  },

  onPhoneInput(event) {
    this.setData({ phone: event.detail.value, error: "" });
  },

  onStaffNoInput(event) {
    this.setData({ staffNo: event.detail.value, error: "" });
  },

  async submit() {
    if (this.data.submitting) return;
    const phone = String(this.data.phone || "").trim();
    const staffNo = String(this.data.staffNo || "").trim();
    if (!/^1\d{10}$/.test(phone)) {
      this.setData({ error: "请填写 11 位手机号" });
      return;
    }
    this.setData({ submitting: true, error: "" });
    try {
      // 绑定要求先有顾客令牌（自证在本店小程序登录过），没有就静默换一次
      await staff.ensureLogin();
      const data = await api.staffBind({ phone: phone, staffNo: staffNo });
      session.setStaffToken(data.token);
      session.setStaff(data.staff || null);
      wx.showToast({ title: "绑定成功", icon: "success" });
      wx.redirectTo({ url: WORKBENCH });
    } catch (error) {
      this.setData({
        error: (error && error.message) || "绑定失败，请稍后重试",
      });
    } finally {
      this.setData({ submitting: false });
    }
  },

  goCustomerHome() {
    wx.switchTab({ url: "/pages/index/index" });
  },
});
