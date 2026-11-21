const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

/** 分类由端上给常用项（后端 category 是自由字符串，没有枚举下发）。 */
const CATEGORIES = [
  { key: "服务态度", label: "服务态度" },
  { key: "上门准时", label: "上门准时" },
  { key: "收费问题", label: "收费问题" },
  { key: "沟通问题", label: "沟通问题" },
  { key: "其他", label: "其他" },
];

/** 反馈状态只有待处理/已处理两种（见 onsite_feedbacks.status）。 */
const STATUS_TEXT = {
  PENDING: "待处理",
  DONE: "已回复",
};

function historyOf(row) {
  return {
    id: row.id,
    category: row.category || "其他",
    content: row.content || "",
    images: Array.isArray(row.images) ? row.images : [],
    statusText: STATUS_TEXT[row.status] || "待处理",
    handled: row.status === "DONE",
    reply: row.reply || "",
    createdText: format.shortTime(row.createdAt),
  };
}

function categoriesOf(active) {
  return CATEGORIES.map((item) => ({
    key: item.key,
    label: item.label,
    activeClass: item.key === active ? "pill-active" : "",
  }));
}

Page({
  data: {
    loading: true,
    error: "",
    notReady: false,
    readyReason: "",
    categories: categoriesOf("其他"),
    category: "其他",
    content: "",
    images: [],
    imageMax: 9,
    uploading: false,
    submitting: false,
    feedbacks: [],
    loadingFeedbacks: false,
    feedbackError: "",
  },

  onLoad() {
    this.start();
  },

  start() {
    const app = getApp();
    app
      .ensureReady()
      .then((shop) => {
        if (!shop || !shop.shopCode) {
          this.setData({
            loading: false,
            notReady: true,
            readyReason: app.globalData.bootstrapError || "店铺尚未开通，请联系店铺方",
          });
          return null;
        }
        return auth
          .ensureLogin()
          .then(() => this.setData({ loading: false }))
          .then(() => this.loadFeedbacks());
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "登录失败，请重新进入小程序",
        });
      });
  },

  /** 我的反馈：只取本人提交的记录，店铺回复随列表带回。 */
  loadFeedbacks() {
    const self = this;
    this.setData({ loadingFeedbacks: true, feedbackError: "" });
    return api
      .feedbacks({ page: 1, pageSize: 20 })
      .then((res) => {
        self.setData({
          loadingFeedbacks: false,
          feedbacks: ((res && res.list) || []).map(historyOf),
        });
      })
      .catch((error) => {
        self.setData({
          loadingFeedbacks: false,
          feedbackError: (error && error.message) || "反馈记录加载失败",
        });
      });
  },

  previewHistoryImage(event) {
    const row = this.data.feedbacks[Number(event.currentTarget.dataset.index)];
    if (!row || !row.images.length) return;
    wx.previewImage({
      current: event.currentTarget.dataset.src || row.images[0],
      urls: row.images,
    });
  },

  onCategoryTap(event) {
    const key = event.currentTarget.dataset.key;
    if (!key || key === this.data.category) return;
    this.setData({ category: key, categories: categoriesOf(key) });
  },

  onContentInput(event) {
    this.setData({ content: event.detail.value });
  },

  chooseImages() {
    const left = this.data.imageMax - this.data.images.length;
    if (left <= 0) {
      wx.showToast({ title: "最多上传 " + this.data.imageMax + " 张", icon: "none" });
      return;
    }
    const self = this;
    wx.chooseMedia({
      count: left,
      mediaType: ["image"],
      sizeType: ["compressed"],
      success(res) {
        const files = (res.tempFiles || [])
          .map((item) => item.tempFilePath)
          .filter(Boolean);
        if (files.length) self.uploadImages(files);
      },
      fail() {
        // 用户取消不提示
      },
    });
  },

  /** 公开上传没有 feedback 专用 kind，凭证图沿用 review。 */
  uploadImages(files) {
    const self = this;
    this.setData({ uploading: true });
    let chain = Promise.resolve();
    files.forEach((filePath) => {
      chain = chain.then(() =>
        api.upload(filePath, "review").then((data) => {
          const url = data && data.url;
          if (!url) return;
          self.setData({
            images: self.data.images.concat([url]).slice(0, self.data.imageMax),
          });
        }),
      );
    });
    chain
      .catch((error) => {
        wx.showToast({
          title: (error && error.message) || "图片上传失败",
          icon: "none",
        });
      })
      .then(() => self.setData({ uploading: false }));
  },

  removeImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    const images = this.data.images.slice();
    if (index < 0 || index >= images.length) return;
    images.splice(index, 1);
    this.setData({ images: images });
  },

  previewImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    const images = this.data.images;
    if (!images.length) return;
    wx.previewImage({ current: images[index] || images[0], urls: images });
  },

  submit() {
    if (this.data.submitting) return;
    if (this.data.uploading) {
      wx.showToast({ title: "图片还在上传，请稍候", icon: "none" });
      return;
    }
    const content = String(this.data.content || "").trim();
    if (content.length < 4) {
      wx.showToast({ title: "请至少填写 4 个字", icon: "none" });
      return;
    }
    const self = this;
    this.setData({ submitting: true });
    api
      .submitFeedback({
        category: this.data.category,
        content: content,
        images: this.data.images,
      })
      .then(() => {
        self.setData({
          submitting: false,
          content: "",
          images: [],
          category: "其他",
          categories: categoriesOf("其他"),
        });
        wx.showModal({
          title: "已提交",
          content: "反馈已发送给店铺，处理结果会在下方「我的反馈」里展示。",
          showCancel: false,
        });
        self.loadFeedbacks();
      })
      .catch((error) => {
        self.setData({ submitting: false });
        wx.showModal({
          title: "提交失败",
          content: (error && error.message) || "请稍后重试",
          showCancel: false,
        });
      });
  },
});
