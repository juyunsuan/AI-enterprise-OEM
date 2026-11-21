const api = require("../../utils/api");
const staff = require("../../utils/staff");

const KIND_OPTIONS = [
  { key: "ARTICLE", label: "图文" },
  { key: "VIDEO", label: "视频" },
  { key: "AUDIO", label: "音频" },
  { key: "LIVE", label: "直播" },
];

const VISIBILITY_OPTIONS = [
  { key: "PUBLIC", label: "所有人可见" },
  { key: "MEMBER", label: "会员可见" },
  { key: "CROWD", label: "指定人群" },
  { key: "SIGNED", label: "已签约顾客" },
];

Page({
  data: {
    id: 0,
    loading: false,
    submitting: false,
    kindOptions: KIND_OPTIONS,
    visibilityOptions: VISIBILITY_OPTIONS,
    kindIndex: 0,
    visibilityIndex: 0,
    form: {
      title: "",
      summary: "",
      coverImage: "",
      mediaUrl: "",
      contentHtml: "",
      tags: "",
    },
    auditStatus: "",
    auditReason: "",
  },

  onLoad(options) {
    const id = Number(options && options.id) || 0;
    this.setData({ id });
    if (id) this.load(id);
  },

  async load(id) {
    try {
      await staff.requireStaff();
      const data = await api.staffArticle(id);
      this.setData({
        loading: false,
        kindIndex: Math.max(0, KIND_OPTIONS.findIndex((item) => item.key === data.kind)),
        visibilityIndex: Math.max(0, VISIBILITY_OPTIONS.findIndex((item) => item.key === data.visibility)),
        form: {
          title: data.title || "",
          summary: data.summary || "",
          coverImage: data.coverImage || "",
          mediaUrl: data.mediaUrl || "",
          contentHtml: data.contentHtml || "",
          tags: (data.tags || []).join("，"),
        },
        auditStatus: data.auditStatus,
        auditReason: data.auditReason || "",
      });
    } catch (error) {
      this.setData({ loading: false });
      staff.handleError(error, "文章加载失败");
    }
  },

  onForm(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ ["form." + key]: e.detail.value });
  },

  onKind(e) {
    this.setData({ kindIndex: Number(e.detail.value) || 0 });
  },

  onVisibility(e) {
    this.setData({ visibilityIndex: Number(e.detail.value) || 0 });
  },

  async onSubmit() {
    if (this.data.submitting) return;
    const form = this.data.form;
    const kind = KIND_OPTIONS[this.data.kindIndex].key;
    if (!String(form.title).trim()) {
      wx.showToast({ title: "请填写标题", icon: "none" });
      return;
    }
    if (kind === "ARTICLE" && !String(form.contentHtml).trim()) {
      wx.showToast({ title: "请填写正文", icon: "none" });
      return;
    }
    if (kind !== "ARTICLE" && !String(form.mediaUrl).trim()) {
      wx.showToast({ title: "请填写媒体地址", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    try {
      await api.staffSaveArticle({
        id: this.data.id,
        title: form.title,
        kind,
        summary: form.summary,
        coverImage: form.coverImage,
        mediaUrl: form.mediaUrl,
        contentHtml: form.contentHtml,
        tags: String(form.tags)
          .split(/[，,、\s]+/)
          .map((tag) => tag.trim())
          .filter(Boolean),
        visibility: VISIBILITY_OPTIONS[this.data.visibilityIndex].key,
        crowdKinds: [],
      });
      wx.showToast({ title: "已提交审核" });
      setTimeout(() => wx.navigateBack(), 700);
    } catch (error) {
      this.setData({ submitting: false });
      staff.handleError(error, "保存失败");
    }
  },
});
