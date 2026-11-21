const api = require("../../utils/api");
const auth = require("../../utils/auth");
const fmt = require("../../utils/format");

function specValuesOf(product) {
  return product && Array.isArray(product.skus) ? product.skus : [];
}

function findSku(product, selected) {
  const skus = specValuesOf(product);
  if (!skus.length) return null;
  for (let index = 0; index < skus.length; index += 1) {
    const sku = skus[index];
    const values = sku.specValues || {};
    let matched = true;
    for (const name in values) {
      const want = String(selected[name] === undefined ? "" : selected[name]);
      if (String(values[name]) !== want) {
        matched = false;
        break;
      }
    }
    if (matched) return sku;
  }
  return null;
}

Page({
  data: {
    loading: true,
    error: "",
    shop: null,
    categories: [],
    products: [],
    activeId: -1,
    scrollIntoView: "",
    cart: { items: [], totalQuantity: 0, selectedAmount: 0 },
    cartCount: 0,
    cartAmountText: "0.00",
    showCart: false,
    showSpec: false,
    spec: null,
  },

  onLoad() {
    this.loadAll();
  },

  onShow() {
    if (!this.data.loading) this.refreshCart();
    getApp().refreshCartBadge();
    const focus = getApp().globalData.focusProductId;
    if (focus) {
      getApp().globalData.focusProductId = 0;
      this.pendingFocus = focus;
      if (this.data.products.length) this.applyPendingFocus();
    }
  },

  applyPendingFocus() {
    const focus = this.pendingFocus;
    if (!focus) return;
    this.pendingFocus = 0;
    this.focusProduct(focus);
  },

  onPullDownRefresh() {
    this.loadAll().then(() => wx.stopPullDownRefresh());
  },

  loadAll() {
    const app = getApp();
    this.setData({ loading: true, error: "" });
    return app
      .ensureReady()
      .then((bootstrap) => {
        const shop = bootstrap || app.bootstrap();
        if (!shop || !shop.shopId) {
          throw new Error(app.globalData.bootstrapError || "门店暂不可用");
        }
        this.setData({ shop: shop });
        return api.menu();
      })
      .then((menu) => {
        const products = (menu.products || []).map((item) =>
          Object.assign({}, item, {
            priceText: fmt.money(item.price),
            specText: item.skus && item.skus.length ? "可选规格" : "",
            cartQty: 0,
          }),
        );
        const first = menu.categories && menu.categories.length ? menu.categories[0].id : -1;
        this.setData({
          categories: menu.categories || [],
          products: products,
          activeId: first,
          loading: false,
        });
        this.applyPendingFocus();
        return this.refreshCart();
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "菜单加载失败",
        });
      });
  },

  refreshCart() {
    if (!auth.isLogged()) {
      this.setData({
        cart: { items: [], totalQuantity: 0, selectedAmount: 0 },
        cartCount: 0,
        cartAmountText: "0.00",
      });
      this.applyCartQty({});
      return Promise.resolve();
    }
    return api
      .cart()
      .then((data) => {
        const raw = data || { items: [], totalQuantity: 0, selectedAmount: 0 };
        const cart = Object.assign({}, raw, {
          items: (raw.items || []).map((item) =>
            Object.assign({}, item, { priceText: fmt.money(item.price) }),
          ),
        });
        const qty = {};
        cart.items.forEach((item) => {
          qty[item.productId] = (qty[item.productId] || 0) + item.quantity;
        });
        this.setData({
          cart: cart,
          cartCount: cart.totalQuantity || 0,
          cartAmountText: fmt.money(cart.selectedAmount),
        });
        this.applyCartQty(qty);
      })
      .catch(() => {});
  },

  applyCartQty(qty) {
    const products = this.data.products.map((item) =>
      Object.assign({}, item, { cartQty: qty[item.id] || 0 }),
    );
    this.setData({ products: products });
  },

  pickCategory(event) {
    const id = Number(event.currentTarget.dataset.id);
    this.setData({ activeId: id, scrollIntoView: "cat-" + id });
  },

  focusProduct(productId) {
    const product = this.data.products.filter((item) => item.id === productId)[0];
    if (!product) return;
    this.setData({
      activeId: product.categoryId,
      scrollIntoView: "cat-" + product.categoryId,
    });
    if (product.skus && product.skus.length) {
      this.openSpec(product);
    }
  },

  tapProduct(event) {
    const id = Number(event.currentTarget.dataset.id);
    const product = this.data.products.filter((item) => item.id === id)[0];
    if (!product || product.soldOut) return;
    if ((product.skus && product.skus.length) || (product.specs && product.specs.length)) {
      this.openSpec(product);
      return;
    }
    this.addToCart(product.id, 0, 1);
  },

  openSpec(product) {
    const selected = {};
    (product.specs || []).forEach((spec) => {
      if (spec.values && spec.values.length) selected[spec.name] = spec.values[0];
    });
    const sku =
      findSku(product, selected) ||
      (product.skus && product.skus.length ? product.skus[0] : null);
    const stock = sku ? sku.stock : product.stock;
    this.setData({
      showSpec: true,
      spec: {
        product: product,
        selected: selected,
        groups: this.specGroups(product, selected),
        sku: sku,
        qty: 1,
        stock: stock,
        priceText: fmt.money(sku ? sku.price : product.price),
        soldOut: stock <= 0,
      },
    });
  },

  /** WXML 不能按动态键取值，规格选中态先展开成数组再渲染。 */
  specGroups(product, selected) {
    return (product.specs || []).map((spec) => ({
      name: spec.name,
      values: (spec.values || []).map((value) => ({
        value: value,
        active: String(selected[spec.name]) === String(value),
      })),
    }));
  },

  pickSpecValue(event) {
    const name = event.currentTarget.dataset.name;
    const value = event.currentTarget.dataset.value;
    const spec = this.data.spec;
    if (!spec) return;
    const selected = Object.assign({}, spec.selected);
    selected[name] = value;
    const sku = findSku(spec.product, selected);
    const stock = sku ? sku.stock : spec.product.stock;
    this.setData({
      spec: Object.assign({}, spec, {
        selected: selected,
        groups: this.specGroups(spec.product, selected),
        sku: sku,
        stock: stock,
        priceText: fmt.money(sku ? sku.price : spec.product.price),
        soldOut: stock <= 0,
      }),
    });
  },

  changeSpecQty(event) {
    const delta = Number(event.currentTarget.dataset.delta || 0);
    const spec = this.data.spec;
    if (!spec) return;
    const next = Math.max(1, Math.min(spec.stock || 1, spec.qty + delta));
    this.setData({ spec: Object.assign({}, spec, { qty: next }) });
  },

  closeSpec() {
    this.setData({ showSpec: false, spec: null });
  },

  confirmSpec() {
    const spec = this.data.spec;
    if (!spec || spec.soldOut) return;
    this.addToCart(
      spec.product.id,
      spec.sku ? spec.sku.id : 0,
      spec.qty,
      spec.sku ? spec.sku.skuName : "",
    );
    this.closeSpec();
  },

  addToCart(productId, skuId, quantity, skuName) {
    auth
      .ensureLogin()
      .then(() => api.addCart(productId, skuId, quantity))
      .then(() => {
        wx.showToast({ title: "已加入购物车", icon: "none" });
        this.refreshCart();
        getApp().refreshCartBadge();
      })
      .catch((error) => auth.showError(error));
  },

  changeCartQty(event) {
    const id = Number(event.currentTarget.dataset.id);
    const delta = Number(event.currentTarget.dataset.delta || 0);
    const item = this.data.cart.items.filter((row) => row.id === id)[0];
    if (!item) return;
    const next = item.quantity + delta;
    const task = next <= 0 ? api.removeCart([id]) : api.updateCart(id, next);
    task
      .then(() => this.refreshCart())
      .catch((error) => auth.showError(error));
  },

  removeCartItem(event) {
    const id = Number(event.currentTarget.dataset.id);
    api
      .removeCart([id])
      .then(() => this.refreshCart())
      .catch((error) => auth.showError(error));
  },

  toggleCart() {
    if (!this.data.cartCount) return;
    this.setData({ showCart: !this.data.showCart });
  },

  closeCart() {
    this.setData({ showCart: false });
  },

  clearCart() {
    const ids = this.data.cart.items.map((item) => item.id);
    if (!ids.length) return;
    api
      .removeCart(ids)
      .then(() => {
        this.setData({ showCart: false });
        this.refreshCart();
      })
      .catch((error) => auth.showError(error));
  },

  goConfirm() {
    if (!this.data.cartCount) {
      wx.showToast({ title: "先选几样菜吧", icon: "none" });
      return;
    }
    const shop = this.data.shop || {};
    if (shop.open !== true) {
      wx.showToast({ title: "门店休息中，暂不接单", icon: "none" });
      return;
    }
    wx.navigateTo({ url: "/pages/order/confirm" });
  },

  noop() {},

  onShareAppMessage() {
    return { title: (this.data.shop && this.data.shop.name) || "外卖点餐", path: "/pages/menu/menu" };
  },
});