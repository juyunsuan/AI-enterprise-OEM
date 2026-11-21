/** AI 写作：按站点模板/选题生成口播文案，可直接带回合成台使用。 */
const api = require("../../utils/api");
const auth = require("../../utils/auth");

const DRAFT_KEY = "digital-human:draft-script";

Page({
  data: {
    themeStyle: "",
    prompt: "",
    words: 300,
    topics: [],
    topicId: 0,
    topicName: "",
    content: "",
    wordCount: 0,
    generating: false,
  },

  onShow() {
    const app = getApp();
    this.setData({ themeStyle: app.globalData.themeStyle });
    app.ensureReady().then(() => this.loadTopics());
  },

  loadTopics() {
    api
      .writeTopics("write_model")
      .then((rows) => this.setData({ topics: rows || [] }))
      .catch(() => undefined);
  },

  onPrompt(event) {
    this.setData({ prompt: String(event.detail.value || "") });
  },

  onWords(event) {
    this.setData({ words: Number(event.detail.value) });
  },

  pickTopic(event) {
    const id = Number(event.currentTarget.dataset.id || 0);
    this.setData({
      topicId: this.data.topicId === id ? 0 : id,
      topicName: this.data.topicId === id ? "" : event.currentTarget.dataset.name,
    });
  },

  generate() {
    if (this.data.generating) return;
    const prompt = String(this.data.prompt || "").trim();
    if (!prompt) {
      wx.showToast({ title: "先说说要写什么", icon: "none" });
      return;
    }
    this.setData({ generating: true });
    auth
      .ensureMember()
      .then(() =>
        api.aiWrite({
          prompt: prompt,
          words: this.data.words,
          topicId: this.data.topicId,
        }),
      )
      .then((result) => {
        this.setData({
          generating: false,
          content: (result && result.content) || "",
          wordCount: (result && result.wordCount) || 0,
        });
      })
      .catch((error) => {
        this.setData({ generating: false });
        auth.showError(error);
      });
  },

  copyContent() {
    if (!this.data.content) return;
    wx.setClipboardData({
      data: this.data.content,
      success() {
        wx.showToast({ title: "已复制" });
      },
    });
  },

  useForCreate() {
    if (!this.data.content) return;
    try {
      wx.setStorageSync(DRAFT_KEY, this.data.content);
    } catch (e) {
      wx.showToast({ title: "保存文案失败，请手动复制", icon: "none" });
      return;
    }
    wx.switchTab({ url: "/pages/create/create" });
  },
});
