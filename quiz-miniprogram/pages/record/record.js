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
        that.setData({
          banks: banks,
          bankTitles: banks.map(function (item) {
            return item.title;
          }),
          bankIndex: index,
          bankCode: banks.length ? banks[index].code : "",
          bankTitle: banks.length ? banks[index].title : "",
        });
        if (banks.length) that.loadRecords();
        else that.setData({ loading: false, error: "还没有已发布的题库" });
      })
      .catch(function (error) {
        that.setData({ loading: false, error: (error && error.message) || "记录加载失败" });
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
    });
    this.loadRecords();
  },

  loadRecords: function () {
    var that = this;
    var profile = session.getProfile();
    if (!this.data.bankCode) return;
    this.setData({ loading: true, error: "" });
    api
      .attempts(this.data.bankCode, profile.participantId, 50)
      .then(function (rows) {
        var list = (rows || []).map(function (item) {
          return {
            id: item.id,
            score: item.score,
            correct: item.correct,
            total: item.total,
            mode: item.mode,
            duration: format.duration(item.durationSec),
            time: format.shortTime(item.submittedAt),
          };
        });
        that.setData({ loading: false, list: list });
      })
      .catch(function (error) {
        that.setData({ loading: false, error: (error && error.message) || "记录加载失败" });
      });
  },
});