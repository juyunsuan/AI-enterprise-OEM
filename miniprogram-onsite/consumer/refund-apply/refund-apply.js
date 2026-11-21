const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

/** 与后端 ORDER_STATUS_LABELS 同口径，只用于展示订单状态。 */
const ORDER_STATUS_TEXT = {
  PENDING_PAYMENT: "待付款",
  PAID: "待接单",
  ACCEPTED: "已接单",
  EN_ROUTE: "服务出发",
  ON_SITE: "已到达",
  SERVING: "服务中",
  COMPLETED: "已完成",
  SIGNED: "已签收",
  REVIEWED: "已评价",
  CANCELLED: "已取消",
  EXPIRED: "超时关闭",
  REJECTED: "技师拒单",
  REFUND_PENDING: "退款中",
  REFUNDED: "已退款",
};

/**
 * 「可退款」只看订单自身字段：已付款、未终态、没有在途退款。
 * 真正能不能退、能退多少一律以 refunds/quote 与提交结果为准，端上不判断金额。
 */
function isRefundableOrder(row) {
  if (!row) return false;
  if (row.payStatus !== "PAID") return false;
  if (["CANCELLED", "EXPIRED", "REJECTED", "REFUNDED", "REFUND_PENDING"].indexOf(row.status) >= 0) {
    return false;
  }
  if (row.refundStatus === "PENDING") return false;
  return true;
}

function toOrderItem(row) {
  return {
    id: row.id,
    orderNo: row.orderNo || "",
    statusText: ORDER_STATUS_TEXT[row.status] || row.status || "",
    amountText: format.yuan(row.payAmountCents),
    timeText: format.shortTime(row.createdAt),
  };
}

Page({
  data: {
    loading: true,
    error: "",
    notReady: false,
    readyReason: "",
    orderId: 0,
    needSelect: false,
    ordersLoading: false,
    ordersError: "",
    orders: [],
    quote: null,
    quoting: false,
    quoteError: "",
    pendingRefund: false,
    lines: [],
    reason: "",
    description: "",
    images: [],
    imageMax: 9,
    uploading: false,
    submitting: false,
  },

  onLoad(options) {
    const orderId = Number((options && options.orderId) || 0);
    this.setData({ orderId: orderId, needSelect: !orderId });
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
        return auth.ensureLogin().then(() => {
          this.setData({ loading: false });
          if (this.data.orderId) this.loadQuote();
          else this.loadOrders();
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "登录失败，请重新进入小程序",
        });
      });
  },

  /** 没有 orderId 时让顾客从自己的可退款订单里挑一单。 */
  loadOrders() {
    this.setData({ ordersLoading: true, ordersError: "" });
    return api
      .orders({ page: 1, pageSize: 50 })
      .then((res) => {
        const list = ((res && res.list) || []).filter(isRefundableOrder);
        this.setData({ ordersLoading: false, orders: list.map(toOrderItem) });
      })
      .catch((error) => {
        this.setData({
          ordersLoading: false,
          ordersError: (error && error.message) || "订单加载失败",
        });
      });
  },

  pickOrder(event) {
    const orderId = Number(event.currentTarget.dataset.id) || 0;
    if (!orderId) return;
    this.setData({ orderId: orderId, needSelect: false, orders: [], quote: null, lines: [] });
    this.loadQuote();
  },

  resetOrder() {
    this.setData({
      orderId: 0,
      needSelect: true,
      quote: null,
      lines: [],
      quoteError: "",
      pendingRefund: false,
    });
    this.loadOrders();
  },

  /** 可退上限与明细行由 quote 给出；端上不算金额，只展示。 */
  loadQuote() {
    if (!this.data.orderId) return;
    const self = this;
    this.setData({ quoting: true, quoteError: "" });
    return api
      .refundQuote({ orderId: this.data.orderId })
      .then((data) => {
        const lines = ((data && data.items) || []).map((item) => {
          const refundable = Number(item.refundableQuantity) || 0;
          const quantity = Number(item.quantity) || 0;
          return {
            id: item.id,
            title: item.title || "服务项目",
            quantity: quantity,
            refundableQuantity: refundable,
            refundedQuantity: Math.max(0, quantity - refundable),
            priceText: format.yuan(item.unitPriceCents),
            durationText: format.duration(item.durationMinutes),
            checked: refundable > 0,
            pick: refundable > 0 ? refundable : 0,
          };
        });
        self.setData({
          quoting: false,
          lines: lines,
          pendingRefund: data && data.pendingRefund === true,
          quote: {
            orderNo: (data && data.orderNo) || "",
            statusText: ORDER_STATUS_TEXT[data && data.status] || (data && data.status) || "",
            refundableText: format.yuan(data && data.refundableCents),
          },
        });
      })
      .catch((error) => {
        self.setData({
          quoting: false,
          quoteError: (error && error.message) || "试算失败，请稍后重试",
        });
      });
  },

  toggleLine(event) {
    const index = Number(event.currentTarget.dataset.index);
    const line = this.data.lines[index];
    if (!line) return;
    if (!line.checked && line.refundableQuantity <= 0) {
      wx.showToast({ title: "该服务没有可退份数", icon: "none" });
      return;
    }
    const patch = {};
    patch["lines[" + index + "].checked"] = !line.checked;
    patch["lines[" + index + "].pick"] = !line.checked && line.refundableQuantity > 0
      ? line.refundableQuantity
      : line.pick;
    this.setData(patch);
  },

  changePick(event) {
    const index = Number(event.currentTarget.dataset.index);
    const delta = Number(event.currentTarget.dataset.delta) || 0;
    const line = this.data.lines[index];
    if (!line || !line.checked) return;
    let next = line.pick + delta;
    if (next < 1) next = 1;
    if (next > line.refundableQuantity) {
      wx.showToast({ title: "最多可退 " + line.refundableQuantity + " 份", icon: "none" });
      next = line.refundableQuantity;
    }
    const patch = {};
    patch["lines[" + index + "].pick"] = next;
    this.setData(patch);
  },

  onReasonInput(event) {
    this.setData({ reason: event.detail.value });
  },

  onDescriptionInput(event) {
    this.setData({ description: event.detail.value });
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

  /** 凭证图走公开上传，kind 只有 checkin/sign/review/avatar/license，这里用 review。 */
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
    if (!this.data.orderId) {
      wx.showToast({ title: "请先选择订单", icon: "none" });
      return;
    }
    if (this.data.uploading) {
      wx.showToast({ title: "凭证图还在上传，请稍候", icon: "none" });
      return;
    }
    if (this.data.pendingRefund) {
      wx.showToast({ title: "已有退款单在处理中", icon: "none" });
      return;
    }
    const reason = String(this.data.reason || "").trim();
    if (!reason) {
      wx.showToast({ title: "请填写退款原因", icon: "none" });
      return;
    }
    const items = [];
    this.data.lines.forEach((line) => {
      if (!line.checked) return;
      if (line.pick > 0) items.push({ orderItemId: line.id, quantity: line.pick });
    });
    if (!items.length) {
      wx.showToast({ title: "请至少选择一项服务份数", icon: "none" });
      return;
    }
    const self = this;
    this.setData({ submitting: true });
    // 字段与 onsite.public.ts 的 refundApplyBody 逐字对齐
    api
      .applyRefund({
        orderId: this.data.orderId,
        reason: reason,
        description: this.data.description,
        evidenceImages: this.data.images,
        items: items,
      })
      .then(() => {
        wx.showToast({ title: "退款申请已提交", icon: "success" });
        setTimeout(() => {
          wx.redirectTo({ url: "/consumer/refund-list/refund-list" });
        }, 800);
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
