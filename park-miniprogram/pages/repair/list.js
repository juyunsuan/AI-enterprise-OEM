const api = require("../../utils/api");
const auth = require("../../utils/auth");

Page({
  data: { loading: true, list: [] },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load();
  },

  load() {
    this.setData({ loading: true });
    auth
      .ensureLogin()
      .then(() => api.workOrders())
      .then((list) => {
        this.setData({ loading: false, list: Array.isArray(list) ? list : [] });
        wx.stopPullDownRefresh();
      })
      .catch((error) => {
        this.setData({ loading: false });
        wx.stopPullDownRefresh();
        wx.showToast({
          title: (error && error.message) || "读取失败",
          icon: "none",
        });
      });
  },

  goDetail(event) {
    const id = event.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/repair/detail?id=${id}` });
  },
});
