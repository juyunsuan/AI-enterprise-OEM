const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

const KINDS = [
  { key: "REFUND", label: "仅退款" },
  { key: "RETURN_REFUND", label: "退货退款" },
  { key: "EXCHANGE", label: "换货" },
  { key: "RESEND", label: "补寄" },
];

const REASONS = ["商品质量问题", "发错货/少发漏发", "与描述不符", "不想要了", "服务不满意", "其他原因"];

const ALLOWED_STATUSES = ["PAID", "ACCEPTED", "DELIVERED", "SERVING", "COMPLETED", "VERIFIED"];

Page({
  data: {
    loading: true,
    blocked: "",
    kinds: KINDS,
    kind: "REFUND",
    reasons: REASONS,
    items: [],
    orderItemId: 0,
    reason: "",
    description: "",
    submitting: false,
  },

  onLoad(options) {
    this.orderId = Number(options && options.orderId) || 0;
    this.load();
  },

  async load() {
    try {
      await auth.requireLogin();
      const data = (await api.orderDetail(this.orderId)) || {};
      const order = data.order || {};
      if (ALLOWED_STATUSES.indexOf(order.status || "") < 0) {
        this.setData({
          loading: false,
          blocked: "当前订单状态不支持申请售后，如有疑问请联系店铺客服",
        });
        return;
      }
      const items = (data.items || []).map((item) => ({
        ...item,
        amountText: format.yuan(item.amountCents),
      }));
      this.setData({
        loading: false,
        items,
        orderItemId: items.length ? items[0].id : 0,
      });
    } catch (error) {
      this.setData({ loading: false, blocked: error.message || "订单加载失败" });
    }
  },

  onKind(e) {
    this.setData({ kind: e.currentTarget.dataset.key });
  },

  onItem(e) {
    this.setData({ orderItemId: Number(e.currentTarget.dataset.id) || 0 });
  },

  onReason(e) {
    this.setData({ reason: e.currentTarget.dataset.reason });
  },

  onReasonInput(e) {
    this.setData({ reason: e.detail.value });
  },

  onDescription(e) {
    this.setData({ description: e.detail.value });
  },

  async onSubmit() {
    if (this.data.submitting) return;
    if (!this.data.reason.trim()) {
      wx.showToast({ title: "请填写售后原因", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    try {
      await api.applyAftersale({
        orderId: this.orderId,
        orderItemId: this.data.orderItemId,
        kind: this.data.kind,
        reason: this.data.reason.trim(),
        description: this.data.description.trim(),
        evidenceImages: [],
      });
      wx.showToast({ title: "已提交，等待店铺处理" });
      setTimeout(() => wx.navigateBack(), 800);
    } catch (error) {
      this.setData({ submitting: false });
      wx.showToast({ title: error.message || "提交失败", icon: "none" });
    }
  },
});
