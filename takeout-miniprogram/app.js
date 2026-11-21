const api = require("./utils/api");
const auth = require("./utils/auth");
const session = require("./utils/session");

App({
  globalData: {
    bootstrap: null,
    bootstrapError: "",
    configError: "",
    ready: null,
    customer: null,
    /** 地址页选中的临时结果，页面间传递不落存储。 */
    selectedAddressId: 0,
  },

  onLaunch() {
    this.globalData.configError = this.checkConfig();
    this.globalData.ready = this.loadBootstrap();
    this.globalData.ready.then(() => auth.silentLogin());
  },

  checkConfig() {
    const problems = [];
    if (!session.getApiBase()) problems.push("apiBase 未填写");
    if (!session.getShopCode()) problems.push("shopCode 未填写");
    return problems.length ? problems.join(" / ") : "";
  },

  loadBootstrap() {
    if (this.globalData.configError) {
      this.globalData.bootstrapError =
        "请先在 config.js 填好 apiBase 与 shopCode 再编译（取值见门店后台）";
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
          (error && error.message) || "门店暂不可用，请稍后再试";
        return null;
      });
  },

  applyBootstrap(data) {
    this.globalData.bootstrap = data || null;
    const theme = (data && data.themeColor) || session.getThemeColor() || "#e64340";
    const title = (data && data.name) || session.getAppName() || "外卖点餐";
    wx.setNavigationBarTitle({ title: title });
    wx.setNavigationBarColor({
      frontColor: "#ffffff",
      backgroundColor: theme,
      fail() {},
    });
    wx.setTabBarStyle({
      selectedColor: theme,
      fail() {},
    });
  },

  ensureReady() {
    if (!this.globalData.ready) this.globalData.ready = this.loadBootstrap();
    return this.globalData.ready;
  },

  bootstrap() {
    return this.globalData.bootstrap || {};
  },

  serviceEntry() {
    const data = this.bootstrap();
    return {
      url: String(data.deskEmbedUrl || ""),
      deskSiteKey: String(data.deskSiteKey || ""),
      phone: String(data.servicePhone || "").trim(),
      open: data.open !== false && data.status === "ONLINE",
    };
  },

  shopAvailable() {
    return !!(this.globalData.bootstrap && this.globalData.bootstrap.shopId);
  },

  /** 点餐页角标：任何失败都静默，角标不是交易关键路径。 */
  refreshCartBadge() {
    if (!session.getToken()) {
      wx.removeTabBarBadge({ index: 1, fail() {} });
      return Promise.resolve(0);
    }
    return api
      .cart()
      .then((data) => {
        const count = Number((data && data.totalQuantity) || 0);
        if (count > 0) {
          wx.setTabBarBadge({ index: 1, text: count > 99 ? "99+" : String(count) });
        } else {
          wx.removeTabBarBadge({ index: 1, fail() {} });
        }
        return count;
      })
      .catch(() => 0);
  },
});