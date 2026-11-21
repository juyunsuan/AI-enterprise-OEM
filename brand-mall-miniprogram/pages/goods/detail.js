const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const navigate = require("../../utils/navigate");

/**
 * 商品详情：SKU 选择按「规格维度」驱动，选中组合去 skus 里现查，
 * 因为后端存的是笛卡尔积，端上拼不出 id，只能按 specValues 匹配。
 */
Page({
  data: {
    id: 0,
    product: null,
    images: [],
    priceText: "0.00",
    originText: "",
    stockText: "",
    skuText: "",
    specs: [],
    picked: {},
    skuId: 0,
    quantity: 1,
    showSku: false,
    skuMode: "Cart",
    reviews: [],
    loading: true,
    error: "",
  },

  onLoad(query) {
    const id = Number(query.id || 0);
    if (!id) {
      this.setData({ loading: false, error: "缺少商品 id" });
      return;
    }
    this.setData({ id: id });
    this.loadGoods(id);
    this.loadReviews();
  },

  loadGoods(id) {
    return api
      .product(id)
      .then((data) => {
        const images = (data.images && data.images.length ? data.images : [data.coverImage]).filter(Boolean);
        this.setData({
          product: data,
          images: images.length ? images : [],
          loading: false,
          error: "",
        });
        wx.setNavigationBarTitle({ title: data.title || "商品详情" });
        this.buildSpecs(data);
        this.syncPrice();
      })
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "商品加载失败" });
      });
  },

  /** 把 specs/skus 组装成可点击的矩阵：每个规格值标注还能不能凑出有效 SKU。 */
  buildSpecs(product) {
    const specs = product.specs || [];
    const skus = (product.skus || []).filter((sku) => sku.enabled !== false);
    const matrix = specs.map((spec) => ({
      name: spec.name,
      values: (spec.values || []).map((value) => {
        const hit = skus.filter((sku) => sku.specValues && sku.specValues[spec.name] === value);
        return {
          value: value,
          soldOut: hit.length > 0 && hit.every((sku) => Number(sku.stock || 0) <= 0),
          empty: hit.length === 0,
        };
      }),
    }));
    this.setData({
      specs: matrix,
      picked: {},
      skuId: specs.length ? 0 : (skus[0] && skus[0].id) || 0,
    });
  },

  pickValue(event) {
    const dataset = event.currentTarget.dataset;
    const picked = Object.assign({}, this.data.picked);
    const name = dataset.name;
    const value = dataset.value;
    if (picked[name] === value) {
      delete picked[name];
    } else {
      picked[name] = value;
    }
    this.setData({ picked: picked });
    this.matchSku(picked);
    this.syncPrice();
  },

  matchSku(picked) {
    const product = this.data.product || {};
    const specs = product.specs || [];
    if (!specs.length) {
      const only = (product.skus || [])[0];
      this.setData({ skuId: only ? only.id : 0, skuText: only && only.skuName ? only.skuName : "" });
      return;
    }
    const complete = specs.every((spec) => !!picked[spec.name]);
    if (!complete) {
      this.setData({ skuId: 0, skuText: "" });
      return;
    }
    const sku = (product.skus || []).find((row) =>
      specs.every((spec) => row.specValues && row.specValues[spec.name] === picked[spec.name]),
    );
    this.setData({
      skuId: sku ? sku.id : 0,
      skuText: sku ? sku.skuName || specs.map((spec) => picked[spec.name]).join(" ") : "暂无匹配规格",
    });
  },

  currentSku() {
    const product = this.data.product || {};
    if (!this.data.skuId) return null;
    return (product.skus || []).find((row) => row.id === this.data.skuId) || null;
  },

  syncPrice() {
    const product = this.data.product || {};
    const sku = this.currentSku();
    const price = sku ? sku.price : product.price;
    const market = sku ? sku.marketPrice : product.marketPrice;
    const stock = sku ? sku.stock : product.stock;
    this.setData({
      priceText: format.money(price),
      originText: Number(market || 0) > Number(price || 0) ? format.money(market) : "",
      stockText: format.stockText(stock),
    });
  },

  step(event) {
    const delta = Number(event.currentTarget.dataset.delta || 0);
    const next = Math.min(999, Math.max(1, this.data.quantity + delta));
    this.setData({ quantity: next });
  },

  openSku(event) {
    this.setData({ showSku: true, skuMode: event.currentTarget.dataset.mode || "Cart" });
  },

  closeSku() {
    this.setData({ showSku: false });
  },

  previewImage(event) {
    const urls = this.data.images || [];
    if (!urls.length) return;
    wx.previewImage({
      urls: urls,
      current: event.currentTarget.dataset.src || urls[0],
      fail() {},
    });
  },

  stopBubble() {
    /* 弹层内部点击不冒泡到遮罩 */
  },

  confirmSku() {
    const product = this.data.product || {};
    const specs = product.specs || [];
    if (specs.length && !this.data.skuId) {
      const miss = specs.filter((spec) => !this.data.picked[spec.name]);
      wx.showToast({ title: "请选择" + miss[0].name, icon: "none" });
      return;
    }
    if (this.data.skuMode === "Buy") {
      this.buyNow();
      return;
    }
    this.addToCart();
  },

  addToCart() {
    auth
      .ensureLogin()
      .then(() => api.addCart(this.data.id, this.data.skuId, this.data.quantity))
      .then(() => {
        this.setData({ showSku: false });
        wx.showToast({ title: "已加入购物车", icon: "none" });
        getApp().refreshCartBadge();
      })
      .catch((error) => auth.showError(error));
  },

  /** 立即购买：不进购物车，直接把行项目传给结算页。 */
  buyNow() {
    const items = [
      { productId: this.data.id, skuId: this.data.skuId, quantity: this.data.quantity },
    ];
    this.setData({ showSku: false });
    wx.navigateTo({
      url: "/pages/order/confirm?items=" + encodeURIComponent(JSON.stringify(items)),
    });
  },

  cartNow() {
    navigate.goCart();
  },

  loadReviews() {
    api
      .reviews(this.data.id, 1)
      .then((data) => {
        this.setData({
          reviews: ((data && data.list) || []).map((row) => ({
            id: row.id,
            nickname: row.nickname || "微信用户",
            avatar: row.avatar,
          stars: Number(row.rating || 5),
            content: row.content,
            dateText: format.dateOnly(row.createdAt),
          })),
        });
      })
      .catch(() => this.setData({ reviews: [] }));
  },

  goShop() {
    wx.switchTab({ url: "/pages/index/index" });
  },

  onShareAppMessage() {
    const product = this.data.product || {};
    return {
      title: product.title || "好物推荐",
      path: "/pages/goods/detail?id=" + this.data.id,
      imageUrl: (this.data.images || [])[0] || product.coverImage || "",
    };
  },
});
