const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const pay = require("../../utils/pay");

const TABS = [
  { value: "", label: "全部" },
  { value: "PENDING_PAYMENT", label: "待付款" },
  { value: "PAID", label: "待发货" },
  { value: "SHIPPED", label: "已发货" },
  { value: "COMPLETED", label: "已完成" },
];

Page({
  data: {
    tabs: TABS,
    status: "",
    loading: true,
    error: "",
    list: [],
    page: 1,
    hasMore: true,
    busyId: 0,
  },

  onLoad(options) {
    const status = String((options && options.status) || "");
    this.setData({ status: status });
  },

  onShow() {
    this.load(true);
  },

  load(reset) {
    const page = reset ? 1 : this.data.page + 1;
    this.setData({ loading: reset, error: "" });
    auth
      .ensureLogin()
      .then(() => api.orders(this.data.status, page, 10))
      .then((result) => {
        const mapped = ((result && result.list) || []).map(function (order) {
          const shopOrders = order.shopOrders || [];
          const lines = [];
          shopOrders.forEach(function (shopOrder) {
            (shopOrder.items || []).forEach(function (item, index) {
              lines.push({
                key: shopOrder.id + "-" + item.id + "-" + index,
                title: item.title,
                image: item.image,
                quantity: item.quantity,
                skuName: item.skuName,
                shopName: shopOrder.shopName,
                subOrderNo: shopOrder.subOrderNo,
                statusText: format.orderStatusText(shopOrder.status),
              });
            });
          });
          return Object.assign({}, order, {
            statusText: format.orderStatusText(order.status),
            statusColor: format.orderStatusColor(order.status),
            payText: format.money(order.payAmount),
            timeText: format.time(order.createdAt),
            lines: lines,
            lineCount: lines.length,
            shopCount: shopOrders.length,
          });
        });
        const list = reset ? mapped : this.data.list.concat(mapped);
        this.setData({
          loading: false,
          list: list,
          page: page,
          hasMore: list.length < ((result && result.total) || 0),
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "订单读取失败",
        });
      });
  },

  onReachBottom() {
    if (this.data.hasMore) this.load(false);
  },

  reload() {
    this.load(true);
  },

  pickTab(event) {
    const status = event.currentTarget.dataset.status;
    if (status === this.data.status) return;
    this.setData({ status: status, list: [], hasMore: true });
    this.load(true);
  },

  goDetail(event) {
    const id = event.currentTarget.dataset.id;
    wx.navigateTo({ url: "/pages/order-detail/order-detail?id=" + id });
  },

  repay(event) {
    const id = Number(event.currentTarget.dataset.id);
    if (!id || this.data.busyId) return;
    this.setData({ busyId: id });
    api
      .repay(id)
      .then((result) => {
        if (!result.payParams) {
          wx.showModal({
            title: "暂时无法在线支付",
            content: result.payHint || "请与商家确认付款方式",
            showCancel: false,
          });
          return null;
        }
        return pay.requestPayment(result.payParams).then(() => {
          wx.showToast({ title: "支付成功", icon: "success" });
          this.load(true);
        });
      })
      .catch((error) => {
        if (!error || !error.cancelled) {
          wx.showToast({ title: (error && error.message) || "支付未完成", icon: "none" });
        }
      })
      .then(() => this.setData({ busyId: 0 }));
  },

  cancel(event) {
    const id = Number(event.currentTarget.dataset.id);
    wx.showModal({
      title: "取消订单",
      content: "取消后库存会释放，确定取消这笔订单吗？",
      success: (res) => {
        if (!res.confirm) return;
        api
          .cancelOrder(id)
          .then(() => {
            wx.showToast({ title: "已取消", icon: "success" });
            this.load(true);
          })
          .catch((error) => wx.showToast({ title: (error && error.message) || "取消失败", icon: "none" }));
      },
    });
  },

  confirm(event) {
    const id = Number(event.currentTarget.dataset.id);
    wx.showModal({
      title: "确认收货",
      content: "确认已收到全部商品？",
      success: (res) => {
        if (!res.confirm) return;
        api
          .confirmOrder(id)
          .then(() => {
            wx.showToast({ title: "已确认收货", icon: "success" });
            this.load(true);
          })
          .catch((error) => wx.showToast({ title: (error && error.message) || "确认失败", icon: "none" }));
      },
    });
  },

  goShopping() {
    wx.switchTab({ url: "/pages/index/index" });
  },
});
