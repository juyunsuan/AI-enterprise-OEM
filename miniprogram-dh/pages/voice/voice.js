/** 声音克隆：上传一段朗读音频训练音色，完成后可在合成时选择。 */
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
    voiceMinSec: 10,
    voiceMaxSec: 60,
    examples: [],
    hints: [],
    error: "",
  },

  onShow() {
    const app = getApp();
    this.setData({
      themeStyle: app.globalData.themeStyle,
      voiceMinSec: app.globalData.clone.voiceMinSec || 10,
      voiceMaxSec: app.globalData.clone.voiceMaxSec || 60,
    });
    app.ensureReady().then(() => {
      this.load();
      this.loadHints();
    });
  },

  loadHints() {
    return Promise.all([
      api.writeTopics("voice_example"),
      api.writeTopics("clone_hint"),
    ])
      .then(([examples, hints]) => {
        this.setData({
          examples: (examples || []).filter((row) => row.content),
          hints: (hints || []).filter(
            (row) => row.content && row.category !== "body",
          ),
        });
      })
      .catch(() => this.setData({ examples: [], hints: [] }));
  },

  copyExample(event) {
    const content = event.currentTarget.dataset.content;
    if (!content) return;
    wx.setClipboardData({ data: content });
  },

  onHide() {
    this.stopPoll();
  },

  onUnload() {
    this.stopPoll();
    this.stopDemo();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    return auth
      .ensureMember()
      .then(() => api.myVoices())
      .then((rows) => {
        const list = (rows || []).map((row) => ({
          id: row.id,
          name: row.name,
          status: row.status,
          statusText: format.assetStatus(row.status),
          failReason: row.failReason,
          demoAudioUrl: row.demoAudioUrl,
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
    const min = this.data.voiceMinSec;
    const max = this.data.voiceMaxSec;
    upload
      .chooseAudio()
      .then((picked) => upload.audioDuration(picked.path).then((duration) => ({ path: picked.path, duration: duration })))
      .then((picked) => {
        if (picked.duration > 0 && (picked.duration < min || picked.duration > max)) {
          throw new Error("声音样本时长需在 " + min + "-" + max + " 秒之间");
        }
        return this.askName().then((name) => ({ name: name, picked: picked }));
      })
      .then(({ name, picked }) => {
        this.setData({ busy: true, progress: 0 });
        return upload
          .upload(picked.path, (progress) => this.setData({ progress: progress }))
          .then((result) =>
            api.createVoice({
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
        title: "给声音起个名字",
        editable: true,
        placeholderText: "如：温柔女声",
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

  playDemo(event) {
    const url = event.currentTarget.dataset.url;
    if (!url) {
      wx.showToast({ title: "暂无试听音频", icon: "none" });
      return;
    }
    this.stopDemo();
    this.audio = wx.createInnerAudioContext();
    this.audio.src = url;
    this.audio.play();
  },

  stopDemo() {
    if (this.audio) {
      this.audio.destroy();
      this.audio = null;
    }
  },
});
