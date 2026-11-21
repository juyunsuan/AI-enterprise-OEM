var api = require("../../utils/api");

Page({
  data: { keyword: "", posts: [], groups: [], loading: false, searched: false },

  input: function (event) {
    this.setData({ keyword: event.detail.value });
  },

  search: function () {
    var that = this;
    var keyword = String(this.data.keyword || "").trim();
    if (!keyword) return;
    this.setData({ loading: true, searched: true });
    api
      .search(keyword)
      .then(function (data) {
        that.setData({
          posts: (data.posts && data.posts.list) || [],
          groups: data.groups || [],
          loading: false
        });
      })
      .catch(function () {
        that.setData({ loading: false });
      });
  },

  openPost: function (event) {
    wx.navigateTo({ url: "/pages/post-detail/post-detail?id=" + event.currentTarget.dataset.id });
  },

  openGroup: function (event) {
    wx.navigateTo({ url: "/pages/group-detail/group-detail?id=" + event.currentTarget.dataset.id });
  }
});