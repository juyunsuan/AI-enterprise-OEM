const api = require("../../../utils/api");
const staff = require("../../../utils/staff");
const format = require("../../../utils/format");

Page({
  data: {
    loading: true,
    error: "",
    order: null,
    busy: false,
    attributes: [],
  },

  onLoad(options) {
    this.orderId = Number(options.id || 0);
    this.load();
  },

  onShow() {
    if (this.orderId && !this.data.loading) this.load();
  },

  load() {
    if (!staff.requireStaff()) return;
    this.setData({ loading: true, error: "" });
    api
      .staffOrderDetail(this.orderId)
      .then((order) => {
        const snapshot = order.itemSnapshot || {};
        const attributes = snapshot.attributes || {};
        this.setData({
          loading: false,
          order: {
            ...order,
            payText: format.yuan(Math.round(Number(order.payAmount) * 100)),
            rentText: format.yuan(Math.round(Number(order.rentAmount) * 100)),
            depositText: format.yuan(Math.round(Number(order.depositAmount) * 100)),
            damageText: format.yuan(Math.round(Number(order.damageFee) * 100)),
            refundText: format.yuan(Math.round(Number(order.refundAmount) * 100)),
            periodText: order.startAt.slice(0, 10) + " 至 " + order.endAt.slice(0, 10),
          },
          attributes: Object.keys(attributes).map((key) => ({ key: key, value: attributes[key] })),
        });
      })
      .catch((error) =>
        this.setData({ loading: false, error: (error && error.message) || "租单加载失败" }),
      );
  },

  goInspection(event) {
    const kind = event.currentTarget.dataset.kind;
    const next = event.currentTarget.dataset.next;
    wx.navigateTo({
      url:
        "/pages/staff/inspection/inspection?orderId=" +
        this.orderId +
        "&kind=" +
        kind +
        "&next=" +
        next,
    });
  },

  act(event) {
    const action = event.currentTarget.dataset.action;
    const labels = { complete: "结算并退押金", cancel: "取消订单" };
    wx.showModal({
      title: labels[action] || "确认操作",
      content:
        action === "complete"
          ? "将按还回验车结果扣除车损后退回押金，确定完成结算吗？"
          : "取消已支付订单会原路全额退款，确定继续吗？",
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ busy: true });
        api
          .staffAction({ orderId: this.orderId, action: action, note: "" })
          .then(() => {
            this.setData({ busy: false });
            wx.showToast({ title: "已更新", icon: "success" });
            this.load();
          })
          .catch((error) => {
            this.setData({ busy: false });
            wx.showToast({ title: (error && error.message) || "操作失败", icon: "none" });
          });
      },
    });
  },

  callCustomer() {
    const phone = this.data.order && this.data.order.customerPhone;
    if (phone) wx.makePhoneCall({ phoneNumber: phone });
  },
});