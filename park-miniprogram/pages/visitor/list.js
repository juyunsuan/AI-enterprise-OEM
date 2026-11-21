const api = require("../../utils/api");
const auth = require("../../utils/auth");

function fmt(value) {
  return String(value || "").replace("T", " ").slice(0, 16);
}

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
      .then(() => api.reservations())
      .then((list) => {
        const rows = (Array.isArray(list) ? list : []).map((item) => ({
          ...item,
          startText: fmt(item.startAt),
          endText: fmt(item.endAt).slice(11),
          passText: item.passCode || "",
          canCancel: item.status === "PENDING" || item.status === "APPROVED",
        }));
        this.setData({ loading: false, list: rows });
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

  copyPass(event) {
    const code = event.currentTarget.dataset.code;
    if (!code) return;
    wx.setClipboardData({ data: code });
  },

  cancel(event) {
    const id = Number(event.currentTarget.dataset.id);
    if (!id) return;
    wx.showModal({
      title: "取消预约",
      content: "确定取消这条预约吗？",
      success: (res) => {
        if (!res.confirm) return;
        api
          .cancelReservation(id)
          .then(() => {
            wx.showToast({ title: "已取消", icon: "success" });
            this.load();
          })
          .catch((error) =>
            wx.showToast({
              title: (error && error.message) || "取消失败",
              icon: "none",
            }),
          );
      },
    });
  },
});
