const api = require("../../utils/api");
const diy = require("../../utils/diy-render");
const format = require("../../utils/format");
const navigate = require("../../utils/navigate");

const PAGE_SIZE = 20;

/**
 * 分类页：上半部分是店主装修的 CATEGORY 快照（没装修就不占位），
 * 下半部分是固定的「一级分类 + 二级分类 + 商品」三段式，保证未装修也能逛。
 */
Page({
  data: {
    blocks: [],
    ctx: {},
    pageStyle: "",
    categories: [],
    activeIndex: 0,
    subCategories: [],
    activeCategoryId: 0,
    activeTitle: "",
    goods: [],
    page: 1,
    total: 0,
    loading: false,
    noMore: false,
    error: "",
  },

  onLoad() {
    const app = getApp();
    app.ensureReady().then(() => this.syncDiy(app));
    this.loadCategories();
  },

  onPullDownRefresh() {
    this.loadCategories().then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    this.loadGoods(true);
  },

  /** 装修快照只来自 bootstrap，不额外请求，进页面时同步一次即可。 */
  syncDiy(app) {
    const snapshot = app.pageSnapshot("CATEGORY");
    this.setData({
      blocks: diy.normalizeComponents(snapshot && snapshot.components),
      ctx: diy.buildCtx(app.bootstrap(), "CATEGORY"),
      pageStyle: diy.pageStyle(snapshot && snapshot.styles),
    });
  },

  loadCategories() {
    return api
      .categories()
      .then((rows) => {
        const categories = (rows || []).map((row) => ({
          id: row.id,
          name: row.name,
          image: row.image || row.icon,
          children: (row.children || []).map((child) => ({
            id: child.id,
            name: child.name,
          })),
        }));
        this.setData({ categories: categories });
        if (categories.length) this.selectCategory({ currentTarget: { dataset: { index: 0 } } });
        return categories;
      })
      .catch((error) => {
        this.setData({ error: (error && error.message) || "分类加载失败" });
        return [];
      });
  },

  selectCategory(event) {
    const index = Number(event.currentTarget.dataset.index || 0);
    const category = this.data.categories[index];
    if (!category) return;
    const subCategories = [
      { id: 0, name: "全部" },
      ...category.children.map((child) => ({ id: child.id, name: child.name })),
    ];
    this.setData({
      activeIndex: index,
      subCategories: subCategories,
      activeCategoryId: category.id,
      activeTitle: category.name,
    });
    this.loadGoods(false, category.id, category.name);
  },

  selectSub(event) {
    const id = Number(event.currentTarget.dataset.id || 0);
    const name = event.currentTarget.dataset.name || this.data.activeTitle;
    const category = this.data.categories[this.data.activeIndex] || {};
    this.setData({ activeCategoryId: id || category.id || 0, activeTitle: name });
    this.loadGoods(false, id || category.id || 0, name);
  },

  loadGoods(append, categoryId, title) {
    if (this.data.loading) return Promise.resolve();
    const page = append ? this.data.page + 1 : 1;
    this.setData({ loading: true });
    return api
      .products({ categoryId: categoryId || 0, page: page, pageSize: PAGE_SIZE })
      .then((data) => {
        const list = ((data && data.list) || []).map((row) => ({
          id: row.id,
          title: row.title,
          subtitle: row.subtitle,
          image: row.coverImage,
          priceText: format.money(row.price),
          sales: row.sales,
        }));
        const merged = append ? this.data.goods.concat(list) : list;
        const total = Number((data && data.total) || 0);
        this.setData({
          goods: merged,
          page: page,
          total: total,
          noMore: merged.length >= total,
          loading: false,
          activeTitle: title || this.data.activeTitle,
        });
        if (!append && title) wx.setNavigationBarTitle({ title: title });
      })
      .catch(() => this.setData({ loading: false }));
  },

  openGoods(event) {
    navigate.goProduct(Number(event.currentTarget.dataset.id));
  },

  goSearch() {
    navigate.goSearch();
  },

  goAllGoods() {
    const id = this.data.activeCategoryId;
    if (!id) return;
    navigate.goCategory(id, this.data.activeTitle);
  },
});
