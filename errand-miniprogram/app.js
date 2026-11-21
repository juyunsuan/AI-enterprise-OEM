const api = require("./utils/api");
const auth = require("./utils/auth");
const session = require("./utils/session");

App({
  globalData: {
    bootstrap: null,
    bootstrapError: "",
    sites: [],
    needSite: false,
    ready: null,
    /** 建单页与地址簿之间的临时传值，读完即清。 */
    pickedAddress: null,
  },

  onLaunch(options) {
    this.applyEntrySite(options);
    this.globalData.ready = this.loadBootstrap();
    this.globalData.ready.then(() => {
      if (session.getSite()) auth.ensureLogin().catch(() => {});
    });
  },

  /** 扫码或分享链接里带 site 时直接进对应站点。 */
  applyEntrySite(options) {
    const query = (options && options.query) || {};
    let scene = String((options && options.scene) || "");
    try {
      scene = decodeURIComponent(scene);
    } catch (error) {
      scene = "";
    }
    const code = String(query.site || scene || "")
      .trim()
      .toUpperCase();
    if (/^[0-9A-Z]{6,16}$/.test(code)) session.setSite(code);
  },

  /**
   * 站点配置只拉一次；没有站点码时按本小程序 AppID 反查。
   * 失败时页面按「未开通」渲染并保留原因，不用假数据兜底下单入口。
   */
  loadBootstrap() {
    if (!session.getSite()) {
      return this.loadSites().then((sites) => {
        if (sites.length === 1) {
          session.setSite(sites[0].siteCode);
          return this.loadBootstrap();
        }
        this.globalData.needSite = true;
        return null;
      });
    }
    return api
      .bootstrap()
      .then((data) => {
        this.applyBootstrap(data);
        return data;
      })
      .catch((error) => {
        this.globalData.bootstrapError =
          (error && error.message) || "站点服务暂不可用";
        api
          .sites()
          .then((list) => {
            this.globalData.sites = Array.isArray(list) ? list : [];
          })
          .catch(() => {});
        return null;
      });
  },

  loadSites() {
    return api
      .sites()
      .then((list) => {
        const sites = Array.isArray(list) ? list : [];
        this.globalData.sites = sites;
        return sites;
      })
      .catch((error) => {
        this.globalData.bootstrapError =
          (error && error.message) || "站点列表读取失败";
        this.globalData.sites = [];
        return [];
      });
  },

  selectSite(code) {
    session.clear();
    session.setSite(code);
    this.globalData.bootstrap = null;
    this.globalData.bootstrapError = "";
    this.globalData.needSite = false;
    this.globalData.ready = null;
    const ready = this.ensureReady();
    ready.then(() => {
      if (session.getSite()) auth.ensureLogin(true).catch(() => {});
    });
    return ready;
  },

  applyBootstrap(data) {
    const themeColor = (data && data.themeColor) || session.themeColor || "#3370FF";
    this.globalData.bootstrap = data || null;
    wx.setNavigationBarColor({ frontColor: "#ffffff", backgroundColor: themeColor });
    wx.setNavigationBarTitle({ title: (data && data.name) || session.appName || "跑腿" });
  },

  ensureReady() {
    if (!this.globalData.ready) this.globalData.ready = this.loadBootstrap();
    return this.globalData.ready;
  },

  /** 切换服务城市后重拉配置：报价、优惠券、模板与站点规则都按城市重算。 */
  reloadBootstrap() {
    this.globalData.bootstrap = null;
    this.globalData.bootstrapError = "";
    this.globalData.ready = this.loadBootstrap();
    return this.globalData.ready;
  },

  bootstrap() {
    return this.globalData.bootstrap || {};
  },

  goPickSite() {
    wx.switchTab({ url: "/pages/index/index" });
  },

  toggle(key) {
    const data = this.globalData.bootstrap;
    if (data && data.toggles && typeof data.toggles[key] === "boolean") {
      return data.toggles[key];
    }
    return true;
  },

  hasToken() {
    return !!session.getToken();
  },

  hasRiderToken() {
    return !!session.getRiderToken();
  },
});