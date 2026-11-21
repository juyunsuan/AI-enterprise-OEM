const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const session = require("../../utils/session");

const MODES = [
  { key: "article", label: "健康科普", title: "健康科普", placeholder: "搜科普文章" },
  { key: "post", label: "病友圈", title: "病友圈", placeholder: "搜病友经验" },
  { key: "question", label: "健康问答", title: "健康问答", placeholder: "搜健康问题" },
];

function modeOf(key) {
  return MODES.find((item) => item.key === key) || MODES[0];
}

Page({
  data: {
    modes: MODES,
    mode: "article",
    placeholder: "搜科普文章",
    keyword: "",
    categories: [],
    categoryId: 0,
    list: [],
    page: 1,
    pageSize: 10,
    hasMore: true,
    loading: false,
    composer: false,
    publishing: false,
    postForm: { title: "", content: "", tagsText: "", topic: "" },
    questionForm: { title: "", detail: "" },
  },

  onLoad(options) {
    const mode = options && options.mode;
    this.applyMode(mode === "post" || mode === "question" ? mode : "article");
    this.load(true);
  },

  onPullDownRefresh() {
    this.load(true).then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.loading || !this.data.hasMore) return;
    this.load(false);
  },

  applyMode(key) {
    const mode = modeOf(key);
    this.setData({
      mode: mode.key,
      placeholder: mode.placeholder,
      keyword: "",
      categoryId: 0,
      list: [],
      page: 1,
      hasMore: true,
    });
    wx.setNavigationBarTitle({ title: mode.title });
  },

  onMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode === this.data.mode) return;
    this.applyMode(mode);
    this.load(true);
  },

  onCategory(e) {
    const categoryId = Number(e.currentTarget.dataset.id) || 0;
    if (categoryId === this.data.categoryId) return;
    this.setData({ categoryId });
    this.load(true);
  },

  onKeyword(e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearch() {
    this.load(true);
  },

  async loadCategories() {
    try {
      const rows = (await api.articleCategories()) || [];
      this.setData({ categories: rows });
    } catch (error) {
      /* 分类失败不影响文章列表 */
    }
  },

  async load(reset) {
    if (this.data.loading) return;
    const page = reset ? 1 : this.data.page + 1;
    this.setData({ loading: true });
    try {
      const mode = this.data.mode;
      if (mode === "article" && !this.data.categories.length) this.loadCategories();
      const query = {
        keyword: this.data.keyword,
        page,
        pageSize: this.data.pageSize,
      };
      let rows = [];
      if (mode === "post") {
        const data = await api.posts(query);
        rows = ((data && data.list) || []).map((row) => ({
          ...row,
          timeText: format.shortTime(row.createdAt),
          images: (row.images || []).slice(0, 3),
        }));
      } else if (mode === "question") {
        const data = await api.questions(query);
        rows = ((data && data.list) || []).map((row) => ({
          ...row,
          timeText: format.shortTime(row.createdAt),
          bountyText: row.bountyCents > 0 ? format.yuan(row.bountyCents) : "",
        }));
      } else {
        const data = await api.articles(
          Object.assign({}, query, { categoryId: this.data.categoryId }),
        );
        rows = ((data && data.list) || []).map((row) => ({
          ...row,
          timeText: format.shortTime(row.publishedAt),
        }));
      }
      this.setData({
        list: reset ? rows : this.data.list.concat(rows),
        page,
        hasMore: rows.length >= this.data.pageSize,
        loading: false,
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: (error && error.message) || "加载失败", icon: "none" });
    }
  },

  onItem(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: "/consumer/article/detail?kind=" + this.data.mode + "&id=" + id,
    });
  },

  onOpenComposer() {
    auth
      .requireLogin({ redirect: false })
      .then(() => this.setData({ composer: true }))
      .catch(() => undefined);
  },

  onCloseComposer() {
    if (this.data.publishing) return;
    this.setData({ composer: false });
  },

  noop() {},

  onPostInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ["postForm." + field]: e.detail.value });
  },

  onQuestionInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ["questionForm." + field]: e.detail.value });
  },

  async onPublish() {
    if (this.data.publishing) return;
    const isPost = this.data.mode === "post";
    const form = isPost ? this.data.postForm : this.data.questionForm;
    const title = String(form.title || "").trim();
    const content = String(isPost ? form.content : form.detail || "").trim();
    if (!isPost && !title) {
      wx.showToast({ title: "请填写问题标题", icon: "none" });
      return;
    }
    if (isPost && content.length < 5) {
      wx.showToast({ title: "内容至少 5 个字", icon: "none" });
      return;
    }
    this.setData({ publishing: true });
    try {
      await auth.requireLogin({ redirect: false });
      let result = null;
      if (isPost) {
        result = await api.createPost({
          title,
          content,
          images: [],
          tags: String(form.tagsText || "")
            .split(/[,，\s]+/)
            .filter(Boolean)
            .slice(0, 6),
          topic: String(form.topic || "").trim(),
        });
      } else {
        result = await api.createQuestion({
          title,
          detail: content,
          patientId: session.getPatientId(),
          bountyCents: 0,
        });
      }
      wx.showToast({ title: (result && result.message) || "已提交", icon: "none" });
      this.setData({
        publishing: false,
        composer: false,
        postForm: { title: "", content: "", tagsText: "", topic: "" },
        questionForm: { title: "", detail: "" },
      });
      this.load(true);
    } catch (error) {
      this.setData({ publishing: false });
      wx.showToast({ title: error.message || "提交失败", icon: "none" });
    }
  },
});
