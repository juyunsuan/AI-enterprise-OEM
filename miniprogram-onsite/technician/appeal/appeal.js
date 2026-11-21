const api = require("../../utils/api");
const staff = require("../../utils/staff");
const format = require("../../utils/format");

const APPEAL_STATUS = {
  PENDING: "待处理",
  ACCEPTED: "已通过",
  REJECTED: "已驳回",
};

const MAX_IMAGES = 9;

Page({
  data: {
    loading: true,
    list: [],
    page: 1,
    total: 0,
    finished: false,
    listError: "",
    orderOptions: ["不关联订单"],
    orderPickIndex: 0,
    orderId: 0,
    reviewId: "",
    reviewHint: "",
    reason: "",
    images: [],
    submitting: false,
    errorText: "",
    uploading: false,
  },

  onLoad(query) {
    this.presetOrderId = Number((query && query.orderId) || 0);
    this.gate = staff.ensureStaff();
  },

  async onShow() {
    const gate = this.gate || staff.ensureStaff();
    this.gate = null;
    let profile = null;
    try {
      profile = await gate;
    } catch (error) {
      wx.showToast({ title: (error && error.message) || "登录失败，请稍后重试", icon: "none" });
      return;
    }
    if (!profile) return;
    await this.loadOrders();
    await this.loadList();
  },

  onReachBottom() {
    if (this.data.finished || this.data.loading) return;
    this.loadList(this.data.page + 1);
  },

  onPullDownRefresh() {
    this.loadList(1).then(() => wx.stopPullDownRefresh());
  },

  /** 已评价的订单才有可申诉的差评；订单里没有评价编号，只能尽量从评价接口带出。 */
  async loadOrders() {
    try {
      const result = await api.staffOrders({ page: 1, pageSize: 50, status: "REVIEWED" });
      const rows = (result && result.list) || [];
      const options = ["不关联订单"];
      const ids = [0];
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const titles = row.serviceTitles || [];
        options.push(row.orderNo + " · " + (titles.length ? titles.join("、") : "服务明细"));
        ids.push(row.id);
      }
      this.orderIds = ids;
      let index = 0;
      if (this.presetOrderId) {
        for (let i = 0; i < ids.length; i += 1) {
          if (ids[i] === this.presetOrderId) index = i;
        }
        this.presetOrderId = 0;
      }
      this.setData({ orderOptions: options, orderPickIndex: index, orderId: ids[index] || 0 });
      if (this.data.orderId) await this.resolveReviewId(this.data.orderId);
    } catch (error) {
      this.setData({ orderOptions: ["不关联订单"], orderPickIndex: 0, orderId: 0 });
    }
  },

  /**
   * 评价编号（reviewId）是申诉接口的必填项，但技师端没有「查我这条评价」的接口。
   * 评价详情接口按顾客维度过滤，只有这一单的评价恰好落在当前微信账号上时才能取到，
   * 取不到就明确提示去问店主，不伪造编号。
   */
  async resolveReviewId(orderId) {
    if (!orderId) {
      this.setData({ reviewHint: "" });
      return;
    }
    try {
      const review = await api.reviewDetail(orderId);
      if (review && review.id) {
        this.setData({
          reviewId: String(review.id),
          reviewHint: "已按订单自动带出评价编号，提交前请核对评价确实是这一单的差评。",
        });
        return;
      }
      this.setData({
        reviewId: "",
        reviewHint: "该订单没有取到评价记录；若刚收到差评，请让店主在后台把评价编号提供给你。",
      });
    } catch (error) {
      this.setData({
        reviewId: "",
        reviewHint: "评价编号需向店主索取：技师端暂不提供评价查询，只有 4 星以下的评价可以申诉。",
      });
    }
  },

  async loadList(page) {
    const target = page || 1;
    this.setData({ loading: true, listError: "" });
    try {
      const result = await api.staffAppeals({ page: target, pageSize: 20 });
      const rows = (result && result.list) || [];
      const mapped = rows.map((row) => ({
        id: row.id,
        orderNo: row.orderNo || "—",
        statusLabel: APPEAL_STATUS[row.status] || row.status,
        status: row.status,
        reason: row.reason || "",
        reply: row.reply || "",
        images: row.images || [],
        createdText: format.dateTime(row.createdAt),
        handledText: row.handledAt ? format.dateTime(row.handledAt) : "",
      }));
      const list = target === 1 ? mapped : this.data.list.concat(mapped);
      const total = Number(result && result.total) || 0;
      this.setData({
        loading: false,
        list: list,
        page: target,
        total: total,
        finished: list.length >= total || rows.length < 20,
      });
    } catch (error) {
      this.setData({
        loading: false,
        listError: (error && error.message) || "申诉记录加载失败",
      });
    }
  },

  onOrderChange(event) {
    const index = Number(event.detail.value) || 0;
    const ids = this.orderIds || [0];
    const orderId = ids[index] || 0;
    this.setData({ orderPickIndex: index, orderId: orderId, errorText: "" });
    this.resolveReviewId(orderId);
  },

  onReviewIdInput(event) {
    this.setData({ reviewId: event.detail.value, errorText: "" });
  },

  onReasonInput(event) {
    this.setData({ reason: event.detail.value, errorText: "" });
  },

  chooseImage() {
    if (this.data.images.length >= MAX_IMAGES) {
      wx.showToast({ title: "最多 9 张图片", icon: "none" });
      return;
    }
    wx.chooseMedia({
      count: MAX_IMAGES - this.data.images.length,
      mediaType: ["image"],
      sizeType: ["compressed"],
      success: async (res) => {
        const files = res.tempFiles || [];
        if (!files.length) return;
        this.setData({ uploading: true });
        wx.showLoading({ title: "上传中", mask: true });
        const urls = this.data.images.slice();
        try {
          for (let i = 0; i < files.length; i += 1) {
            const uploaded = await api.upload(files[i].tempFilePath, "review");
            urls.push(uploaded.url);
          }
          wx.hideLoading();
          this.setData({ uploading: false, images: urls });
        } catch (error) {
          wx.hideLoading();
          this.setData({ uploading: false });
          wx.showToast({ title: (error && error.message) || "上传失败", icon: "none" });
        }
      },
    });
  },

  removeImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    const images = this.data.images.slice();
    images.splice(index, 1);
    this.setData({ images: images });
  },

  previewImage(event) {
    const current = event.currentTarget.dataset.url;
    if (!current) return;
    wx.previewImage({ urls: this.data.images, current: current });
  },

  previewSingle(event) {
    const current = event.currentTarget.dataset.url;
    if (!current) return;
    wx.previewImage({ urls: [current], current: current });
  },

  async submit() {
    if (this.data.submitting || this.data.uploading) return;
    const reviewId = Number(this.data.reviewId);
    const reason = String(this.data.reason || "").trim();
    if (!Number.isInteger(reviewId) || reviewId <= 0) {
      this.setData({ errorText: "请填写评价编号（正整数），可向店主索取" });
      return;
    }
    if (!reason) {
      this.setData({ errorText: "请填写申诉理由" });
      return;
    }
    if (reason.length > 300) {
      this.setData({ errorText: "申诉理由最多 300 个字" });
      return;
    }
    this.setData({ submitting: true, errorText: "" });
    wx.showLoading({ title: "提交中", mask: true });
    try {
      await api.staffAppeal({ reviewId: reviewId, reason: reason, images: this.data.images });
      wx.hideLoading();
      this.setData({
        submitting: false,
        reviewId: "",
        reason: "",
        images: [],
        reviewHint: "",
      });
      wx.showToast({ title: "已提交申诉", icon: "success" });
      await this.loadList(1);
    } catch (error) {
      wx.hideLoading();
      this.setData({
        submitting: false,
        errorText: (error && error.message) || "提交失败，请稍后重试",
      });
    }
  },
});
