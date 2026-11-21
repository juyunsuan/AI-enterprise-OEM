const api = require("../../utils/api");
const format = require("../../utils/format");
const staff = require("../../utils/staff");

Page({
  data: {
    code: "",
    submitting: false,
    result: null,
  },

  onCode(e) {
    this.setData({ code: e.detail.value });
  },

  async onSubmit() {
    if (this.data.submitting) return;
    const code = String(this.data.code || "").trim();
    if (!code) {
      wx.showToast({ title: "请输入核销码", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    try {
      await staff.requireStaff();
      const data = await api.staffVerify(code);
      this.setData({
        submitting: false,
        code: "",
        result: {
          ...data,
          amountText: format.yuan(data.payAmountCents || 0),
          timeText: format.dateTime(data.verifiedAt),
        },
      });
      wx.showToast({ title: "核销成功" });
    } catch (error) {
      this.setData({ submitting: false });
      staff.handleError(error, "核销失败");
    }
  },

  onScan() {
    wx.scanCode({
      success: (res) => {
        this.setData({ code: res.result || "" });
        this.onSubmit();
      },
      fail: () => wx.showToast({ title: "未识别到核销码", icon: "none" }),
    });
  },
});
