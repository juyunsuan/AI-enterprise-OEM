var api = require("../../utils/api");
var auth = require("../../utils/auth");
var subscribe = require("../../utils/subscribe");

Page({
  data: { id: 0, activity: null, loading: true },

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

  onShareAppMessage: function () {
    var activity = this.data.activity || {};
    return {
      title: activity.title || "圈子活动",
      path: "/pages/activity-detail/activity-detail?id=" + this.data.id
    };
  },

  load: function () {
    var that = this;
    this.setData({ loading: true });
    return api
      .activityDetail(this.data.id)
      .then(function (data) {
        that.setData({ activity: data, loading: false });
      })
      .catch(function (error) {
        that.setData({ loading: false });
        wx.showToast({ title: (error && error.message) || "加载失败", icon: "none" });
      });
  },

  toggle: function () {
    var that = this;
    subscribe.request(["circleActivity"]);
    var activity = this.data.activity;
    if (!activity) return;
    auth.ensureLogin().then(function () {
      var action = activity.isJoined ? api.activityCancel : api.activityJoin;
      action(activity.id)
        .then(function (data) {
          that.setData({ activity: data });
          wx.showToast({ title: data.isJoined ? "已报名" : "已取消报名", icon: "none" });
        })
        .catch(function (error) {
          wx.showToast({ title: (error && error.message) || "操作失败", icon: "none" });
        });
    });
  }
});