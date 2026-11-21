const api = require("../../utils/api");
const auth = require("../../utils/auth");

function today() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

Page({
  data: {
    kinds: ["访客预约", "场地预约", "会议室预约"],
    kindValues: ["VISITOR", "VENUE", "MEETING"],
    kindIndex: 0,
    visitorName: "",
    visitorPhone: "",
    visitorCompany: "",
    plateNo: "",
    companions: 0,
    resourceName: "",
    startDate: today(),
    startTime: "09:00",
    endDate: today(),
    endTime: "18:00",
    purpose: "",
    note: "",
    submitting: false,
  },

  onKindChange(event) {
    this.setData({ kindIndex: Number(event.detail.value) });
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [field]: event.detail.value });
  },

  onPicker(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [field]: event.detail.value });
  },

  submit() {
    if (this.data.submitting) return;
    const kind = this.data.kindValues[this.data.kindIndex];
    if (!this.data.visitorName.trim()) {
      wx.showToast({ title: "请填写访客姓名", icon: "none" });
      return;
    }
    if (kind === "VISITOR" && !this.data.visitorPhone.trim()) {
      wx.showToast({ title: "请填写访客手机号", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    auth
      .ensureLogin()
      .then(() =>
        api.createReservation({
          kind,
          visitorName: this.data.visitorName,
          visitorPhone: this.data.visitorPhone,
          visitorCompany: this.data.visitorCompany,
          plateNo: this.data.plateNo,
          companions: Number(this.data.companions) || 0,
          resourceName: this.data.resourceName,
          startAt: `${this.data.startDate}T${this.data.startTime}:00+08:00`,
          endAt: `${this.data.endDate}T${this.data.endTime}:00+08:00`,
          purpose: this.data.purpose,
          note: this.data.note,
        }),
      )
      .then(() => {
        wx.showToast({ title: "已提交，等待审批", icon: "success" });
        setTimeout(() => wx.switchTab({ url: "/pages/visitor/list" }), 600);
      })
      .catch((error) => {
        wx.showToast({
          title: (error && error.message) || "提交失败",
          icon: "none",
        });
      })
      .then(() => this.setData({ submitting: false }));
  },
});
