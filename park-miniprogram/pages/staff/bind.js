const api = require("../../utils/api");
const session = require("../../utils/session");

Page({
  data: {
    park: "",
    phone: "",
    staffCode: "",
    submitting: false,
  },

  onLoad() {
    this.setData({ park: session.getParkCode() });
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [field]: event.detail.value });
  },

  submit() {
    if (this.data.submitting) return;
    const park = String(this.data.park || "").trim().toUpperCase();
    const phone = String(this.data.phone || "").trim();
    const staffCode = String(this.data.staffCode || "").trim();
    if (!park || !phone || !staffCode) {
      wx.showToast({ title: "请填写园区码、手机号与工号", icon: "none" });
      return;
    }
    if (park !== session.getParkCode()) session.setParkCode(park);
    this.setData({ submitting: true });
    api
      .staffBind(phone, staffCode)
      .then((result) => {
        session.setStaffLogin(result);
        wx.showToast({ title: "绑定成功", icon: "success" });
        setTimeout(
          () => wx.navigateTo({ url: "/pages/staff/workbench" }),
          500,
        );
      })
      .catch((error) => {
        wx.showToast({
          title: (error && error.message) || "绑定失败",
          icon: "none",
        });
      })
      .then(() => this.setData({ submitting: false }));
  },
});
