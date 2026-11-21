const api = require("../../utils/api");
const format = require("../../utils/format");
const navigate = require("../../utils/navigate");

const PAGE_SIZE = 20;

const SORTS = [
  { key: "DEFAULT", label: "综合" },
  { key: "SALES_DESC", label: "销量" },
  { key: "NEWEST", label: "新品" },
];

/** 商品列表：关键词 / 分类 / 标签三种入口共用，价格排序点同一项在升序降序间切换。 */
Page({
  data: {
    keyword: "",
    categoryId: 0,
    tag: "",
    sort: "DEFAULT",
    sorts: SORTS,
    priceAsc: true,
    goods: [],
    page: 1,
    total: 0,
    loading: false,
    noMore: false,
    error: "",
  },

  onLoad(query) {
    const keyword = String(query.keyword || "");
    const title = String(query.title || "") || keyword || "商品列表";
    this.setData({
      keyword: keyword,
      categoryId: Number(query.categoryId || 0),
      tag: String(query.tag || ""),
    });
    wx.setNavigationBarTitle({ title: decodeURIComponent(title) });
    this.load(false);
  },

  onReachBottom() {
    this.load(true);
  },

  onPullDownRefresh() {
    this.load(false).then(() => wx.stopPullDownRefresh());
  },

  load(append) {
    if (this.data.loading) return Promise.resolve();
    const page = append ? this.data.page + 1 : 1;
    this.setData({ loading: true });
    return api
      .products({
        keyword: this.data.keyword,
        categoryId: this.data.categoryId,
        tag: this.data.tag,
        sort: this.data.sort,
        page: page,
        pageSize: PAGE_SIZE,
      })
      .then((data) => {
        const list = ((data && data.list) || []).map((row) => ({
          id: row.id,
          title: row.title,
          subtitle: row.subtitle,
          image: row.coverImage,
          priceText: format.money(row.price),
          originText: Number(row.marketPrice || 0) > Number(row.price || 0) ? format.money(row.marketPrice) : "",
          sales: row.sales,
          stockText: format.stockText(row.stock),
          tags: [row.isHot ? "热卖" : "", row.isNew ? "新品" : "", row.isGood ? "好评" : ""].filter(Boolean),
        }));
        const goods = append ? this.data.goods.concat(list) : list;
        const total = Number((data && data.total) || 0);
        this.setData({
          goods: goods,
          page: page,
          total: total,
          noMore: goods.length >= total,
          loading: false,
          error: "",
        });
      })
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "商品加载失败" });
      });
  },

  setSort(event) {
    const key = event.currentTarget.dataset.key;
    if (key === "PRICE") {
      // 同一个「价格」按钮再点一次切换升/降，排序值仍用后端的 PRICE_ASC / PRICE_DESC。
      const asc = this.data.sort === "PRICE_ASC" ? !this.data.priceAsc : true;
      this.setData({ priceAsc: asc, sort: asc ? "PRICE_ASC" : "PRICE_DESC" });
    } else {
      this.setData({ sort: key });
    }
    this.load(false);
  },

  openGoods(event) {
    navigate.goProduct(Number(event.currentTarget.dataset.id));
  },

  goSearch() {
    navigate.goSearch();
  },
});
