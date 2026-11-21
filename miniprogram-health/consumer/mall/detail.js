const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

Page({
  data: {
    loading: true,
    goods: null,
    images: [],
    skuIndex: 0,
    skuId: 0,
    quantity: 1,
    priceText: "",
    originText: "",
    stock: 0,
    specText: "",
    reviews: [],
  },

  onLoad(options) {
    this.goodsId = Number(options.id) || 0;
    this.load();
  },

  async load() {
    try {
      const row = await api.goodsDetail(this.goodsId);
      const images = [];
      if (row.coverImage) images.push(row.coverImage);
      (row.images || []).forEach((url) => {
        if (url && images.indexOf(url) < 0) images.push(url);
      });
      const sku = row.skuMode && row.skus && row.skus.length ? row.skus[0] : null;
      this.setData({
        loading: false,
        goods: row,
        images,
        skuIndex: sku ? 0 : -1,
        skuId: sku ? sku.id : 0,
        stock: sku ? sku.stock : row.stock,
        priceText: format.yuan(sku ? sku.priceCents : row.priceCents),
        originText:
          row.originPriceCents > (sku ? sku.priceCents : row.priceCents)
            ? format.yuan(row.originPriceCents)
            : "",
        specText: sku ? sku.specText : row.spec,
        reviews: (row.reviews || []).map((item) => ({
          ...item,
          timeText: format.dateOnly(item.createdAt),
          stars: "★★★★★".slice(0, Math.max(0, Math.min(5, item.score))),
        })),
      });
      wx.setNavigationBarTitle({ title: (row && row.name) || "商品详情" });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: (error && error.message) || "加载失败", icon: "none" });
    }
  },

  onSku(e) {
    const skuIndex = Number(e.currentTarget.dataset.index);
    const sku = this.data.goods.skus[skuIndex];
    if (!sku) return;
    this.setData({
      skuIndex,
      skuId: sku.id,
      stock: sku.stock,
      priceText: format.yuan(sku.priceCents),
      specText: sku.specText,
    });
  },

  onMinus() {
    if (this.data.quantity <= 1) return;
    this.setData({ quantity: this.data.quantity - 1 });
  },

  onPlus() {
    if (this.data.quantity >= Math.min(99, this.data.stock)) return;
    this.setData({ quantity: this.data.quantity + 1 });
  },

  currentLine() {
    const goods = this.data.goods;
    const sku = this.data.skuIndex >= 0 ? goods.skus[this.data.skuIndex] : null;
    return {
      goodsId: goods.id,
      skuId: sku ? sku.id : 0,
      quantity: this.data.quantity,
      name: goods.name,
      skuText: sku ? sku.specText : goods.spec,
      coverImage: (sku && sku.image) || goods.coverImage,
      priceCents: sku ? sku.priceCents : goods.priceCents,
      stock: sku ? sku.stock : goods.stock,
    };
  },

  onAddCart() {
    if (this.data.stock <= 0) {
      wx.showToast({ title: "商品暂时缺货", icon: "none" });
      return;
    }
    auth
      .requireLogin({ redirect: false })
      .then(() => {
        const line = this.currentLine();
        return api.saveCart({
          goodsId: line.goodsId,
          skuId: line.skuId,
          quantity: line.quantity,
          checked: true,
          remove: false,
        });
      })
      .then(() => wx.showToast({ title: "已加入购物车" }))
      .catch((error) => {
        if (error && error.code !== 401) {
          wx.showToast({ title: error.message || "加入失败", icon: "none" });
        }
      });
  },

  onBuy() {
    if (this.data.stock <= 0) {
      wx.showToast({ title: "商品暂时缺货", icon: "none" });
      return;
    }
    auth
      .requireLogin({ redirect: false })
      .then(() => {
        const line = this.currentLine();
        wx.setStorageSync("health:checkout", [line]);
        wx.navigateTo({ url: "/consumer/order/confirm?from=mall" });
      })
      .catch(() => undefined);
  },

  onCart() {
    wx.navigateTo({ url: "/consumer/mall/cart" });
  },
});
