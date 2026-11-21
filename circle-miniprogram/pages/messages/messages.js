var api = require("../../utils/api");
var auth = require("../../utils/auth");
var format = require("../../utils/format");

Page({
  data: { messages: [], loading: true },

  onShow: function () {
    var that = this;
    auth
      .ensureLogin()
      .then(function () {
        return api.messages();
      })
      .then(function (list) {
        that.setData({
          messages: (list || []).map(function (item) {
            return Object.assign({}, item, {
              timeText: format.time(item.createdAt),
              typeText: format.noticeType(item.type)
            });
          }),
          loading: false
        });
      })
      .catch(function () {
        that.setData({ loading: false });
      });
  },

  readAll: function () {
    var that = this;
    api.messagesRead().then(function () {
      wx.showToast({ title: "已全部已读", icon: "none" });
      that.onShow();
    });
  },

  open: function (event) {
    var item = this.data.messages[event.currentTarget.dataset.index];
    if (item && item.postId) {
      wx.navigateTo({ url: "/pages/post-detail/post-detail?id=" + item.postId });
    }
  }
});