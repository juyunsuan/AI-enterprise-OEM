const api = require("../../utils/api");
const agent = require("../../utils/agent");
const format = require("../../utils/format");

/**
 * 代理改派：只对「待付款 / 待接单」的订单开放，与后端派单规则一致；
 * 已接单之后的订单归店主在后台处理，避免代理与服务中的技师互相覆盖。
 */
const STATUS_LABELS = {
  PENDING_PAYMENT: "待付款",
  PAID: "待接单",
  ACCEPTED: "已接单",
  EN_ROUTE: "服务出发",
  ON_SITE: "已到达",
  SERVING: "服务中",
  COMPLETED: "已完成",
  SIGNED: "已签收",
  REVIEWED: "已评价",
  CANCELLED: "已取消",
  EXPIRED: "超时关闭",
  REJECTED: "技师拒单",
  REFUND_PENDING: "退款中",
  REFUNDED: "已退款",
};

Page({
  data: {
    loading: true,
    errorText: "",
    orders: [],
    technicians: [],
    selectedId: 0,
    submitting: false,
  },

  onLoad() {
    this.gate = agent.ensureAgent();
  },

  async onShow() {
    const gate = this.gate || agent.ensureAgent();
    this.gate = null;
    const profile = await gate.catch(() => null);
    if (!profile) return;
    await this.load();
  },

  onPullDownRefresh() {
    this.load()
      .catch(() => undefined)
      .then(() => wx.stopPullDownRefresh());
  },

  async load() {
    this.setData({ loading: true, errorText: "" });
    try {
      const [orderResult, staffResult] = await Promise.all([
        api.agentOrders({ page: 1, pageSize: 50 }),
        api.agentTechnicians({ page: 1, pageSize: 50 }),
      ]);
      const orders = ((orderResult && orderResult.list) || []).map((row) => ({
        id: row.id,
        orderNo: row.orderNo,
        statusLabel: STATUS_LABELS[row.status] || row.status,
        timeText: format.dateTime(row.startAt),
        staffName: row.staffName || "待派单",
        customerName: row.customerName || "",
        canChange: ["PENDING_PAYMENT", "PAID"].indexOf(row.status) >= 0,
      }));
      const technicians = ((staffResult && staffResult.list) || []).map((row) => ({
        id: row.id,
        name: row.name,
        city: row.serviceCity || "不限城市",
        rating: Number(row.rating || 5).toFixed(1),
        orderText: "已服务 " + (row.orderCount || 0) + " 单",
      }));
      this.setData({
        loading: false,
        orders: orders,
        technicians: technicians,
      });
    } catch (error) {
      this.setData({
        loading: false,
        errorText: (error && error.message) || "加载失败，请稍后重试",
      });
    }
  },

  selectOrder(event) {
    const id = Number(event.currentTarget.dataset.id) || 0;
    this.setData({ selectedId: this.data.selectedId === id ? 0 : id });
  },

  chooseStaff(event) {
    const order = this.data.orders.find(
      (row) => row.id === this.data.selectedId
    );
    if (!order) {
      wx.showToast({ title: "请先选择要改派的订单", icon: "none" });
      return;
    }
    const staffId = Number(event.currentTarget.dataset.id) || 0;
    const staff = this.data.technicians.find((row) => row.id === staffId);
    if (!staff || this.data.submitting) return;
    wx.showModal({
      title: "确认改派",
      content:
        "订单 " +
        order.orderNo +
        " 将改派给「" +
        staff.name +
        "」，车费会按新技师位置重算。",
      success: (res) => {
        if (res.confirm) this.submit(order.id, staff.id);
      },
    });
  },

  async submit(orderId, staffId) {
    this.setData({ submitting: true });
    try {
      const result = await api.agentChangeStaff({
        orderId: orderId,
        staffId: staffId,
      });
      wx.showToast({
        title: "已改派给 " + ((result && result.staffName) || "新技师"),
        icon: "success",
      });
      this.setData({ selectedId: 0 });
      await this.load();
    } catch (error) {
      wx.showToast({
        title: (error && error.message) || "改派失败，请稍后重试",
        icon: "none",
      });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
