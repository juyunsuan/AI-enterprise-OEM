const api = require("./utils/api");
const auth = require("./utils/auth");
const diy = require("./utils/diy-render");
const session = require("./utils/session");

App({
  globalData: {
    bootstrap: null,
    bootstrapError: "",
    configError: "",
    ready: null,
    customer: null,
    loginPromise: null,
    /** 结算页与订单页之间传递的临时上下文（下单后的支付参数等），不落存储。 */
    tradeDraft: null,
  },

  onLaunch() {
    this.globalData.configError = this.checkConfig();
    this.globalData.ready = this.loadBootstrap();
    // 顾客令牌静默换一次：失败不打扰浏览，用到身份的动作会再重试。
    this.globalData.ready.then(() => auth.silentLogin());
  },

  /** 参数没填时的可读提示，比满屏请求失败好排查。 */
  checkConfig() {
    const problems = [];
    if (!session.getApiBase()) problems.push("apiBase 未填写");
    if (!session.getShopCode()) problems.push("shopCode 未填写");
    return problems.length ? problems.join(" / ") : "";
  },

  /**
   * bootstrap 匿名且只拉一次：店铺名/主题色/支付开关/三个主页面的装修快照都在里面。
   * 失败时保留原因，页面按「未开放」渲染，不能只说「加载失败」。
   */
  loadBootstrap() {
    if (this.globalData.configError) {
      this.globalData.bootstrapError = "请先在 config.js 填好 apiBase 与 shopCode 再编译（取值见平台「小程序发布说明」）";
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
          (error && error.message) || "商城暂不可用，请稍后再试";
        return null;
      });
  },

  applyBootstrap(data) {
    this.globalData.bootstrap = data || null;
    const ctx = diy.buildCtx(data, "HOME");
    this.globalData.themeColor = ctx.themeColor;
    // 标题优先级：装修后的店名 > config.js 里填的 appName > app.json 里的「商城」。
    const title = ctx.shop.name || session.getAppName() || "商城";
    wx.setNavigationBarTitle({ title: title });
    wx.setNavigationBarColor({
      frontColor: "#ffffff",
      backgroundColor: ctx.themeColor,
      fail() {
        /* 部分基础库不支持改色，忽略即可 */
      },
    });
    wx.setTabBarStyle({
      selectedColor: ctx.themeColor,
      fail() {
        /* 非 tabBar 页面调用会失败，忽略 */
      },
    });
    return data;
  },

  ensureReady() {
    if (!this.globalData.ready) this.globalData.ready = this.loadBootstrap();
    return this.globalData.ready;
  },

  bootstrap() {
    return this.globalData.bootstrap || {};
  },

  /**
   * 在线客服入口：绑定了 AI 客服站点时返回 web-view 地址，
   * 未绑定（或站点已停用）时 url 为空，页面回落客服电话。
   */
  serviceEntry() {
    const data = this.bootstrap();
    return {
      url: String(data.deskEmbedUrl || ""),
      deskSiteKey: String(data.deskSiteKey || ""),
      phone: String(data.servicePhone || "").trim(),
    };
  },

  /** 取某个主页面的发布快照（HOME/CATEGORY/MINE），没装修返回 null。 */
  pageSnapshot(type) {
    return diy.pageOf(this.globalData.bootstrap, type);
  },

  /** 页面只关心「有没有店」，配置缺失与店铺关闭都当成未开放。 */
  shopAvailable() {
    const data = this.globalData.bootstrap;
    return !!(data && data.shopId);
  },

  /** 购物车角标：数量来自 /cart，任何失败都静默（角标不是关键路径）。 */
  refreshCartBadge() {
    if (!session.getToken()) {
      wx.removeTabBarBadge({ index: 2, fail() {} });
      return Promise.resolve(0);
    }
    return api
      .cart()
      .then((data) => {
        const count = Number((data && data.totalQuantity) || 0);
        if (count > 0) {
          wx.setTabBarBadge({ index: 2, text: count > 99 ? "99+" : String(count) });
        } else {
          wx.removeTabBarBadge({ index: 2, fail() {} });
        }
        return count;
      })
      .catch(() => 0);
  },
});
