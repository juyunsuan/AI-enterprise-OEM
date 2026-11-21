const api = require("../../utils/api");
const format = require("../../utils/format");

const HISTORY_KEY = "brand_mall_search_history";
const HISTORY_LIMIT = 10;

/**
 * 搜索页：结果走 /products（与列表页同一接口，只是多带 keyword）。
 * 历史只存本机：私域搜索词属于店主的生意数据，不上报也不跨店共享。
 */
Page({
  data: {
    keyword: "",
    history: [],
    items: [],
    page: 1,
    hasMore: true,
    loading: false,
    searched: false,
  },

  onLoad(query) {
    const initial = (query && query.keyword) || "";
    this.setData({ history: this.readHistory(), keyword: initial });
    if (initial) this.search(true);
  },

  readHistory() {
    try {
      const value = wx.getStorageSync(HISTORY_KEY);
      return Array.isArray(value) ? value.slice(0, HISTORY_LIMIT) : [];
    } catch (e) {
      return [];
    }
  },

  writeHistory(list) {
    try {
      wx.setStorageSync(HISTORY_KEY, list.slice(0, HISTORY_LIMIT));
    } catch (e) {
      /* 存储写失败不影响搜索 */
    }
  },

  onInput(event) {
    this.setData({ keyword: event.detail.value });
  },

  useHistory(event) {
    this.setData({ keyword: event.currentTarget.dataset.keyword || "" });
    this.search(true);
  },

  clearHistory() {
    this.setData({ history: [] });
    this.writeHistory([]);
  },

  search(reset) {
    const keyword = String(this.data.keyword || "").trim();
    if (!keyword) {
      wx.showToast({ title: "请输入搜索关键词", icon: "none" });
      return Promise.resolve();
    }
    if (this.data.loading) return Promise.resolve();
    const page = reset ? 1 : this.data.page + 1;
    this.setData({ loading: true });
    return api
      .products({ keyword: keyword, page: page, pageSize: 20 })
      .then((result) => {
        const rows = ((result && result.list) || []).map((row) => this.decorate(row));
        const merged = reset ? rows : this.data.items.concat(rows);
        this.setData({
          items: merged,
          page: page,
          hasMore: merged.length < Number((result && result.total) || 0),
          loading: false,
          searched: true,
        });
        if (reset) this.remember(keyword);
      })
      .catch((error) => {
        this.setData({ loading: false, searched: true });
        wx.showToast({ title: (error && error.message) || "搜索失败", icon: "none" });
      });
  },

  remember(keyword) {
    const next = [keyword].concat(this.data.history.filter((item) => item !== keyword));
    this.setData({ history: next });
    this.writeHistory(next);
  },

  decorate(row) {
    return {
      id: row.id,
      title: row.title,
      subtitle: row.subtitle,
      image: row.coverImage,
      priceText: format.money(row.price),
      salesText: "已售 " + Number(row.sales || 0),
    };
  },

  openDetail(event) {
    wx.navigateTo({ url: "/pages/goods/detail?id=" + event.currentTarget.dataset.id });
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) this.search(false);
  },
});
