/** 佣金提现：银行卡或收款码，提交即冻结对应佣金，等待站点审核打款。 */
const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const upload = require("../../utils/upload");

Page({
  data: {
    themeStyle: "",
    balanceText: "",
    minWithdrawText: "",
    amount: "",
    method: "bank",
    accountName: "",
    accountNo: "",
    bankName: "",
    qrUrl: "",
    submitting: false,
    list: [],
    page: 1,
    hasMore: true,
  },

  onShow() {
    const app = getApp();
    this.setData({ themeStyle: app.globalData.themeStyle });
    app.ensureReady().then(() => this.reload());
  },

  onReachBottom() {
    if (this.data.hasMore) this.loadList(this.data.page + 1);
  },

  reload() {
    return auth
      .ensureMember()
      .then((member) => {
        this.setData({
          balanceText: format.money(member.commissionBalance),
          minWithdrawText: this.data.minWithdrawText || "",
        });
        return api.promoterCenter();
      })
      .then((center) => {
        this.setData({ minWithdrawText: format.money(center.minWithdrawCents) });
        return this.loadList(1);
      })
      .catch(auth.showError);
  },

  loadList(page) {
    return api
      .withdraws({ page: page, pageSize: 10 })
      .then((result) => {
        const rows = (result && result.list ? result.list : []).map((row) => ({
          id: row.id,
          amountText: format.money(row.amountCents),
          methodText: row.method === "qrcode" ? "收款码" : "银行卡",
          statusText: format.withdrawStatus(row.status),
          rejectReason: row.rejectReason,
          createdAt: format.dateTime(row.createdAt),
        }));
        const total = (result && result.total) || 0;
        const merged = page === 1 ? rows : this.data.list.concat(rows);
        this.setData({
          list: merged,
          page: page,
          hasMore: rows.length > 0 && merged.length < total,
        });
      })
      .catch(() => undefined);
  },

  onAmount(event) {
    this.setData({ amount: String(event.detail.value || "") });
  },

  onField(event) {
    const key = event.currentTarget.dataset.key;
    const patch = {};
    patch[key] = String(event.detail.value || "");
    this.setData(patch);
  },

  switchMethod(event) {
    this.setData({ method: event.currentTarget.dataset.method });
  },

  uploadQr() {
    upload
      .chooseImage()
      .then((path) => upload.upload(path))
      .then((result) => {
        this.setData({ qrUrl: result.url });
        wx.showToast({ title: "收款码已上传" });
      })
      .catch((error) => {
        if (error && error.message !== "已取消选择") auth.showError(error);
      });
  },

  submit() {
    if (this.data.submitting) return;
    const yuan = Number(this.data.amount || 0);
    if (!(yuan > 0)) {
      wx.showToast({ title: "请输入提现金额", icon: "none" });
      return;
    }
    const payload = {
      amountCents: Math.round(yuan * 100),
      method: this.data.method,
    };
    if (this.data.method === "bank") {
      payload.accountName = this.data.accountName;
      payload.accountNo = this.data.accountNo;
      payload.bankName = this.data.bankName;
    } else {
      payload.qrUrl = this.data.qrUrl;
    }
    this.setData({ submitting: true });
    api
      .withdrawApply(payload)
      .then(() => {
        this.setData({ submitting: false, amount: "" });
        wx.showToast({ title: "已提交，等待审核" });
        return this.reload();
      })
      .catch((error) => {
        this.setData({ submitting: false });
        auth.showError(error);
      });
  },
});
