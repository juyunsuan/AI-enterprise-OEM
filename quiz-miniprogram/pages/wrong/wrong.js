var api = require("../../utils/api");
var session = require("../../utils/session");
var format = require("../../utils/format");

Page({
  data: {
    loading: true,
    error: "",
    banks: [],
    bankTitles: [],
    bankIndex: 0,
    bankCode: "",
    bankTitle: "",
    list: [],
  },

  onLoad: function (options) {
    this.preferred = String((options && options.bankCode) || session.getLastBank() || "");
    this.loadBanks();
  },

  loadBanks: function () {
    var that = this;
    getApp()
      .ensureReady()
      .then(function (data) {
        var source = data || getApp().bootstrap();
        var banks = (source && source.banks) || [];
        var index = 0;
        for (var i = 0; i < banks.length; i += 1) {
          if (banks[i].code === that.preferred) index = i;
        }
        var titles = banks.map(function (item) {
          return item.title;
        });
        that.setData({
          banks: banks,
          bankTitles: titles,
          bankIndex: index,
          bankCode: banks.length ? banks[index].code : "",
          bankTitle: banks.length ? banks[index].title : "",
        });
        if (banks.length) that.loadWrong();
        else that.setData({ loading: false, error: "还没有已发布的题库" });
      })
      .catch(function (error) {
        that.setData({ loading: false, error: (error && error.message) || "题库加载失败" });
      });
  },

  onBankChange: function (event) {
    var index = Number(event.detail.value) || 0;
    var bank = this.data.banks[index];
    if (!bank) return;
    this.setData({
      bankIndex: index,
      bankCode: bank.code,
      bankTitle: bank.title,
      loading: true,
      list: [],
    });
    this.loadWrong();
  },

  loadWrong: function () {
    var that = this;
    var profile = session.getProfile();
    if (!this.data.bankCode) return;
    api
      .wrong(this.data.bankCode, profile.participantId)
      .then(function (rows) {
        var list = (rows || []).map(function (item) {
          return {
            id: item.id,
            typeLabel: item.type === "multiple" ? "多选" : item.type === "judge" ? "判断" : "单选",
            title: item.title,
            category: item.category,
            options: item.options || [],
            answer: format.answerText(item.answer),
            analysis: item.analysis,
          };
        });
        that.setData({ loading: false, list: list, error: "" });
      })
      .catch(function (error) {
        that.setData({ loading: false, error: (error && error.message) || "错题加载失败" });
      });
  },

  goRetry: function () {
    if (!this.data.bankCode) return;
    wx.navigateTo({
      url:
        "/pages/quiz/quiz?bankCode=" + this.data.bankCode +
        "&mode=practice&title=" + encodeURIComponent(this.data.bankTitle),
    });
  },

  goExam: function () {
    if (!this.data.bankCode) return;
    wx.navigateTo({
      url:
        "/pages/quiz/quiz?bankCode=" + this.data.bankCode +
        "&mode=exam&title=" + encodeURIComponent(this.data.bankTitle),
    });
  },
});