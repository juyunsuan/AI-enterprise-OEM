const api = require("../../utils/api");
const staff = require("../../utils/staff");
const format = require("../../utils/format");

/** schema 里 category 是自由字符串（默认 'other'，库里默认「其他」），这里给常用分类并允许自填。 */
const CATEGORIES = ["服务流程", "订单问题", "结算问题", "功能建议", "其他"];
const MAX_IMAGES = 9;

const FEEDBACK_STATUS = {
  PENDING: "待处理",
  HANDLED: "已处理",
};

Page({
  data: {
    categories: CATEGORIES,
    categoryIndex: 0,
    customCategory: "",
    content: "",
    images: [],
    orderOptions: ["不关联订单"],
    orderPickIndex: 0,
    orderId: 0,
    uploading: false,
    submitting: false,
    errorText: "",
    history: [],
    page: 1,
    total: 0,
    finished: false,
    loading: true,
    listError: "",
  },

  onLoad() {
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
    await this.loadHistory(1);
  },

  onReachBottom() {
    if (this.data.finished || this.data.loading) return;
    this.loadHistory(this.data.page + 1);
  },

  onPullDownRefresh() {
    this.loadHistory(1).then(() => wx.stopPullDownRefresh());
  },

  /** 关联订单是选填：后端只在自己名下的订单才落库，选错会被静默忽略。 */
  async loadOrders() {
    try {
      const result = await api.staffOrders({ page: 1, pageSize: 50 });
      const rows = (result && result.list) || [];
      const options = ["不关联订单"];
      const ids = [0];
      for (let i = 0; i < rows.length; i += 1) {
        const titles = rows[i].serviceTitles || [];
        options.push(rows[i].orderNo + " · " + (titles.length ? titles.join("、") : "服务明细"));
        ids.push(rows[i].id);
      }
      this.orderIds = ids;
      this.setData({ orderOptions: options, orderPickIndex: 0, orderId: 0 });
    } catch (error) {
      this.orderIds = [0];
      this.setData({ orderOptions: ["不关联订单"], orderPickIndex: 0, orderId: 0 });
    }
  },

  async loadHistory(page) {
    const target = page || 1;
    this.setData({ loading: true, listError: "" });
    try {
      const result = await api.staffFeedbacks({ page: target, pageSize: 20 });
      const rows = (result && result.list) || [];
      const mapped = rows.map((row) => ({
        id: row.id,
        category: row.category || "未分类",
        content: row.content || "",
        images: row.images || [],
        statusLabel: FEEDBACK_STATUS[row.status] || row.status || "",
        reply: row.reply || "",
        createdText: format.dateTime(row.createdAt),
        handledText: row.handledAt ? format.dateTime(row.handledAt) : "",
      }));
      const history = target === 1 ? mapped : this.data.history.concat(mapped);
      const total = Number(result && result.total) || 0;
      this.setData({
        loading: false,
        history: history,
        page: target,
        total: total,
        finished: history.length >= total || rows.length < 20,
      });
    } catch (error) {
      this.setData({
        loading: false,
        listError: (error && error.message) || "历史反馈加载失败",
      });
    }
  },

  onCategoryChange(event) {
    this.setData({ categoryIndex: Number(event.detail.value) || 0, errorText: "" });
  },

  onCustomCategoryInput(event) {
    this.setData({ customCategory: event.detail.value, errorText: "" });
  },

  onOrderChange(event) {
    const index = Number(event.detail.value) || 0;
    const ids = this.orderIds || [0];
    this.setData({ orderPickIndex: index, orderId: ids[index] || 0 });
  },

  onContentInput(event) {
    this.setData({ content: event.detail.value, errorText: "" });
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

  previewFormImage(event) {
    const current = event.currentTarget.dataset.url;
    if (!current) return;
    wx.previewImage({ urls: this.data.images, current: current });
  },

  previewHistoryImage(event) {
    const current = event.currentTarget.dataset.url;
    if (!current) return;
    wx.previewImage({ urls: [current], current: current });
  },

  async submit() {
    if (this.data.submitting || this.data.uploading) return;
    const content = String(this.data.content || "").trim();
    const isOther = CATEGORIES[this.data.categoryIndex] === "其他";
    const custom = String(this.data.customCategory || "").trim();
    let category = CATEGORIES[this.data.categoryIndex] || "其他";
    if (isOther && custom) category = custom.slice(0, 40);
    if (content.length < 4) {
      this.setData({ errorText: "请把问题描述清楚（至少 4 个字），方便店主处理" });
      return;
    }
    if (content.length > 2000) {
      this.setData({ errorText: "内容最多 2000 个字" });
      return;
    }
    this.setData({ submitting: true, errorText: "" });
    wx.showLoading({ title: "提交中", mask: true });
    try {
      await api.staffFeedback({
        orderId: this.data.orderId || 0,
        category: category,
        content: content,
        images: this.data.images,
      });
      wx.hideLoading();
      this.setData({
        submitting: false,
        content: "",
        images: [],
        customCategory: "",
        categoryIndex: 0,
        orderPickIndex: 0,
        orderId: 0,
      });
      wx.showToast({ title: "已提交", icon: "success" });
      await this.loadHistory(1);
    } catch (error) {
      wx.hideLoading();
      this.setData({
        submitting: false,
        errorText: (error && error.message) || "提交失败，请稍后重试",
      });
    }
  },
});
