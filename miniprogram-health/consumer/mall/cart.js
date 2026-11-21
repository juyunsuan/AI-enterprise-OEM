const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

Page({
  data: {
    loading: true,
    rows: [],
    totalText: "¥0.00",
    checkedCount: 0,
    allChecked: false,
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  async load() {
    try {
      await auth.requireLogin();
      const data = await api.cart();
      const rows = ((data && data.list) || []).map((row) => ({
        ...row,
        priceText: format.yuan(row.priceCents),
      }));
      this.setData({ loading: false, rows });
      this.recalc(rows);
    } catch (error) {
      this.setData({ loading: false });
      if (error && error.code !== 401) {
        wx.showToast({ title: error.message || "购物车加载失败", icon: "none" });
      }
    }
  },

  recalc(rows) {
    const list = rows || this.data.rows;
    let total = 0;
    let checkedCount = 0;
    list.forEach((row) => {
      if (row.checked && row.available) {
        total += row.priceCents * row.quantity;
        checkedCount += 1;
      }
    });
    this.setData({
      totalText: format.yuan(total),
      checkedCount,
      allChecked: list.length > 0 && checkedCount === list.filter((row) => row.available).length,
    });
  },

  async onToggle(e) {
    const index = Number(e.currentTarget.dataset.index);
    const row = this.data.rows[index];
    if (!row) return;
    const checked = !row.checked;
    const rows = this.data.rows.slice();
    rows[index] = { ...row, checked };
    this.setData({ rows });
    this.recalc(rows);
    try {
      await api.saveCart({
        goodsId: row.goodsId,
        skuId: row.skuId,
        quantity: row.quantity,
        checked,
        remove: false,
      });
    } catch (error) {
      wx.showToast({ title: error.message || "保存失败", icon: "none" });
    }
  },

  async onQty(e) {
    const index = Number(e.currentTarget.dataset.index);
    const delta = Number(e.currentTarget.dataset.delta) || 0;
    const row = this.data.rows[index];
    if (!row) return;
    const quantity = Math.max(1, Math.min(99, row.quantity + delta));
    if (quantity === row.quantity) return;
    if (row.stock && quantity > row.stock) {
      wx.showToast({ title: "库存不足", icon: "none" });
      return;
    }
    const rows = this.data.rows.slice();
    rows[index] = { ...row, quantity };
    this.setData({ rows });
    this.recalc(rows);
    try {
      await api.saveCart({
        goodsId: row.goodsId,
        skuId: row.skuId,
        quantity,
        checked: row.checked,
        remove: false,
      });
    } catch (error) {
      wx.showToast({ title: error.message || "保存失败", icon: "none" });
    }
  },

  onRemove(e) {
    const index = Number(e.currentTarget.dataset.index);
    const row = this.data.rows[index];
    if (!row) return;
    wx.showModal({
      title: "移除商品",
      content: "将从购物车移除「" + row.name + "」",
      success: (res) => {
        if (!res.confirm) return;
        api
          .saveCart({ goodsId: row.goodsId, skuId: row.skuId, quantity: 1, checked: false, remove: true })
          .then(() => {
            const rows = this.data.rows.filter((item) => item !== row);
            this.setData({ rows });
            this.recalc(rows);
          })
          .catch((error) => wx.showToast({ title: error.message || "移除失败", icon: "none" }));
      },
    });
  },

  async onToggleAll() {
    const next = !this.data.allChecked;
    const rows = this.data.rows.map((row) => (row.available ? { ...row, checked: next } : row));
    this.setData({ rows });
    this.recalc(rows);
    try {
      await Promise.all(
        rows
          .filter((row) => row.available)
          .map((row) =>
            api.saveCart({
              goodsId: row.goodsId,
              skuId: row.skuId,
              quantity: row.quantity,
              checked: next,
              remove: false,
            }),
          ),
      );
    } catch (error) {
      wx.showToast({ title: error.message || "保存失败", icon: "none" });
    }
  },

  onCheckout() {
    const items = this.data.rows
      .filter((row) => row.checked && row.available)
      .map((row) => ({
        goodsId: row.goodsId,
        skuId: row.skuId,
        quantity: row.quantity,
        name: row.name,
        skuText: row.specText,
        coverImage: row.coverImage,
        priceCents: row.priceCents,
        stock: row.stock,
      }));
    if (!items.length) {
      wx.showToast({ title: "请选择要结算的商品", icon: "none" });
      return;
    }
    wx.setStorageSync("health:checkout", items);
    wx.navigateTo({ url: "/consumer/order/confirm?from=cart" });
  },

  onGoods(e) {
    wx.navigateTo({ url: "/consumer/mall/detail?id=" + e.currentTarget.dataset.id });
  },

  onMall() {
    wx.navigateTo({ url: "/consumer/mall/list" });
  },
});
