const app = getApp();
const api = require("../../utils/api");
const auth = require("../../utils/auth");
const session = require("../../utils/session");

function emptyParty() {
  return { name: "", mobile: "", province: "", city: "", district: "", address: "", lng: 0, lat: 0 };
}

Page({
  data: {
    type: "SEND",
    site: {},
    fromParty: emptyParty(),
    toParty: emptyParty(),
    goodsDesc: "",
    goodsAmount: "",
    weightKg: "",
    distanceKm: "",
    tip: 0,
    tipPresets: [],
    couponId: 0,
    couponName: "",
    points: 0,
    pointsUsed: 0,
    coupons: [],
    remark: "",
    protocolAccepted: false,
    quote: null,
    quoteError: "",
    photos: [],
    submitting: false,
  },

  onLoad(options) {
    this.setData({ type: options.type === "BUY" ? "BUY" : "SEND" });
    app.ensureReady().then((data) => {
      if (!data) return;
      this.setData({
        site: data,
        tipPresets: (data.rule && data.rule.tipPresets) || [],
        weightKg: "",
        distanceKm: "",
      });
    });
    auth
      .ensureLogin()
      .then((customer) => this.setData({ points: Number(customer.points) || 0 }))
      .catch(() => {});
    api.myCoupons().then((rows) => {
      const now = Date.now();
      const usable = (rows || []).filter((row) => !row.used && (!row.expiresAt || Date.parse(row.expiresAt) > now));
      this.setData({ coupons: usable });
    }).catch(() => {});
  },

  onShow() {
    const picked = app.globalData.pickedAddress;
    if (picked) {
      app.globalData.pickedAddress = null;
      const target = picked.type === "TO" ? "toParty" : "fromParty";
      this.setData({ [target]: picked.party });
      this.refreshQuote();
    }
  },

  switchType(event) {
    this.setData({ type: event.currentTarget.dataset.type });
    this.refreshQuote();
  },

  bindPoints(event) {
    const value = Math.max(0, Math.floor(Number(event.detail.value) || 0));
    this.setData({ pointsUsed: Math.min(value, this.data.points) });
    this.refreshQuote();
  },

  bindField(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [field]: event.detail.value });
    if (["distanceKm", "weightKg", "goodsAmount"].indexOf(field) >= 0) this.refreshQuote();
  },

  bindParty(event) {
    const target = event.currentTarget.dataset.target;
    const field = event.currentTarget.dataset.field;
    const party = Object.assign({}, this.data[target]);
    party[field] = event.detail.value;
    this.setData({ [target]: party });
  },

  pickAddress(event) {
    const type = event.currentTarget.dataset.type;
    wx.navigateTo({ url: "/pages/address/list?type=" + type });
  },

  pickTip(event) {
    this.setData({ tip: Number(event.currentTarget.dataset.value) || 0 });
    this.refreshQuote();
  },

  pickCoupon(event) {
    const index = Number(event.detail.value);
    const coupon = this.data.coupons[index];
    this.setData({
      couponId: coupon ? coupon.id : 0,
      couponName: coupon ? coupon.name : "",
    });
    this.refreshQuote();
  },

  toggleProtocol(event) {
    this.setData({ protocolAccepted: !!event.detail.value.length });
  },

  refreshQuote() {
    this.setData({ quoteError: "" });
    api
      .quote({
        serviceType: this.data.type,
        distanceKm: Number(this.data.distanceKm) || 0,
        weightKg: Number(this.data.weightKg) || 0,
        goodsAmount: Number(this.data.goodsAmount) || 0,
        tip: Number(this.data.tip) || 0,
        couponId: Number(this.data.couponId) || 0,
      })
      .then((quote) => this.setData({ quote: quote }))
      .catch((error) => this.setData({ quote: null, quoteError: (error && error.message) || "报价失败" }));
  },

  chooseLocation(event) {
    const target = event.currentTarget.dataset.target;
    wx.chooseLocation({
      success: (result) => {
        const party = Object.assign({}, this.data[target]);
        party.address = result.address || result.name || party.address;
        party.lng = result.longitude || 0;
        party.lat = result.latitude || 0;
        this.setData({ [target]: party });
        this.refreshQuote();
      },
      fail: () => wx.showToast({ title: "未选择位置", icon: "none" }),
    });
  },

  choosePhoto() {
    wx.chooseMedia({
      count: 3,
      mediaType: ["image"],
      success: (result) => {
        const files = result.tempFiles || [];
        files.forEach((file) => {
          wx.showLoading({ title: "上传中" });
          api
            .upload(file.tempFilePath)
            .then((uploaded) => {
              this.setData({ photos: this.data.photos.concat(uploaded.url).slice(0, 6) });
            })
            .catch((error) =>
              wx.showToast({ title: (error && error.message) || "上传失败", icon: "none" })
            )
            .then(() => wx.hideLoading());
        });
      },
    });
  },

  removePhoto(event) {
    const index = Number(event.currentTarget.dataset.index);
    const photos = this.data.photos.slice();
    photos.splice(index, 1);
    this.setData({ photos });
  },

  /** 下单前申请订阅消息；用户拒绝也不阻断下单。 */
  requestSubscribe() {
    const templates = (this.data.site && this.data.site.templates) || {};
    const ids = ["order", "accept", "coachChange", "cancel"]
      .map((key) => templates[key])
      .filter(Boolean);
    if (!ids.length) return Promise.resolve();
    return new Promise((resolve) => {
      wx.requestSubscribeMessage({
        tmplIds: ids.slice(0, 3),
        complete: () => resolve(),
      });
    });
  },

  submit() {
    const data = this.data;
    if (data.submitting) return;
    if (!data.fromParty.address || !data.toParty.address) {
      wx.showToast({ title: "请填写取货与送达地址", icon: "none" });
      return;
    }
    if (!data.fromParty.mobile && !data.toParty.mobile) {
      wx.showToast({ title: "请至少留一个联系电话", icon: "none" });
      return;
    }
    if (data.site.protocolText && !data.protocolAccepted) {
      wx.showToast({ title: "请先勾选下单须知", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    auth
      .ensureLogin()
      .then(() => this.requestSubscribe())
      .then(() =>
        api.createOrder({
          serviceType: data.type,
          fromParty: data.fromParty,
          toParty: data.toParty,
          goodsDesc: data.goodsDesc,
          goodsAmount: Number(data.goodsAmount) || 0,
          weightKg: Number(data.weightKg) || 0,
          distanceKm: Number(data.distanceKm) || 0,
          tip: Number(data.tip) || 0,
          couponId: Number(data.couponId) || 0,
          pointsUsed: Number(data.pointsUsed) || 0,
          contactName: data.fromParty.name,
          contactMobile: data.fromParty.mobile,
          remark: data.remark,
          photos: data.photos,
          protocolAccepted: !!data.protocolAccepted,
        })
      )
      .then((created) => {
        if (created && created.payParams) {
          return new Promise((resolve, reject) => {
            wx.requestPayment(
              Object.assign({}, created.payParams, {
                success: resolve,
                fail: reject,
              })
            );
          })
            .then(() => this.afterCreated(created))
            .catch(() => {
              wx.showModal({
                title: "支付未完成",
                content: "订单已创建，可在「我的订单」里重新支付",
                showCancel: false,
                success: () => this.afterCreated(created),
              });
            });
        }
        wx.showModal({
          title: "订单已创建",
          content: (created && created.message) || "请与店主确认收款",
          showCancel: false,
          success: () => this.afterCreated(created),
        });
        return null;
      })
      .catch((error) => {
        wx.showToast({ title: (error && error.message) || "下单失败", icon: "none" });
      })
      .then(() => this.setData({ submitting: false }));
  },

  afterCreated(created) {
    wx.redirectTo({
      url: "/pages/order-detail/order-detail?orderNo=" + encodeURIComponent(created.orderNo),
    });
  },
});