const api = require("../../utils/api");
const auth = require("../../utils/auth");

Page({
  data: {
    conversation: null,
    visitor: null,
    messages: [],
    draft: "",
    sending: false,
    scrollTo: "",
  },

  onLoad(query) {
    this.conversationId = query.id;
    if (!auth.ensureLogin()) return;
    this.load();
  },

  load() {
    return api
      .conversation(this.conversationId)
      .then((data) => {
        this.setData({
          conversation: data.conversation,
          visitor: data.visitor,
          messages: (data.messages || []).map((item) =>
            Object.assign({}, item, { mine: item.senderType === "agent" }),
          ),
        });
        wx.setNavigationBarTitle({
          title: (data.conversation && data.conversation.visitorName) || "会话",
        });
        this.scrollToBottom();
      })
      .catch((error) => auth.showError(error));
  },

  scrollToBottom() {
    this.setData({ scrollTo: "" }, () => {
      this.setData({ scrollTo: "msg-bottom" });
    });
  },

  onDraft(event) {
    this.setData({ draft: event.detail.value });
  },

  onSend() {
    const content = String(this.data.draft || "").trim();
    if (!content || this.data.sending) return;
    this.setData({ sending: true });
    api
      .sendMessage(this.conversationId, content)
      .then(() => {
        this.setData({ draft: "", sending: false });
        return this.load();
      })
      .catch((error) => {
        this.setData({ sending: false });
        auth.showError(error);
      });
  },
});
