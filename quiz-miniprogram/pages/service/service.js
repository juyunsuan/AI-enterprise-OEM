var api = require("../../utils/api");
var session = require("../../utils/session");
var format = require("../../utils/format");

var POLL_MS = 3000;

Page({
  data: {
    loading: true,
    error: "",
    notice: "",
    messages: [],
    input: "",
    sending: false,
    scrollTo: "",
  },

  onShow: function () {
    this.start();
  },

  onHide: function () {
    this.stop();
  },

  onUnload: function () {
    this.stop();
  },

  start: function () {
    if (this.timer) return;
    var site = getApp().site();
    if (!site.deskSiteKey) {
      this.setData({ loading: false, error: "管理员还没有绑定 AI 客服站点" });
      return;
    }
    var that = this;
    var profile = session.getProfile();
    api
      .serviceSession({
        siteKey: site.deskSiteKey,
        nickname: profile.nickname || "答题用户",
        contact: profile.company || profile.nickname || "",
        sourceUrl: "quiz-miniprogram",
      })
      .then(function (data) {
        if (!data || !data.token || !data.conversationId) {
          throw new Error("客服会话建立失败");
        }
        that.token = data.token;
        that.conversationId = data.conversationId;
        that.lastId = 0;
        that.setData({
          loading: false,
          error: "",
          notice: (data.settings && data.settings.welcomeText) || "",
          messages: [],
        });
        that.append((data.messages || []), true);
        that.timer = setInterval(function () {
          if (!that.data.sending) that.pull();
        }, POLL_MS);
      })
      .catch(function (error) {
        that.setData({
          loading: false,
          error: (error && error.message) || "客服暂不可用",
        });
      });
  },

  stop: function () {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  pull: function () {
    var that = this;
    if (!this.token || !this.conversationId) return;
    api
      .serviceMessages(this.conversationId, this.token, this.lastId)
      .then(function (data) {
        that.append((data && data.messages) || [], false);
      })
      .catch(function () {});
  },

  append: function (rows, reset) {
    if (!rows.length) return;
    var mapped = rows.map(function (row) {
      return {
        id: row.id,
        mine: row.senderType === "visitor",
        senderName: row.senderType === "visitor" ? "我" : row.senderName || "客服",
        content: row.content || "",
        contentType: row.contentType || "text",
        timeText: format.shortTime(row.createdAt),
      };
    });
    var messages = reset ? mapped : this.data.messages.concat(mapped);
    var last = messages[messages.length - 1];
    this.lastId = last ? last.id : this.lastId;
    this.setData({
      messages: messages,
      scrollTo: last ? "m" + last.id : "",
    });
  },

  onInput: function (event) {
    this.setData({ input: event.detail.value });
  },

  onSend: function () {
    var content = String(this.data.input || "").trim();
    if (!content || this.data.sending) return;
    var that = this;
    this.setData({ sending: true, input: "" });
    api
      .serviceSend(this.conversationId, {
        token: this.token,
        content: content,
        contentType: "text",
        clientMsgId: "quiz-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
      })
      .then(function (view) {
        that.setData({ sending: false });
        if (view && view.id) that.append([view], false);
      })
      .catch(function (error) {
        that.setData({ sending: false, input: content });
        wx.showToast({ title: (error && error.message) || "发送失败", icon: "none" });
      });
  },
});