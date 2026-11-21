const api = require("../../utils/api");
const auth = require("../../utils/auth");

const TAGS = ["服务热情", "专业耐心", "解答清楚", "环境整洁", "效果满意", "等待时间短"];

Page({
  data: {
    stars: [1, 2, 3, 4, 5],
    score: 5,
    attitudeScore: 5,
    skillScore: 5,
    tags: TAGS.map((name) => ({ name, active: false })),
    content: "",
    anonymous: false,
    submitting: false,
  },

  onLoad(options) {
    this.orderId = Number(options && options.orderId) || 0;
  },

  onStar(e) {
    const kind = e.currentTarget.dataset.kind;
    const value = Number(e.currentTarget.dataset.score) || 5;
    const patch = {};
    patch[kind] = value;
    this.setData(patch);
  },

  onTag(e) {
    const index = Number(e.currentTarget.dataset.index);
    const tags = this.data.tags.slice();
    if (!tags[index]) return;
    tags[index] = { ...tags[index], active: !tags[index].active };
    this.setData({ tags });
  },

  onContent(e) {
    this.setData({ content: e.detail.value });
  },

  onAnonymous(e) {
    this.setData({ anonymous: Boolean(e.detail.value) });
  },

  async onSubmit() {
    if (this.data.submitting) return;
    if (!this.orderId) {
      wx.showToast({ title: "订单信息缺失", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    try {
      await auth.requireLogin();
      await api.reviewOrder({
        orderId: this.orderId,
        score: this.data.score,
        attitudeScore: this.data.attitudeScore,
        skillScore: this.data.skillScore,
        content: this.data.content.trim(),
        images: [],
        tags: this.data.tags.filter((tag) => tag.active).map((tag) => tag.name),
        anonymous: this.data.anonymous,
      });
      wx.showToast({ title: "评价成功" });
      setTimeout(() => wx.navigateBack(), 600);
    } catch (error) {
      this.setData({ submitting: false });
      wx.showToast({ title: error.message || "评价失败", icon: "none" });
    }
  },
});
