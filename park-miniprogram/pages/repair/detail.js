const api = require("../../utils/api");
const auth = require("../../utils/auth");

Page({
  data: {
    id: 0,
    detail: null,
    stars: [1, 2, 3, 4, 5],
    ratingComment: "",
    loading: true,
  },

  onLoad(options) {
    this.setData({ id: Number(options.id || 0) });
    this.load();
  },

  load() {
    if (!this.data.id) return;
    this.setData({ loading: true });
    auth
      .ensureLogin()
      .then(() => api.workOrderDetail(this.data.id))
      .then((detail) => {
        this.setData({ loading: false, detail });
      })
      .catch((error) => {
        this.setData({ loading: false });
        wx.showToast({
          title: (error && error.message) || "读取失败",
          icon: "none",
        });
      });
  },

  onComment(event) {
    this.setData({ ratingComment: event.detail.value });
  },

  rate(event) {
    const rating = Number(event.currentTarget.dataset.rating);
    api
      .rateWorkOrder(this.data.id, rating, this.data.ratingComment)
      .then(() => {
        wx.showToast({ title: "评价成功", icon: "success" });
        this.load();
      })
      .catch((error) =>
        wx.showToast({
          title: (error && error.message) || "评价失败",
          icon: "none",
        }),
      );
  },
});
