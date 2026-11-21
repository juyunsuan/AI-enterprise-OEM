const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

Page({
  data: {
    pick: false,
    loading: true,
    error: "",
    items: [],
  },

  onLoad(options) {
    this.setData({ pick: String((options && options.pick) || "") === "1" });
  },

  onShow() {
    this.load();
  },

  load() {
    this.setData({ loading: !this.data.items.length, error: "" });
    auth
      .ensureLogin()
      .then(() => api.addresses())
      .then((list) => {
        this.setData({
          loading: false,
          items: (list || []).map(function (item) {
            return Object.assign({}, item, {
              region: [item.province, item.city, item.district].filter(Boolean).join(" "),
              fullText: format.addressText(item),
            });
          }),
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "地址读取失败",
        });
      });
  },

  add() {
    wx.navigateTo({ url: "/pages/address/edit" });
  },

  edit(event) {
    const id = Number(event.currentTarget.dataset.id);
    wx.navigateTo({ url: "/pages/address/edit?id=" + id });
  },

  remove(event) {
    const id = Number(event.currentTarget.dataset.id);
    wx.showModal({
      title: "删除地址",
      content: "删除后不可恢复，确定删除这个地址吗？",
      success: (res) => {
        if (!res.confirm) return;
        api
          .removeAddress(id)
          .then(() => this.load())
          .catch((error) => wx.showToast({ title: (error && error.message) || "删除失败", icon: "none" }));
      },
    });
  },

  pick(event) {
    if (!this.data.pick) return;
    const id = Number(event.currentTarget.dataset.id);
    const address = this.data.items.filter(function (item) {
      return item.id === id;
    })[0];
    if (!address) return;
    getApp().globalData.pickedAddress = address;
    wx.navigateBack();
  },
});
