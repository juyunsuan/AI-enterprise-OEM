var api = require("../../utils/api");
var auth = require("../../utils/auth");

Page({
  data: {
    groups: [],
    groupIndex: 0,
    content: "",
    images: [],
    topics: [],
    selectedTopics: [],
    submitting: false
  },

  onLoad: function (options) {
    var that = this;
    var wanted = Number(options.groupId || 0);
    Promise.all([api.groups({ page: 1, pageSize: 100 }), api.topics()])
      .then(function (result) {
        var groups = (result[0].list || []).filter(function (item) {
          return item.isJoined;
        });
        var index = 0;
        for (var i = 0; i < groups.length; i += 1) {
          if (groups[i].id === wanted) index = i;
        }
        var topics = (result[1] || []).map(function (item) {
          return Object.assign({}, item, { selected: false });
        });
        that.setData({ groups: groups, groupIndex: index, topics: topics });
      })
      .catch(function () {
        that.setData({ groups: [], topics: [] });
      });
  },

  input: function (event) {
    this.setData({ content: event.detail.value });
  },

  pickGroup: function (event) {
    this.setData({ groupIndex: Number(event.detail.value) });
  },

  pickImages: function () {
    var that = this;
    var remain = 9 - this.data.images.length;
    wx.chooseMedia({
      count: remain,
      mediaType: ["image"],
      success: function (res) {
        auth.ensureLogin().then(function () {
          wx.showLoading({ title: "上传中" });
          var tasks = res.tempFiles.map(function (file) {
            return api.upload(file.tempFilePath);
          });
          Promise.all(tasks)
            .then(function (uploaded) {
              wx.hideLoading();
              that.setData({
                images: that.data.images.concat(
                  uploaded.map(function (item) {
                    return item.url;
                  })
                )
              });
            })
            .catch(function (error) {
              wx.hideLoading();
              wx.showToast({ title: (error && error.message) || "上传失败", icon: "none" });
            });
        });
      }
    });
  },

  removeImage: function (event) {
    var index = Number(event.currentTarget.dataset.index);
    var images = this.data.images.slice();
    images.splice(index, 1);
    this.setData({ images: images });
  },

  toggleTopic: function (event) {
    var id = Number(event.currentTarget.dataset.id);
    var selected = this.data.selectedTopics.slice();
    var topics = this.data.topics.slice();
    var index = selected.indexOf(id);
    if (index >= 0) selected.splice(index, 1);
    else if (selected.length < 5) selected.push(id);
    else return;
    for (var i = 0; i < topics.length; i += 1) {
      if (topics[i].id === id) topics[i].selected = index < 0;
    }
    this.setData({ selectedTopics: selected, topics: topics });
  },

  submit: function () {
    var that = this;
    var group = this.data.groups[this.data.groupIndex];
    if (!group) {
      wx.showToast({ title: "请先选择圈子并加入", icon: "none" });
      return;
    }
    if (!String(this.data.content || "").trim()) {
      wx.showToast({ title: "请填写内容", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    auth.ensureLogin().then(function () {
      api
        .postCreate({
          groupId: group.id,
          content: that.data.content,
          images: that.data.images,
          topicIds: that.data.selectedTopics
        })
        .then(function () {
          wx.showToast({ title: "已发布", icon: "none" });
          setTimeout(function () {
            wx.navigateBack();
          }, 700);
        })
        .catch(function (error) {
          that.setData({ submitting: false });
          wx.showToast({ title: (error && error.message) || "发布失败", icon: "none" });
        });
    });
  }
});