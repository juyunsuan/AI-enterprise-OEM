var api = require("../../utils/api");
var auth = require("../../utils/auth");
var format = require("../../utils/format");

Page({
  data: { id: 0, user: null, posts: [], page: 1, hasMore: true, loading: true, loadingMore: false },

  onLoad: function (options) {
    this.setData({ id: Number(options.id || 0) });
    this.load();
  },

  onPullDownRefresh: function () {
    var that = this;
    this.load().then(function () {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom: function () {
    if (!this.data.hasMore || this.data.loadingMore) return;
    this.loadMore();
  },

  onShareAppMessage: function () {
    var user = this.data.user || {};
    return {
      title: user.nickname || "社区成员",
      path: "/pages/user/user?id=" + this.data.id
    };
  },

  load: function () {
    var that = this;
    this.setData({ loading: true });
    Promise.all([
      api.userDetail(this.data.id),
      api.userPosts(this.data.id, { page: 1, pageSize: 20 })
    ])
      .then(function (result) {
        var list = (result[1].list || []).map(function (item) {
          return Object.assign({}, item, { timeText: format.time(item.createdAt) });
        });
        that.setData({
          user: result[0],
          posts: list,
          page: 1,
          hasMore: list.length >= 20,
          loading: false
        });
      })
      .catch(function (error) {
        that.setData({ loading: false });
        wx.showToast({ title: (error && error.message) || "加载失败", icon: "none" });
      });
  },

  loadMore: function () {
    var that = this;
    var page = this.data.page + 1;
    this.setData({ loadingMore: true });
    api
      .userPosts(this.data.id, { page: page, pageSize: 20 })
      .then(function (data) {
        var list = (data.list || []).map(function (item) {
          return Object.assign({}, item, { timeText: format.time(item.createdAt) });
        });
        that.setData({
          posts: that.data.posts.concat(list),
          page: page,
          hasMore: list.length >= 20,
          loadingMore: false
        });
      })
      .catch(function () {
        that.setData({ loadingMore: false });
      });
  },

  follow: function () {
    var that = this;
    auth.ensureLogin().then(function () {
      api.userFollow(that.data.id, !that.data.user.isFollowing).then(function (user) {
        that.setData({ user: user });
      });
    });
  },

  openPost: function (event) {
    wx.navigateTo({ url: "/pages/post-detail/post-detail?id=" + event.currentTarget.dataset.id });
  },

  report: function () {
    var that = this;
    auth.ensureLogin().then(function () {
      wx.showModal({
        title: "举报成员",
        editable: true,
        placeholderText: "请填写举报原因",
        success: function (res) {
          if (!res.confirm) return;
          api
            .reportCreate({
              targetType: "USER",
              targetId: that.data.id,
              reason: String(res.content || "").slice(0, 40) || "违规成员",
              detail: "",
              images: []
            })
            .then(function () {
              wx.showToast({ title: "已提交举报", icon: "none" });
            });
        }
      });
    });
  }
});