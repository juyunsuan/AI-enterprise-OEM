var api = require("../../utils/api");
var session = require("../../utils/session");
var format = require("../../utils/format");

Page({
  data: {
    error: "",
    bankCode: "",
    bankTitle: "",
    mode: "exam",
    result: null,
    durationText: "",
    answers: [],
    aiLoading: false,
    aiText: "",
  },

  onLoad: function (options) {
    var stored = session.getLastResult();
    var result = stored && stored.result;
    if (!result) {
      this.setData({ error: "还没有答题结果，请先完成一次答题" });
      return;
    }
    var bankCode = (options && options.bankCode) || stored.bankCode || "";
    wx.setNavigationBarTitle({ title: stored.mode === "exam" ? "考试结果" : "练习结果" });
    var answers = (result.answers || []).map(function (item) {
      return {
        questionId: item.questionId,
        title: item.title,
        correct: item.correct,
        yourAnswer: format.answerText(item.yourAnswer) || "未作答",
        correctAnswer: format.answerText(item.correctAnswer),
        analysis: item.analysis,
      };
    });
    this.setData({
      bankCode: bankCode,
      bankTitle: stored.bankTitle || "",
      mode: stored.mode || "exam",
      result: result,
      durationText: format.duration(result.durationSec),
      answers: answers,
    });
    session.setLastBank(bankCode);
  },

  aiReview: function () {
    var result = this.data.result;
    if (!result) return;
    var profile = session.getProfile();
    var that = this;
    this.setData({ aiLoading: true, aiText: "" });
    api
      .analyze(this.data.bankCode, result.attemptId, profile.participantId)
      .then(function (data) {
        that.setData({
          aiLoading: false,
          aiText: (data && data.text) || "AI 暂时没有给出复盘",
        });
      })
      .catch(function (error) {
        that.setData({ aiLoading: false });
        wx.showToast({ title: (error && error.message) || "AI 复盘失败", icon: "none" });
      });
  },

  goWrong: function () {
    wx.navigateTo({
      url: "/pages/wrong/wrong?bankCode=" + encodeURIComponent(this.data.bankCode),
    });
  },

  again: function () {
    wx.redirectTo({
      url:
        "/pages/quiz/quiz?bankCode=" + encodeURIComponent(this.data.bankCode) +
        "&mode=" + this.data.mode +
        "&title=" + encodeURIComponent(this.data.bankTitle || ""),
    });
  },

  home: function () {
    wx.switchTab({ url: "/pages/index/index" });
  },

  onShareAppMessage: function () {
    var result = this.data.result || {};
    return {
      title: "我在" + (this.data.bankTitle || "答题") + "拿了 " + (result.score || 0) + " 分",
      path: "/pages/index/index",
    };
  },
});