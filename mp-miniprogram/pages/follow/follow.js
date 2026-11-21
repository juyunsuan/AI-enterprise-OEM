const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

Page({
  data: {
    loading: true,
    error: "",
    shops: [],
    busyId: 0,
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(function () {
      wx.stopPullDownRefresh();
    });
  },

  load() {
    this.setData({ loading: !this.data.shops.length, error: "" });
    return auth
      .ensureLogin()
      .then(() => api.follows())
      .then((rows) => {
        const shops = (Array.isArray(rows) ? rows : []).map(function (item) {
          return Object.assign({}, item, {
            followedText: format.time(item.followedAt),
          });
        });
        this.setData({ loading: false, shops: shops });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "关注列表读取失败",
        });
      });
  },

  goShop(event) {
    const id = Number(event.currentTarget.dataset.id) || 0;
    if (id) wx.navigateTo({ url: "/pages/shop/shop?id=" + id });
  },

  unfollow(event) {
    const id = Number(event.currentTarget.dataset.id) || 0;
    if (!id || this.data.busyId) return;
    const that = this;
    wx.showModal({
      title: "取消关注",
      content: "取消后店铺上新不再出现在关注列表里。",
      confirmText: "取消关注",
      success(res) {
        if (!res.confirm) return;
        that.setData({ busyId: id });
        api
          .unfollow(id)
          .then(() => {
            const shops = that.data.shops.filter(function (item) {
              return Number(item.shopId) !== id;
            });
            that.setData({ shops: shops, busyId: 0 });
            wx.showToast({ title: "已取消关注", icon: "none" });
          })
          .catch((error) => {
            that.setData({ busyId: 0 });
            wx.showToast({
              title: (error && error.message) || "操作失败",
              icon: "none",
            });
          });
      },
    });
  },

  goShopping() {
    wx.switchTab({ url: "/pages/index/index" });
  },
});
