const api = require("../../utils/api");
const format = require("../../utils/format");
const labels = require("../../utils/labels");

/** 服务入口 → 落地页；没有对应页面的入口不渲染，避免点了无反应。 */
const ENTRY_DEST = {
  register: "/consumer/service/list?bizType=REGISTER",
  consultText: "",
  consultPhone: "",
  consultVideo: "",
  exam: "/consumer/service/list?bizType=EXAM",
  guidance: "/consumer/service/list?bizType=GUIDANCE",
  green: "/consumer/service/list?bizType=GREEN",
  concierge: "/consumer/service/list?bizType=CONCIERGE",
  reportRead: "/consumer/report/list",
  signPkg: "/consumer/service/list?bizType=SIGN_PKG",
  yearCard: "/consumer/service/list?bizType=YEAR_CARD",
  goods: "/consumer/mall/list",
  metrics: "/consumer/metrics/index",
  followup: "/consumer/followup/list",
  medication: "/consumer/medication/index",
  articles: "/consumer/article/list",
  question: "/consumer/article/list?mode=question",
  community: "/consumer/article/list?mode=post",
  member: "/consumer/member/index",
  coupon: "/consumer/member/index?tab=coupon",
  wallet: "/consumer/member/index?tab=wallet",
  serviceDesk: "",
  tongue: "/consumer/tongue/index",
};

Page({
  data: {
    loading: true,
    disabled: false,
    reason: "",
    bootstrap: null,
    banners: [],
    notices: [],
    entries: [],
    hotKeywords: [],
    services: [],
    doctors: [],
    articles: [],
    consultWays: [
      { key: "TEXT", label: "图文问诊", desc: "随时提问，医生空余时回复" },
      { key: "PHONE", label: "电话问诊", desc: "预约时段，医生电话回拨" },
      { key: "VIDEO", label: "视频问诊", desc: "预约时段，视频面对面" },
    ],
  },

  onLoad() {
    this.load();
  },

  onShow() {
    // 换过店铺或改了外观后回到首页时补刷一次，比较引用即可（applyBootstrap 存的是同一对象）
    const app = getApp();
    if (app.globalData.bootstrap && app.globalData.bootstrap !== this._applied) {
      this.applyBootstrap(app.globalData.bootstrap);
    }
  },

  onPullDownRefresh() {
    getApp().globalData.ready = null;
    this.load().then(() => wx.stopPullDownRefresh());
  },

  async load() {
    this.setData({ loading: true });
    const app = getApp();
    const bootstrap = await app.ensureReady();
    if (!bootstrap || bootstrap.enabled === false) {
      this.setData({
        loading: false,
        disabled: true,
        reason: (bootstrap && bootstrap.reason) || app.globalData.bootstrapError || "店铺服务暂不可用",
      });
      return;
    }
    this.applyBootstrap(bootstrap);
    const [services, doctors, articles] = await Promise.all([
      api.services({ page: 1, pageSize: 6 }).catch(() => ({ list: [] })),
      api.practitioners({ page: 1, pageSize: 6 }).catch(() => ({ list: [] })),
      api.articles({ page: 1, pageSize: 3 }).catch(() => ({ list: [] })),
    ]);
    this.setData({
      loading: false,
      services: ((services && services.list) || []).map((row) => ({
        ...row,
        priceText: format.yuan(row.priceCents),
        originText: row.originPriceCents > row.priceCents ? format.yuan(row.originPriceCents) : "",
        bizLabel: labels.pick(labels.BIZ_LABELS, row.bizType),
      })),
      doctors: ((doctors && doctors.list) || []).map((row) => ({
        ...row,
        roleLabel: labels.pick(
          { DOCTOR: "医生", MANAGER: "健管师", PHARMACIST: "药师", GUIDE: "导诊师" },
          row.role,
        ),
        scoreText: row.score > 0 ? row.score.toFixed(1) : "",
      })),
      articles: ((articles && articles.list) || []).map((row) => ({
        ...row,
        timeText: format.shortTime(row.publishedAt),
        authorLine: [row.authorName, format.shortTime(row.publishedAt)]
          .filter((part) => part && part !== "—")
          .join(" · "),
      })),
    });
  },

  applyBootstrap(bootstrap) {
    this._applied = bootstrap;
    const entries = (bootstrap.entries || [])
      .filter((item) => item.visible)
      .sort((a, b) => (a.sort || 0) - (b.sort || 0))
      .map((item) => {
        const label = labels.pick(labels.ENTRY_LABELS, item.key, item.key);
        return { key: item.key, label, badge: label.slice(0, 2) };
      });
    this.setData({
      bootstrap,
      banners: bootstrap.banners || [],
      notices: (bootstrap.notices || []).map((item) => ({
        ...item,
        lineText: item.title ? item.title + "：" + item.content : item.content,
      })),
      hotKeywords: bootstrap.hotKeywords || [],
      entries,
    });
  },

  onEntry(e) {
    const key = e.currentTarget.dataset.key;
    if (key === "consultText" || key === "consultPhone" || key === "consultVideo") {
      wx.switchTab({ url: "/pages/consult/list" });
      return;
    }
    if (key === "serviceDesk") {
      wx.switchTab({ url: "/pages/consult/list" });
      return;
    }
    const dest = ENTRY_DEST[key];
    if (!dest) {
      wx.showToast({ title: "该入口暂未开放", icon: "none" });
      return;
    }
    wx.navigateTo({ url: dest });
  },

  onBanner(e) {
    const { linkType, linkValue } = e.currentTarget.dataset;
    if (linkType === "SERVICE" && linkValue) {
      wx.navigateTo({ url: "/consumer/service/detail?id=" + linkValue });
    } else if (linkType === "ARTICLE" && linkValue) {
      wx.navigateTo({ url: "/consumer/article/detail?id=" + linkValue });
    } else if (linkType === "URL" && linkValue) {
      wx.navigateTo({ url: "/consumer/webview/webview?url=" + encodeURIComponent(linkValue) });
    }
  },

  onSearch() {
    wx.navigateTo({ url: "/consumer/search/index" });
  },

  onKeyword(e) {
    const keyword = e.currentTarget.dataset.word || "";
    wx.navigateTo({ url: "/consumer/search/index?keyword=" + encodeURIComponent(keyword) });
  },

  onService(e) {
    wx.navigateTo({ url: "/consumer/service/detail?id=" + e.currentTarget.dataset.id });
  },

  onDoctor(e) {
    wx.navigateTo({ url: "/consumer/doctor/detail?id=" + e.currentTarget.dataset.id });
  },

  onArticle(e) {
    wx.navigateTo({ url: "/consumer/article/detail?id=" + e.currentTarget.dataset.id });
  },

  onConsultWay(e) {
    // 先把问诊方式放到本地，问诊页 onShow 里取；switchTab 不接 query
    wx.setStorageSync("health:consultWay", e.currentTarget.dataset.way || "");
    wx.switchTab({ url: "/pages/consult/list" });
  },

  onMoreServices() {
    wx.switchTab({ url: "/pages/service/list" });
  },

  onMoreDoctors() {
    wx.navigateTo({ url: "/consumer/doctor/list" });
  },

  onMoreArticles() {
    wx.navigateTo({ url: "/consumer/article/list" });
  },

  onOrders() {
    wx.navigateTo({ url: "/consumer/order/list" });
  },

  onFollowups() {
    wx.navigateTo({ url: "/consumer/followup/list" });
  },

  onMetrics() {
    wx.navigateTo({ url: "/consumer/metrics/index" });
  },

  onNotice(e) {
    const content = e.currentTarget.dataset.content || "";
    if (!content) return;
    wx.showModal({ title: "店铺公告", content, showCancel: false, confirmText: "知道了" });
  },

  onCall() {
    const phone = (this.data.bootstrap && this.data.bootstrap.servicePhone) || "";
    if (!phone) return;
    wx.makePhoneCall({ phoneNumber: phone });
  },

  onRetry() {
    getApp().globalData.ready = null;
    this.load();
  },
});
