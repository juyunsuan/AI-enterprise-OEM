const app = getApp();
const session = require("../../utils/session");

Page({
  data: {
    loading: true,
    error: "",
    siteName: "",
    messages: [],
    input: "",
    sending: false,
    conversationId: 0,
    token: "",
    lastId: 0,
    scrollInto: "",
  },

  onLoad() {
    app.ensureReady().then((bootstrap) => {
      const site = (bootstrap && bootstrap.site) || {};
      if (!site.deskSiteKey) {
        this.setData({
          loading: false,
          error: "园区尚未开通 AI 客服，请联系园区管理员",
        });
        return;
      }
      this.setData({ siteName: site.name || "园区客服" });
      this.open(site.deskSiteKey);
    });
  },

  onUnload() {
    if (this.timer) clearInterval(this.timer);
  },

  open(siteKey) {
    const customer = session.getCustomer();
    wx.request({
      url: `${session.getApiBase()}/api/public/service-desk/open/session`,
      method: "POST",
      data: {
        siteKey,
        nickname: customer.nickname || "",
        contact: customer.phone || "",
        sourceUrl: "miniprogram://park",
      },
      success: (res) => {
        const data = res.data || {};
        if (!data.token || !data.conversationId) {
          this.setData({
            loading: false,
            error: (data && data.message) || "客服会话创建失败",
          });
          return;
        }
        const messages = Array.isArray(data.messages) ? data.messages : [];
        const lastId = messages.length ? messages[messages.length - 1].id : 0;
        this.setData({
          loading: false,
          token: data.token,
          conversationId: data.conversationId,
          messages,
          lastId,
          scrollInto: messages.length ? `msg-${lastId}` : "",
        });
        this.timer = setInterval(() => this.poll(), 3000);
      },
      fail: (error) => {
        this.setData({
          loading: false,
          error: (error && error.errMsg) || "客服会话创建失败",
        });
      },
    });
  },

  poll() {
    if (!this.data.token || !this.data.conversationId) return;
    wx.request({
      url: `${session.getApiBase()}/api/public/service-desk/open/messages/${this.data.conversationId}`,
      data: { token: this.data.token, afterId: this.data.lastId },
      success: (res) => {
        const data = res.data || {};
        const next = Array.isArray(data.messages) ? data.messages : [];
        if (!next.length) return;
        const messages = this.data.messages.concat(next);
        const lastId = next[next.length - 1].id;
        this.setData({
          messages,
          lastId,
          scrollInto: `msg-${lastId}`,
        });
      },
    });
  },

  onInput(event) {
    this.setData({ input: event.detail.value });
  },

  send() {
    const content = String(this.data.input || "").trim();
    if (!content || this.data.sending) return;
    this.setData({ sending: true });
    wx.request({
      url: `${session.getApiBase()}/api/public/service-desk/open/messages/${this.data.conversationId}`,
      method: "POST",
      data: { token: this.data.token, content, contentType: "text" },
      success: (res) => {
        const message = res.data || {};
        const messages = message.id
          ? this.data.messages.concat([message])
          : this.data.messages;
        const lastId = message.id || this.data.lastId;
        this.setData({
          sending: false,
          input: "",
          messages,
          lastId,
          scrollInto: `msg-${lastId}`,
        });
      },
      fail: (error) => {
        this.setData({ sending: false });
        wx.showToast({
          title: (error && error.errMsg) || "发送失败",
          icon: "none",
        });
      },
    });
  },
});
