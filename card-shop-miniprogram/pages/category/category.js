const api = require("../../utils/api");
const format = require("../../utils/format");

Page({
  data: {
    themeStyle: "",
    enabled: true,
    searchEnabled: true,
    categories: [],
    activeId: 0,
    goods: [],
    page: 1,
    total: 0,
    pageSize: 20,
    loading: false,
    finished: false,
    error: "",
  },

  onLoad(query) {
    const app = getApp();
    this.setData({
      themeStyle: app.globalData.themeStyle,
      activeId: Number(query.categoryId || 0),
    });
    app.ensureReady().then(() => {
      this.setData({
        themeStyle: app.globalData.themeStyle,
        enabled: app.toggle("categoryPage"),
        searchEnabled: app.toggle("search"),
      });
      if (this.data.enabled) this.loadCategories();
    });
  },

  onShow() {
    const app = getApp();
    this.setData({
      themeStyle: app.globalData.themeStyle,
      enabled: app.toggle("categoryPage"),
      searchEnabled: app.toggle("search"),
    });
    if (this.applyPendingCategory() && this.data.enabled) this.loadGoods(true);
  },

  /** 首页点分类时 switchTab 带不了参数，只把分类 id 放缓存，这里消费一次。 */
  applyPendingCategory() {
    let pending = null;
    try {
      const raw = wx.getStorageSync("card_category_pending");
      if (raw !== "" && raw !== null && raw !== undefined) pending = Number(raw);
      wx.removeStorageSync("card_category_pending");
    } catch (e) {
      pending = null;
    }
    if (pending === null || Number.isNaN(pending) || pending === this.data.activeId) {
      return false;
    }
    this.setData({ activeId: pending, goods: [], finished: false });
    return true;
  },

  onPullDownRefresh() {
    Promise.all([this.loadCategories(), this.loadGoods(true)]).then(() =>
      wx.stopPullDownRefresh(),
    );
  },

  onReachBottom() {
    if (this.data.finished || this.data.loading) return;
    this.loadGoods();
  },

  loadCategories() {
    return api
      .categories()
      .then((list) => {
        const categories = [{ id: 0, name: "全部" }].concat(list || []);
        this.setData({ categories: categories });
        return this.loadGoods(true);
      })
      .catch((error) => {
        this.setData({ error: (error && error.message) || "分类加载失败" });
      });
  },

  loadGoods(reset) {
    const page = reset ? 1 : this.data.page + 1;
    this.setData({ loading: true, error: "" });
    return api
      .goods({ categoryId: this.data.activeId || "", page: page, pageSize: this.data.pageSize })
      .then((data) => {
        const stockMode = (getApp().bootstrap() || {}).stockDisplayMode || "ACTUAL";
        const list = ((data && data.list) || []).map((goods) =>
          Object.assign({}, goods, {
            priceText: format.money(goods.price),
            stockText: format.stockText(goods.stock, stockMode),
          }),
        );
        this.setData({
          goods: reset ? list : this.data.goods.concat(list),
          page: page,
          total: (data && data.total) || 0,
          loading: false,
          finished: !data || list.length < this.data.pageSize,
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "商品加载失败",
        });
      });
  },

  switchCategory(event) {
    const id = Number(event.currentTarget.dataset.id || 0);
    if (id === this.data.activeId) return;
    this.setData({ activeId: id, goods: [], finished: false });
    this.loadGoods(true);
  },

  openGoods(event) {
    wx.navigateTo({
      url: "/pages/goods/detail?id=" + event.currentTarget.dataset.id,
    });
  },

  goSearch() {
    wx.navigateTo({ url: "/pages/search/search" });
  },
});
