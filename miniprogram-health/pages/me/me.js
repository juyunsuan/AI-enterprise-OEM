const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const session = require("../../utils/session");

const CELLS = [
  { key: "patients", label: "就诊人", url: "/consumer/patient/list" },
  { key: "orders", label: "我的订单", url: "/consumer/order/list" },
  { key: "followups", label: "随访任务", url: "/consumer/followup/list" },
  { key: "metrics", label: "健康指标", url: "/consumer/metrics/index" },
  { key: "medication", label: "用药打卡", url: "/consumer/medication/index" },
  { key: "reports", label: "体检报告", url: "/consumer/report/list" },
  { key: "member", label: "会员卡", url: "/consumer/member/index" },
  { key: "coupons", label: "优惠券", url: "/consumer/member/index?tab=coupon" },
];

const TONGUE_CELL = {
  key: "tongue",
  label: "舌象分析",
  url: "/consumer/tongue/index",
};

const ROWS = [
  { key: "staff", label: "医护工作台", url: "/practitioner/bind/index" },
  { key: "consult", label: "我的问诊", url: "/pages/consult/list", tab: true },
  { key: "cart", label: "购物车", url: "/consumer/mall/cart" },
  { key: "wallet", label: "我的钱包", url: "/consumer/member/index?tab=wallet" },
  { key: "points", label: "我的积分", url: "/consumer/member/index?tab=point" },
  { key: "address", label: "收货地址", url: "/consumer/address/list" },
  { key: "promoter", label: "推广中心", url: "/consumer/promoter/index" },
  { key: "settings", label: "协议与须知 · 服务器地址", url: "/consumer/settings/settings" },
];

Page({
  data: {
    loggedIn: false,
    loading: false,
    customer: null,
    coupons: 0,
    unpaidOrders: 0,
    grants: [],
    shop: null,
    emergencyTip: "",
    cells: CELLS,
    rows: ROWS,
    walletText: "¥0.00",
  },

  onShow() {
    const app = getApp();
    const loggedIn = !!app.hasToken();
    const tongueEnabled = !!((app.globalData.bootstrap || {}).tongueEnabled);
    this.setData({
      loggedIn,
      cells: tongueEnabled ? CELLS.concat([TONGUE_CELL]) : CELLS,
    });
    if (loggedIn) this.loadMe();
  },

  onPullDownRefresh() {
    if (!this.data.loggedIn) {
      wx.stopPullDownRefresh();
      return;
    }
    this.loadMe().then(() => wx.stopPullDownRefresh());
  },

  async loadMe() {
    this.setData({ loading: true });
    try {
      const data = await api.me();
      const customer = (data && data.customer) || null;
      this.setData({
        loading: false,
        customer,
        coupons: (data && data.coupons) || 0,
        unpaidOrders: (data && data.unpaidOrders) || 0,
        grants: ((data && data.grants) || []).map((row) => ({
          ...row,
          expireText: format.dateOnly(row.endAt),
        })),
        shop: (data && data.shop) || null,
        emergencyTip: (data && data.emergencyTip) || "",
        walletText: format.yuan(customer ? customer.walletCents : 0),
      });
    } catch (error) {
      this.setData({ loading: false });
      if (error && error.code === 401) {
        this.setData({ loggedIn: false });
      } else {
        wx.showToast({ title: error.message || "加载失败", icon: "none" });
      }
    }
  },

  onLogin() {
    this.setData({ loading: true });
    auth
      .requireLogin({ redirect: false })
      .then(() => {
        this.setData({ loggedIn: true, loading: false });
        this.loadMe();
      })
      .catch(() => this.setData({ loading: false }));
  },

  onCell(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.navigateTo({ url });
  },

  onRow(e) {
    const { key, url, tab } = e.currentTarget.dataset;
    if (!url) return;
    if (key === "staff") {
      const target = session.getStaffToken()
        ? "/practitioner/workbench/index"
        : "/practitioner/bind/index";
      wx.navigateTo({ url: target });
      return;
    }
    if (tab) wx.switchTab({ url });
    else wx.navigateTo({ url });
  },

  onCall() {
    const phone =
      (this.data.shop && this.data.shop.servicePhone) ||
      ((getApp().globalData.bootstrap || {}).servicePhone || "");
    if (!phone) {
      wx.showToast({ title: "店铺未留客服电话", icon: "none" });
      return;
    }
    wx.makePhoneCall({ phoneNumber: phone });
  },

  onGrant(e) {
    const code = e.currentTarget.dataset.code || "";
    if (!code) return;
    wx.setClipboardData({ data: code });
  },

  onLogout() {
    wx.showModal({
      title: "退出登录",
      content: "退出后需重新微信登录，健康档案与订单不会删除。",
      success: (res) => {
        if (!res.confirm) return;
        auth.logout();
        this.setData({ loggedIn: false, customer: null });
      },
    });
  },

  onSettings() {
    wx.navigateTo({ url: "/consumer/settings/settings" });
  },
});
