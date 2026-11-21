const api = require("../../utils/api");
const session = require("../../utils/session");
const format = require("../../utils/format");

/** 首页只展示接口给得到的字段：分类名与技师距离在公开通道里没有，不在这里编。 */
function toServiceCard(row) {
  const highlights = Array.isArray(row.highlights) ? row.highlights : [];
  return {
    id: row.id,
    title: row.title || "未命名服务",
    subtitle: row.subtitle || "",
    cover: row.coverImage || "",
    priceText: format.yuan(row.priceCents),
    durationText: format.duration(row.durationMinutes),
    salesText: row.sales ? "已售 " + row.sales : "",
    highlights: highlights.slice(0, 3),
  };
}

function toStaffCard(row) {
  const rating = Number(row.rating);
  return {
    id: row.id,
    name: row.name || "服务技师",
    avatar: row.avatar || "",
    ratingText: Number.isFinite(rating) ? rating.toFixed(1) : "",
    levelName: row.levelName || "",
  };
}

function toArticleRow(row) {
  return {
    id: row.id,
    title: row.title || "店铺资讯",
    timeText: format.shortTime(row.createdAt),
  };
}

Page({
  data: {
    loading: true,
    error: "",
    shop: {},
    bookingEnabled: false,
    deskKey: "",
    scrmQr: "",
    scrmName: "",
    serviceTotal: 0,
    services: [],
    servicesError: "",
    staff: [],
    articles: [],
    contentLoading: false,
  },

  onLoad() {
    this.start();
  },

  onShow() {
    // 从分包页回来时店铺配置可能已变（例如重新出包），未就绪就再取一次
    if (!this.data.shop.shopCode && !this.booted) this.start();
  },

  /** 店铺配置是首页的前提：拿不到就按「未开通」渲染，不留白屏。 */
  start() {
    if (this.booted) return;
    this.booted = true;
    this.setData({ loading: true, error: "" });
    getApp()
      .ensureReady()
      .then((data) => {
        this.booted = false;
        this.applyShop(data);
      })
      .catch((error) => {
        this.booted = false;
        this.setData({
          loading: false,
          shop: {},
          error: (error && error.message) || "店铺服务暂不可用",
        });
      });
  },

  applyShop(data) {
    const shop = data || {};
    if (!shop.shopCode) {
      this.setData({
        loading: false,
        shop: {},
        error: getApp().globalData.bootstrapError || "店铺尚未开通，请联系店铺方",
      });
      return;
    }
    const features = shop.features || {};
    const desk = shop.desk || {};
    const scrm = shop.scrm || {};
    this.setData({
      loading: false,
      error: "",
      shop: shop,
      bookingEnabled: !!features.booking,
      deskKey: desk.enabled && desk.siteKey ? desk.siteKey : "",
      scrmQr: scrm.enabled && scrm.qrUrl ? scrm.qrUrl : "",
      scrmName: scrm.name || "",
    });
    this.loadContent();
  },

  /** 服务 / 技师 / 资讯三块各自失败各自提示，任何一块挂掉不影响另外两块。 */
  loadContent() {
    this.setData({ contentLoading: true, servicesError: "" });
    const tasks = [
      api
        .services({ page: 1, pageSize: 20 })
        .then((res) => {
          const list = (res && res.list) || [];
          this.setData({
            serviceTotal: Number(res && res.total) || 0,
            services: list.slice(0, 6).map(toServiceCard),
          });
        })
        .catch((error) => {
          this.setData({ servicesError: (error && error.message) || "服务加载失败" });
        }),
      api
        .staffList({ page: 1, pageSize: 10 })
        .then((res) => {
          const list = (res && res.list) || [];
          this.setData({ staff: list.slice(0, 10).map(toStaffCard) });
        })
        .catch(() => this.setData({ staff: [] })),
      api
        .articles({ page: 1, pageSize: 5 })
        .then((res) => {
          const list = (res && res.list) || [];
          this.setData({ articles: list.map(toArticleRow) });
        })
        .catch(() => this.setData({ articles: [] })),
    ];
    Promise.all(tasks).then(() => this.setData({ contentLoading: false }));
  },

  retry() {
    const app = getApp();
    this.booted = true;
    this.setData({ loading: true, error: "" });
    // loadBootstrap 自带兜底，重试时把 ready 换成新 promise，页面其它地方再 ensureReady 才不会拿到旧结果
    app.globalData.ready = app.loadBootstrap();
    app.globalData.ready
      .then((data) => {
        this.booted = false;
        this.applyShop(data);
      })
      .catch(() => {
        this.booted = false;
        this.setData({ loading: false, error: "店铺服务暂不可用" });
      });
  },

  reloadContent() {
    this.loadContent();
  },

  callPhone() {
    const phone = this.data.shop.servicePhone;
    if (!phone) return;
    wx.makePhoneCall({
      phoneNumber: String(phone),
      fail() {
        // 用户取消拨号不算错误，不回提示
      },
    });
  },

  openService(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: "/consumer/service-detail/service-detail?serviceId=" + id,
    });
  },

  openAllServices() {
    wx.switchTab({ url: "/pages/service/service" });
  },

  openStaff(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: "/consumer/staff-detail/staff-detail?staffId=" + id });
  },

  openStaffList() {
    wx.navigateTo({ url: "/consumer/staff-list/staff-list" });
  },

  openArticle(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: "/consumer/article/article?articleId=" + id });
  },

  /** 客服会话在店铺自有域里，端上只负责拼地址打开内嵌页。 */
  openDesk() {
    const apiBase = session.getApiBase();
    if (!apiBase) {
      wx.showToast({ title: "服务器地址未配置", icon: "none" });
      return;
    }
    const url = apiBase + "/embed/service-desk?key=" + this.data.deskKey;
    wx.navigateTo({
      url: "/consumer/webview/webview?url=" + encodeURIComponent(url),
    });
  },

  previewScrm() {
    if (!this.data.scrmQr) return;
    wx.previewImage({ current: this.data.scrmQr, urls: [this.data.scrmQr] });
  },
});
