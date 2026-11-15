const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

const PAGE_SIZE = 20;

Page({
  data: {
    list: [],
    page: 1,
    loading: false,
    finished: false,
  },

  onShow() {
    if (!auth.ensureLogin()) return;
    this.reload();
  },

  onPullDownRefresh() {
    this.reload().then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    this.loadPage(this.data.page + 1);
  },

  reload() {
    this.setData({ list: [], page: 1, finished: false });
    return this.loadPage(1);
  },

  loadPage(page) {
    if (this.data.loading) return Promise.resolve();
    if (page > 1 && this.data.finished) return Promise.resolve();
    this.setData({ loading: true });
    return api
      .oaTasks({ page: page, pageSize: PAGE_SIZE })
      .then((data) => {
        const rows = ((data && data.list) || []).map((item) =>
          Object.assign({}, item, {
            amountText: format.amount(item.amount),
            submittedAtText: format.relative(item.submittedAt || item.createdAt),
          }),
        );
        const list = page === 1 ? rows : this.data.list.concat(rows);
        this.setData({
          list: list,
          page: page,
          loading: false,
          finished: list.length >= ((data && data.total) || 0),
        });
      })
      .catch((error) => {
        this.setData({ loading: false });
        auth.showError(error);
      });
  },

  openDetail(event) {
    wx.navigateTo({
      url: "/pages/oa-detail/oa-detail?id=" + event.currentTarget.dataset.id,
    });
  },
});
