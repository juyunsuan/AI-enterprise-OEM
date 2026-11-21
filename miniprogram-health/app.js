const api = require("./utils/api");
const session = require("./utils/session");

App({
  globalData: {
    bootstrap: null,
    bootstrapError: "",
    ready: null,
  },

  onLaunch() {
    this.globalData.ready = this.loadBootstrap();
    this.recordPromoterClick();
  },

  /** 分享链接带 promoter 时记一次点击；归因与登录绑定由服务端完成，失败不影响浏览。 */
  recordPromoterClick() {
    try {
      const launch = wx.getLaunchOptionsSync ? wx.getLaunchOptionsSync() : null;
      const code = (launch && launch.query && launch.query.promoter) || "";
      if (code) api.promoterHit(code).catch(function () {});
    } catch (e) {
      /* 取不到启动参数就跳过 */
    }
  },

  /**
   * 店铺外观与开关只拉一次；失败时页面按「未开通」渲染并保留原因，
   * 顾客看到的提示要和店主后台的引导口径一致，不能只说“加载失败”。
   */
  loadBootstrap() {
    return api
      .bootstrap({ shopCode: session.getShopCode() })
      .then((data) => {
        this.applyBootstrap(data);
        return data;
      })
      .catch((error) => {
        this.globalData.bootstrapError = (error && error.message) || "店铺服务暂不可用";
        return null;
      });
  },

  applyBootstrap(data) {
    const theme = (data && data.theme) || {};
    const color = theme.themeColor || "#1a73e8";
    this.globalData.bootstrap = data || null;
    wx.setNavigationBarColor({ frontColor: "#ffffff", backgroundColor: color });
    wx.setNavigationBarTitle({
      title: theme.navigationTitle || (data && data.shopName) || "健康管理",
    });
    const labels = theme.tabBarLabels || [];
    if (labels.length === 4) {
      labels.forEach((text, index) => {
        if (text) wx.setTabBarItem({ index, text, fail: () => undefined });
      });
    }
  },

  ensureReady() {
    if (!this.globalData.ready) this.globalData.ready = this.loadBootstrap();
    return this.globalData.ready;
  },

  bootstrap() {
    return this.globalData.bootstrap || {};
  },

  themeColor() {
    const theme = this.globalData.bootstrap && this.globalData.bootstrap.theme;
    return (theme && theme.themeColor) || "#1a73e8";
  },

  /** 店主在「装修与协议 → 服务入口」里关掉的入口，端上整块不渲染。 */
  entryVisible(key) {
    const data = this.globalData.bootstrap;
    if (!data) return false;
    const entry = (data.entries || []).find((item) => item.key === key);
    return !!entry && !!entry.visible;
  },

  agreement(key) {
    const data = this.globalData.bootstrap;
    const list = (data && data.agreements) || [];
    return list.find((item) => item.key === key) || null;
  },

  hasToken() {
    return !!session.getToken();
  },
});
