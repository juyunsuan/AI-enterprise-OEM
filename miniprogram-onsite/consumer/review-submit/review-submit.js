const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

/** 后端 review.status 只有这三种（PENDING 表示店主开了先审后展示）。 */
const STATUS_TEXT = {
  PENDING: "待审核",
  PUBLISHED: "已发布",
  HIDDEN: "已隐藏",
};

Page({
  data: {
    loading: true,
    error: "",
    notReady: false,
    readyReason: "",
    orderId: 0,
    readOnly: false,
    existing: null,
    stars: [1, 2, 3, 4, 5],
    rating: 5,
    serviceRating: 5,
    attitudeRating: 5,
    content: "",
    images: [],
    anonymous: false,
    contentMax: 2000,
    imageMax: 9,
    uploading: false,
    submitting: false,
  },

  onLoad(options) {
    const orderId = Number((options && options.orderId) || 0);
    this.setData({ orderId: orderId });
    if (!orderId) {
      this.setData({ loading: false, error: "缺少订单号，无法评价" });
      return;
    }
    this.start();
  },

  /** 店铺配置 → 顾客令牌 → 查这单是否已评价（已评价只读回显）。 */
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
        return auth.ensureLogin().then(() => this.load());
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "登录失败，请重新进入小程序",
        });
      });
  },

  /** reviewDetail 未评价时返回 null，按 null 决定展示填写态还是只读态。 */
  load() {
    this.setData({ loading: true, error: "" });
    return api
      .reviewDetail(this.data.orderId)
      .then((row) => {
        if (!row) {
          this.setData({ loading: false, readOnly: false, existing: null });
          return;
        }
        this.setData({
          loading: false,
          readOnly: true,
          existing: {
            rating: Number(row.rating) || 0,
            serviceRating: Number(row.serviceRating) || 0,
            attitudeRating: Number(row.attitudeRating) || 0,
            content: row.content || "",
            images: Array.isArray(row.images) ? row.images : [],
            anonymous: row.anonymous === true,
            statusText: STATUS_TEXT[row.status] || row.status || "",
            createdAtText: format.dateTime(row.createdAt),
            reply: row.reply || "",
            repliedAtText: row.repliedAt ? format.dateTime(row.repliedAt) : "",
          },
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "评价信息加载失败",
        });
      });
  },

  setRating(event) {
    if (this.data.readOnly) return;
    this.setData({ rating: Number(event.currentTarget.dataset.score) || 5 });
  },

  setServiceRating(event) {
    if (this.data.readOnly) return;
    this.setData({ serviceRating: Number(event.currentTarget.dataset.score) || 5 });
  },

  setAttitudeRating(event) {
    if (this.data.readOnly) return;
    this.setData({ attitudeRating: Number(event.currentTarget.dataset.score) || 5 });
  },

  onContentInput(event) {
    this.setData({ content: event.detail.value });
  },

  toggleAnonymous(event) {
    this.setData({ anonymous: !!event.detail.value });
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

  /** 逐张上传：任何一张失败只提示，不打断已成功的图。 */
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

  previewExistingImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    const images = (this.data.existing && this.data.existing.images) || [];
    if (!images.length) return;
    wx.previewImage({ current: images[index] || images[0], urls: images });
  },

  submit() {
    if (this.data.readOnly) return;
    if (this.data.submitting) return;
    if (this.data.uploading) {
      wx.showToast({ title: "图片还在上传，请稍候", icon: "none" });
      return;
    }
    const rating = Number(this.data.rating);
    if (!(rating >= 1 && rating <= 5)) {
      wx.showToast({ title: "请选择整体评分", icon: "none" });
      return;
    }
    const self = this;
    this.setData({ submitting: true });
    // 字段与 onsite.public.ts 的 reviewBody 逐字对齐；tags / items 有默认值，这里不提交
    api
      .submitReview({
        orderId: this.data.orderId,
        rating: rating,
        serviceRating: Number(this.data.serviceRating) || 5,
        attitudeRating: Number(this.data.attitudeRating) || 5,
        content: this.data.content,
        images: this.data.images,
        anonymous: this.data.anonymous,
      })
      .then(() => {
        wx.showToast({ title: "评价已提交", icon: "success" });
        setTimeout(() => wx.navigateBack(), 800);
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
