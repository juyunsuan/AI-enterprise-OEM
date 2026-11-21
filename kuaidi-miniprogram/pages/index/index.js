const app = getApp();

Page({
  data: {
    loading: true,
    error: "",
    sites: [],
    needPick: false,
    site: {},
    themeColor: "#1f6feb",
    notice: "",
    myOrders: true,
    addressBook: true,
    desk: false,
    showContact: false,
    contact: {},
    companies: [],
  },

  onShow() {
    this.load();
  },

  load() {
    this.setData({ loading: !app.globalData.bootstrap, error: "" });
    app.ensureReady().then((data) => {
      if (!data) {
        const sites = app.globalData.sites || [];
        if (app.globalData.needSite) {
          this.setData({
            loading: false,
            error: sites.length
              ? ""
              : app.globalData.bootstrapError || "寄件点列表读取失败",
            sites: sites,
            needPick: true,
          });
          return;
        }
        this.setData({
          loading: false,
          error: app.globalData.bootstrapError || "站点服务暂不可用",
          sites: app.globalData.sites || [],
        });
        return;
      }
      this.setData({
        loading: false,
        error: "",
        needPick: false,
        sites: app.globalData.sites || [],
        site: data,
        themeColor: data.themeColor || "#1f6feb",
        notice: app.toggle("indexNotice") ? data.notice : "",
        myOrders: app.toggle("myOrders"),
        addressBook: app.toggle("addressBook"),
        desk: app.toggle("deskChat") && !!data.deskEmbedUrl,
        showContact:
          app.toggle("contact") &&
          !!(data.contact &&
            (data.contact.phone || data.contact.wechat || data.contact.email)),
        contact: data.contact || {},
        companies: data.companies || [],
      });
    });
  },

  /** 选点：写入本地站点码并重新拉配置，之后所有接口都带这个点。 */
  pickSite(event) {
    const code = event.currentTarget.dataset.code;
    if (!code) return;
    this.setData({ loading: true });
    app.selectSite(code).then((data) => {
      if (!data) {
        this.setData({
          loading: false,
          error: app.globalData.bootstrapError || "寄件点暂不可用，请换个点或稍后重试",
          needPick: true,
        });
        return;
      }
      this.load();
    });
  },

  showPicker() {
    const sites = app.globalData.sites || [];
    if (!sites.length) return;
    this.setData({ needPick: true, error: "" });
  },

  retry() {
    app.globalData.bootstrap = null;
    app.globalData.bootstrapError = "";
    app.globalData.ready = null;
    this.load();
  },

  goCreate() {
    wx.navigateTo({ url: "/pages/create/create" });
  },

  goQuery() {
    wx.switchTab({ url: "/pages/query/query" });
  },

  goOrders() {
    wx.switchTab({ url: "/pages/order-list/order-list" });
  },

  goAddress() {
    wx.navigateTo({ url: "/pages/address/list" });
  },

  goService() {
    const url = app.bootstrap().deskEmbedUrl || "";
    wx.navigateTo({
      url: "/pages/service/service?url=" + encodeURIComponent(url),
    });
  },

  callPhone(event) {
    const phone = event.currentTarget.dataset.phone;
    if (phone) wx.makePhoneCall({ phoneNumber: String(phone) });
  },
});
