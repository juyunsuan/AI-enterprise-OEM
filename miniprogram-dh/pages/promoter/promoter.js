/** 推广中心：开通推广员、佣金明细、提现入口。 */
const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const pay = require("../../utils/pay").pay;

Page({
  data: {
    themeStyle: "",
    center: null,
    recent: [],
    list: [],
    page: 1,
    hasMore: true,
    loading: true,
    joining: false,
    balanceText: "¥0.00",
    totalText: "¥0.00",
    minWithdrawText: "",
    error: "",
  },

  onShow() {
    const app = getApp();
    this.setData({ themeStyle: app.globalData.themeStyle });
    app.ensureReady().then(() => this.reload());
  },

  onPullDownRefresh() {
    this.reload().then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) this.loadList(this.data.page + 1);
  },

  onShareAppMessage() {
    const member = getApp().globalData.member || null;
    return {
      title: "用 AI 数字人做口播视频，超简单",
      path: "/pages/index/index" + (member ? "?tuid=" + member.id : ""),
    };
  },

  reload() {
    return auth
      .ensureMember()
      .then(() => api.promoterCenter())
      .then((center) => {
        this.setData({
          center: center,
          balanceText: format.money(center.commissionBalance),
          totalText: format.money(center.commissionTotal),
          recent: (center.recent || []).map((row) => ({
            id: row.id,
            level: row.level,
            type: row.type,
            amountText: format.money(row.amountCents),
            remark: row.remark,
            createdAt: format.dateTime(row.createdAt),
          })),
          minWithdrawText: format.money(center.minWithdrawCents),
          loading: false,
          error: "",
        });
        if (center.isPromoter) return this.loadList(1);
        return null;
      })
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "加载失败" });
      });
  },

  loadList(page) {
    return api
      .commissions({ page: page, pageSize: 10 })
      .then((result) => {
        const rows = (result && result.list ? result.list : []).map((row) => ({
          id: row.id,
          level: row.level,
          amountText: format.money(row.amountCents),
          fromNickname: row.fromNickname || "好友",
          rate: row.rate,
          remark: row.remark,
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

  join() {
    if (this.data.joining) return;
    this.setData({ joining: true });
    api
      .promoterApply()
      .then((result) => {
        if (result && result.payParams) {
          return pay(result.payParams).then(() => result);
        }
        wx.showToast({ title: (result && result.message) || "已提交申请", icon: "none" });
        return result;
      })
      .then(() => {
        this.setData({ joining: false });
        return auth.refreshMember().then(() => this.reload());
      })
      .catch((error) => {
        this.setData({ joining: false });
        auth.showError(error);
      });
  },

  goWithdraw() {
    wx.navigateTo({ url: "/pages/withdraw/withdraw" });
  },

  goPoster() {
    wx.navigateTo({ url: "/pages/poster/poster" });
  },

  onShareTap() {
    wx.showToast({ title: "点右上角分享给好友", icon: "none" });
  },
});
