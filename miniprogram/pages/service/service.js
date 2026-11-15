const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

const PAGE_SIZE = 20;
const FILTERS = [
  { key: "waiting", label: "待接入" },
  { key: "active", label: "进行中" },
  { key: "all", label: "全部" },
];

Page({
  data: {
    filters: FILTERS,
    activeFilter: "waiting",
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
    if (this.data.activeFilter !== "all") query.status = this.data.activeFilter;
    return api
      .conversations(query)
      .then((data) => {
        const rows = ((data && data.list) || []).map((item) =>
          Object.assign({}, item, {
            lastMessageAtText: format.relative(item.lastMessageAt),
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

  openChat(event) {
    wx.navigateTo({
      url: "/pages/service-chat/service-chat?id=" + event.currentTarget.dataset.id,
    });
  },
});
