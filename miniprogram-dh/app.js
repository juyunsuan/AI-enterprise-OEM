/**
 * 小程序入口：拉站点配置（开关/计价/主题）+ 静默登录，结果挂到 globalData 供各页复用。
 */
const packConfig = require("./config");
const api = require("./utils/api");
const auth = require("./utils/auth");
const session = require("./utils/session");

const DEFAULT_THEME = "#3370ff";
const DEFAULT_SITE_NAME = "AI 数字人分身";

/** 主题色可能是深色也可能是浅色，导航栏前景色按亮度自动取黑/白，避免文字看不见。 */
function frontColorOf(hex) {
  const color = String(hex || "").replace("#", "");
  if (color.length !== 6) return "#ffffff";
  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 160 ? "#000000" : "#ffffff";
}

App({
  globalData: {
    config: null,
    configError: "",
    ready: null,
    loginPromise: null,
    member: null,
    themeColor: DEFAULT_THEME,
    themeStyle: "--primary: " + DEFAULT_THEME + ";",
    siteName: DEFAULT_SITE_NAME,
    slogan: "",
    status: "",
    toggles: {},
    pricing: { pointTitle: "算力", priceVideo: 10, priceTts: 1 },
    clone: {},
    gift: {},
    login: {},
  },

  onLaunch() {
    // 先用上次缓存渲染，再拉最新配置：弱网或后台改版时首页不至于空白。
    this.applyConfig(session.getSiteConfig(), true);
    this.globalData.ready = this.loadConfig();
    this.silentLogin();
  },

  loadConfig() {
    return api
      .config()
      .then((data) => {
        session.setSiteConfig(data || null);
        this.applyConfig(data, false);
        return data;
      })
      .catch((error) => {
        this.globalData.configError = (error && error.message) || "站点配置不可用";
        return null;
      });
  },

  applyConfig(data, fromCache) {
    const themeColor =
      (data && data.themeColor) || packConfig.themeColor || DEFAULT_THEME;
    const siteName =
      (data && data.siteName) || packConfig.siteName || DEFAULT_SITE_NAME;
    this.globalData.config = data || null;
    this.globalData.configError = fromCache ? this.globalData.configError : "";
    this.globalData.themeColor = themeColor;
    this.globalData.themeStyle = "--primary: " + themeColor + ";";
    this.globalData.siteName = siteName;
    this.globalData.slogan = (data && data.slogan) || "";
    this.globalData.status = (data && data.status) || "";
    this.globalData.toggles = (data && data.toggles) || {};
    this.globalData.pricing = (data && data.pricing) || this.globalData.pricing;
    this.globalData.clone = (data && data.clone) || {};
    this.globalData.gift = (data && data.gift) || {};
    this.globalData.login = (data && data.login) || {};

    wx.setNavigationBarColor({
      frontColor: frontColorOf(themeColor),
      backgroundColor: themeColor,
      fail: function () {
        /* 当前页面自定义导航时会失败，忽略 */
      },
    });
    wx.setNavigationBarTitle({ title: siteName });
  },

  /** 静默登录：失败不打扰用户，真正需要会员身份的动作里会再重试一次。 */
  silentLogin() {
    return auth.login().catch(() => null);
  },

  ensureReady() {
    if (!this.globalData.ready) this.globalData.ready = this.loadConfig();
    return this.globalData.ready;
  },

  /** 模块开关：配置未拿到时按「开」处理，失败由页面空态兜底。 */
  toggle(key) {
    const data = this.globalData.config;
    if (!data) return true;
    const toggles = data.toggles || {};
    return toggles[key] !== false;
  },

  /** 站点是否暂停服务：暂停时 C 端登录会被后端拒绝，页面提前提示。 */
  suspended() {
    return this.globalData.status === "SUSPENDED";
  },

  hasToken() {
    return !!session.getToken();
  },
});
