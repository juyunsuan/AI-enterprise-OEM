const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const request = require("../../utils/request");

const POLL_MS = 3000;

Page({
  data: {
    loading: true,
    error: "",
    notice: "",
    messages: [],
    input: "",
    sending: false,
    scrollTo: "",
    consulting: false,
  },

  onLoad(options) {
    this.consultId = Number(options && options.id) || 0;
    this.lastId = 0;
  },

  onShow() {
    this.start();
  },

  onHide() {
    this.stop();
  },

  onUnload() {
    this.stop();
  },

  async start() {
    if (this.timer) return;
    try {
      await auth.requireLogin();
      const session = (await api.consultSession(this.consultId)) || {};
      this.token = session.accessToken || "";
      this.conversationId = session.conversationId || 0;
      if (!this.token || !this.conversationId) {
        throw new Error("会话未建立，请稍后重试");
      }
      this.setData({
        loading: false,
        error: "",
        consulting: true,
        notice: session.message || "",
      });
      await this.pull(true);
      this.timer = setInterval(() => {
        if (!this.data.sending) this.pull(false);
      }, POLL_MS);
    } catch (error) {
      this.setData({
        loading: false,
        error: error.message || "无法进入问诊会话",
      });
    }
  },

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  pull(reset) {
    return request({
      path: "/api/public/service-desk/open/messages/" + this.conversationId,
      query: { token: this.token, afterId: reset ? 0 : this.lastId },
    })
      .then((data) => {
        const rows = ((data && data.messages) || []).map((row) => ({
          id: row.id,
          mine: row.senderType === "visitor",
          senderName: row.senderType === "visitor" ? "我" : row.senderName || "客服",
          contentType: row.contentType,
          content: row.content,
          attachmentName: row.attachmentName,
          timeText: format.shortTime(row.createdAt),
        }));
        if (!rows.length && !reset) return;
        const known = new Set(this.data.messages.map((item) => item.id));
        const fresh = reset ? rows : rows.filter((row) => !known.has(row.id));
        if (!fresh.length && !reset) return;
        const messages = reset ? rows : this.data.messages.concat(fresh);
        const last = messages[messages.length - 1];
        this.lastId = last ? last.id : this.lastId;
        this.setData({
          messages,
          scrollTo: last ? "m" + last.id : "",
        });
      })
      .catch((error) => {
        if (reset) {
          this.setData({
            error: error.message || "会话消息加载失败，请稍后重试",
          });
          this.stop();
        }
      });
  },

  onInput(e) {
    this.setData({ input: e.detail.value });
  },

  async onSend() {
    const content = this.data.input.trim();
    if (!content || this.data.sending) return;
    this.setData({ sending: true, input: "" });
    try {
      const view = await request({
        path: "/api/public/service-desk/open/messages/" + this.conversationId,
        method: "POST",
        data: {
          token: this.token,
          content,
          contentType: "text",
          clientMsgId: "mp-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
        },
      });
      if (view && view.id && view.id > this.lastId) {
        const message = {
          id: view.id,
          mine: true,
          senderName: "我",
          contentType: view.contentType,
          content: view.content,
          attachmentName: view.attachmentName,
          timeText: format.shortTime(view.createdAt),
        };
        this.lastId = view.id;
        const exists = this.data.messages.some((item) => item.id === view.id);
        this.setData({
          messages: exists ? this.data.messages : this.data.messages.concat(message),
          scrollTo: "m" + view.id,
          sending: false,
        });
        return;
      }
      this.setData({ sending: false });
    } catch (error) {
      this.setData({ sending: false, input: content });
      wx.showToast({ title: error.message || "发送失败", icon: "none" });
    }
  },
});
