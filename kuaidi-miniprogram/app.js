const api = require("./utils/api");
const auth = require("./utils/auth");
const session = require("./utils/session");

App({
  globalData: {
    bootstrap: null,
    bootstrapError: "",
    sites: [],
    /** 还没选寄件点：首页渲染选点列表，其它页面提示先选点。 */
    needSite: false,
    ready: null,
    /** 下单页与寄/收地址选择之间的临时传值，读完即清。 */
    pickedAddress: null,
  },

  onLaunch(options) {
    this.applyEntrySite(options);
    this.globalData.ready = this.loadBootstrap();
    this.globalData.ready.then(() => {
      // 静默登录只影响「我的订单 / 地址簿 / 在线支付」，失败不打扰逛店的顾客
      if (session.getSite()) auth.ensureLogin().catch(() => {});
    });
  },

  /** 扫码或分享链接里带 site 时直接进对应寄件点，不用再选。 */
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
   * 寄件点配置只拉一次；没选点时先拉列表：只有一个点就直接进，
   * 多个点交给首页选。失败时页面按「未开通」渲染并保留原因，
   * 不做默认值兜底——用假数据渲染出的下单入口更容易造成误下单。
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
        // 点被关停/删除时补拉一份可切换列表，首页据此提供「重新选择寄件点」；
        // 这里不覆盖上面的具体错误，列表失败也不打扰顾客。
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
          (error && error.message) || "寄件点列表读取失败";
        this.globalData.sites = [];
        return [];
      });
  },

  /** 选点/换点：令牌按寄件点签发，换点必须重新登录。 */
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
    const themeColor =
      (data && data.themeColor) || session.themeColor || "#1f6feb";
    this.globalData.bootstrap = data || null;
    wx.setNavigationBarColor({ frontColor: "#ffffff", backgroundColor: themeColor });
    wx.setNavigationBarTitle({
      title: (data && data.name) || session.appName || "快递寄件",
    });
  },

  ensureReady() {
    if (!this.globalData.ready) this.globalData.ready = this.loadBootstrap();
    return this.globalData.ready;
  },

  bootstrap() {
    return this.globalData.bootstrap || {};
  },

  /** 尚未选寄件点的页面统一回首页选点。 */
  goPickSite() {
    wx.switchTab({ url: "/pages/index/index" });
  },

  /** 站点开关：bootstrap 缺字段时按「默认开启」处理，与后端默认值一致。 */
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
});
