const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

const STATUS_TEXT = {
  PENDING: "待处理",
  AGREED: "已同意",
  REFUNDED: "已退款",
  REJECTED: "已驳回",
  CANCELLED: "已撤销",
};


Page({
  data: {
    loading: true,
    error: "",
    notReady: false,
    readyReason: "",
    refundId: 0,
    refund: null,
    photos: [],
    canCancel: false,
    cancelling: false,
    notFound: false,
  },

  onLoad(options) {
    const refundId = Number((options && options.refundId) || 0);
    this.setData({ refundId: refundId });
    if (!refundId) {
      this.setData({ loading: false, error: "缺少退款单号" });
      return;
    }
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
        return auth.ensureLogin().then(() => this.load());
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "登录失败，请重新进入小程序",
        });
      });
  },

  load() {
    const self = this;
    const refundId = this.data.refundId;
    this.setData({ loading: true, error: "", notFound: false });
    return api
      .refundDetail(refundId)
      .then((row) => {
        if (!row) {
          self.setData({ loading: false, notFound: true });
          return;
        }
        self.apply(row);
      })
      .catch((error) => {
        // 不存在/不属于本人时后端回 404，页面按「未找到」展示而不是报错
        if (error && error.code === 404) {
          self.setData({ loading: false, notFound: true });
          return;
        }
        self.setData({
          loading: false,
          error: (error && error.message) || "退款单加载失败",
        });
      });
  },

  apply(row) {
    this.setData({
      loading: false,
      notFound: false,
      refund: {
        id: row.id,
        refundNo: row.refundNo || "",
        orderNo: row.orderNo || "",
        statusText: row.statusText || STATUS_TEXT[row.status] || row.status || "",
        applyAmountText: format.yuan(row.applyAmountCents),
        refundAmountText: format.yuan(row.refundAmountCents),
        hasRefunded: Number(row.refundAmountCents) > 0,
        reason: row.reason || "",
        description: row.description || "",
        auditRemark: row.auditRemark || "",
        isRejected: row.status === "REJECTED",
        refundTransactionId: row.refundTransactionId || "",
        refundedAtText: row.refundedAt ? format.dateTime(row.refundedAt) : "",
        createdAtText: row.createdAt ? format.dateTime(row.createdAt) : "",
      },
      lines: (row.lines || []).map((line) => ({
        id: line.orderItemId,
        title: line.title || "服务项目",
        quantityText: "x" + line.quantity,
        amountText: format.yuan(line.amountCents),
      })),
      photos: Array.isArray(row.evidenceImages) ? row.evidenceImages : [],
      canCancel: row.status === "PENDING",
    });
  },

  previewPhoto(event) {
    const index = Number(event.currentTarget.dataset.index);
    const photos = this.data.photos;
    if (!photos.length) return;
    wx.previewImage({ current: photos[index] || photos[0], urls: photos });
  },

  cancel() {
    const self = this;
    wx.showModal({
      title: "撤销售后",
      content: "确认撤销这笔退款申请？撤销后订单会回到申请前的状态。",
      success(res) {
        if (!res.confirm) return;
        self.setData({ cancelling: true });
        api
          .cancelRefund(self.data.refundId)
          .then(() => {
            wx.showToast({ title: "已撤销", icon: "success" });
            self.setData({ cancelling: false });
            self.load();
          })
          .catch((error) => {
            self.setData({ cancelling: false });
            wx.showToast({
              title: (error && error.message) || "撤销失败",
              icon: "none",
            });
          });
      },
    });
  },
});
