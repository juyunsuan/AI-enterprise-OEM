const api = require("../../utils/api");
const session = require("../../utils/session");

const HOME = "/agent/index/index";

Page({
  data: {
    phone: "",
    error: "",
    submitting: false,
  },

  onLoad() {
    if (session.getAgentToken() && session.getAgent()) {
      wx.redirectTo({ url: HOME });
    }
  },

  onPhoneInput(event) {
    this.setData({ phone: event.detail.value, error: "" });
  },

  async submit() {
    if (this.data.submitting) return;
    const phone = String(this.data.phone || "").trim();
    if (!/^1\d{10}$/.test(phone)) {
      this.setData({ error: "请填写 11 位手机号" });
      return;
    }
    this.setData({ submitting: true, error: "" });
    try {
      const data = await api.agentBind(phone);
      session.setAgentToken(data.token);
      session.setAgent(data.identity || null);
      wx.showToast({ title: "绑定成功", icon: "success" });
      wx.redirectTo({ url: HOME });
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
