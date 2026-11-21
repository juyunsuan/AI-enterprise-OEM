var api = require("../../utils/api");
var auth = require("../../utils/auth");
var format = require("../../utils/format");

Page({
  data: {
    id: 0,
    group: null,
    posts: [],
    activities: [],
    loading: true
  },

  onLoad: function (options) {
    this.setData({ id: Number(options.id || 0) });
    this.load();
  },

  onShow: function () {
    if (this.data.group) this.load();
  },

  onShareAppMessage: function () {
    var group = this.data.group || {};
    return {
      title: group.name || "圈子",
      path: "/pages/group-detail/group-detail?id=" + this.data.id
    };
  },

  manage: function () {
    wx.navigateTo({ url: "/pages/group-manage/group-manage?id=" + this.data.id });
  },

  load: function () {
    var that = this;
    this.setData({ loading: true });
    Promise.all([
      api.groupDetail(this.data.id),
      api.posts({ groupId: this.data.id, page: 1, pageSize: 20, tab: "latest" }),
      api.activities({ groupId: this.data.id, page: 1, pageSize: 10 })
    ])
      .then(function (result) {
        var posts = (result[1].list || []).map(function (item) {
          return Object.assign({}, item, { timeText: format.time(item.createdAt) });
        });
        that.setData({
          group: result[0],
          posts: posts,
          activities: (result[2] && result[2].list) || [],
          loading: false
        });
      })
      .catch(function (error) {
        that.setData({ loading: false });
        wx.showToast({ title: (error && error.message) || "加载失败", icon: "none" });
      });
  },

  join: function () {
    var that = this;
    auth.ensureLogin().then(function () {
      api
        .groupJoin(that.data.id)
        .then(function (group) {
          that.setData({ group: group });
          wx.showToast({ title: that.data.group.isJoined ? "已加入" : "已提交申请", icon: "none" });
        })
        .catch(function (error) {
          wx.showToast({ title: (error && error.message) || "操作失败", icon: "none" });
        });
    });
  },

  leave: function () {
    var that = this;
    wx.showModal({
      title: "退出圈子？",
      content: "退出后仍可重新加入；已发布的帖子保留。",
      success: function (res) {
        if (!res.confirm) return;
        api.groupLeave(that.data.id).then(function () {
          that.load();
        });
      }
    });
  },

  follow: function () {
    var that = this;
    auth.ensureLogin().then(function () {
      api.groupFollow(that.data.id, !that.data.group.isFollowing).then(function (group) {
        that.setData({ group: group });
      });
    });
  },

  createPost: function () {
    var id = this.data.id;
    auth.ensureLogin().then(function () {
      wx.navigateTo({ url: "/pages/post-create/post-create?groupId=" + id });
    });
  },

  openActivity: function (event) {
    wx.navigateTo({ url: "/pages/activity-detail/activity-detail?id=" + event.currentTarget.dataset.id });
  },

  openPost: function (event) {
    wx.navigateTo({ url: "/pages/post-detail/post-detail?id=" + event.currentTarget.dataset.id });
  }
});