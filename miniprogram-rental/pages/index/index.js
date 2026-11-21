const api = require("../../utils/api");
const session = require("../../utils/session");
const format = require("../../utils/format");
const staff = require("../../utils/staff");

function itemCard(row) {
  const attributes = row.attributes || {};
  const tags = Object.keys(attributes)
    .slice(0, 3)
    .map((key) => attributes[key]);
  return {
    id: row.id,
    name: row.name || "未命名租品",
    cover: row.cover || "",
    category: row.category || "",
    priceText: format.yuan(row.dailyRateCents),
    depositText: format.yuan(row.depositCents),
    tags: tags,
  };
}

Page({
  data: {
    loading: true,
    error: "",
    shop: {},
    items: [],
    itemError: "",
    notice: "",
    deskKey: "",
    scrmQr: "",
    scrmName: "",
  },

  onLoad() {
    this.start();
  },

  start() {
    this.setData({ loading: true, error: "" });
    getApp()
      .ensureReady()
      .then((data) => this.applyShop(data))
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "门店服务暂不可用",
        });
      });
  },

  applyShop(data) {
    const shop = data || {};
    if (!shop.shopCode) {
      this.setData({
        loading: false,
        shop: {},
        error: getApp().globalData.bootstrapError || "门店尚未开通，请联系门店",
      });
      return;
    }
    const desk = shop.desk || {};
    const scrm = shop.scrm || {};
    this.setData({
      loading: false,
      error: "",
      shop: shop,
      notice: shop.notice || "",
      deskKey: desk.enabled && desk.siteKey ? desk.siteKey : "",
      scrmQr: scrm.enabled && scrm.qrUrl ? scrm.qrUrl : "",
      scrmName: scrm.name || "",
    });
    this.loadItems();
  },

  loadItems() {
    this.setData({ itemError: "" });
    api
      .items({ page: 1, pageSize: 20 })
      .then((res) => {
        const list = (res && res.list) || [];
        this.setData({ items: list.map(itemCard) });
      })
      .catch((error) => {
        this.setData({ itemError: (error && error.message) || "租品加载失败" });
      });
  },

  openItem(event) {
    wx.navigateTo({ url: "/pages/item/item?id=" + event.currentTarget.dataset.id });
  },

  openOrders() {
    wx.switchTab({ url: "/pages/order-list/order-list" });
  },

  openStaff() {
    staff.openWorkbench();
  },

  openDesk() {
    const base = session.getApiBase();
    if (!this.data.deskKey) return;
    wx.navigateTo({
      url:
        "/pages/webview/webview?src=" +
        encodeURIComponent(base + "/embed/service-desk?key=" + this.data.deskKey),
    });
  },

  previewScrm() {
    if (!this.data.scrmQr) return;
    wx.previewImage({ urls: [this.data.scrmQr] });
  },

  callPhone() {
    if (!this.data.shop.servicePhone) return;
    wx.makePhoneCall({ phoneNumber: this.data.shop.servicePhone });
  },

  retry() {
    getApp().globalData.ready = null;
    this.start();
  },
});