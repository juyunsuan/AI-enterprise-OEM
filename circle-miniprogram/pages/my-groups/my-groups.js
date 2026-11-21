var api = require("../../utils/api");

Page({
  data: { groups: [], loading: true },

  onShow: function () {
    var that = this;
    this.setData({ loading: true });
    api
      .groups({ page: 1, pageSize: 100 })
      .then(function (data) {
        var groups = (data.list || []).filter(function (item) {
          return item.isJoined;
        });
        that.setData({ groups: groups, loading: false });
      })
      .catch(function () {
        that.setData({ loading: false });
      });
  },

  openGroup: function (event) {
    wx.navigateTo({
      url: "/pages/group-detail/group-detail?id=" + event.currentTarget.dataset.id
    });
  },

  manage: function (event) {
    wx.navigateTo({
      url: "/pages/group-manage/group-manage?id=" + event.currentTarget.dataset.id
    });
  },

  applyGroup: function () {
    wx.navigateTo({ url: "/pages/group-apply/group-apply" });
  }
});