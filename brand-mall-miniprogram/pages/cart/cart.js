const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const navigate = require("../../utils/navigate");

/** 购物车：勾选、改数量、删除都以服务端回包为准，端上只做即时反馈。 */
Page({
  data: {
    ready: false,
    loading: false,
    items: [],
    totalQuantity: 0,
    selectedIds: [],
    allSelected: false,
    selectedCount: 0,
    selectedAmountText: "0.00",
    editing: false,
  },

  onShow() {
    this.load();
  },

  load() {
    if (this.data.loading) return Promise.resolve();
    this.setData({ loading: true });
    return auth
      .ensureLogin()
      .then(() => api.cart())
      .then((data) => {
        const items = ((data && data.items) || []).map((row) => ({
          id: row.id,
          productId: row.productId,
          skuId: row.skuId,
          title: row.title,
          skuName: row.skuName,
          image: row.image,
          price: Number(row.price || 0),
          priceText: format.money(row.price),
          quantity: row.quantity,
          stock: row.stock,
          selected: !!row.selected,
          valid: !!row.valid,
        }));
        this.setData({
          ready: true,
          loading: false,
          items: items,
          totalQuantity: Number((data && data.totalQuantity) || 0),
        });
        this.recalc();
        getApp().refreshCartBadge();
      })
      .catch((error) => {
        this.setData({ ready: true, loading: false });
        auth.showError(error);
      });
  },

  /** 金额本地算，保证勾选瞬间就有反馈；真正的下单金额以 order/preview 为准。 */
  recalc() {
    const picked = this.data.items.filter((item) => item.selected && item.valid);
    const amount = picked.reduce((sum, item) => sum + Number(item.priceText) * item.quantity, 0);
    this.setData({
      selectedCount: picked.length,
      selectedAmountText: format.money(amount),
      selectedIds: picked.map((item) => item.id),
      allSelected:
        this.data.items.filter((item) => item.valid).length > 0 &&
        picked.length === this.data.items.filter((item) => item.valid).length,
    });
  },

  toggleItem(event) {
    const id = Number(event.currentTarget.dataset.id);
    const item = this.data.items.find((row) => row.id === id);
    if (!item || !item.valid) return;
    api
      .selectCart([id], !item.selected)
      .then(() => this.load())
      .catch((error) => auth.showError(error));
  },

  toggleAll() {
    const ids = this.data.items.filter((item) => item.valid).map((item) => item.id);
    if (!ids.length) return;
    api
      .selectCart(ids, !this.data.allSelected)
      .then(() => this.load())
      .catch((error) => auth.showError(error));
  },

  step(event) {
    const dataset = event.currentTarget.dataset;
    const id = Number(dataset.id);
    const item = this.data.items.find((row) => row.id === id);
    if (!item) return;
    const delta = Number(dataset.delta);
    const next = item.quantity + delta;
    if (next < 1) {
      this.removeOne(id);
      return;
    }
    if (item.stock > 0 && next > item.stock) {
      wx.showToast({ title: "库存只剩 " + item.stock, icon: "none" });
      return;
    }
    if (next > 999) return;
    api
      .updateCart(id, next)
      .then(() => this.load())
      .catch((error) => auth.showError(error));
  },

  removeOne(id) {
    wx.showModal({
      title: "移出购物车",
      confirmText: "移除",
      cancelText: "再想想",
      success: (res) => {
        if (!res.confirm) return;
        api
          .removeCart([id])
          .then(() => this.load())
          .catch((error) => auth.showError(error));
      },
    });
  },

  removeInvalid() {
    const ids = this.data.items.filter((item) => !item.valid).map((item) => item.id);
    if (!ids.length) return;
    api
      .removeCart(ids)
      .then(() => this.load())
      .catch((error) => auth.showError(error));
  },

  openGoods(event) {
    navigate.goProduct(Number(event.currentTarget.dataset.id));
  },

  goCheckout() {
    if (!this.data.selectedCount) {
      wx.showToast({ title: "先勾选要买的商品", icon: "none" });
      return;
    }
    wx.navigateTo({ url: "/pages/order/confirm?fromCart=1" });
  },

  goIndex() {
    wx.switchTab({ url: "/pages/index/index" });
  },

  onShareAppMessage() {
    return { title: "购物车", path: "/pages/cart/cart" };
  },
});
