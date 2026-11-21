Page({
  data: {
    url: "",
    phone: "",
    shopName: "",
  },

  onLoad() {
    const app = getApp();
    const entry = app.serviceEntry();
    const shop = app.bootstrap();
    this.setData({
      url: entry.url,
      phone: entry.phone,
      shopName: shop.name || "门店",
    });
  },

  callShop() {
    if (!this.data.phone) {
      wx.showToast({ title: "门店未留电话", icon: "none" });
      return;
    }
    wx.makePhoneCall({ phoneNumber: this.data.phone });
  },
});