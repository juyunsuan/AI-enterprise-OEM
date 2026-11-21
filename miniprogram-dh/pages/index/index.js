/**
 * 首页：轮播 + 公告 + 功能宫格 + 广场精选，全部按站点开关决定是否渲染。
 */
const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const request = require("../../utils/request");
const session = require("../../utils/session");

const GRID = [
  { key: "body", char: "形", title: "形象克隆", toggle: "bodyClone", url: "/pages/body/body" },
  { key: "voice", char: "声", title: "声音克隆", toggle: "voiceClone", url: "/pages/voice/voice" },
  { key: "write", char: "写", title: "AI 写作", toggle: "aiWrite", url: "/pages/write/write" },
  { key: "works", char: "品", title: "我的作品", toggle: "worksPage", url: "/pages/works/works" },
  { key: "vip", char: "会", title: "会员套餐", toggle: "vipPage", url: "/pages/member/member" },
  { key: "promoter", char: "推", title: "推广中心", toggle: "commissionPage", url: "/pages/promoter/promoter" },
  { key: "card", char: "卡", title: "卡密兑换", toggle: "card", url: "/pages/member/member?tab=card" },
  { key: "poster", char: "报", title: "分享海报", toggle: "poster", url: "/pages/poster/poster" },
  { key: "feedback", char: "馈", title: "意见反馈", toggle: "feedback", url: "/pages/feedback/feedback" },
  { key: "desk", char: "客", title: "在线客服", toggle: "serviceDesk", url: "" },
];

Page({
  data: {
    themeStyle: "",
    siteName: "",
    slogan: "",
    logo: "",
    statusNote: "",
    grid: [],
    diy: [],
    showSwiper: true,
    showNotice: true,
    showWorks: true,
    pricing: {},
    giftText: "",
    banners: [],
    notices: [],
    feed: [],
    member: null,
    loading: true,
    error: "",
  },

  onLoad(options) {
    // 分享落地带 tuid 时暂存，等静默登录时提交给后端做邀请归因。
    const tuid = Number((options && options.tuid) || 0);
    if (tuid > 0) {
      try {
        wx.setStorageSync("digital-human:tuid", tuid);
      } catch (e) {
        /* 忽略 */
      }
    }
  },

  onShow() {
    const app = getApp();
    this.syncRuntime(app);
    app.ensureReady().then(() => {
      this.syncRuntime(app);
      this.loadSections();
    });
  },

  onPullDownRefresh() {
    this.loadSections(true).then(() => wx.stopPullDownRefresh());
  },

  onShareAppMessage() {
    const member = session.getMember();
    return {
      title: (this.data.siteName || "AI 数字人分身") + " · 一张照片开口说话",
      path: "/pages/index/index" + (member ? "?tuid=" + member.id : ""),
      imageUrl: this.data.banners.length ? this.data.banners[0].image : "",
    };
  },

  syncRuntime(app) {
    const globals = app.globalData;
    const config = globals.config || {};
    const gift = globals.gift || {};
    const giftParts = [];
    if (gift.vipDays > 0) giftParts.push("会员 " + gift.vipDays + " 天");
    if (gift.point > 0) giftParts.push((globals.pricing.pointTitle || "算力") + " " + gift.point);
    if (gift.body > 0) giftParts.push("形象点 " + gift.body);
    if (gift.voice > 0) giftParts.push("声音点 " + gift.voice);

    let statusNote = "";
    if (globals.status === "SUSPENDED") statusNote = "站点暂停服务中，暂时无法登录与合成";
    else if (globals.status === "CLOSED") statusNote = "站点已关闭";
    else if (!config && globals.configError) statusNote = globals.configError;

    const deskKey = config.serviceDeskSiteKey || "";
    const base = request.baseUrl();
    const deskUrl =
      app.toggle("serviceDesk") && deskKey && base
        ? base + "/embed/service-desk?key=" + encodeURIComponent(deskKey)
        : "";

    this.setData({
      themeStyle: globals.themeStyle,
      siteName: globals.siteName,
      slogan: globals.slogan,
      logo: config.logo || "",
      statusNote: statusNote,
      pricing: globals.pricing || {},
      giftText: giftParts.length ? "新人礼：" + giftParts.join(" · ") : "",
      diy: this.diyComponents(config.diyPage),
      showSwiper: app.toggle("indexSwiper"),
      showNotice: app.toggle("indexNotice"),
      showWorks: app.toggle("worksPage"),
      grid: GRID.filter((item) => app.toggle(item.toggle)).map((item) => ({
        key: item.key,
        char: item.char,
        title: item.title,
        url: item.key === "desk" ? deskUrl : item.url,
      })),
      member: session.getMember(),
    });
  },

  /** 装修组件做一次防御性归一：缺图缺字的项直接丢弃，未知类型跳过。 */
  diyComponents(page) {
    const list = page && Array.isArray(page.components) ? page.components : [];
    const out = [];
    list.forEach((comp) => {
      if (!comp || !comp.type) return;
      const cells = (Array.isArray(comp.items) ? comp.items : [])
        .filter((cell) => cell && (cell.image || cell.text))
        .map((cell) => ({
          image: cell.image || "",
          text: cell.text || "",
          link: cell.link || "",
        }));
      if (
        (comp.type === "swiper" || comp.type === "images" || comp.type === "buttons") &&
        !cells.length
      ) {
        return;
      }
      out.push({
        id: comp.id || "w" + out.length,
        type: comp.type,
        title: comp.title || "",
        height: Number(comp.height) || 0,
        radius: Number(comp.radius) || 0,
        cells: cells,
      });
    });
    return out;
  },

  tapDiy(event) {
    const link = event.currentTarget.dataset.link;
    if (!link) return;
    if (link.indexOf("/") === 0) {
      wx.navigateTo({ url: link });
      return;
    }
    wx.navigateTo({
      url: "/pages/webview/webview?url=" + encodeURIComponent(link),
    });
  },

  loadSections(refresh) {
    const tasks = [];
    tasks.push(
      api
        .swipers()
        .then((rows) => this.setData({ banners: rows || [] }))
        .catch(() => undefined),
    );
    tasks.push(
      api
        .articles("notice")
        .then((rows) => this.setData({ notices: (rows || []).slice(0, 3) }))
        .catch(() => undefined),
    );
    tasks.push(
      api
        .feed({ page: 1, pageSize: 6 })
        .then((page) => {
          this.setData({
            feed: (page && page.list ? page.list : []).map((row) => ({
              id: row.id,
              title: row.title,
              coverUrl: row.coverUrl,
              nickname: row.nickname,
              playCount: row.playCount,
              createdAt: format.day(row.createdAt),
            })),
          });
        })
        .catch(() => undefined),
    );
    // 首页接口失败时用配置错误兜底提示，不弹多个 toast。
    return Promise.all(tasks).then(() => {
      const app = getApp();
      this.setData({
        loading: false,
        error: app.globalData.configError || "",
      });
      // 静默登录可能比首屏晚，登录完成后补一次资产展示。
      auth
        .ensureMember()
        .then((member) => this.setData({ member: member }))
        .catch(() => undefined);
    });
  },

  tapBanner(event) {
    const link = event.currentTarget.dataset.link;
    if (!link) return;
    wx.navigateTo({
      url: "/pages/webview/webview?url=" + encodeURIComponent(link),
    });
  },

  tapGrid(event) {
    const url = event.currentTarget.dataset.url;
    if (!url) {
      wx.showToast({ title: "站点暂未开放该功能", icon: "none" });
      return;
    }
    wx.navigateTo({ url: url });
  },

  goCreate() {
    wx.switchTab({ url: "/pages/create/create" });
  },

  goFeed() {
    wx.switchTab({ url: "/pages/feed/feed" });
  },

  openNotice(event) {
    const id = event.currentTarget.dataset.id;
    wx.navigateTo({ url: "/pages/article/article?id=" + id });
  },

  openWork(event) {
    const id = event.currentTarget.dataset.id;
    wx.navigateTo({ url: "/pages/play/play?id=" + id });
  },

  goMember() {
    wx.navigateTo({ url: "/pages/member/member" });
  },

  onLoginTap() {
    auth
      .ensureMember()
      .then((member) => this.setData({ member: member }))
      .catch(auth.showError);
  },
});
