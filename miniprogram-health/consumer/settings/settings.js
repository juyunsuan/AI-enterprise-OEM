const auth = require("../../utils/auth");
const config = require("../../config");
const format = require("../../utils/format");
const session = require("../../utils/session");

function miniVersion() {
  try {
    const info = wx.getAccountInfoSync();
    return (info && info.miniProgram && info.miniProgram.version) || "开发版";
  } catch (e) {
    return "开发版";
  }
}

Page({
  data: {
    shop: null,
    agreements: [],
    expandedKey: "",
    emergencyTip: "",
    apiBase: "",
    override: "",
    builtinBase: config.apiBase || "",
    templateVersion: config.templateVersion || "",
    versionText: "开发版",
    loggedIn: false,
  },

  onLoad() {
    this.setData({
      versionText: miniVersion(),
      loggedIn: !!getApp().hasToken(),
    });
    this.refreshBase();
    this.loadBootstrap();
  },

  onShow() {
    this.setData({ loggedIn: !!getApp().hasToken() });
  },

  async loadBootstrap() {
    const app = getApp();
    const data = (await app.ensureReady()) || app.bootstrap();
    this.setData({
      shop: {
        shopName: data && data.shopName,
        shopCode: session.getShopCode() || (data && data.shopCode) || "",
        servicePhone: (data && data.servicePhone) || "",
        logo: (data && data.logo) || "",
      },
      agreements: ((data && data.agreements) || []).map((row) => ({
        ...row,
        updatedText: row.updatedAt ? format.dateOnly(row.updatedAt) : "",
      })),
      emergencyTip: (data && data.emergencyTip) || "",
    });
  },

  refreshBase() {
    this.setData({
      apiBase: session.getApiBase(),
      override: session.getApiBaseOverride(),
    });
  },

  onBaseInput(e) {
    this.setData({ apiBase: e.detail.value });
  },

  onSaveBase() {
    const value = String(this.data.apiBase || "").trim();
    if (value && !/^https?:\/\//i.test(value)) {
      wx.showToast({ title: "地址需以 http:// 或 https:// 开头", icon: "none" });
      return;
    }
    session.setApiBase(value);
    this.refreshBase();
    wx.showToast({ title: value ? "已保存" : "已恢复出包地址" });
  },

  onResetBase() {
    session.setApiBase("");
    this.refreshBase();
    wx.showToast({ title: "已恢复出包地址" });
  },

  onToggleAgreement(e) {
    const key = e.currentTarget.dataset.key || "";
    this.setData({ expandedKey: this.data.expandedKey === key ? "" : key });
  },

  onCopyShopCode() {
    const code = (this.data.shop && this.data.shop.shopCode) || "";
    if (!code) return;
    wx.setClipboardData({ data: code });
  },

  onCall() {
    const phone = (this.data.shop && this.data.shop.servicePhone) || "";
    if (!phone) {
      wx.showToast({ title: "店铺未留客服电话", icon: "none" });
      return;
    }
    wx.makePhoneCall({ phoneNumber: phone });
  },

  onLogout() {
    wx.showModal({
      title: "退出登录",
      content: "退出后需重新微信登录，健康档案与订单不会删除。",
      success: (res) => {
        if (!res.confirm) return;
        auth.logout();
        this.setData({ loggedIn: false });
        wx.showToast({ title: "已退出" });
        setTimeout(() => wx.navigateBack(), 600);
      },
    });
  },
});
