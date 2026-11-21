const auth = require("../../utils/auth");
const session = require("../../utils/session");

/** 与 pages/order/order.js 共用同一个 storage 键，switchTab 不能带参数。 */
const TAB_KEY = "onsite:order:tab";

const ORDER_GRID = [
  { key: "PENDING_PAYMENT", label: "待付款" },
  { key: "PAID", label: "待接单" },
  { key: "SERVING", label: "服务中" },
  { key: "TO_REVIEW", label: "待评价" },
];

/** 功能入口：地址、退款、反馈、技师绑定、代理中心、设置；技师工作台按绑定态补在最前。 */
const ENTRIES = [
  { key: "address", label: "收货地址", desc: "服务地址簿", url: "/consumer/address-list/address-list" },
  { key: "refund", label: "我的退款", desc: "退款申请与进度", url: "/consumer/refund-list/refund-list" },
  { key: "feedback", label: "意见反馈", desc: "提交给店铺", url: "/consumer/feedback/feedback" },
  { key: "bind", label: "技师入口", desc: "手机号与工号绑定", url: "/technician/bind/bind" },
  { key: "agent", label: "代理中心", desc: "代理 / 业务员 / 渠道商", url: "/agent/index/index", public: true },
  { key: "settings", label: "设置", desc: "", url: "/consumer/settings/settings" },
];

const WORKBENCH_ENTRY = {
  key: "workbench",
  label: "技师工作台",
  desc: "接单与服务进度",
  url: "/technician/workbench/workbench",
};

Page({
  data: {
    loggedIn: false,
    nickname: "微信用户",
    avatar: "",
    shopName: "",
    staffBound: false,
    apiBase: "",
    orders: ORDER_GRID,
    entries: [],
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const app = getApp();
    const shop = app.bootstrap();
    const profile = session.getProfile();
    const loggedIn = app.hasToken();
    const staffBound = !!session.getStaffToken();
    const entries = (staffBound ? [WORKBENCH_ENTRY] : []).concat(ENTRIES);
    this.setData({
      loggedIn: loggedIn,
      nickname: (profile && profile.nickname) || "微信用户",
      avatar: (profile && profile.avatar) || "",
      shopName: shop.shopName || "",
      staffBound: staffBound,
      apiBase: session.getApiBase(),
      entries: entries.map((entry) => ({
        key: entry.key,
        label: entry.label,
        desc: entry.desc,
        url: entry.url,
        // 代理绑定只认店铺码 + 手机号，不依赖顾客登录；其余入口都要登录态
        locked: !loggedIn && !entry.public,
      })),
    });
  },

  login() {
    if (this.logging) return;
    this.logging = true;
    auth
      .ensureLogin()
      .then(() => {
        this.logging = false;
        this.refresh();
        wx.showToast({ title: "已登录", icon: "success" });
      })
      .catch((error) => {
        this.logging = false;
        wx.showToast({
          title: (error && error.message) || "登录失败，请稍后重试",
          icon: "none",
        });
      });
  },

  logout() {
    session.clearToken();
    this.refresh();
  },

  /** 订单页签通过 storage 传过去，订单页 onShow 读取后立即清掉。 */
  goOrders(event) {
    const key = event.currentTarget.dataset.key || "ALL";
    try {
      wx.setStorageSync(TAB_KEY, key);
    } catch (e) {
      // 存储写不进去就退回「全部」，不影响跳转
    }
    wx.switchTab({ url: "/pages/order/order" });
  },

  openEntry(event) {
    const key = event.currentTarget.dataset.key;
    let target = null;
    for (let i = 0; i < this.data.entries.length; i += 1) {
      if (this.data.entries[i].key === key) target = this.data.entries[i];
    }
    if (!target) return;
    if (!this.data.loggedIn) {
      wx.showToast({ title: "登录后可用", icon: "none" });
      return;
    }
    wx.navigateTo({ url: target.url });
  },

  /** 本地调试用的服务器地址：正式包按 config.js 填写，这里只是给店主自测留的口子。 */
  editApiBase() {
    const that = this;
    wx.showModal({
      title: "服务器地址",
      editable: true,
      placeholderText: that.data.apiBase || "https://example.com",
      success(res) {
        if (!res.confirm) return;
        session.setApiBase(res.content || "");
        that.setData({ apiBase: session.getApiBase() });
        getApp().loadBootstrap();
      },
    });
  },
});
