/**
 * 形象克隆：上传一段真人视频训练数字形象。
 * 训练中（status 0）每 5 秒刷新一次，训练完成才能用于合成。
 */
const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const upload = require("../../utils/upload");

Page({
  data: {
    themeStyle: "",
    list: [],
    loading: true,
    busy: false,
    progress: 0,
    bodyMinSec: 5,
    bodyMaxSec: 60,
    hints: [],
    error: "",
  },

  onShow() {
    const app = getApp();
    this.setData({
      themeStyle: app.globalData.themeStyle,
      bodyMinSec: app.globalData.clone.bodyMinSec || 5,
      bodyMaxSec: app.globalData.clone.bodyMaxSec || 60,
    });
    app.ensureReady().then(() => {
      this.load();
      this.loadHints();
    });
  },

  loadHints() {
    return api
      .writeTopics("clone_hint")
      .then((rows) => {
        this.setData({
          hints: (rows || []).filter(
            (row) => row.content && row.category === "body",
          ),
        });
      })
      .catch(() => this.setData({ hints: [] }));
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
      .then(() => api.bodies())
      .then((rows) => {
        const list = (rows || []).map((row) => ({
          id: row.id,
          name: row.name,
          coverUrl: row.coverUrl,
          status: row.status,
          statusText: format.assetStatus(row.status),
          failReason: row.failReason,
          createdAt: format.dateTime(row.createdAt),
        }));
        this.setData({ list: list, loading: false, error: "" });
        if (list.some((row) => row.status === 0)) this.startPoll();
        else this.stopPoll();
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "加载失败",
        });
      });
  },

  startPoll() {
    if (this.timer) return;
    this.timer = setInterval(() => this.load(), 5000);
  },

  stopPoll() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  create() {
    if (this.data.busy) return;
    const min = this.data.bodyMinSec;
    const max = this.data.bodyMaxSec;
    upload
      .chooseVideo(max)
      .then((picked) => {
        const ready = picked.duration > 0 ? Promise.resolve(picked) : upload.videoDuration(picked.path).then((duration) => ({ path: picked.path, duration: duration }));
        return ready;
      })
      .then((picked) => {
        if (picked.duration > 0 && (picked.duration < min || picked.duration > max)) {
          throw new Error("形象视频时长需在 " + min + "-" + max + " 秒之间");
        }
        return this.askName().then((name) => ({ name: name, picked: picked }));
      })
      .then(({ name, picked }) => {
        this.setData({ busy: true, progress: 0 });
        return upload
          .upload(picked.path, (progress) => this.setData({ progress: progress }))
          .then((result) =>
            api.createBody({
              name: name,
              mediaUrl: result.url,
              durationSec: picked.duration || 0,
            }),
          );
      })
      .then(() => {
        this.setData({ busy: false, progress: 0 });
        wx.showToast({ title: "已提交训练" });
        this.load();
      })
      .catch((error) => {
        this.setData({ busy: false, progress: 0 });
        auth.showError(error);
      });
  },

  askName() {
    return new Promise((resolve) => {
      wx.showModal({
        title: "给形象起个名字",
        editable: true,
        placeholderText: "如：主播小雨",
        success(res) {
          if (res.confirm) resolve(String(res.content || "").trim());
          else resolve("");
        },
        fail() {
          resolve("");
        },
      });
    });
  },

  playSource(event) {
    const url = event.currentTarget.dataset.url;
    if (!url) return;
    wx.previewMedia({ sources: [{ url: url, type: "video" }] });
  },
});
