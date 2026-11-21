const api = require("../../utils/api");

function toCard(row) {
  const rating = Number(row.rating);
  return {
    id: row.id,
    name: row.name || "服务技师",
    avatar: row.avatar || "",
    levelName: row.levelName || "",
    serviceCity: row.serviceCity || "",
    intro: row.intro || "",
    ratingText: Number.isFinite(rating) ? rating.toFixed(1) : "",
    reviewText: row.reviewCount ? row.reviewCount + " 条评价" : "",
    orderText: row.orderCount ? "服务 " + row.orderCount + " 单" : "",
    windowText: row.serviceStartAt && row.serviceEndAt
      ? row.serviceStartAt + " - " + row.serviceEndAt
      : "",
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
    notReady: false,
    readyReason: "",
  },

  onLoad() {
    this.start();
  },

  onPullDownRefresh() {
    this.start().then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.loadingMore || this.data.loading) return;
    this.fetch(false);
  },

  onKeywordInput(event) {
    this.setData({ keywordInput: event.detail.value });
  },

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
    this.start();
  },

  start() {
    const app = getApp();
    return app
      .ensureReady()
      .then((shop) => {
        if (!shop || !shop.shopCode) {
          this.setData({
            loading: false,
            notReady: true,
            readyReason: app.globalData.bootstrapError || "店铺尚未开通，请联系店铺方",
          });
          return null;
        }
        return this.fetch(true);
      })
      .catch((error) => {
        this.setData({
          loading: false,
          notReady: false,
          error: (error && error.message) || "服务人员加载失败，请稍后重试",
        });
      });
  },

  fetch(reset) {
    if (this.busy) return Promise.resolve();
    this.busy = true;
    const page = reset ? 1 : this.data.page + 1;
    this.setData(reset ? { loading: true, error: "", notReady: false } : { loadingMore: true });
    return api
      .staffList({
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
          error: (error && error.message) || "服务人员加载失败，请稍后重试",
        });
      })
      .then(() => {
        this.busy = false;
      });
  },

  openStaff(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: "/consumer/staff-detail/staff-detail?staffId=" + id });
  },
});
