const api = require("../../utils/api");
const auth = require("../../utils/auth");
const fmt = require("../../utils/format");

const STATUS = {
  PENDING_PAY: "待支付",
  PENDING_ACCEPT: "待接单",
  ACCEPTED: "已接单",
  PICKED_UP: "已取件",
  DELIVERING: "配送中",
  ARRIVED: "已送达",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  EXCEPTION: "异常",
};

Page({
  data: { loading: true, error: "", orders: [] },

  onShow() {
    this.load();
  },

  load() {
    this.setData({ loading: true, error: "" });
    auth
      .ensureLogin()
      .then(() => api.myOrders())
      .then((rows) => {
        const orders = (rows || []).map((row) =>
          Object.assign({}, row, {
            statusText: STATUS[row.status] || row.status,
            timeText: fmt.time(row.createdAt),
            typeText: row.serviceType === "BUY" ? "帮我买" : "帮我送",
          })
        );
        this.setData({ loading: false, orders: orders });
      })
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "订单读取失败" });
      });
  },

  open(event) {
    const orderNo = event.currentTarget.dataset.no;
    wx.navigateTo({ url: "/pages/order-detail/order-detail?orderNo=" + encodeURIComponent(orderNo) });
  },

  goCreate() {
    wx.navigateTo({ url: "/pages/create/create" });
  },
});