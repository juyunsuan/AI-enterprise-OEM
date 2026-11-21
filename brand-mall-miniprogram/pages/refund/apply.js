const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

const REASONS = [
  "不想要了",
  "拍错/多拍",
  "商家未发货",
  "商品与描述不符",
  "质量问题",
  "收到商品破损",
  "快递长时间未送达",
  "其他原因",
];

/**
 * 申请售后：按订单行项目发起，可退金额上限＝该行总价 - 已退金额（回包里有这两项）。
 * 凭证图片上传到本店公开上传通道，最多 9 张；图片走内容安全检测后才接收。
 */
Page({
  data: {
    orderId: 0,
    itemId: 0,
    items: [],
    item: null,
    type: "REFUND_ONLY",
    reasons: REASONS,
    reasonIndex: 0,
    reason: REASONS[0],
    desc: "",
    images: [],
    uploading: false,
    amountText: "0.00",
    maxAmount: 0,
    maxAmountText: "0.00",
    amount: 0,
    refundEnabled: true,
    submitting: false,
    loading: true,
    error: "",
  },

  onLoad(query) {
    const trade = (getApp().bootstrap() || {}).trade || {};
    this.setData({
      orderId: Number(query.orderId || 0),
      itemId: Number(query.itemId || 0),
      type: query.type === "RETURN_REFUND" ? "RETURN_REFUND" : "REFUND_ONLY",
      refundEnabled: trade.refundEnabled !== false,
    });
    this.loadOrder();
  },

  loadOrder() {
    if (!this.data.orderId) {
      this.setData({ loading: false, error: "缺少订单 id" });
      return;
    }
    api
      .order(this.data.orderId)
      .then((data) => {
        const items = (data.items || []).map((row) => {
          const refundable = Math.max(0, Number(row.totalPrice || 0) - Number(row.refundedAmount || 0));
          return {
            id: row.id,
            title: row.title,
            skuName: row.skuName,
            image: row.image,
            quantity: row.quantity,
            refundable: Math.round(refundable * 100) / 100,
            refundableText: format.money(refundable),
            refundStatus: row.refundStatus,
            refundLabel: format.REFUND_STATUS_LABELS[row.status || row.refundStatus] || "",
          };
        });
        // 没指定行项目时默认第一件可退商品，少一次点击；全退完的行不出现在候选里。
        const candidates = items.filter((row) => row.refundable > 0);
        const hit = candidates.find((row) => row.id === this.data.itemId) || candidates[0] || items[0] || null;
        this.setData({
          loading: false,
          items: items,
          item: hit,
          itemId: hit ? hit.id : 0,
          amount: hit ? hit.refundable : 0,
          maxAmount: hit ? hit.refundable : 0,
          maxAmountText: hit ? hit.refundableText : "0.00",
          amountText: hit ? hit.refundableText : "0.00",
        });
      })
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "订单加载失败" });
      });
  },

  pickItem(event) {
    const id = Number(event.currentTarget.dataset.id);
    const hit = this.data.items.find((row) => row.id === id);
    if (!hit) return;
    this.setData({
      itemId: id,
      item: hit,
      maxAmount: hit.refundable,
      maxAmountText: hit.refundableText,
      amount: hit.refundable,
      amountText: hit.refundableText,
    });
  },

  pickType(event) {
    this.setData({ type: event.currentTarget.dataset.type === "RETURN_REFUND" ? "RETURN_REFUND" : "REFUND_ONLY" });
  },

  pickReason(event) {
    const reason = String(event.currentTarget.dataset.reason || "");
    if (!reason) return;
    const index = this.data.reasons.indexOf(reason);
    this.setData({ reason: reason, reasonIndex: index < 0 ? 0 : index });
  },

  onDesc(event) {
    this.setData({ desc: String(event.detail.value || "").slice(0, 500) });
  },

  onAmount(event) {
    const raw = Number(event.detail.value || 0);
    let value = Math.round((Number.isFinite(raw) ? raw : 0) * 100) / 100;
    if (value < 0) value = 0;
    if (value > this.data.maxAmount) {
      value = this.data.maxAmount;
      wx.showToast({ title: "最多可退 ¥" + format.money(this.data.maxAmount), icon: "none" });
    }
    this.setData({ amount: value, amountText: format.money(value) });
  },

  chooseImages() {
    if (this.data.uploading) return;
    const left = 9 - this.data.images.length;
    if (left <= 0) {
      wx.showToast({ title: "最多上传 9 张", icon: "none" });
      return;
    }
    wx.chooseMedia({
      count: left,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const files = (res.tempFiles || []).map((item) => item.tempFilePath).filter(Boolean);
        if (!files.length) return;
        this.uploadImages(files);
      },
    });
  },

  uploadImages(files) {
    this.setData({ uploading: true });
    const uploaded = this.data.images.slice();
    const queue = files.slice();
    const runNext = () => {
      const file = queue.shift();
      if (!file) {
        this.setData({ uploading: false, images: uploaded });
        return;
      }
      api
        .upload(file)
        .then((data) => {
          const url = data && data.url;
          if (url) uploaded.push(url);
          runNext();
        })
        .catch((error) => {
          wx.showToast({ title: (error && error.message) || "图片上传失败", icon: "none" });
          this.setData({ uploading: false, images: uploaded });
        });
    };
    runNext();
  },

  removeImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    const images = this.data.images.slice();
    if (index >= 0 && index < images.length) {
      images.splice(index, 1);
      this.setData({ images: images });
    }
  },

  previewImage(event) {
    const url = event.currentTarget.dataset.url;
    if (url) wx.previewImage({ urls: this.data.images, current: url });
  },

  submit() {
    if (!this.data.itemId) {
      wx.showToast({ title: "请选择要退款的商品", icon: "none" });
      return;
    }
    if (!this.data.reason) {
      wx.showToast({ title: "请选择退款原因", icon: "none" });
      return;
    }
    if (this.data.amount <= 0) {
      wx.showToast({ title: "退款金额要大于 0", icon: "none" });
      return;
    }
    if (this.data.uploading) {
      wx.showToast({ title: "图片还在上传，请稍候", icon: "none" });
      return;
    }
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    api
      .createRefund({
        orderId: this.data.orderId,
        orderItemId: this.data.itemId,
        type: this.data.type,
        reason: this.data.reason,
        desc: this.data.desc,
        images: this.data.images.slice(0, 9),
        amount: this.data.amount,
      })
      .then(() => {
        this.setData({ submitting: false });
        wx.showToast({ title: "已提交，等待商家处理", icon: "none" });
        setTimeout(() => {
          wx.redirectTo({ url: "/pages/refund/list" });
        }, 800);
      })
      .catch((error) => {
        this.setData({ submitting: false });
        auth.showError(error);
      });
  },

  goOrders() {
    wx.redirectTo({ url: "/pages/order/list" });
  },
});
