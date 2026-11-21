var api = require("../../utils/api");
var format = require("../../utils/format");

Page({
  data: {
    categories: [],
    activeCategory: 0,
    groups: [],
    page: 1,
    hasMore: true,
    loading: true,
    loadingMore: false,
    community: null
  },

  onLoad: function () {
    var app = getApp();
    this.setData({ community: (app.globalData.bootstrap && app.globalData.bootstrap.community) || null });
    this.load();
  },

  onShow: function () {
    if (this.data.groups.length) this.loadGroups(true);
  },

  onPullDownRefresh: function () {
    var that = this;
    this.loadGroups(true).then(function () {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom: function () {
    if (!this.data.hasMore || this.data.loadingMore) return;
    this.loadGroups(false);
  },

  onShareAppMessage: function () {
    return { title: "发现好圈子", path: "/pages/groups/groups" };
  },

  load: function () {
    var that = this;
    this.setData({ loading: true });
    api
      .categories()
      .then(function (list) {
        that.setData({ categories: [{ id: 0, name: "全部" }].concat(list || []) });
        return that.loadGroups(true);
      })
      .catch(function () {
        that.setData({ loading: false });
      });
  },

  loadGroups: function (reset) {
    var that = this;
    var page = reset ? 1 : this.data.page + 1;
    this.setData(reset ? { loading: true } : { loadingMore: true });
    return api
      .groups({
        categoryId: this.data.activeCategory || 0,
        page: page,
        pageSize: 20
      })
      .then(function (data) {
        var list = data.list || [];
        that.setData({
          groups: reset ? list : that.data.groups.concat(list),
          page: page,
          hasMore: list.length >= 20,
          loading: false,
          loadingMore: false
        });
      })
      .catch(function () {
        that.setData({ loading: false, loadingMore: false });
      });
  },

  pickCategory: function (event) {
    var that = this;
    this.setData(
      {
        activeCategory: Number(event.currentTarget.dataset.id),
        groups: [],
        page: 1,
        hasMore: true
      },
      function () {
        that.loadGroups(true);
      }
    );
  },

  openGroup: function (event) {
    wx.navigateTo({ url: "/pages/group-detail/group-detail?id=" + event.currentTarget.dataset.id });
  },

  applyGroup: function () {
    wx.navigateTo({ url: "/pages/group-apply/group-apply" });
  }
});