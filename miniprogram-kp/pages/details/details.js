/**
 * 课程详情页：按 mediaType 决定播放器形态，按 accessMode 决定解锁文案与按钮；
 * 有课时目录时展示讲师、目录、学习进度与评价，点击课时进入独立学习页。
 */
const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const session = require("../../utils/session");

/** 秒数转 mm:ss，课程时长用。 */
function clock(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const minute = Math.floor(total / 60);
  const second = total % 60;
  return (minute < 10 ? "0" + minute : minute) + ":" + (second < 10 ? "0" + second : second);
}

Page({
  data: {
    id: "",
    themeStyle: "",
    themeColor: "#3370ff",
    info: {},
    lessons: [],
    lessonCount: 0,
    chapters: [],
    ungrouped: [],
    teacher: {},
    teacherInitial: "",
    payReady: false,
    paying: false,
    cashPriceText: "",
    rating: { avg: 0, count: 0 },
    reviews: [],
    myReview: null,
    related: [],
    progress: { completedCount: 0, lessonCount: 0, percent: 0, lastLessonId: 0 },
    reviewPopup: { visible: false, rating: 5, content: "", submitting: false },
    // 渲染用的派生状态，避免 WXML 里写复杂表达式。
    player: "", // video | audio | image | rich
    canPlay: false,
    intro: "",
    lockedIntro: false,
    action: "", // free | points | vip | vip-free | none
    actionText: "",
    isVipActive: false,
    favorited: false,
    audio: { playing: false, timeText: "00:00", progress: 0 },
    showPraise: false,
    showContact: false,
    showAd: false,
    adUnit: "",
    loading: true,
    submitting: false,
    error: "",
  },

  onLoad(query) {
    const app = getApp();
    this.setData({
      id: (query && query.id) || "",
      themeStyle: app.globalData.themeStyle,
      themeColor: app.globalData.themeColor,
    });
    this.load();
  },

  onShow() {
    // 从学习页/会员中心返回时进度或会员状态可能已变：只在这些场景重取详情，
    // 普通前后台切换不重取，避免浏览数虚增。
    if (this.needsRefresh && this.data.info && this.data.info.id) {
      this.needsRefresh = false;
      this.load();
    }
  },

  onUnload() {
    this.destroyAudio();
  },

  onHide() {
    // 离开页面就停掉音频：InnerAudioContext 不自动暂停，否则用户在别的页还能听到声音。
    if (this.audio) this.audio.pause();
  },

  load() {
    if (!this.data.id) {
      this.setData({ loading: false, error: "缺少内容参数" });
      return Promise.resolve();
    }
    return api
      .resource({ id: this.data.id })
      .then((data) => {
        this.render(data || {});
        this.loadRelated(data || {});
      })
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "内容加载失败" });
      });
  },

  /** 后端只给字段，页面把「能不能播、显示什么、按钮写什么」一次算清楚。 */
  render(info) {
    const decorated = format.decorateResource(info);
    const app = getApp();
    const member = session.getMember() || (app.globalData && app.globalData.member) || {};
    const isVipActive = !!member.vipActive;
    const unlocked = !!decorated.unlocked;
    const mediaType = decorated.mediaType;
    const lessons = (info.lessons || []).map((item) =>
      Object.assign({}, item, {
        mediaLabel: format.mediaLabel(item.mediaType),
        durationText: item.durationSec ? clock(item.durationSec) : "",
      }),
    );
    const teacher = info.teacher || {};
    const teacherInitial = teacher.name ? String(teacher.name).slice(0, 1) : "";
    const lessonById = {};
    lessons.forEach((item) => {
      lessonById[item.id] = item;
    });
    const decorateLesson = (item) =>
      lessonById[item.id] ||
      Object.assign({}, item, {
        mediaLabel: format.mediaLabel(item.mediaType),
        durationText: item.durationSec ? clock(item.durationSec) : "",
      });
    const chapters = (info.chapters || []).map((chapter) =>
      Object.assign({}, chapter, {
        lessons: (chapter.lessons || []).map(decorateLesson),
      }),
    );
    const ungrouped = (info.ungroupedLessons || []).map(decorateLesson);
    const appConfig = app.globalData.config || {};

    let player = "rich";
    if (mediaType === "video" || mediaType === "live") player = "video";
    else if (mediaType === "audio") player = "audio";
    else if (mediaType === "image") player = "image";

    let action = "none";
    let actionText = "";
    if (!unlocked) {
      if (decorated.accessMode === "points") {
        action = "points";
        actionText = lessons.length
          ? "解锁全部 " + lessons.length + " 讲 · " + (decorated.price || 0) + " 积分"
          : (decorated.price || 0) + " 积分解锁";
      } else if (decorated.accessMode === "vip") {
        if (isVipActive) {
          action = "vip-free";
          actionText = "会员免费获取";
        } else {
          action = "vip";
          actionText = "会员专享 · 去开通";
        }
      } else {
        action = "free";
        actionText = "免费获取";
      }
    }

    this.setData({
      info: decorated,
      lessons: lessons,
      lessonCount: info.lessonCount || lessons.length,
      chapters: chapters,
      ungrouped: ungrouped,
      teacher: teacher,
      teacherInitial: teacherInitial,
      payReady: !!appConfig.payReady,
      cashPriceText: info.cashPriceCents
        ? "¥" + (info.cashPriceCents / 100).toFixed(2)
        : "",
      rating: info.rating || { avg: 0, count: 0 },
      reviews: info.reviews || [],
      myReview: info.myReview || null,
      progress: info.progress || { completedCount: 0, lessonCount: 0, percent: 0, lastLessonId: 0 },
      player: player,
      // 有课时目录时播放交给学习页，详情页不再重复渲染播放器。
      canPlay: unlocked && !!decorated.url && !lessons.length,
      intro: decorated.intro || "",
      lockedIntro: !unlocked,
      action: action,
      actionText: actionText,
      isVipActive: isVipActive,
      favorited: !!decorated.favorited,
      loading: false,
      error: "",
      showPraise: app.toggle("praise"),
      showContact: app.toggle("contact"),
      showAd: app.toggle("adDetail"),
      adUnit: app.configValue("adUnitDetail", ""),
    });

    if (decorated.title) wx.setNavigationBarTitle({ title: decorated.title });
  },

  /** 解锁：free 一键获取、points 扣积分、vip 在有效期内免费，全部走同一个 /unlock。 */
  onAction() {
    const action = this.data.action;
    if (action === "vip") {
      this.needsRefresh = true;
      wx.navigateTo({ url: "/pages/member-vip/member-vip" });
      return;
    }
    if (action === "none" || this.data.submitting) return;

    this.setData({ submitting: true });
    auth
      .ensureMember()
      .then(() => api.unlock(this.data.id))
      .then((data) => {
        wx.showToast({ title: data && data.unlocked ? "已获取" : "操作完成", icon: "none" });
        // 解锁会改积分，顺带刷新本地会员快照，再重取详情拿到可播放的课时。
        return api
          .member()
          .then((member) => {
            if (member) session.setMember(member);
          })
          .catch(() => null)
          .then(() => this.load())
          .then(() => {
            this.setData({ submitting: false });
          });
      })
      .catch((error) => {
        // 积分不足等业务错误后端已给中文 message，直接展示即可。
        this.setData({ submitting: false });
        auth.showError(error);
      });
  },

  /** 点击课时：未解锁且非试看课时提示先解锁，其余进入学习页。 */
  openLesson(event) {
    const id = Number(event.currentTarget.dataset.id);
    const lesson = (this.data.lessons || []).filter((item) => item.id === id)[0];
    if (!lesson) return;
    if (!lesson.unlocked) {
      wx.showToast({ title: "解锁课程后即可学习全部课时", icon: "none" });
      return;
    }
    this.goLearn(lesson.id);
  },

  /** 继续学习：优先上次进度，其次第一节可学课时。 */
  continueLearning() {
    const lessons = this.data.lessons || [];
    const lastId = this.data.progress && this.data.progress.lastLessonId;
    let target = lastId ? lessons.filter((item) => item.id === lastId)[0] : null;
    if (!target) target = lessons.filter((item) => item.unlocked)[0];
    if (!target) {
      wx.showToast({ title: "请先解锁课程", icon: "none" });
      return;
    }
    this.goLearn(target.id);
  },

  goLearn(lessonId) {
    this.needsRefresh = true;
    wx.navigateTo({
      url: "/pages/learn/learn?id=" + this.data.id + "&lessonId=" + lessonId,
    });
  },

  /** 同分类相关课程（最多 3 门，排除当前课程）。 */
  loadRelated(info) {
    if (!info.categoryId) return Promise.resolve();
    return api
      .resources({ categoryId: info.categoryId, kind: "all", pageSize: 6 })
      .then((data) => {
        const list = format
          .decorateList((data && data.list) || [])
          .filter((item) => item.id !== info.id)
          .slice(0, 3);
        this.setData({ related: list });
      })
      .catch(() => null);
  },

  openRelated(event) {
    const id = event.currentTarget.dataset.id;
    if (id) {
      this.needsRefresh = false;
      wx.navigateTo({ url: "/pages/details/details?id=" + id });
    }
  },

  onFavorite() {
    auth
      .ensureMember()
      .then(() => api.favorite(this.data.id))
      .then((data) => {
        const favorited = !!(data && data.favorited);
        this.setData({ favorited: favorited });
        wx.showToast({ title: favorited ? "已收藏" : "已取消收藏", icon: "none" });
      })
      .catch((error) => auth.showError(error));
  },

  // ---------- 评价 ----------
  openReview() {
    if (!this.data.info.unlocked) {
      wx.showToast({ title: "解锁课程后可评价", icon: "none" });
      return;
    }
    const mine = this.data.myReview || {};
    this.setData({
      reviewPopup: {
        visible: true,
        rating: mine.rating || 5,
        content: mine.content || "",
        submitting: false,
      },
    });
  },

  closeReview() {
    this.setData({ "reviewPopup.visible": false });
  },

  noop() {},

  setRating(event) {
    this.setData({ "reviewPopup.rating": Number(event.currentTarget.dataset.value) || 5 });
  },

  onReviewInput(event) {
    this.setData({ "reviewPopup.content": event.detail.value || "" });
  },

  submitReview() {
    const popup = this.data.reviewPopup;
    if (!popup || popup.submitting) return;
    this.setData({ "reviewPopup.submitting": true });
    auth
      .ensureMember()
      .then(() =>
        api.saveReview({
          resourceId: this.data.info.id,
          rating: popup.rating,
          content: popup.content,
        }),
      )
      .then(() => {
        wx.showToast({ title: "评价已提交", icon: "none" });
        this.setData({ "reviewPopup.visible": false, "reviewPopup.submitting": false });
        return this.load();
      })
      .catch((error) => {
        this.setData({ "reviewPopup.submitting": false });
        auth.showError(error);
      });
  },

  // ---------- 音频：用 InnerAudioContext，页面只暴露播放/暂停与进度 ----------
  onAudioPlay() {
    if (!this.data.canPlay) return;
    if (!this.audio) this.createAudio();
    if (this.data.audio.playing) {
      this.audio.pause();
      return;
    }
    this.audio.play();
  },

  createAudio() {
    const audio = wx.createInnerAudioContext();
    audio.src = this.data.info.url;
    audio.onPlay(() => this.setData({ "audio.playing": true }));
    audio.onPause(() => this.setData({ "audio.playing": false }));
    audio.onStop(() => this.setData({ "audio.playing": false }));
    audio.onEnded(() => this.setData({ "audio.playing": false, "audio.progress": 0 }));
    audio.onTimeUpdate(() => {
      // 只在秒级变化时 setData，避免每秒十几次刷新拖慢页面。
      const current = Math.floor(audio.currentTime || 0);
      if (current === this.audioTick) return;
      this.audioTick = current;
      this.setData({
        "audio.timeText": clock(current),
        "audio.progress": audio.duration ? Math.round((current / audio.duration) * 100) : 0,
      });
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

  openCategory() {
    wx.switchTab({ url: "/pages/type/type" });
  },

  goVip() {
    this.needsRefresh = true;
    wx.navigateTo({ url: "/pages/member-vip/member-vip" });
  },

  openTeacher() {
    const teacher = this.data.teacher || {};
    if (!teacher.id) return;
    wx.navigateTo({ url: "/pages/teacher/teacher?id=" + teacher.id });
  },

  /** 微信支付直购课程：下单 → 调起支付 → 轮询查单 → 刷新解锁状态。 */
  onCashPay() {
    if (this.data.paying || !this.data.payReady) return;
    this.setData({ paying: true });
    auth
      .ensureMember()
      .then(() =>
        api.prepay({ kind: "course", resourceId: this.data.info.id }),
      )
      .then(
        (res) =>
          new Promise((resolve, reject) => {
            wx.requestPayment(
              Object.assign({}, res.payParams, {
                success: () => resolve(res.orderNo),
                fail: reject,
              }),
            );
          }),
      )
      .then((orderNo) => this.pollPay(orderNo))
      .then((paid) => {
        this.setData({ paying: false });
        if (!paid) {
          wx.showToast({ title: "支付结果确认中，请稍后刷新查看", icon: "none" });
          return;
        }
        wx.showToast({ title: "支付成功", icon: "success" });
        return api
          .member()
          .then((member) => {
            if (member) session.setMember(member);
          })
          .catch(() => null)
          .then(() => this.load());
      })
      .catch((error) => {
        this.setData({ paying: false });
        const message = String((error && error.errMsg) || "");
        if (message.indexOf("cancel") >= 0) {
          wx.showToast({ title: "已取消支付", icon: "none" });
          return;
        }
        auth.showError(error);
      });
  },

  pollPay(orderNo, tries) {
    const attempt = Number(tries) || 0;
    return api
      .payQuery(orderNo)
      .then((data) => {
        if (data && data.status === "paid") return true;
        if (attempt >= 5) return false;
        return new Promise((resolve) => setTimeout(resolve, 1500)).then(() =>
          this.pollPay(orderNo, attempt + 1),
        );
      })
      .catch(() => false);
  },

  onShareAppMessage() {
    return {
      title: this.data.info.title || getApp().globalData.siteName,
      path: "/pages/details/details?id=" + this.data.id,
    };
  },
});
