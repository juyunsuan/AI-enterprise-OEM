const api = require("../../utils/api");
const agent = require("../../utils/agent");

/**
 * 代理招募技师：只提交档案，不代替店主审核。
 * 审核通过后技师用手机号在小程序「技师端」绑定即可接单。
 */
Page({
  data: {
    form: { name: "", phone: "", city: "", intro: "" },
    loading: true,
    submitting: false,
    submitted: false,
    resultText: "",
    errorText: "",
  },

  onLoad() {
    this.gate = agent.ensureAgent();
  },

  async onShow() {
    const gate = this.gate || agent.ensureAgent();
    this.gate = null;
    const profile = await gate.catch(() => null);
    if (!profile) return;
    this.setData({ loading: false });
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    if (!field) return;
    this.setData({ ["form." + field]: event.detail.value });
  },

  async submit() {
    if (this.data.submitting) return;
    const form = this.data.form;
    const name = String(form.name || "").trim();
    const phone = String(form.phone || "").trim();
    if (!name) {
      wx.showToast({ title: "请填写技师姓名", icon: "none" });
      return;
    }
    if (!/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: "请填写 11 位手机号", icon: "none" });
      return;
    }
    this.setData({ submitting: true, errorText: "" });
    try {
      const result = await api.agentTechnicianApply({
        name: name,
        phone: phone,
        city: String(form.city || "").trim(),
        intro: String(form.intro || "").trim(),
      });
      this.setData({
        submitting: false,
        submitted: true,
        resultText:
          (result && result.message) ||
          "已提交，待店主审核通过后即可登录技师端",
      });
    } catch (error) {
      this.setData({
        submitting: false,
        errorText: (error && error.message) || "提交失败，请稍后重试",
      });
    }
  },

  restart() {
    this.setData({
      submitted: false,
      errorText: "",
      form: { name: "", phone: "", city: "", intro: "" },
    });
  },
});
