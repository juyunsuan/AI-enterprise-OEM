/**
 * 搜索页：按关键词分页搜内容，顶部给站点配置的热门词做快捷入口。
 */
const api = require("../../utils/api");
const format = require("../../utils/format");

const PAGE_SIZE = 10;

Page({
  data: {
    themeStyle: "",
    keyword: "",
    hotWords: [],
    list: [],
    page: 1,
    total: 0,
    searched: false,
    hasMore: true,
    loading: false,
    loadingMore: false,
    error: "",
  },

  onLoad() {
    const app = getApp();
    const config = app.globalData.config || {};
    this.setData({
      themeStyle: app.globalData.themeStyle,
      hotWords: String(config.hotWords || "")
        .split(",")
        .filter((word) => !!word)
        .slice(0, 8),
    });
    app.ensureReady().then(() => {
      const latest = app.globalData.config || {};
      this.setData({
        hotWords: String(latest.hotWords || "")
          .split(",")
          .filter((word) => !!word)
          .slice(0, 8),
      });
    });
  },

  onReachBottom() {
    if (this.data.searched && this.data.hasMore && !this.data.loadingMore) {
      this.load(false);
    }
  },

  onInput(event) {
    this.setData({ keyword: event.detail.value });
  },

  onConfirm() {
    this.search();
  },

  onHotWord(event) {
    this.setData({ keyword: event.currentTarget.dataset.word || "" });
    this.search();
  },

  onClear() {
    this.setData({
      keyword: "",
      list: [],
      total: 0,
      page: 1,
      searched: false,
      hasMore: true,
      error: "",
    });
  },

  search() {
    const keyword = String(this.data.keyword || "").trim();
    if (!keyword) {
      wx.showToast({ title: "请输入搜索关键词", icon: "none" });
      return;
    }
    this.load(true);
  },

  load(reset) {
    const page = reset ? 1 : this.data.page + 1;
    this.setData(reset ? { loading: true, error: "" } : { loadingMore: true });

    return api
      .resources({
        keyword: String(this.data.keyword || "").trim(),
        kind: "all",
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
          searched: true,
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
          searched: true,
          error: (error && error.message) || "搜索失败",
        });
      });
  },

  openResource(event) {
    wx.navigateTo({
      url: "/pages/details/details?id=" + event.currentTarget.dataset.id,
    });
  },
});
