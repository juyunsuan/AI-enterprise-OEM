const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const pay = require("../../utils/pay");

Page({
  data: {
    id: 0,
    loading: true,
    error: "",
    order: null,
    statusText: "",
    statusColor: "",
    payText: "",
    goodsText: "",
    freightText: "",
    timeText: "",
    shops: [],
    busy: false,
  },

  onLoad(options) {
    const id = Number((options && options.id) || 0);
    if (!id) {
      this.setData({ loading: false, error: "缺少订单编号" });
      return;
    }
    this.setData({ id: id });
  },

  onShow() {
    if (this.data.id) this.load();
  },

  load() {
    this.setData({ loading: !this.data.order, error: "" });
    auth
      .ensureLogin()
      .then(() => api.order(this.data.id))
      .then((order) => {
        this.apply(order);
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "订单读取失败",
        });
      });
  },

  apply(order) {
    const shops = (order.shopOrders || []).map(function (shopOrder) {
      return Object.assign({}, shopOrder, {
        statusText: format.orderStatusText(shopOrder.status),
        statusColor: format.orderStatusColor(shopOrder.status),
        payText: format.money(shopOrder.payAmount),
        goodsText: format.money(shopOrder.goodsAmount),
        freightText: format.money(shopOrder.freightAmount),
        canAfterSale:
          (shopOrder.status === "SHIPPED" || shopOrder.status === "COMPLETED") &&
          !shopOrder.refundStatus,
        items: (shopOrder.items || []).map(function (item) {
          return Object.assign({}, item, {
            priceText: (Number(item.price) || 0).toFixed(2),
          });
        }),
      });
    });
    this.setData({
      loading: false,
      error: "",
      order: order,
      shops: shops,
      statusText: format.orderStatusText(order.status),
      statusColor: format.orderStatusColor(order.status),
      payText: format.money(order.payAmount),
      goodsText: format.money(order.goodsAmount),
      freightText: format.money(order.freightAmount),
      timeText: format.time(order.createdAt),
    });
  },

  repay() {
    if (this.data.busy) return;
    this.setData({ busy: true });
    api
      .repay(this.data.id)
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
          this.load();
        });
      })
      .catch((error) => {
        if (!error || !error.cancelled) {
          wx.showToast({ title: (error && error.message) || "支付未完成", icon: "none" });
        }
      })
      .then(() => this.setData({ busy: false }));
  },

  cancel() {
    wx.showModal({
      title: "取消订单",
      content: "取消后库存会释放，确定取消这笔订单吗？",
      success: (res) => {
        if (!res.confirm) return;
        api
          .cancelOrder(this.data.id)
          .then((order) => {
            this.apply(order);
            wx.showToast({ title: "已取消", icon: "success" });
          })
          .catch((error) => wx.showToast({ title: (error && error.message) || "取消失败", icon: "none" }));
      },
    });
  },

  confirm() {
    wx.showModal({
      title: "确认收货",
      content: "确认已收到全部商品？",
      success: (res) => {
        if (!res.confirm) return;
        api
          .confirmOrder(this.data.id)
          .then((order) => {
            this.apply(order);
            wx.showToast({ title: "已确认收货", icon: "success" });
          })
          .catch((error) => wx.showToast({ title: (error && error.message) || "确认失败", icon: "none" }));
      },
    });
  },

  applyAfterSale(event) {
    const shopOrderId = Number(event.currentTarget.dataset.id);
    wx.navigateTo({
      url:
        "/pages/aftersale/apply?orderId=" +
        this.data.id +
        "&shopOrderId=" +
        shopOrderId,
    });
  },

  goAfterSales() {
    wx.navigateTo({ url: "/pages/aftersale/list" });
  },

  goService() {
    const shopName = this.data.shops.length ? this.data.shops[0].shopName : "";
    wx.navigateTo({
      url:
        "/pages/service/service?orderNo=" +
        encodeURIComponent(this.data.order ? this.data.order.orderNo : "") +
        "&shopName=" +
        encodeURIComponent(shopName || ""),
    });
  },
});
