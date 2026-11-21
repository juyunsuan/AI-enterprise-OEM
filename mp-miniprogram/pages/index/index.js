const app = getApp();
const api = require("../../utils/api");
const diy = require("../../utils/diy");
const navigate = require("../../utils/navigate");

Page({
  data: {
    loading: true,
    error: "",
    themeColor: "#3370ff",
    market: {},
    categories: [],
    shops: [],
    products: [],
    total: 0,
    page: 1,
    hasMore: true,
    keyword: "",
    categoryId: 0,
    /** 市场发布过首页装修时，默认展示装修楼层 */
    hasDiy: false,
    diyBlocks: [],
    diyStyle: "",
    diyTheme: "#3370ff",
    diyKeyword: "",
    /** 装修里的搜索/分类会把顾客带进默认商品列表，这里标记可返回装修首页 */
    forceClassic: false,
  },

  onLoad() {
    this.load();
  },

  onShow() {
    if (!this.data.loading && this.data.error) {
      this.load();
      return;
    }
    this.applyPendingCategory();
  },

  onReachBottom() {
    if (!this.data.hasDiy || this.data.forceClassic) {
      if (this.data.hasMore) this.loadProducts(false);
    }
  },

  onPullDownRefresh() {
    app.reload().then((data) => {
      wx.stopPullDownRefresh();
      if (data) this.load();
    });
  },

  load() {
    this.setData({ loading: true, error: "" });
    app.ensureReady().then((data) => {
      if (!data) {
        this.setData({
          loading: false,
          error: app.globalData.bootstrapError || "市场服务暂不可用",
        });
        return;
      }
      const market = data.market || {};
      const shops = data.shops || [];
      const categories = (data.categories || []).filter(function (item) {
        return !item.parentId;
      });
      const ctx = diy.buildCtx(data);
      const home = market.home || null;
      const pending = Number(wx.getStorageSync("mp_pending_category") || 0);
      if (pending) {
        wx.removeStorageSync("mp_pending_category");
        this.setData({ categoryId: pending, forceClassic: true });
      }
      return diy.loadPage(home, ctx).then((page) => {
        this.setData({
          loading: false,
          error: "",
          market: market,
          shops: shops,
          categories: categories,
          themeColor: ctx.themeColor,
          hasDiy: !!page,
          diyBlocks: page ? page.blocks : [],
          diyStyle: page ? page.style : "",
          diyTheme: page ? page.themeColor : ctx.themeColor,
        });
        if (!page || this.data.forceClassic) this.loadProducts(true);
      });
    });
  },

  /** 装修里的分类跳转：tab 页不能带 query，分类意图从缓存里取。 */
  applyPendingCategory() {
    const pending = Number(wx.getStorageSync("mp_pending_category") || 0);
    if (!pending) return;
    wx.removeStorageSync("mp_pending_category");
    this.setData({ categoryId: pending, forceClassic: true });
    if (!this.data.loading) this.loadProducts(true);
  },

  loadProducts(reset) {
    const page = reset ? 1 : this.data.page + 1;
    const params = { page: page, pageSize: 10 };
    if (this.data.keyword) params.keyword = this.data.keyword;
    if (this.data.categoryId) params.categoryId = this.data.categoryId;
    return api
      .products(params)
      .then((result) => {
        const list = (result && result.list) || [];
        const mapped = list.map(function (item) {
          return Object.assign({}, item, {
            priceText: (Number(item.price) || 0).toFixed(2),
            marketPriceText: item.marketPrice
              ? (Number(item.marketPrice) || 0).toFixed(2)
              : "",
          });
        });
        const products = reset ? mapped : this.data.products.concat(mapped);
        this.setData({
          products: products,
          total: (result && result.total) || 0,
          page: page,
          hasMore: products.length < ((result && result.total) || 0),
        });
      })
      .catch((error) => {
        this.setData({ error: (error && error.message) || "商品读取失败" });
      });
  },

  onKeyword(event) {
    this.setData({ keyword: event.detail.value });
  },

  search() {
    this.setData({ forceClassic: true });
    this.loadProducts(true);
  },

  pickCategory(event) {
    this.setData({
      categoryId: Number(event.currentTarget.dataset.id) || 0,
      page: 1,
      forceClassic: true,
    });
    this.loadProducts(true);
  },

  goShop(event) {
    navigate.goShop(Number(event.currentTarget.dataset.id) || 0);
  },

  goProduct(event) {
    navigate.goProduct(Number(event.currentTarget.dataset.id) || 0);
  },

  // ---------------------------------------------------------------- 装修楼层事件

  diyKeyword(event) {
    this.setData({ diyKeyword: event.detail.value });
  },

  diySearch() {
    this.setData({ keyword: this.data.diyKeyword, forceClassic: true });
    this.loadProducts(true);
  },

  diyLink(event) {
    navigate.open(event.currentTarget.dataset.link);
  },

  diyGoods(event) {
    navigate.goProduct(Number(event.currentTarget.dataset.id) || 0);
  },

  diyShop(event) {
    navigate.goShop(Number(event.currentTarget.dataset.id) || 0);
  },

  diyCategory(event) {
    this.setData({
      categoryId: Number(event.currentTarget.dataset.id) || 0,
      forceClassic: true,
    });
    this.loadProducts(true);
  },

  diyCoupon() {
    navigate.push("/pages/coupon/coupon");
  },

  diyAssist() {
    navigate.goService({});
  },

  backToDiy() {
    this.setData({ forceClassic: false });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },

  retry() {
    this.load();
  },
});
