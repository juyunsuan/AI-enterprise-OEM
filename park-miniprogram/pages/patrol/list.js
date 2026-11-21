const api = require("../../utils/api");
const session = require("../../utils/session");

Page({
  data: {
    loading: true,
    plans: [],
    planIndex: 0,
    pointIndex: 0,
    resultIndex: 0,
    results: ["正常", "异常"],
    resultValues: ["NORMAL", "ABNORMAL"],
    note: "",
    submitting: false,
  },
  onShow() {
    if (!session.getStaffToken()) {
      wx.redirectTo({ url: "/pages/staff/bind" });
      return;
    }
    this.load();
  },
  load() {
    this.setData({ loading: true });
    api
      .staffPatrolPlans()
      .then((plans) => {
        const list = Array.isArray(plans) ? plans : [];
        this.setData({
          loading: false,
          plans: list,
          planIndex: 0,
          pointIndex: 0,
        });
      })
      .catch((error) => {
        this.setData({ loading: false });
        wx.showToast({
          title: (error && error.message) || "读取失败",
          icon: "none",
        });
      });
  },
  onPlan(event) {
    this.setData({ planIndex: Number(event.detail.value), pointIndex: 0 });
  },
  onPoint(event) {
    this.setData({ pointIndex: Number(event.detail.value) });
  },
  onResult(event) {
    this.setData({ resultIndex: Number(event.detail.value) });
  },
  onNote(event) {
    this.setData({ note: event.detail.value });
  },
  submit() {
    if (this.data.submitting) return;
    const plan = this.data.plans[this.data.planIndex];
    if (!plan) {
      wx.showToast({ title: "暂无巡检计划", icon: "none" });
      return;
    }
    const point = (plan.points || [])[this.data.pointIndex];
    if (!point) {
      wx.showToast({ title: "请选择巡检点位", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    api
      .staffPatrolRecord({
        planId: plan.id,
        pointName: point.name,
        result: this.data.resultValues[this.data.resultIndex || 0],
        note: this.data.note,
        images: [],
      })
      .then(() => {
        wx.showToast({ title: "已提交", icon: "success" });
        this.setData({ note: "", submitting: false });
      })
      .catch((error) => {
        this.setData({ submitting: false });
        wx.showToast({
          title: (error && error.message) || "提交失败",
          icon: "none",
        });
      });
  },
});
