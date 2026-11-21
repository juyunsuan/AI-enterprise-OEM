/**
 * 小程序入口：拉站点 bootstrap（外观/开关/客服指向）+ 静默登录，挂到 globalData。
 */
const packConfig = require("./config");
const api = require("./utils/api");
const auth = require("./utils/auth");
const session = require("./utils/session");

const DEFAULT_THEME = "#3370ff";
const DEFAULT_SITE_NAME = "卡密商城";

/** 主题色可深可浅：导航栏前景按亮度取黑/白，避免标题看不见。 */
function frontColorOf(hex) {
  const color = String(hex || "").replace("#", "");
  if (color.length !== 6) return "#000000";
  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 160 ? "#000000" : "#ffffff";
}

App({
  globalData: {
    bootstrap: null,
    bootstrapError: "",
    ready: null,
    themeColor: DEFAULT_THEME,
    themeStyle: "--primary: " + DEFAULT_THEME + ";",
    siteName: DEFAULT_SITE_NAME,
    slogan: "",
    toggles: {},
    /** 下单草稿：确认页 → 收银台，避免 URL 里塞长参数。 */
    payDraft: null,
  },

  onLaunch() {
    this.apply(session.getBootstrap(), true);
    this.globalData.ready = this.loadBootstrap();
    // 顾客令牌只服务「我的订单」；失败不打扰浏览。
    auth.login().catch(function () {});
  },

  loadBootstrap() {
    return api
      .bootstrap()
      .then((data) => {
        session.setBootstrap(data || null);
        this.apply(data, false);
        return data;
      })
      .catch((error) => {
        this.globalData.bootstrapError =
          (error && error.message) || "站点配置不可用";
        return null;
      });
  },

  apply(data, fromCache) {
    const themeColor =
      (data && data.themeColor) || packConfig.themeColor || DEFAULT_THEME;
    const siteName =
      (data && data.name) || packConfig.appName || DEFAULT_SITE_NAME;
    this.globalData.bootstrap = data || null;
    this.globalData.bootstrapError = fromCache
      ? this.globalData.bootstrapError
      : "";
    this.globalData.themeColor = themeColor;
    this.globalData.themeStyle = "--primary: " + themeColor + ";";
    this.globalData.siteName = siteName;
    this.globalData.slogan = (data && data.slogan) || "";
    this.globalData.toggles = (data && data.toggles) || {};

    wx.setNavigationBarColor({
      frontColor: frontColorOf(themeColor),
      backgroundColor: themeColor,
      fail: function () {
        /* 页面自定义导航时忽略 */
      },
    });
    wx.setNavigationBarTitle({ title: siteName });
  },

  ensureReady() {
    if (!this.globalData.ready) this.globalData.ready = this.loadBootstrap();
    return this.globalData.ready;
  },

  /** 功能开关：配置未到时按「开」处理，再由页面空态说明失败原因。 */
  toggle(key) {
    const toggles = this.globalData.toggles || {};
    return toggles[key] !== false;
  },

  bootstrap() {
    return this.globalData.bootstrap || {};
  },

  hasToken() {
    return !!session.getToken();
  },

  /** 客服入口：绑定服务站时指向会话，否则回落联系方式名片。 */
  serviceEntry() {
    const data = this.bootstrap();
    const chatReady =
      data.deskSiteKey && data.deskEmbedUrl && this.toggle("deskChat");
    return {
      chatReady: !!chatReady,
      url: chatReady ? data.deskEmbedUrl : "",
      contact: data.contact || {},
    };
  },
});
