const api = require("../../utils/api");
const format = require("../../utils/format");

/**
 * 服务列表：服务端只支持 keyword 与 categoryId 两个筛选参数，
 * 也没有分类列表接口，所以这里只做关键词检索，不摆分类与排序控件。
 * 分页按 {list,total,page,pageSize} 口径判断是否还有下一页。
 */
function toCard(row) {
  const highlights = Array.isArray(row.highlights) ? row.highlights : [];
  return {
    id: row.id,
    title: row.title || "未命名服务",
    subtitle: row.subtitle || "",
    cover: row.coverImage || "",
    priceText: format.yuan(row.priceCents),
    durationText: format.duration(row.durationMinutes),
    salesText: row.sales ? "已售 " + row.sales : "",
    highlights: highlights.slice(0, 3),
  };
}

Page({
  data: {
    keywordInput: "",
    keyword: "",
    list: [],
    page: 1,
    pageSize: 10,
    total: 0,
    hasMore: false,
    loading: true,
    loadingMore: false,
    error: "",
  },

  onLoad() {
    this.fetch(true);
  },

  onPullDownRefresh() {
    this.fetch(true).then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.loadingMore || this.data.loading) return;
    this.fetch(false);
  },

  onKeywordInput(event) {
    this.setData({ keywordInput: event.detail.value });
  },

  /** 只在确认/清空时请求，输入过程不发请求。 */
  onSearch() {
    const keyword = String(this.data.keywordInput || "").trim();
    if (keyword === this.data.keyword) {
      this.fetch(true);
      return;
    }
    this.setData({ keyword: keyword }, () => this.fetch(true));
  },

  onClearKeyword() {
    if (!this.data.keywordInput && !this.data.keyword) return;
    this.setData({ keywordInput: "", keyword: "" }, () => this.fetch(true));
  },

  onRetry() {
    this.fetch(true);
  },

  fetch(reset) {
    if (this.busy) return Promise.resolve();
    this.busy = true;
    const page = reset ? 1 : this.data.page + 1;
    this.setData(reset ? { loading: true, error: "" } : { loadingMore: true });
    return api
      .services({
        page: page,
        pageSize: this.data.pageSize,
        keyword: this.data.keyword,
      })
      .then((res) => {
        const rows = ((res && res.list) || []).map(toCard);
        const total = Number(res && res.total) || 0;
        const list = reset ? rows : this.data.list.concat(rows);
        this.setData({
          list: list,
          page: page,
          total: total,
          hasMore: rows.length > 0 && list.length < total,
          loading: false,
          loadingMore: false,
          error: "",
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          loadingMore: false,
          error: (error && error.message) || "服务加载失败，请稍后重试",
        });
      })
      .then(() => {
        this.busy = false;
      });
  },

  openService(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: "/consumer/service-detail/service-detail?serviceId=" + id,
    });
  },
});
