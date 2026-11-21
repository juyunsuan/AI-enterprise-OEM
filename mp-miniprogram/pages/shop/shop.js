const app = getApp();
const api = require("../../utils/api");
const auth = require("../../utils/auth");
const diy = require("../../utils/diy");
const navigate = require("../../utils/navigate");

Page({
  data: {
    id: 0,
    loading: true,
    error: "",
    shop: {},
    followed: false,
    followerCount: 0,
    busyFollow: false,
    themeColor: "#3370ff",
    hasDiy: false,
    blocks: [],
    diyStyle: "",
    diyTheme: "#3370ff",
    diyKeyword: "",
    keyword: "",
    categoryId: 0,
    products: [],
    total: 0,
    page: 1,
    hasMore: true,
  },

  onLoad(options) {
    const id = Number((options && options.id) || 0);
    if (!id) {
      this.setData({ loading: false, error: "缺少店铺编号" });
      return;
    }
    this.setData({ id: id });
    this.load();
  },

  onReachBottom() {
    if (this.data.hasMore) this.loadProducts(false);
  },

  onPullDownRefresh() {
    Promise.resolve(this.load()).then(function () {
      wx.stopPullDownRefresh();
    });
  },

  load() {
    const id = this.data.id;
    this.setData({ loading: !this.data.shop.id, error: "" });
    return app.ensureReady().then((data) => {
      if (!data) {
        this.setData({
          loading: false,
          error: app.globalData.bootstrapError || "市场服务暂不可用",
        });
        return;
      }
      const shops = data.shops || [];
      let shop = null;
      for (let index = 0; index < shops.length; index += 1) {
        if (Number(shops[index].id) === id) shop = shops[index];
      }
      if (!shop) {
        this.setData({ loading: false, error: "店铺不存在或已停业" });
        return;
      }
      const ctx = diy.buildCtx(data, { shop: shop });
      wx.setNavigationBarTitle({ title: shop.name });
      this.setData({
        loading: false,
        error: "",
        shop: shop,
        followed: !!shop.followed,
        themeColor: ctx.themeColor,
      });
      return api
        .shopDiy(id)
        .then(function (page) {
          return diy.loadPage(page, ctx);
        })
        .catch(function () {
          // 装修读取失败不拦店铺页：回落默认店铺布局
          return null;
        })
        .then((page) => {
          this.setData({
            hasDiy: !!page,
            blocks: page ? page.blocks : [],
            diyStyle: page ? page.style : "",
            diyTheme: page ? page.themeColor : ctx.themeColor,
          });
          this.loadProducts(true);
        });
    });
  },

  loadProducts(reset) {
    const page = reset ? 1 : this.data.page + 1;
    const params = { page: page, pageSize: 10, shopId: this.data.id };
    if (this.data.categoryId) params.categoryId = this.data.categoryId;
    if (this.data.keyword) params.keyword = this.data.keyword;
    return api
      .products(params)
      .then((result) => {
        const mapped = ((result && result.list) || []).map(function (item) {
          return Object.assign({}, item, {
            priceText: (Number(item.price) || 0).toFixed(2),
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
        wx.showToast({
          title: (error && error.message) || "商品读取失败",
          icon: "none",
        });
      });
  },

  toggleFollow() {
    if (this.data.busyFollow) return;
    const next = !this.data.followed;
    this.setData({ busyFollow: true });
    auth
      .ensureLogin()
      .then(() => (next ? api.follow(this.data.id) : api.unfollow(this.data.id)))
      .then((state) => {
        const followed = !!(state && state.followed);
        this.setData({
          followed: followed,
          followerCount: (state && state.followerCount) || 0,
          busyFollow: false,
        });
        this.syncBootstrap(followed);
        wx.showToast({
          title: followed ? "已关注" : "已取消关注",
          icon: "none",
        });
      })
      .catch((error) => {
        this.setData({ busyFollow: false });
        wx.showToast({
          title: (error && error.message) || "操作失败",
          icon: "none",
        });
      });
  },

  /** 关注状态同步回 bootstrap，首页再进来时不用等接口。 */
  syncBootstrap(followed) {
    const data = app.globalData.bootstrap;
    if (!data || !Array.isArray(data.shops)) return;
    for (let index = 0; index < data.shops.length; index += 1) {
      if (Number(data.shops[index].id) === this.data.id) {
        data.shops[index].followed = followed;
      }
    }
  },

  goService() {
    navigate.goService({ shopName: this.data.shop.name });
  },

  goProduct(event) {
    navigate.goProduct(Number(event.currentTarget.dataset.id) || 0);
  },

  onKeyword(event) {
    this.setData({ keyword: event.detail.value });
  },

  search() {
    this.setData({ categoryId: 0 });
    this.loadProducts(true);
  },

  // ---------------------------------------------------------------- 装修楼层事件

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
      page: 1,
    });
    this.loadProducts(true);
  },

  diyCoupon() {
    navigate.push("/pages/coupon/coupon?shopId=" + this.data.id);
  },

  diyAssist() {
    this.goService();
  },

  diyFollow() {
    this.toggleFollow();
  },

  diySearch() {
    const keyword = String(this.data.diyKeyword || "").trim();
    if (!keyword) return;
    this.setData({ keyword: keyword, categoryId: 0 });
    this.loadProducts(true);
    wx.pageScrollTo({ selector: "#shop-goods", duration: 200 });
  },

  onShareAppMessage() {
    return {
      title: this.data.shop.name || "店铺",
      path: "/pages/shop/shop?id=" + this.data.id,
    };
  },
});
