var api = require("../../utils/api");
var session = require("../../utils/session");
var format = require("../../utils/format");

var TYPE_LABEL = { single: "单选", multiple: "多选", judge: "判断" };
var EXAM_STATE_PREFIX = "quiz_exam_state_";

Page({
  data: {
    loading: true,
    error: "",
    bankCode: "",
    mode: "practice",
    title: "",
    bank: { settings: {} },
    questions: [],
    total: 0,
    index: 0,
    question: null,
    options: [],
    answerText: "",
    checked: false,
    checkResult: null,
    multi: false,
    timeLeft: 0,
    timeText: "",
    showSheet: false,
    sheet: [],
    answeredCount: 0,
    progressPercent: 0,
    primaryLabel: "下一题",
    isLast: false,
    canPrev: false,
    submitting: false,
    recite: false,
    aiLoading: false,
    aiText: "",
  },

  onLoad: function (options) {
    var bankCode = String((options && options.bankCode) || "");
    var mode = options && options.mode === "exam" ? "exam" : "practice";
    var title = "";
    try {
      title = decodeURIComponent(String((options && options.title) || ""));
    } catch (error) {
      title = "";
    }
    this.bankCode = bankCode;
    this.mode = mode;
    this.answers = {};
    this.checks = {};
    this.submitted = false;
    this.setData({ bankCode: bankCode, mode: mode, title: title });
    wx.setNavigationBarTitle({ title: title || (mode === "exam" ? "答题" : "练习") });
    if (mode === "exam") {
      var saved = this.readExamState();
      if (saved) {
        var that = this;
        var savedIndex = Number(saved.index) || 0;
        wx.showModal({
          title: "上次考试未完成",
          content: "上次做到第 " + (savedIndex + 1) + " 题，继续答题还是重新开始？",
          confirmText: "继续答题",
          cancelText: "重新开始",
          success: function (res) {
            if (res.confirm) that.restoreExam(saved);
            else that.load();
          },
        });
        return;
      }
    }
    this.load();
  },

  examStateKey: function () {
    return EXAM_STATE_PREFIX + this.bankCode;
  },

  readExamState: function () {
    try {
      var state = wx.getStorageSync(this.examStateKey());
      if (!state || !state.questions || !state.questions.length) return null;
      if (Number(state.timeLeft) <= 0) {
        wx.removeStorageSync(this.examStateKey());
        return null;
      }
      return state;
    } catch (error) {
      return null;
    }
  },

  persistExam: function () {
    if (this.mode !== "exam" || this.submitted || this.data.loading) return;
    if (!this.data.questions.length) return;
    try {
      wx.setStorageSync(this.examStateKey(), {
        bankCode: this.bankCode,
        title: this.data.title,
        bank: this.data.bank,
        questions: this.data.questions,
        answers: this.answers || {},
        index: this.data.index,
        timeLeft: this.data.timeLeft,
      });
    } catch (error) {
      /* 本地存储失败不影响本次考试 */
    }
  },

  clearExamState: function () {
    try {
      wx.removeStorageSync(this.examStateKey());
    } catch (error) {
      /* ignore */
    }
  },

  restoreExam: function (state) {
    this.answers = state.answers || {};
    this.checks = {};
    this.submitted = false;
    this.startedAt = Date.now();
    var questions = state.questions || [];
    this.setData(
      {
        loading: false,
        error: "",
        bank: state.bank || { settings: {} },
        title: state.title || this.data.title,
        questions: questions,
        total: questions.length,
        index: Math.min(Number(state.index) || 0, questions.length - 1),
        timeLeft: Number(state.timeLeft) || 0,
        timeText: format.clock(Number(state.timeLeft) || 0),
      },
      () => {
        this.render();
        this.startTimer();
      },
    );
  },

  onUnload: function () {
    if (this.data.mode === "exam") this.persistExam();
    this.stopTimer();
  },

  onHide: function () {
    if (this.data.mode === "exam") {
      this.persistExam();
      if (this.timer) this.hideAt = Date.now();
    }
  },

  onShow: function () {
    if (this.data.mode === "exam" && this.hideAt && this.timer) {
      var paused = Math.round((Date.now() - this.hideAt) / 1000);
      this.hideAt = 0;
      var left = Math.max(0, this.data.timeLeft - paused);
      this.setData({ timeLeft: left, timeText: format.clock(left) });
      if (left <= 0) this.forceSubmit();
    }
  },

  load: function () {
    var that = this;
    if (this.mode === "exam") this.clearExamState();
    this.setData({ loading: true, error: "" });
    api
      .start(this.bankCode, this.mode, session.getProfile().participantId)
      .then(function (data) {
        var questions = (data && data.questions) || [];
        if (!questions.length) throw new Error("题库还没有题目");
        that.setData({
          loading: false,
          bank: (data && data.bank) || {},
          questions: questions,
          total: questions.length,
          timeLeft: ((data && data.bank && data.bank.durationSec) || 600),
          timeText: format.clock((data && data.bank && data.bank.durationSec) || 600),
        });
        that.startedAt = Date.now();
        that.render();
        if (that.mode === "exam") that.startTimer();
      })
      .catch(function (error) {
        that.setData({
          loading: false,
          error: (error && error.message) || "题目加载失败",
        });
      });
  },

  startTimer: function () {
    var that = this;
    this.stopTimer();
    this.timer = setInterval(function () {
      var left = Math.max(0, that.data.timeLeft - 1);
      that.setData({ timeLeft: left, timeText: format.clock(left) });
      if (left <= 0) {
        that.stopTimer();
        wx.showModal({
          title: "时间到了",
          content: "现在交卷查看成绩。",
          showCancel: false,
          success: function () {
            that.submit(true);
          },
        });
      }
    }, 1000);
  },

  stopTimer: function () {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  render: function () {
    var questions = this.data.questions || [];
    var index = Math.min(this.data.index, Math.max(0, questions.length - 1));
    var q = questions[index];
    if (!q) return;
    var answer = this.answers[q.id] || "";
    var result = this.checks[q.id] || null;
    var checked = !!result;
    var options = (q.options || []).map(function (item) {
      var state = "";
      if (checked) {
        if (String(result.correctAnswer || "").indexOf(item.key) >= 0) state = "correct";
        else if (answer.indexOf(item.key) >= 0) state = "wrong";
      } else if (answer.indexOf(item.key) >= 0) {
        state = "selected";
      }
      return { key: item.key, label: item.label, state: state };
    });
    var answers = this.answers;
    var sheet = questions.map(function (item, i) {
      return {
        no: i + 1,
        index: i,
        answered: !!answers[item.id],
        current: i === index,
      };
    });
    var answeredCount = questions.filter(function (item) {
      return !!answers[item.id];
    }).length;
    var isLast = index >= questions.length - 1;
    var primaryLabel = "下一题";
    if (this.mode === "exam") {
      primaryLabel = isLast ? "交卷" : "下一题";
    } else if (!checked) {
      primaryLabel = this.data.recite ? "看答案" : "提交答案";
    } else {
      primaryLabel = isLast ? "完成练习" : "下一题";
    }
    this.setData({
      index: index,
      question: {
        id: q.id,
        type: q.type,
        typeLabel: TYPE_LABEL[q.type] || "单选",
        title: q.title,
        imageUrl: q.imageUrl,
        category: q.category,
      },
      options: options,
      answerText: format.answerText(answer),
      checked: checked,
      checkResult: result
        ? {
            correct: !!result.correct,
            recite: this.data.recite,
            correctAnswer: format.answerText(result.correctAnswer),
            analysis: result.analysis || "",
          }
        : null,
      multi: q.type === "multiple",
      sheet: sheet,
      answeredCount: answeredCount,
      progressPercent: Math.round(((index + 1) / questions.length) * 100),
      primaryLabel: primaryLabel,
      isLast: isLast,
      canPrev: index > 0,
    });
  },

  onOption: function (event) {
    var key = String(event.currentTarget.dataset.key || "");
    var q = this.data.questions[this.data.index];
    if (!q || this.checks[q.id]) return;
    var answer = this.answers[q.id] || "";
    if (q.type === "multiple") {
      var letters = answer.split("");
      var at = letters.indexOf(key);
      if (at >= 0) letters.splice(at, 1);
      else letters.push(key);
      letters.sort();
      answer = letters.join("");
    } else {
      answer = key;
    }
    this.answers[q.id] = answer;
    this.render();
    this.persistExam();
    if (this.mode === "practice" && !this.data.recite && q.type !== "multiple" && answer) {
      this.check();
    }
  },

  onPrimary: function () {
    var q = this.data.questions[this.data.index];
    if (!q) return;
    if (this.mode === "practice" && !this.checks[q.id]) {
      this.check();
      return;
    }
    this.next();
  },

  check: function () {
    var q = this.data.questions[this.data.index];
    if (!q) return;
    var answer = this.answers[q.id] || "";
    if (!answer && !this.data.recite) {
      wx.showToast({ title: "先选一个答案", icon: "none" });
      return;
    }
    var that = this;
    api
      .check(this.bankCode, q.id, answer, session.getProfile().participantId)
      .then(function (data) {
        that.checks[q.id] = data || { correct: false, correctAnswer: "", analysis: "" };
        that.render();
      })
      .catch(function (error) {
        wx.showToast({ title: (error && error.message) || "判分失败", icon: "none" });
      });
  },

  next: function () {
    if (this.data.isLast) {
      this.confirmSubmit();
      return;
    }
    var that = this;
    this.setData({ index: this.data.index + 1, showSheet: false, aiText: "" }, function () {
      that.render();
      that.persistExam();
    });
  },

  prev: function () {
    if (this.data.index <= 0) return;
    var that = this;
    this.setData({ index: this.data.index - 1, showSheet: false, aiText: "" }, function () {
      that.render();
      that.persistExam();
    });
  },

  toggleRecite: function () {
    if (this.mode !== "practice") return;
    var that = this;
    this.setData({ recite: !this.data.recite, aiText: "" }, function () {
      that.render();
    });
  },

  toggleSheet: function () {
    this.setData({ showSheet: !this.data.showSheet });
  },

  jumpTo: function (event) {
    var index = Number(event.currentTarget.dataset.index);
    if (isNaN(index)) return;
    var that = this;
    this.setData({ index: index, showSheet: false, aiText: "" }, function () {
      that.render();
      that.persistExam();
    });
  },

  confirmSubmit: function () {
    var unanswered = this.data.total - this.data.answeredCount;
    var that = this;
    if (unanswered > 0) {
      wx.showModal({
        title: "还有未作答的题",
        content: "还有 " + unanswered + " 题没有作答，未作答按错误计分。确定交卷吗？",
        confirmText: "交卷",
        success: function (res) {
          if (res.confirm) that.submit(false);
        },
      });
      return;
    }
    wx.showModal({
      title: this.mode === "exam" ? "交卷" : "完成练习",
      content: "确定提交本次答题吗？",
      confirmText: "提交",
      success: function (res) {
        if (res.confirm) that.submit(false);
      },
    });
  },

  forceSubmit: function () {
    this.submit(true);
  },

  submit: function (auto) {
    if (this.data.submitting) return;
    var that = this;
    var profile = session.getProfile();
    var questions = this.data.questions || [];
    var answers = questions.map(function (item) {
      return { questionId: item.id, answer: this.answers[item.id] || "" };
    }, this);
    var durationSec = Math.max(1, Math.round((Date.now() - (this.startedAt || Date.now())) / 1000));
    this.stopTimer();
    this.setData({ submitting: true });
    api
      .submit(this.bankCode, {
        participantId: profile.participantId,
        nickname: profile.nickname,
        company: profile.company,
        department: profile.department,
        mode: this.mode,
        durationSec: durationSec,
        answers: answers,
      })
      .then(function (result) {
        that.submitted = true;
        that.clearExamState();
        session.setLastResult({
          bankCode: that.bankCode,
          bankTitle: that.data.bank.title || that.data.title,
          mode: that.mode,
          result: result,
        });
        wx.redirectTo({
          url: "/pages/result/result?bankCode=" + encodeURIComponent(that.bankCode),
        });
      })
      .catch(function (error) {
        that.setData({ submitting: false });
        wx.showToast({
          title: (error && error.message) || "交卷失败，请重试",
          icon: "none",
        });
      });
  },

  noop: function () {},

  explain: function () {
    var q = this.data.questions[this.data.index];
    if (!q) return;
    var that = this;
    var answer = this.answers[q.id] || "";
    this.setData({ aiLoading: true, aiText: "" });
    api
      .explain(this.bankCode, q.id, answer, session.getProfile().participantId)
      .then(function (data) {
        that.setData({
          aiLoading: false,
          aiText: (data && data.text) || "AI 暂时没有给出解释",
        });
      })
      .catch(function (error) {
        that.setData({ aiLoading: false });
        wx.showToast({ title: (error && error.message) || "AI 解析失败", icon: "none" });
      });
  },
});
