var api = require("../../utils/api");
var auth = require("../../utils/auth");

Page({
  data: {
    categories: [],
    categoryIndex: 0,
    name: "",
    cover: "",
    intro: "",
    rules: "",
    joinMode: "APPROVAL",
    submitting: false
  },

  onLoad: function () {
    var that = this;
    api.categories().then(function (list) {
      that.setData({ categories: list || [] });
    });
  },

  input: function (event) {
    var key = event.currentTarget.dataset.key;
    var value = event.detail.value;
    var data = {};
    data[key] = value;
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
        auth.ensureLogin().then(function () {
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
        });
      }
    });
  },

  submit: function () {
    var that = this;
    var category = this.data.categories[this.data.categoryIndex];
    if (!category) {
      wx.showToast({ title: "请选择分类", icon: "none" });
      return;
    }
    if (!this.data.name.trim()) {
      wx.showToast({ title: "请填写圈子名称", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    auth.ensureLogin().then(function () {
      api
        .groupApply({
          categoryId: category.id,
          name: that.data.name,
          cover: that.data.cover,
          intro: that.data.intro,
          rules: that.data.rules,
          joinMode: that.data.joinMode
        })
        .then(function () {
          wx.showToast({ title: "已提交，等待管理员审核", icon: "none" });
          setTimeout(function () {
            wx.navigateBack();
          }, 800);
        })
        .catch(function (error) {
          that.setData({ submitting: false });
          wx.showToast({ title: (error && error.message) || "提交失败", icon: "none" });
        });
    });
  }
});