const api = require("./utils/api");
const auth = require("./utils/auth");
const session = require("./utils/session");

App({
  globalData: {
    bootstrap: null,
    bootstrapError: "",
    ready: null,
    /** 结算页与地址簿之间的临时传值，读完即清。 */
    pickedAddress: null,
  },

  onLaunch(options) {
    this.applyEntryMarket(options);
    this.globalData.ready = this.loadBootstrap();
    this.globalData.ready.then(() => {
      // 静默登录只影响购物车 / 订单 / 地址；失败不打扰逛店的顾客
      if (this.globalData.bootstrap) auth.ensureLogin().catch(() => {});
    });
  },

  /** 小程序码的 scene 带的是市场编号：与 config.js 里填的不一致时以码为准。 */
  applyEntryMarket(options) {
    const query = (options && options.query) || {};
    let scene = String((options && options.scene) || "");
    try {
      scene = decodeURIComponent(scene);
    } catch (error) {
      scene = "";
    }
    const code = String(query.market || scene || "").trim();
    if (/^[0-9A-Za-z]{4,16}$/.test(code)) session.setMarketCode(code);
  },

  /**
   * 市场配置只拉一次；失败时页面按「未开通」渲染并保留原因，
   * 不用假数据兜底——用默认店名渲染出的购买入口更容易造成误下单。
   */
  loadBootstrap() {
    if (!session.getMarketCode()) {
      this.globalData.bootstrapError =
        "小程序没有绑定市场编号，请按后台「小程序发布说明」核对 config.js 的 marketCode";
      return Promise.resolve(null);
    }
    return api
      .bootstrap()
      .then((data) => {
        this.applyBootstrap(data);
        return data;
      })
      .catch((error) => {
        this.globalData.bootstrapError =
          (error && error.message) || "市场服务暂不可用";
        return null;
      });
  },

  applyBootstrap(data) {
    const market = (data && data.market) || {};
    const themeColor = market.themeColor || session.themeColor || "#3370ff";
    this.globalData.bootstrap = data || null;
    wx.setNavigationBarColor({
      frontColor: "#ffffff",
      backgroundColor: themeColor,
    });
    wx.setNavigationBarTitle({
      title: market.name || session.appName || "多店铺商城",
    });
    wx.setTabBarStyle({
      color: "#8a8f99",
      selectedColor: themeColor,
      backgroundColor: "#ffffff",
      borderStyle: "black",
    });
  },

  ensureReady() {
    if (!this.globalData.ready) this.globalData.ready = this.loadBootstrap();
    return this.globalData.ready;
  },

  bootstrap() {
    return this.globalData.bootstrap || {};
  },

  /** 下拉刷新与「重新加载」共用：清掉缓存后重新拉一次。 */
  reload() {
    this.globalData.bootstrap = null;
    this.globalData.bootstrapError = "";
    this.globalData.ready = null;
    return this.ensureReady();
  },

  hasToken() {
    return !!session.getToken();
  },

  /** 在线客服入口：市场绑定了 AI 客服站点才有会话地址，否则客服页显示未开通。 */
  serviceEntry() {
    const market = this.bootstrap().market || {};
    return {
      url: String(market.deskEmbedUrl || ""),
      deskSiteKey: String(market.deskSiteKey || ""),
      marketName: String(market.name || ""),
    };
  },
});
