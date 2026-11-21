var api = require("../../utils/api");
var auth = require("../../utils/auth");
var format = require("../../utils/format");
var subscribe = require("../../utils/subscribe");

Page({
  data: {
    id: 0,
    post: null,
    comments: [],
    content: "",
    replyTo: null,
    loading: true,
    viewerId: 0
  },

  onLoad: function (options) {
    var that = this;
    this.setData({ id: Number(options.id || 0) });
    this.load();
    auth
      .ensureLogin()
      .then(function (user) {
        that.setData({ viewerId: (user && user.id) || 0 });
      })
      .catch(function () {});
  },

  onShareAppMessage: function () {
    var post = this.data.post || {};
    return {
      title: format.excerpt(post.content, 40) || "圈子社区",
      path: "/pages/post-detail/post-detail?id=" + this.data.id
    };
  },

  load: function () {
    var that = this;
    this.setData({ loading: true });
    Promise.all([api.postDetail(this.data.id), api.comments(this.data.id)])
      .then(function (result) {
        var post = result[0];
        post.timeText = format.time(post.createdAt);
        var comments = (result[1] || []).map(function (item) {
          var copy = Object.assign({}, item, { timeText: format.time(item.createdAt) });
          copy.children = (item.children || []).map(function (child) {
            return Object.assign({}, child, { timeText: format.time(child.createdAt) });
          });
          return copy;
        });
        that.setData({ post: post, comments: comments, loading: false });
      })
      .catch(function (error) {
        that.setData({ loading: false });
        wx.showToast({ title: (error && error.message) || "加载失败", icon: "none" });
      });
  },

  deletePost: function () {
    var post = this.data.post || {};
    if (!post.id) return;
    wx.showModal({
      title: "删除这条帖子？",
      content: "删除后不可恢复。",
      success: function (res) {
        if (!res.confirm) return;
        api
          .postRemove(post.id)
          .then(function () {
            wx.showToast({ title: "已删除", icon: "none" });
            setTimeout(function () {
              wx.navigateBack();
            }, 600);
          })
          .catch(function (error) {
            wx.showToast({ title: (error && error.message) || "删除失败", icon: "none" });
          });
      }
    });
  },

  preview: function (event) {
    var current = event.currentTarget.dataset.src;    wx.previewImage({ current: current, urls: this.data.post.images });
  },

  toggleLike: function () {
    var that = this;
    subscribe.request(["circleLike"]);
    auth.ensureLogin().then(function () {
      api.postLike(that.data.post.id, !that.data.post.isLiked).then(function (data) {
        that.setData({
          "post.isLiked": data.isLiked,
          "post.likeCount": data.likeCount
        });
      });
    });
  },

  toggleFavorite: function () {
    var that = this;
    auth.ensureLogin().then(function () {
      api.postFavorite(that.data.post.id, !that.data.post.isFavorited).then(function (data) {
        that.setData({
          "post.isFavorited": data.isFavorited,
          "post.favoriteCount": data.favoriteCount
        });
      });
    });
  },

  input: function (event) {
    this.setData({ content: event.detail.value });
  },

  reply: function (event) {
    var dataset = event.currentTarget.dataset;
    this.setData({
      replyTo: {
        parentId: Number(dataset.parent || dataset.id),
        replyToUserId: Number(dataset.userid),
        name: dataset.name
      }
    });
  },

  cancelReply: function () {
    this.setData({ replyTo: null });
  },

  send: function () {
    var that = this;
    subscribe.request(["circleComment"]);
    var text = String(this.data.content || "").trim();
    if (!text) return;
    auth.ensureLogin().then(function () {
      api
        .commentCreate({
          postId: that.data.post.id,
          parentId: that.data.replyTo ? that.data.replyTo.parentId : 0,
          replyToUserId: that.data.replyTo ? that.data.replyTo.replyToUserId : 0,
          content: text
        })
        .then(function () {
          that.setData({ content: "", replyTo: null });
          that.load();
        })
        .catch(function (error) {
          wx.showToast({ title: (error && error.message) || "发送失败", icon: "none" });
        });
    });
  },

  likeComment: function (event) {
    var that = this;
    auth.ensureLogin().then(function () {
      api.commentLike(event.currentTarget.dataset.id, true).then(function () {
        that.load();
      });
    });
  },

  deleteComment: function (event) {
    var that = this;
    var id = Number(event.currentTarget.dataset.id);
    wx.showModal({
      title: "删除这条评论？",
      content: "一级评论会连同其回复一起删除。",
      success: function (res) {
        if (!res.confirm) return;
        api
          .commentRemove(id)
          .then(function () {
            that.load();
            wx.showToast({ title: "已删除", icon: "none" });
          })
          .catch(function (error) {
            wx.showToast({ title: (error && error.message) || "删除失败", icon: "none" });
          });
      }
    });
  },

  reportComment: function (event) {
    var that = this;
    var id = Number(event.currentTarget.dataset.id);
    wx.showModal({
      title: "举报评论",
      editable: true,
      placeholderText: "请填写举报原因",
      success: function (res) {
        if (!res.confirm) return;
        api
          .reportCreate({
            targetType: "COMMENT",
            targetId: id,
            reason: String(res.content || "").slice(0, 40) || "违规评论",
            detail: "",
            images: []
          })
          .then(function () {
            wx.showToast({ title: "已提交举报", icon: "none" });
          });
      }
    });
  },

  openUser: function (event) {
    wx.navigateTo({ url: "/pages/user/user?id=" + event.currentTarget.dataset.id });
  },

  openGroup: function (event) {
    wx.navigateTo({ url: "/pages/group-detail/group-detail?id=" + event.currentTarget.dataset.id });
  },

  report: function () {
    var that = this;
    auth.ensureLogin().then(function () {
      wx.showModal({
        title: "举报帖子",
        editable: true,
        placeholderText: "请填写举报原因",
        success: function (res) {
          if (!res.confirm) return;
          api
            .reportCreate({
              targetType: "POST",
              targetId: that.data.post.id,
              reason: String(res.content || "").slice(0, 40) || "违规内容",
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