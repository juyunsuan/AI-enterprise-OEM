const api = require("../../utils/api");
const auth = require("../../utils/auth");

Page({
  data: {
    id: 0,
    loading: true,
    error: "",
    product: {},
    images: [],
    detail: "",
    guarantee: [],
    skus: [],
    shop: {},
    skuIndex: -1,
    quantity: 1,
    stock: 0,
    skuName: "",
    busy: false,
  },

  onLoad(options) {
    const id = Number((options && options.id) || 0);
    if (!id) {
      this.setData({ loading: false, error: "缺少商品编号" });
      return;
    }
    this.setData({ id: id });
    this.load();
  },

  load() {
    this.setData({ loading: true, error: "" });
    api
      .product(this.data.id)
      .then((data) => {
        const product = data.product || {};
        const images = [product.coverImage]
          .concat(data.images || [])
          .filter(function (url, index, list) {
            return url && list.indexOf(url) === index;
          });
        const skus = (data.skus || []).map(function (sku) {
          return Object.assign({}, sku, {
            priceText: (Number(sku.price) || 0).toFixed(2),
          });
        });
        const first = skus.length ? 0 : -1;
        const sku = first >= 0 ? skus[first] : null;
        this.setData({
          loading: false,
          error: "",
          product: Object.assign({}, product, {
            priceText: (Number(sku ? sku.price : product.price) || 0).toFixed(2),
            marketPriceText:
              Number(sku ? sku.marketPrice : product.marketPrice) > 0
                ? (Number(sku ? sku.marketPrice : product.marketPrice) || 0).toFixed(2)
                : "",
          }),
          images: images.length ? images : [product.coverImage],
          detail: data.detail || "",
          guarantee: data.guarantee || [],
          skus: skus,
          shop: data.shop || {},
          skuIndex: first,
          skuName: sku ? sku.skuName : "",
          stock: sku ? sku.stock : product.stock || 0,
        });
        wx.setNavigationBarTitle({ title: product.title || "商品详情" });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "商品读取失败",
        });
      });
  },

  pickSku(event) {
    const index = Number(event.currentTarget.dataset.index);
    const sku = this.data.skus[index];
    if (!sku) return;
    if (sku.stock <= 0) {
      wx.showToast({ title: "该规格暂时售罄", icon: "none" });
      return;
    }
    this.setData({
      skuIndex: index,
      skuName: sku.skuName,
      stock: sku.stock,
      quantity: 1,
      product: Object.assign({}, this.data.product, {
        priceText: sku.priceText,
        marketPriceText:
          Number(sku.marketPrice) > 0
            ? (Number(sku.marketPrice) || 0).toFixed(2)
            : "",
      }),
    });
  },

  minus() {
    if (this.data.quantity > 1) this.setData({ quantity: this.data.quantity - 1 });
  },

  plus() {
    if (this.data.quantity < this.data.stock) {
      this.setData({ quantity: this.data.quantity + 1 });
    } else {
      wx.showToast({ title: "库存不足", icon: "none" });
    }
  },

  ensureStock() {
    if (this.data.stock <= 0) {
      wx.showToast({ title: "该商品暂时无货", icon: "none" });
      return false;
    }
    if (this.data.skus.length && this.data.skuIndex < 0) {
      wx.showToast({ title: "请选择规格", icon: "none" });
      return false;
    }
    return true;
  },

  skuId() {
    const sku = this.data.skus[this.data.skuIndex];
    return sku ? sku.id : 0;
  },

  addCart() {
    if (!this.ensureStock() || this.data.busy) return;
    this.setData({ busy: true });
    auth
      .ensureLogin()
      .then(() => api.addCart(this.data.id, this.skuId(), this.data.quantity))
      .then(() => {
        wx.showToast({ title: "已加入购物车", icon: "success" });
      })
      .catch((error) => {
        wx.showToast({ title: (error && error.message) || "加入购物车失败", icon: "none" });
      })
      .then(() => this.setData({ busy: false }));
  },

  buyNow() {
    if (!this.ensureStock() || this.data.busy) return;
    this.setData({ busy: true });
    const productId = this.data.id;
    const skuId = this.skuId();
    auth
      .ensureLogin()
      .then(() => api.addCart(productId, skuId, this.data.quantity))
      .then((list) => {
        const item = (list || []).filter(function (row) {
          return row.productId === productId && row.skuId === skuId;
        })[0];
        if (!item) throw new Error("购物车中没有找到刚加入的商品");
        wx.navigateTo({ url: "/pages/settle/settle?cartIds=" + item.id });
      })
      .catch((error) => {
        wx.showToast({ title: (error && error.message) || "下单失败", icon: "none" });
      })
      .then(() => this.setData({ busy: false }));
  },

  goCart() {
    wx.switchTab({ url: "/pages/cart/cart" });
  },

  goShop() {
    const shopId = Number(this.data.shop.id) || 0;
    if (shopId) wx.navigateTo({ url: "/pages/shop/shop?id=" + shopId });
  },

  goService() {
    wx.navigateTo({
      url:
        "/pages/service/service?shopName=" +
        encodeURIComponent(this.data.shop.name || ""),
    });
  },
});
