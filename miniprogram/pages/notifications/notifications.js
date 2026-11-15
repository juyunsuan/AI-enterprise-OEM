const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

const PAGE_SIZE = 20;

Page({
  data: {
    filters: [
      { key: "unread", label: "未读", on: true },
      { key: "all", label: "全部", on: false },
    ],
    activeFilter: "unread",
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

  onFilter(event) {
    const key = event.currentTarget.dataset.key;
    if (key === this.data.activeFilter) return;
    this.setData({
      activeFilter: key,
      filters: this.data.filters.map((item) =>
        Object.assign({}, item, { on: item.key === key }),
      ),
    });
    this.reload();
  },

  reload() {
    this.setData({ list: [], page: 1, finished: false });
    return this.loadPage(1);
  },

  loadPage(page) {
    if (this.data.loading) return Promise.resolve();
    if (page > 1 && this.data.finished) return Promise.resolve();
    this.setData({ loading: true });
    const query = { page: page, pageSize: PAGE_SIZE };
    if (this.data.activeFilter === "unread") query.unreadOnly = true;
    return api
      .notifications(query)
      .then((data) => {
        const rows = ((data && data.list) || []).map((item) =>
          Object.assign({}, item, {
            createdAtText: format.relative(item.createdAt),
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

  onReadAll() {
    api
      .readAllNotifications()
      .then(() => {
        wx.showToast({ title: "已全部标记", icon: "success" });
        this.reload();
      })
      .catch((error) => auth.showError(error));
  },

  openDetail(event) {
    wx.navigateTo({
      url:
        "/pages/notification-detail/notification-detail?id=" +
        event.currentTarget.dataset.id,
    });
  },
});
