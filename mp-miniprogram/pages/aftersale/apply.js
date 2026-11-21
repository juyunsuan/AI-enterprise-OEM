const api = require("../../utils/api");
const auth = require("../../utils/auth");

const REASONS = [
  "商品有质量问题",
  "商品与描述不符",
  "少件 / 漏发",
  "七天无理由退货",
  "其他原因",
];

Page({
  data: {
    orderId: 0,
    shopOrderId: 0,
    loading: true,
    error: "",
    shopOrder: null,
    items: [],
    types: [
      { value: "REFUND_ONLY", label: "仅退款" },
      { value: "RETURN_REFUND", label: "退货退款" },
    ],
    type: "REFUND_ONLY",
    reasons: REASONS,
    reasonIndex: 0,
    description: "",
    submitting: false,
  },

  onLoad(options) {
    const orderId = Number((options && options.orderId) || 0);
    const shopOrderId = Number((options && options.shopOrderId) || 0);
    if (!orderId || !shopOrderId) {
      this.setData({ loading: false, error: "缺少订单信息，请从订单详情进入" });
      return;
    }
    this.setData({ orderId: orderId, shopOrderId: shopOrderId });
    this.load();
  },

  load() {
    auth
      .ensureLogin()
      .then(() => api.order(this.data.orderId))
      .then((order) => {
        const shopOrder = (order.shopOrders || []).filter((row) => {
          return row.id === this.data.shopOrderId;
        })[0];
        if (!shopOrder) throw new Error("子订单不存在");
        this.setData({
          loading: false,
          error: "",
          shopOrder: shopOrder,
          items: (shopOrder.items || []).map(function (item) {
            return Object.assign({}, item, {
              checked: true,
              priceText: (Number(item.price) || 0).toFixed(2),
            });
          }),
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "订单读取失败",
        });
      });
  },

  pickType(event) {
    this.setData({ type: event.currentTarget.dataset.value });
  },

  pickReason(event) {
    this.setData({ reasonIndex: Number(event.detail.value) || 0 });
  },

  onDescription(event) {
    this.setData({ description: event.detail.value });
  },

  toggleItem(event) {
    const index = Number(event.currentTarget.dataset.index);
    const items = this.data.items.slice();
    if (!items[index]) return;
    items[index].checked = !items[index].checked;
    this.setData({ items: items });
  },

  submit() {
    if (this.data.submitting) return;
    const selected = this.data.items.filter(function (item) {
      return item.checked;
    });
    if (!selected.length) {
      wx.showToast({ title: "请选择要退的商品", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    api
      .applyAfterSale({
        shopOrderId: this.data.shopOrderId,
        type: this.data.type,
        reason: this.data.reasons[this.data.reasonIndex],
        description: this.data.description,
        items: selected.map(function (item) {
          return { orderItemId: item.id, quantity: item.quantity };
        }),
      })
      .then(() => {
        wx.showToast({ title: "已提交，等待商家处理", icon: "success" });
        setTimeout(function () {
          wx.redirectTo({ url: "/pages/aftersale/list" });
        }, 600);
      })
      .catch((error) => {
        wx.showToast({ title: (error && error.message) || "提交失败", icon: "none" });
      })
      .then(() => this.setData({ submitting: false }));
  },
});
