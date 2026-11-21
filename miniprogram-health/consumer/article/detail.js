const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

const KINDS = { article: "健康科普", post: "病友圈", question: "健康问答" };

Page({
  data: {
    kind: "article",
    id: 0,
    loading: true,
    error: "",
    article: null,
    post: null,
    question: null,
    commentText: "",
    submitting: false,
  },

  onLoad(options) {
    const kind = options && KINDS[options.kind] ? options.kind : "article";
    const id = Number(options && options.id) || 0;
    this.setData({ kind, id });
    wx.setNavigationBarTitle({ title: KINDS[kind] });
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  async load() {
    const { kind, id } = this.data;
    if (!id) {
      this.setData({ loading: false, error: "内容不存在" });
      return;
    }
    this.setData({ loading: true, error: "" });
    try {
      if (kind === "post") {
        const data = (await api.postDetail(id)) || {};
        this.setData({
          loading: false,
          post: {
            ...data,
            timeText: format.dateTime(data.createdAt),
            comments: (data.comments || []).map((row) => ({
              ...row,
              timeText: format.shortTime(row.createdAt),
            })),
            liked: Boolean(data.liked),
          },
        });
      } else if (kind === "question") {
        const data = (await api.questionDetail(id)) || {};
        this.setData({
          loading: false,
          question: {
            ...data,
            timeText: format.dateTime(data.createdAt),
            bountyText: data.bountyCents > 0 ? format.yuan(data.bountyCents) : "",
            answers: (data.answers || []).map((row) => ({
              ...row,
              timeText: format.shortTime(row.createdAt),
            })),
          },
        });
      } else {
        const data = (await api.articleDetail(id)) || {};
        this.setData({
          loading: false,
          article: {
            ...data,
            timeText: format.dateTime(data.publishedAt),
          },
        });
      }
    } catch (error) {
      this.setData({ loading: false, error: (error && error.message) || "内容加载失败" });
    }
  },

  onInputComment(e) {
    this.setData({ commentText: e.detail.value });
  },

  async onLike() {
    if (!this.data.post || this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      await auth.requireLogin({ redirect: false });
      const data = await api.likePost(this.data.post.id);
      this.setData({
        submitting: false,
        "post.liked": Boolean(data && data.liked),
        "post.likeCount": (data && data.likeCount) || 0,
      });
    } catch (error) {
      this.setData({ submitting: false });
      wx.showToast({ title: error.message || "操作失败", icon: "none" });
    }
  },

  async onSubmitComment() {
    if (!this.data.post || this.data.submitting) return;
    const content = String(this.data.commentText || "").trim();
    if (!content) {
      wx.showToast({ title: "请填写评论内容", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    try {
      await auth.requireLogin({ redirect: false });
      const result = await api.commentPost({ postId: this.data.post.id, parentId: 0, content });
      this.setData({ submitting: false, commentText: "" });
      wx.showToast({ title: (result && result.message) || "评论已提交", icon: "none" });
      this.load();
    } catch (error) {
      this.setData({ submitting: false });
      wx.showToast({ title: error.message || "评论失败", icon: "none" });
    }
  },

  onPreview(e) {
    const url = e.currentTarget.dataset.url;
    if (!url || !this.data.post) return;
    wx.previewImage({ current: url, urls: this.data.post.images || [] });
  },
});
