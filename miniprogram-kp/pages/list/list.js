/**
 * 通用列表页：按分类或榜单（new/hot/vip/all）分页加载资源。
 */
const api = require("../../utils/api");
const format = require("../../utils/format");

const PAGE_SIZE = 10;

Page({
  data: {
    themeStyle: "",
    kind: "all",
    categoryId: "",
    list: [],
    page: 1,
    total: 0,
    hasMore: true,
    loading: true,
    loadingMore: false,
    error: "",
  },

  onLoad(query) {
    const params = query || {};
    this.setData({
      kind: params.kind || (params.categoryId ? "" : "all"),
      categoryId: params.categoryId || "",
    });
    // 列表标题由上一个页面带过来（分类名或榜单名），没有就退回默认。
    wx.setNavigationBarTitle({
      title: params.title ? decodeURIComponent(params.title) : "内容列表",
    });
    this.setData({ themeStyle: getApp().globalData.themeStyle });
    this.load(true);
  },

  onPullDownRefresh() {
    this.load(true).then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore) this.load(false);
  },

  load(reset) {
    const page = reset ? 1 : this.data.page + 1;
    this.setData(
      reset ? { loading: true, error: "" } : { loadingMore: true },
    );

    return api
      .resources({
        categoryId: this.data.categoryId,
        kind: this.data.kind,
        page: page,
        pageSize: PAGE_SIZE,
      })
      .then((data) => {
        const rows = format.decorateList(data && data.list);
        const total = (data && data.total) || 0;
        const list = reset ? rows : this.data.list.concat(rows);
        this.setData({
          list: list,
          page: page,
          total: total,
          // 后端可能一次给不满一页，两种情况都要停掉「加载更多」，否则会反复请求末页。
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
          error: (error && error.message) || "内容加载失败",
        });
      });
  },

  openResource(event) {
    wx.navigateTo({
      url: "/pages/details/details?id=" + event.currentTarget.dataset.id,
    });
  },
});
