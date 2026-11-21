const api = require("../../utils/api");
const session = require("../../utils/session");

Page({
  data: {
    tab: "approvals",
    workbench: null,
    approvals: [],
    reservations: [],
    workorders: [],
    checkinCode: "",
    loading: true,
  },

  onShow() {
    if (!session.getStaffToken()) {
      wx.redirectTo({ url: "/pages/staff/bind" });
      return;
    }
    this.load();
  },

  onPullDownRefresh() {
    this.load();
  },

  switchTab(event) {
    this.setData({ tab: event.currentTarget.dataset.tab });
  },

  goPage(event) {
    const path = event.currentTarget.dataset.path;
    if (path) wx.navigateTo({ url: path });
  },

  load() {
    this.setData({ loading: true });
    Promise.all([
      api.staffWorkbench(),
      api.staffApprovals(),
      api.staffReservations(),
      api.staffWorkOrders(),
    ])
      .then(([workbench, approvals, reservations, workorders]) => {
        this.setData({
          loading: false,
          workbench,
          approvals: Array.isArray(approvals) ? approvals : [],
          reservations: reservations && reservations.list ? reservations.list : [],
          workorders: workorders && workorders.list ? workorders.list : [],
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

  actApproval(event) {
    const id = Number(event.currentTarget.dataset.id);
    const action = event.currentTarget.dataset.action;
    api
      .staffApprovalAct(id, action, "")
      .then(() => {
        wx.showToast({ title: "已处理", icon: "success" });
        this.load();
      })
      .catch((error) =>
        wx.showToast({
          title: (error && error.message) || "处理失败",
          icon: "none",
        }),
      );
  },

  onCheckinInput(event) {
    this.setData({ checkinCode: event.detail.value });
  },

  scan() {
    wx.scanCode({
      success: (res) => {
        this.setData({ checkinCode: String(res.result || "") });
        this.checkin();
      },
    });
  },

  checkin() {
    const code = String(this.data.checkinCode || "").trim();
    if (!code) {
      wx.showToast({ title: "请填写通行码", icon: "none" });
      return;
    }
    api
      .staffCheckin(code)
      .then(() => {
        wx.showToast({ title: "核验成功", icon: "success" });
        this.setData({ checkinCode: "" });
        this.load();
      })
      .catch((error) =>
        wx.showToast({
          title: (error && error.message) || "核验失败",
          icon: "none",
        }),
      );
  },

  doneWorkOrder(event) {
    const id = Number(event.currentTarget.dataset.id);
    wx.showModal({
      title: "处理结果",
      editable: true,
      placeholderText: "填写处理结果",
      success: (res) => {
        if (!res.confirm) return;
        const result = String(res.content || "").slice(0, 500);
        wx.showModal({
          title: "工单费用（元）",
          editable: true,
          placeholderText: "0 表示免费",
          success: (feeRes) => {
            if (!feeRes.confirm) return;
            const fee = Number(feeRes.content || 0) || 0;
            api
              .staffWorkOrderAct(id, "done", "", result, fee)
              .then(() => {
                wx.showToast({ title: "已完成", icon: "success" });
                this.load();
              })
              .catch((error) =>
                wx.showToast({
                  title: (error && error.message) || "处理失败",
                  icon: "none",
                }),
              );
          },
        });
      },
    });
  },

  actWorkOrder(event) {
    const id = Number(event.currentTarget.dataset.id);
    const action = event.currentTarget.dataset.action;
    api
      .staffWorkOrderAct(id, action, "", "", 0)
      .then(() => {
        wx.showToast({ title: "已处理", icon: "success" });
        this.load();
      })
      .catch((error) =>
        wx.showToast({
          title: (error && error.message) || "处理失败",
          icon: "none",
        }),
      );
  },
});
