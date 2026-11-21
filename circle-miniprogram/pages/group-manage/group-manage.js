var api = require("../../utils/api");
var auth = require("../../utils/auth");

Page({
  data: {
    id: 0,
    group: null,
    categories: [],
    categoryIndex: 0,
    members: [],
    pending: [],
    name: "",
    cover: "",
    intro: "",
    rules: "",
    joinMode: "APPROVAL",
    loading: true
  },

  onLoad: function (options) {
    this.setData({ id: Number(options.id || 0) });
    this.load();
  },

  load: function () {
    var that = this;
    this.setData({ loading: true });
    Promise.all([
      api.groupDetail(this.data.id),
      api.categories(),
      api.groupMembers(this.data.id, "ACTIVE"),
      api.groupMembers(this.data.id, "PENDING")
    ])
      .then(function (result) {
        var group = result[0];
        var categories = result[1] || [];
        var index = 0;
        for (var i = 0; i < categories.length; i += 1) {
          if (categories[i].id === group.categoryId) index = i;
        }
        that.setData({
          group: group,
          categories: categories,
          categoryIndex: index,
          members: (result[2] && result[2].list) || [],
          pending: (result[3] && result[3].list) || [],
          name: group.name,
          cover: group.cover,
          intro: group.intro,
          rules: group.rules,
          joinMode: group.joinMode,
          loading: false
        });
      })
      .catch(function (error) {
        that.setData({ loading: false });
        wx.showToast({ title: (error && error.message) || "加载失败", icon: "none" });
      });
  },

  input: function (event) {
    var data = {};
    data[event.currentTarget.dataset.key] = event.detail.value;
    this.setData(data);
  },

  pickCategory: function (event) {
    this.setData({ categoryIndex: Number(event.detail.value) });
  },

  pickMode: function (event) {
    this.setData({ joinMode: event.detail.value });
  },

  pickCover: function () {
    var that = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      success: function (res) {
        wx.showLoading({ title: "上传中" });
        api
          .upload(res.tempFiles[0].tempFilePath)
          .then(function (data) {
            wx.hideLoading();
            that.setData({ cover: data.url });
          })
          .catch(function (error) {
            wx.hideLoading();
            wx.showToast({ title: (error && error.message) || "上传失败", icon: "none" });
          });
      }
    });
  },

  save: function () {
    var that = this;
    var category = this.data.categories[this.data.categoryIndex];
    if (!category) {
      wx.showToast({ title: "请选择分类", icon: "none" });
      return;
    }
    api
      .groupUpdate({
        id: this.data.id,
        categoryId: category.id,
        name: this.data.name,
        cover: this.data.cover,
        intro: this.data.intro,
        rules: this.data.rules,
        joinMode: this.data.joinMode
      })
      .then(function () {
        wx.showToast({ title: "已保存", icon: "none" });
        that.load();
      })
      .catch(function (error) {
        wx.showToast({ title: (error && error.message) || "保存失败", icon: "none" });
      });
  },

  memberAction: function (event) {
    var that = this;
    var dataset = event.currentTarget.dataset;
    var labels = {
      APPROVE: "通过加入申请",
      REMOVE: "移出圈子",
      MUTE: "禁言",
      BAN: "封禁"
    };
    wx.showModal({
      title: labels[dataset.action] + "？",
      success: function (res) {
        if (!res.confirm) return;
        api
          .groupMemberAction(that.data.id, Number(dataset.userid), dataset.action)
          .then(function () {
            wx.showToast({ title: "已处理", icon: "none" });
            that.load();
          })
          .catch(function (error) {
            wx.showToast({ title: (error && error.message) || "操作失败", icon: "none" });
          });
      }
    });
  }
});