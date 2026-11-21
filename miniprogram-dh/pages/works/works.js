/** 我的作品：合成中每 5 秒轮询一次，完成后可直接播放/保存/删除。 */
const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

Page({
  data: {
    themeStyle: "",
    list: [],
    loading: true,
    error: "",
  },

  onShow() {
    const app = getApp();
    this.setData({ themeStyle: app.globalData.themeStyle });
    app.ensureReady().then(() => this.load());
  },

  onHide() {
    this.stopPoll();
  },

  onUnload() {
    this.stopPoll();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    return auth
      .ensureMember()
      .then(() => api.myWorks())
      .then((rows) => {
        const list = (rows || []).map((row) => ({
          id: row.id,
          title: row.title || "数字人作品",
          coverUrl: row.coverUrl,
          resultVideoUrl: row.resultVideoUrl,
          audioUrl: row.audioUrl,
          status: row.status,
          stageText: format.stageText(row),
          pointCost: row.pointCost,
          isRefund: row.isRefund,
          createdAt: format.dateTime(row.createdAt),
        }));
        this.setData({ list: list, loading: false, error: "" });
        if (list.some((row) => row.status === 0)) this.startPoll();
        else this.stopPoll();
      })
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "加载失败" });
      });
  },

  startPoll() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const pending = this.data.list.filter((row) => row.status === 0);
      if (!pending.length) {
        this.stopPoll();
        return;
      }
      Promise.all(
        pending.map((row) =>
          api
            .workStatus(row.id)
            .then((status) => ({ id: row.id, status: status }))
            .catch(() => null),
        ),
      ).then((results) => {
        const changed = results.some(
          (item) => item && item.status && item.status.status !== 0,
        );
        if (changed) this.load();
      });
    }, 5000);
  },

  stopPoll() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  openWork(event) {
    const id = event.currentTarget.dataset.id;
    const status = Number(event.currentTarget.dataset.status);
    if (status !== 1) {
      wx.showToast({ title: "作品还未合成完成", icon: "none" });
      return;
    }
    wx.navigateTo({ url: "/pages/play/play?id=" + id });
  },

  removeWork(event) {
    const id = event.currentTarget.dataset.id;
    wx.showModal({
      title: "删除作品",
      content: "删除后不可恢复，已消耗的算力不退还",
      success: (res) => {
        if (!res.confirm) return;
        api
          .removeWork(id)
          .then(() => {
            wx.showToast({ title: "已删除" });
            this.load();
          })
          .catch(auth.showError);
      },
    });
  },

  goCreate() {
    wx.switchTab({ url: "/pages/create/create" });
  },
});
