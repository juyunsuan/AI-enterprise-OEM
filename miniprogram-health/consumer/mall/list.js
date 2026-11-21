const api = require("../../utils/api");
const format = require("../../utils/format");

Page({
  data: {
    categories: [],
    categoryId: 0,
    keyword: "",
    list: [],
    page: 1,
    pageSize: 10,
    hasMore: true,
    loading: false,
  },

  onLoad() {
    this.loadCategories();
    this.load(true);
  },

  onPullDownRefresh() {
    this.load(true).then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.loading || !this.data.hasMore) return;
    this.load(false);
  },

  async loadCategories() {
    try {
      const rows = (await api.goodsCategories()) || [];
      this.setData({ categories: rows.filter((row) => !row.parentId) });
    } catch (error) {
      /* 分类失败不影响商品列表 */
    }
  },

  onCategory(e) {
    const categoryId = Number(e.currentTarget.dataset.id) || 0;
    if (categoryId === this.data.categoryId) return;
    this.setData({ categoryId });
    this.load(true);
  },

  onKeyword(e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearch() {
    this.load(true);
  },

  async load(reset) {
    if (this.data.loading) return;
    const page = reset ? 1 : this.data.page + 1;
    this.setData({ loading: true });
    try {
      const data = await api.goods({
        keyword: this.data.keyword,
        categoryId: this.data.categoryId,
        page,
        pageSize: this.data.pageSize,
      });
      const rows = ((data && data.list) || []).map((row) => ({
        ...row,
        priceText: format.yuan(row.priceCents),
        originText: row.originPriceCents > row.priceCents ? format.yuan(row.originPriceCents) : "",
        soldOut: row.stock <= 0,
      }));
      this.setData({
        list: reset ? rows : this.data.list.concat(rows),
        page,
        hasMore: rows.length >= this.data.pageSize,
        loading: false,
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: (error && error.message) || "加载失败", icon: "none" });
    }
  },

  onGoods(e) {
    wx.navigateTo({ url: "/consumer/mall/detail?id=" + e.currentTarget.dataset.id });
  },

  onCart() {
    wx.navigateTo({ url: "/consumer/mall/cart" });
  },
});
