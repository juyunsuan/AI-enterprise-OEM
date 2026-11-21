const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const labels = require("../../utils/labels");

const ENDED = ["COMPLETED", "CANCELLED", "REFUNDED"];

Page({
  data: {
    loading: true,
    consult: null,
    attachments: [],
    canCancel: false,
    canFinish: false,
    canChat: false,
    canEval: false,
  },

  onLoad(options) {
    this.consultId = Number(options && options.id) || 0;
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  async load() {
    try {
      await auth.requireLogin();
      const row = (await api.consultDetail(this.consultId)) || {};
      const status = row.status || "";
      const ended = ENDED.indexOf(status) >= 0;
      this.setData({
        loading: false,
        consult: {
          ...row,
          statusLabel: labels.pick(labels.CONSULT_STATUS_LABELS, status),
          wayLabel: labels.pick(labels.CONSULT_WAY_LABELS, row.bizType),
          timeText: format.dateTime(row.createdAt),
          appointText: row.appointAt ? format.dateTime(row.appointAt) : "",
        },
        attachments: row.attachments || [],
        canCancel: status === "WAIT_ACCEPT" || status === "PENDING_PAYMENT",
        canFinish: status === "IN_SESSION" || status === "PRACTITIONER_REPLIED",
        canChat: row.bizType === "CONSULT_TEXT" && !ended,
        canEval: status === "CUSTOMER_DONE",
      });
    } catch (error) {
      this.setData({ loading: false });
      if (error && error.code !== 401) {
        wx.showToast({ title: error.message || "问诊单加载失败", icon: "none" });
      }
    }
  },

  onPreview(e) {
    const url = e.currentTarget.dataset.url;
    if (url) wx.previewImage({ current: url, urls: this.data.attachments });
  },

  onCopy() {
    if (!this.data.consult) return;
    wx.setClipboardData({ data: this.data.consult.consultNo });
  },

  onCancel() {
    wx.showModal({
      title: "取消问诊",
      content: "医护接诊前可以取消，确定取消这次问诊吗？",
      editable: true,
      placeholderText: "填写取消原因（选填）",
      success: (res) => {
        if (!res.confirm) return;
        this.action("CANCEL", { reason: (res.content || "").trim() }, "已取消");
      },
    });
  },

  onFinish() {
    wx.showModal({
      title: "结束问诊",
      content: "确认问题已解决？结束后医护将不再回复本单。",
      success: (res) => {
        if (res.confirm) this.action("CUSTOMER_DONE", {}, "已提交结束");
      },
    });
  },

  onChat() {
    wx.navigateTo({ url: "/consumer/consult/chat?id=" + this.consultId });
  },

  onEval() {
    const scores = [
      { label: "5 分 · 非常满意", value: 5 },
      { label: "4 分 · 满意", value: 4 },
      { label: "3 分 · 一般", value: 3 },
      { label: "2 分 · 不满意", value: 2 },
      { label: "1 分 · 很差", value: 1 },
    ];
    wx.showActionSheet({
      itemList: scores.map((item) => item.label),
      success: (res) => {
        const score = scores[res.tapIndex].value;
        wx.showModal({
          title: "评价问诊服务",
          editable: true,
          placeholderText: "补充评价内容（选填）",
          success: (input) => {
            if (!input.confirm) return;
            this.action(
              "EVAL",
              { score, content: (input.content || "").trim() },
              "评价成功",
            );
          },
        });
      },
    });
  },

  async action(action, payload, tip) {
    try {
      await api.consultAction(Object.assign({ id: this.consultId, action }, payload));
      wx.showToast({ title: tip || "已提交" });
      this.load();
    } catch (error) {
      wx.showToast({ title: error.message || "操作失败", icon: "none" });
    }
  },
});
