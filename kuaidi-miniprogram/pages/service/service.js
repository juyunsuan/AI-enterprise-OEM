const app = getApp();

Page({
  data: {
    url: "",
    contact: {},
  },

  onLoad(options) {
    const url = options.url ? decodeURIComponent(options.url) : "";
    this.setData({ url: url });
    app.ensureReady().then((site) => {
      this.setData({ contact: (site && site.contact) || {} });
      if (!url && site && site.deskEmbedUrl) this.setData({ url: site.deskEmbedUrl });
    });
  },

  callPhone() {
    const phone = this.data.contact && this.data.contact.phone;
    if (phone) wx.makePhoneCall({ phoneNumber: String(phone) });
  },

  copyWechat() {
    const wechat = this.data.contact && this.data.contact.wechat;
    if (wechat) wx.setClipboardData({ data: wechat });
  },

  goBack() {
    wx.navigateBack();
  },
});
