/** 广场：全站已完成作品流，下拉刷新 + 触底加载。 */
const api = require("../../utils/api");
const format = require("../../utils/format");

Page({
  data: {
    themeStyle: "",
    list: [],
    page: 1,
    hasMore: true,
    loading: false,
    error: "",
  },

  onShow() {
    const app = getApp();
    this.setData({ themeStyle: app.globalData.themeStyle });
    this.reload();
  },

  onPullDownRefresh() {
    this.reload().then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) this.load(this.data.page + 1);
  },

  onShareAppMessage() {
    return { title: "来看看大家的数字人作品", path: "/pages/feed/feed" };
  },

  reload() {
    return this.load(1);
  },

  load(page) {
    if (this.data.loading) return Promise.resolve();
    this.setData({ loading: true });
    return api
      .feed({ page: page, pageSize: 10 })
      .then((result) => {
        const rows = (result && result.list ? result.list : []).map((row) => ({
          id: row.id,
          title: row.title || "数字人作品",
          coverUrl: row.coverUrl,
          nickname: row.nickname,
          playCount: row.playCount,
          createdAt: format.day(row.createdAt),
        }));
        const total = (result && result.total) || 0;
        const merged = page === 1 ? rows : this.data.list.concat(rows);
        this.setData({
          list: merged,
          page: page,
          hasMore: rows.length > 0 && merged.length < total,
          loading: false,
          error: "",
        });
      })
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "加载失败" });
      });
  },

  openWork(event) {
    wx.navigateTo({ url: "/pages/play/play?id=" + event.currentTarget.dataset.id });
  },

  goCreate() {
    wx.switchTab({ url: "/pages/create/create" });
  },
});
