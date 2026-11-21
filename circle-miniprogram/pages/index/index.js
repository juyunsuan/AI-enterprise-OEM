var api = require("../../utils/api");
var auth = require("../../utils/auth");
var format = require("../../utils/format");

Page({
  data: {
    tab: "recommend",
    posts: [],
    page: 1,
    hasMore: true,
    loading: true,
    loadingMore: false,
    error: "",
    community: null,
    viewer: null
  },

  onLoad: function () {
    this.load(true);
  },

  onShow: function () {
    var app = getApp();
    this.setData({
      community: (app.globalData.bootstrap && app.globalData.bootstrap.community) || null,
      viewer: app.globalData.viewer || null
    });
    if (this.data.posts.length) this.load(true);
  },

  onPullDownRefresh: function () {
    var that = this;
    this.load(true).then(function () {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom: function () {
    if (!this.data.hasMore || this.data.loadingMore) return;
    this.load(false);
  },

  onShareAppMessage: function () {
    var community = this.data.community || {};
    return {
      title: community.name || "圈子社区",
      path: "/pages/index/index"
    };
  },

  load: function (reset) {
    var that = this;
    var page = reset ? 1 : this.data.page + 1;
    this.setData(reset ? { loading: true, error: "" } : { loadingMore: true });
    return api
      .posts({ tab: this.data.tab, page: page, pageSize: 20 })
      .then(function (data) {
        var list = (data.list || []).map(function (item) {
          return Object.assign({}, item, { timeText: format.time(item.createdAt) });
        });
        var posts = reset ? list : that.data.posts.concat(list);
        that.setData({
          posts: posts,
          page: page,
          hasMore: list.length >= 20,
          loading: false,
          loadingMore: false
        });
      })
      .catch(function (error) {
        that.setData({
          loading: false,
          loadingMore: false,
          error: (error && error.message) || "加载失败"
        });
      });
  },

  switchTab: function (event) {
    var tab = event.currentTarget.dataset.tab;
    if (tab === this.data.tab) return;
    var that = this;
    this.setData({ tab: tab, posts: [], page: 1, hasMore: true }, function () {
      that.load(true);
    });
  },

  openPost: function (event) {
    wx.navigateTo({ url: "/pages/post-detail/post-detail?id=" + event.currentTarget.dataset.id });
  },

  openGroup: function (event) {
    wx.navigateTo({ url: "/pages/group-detail/group-detail?id=" + event.currentTarget.dataset.id });
  },

  createPost: function () {
    auth.ensureLogin().then(function () {
      wx.navigateTo({ url: "/pages/post-create/post-create" });
    });
  },

  search: function () {
    wx.navigateTo({ url: "/pages/search/search" });
  }
});