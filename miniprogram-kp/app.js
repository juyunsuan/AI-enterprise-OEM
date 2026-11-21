/**
 * 小程序入口：拉站点配置（含功能开关）+ 静默登录，把结果挂到 globalData 供各页复用。
 */
const packConfig = require("./config");
const api = require("./utils/api");
const auth = require("./utils/auth");
const session = require("./utils/session");

const DEFAULT_THEME = "#3370ff";
const DEFAULT_SITE_NAME = "知识付费云课堂";

/** 主题色可能是深色也可能是浅色，导航栏前景色按亮度自动取黑/白，避免文字看不见。 */
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
    config: null,
    configError: "",
    ready: null,
    loginPromise: null,
    member: null,
    themeColor: DEFAULT_THEME,
    themeStyle: "--primary: " + DEFAULT_THEME + ";",
    siteName: DEFAULT_SITE_NAME,
    slogan: "",
    toggles: {},
  },

  onLaunch() {
    // 先用上一次缓存渲染，再请求最新配置：弱网或后台改版时首页不至于空白。
    this.applyConfig(session.getSiteConfig(), true);
    this.globalData.ready = this.loadConfig();
    this.silentLogin();
  },

  /** 站点配置只拉一次；失败时保留缓存值，页面自己显示错误原因。 */
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
    // 主题色优先级：config.js 里填的 > 服务端 > 默认，方便「先出包后调色」也能覆盖。
    const themeColor =
      packConfig.themeColor ||
      (data && data.themeColor) ||
      DEFAULT_THEME;
    const siteName =
      (data && data.siteName) || packConfig.siteName || DEFAULT_SITE_NAME;
    this.globalData.config = data || null;
    this.globalData.configError = fromCache ? this.globalData.configError : "";
    this.globalData.themeColor = themeColor;
    this.globalData.themeStyle = "--primary: " + themeColor + ";";
    this.globalData.siteName = siteName;
    this.globalData.slogan = (data && data.slogan) || "";
    this.globalData.toggles = (data && data.toggles) || {};

    // 导航栏标题/底色只能运行时改（app.json 里是白底黑字的编译期占位）。
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
    return auth.login().catch(() => {
      // 站点未开会员体系 / 网络异常都属正常情况，这里不弹提示。
      return null;
    });
  },

  ensureReady() {
    if (!this.globalData.ready) this.globalData.ready = this.loadConfig();
    return this.globalData.ready;
  },

  /**
   * 功能开关：整块模块是否渲染。
   * 配置还没拿到时按「开」处理——内容型小程序默认展示比默认隐藏体验更合理，
   * 数据请求失败会在页面里给出错误空态，不会假装一切正常。
   */
  toggle(key) {
    const data = this.globalData.config;
    if (!data) return true;
    if (data.enabled === false) return false;
    const toggles = data.toggles || {};
    return toggles[key] !== false;
  },

  /** 站点整体是否被后台关闭（/config 的 enabled）。 */
  siteEnabled() {
    const data = this.globalData.config;
    return !data || data.enabled !== false;
  },

  configValue(key, fallback) {
    const data = this.globalData.config;
    const value = data && data[key];
    return value === undefined || value === null || value === ""
      ? fallback
      : value;
  },

  hasToken() {
    return !!session.getToken();
  },
});
