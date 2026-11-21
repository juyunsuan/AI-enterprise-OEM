const api = require("../../utils/api");
const auth = require("../../utils/auth");

Page({
  data: {
    loading: true,
    error: "",
    items: [],
    selectedCount: 0,
    totalText: "0.00",
    allSelected: false,
    busy: false,
  },

  onShow() {
    this.load();
  },

  load() {
    this.setData({ loading: true, error: "" });
    auth
      .ensureLogin()
      .then(() => api.cart())
      .then((list) => {
        this.apply(list || []);
        this.setData({ loading: false });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "购物车读取失败",
        });
      });
  },

  apply(list) {
    const items = list.map(function (item) {
      return Object.assign({}, item, {
        priceText: (Number(item.price) || 0).toFixed(2),
        lineText: ((Number(item.price) || 0) * (Number(item.quantity) || 0)).toFixed(2),
        disabled: !!item.invalidReason,
      });
    });
    const valid = items.filter(function (item) {
      return !item.disabled;
    });
    const selected = valid.filter(function (item) {
      return item.selected;
    });
    const total = selected.reduce(function (sum, item) {
      return sum + (Number(item.price) || 0) * (Number(item.quantity) || 0);
    }, 0);
    this.setData({
      items: items,
      selectedCount: selected.length,
      totalText: total.toFixed(2),
      allSelected: valid.length > 0 && selected.length === valid.length,
    });
  },

  toggle(event) {
    const id = Number(event.currentTarget.dataset.id);
    const item = this.data.items.filter(function (row) {
      return row.id === id;
    })[0];
    if (!item || item.disabled) return;
    api
      .selectCart(id, !item.selected)
      .then((list) => this.apply(list || []))
      .catch((error) => wx.showToast({ title: (error && error.message) || "操作失败", icon: "none" }));
  },

  toggleAll() {
    api
      .selectCart(0, !this.data.allSelected)
      .then((list) => this.apply(list || []))
      .catch((error) => wx.showToast({ title: (error && error.message) || "操作失败", icon: "none" }));
  },

  changeQty(event) {
    const id = Number(event.currentTarget.dataset.id);
    const delta = Number(event.currentTarget.dataset.delta);
    const item = this.data.items.filter(function (row) {
      return row.id === id;
    })[0];
    if (!item) return;
    const quantity = Number(item.quantity) + delta;
    if (quantity < 1) return;
    if (quantity > item.stock) {
      wx.showToast({ title: "库存不足", icon: "none" });
      return;
    }
    api
      .updateCart(id, quantity)
      .then((list) => this.apply(list || []))
      .catch((error) => wx.showToast({ title: (error && error.message) || "修改数量失败", icon: "none" }));
  },

  remove(event) {
    const id = Number(event.currentTarget.dataset.id);
    wx.showModal({
      title: "移出购物车",
      content: "确定要移除这件商品吗？",
      success: (res) => {
        if (!res.confirm) return;
        api
          .removeCart([id])
          .then((list) => this.apply(list || []))
          .catch((error) => wx.showToast({ title: (error && error.message) || "移除失败", icon: "none" }));
      },
    });
  },

  checkout() {
    if (this.data.busy) return;
    const ids = this.data.items
      .filter(function (item) {
        return item.selected && !item.disabled;
      })
      .map(function (item) {
        return item.id;
      });
    if (!ids.length) {
      wx.showToast({ title: "请先勾选要结算的商品", icon: "none" });
      return;
    }
    this.setData({ busy: true });
    wx.navigateTo({
      url: "/pages/settle/settle?cartIds=" + ids.join(","),
      complete: () => this.setData({ busy: false }),
    });
  },

  goShopping() {
    wx.switchTab({ url: "/pages/index/index" });
  },
});
