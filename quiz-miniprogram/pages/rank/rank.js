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

  onShow: function () {
    this.loadBanks();
  },

  onPullDownRefresh: function () {
    var that = this;
    Promise.resolve(this.loadBanks()).then(function () {
      wx.stopPullDownRefresh();
      that.setData({ loading: false });
    });
  },

  loadBanks: function () {
    var that = this;
    return getApp()
      .ensureReady()
      .then(function (data) {
        var source = data || getApp().bootstrap();
        var banks = (source && source.banks) || [];
        var preferred = that.data.bankCode || session.getLastBank();
        var index = 0;
        for (var i = 0; i < banks.length; i += 1) {
          if (banks[i].code === preferred) index = i;
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
        if (banks.length) that.loadRank();
        else that.setData({ loading: false, error: "还没有已发布的题库" });
      })
      .catch(function (error) {
        that.setData({ loading: false, error: (error && error.message) || "排行加载失败" });
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
    this.loadRank();
  },

  loadRank: function () {
    var that = this;
    if (!this.data.bankCode) return;
    this.setData({ loading: true, error: "" });
    api
      .rank(this.data.bankCode, 20)
      .then(function (rows) {
        var list = (rows || []).map(function (item) {
          return {
            rank: item.rank,
            nickname: item.nickname || "匿名选手",
            bestScore: item.bestScore,
            duration: format.duration(item.bestDurationSec),
            attempts: item.attempts,
          };
        });
        that.setData({ loading: false, list: list });
      })
      .catch(function (error) {
        that.setData({ loading: false, error: (error && error.message) || "排行加载失败" });
      });
  },
});