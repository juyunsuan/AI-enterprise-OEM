const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

const PAGE_SIZE = 20;

Page({
  data: {
    filters: [
      { key: "open", label: "未办" },
      { key: "all", label: "含已关闭" },
    ],
    activeFilter: "open",
    list: [],
    page: 1,
    total: 0,
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
    this.setData({ activeFilter: key });
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
    // 后端按 coerce.boolean 解析：只有 true 才带上，避免 "false" 被当成真值。
    if (this.data.activeFilter === "all") query.includeClosed = true;
    return api
      .myTasks(query)
      .then((data) => {
        const rows = ((data && data.list) || []).map((item) =>
          Object.assign({}, item, {
            createdAtText: format.relative(item.createdAt),
            dueAtText: item.dueAt ? format.dateTime(item.dueAt) : "",
          }),
        );
        const list = page === 1 ? rows : this.data.list.concat(rows);
        this.setData({
          list: list,
          page: page,
          total: (data && data.total) || 0,
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
      url: "/pages/task-detail/task-detail?id=" + event.currentTarget.dataset.id,
    });
  },
});
