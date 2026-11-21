/**
 * 我的收藏：会员收藏的资源列表，点击回到内容详情。
 */
const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

const PAGE_SIZE = 10;

Page({
  data: {
    themeStyle: "",
    list: [],
    page: 1,
    total: 0,
    hasMore: true,
    loading: true,
    loadingMore: false,
    error: "",
  },

  onLoad() {
    const app = getApp();
    this.setData({ themeStyle: app.globalData.themeStyle });
    app.ensureReady().then(() => this.load(true));
  },

  onPullDownRefresh() {
    this.load(true).then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore) this.load(false);
  },

  load(reset) {
    const page = reset ? 1 : this.data.page + 1;
    this.setData(reset ? { loading: true, error: "" } : { loadingMore: true });

    return auth
      .ensureMember()
      .then(() => api.favorites({ page: page, pageSize: PAGE_SIZE }))
      .then((data) => {
        const rows = ((data && data.list) || []).map((item) =>
          Object.assign({}, item, {
            title: item.title || "内容已下架",
            accessLabel: "已收藏",
            accessClass: "tag",
            dateText: format.dateText(item.createdAt),
          }),
        );
        const total = (data && data.total) || 0;
        const list = reset ? rows : this.data.list.concat(rows);
        this.setData({
          list: list,
          page: page,
          total: total,
          hasMore: list.length < total && rows.length > 0,
          loading: false,
          loadingMore: false,
          error: "",
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          loadingMore: false,
          error: (error && error.message) || "收藏加载失败",
        });
      });
  },

  openResource(event) {
    const id = event.currentTarget.dataset.resourceid;
    if (!id) {
      wx.showToast({ title: "该内容已不可访问", icon: "none" });
      return;
    }
    wx.navigateTo({ url: "/pages/details/details?id=" + id });
  },
});
