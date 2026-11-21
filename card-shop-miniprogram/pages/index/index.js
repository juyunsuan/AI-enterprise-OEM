const api = require("../../utils/api");
const format = require("../../utils/format");
const link = require("../../utils/link");

Page({
  data: {
    themeStyle: "",
    siteName: "",
    slogan: "",
    logo: "",
    show: {
      search: true,
      banner: true,
      notice: true,
      hot: true,
      categories: true,
      myOrders: true,
    },
    banners: [],
    notices: [],
    categories: [],
    hotGoods: [],
    stockMode: "ACTUAL",
    popup: null,
    loading: true,
    error: "",
    serviceReady: false,
  },

  onShow() {
    const app = getApp();
    this.syncRuntime(app);
    app
      .ensureReady()
      .then(() => {
        this.syncRuntime(app);
        return this.load();
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "站点信息加载失败",
        });
      });
  },

  onPullDownRefresh() {
    this.load(true).then(() => wx.stopPullDownRefresh());
  },

  syncRuntime(app) {
    this.setData({
      themeStyle: app.globalData.themeStyle,
      siteName: app.globalData.siteName,
      slogan: app.globalData.slogan,
      show: {
        search: app.toggle("search"),
        banner: app.toggle("indexBanner"),
        notice: app.toggle("indexNotice"),
        hot: app.toggle("indexHot"),
        categories: app.toggle("categoryPage"),
        myOrders: app.toggle("myOrders"),
      },
      serviceReady: app.serviceEntry().chatReady || !!app.bootstrap().contact,
    });
  },

  load(fromPull) {
    if (!fromPull) this.setData({ loading: true });
    return api
      .bootstrap()
      .then((data) => {
        const stockMode = (data && data.stockDisplayMode) || "ACTUAL";
        const hotGoods = ((data && data.hotGoods) || []).map((goods) =>
          this.decorate(goods, stockMode),
        );
        const popup =
          ((data && data.notices) || []).filter((item) => item.popAuto)[0] ||
          null;
        this.setData({
          siteName: (data && data.name) || this.data.siteName,
          slogan: (data && data.slogan) || "",
          logo: (data && data.logo) || "",
          banners: (data && data.banners) || [],
          notices: (data && data.notices) || [],
          categories: (data && data.categories) || [],
          hotGoods: hotGoods,
          stockMode: stockMode,
          popup: this.data.popupShown ? null : popup,
          loading: false,
          error: "",
        });
        if (popup) this.data.popupShown = true;
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "站点信息加载失败",
        });
      });
  },

  decorate(goods, stockMode) {
    return Object.assign({}, goods, {
      priceText: format.money(goods.price),
      stockText: format.stockText(goods.stock, stockMode),
    });
  },

  goSearch() {
    wx.navigateTo({ url: "/pages/search/search" });
  },

  openGoods(event) {
    wx.navigateTo({
      url: "/pages/goods/detail?id=" + event.currentTarget.dataset.id,
    });
  },

  openCategory(event) {
    const id = Number(event.currentTarget.dataset.id || 0);
    // 分类页是 tabBar 页，switchTab 不接受 query：意图先落缓存，分类页 onShow 自取。
    wx.setStorageSync("card_category_pending", id);
    wx.switchTab({ url: "/pages/category/category" });
  },

  goCategoryHome() {
    wx.switchTab({ url: "/pages/category/category" });
  },

  goNoticeList() {
    wx.navigateTo({ url: "/pages/notice/list" });
  },

  openNotice(event) {
    const id = event.currentTarget.dataset.id;
    wx.navigateTo({ url: "/pages/article/detail?id=" + id + "&kind=NOTICE" });
  },

  openBanner(event) {
    const index = Number(event.currentTarget.dataset.index || 0);
    const banner = this.data.banners[index];
    if (banner) link.open(banner.link);
  },

  closePopup() {
    this.setData({ popup: null });
  },

  openPopupDetail() {
    const popup = this.data.popup;
    this.setData({ popup: null });
    if (popup) {
      wx.navigateTo({
        url: "/pages/article/detail?id=" + popup.id + "&kind=NOTICE",
      });
    }
  },

  goQuery() {
    wx.navigateTo({ url: "/pages/query/query" });
  },

  goService() {
    wx.navigateTo({ url: "/pages/service/index" });
  },

  goMyOrders() {
    wx.switchTab({ url: "/pages/order/list" });
  },

  onShareAppMessage() {
    return {
      title: this.data.siteName || "卡密商城",
      path: "/pages/index/index",
    };
  },
});
