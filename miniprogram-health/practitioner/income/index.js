const api = require("../../utils/api");
const format = require("../../utils/format");
const staff = require("../../utils/staff");

Page({
  data: {
    loading: true,
    summary: null,
    cards: [],
    cardNames: [],
    cardIndex: 0,
    withdrawals: [],
    shares: [],
    showCardForm: false,
    form: {
      accountName: "",
      bankName: "",
      branchName: "",
      cardNo: "",
      phone: "",
    },
    amount: "",
    submitting: false,
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  async load() {
    try {
      await staff.requireStaff();
      const data = await api.staffIncome();
      const summary = (data && data.summary) || {};
      const cards = (data && data.bankCards) || [];
      this.setData({
        loading: false,
        summary: {
          totalText: format.yuan(summary.totalCents || 0),
          settleableText: format.yuan(summary.settleableCents || 0),
          withdrawingText: format.yuan(summary.withdrawingCents || 0),
          withdrawnText: format.yuan(summary.withdrawnCents || 0),
          orderCount: summary.orderCount || 0,
        },
        cards,
        cardNames: cards.map((row) => row.bankName + " 尾号" + row.cardTail),
        withdrawals: ((data && data.withdrawals) || []).map((row) => ({
          ...row,
          statusLabel: staff.pick(staff.WITHDRAWAL_STATUS_LABELS, row.status),
          amountText: format.yuan(row.amountCents),
          timeText: format.dateTime(row.createdAt),
        })),
        shares: ((data && data.shares) || []).map((row) => ({
          ...row,
          amountText: format.yuan(row.shareCents),
          timeText: format.dateTime(row.createdAt),
        })),
      });
    } catch (error) {
      this.setData({ loading: false });
      staff.handleError(error, "收益加载失败");
    }
  },

  onPickCard(e) {
    this.setData({ cardIndex: Number(e.detail.value) || 0 });
  },

  onAmount(e) {
    this.setData({ amount: e.detail.value });
  },

  onToggleCardForm() {
    this.setData({ showCardForm: !this.data.showCardForm });
  },

  onForm(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ ["form." + key]: e.detail.value });
  },

  async onSaveCard() {
    const form = this.data.form;
    if (!String(form.accountName).trim() || !String(form.bankName).trim() || !String(form.cardNo).trim()) {
      wx.showToast({ title: "开户人、银行、卡号为必填", icon: "none" });
      return;
    }
    try {
      await api.staffSaveBankCard({
        accountName: form.accountName,
        bankName: form.bankName,
        branchName: form.branchName,
        cardNo: form.cardNo,
        phone: form.phone,
        isDefault: this.data.cards.length === 0,
      });
      wx.showToast({ title: "银行卡已保存" });
      this.setData({
        showCardForm: false,
        form: { accountName: "", bankName: "", branchName: "", cardNo: "", phone: "" },
      });
      this.load();
    } catch (error) {
      staff.handleError(error, "保存失败");
    }
  },

  async onApply() {
    if (this.data.submitting) return;
    const card = this.data.cards[this.data.cardIndex];
    if (!card) {
      wx.showToast({ title: "请先添加收款银行卡", icon: "none" });
      return;
    }
    const yuan = Number(this.data.amount);
    if (!Number.isFinite(yuan) || yuan <= 0) {
      wx.showToast({ title: "请填写提现金额", icon: "none" });
      return;
    }
    const amountCents = Math.round(yuan * 100);
    this.setData({ submitting: true });
    try {
      await api.staffApplyWithdrawal({ amountCents, bankCardId: card.id });
      wx.showToast({ title: "已提交，等待店主审核" });
      this.setData({ amount: "", submitting: false });
      this.load();
    } catch (error) {
      this.setData({ submitting: false });
      staff.handleError(error, "申请失败");
    }
  },
});
