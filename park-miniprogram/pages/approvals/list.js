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
      .then(() => api.myApprovals())
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

  act(event) {
    const id = Number(event.currentTarget.dataset.id);
    const action = event.currentTarget.dataset.action;
    api
      .approvalAct(id, action, "")
      .then(() => {
        wx.showToast({ title: "已处理", icon: "success" });
        this.load();
      })
      .catch((error) =>
        wx.showToast({
          title: (error && error.message) || "处理失败",
          icon: "none",
        }),
      );
  },
});
