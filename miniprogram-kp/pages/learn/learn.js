/**
 * 课时学习页：按课时形态渲染播放器/图文，节流上报学习进度，支持上一讲/下一讲与手动完课。
 */
const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const session = require("../../utils/session");

const REPORT_INTERVAL = 10; // 秒：播放中每 10 秒上报一次，减少写库压力

function clock(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const minute = Math.floor(total / 60);
  const second = total % 60;
  return (minute < 10 ? "0" + minute : minute) + ":" + (second < 10 ? "0" + second : second);
}

Page({
  data: {
    id: "",
    lessonId: "",
    themeStyle: "",
    themeColor: "#3370ff",
    course: {},
    lessons: [],
    index: -1,
    lesson: {},
    player: "rich",
    playUrl: "",
    cover: "",
    intro: "",
    progress: { positionSec: 0, durationSec: 0, percent: 0 },
    completed: false,
    chapterTitle: "",
    audio: { playing: false, timeText: "00:00", progress: 0 },
    hasPrev: false,
    hasNext: false,
    submitting: false,
    loading: true,
    error: "",
  },

  onLoad(query) {
    const app = getApp();
    this.setData({
      id: (query && query.id) || "",
      lessonId: (query && query.lessonId) || "",
      themeStyle: app.globalData.themeStyle,
      themeColor: app.globalData.themeColor,
    });
    this.load();
  },

  onUnload() {
    this.flushProgress();
    this.destroyAudio();
  },

  onHide() {
    this.flushProgress();
    if (this.audio) this.audio.pause();
  },

  load() {
    if (!this.data.id) {
      this.setData({ loading: false, error: "缺少课程参数" });
      return Promise.resolve();
    }
    return api
      .resource({ id: this.data.id })
      .then((data) => this.render(data || {}))
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "课程加载失败" });
      });
  },

  render(course) {
    const lessons = course.lessons || [];
    if (!lessons.length) {
      this.setData({ loading: false, error: "该课程还没有可学习的课时" });
      return;
    }
    let index = lessons.findIndex((item) => String(item.id) === String(this.data.lessonId));
    if (index < 0) index = 0;
    const lesson = lessons[index];
    if (!lesson.unlocked) {
      this.setData({ loading: false, error: "该课时未解锁，请先在课程详情页解锁" });
      return;
    }
    let player = "rich";
    if (lesson.mediaType === "video") player = "video";
    else if (lesson.mediaType === "live") player = "live";
    else if (lesson.mediaType === "audio") player = "audio";
    else if (lesson.mediaType === "image") player = "image";

    // 进度能续播就续播（音视频从头开始对新用户更常见，这里只回显进度不 seek）
    const chapter = (course.chapters || []).find(
      (item) => item.id === lesson.chapterId,
    );
    const durationSec = lesson.durationSec || 0;
    const positionSec = lesson.positionSec || 0;
    const percent = durationSec
      ? Math.min(100, Math.round((positionSec / durationSec) * 100))
      : 0;

    this.setData({
      course: {
        id: course.id,
        title: course.title,
        cover: course.cover,
        lessonCount: course.lessonCount || lessons.length,
      },
      lessons: lessons,
      index: index,
      lesson: Object.assign({}, lesson, {
        mediaLabel: format.mediaLabel(lesson.mediaType),
        durationText: durationSec ? clock(durationSec) : "",
      }),
      player: player,
      playUrl: lesson.url || "",
      cover: course.cover || "",
      intro: lesson.intro || "",
      progress: { positionSec: positionSec, durationSec: durationSec, percent: percent },
      completed: !!lesson.completed,
      chapterTitle: chapter ? chapter.title : "",
      hasPrev: index > 0,
      hasNext: index < lessons.length - 1,
      loading: false,
      error: "",
    });
    wx.setNavigationBarTitle({ title: lesson.title || course.title || "学习" });
    const app = getApp();
    this.setData({ themeColor: app.globalData.themeColor, themeStyle: app.globalData.themeStyle });
  },

  // ---------- 进度上报 ----------
  /** 播放中节流上报；force=true 用于暂停/退出/完课等关键节点。 */
  report(positionSec, durationSec, force) {
    const now = Date.now();
    if (!force && this.lastReportAt && now - this.lastReportAt < REPORT_INTERVAL * 1000) {
      this.pendingReport = { positionSec: positionSec, durationSec: durationSec };
      return Promise.resolve(null);
    }
    this.lastReportAt = now;
    this.pendingReport = null;
    return api
      .progress({
        resourceId: this.data.course.id,
        lessonId: this.data.lesson.id,
        positionSec: Math.round(positionSec || 0),
        durationSec: Math.round(durationSec || 0),
      })
      .then((data) => {
        if (data) {
          const duration = data.durationSec || this.data.progress.durationSec || 0;
          this.setData({
            "progress.positionSec": data.positionSec || 0,
            "progress.durationSec": duration,
            "progress.percent": duration
              ? Math.min(100, Math.round(((data.positionSec || 0) / duration) * 100))
              : this.data.progress.percent,
          });
        }
        return data;
      })
      .catch(() => null);
  },

  flushProgress() {
    if (this.pendingReport) {
      const pending = this.pendingReport;
      this.pendingReport = null;
      this.report(pending.positionSec, pending.durationSec, true);
    }
  },

  saveCurrentPosition() {
    if (this.data.player === "video") {
      // 视频位置由 timeupdate 维护在 this.videoPosition
      this.report(this.videoPosition || 0, this.videoDuration || this.data.progress.durationSec, true);
    } else if (this.data.player === "audio" && this.audio) {
      this.report(this.audio.currentTime || 0, this.audio.duration || this.data.progress.durationSec, true);
    }
  },

  // ---------- 视频 ----------
  onVideoTimeUpdate(event) {
    const detail = event.detail || {};
    this.videoPosition = detail.currentTime || 0;
    this.videoDuration = detail.duration || 0;
    this.report(this.videoPosition, this.videoDuration, false);
  },

  onVideoEnded() {
    this.markCompleted(true);
  },

  // ---------- 音频 ----------
  onAudioPlay() {
    if (!this.data.playUrl) return;
    if (!this.audio) this.createAudio();
    if (this.data.audio.playing) {
      this.audio.pause();
      this.saveCurrentPosition();
      return;
    }
    this.audio.play();
  },

  createAudio() {
    const audio = wx.createInnerAudioContext();
    audio.src = this.data.playUrl;
    if (this.data.progress.positionSec > 0) {
      audio.startTime = this.data.progress.positionSec;
    }
    audio.onPlay(() => this.setData({ "audio.playing": true }));
    audio.onPause(() => this.setData({ "audio.playing": false }));
    audio.onStop(() => this.setData({ "audio.playing": false }));
    audio.onEnded(() => {
      this.setData({ "audio.playing": false });
      this.markCompleted(true);
    });
    audio.onTimeUpdate(() => {
      const current = Math.floor(audio.currentTime || 0);
      if (current === this.audioTick) return;
      this.audioTick = current;
      this.setData({
        "audio.timeText": clock(current),
        "audio.progress": audio.duration ? Math.round((current / audio.duration) * 100) : 0,
      });
      this.report(audio.currentTime || 0, audio.duration || 0, false);
    });
    audio.onError(() => {
      this.setData({ "audio.playing": false });
      wx.showToast({ title: "音频播放失败，请稍后重试", icon: "none" });
    });
    this.audio = audio;
  },

  destroyAudio() {
    if (this.audio) {
      this.audio.destroy();
      this.audio = null;
    }
  },

  // ---------- 完课 / 切换课时 ----------
  markCompleted(silent) {
    if (this.data.submitting) return Promise.resolve();
    this.setData({ submitting: true });
    return auth
      .ensureMember()
      .then(() =>
        api.progress({
          resourceId: this.data.course.id,
          lessonId: this.data.lesson.id,
          positionSec: this.data.progress.durationSec || this.data.progress.positionSec,
          durationSec: this.data.progress.durationSec,
          completed: true,
        }),
      )
      .then((data) => {
        this.setData({
          completed: true,
          "progress.percent": 100,
          submitting: false,
        });
        if (!silent) wx.showToast({ title: "已标记学完", icon: "none" });
        return data;
      })
      .catch((error) => {
        this.setData({ submitting: false });
        auth.showError(error);
      });
  },

  onComplete() {
    this.saveCurrentPosition();
    this.markCompleted(false);
  },

  goPrev() {
    if (!this.data.hasPrev) return;
    this.switchLesson(this.data.lessons[this.data.index - 1]);
  },

  goNext() {
    if (!this.data.hasNext) return;
    this.switchLesson(this.data.lessons[this.data.index + 1]);
  },

  switchLesson(lesson) {
    if (!lesson) return;
    if (!lesson.unlocked) {
      wx.showToast({ title: "该课时未解锁", icon: "none" });
      return;
    }
    this.saveCurrentPosition();
    this.destroyAudio();
    this.lastReportAt = 0;
    wx.redirectTo({
      url: "/pages/learn/learn?id=" + this.data.course.id + "&lessonId=" + lesson.id,
    });
  },

  onShareAppMessage() {
    return {
      title: (this.data.course && this.data.course.title) || getApp().globalData.siteName,
      path: "/pages/details/details?id=" + this.data.id,
    };
  },

  /** 出错时给出可操作入口：正常情况下返回上一页（课程详情），直接进入则跳详情。 */
  goCourse() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.redirectTo({ url: "/pages/details/details?id=" + this.data.id });
  },
});
