const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const labels = require("../../utils/labels");

const TABS = [
  { key: "member", label: "会员卡" },
  { key: "coupon", label: "优惠券" },
  { key: "point", label: "积分" },
  { key: "wallet", label: "钱包" },
];

function discountText(percent) {
  const value = Number(percent) || 100;
  if (value >= 100) return "无折扣";
  return String(Math.round(value) / 10) + " 折";
}

Page({
  data: {
    tabs: TABS,
    tab: "member",
    loading: true,
    member: null,
    grants: [],
    verifyCodes: [],
    coupons: [],
    points: null,
    wallet: null,
  },

  onLoad(options) {
    const tab = TABS.some((item) => item.key === (options && options.tab))
      ? options.tab
      : "member";
    this.setData({ tab });
    wx.setNavigationBarTitle({ title: "会员中心" });
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  onTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.tab) return;
    this.setData({ tab, loading: true });
    this.load();
  },

  async load() {
    try {
      await auth.requireLogin();
      if (this.data.tab === "coupon") await this.loadCoupons();
      else if (this.data.tab === "point") await this.loadPoints();
      else if (this.data.tab === "wallet") await this.loadWallet();
      else await this.loadMember();
      this.setData({ loading: false });
    } catch (error) {
      this.setData({ loading: false });
      if (error && error.code !== 401) {
        wx.showToast({ title: error.message || "加载失败", icon: "none" });
      }
    }
  },

  async loadMember() {
    const [me, codes] = await Promise.all([api.me(), api.verifyCodes()]);
    const customer = (me && me.customer) || null;
    this.setData({
      member: customer
        ? {
            ...customer,
            levelText: customer.memberLevelName || "普通顾客",
            discountText: discountText(customer.memberDiscountPercent),
            walletText: format.yuan(customer.walletCents),
            coupons: (me && me.coupons) || 0,
          }
        : null,
      grants: ((me && me.grants) || []).map((row) => ({
        ...row,
        expireText: format.dateOnly(row.endAt),
      })),
      verifyCodes: (codes || []).map((row) => ({
        ...row,
        tagLabel: labels.pick(labels.BIZ_LABELS, row.orderType, row.tag || "服务"),
      })),
    });
  },

  async loadCoupons() {
    const rows = (await api.coupons()) || [];
    this.setData({
      coupons: rows.map((row) => ({
        ...row,
        kindLabel: labels.pick(labels.COUPON_KIND_LABELS, row.kind, "优惠券"),
        statusLabel: labels.pick(labels.COUPON_STATUS_LABELS, row.status, row.status),
        valueText:
          row.kind === "DISCOUNT"
            ? discountText(row.discountPercent)
            : format.yuan(row.valueCents),
        conditionText:
          row.kind === "DISCOUNT"
            ? "最高优惠以店铺结算为准"
            : row.minAmountCents > 0
              ? "满 " + format.yuan(row.minAmountCents) + " 可用"
              : "无门槛",
        timeText:
          format.dateOnly(row.startAt) + " 至 " + format.dateOnly(row.endAt),
      })),
    });
  },

  async loadPoints() {
    const data = (await api.points()) || {};
    this.setData({
      points: {
        balance: data.balance || 0,
        rules: (data.rules || []).map((row) => ({
          ...row,
          sceneLabel: row.label || labels.pick(labels.POINT_SCENE_LABELS, row.scene),
          valueText: row.value > 0 ? "+" + row.value : String(row.value),
        })),
        logs: (data.logs || []).map((row) => ({
          ...row,
          sceneLabel: labels.pick(labels.POINT_SCENE_LABELS, row.scene, "积分变动"),
          valueText: row.value > 0 ? "+" + row.value : String(row.value),
          timeText: format.shortTime(row.createdAt),
        })),
      },
    });
  },

  async loadWallet() {
    const data = (await api.wallet()) || {};
    this.setData({
      wallet: {
        balanceText: format.yuan(data.balanceCents || 0),
        logs: (data.logs || []).map((row) => ({
          ...row,
          kindLabel: labels.pick(labels.WALLET_KIND_LABELS, row.kind, "余额变动"),
          amountText:
            row.amountCents >= 0
              ? "+" + format.yuan(row.amountCents)
              : "-" + format.yuan(Math.abs(row.amountCents)),
          balanceText: format.yuan(row.balanceCents),
          timeText: format.shortTime(row.createdAt),
        })),
      },
    });
  },

  onCopy(e) {
    const code = e.currentTarget.dataset.code || "";
    if (!code) return;
    wx.setClipboardData({ data: code });
  },

  onCouponHelp() {
    wx.showModal({
      title: "优惠券说明",
      content: "优惠券仅在本店下单时抵扣，是否可用以结算页实付金额为准。",
      showCancel: false,
      confirmText: "知道了",
    });
  },
});
