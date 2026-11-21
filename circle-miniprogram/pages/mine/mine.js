var api = require("../../utils/api");
var auth = require("../../utils/auth");
var format = require("../../utils/format");

Page({
  data: {
    viewer: null,
    community: null,
    myPosts: [],
    favorites: [],
    tab: "posts",
    loading: true
  },

  onShow: function () {
    var that = this;
    var app = getApp();
    this.setData({
      community: (app.globalData.bootstrap && app.globalData.bootstrap.community) || null
    });
    auth
      .ensureLogin()
      .then(function () {
        return Promise.all([api.userMe(), api.userPosts(0, { page: 1, pageSize: 20 }), api.userFavorites({ page: 1, pageSize: 20 })]);
      })
      .then(function (result) {
        that.setData({
          viewer: result[0],
          myPosts: (result[1].list || []).map(that.decorate),
          favorites: (result[2].list || []).map(that.decorate),
          loading: false
        });
      })
      .catch(function () {
        that.setData({ loading: false });
      });
  },

  decorate: function (item) {
    return Object.assign({}, item, { timeText: format.time(item.createdAt) });
  },

  switchTab: function (event) {
    this.setData({ tab: event.currentTarget.dataset.tab });
  },

  openPost: function (event) {
    wx.navigateTo({ url: "/pages/post-detail/post-detail?id=" + event.currentTarget.dataset.id });
  },

  openMessages: function () {
    wx.switchTab({ url: "/pages/messages/messages" });
  },

  openMyGroups: function () {
    wx.navigateTo({ url: "/pages/my-groups/my-groups" });
  },

  pickAvatar: function () {
    var that = this;
    var viewer = this.data.viewer || {};
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      success: function (res) {
        wx.showLoading({ title: "上传中" });
        api
          .upload(res.tempFiles[0].tempFilePath)
          .then(function (uploaded) {
            return api.profileSave({
              nickname: viewer.nickname || "",
              avatar: uploaded.url,
              bio: viewer.bio || "",
              gender: viewer.gender || 0
            });
          })
          .then(function (data) {
            wx.hideLoading();
            that.setData({ viewer: data });
            wx.showToast({ title: "头像已更新", icon: "none" });
          })
          .catch(function (error) {
            wx.hideLoading();
            wx.showToast({ title: (error && error.message) || "上传失败", icon: "none" });
          });
      }
    });
  },

  openService: function () {
    wx.navigateTo({ url: "/pages/service/service" });
  },

  editProfile: function () {
    var that = this;
    var viewer = this.data.viewer || {};
    wx.showModal({
      title: "修改昵称",
      editable: true,
      content: viewer.nickname || "",
      success: function (res) {
        if (!res.confirm) return;
        var nickname = String(res.content || "").trim();
        if (!nickname) return;
        wx.showModal({
          title: "修改简介",
          editable: true,
          content: viewer.bio || "",
          success: function (bioRes) {
            if (!bioRes.confirm) return;
            api
              .profileSave({
                nickname: nickname,
                avatar: viewer.avatar || "",
                bio: String(bioRes.content || "").trim(),
                gender: viewer.gender || 0
              })
              .then(function (data) {
                that.setData({ viewer: data });
                wx.showToast({ title: "已保存", icon: "none" });
              });
          }
        });
      }
    });
  },

  about: function () {
    var community = this.data.community || {};
    wx.showModal({
      title: "关于社区",
      content: community.about || community.intro || "还没有填写社区介绍",
      showCancel: false
    });
  },

  openUser: function () {
    if (!this.data.viewer) return;
    wx.navigateTo({ url: "/pages/user/user?id=" + this.data.viewer.id });
  }
});