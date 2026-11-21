const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

/**
 * 手写签名：画完转图片走公开上传（kind=sign），再把直链交给后端落签名表。
 * 端上不生成任何凭据，签名归属由服务端按订单校验。
 */
Page({
  data: {
    loading: true,
    error: "",
    notReady: false,
    readyReason: "",
    orderNo: "",
    amountText: "",
    signed: false,
    signImage: "",
    hasStroke: false,
    submitting: false,
  },

  onLoad(options) {
    this.orderId = Number((options && options.orderId) || 0);
    this.start();
  },

  onReady() {
    const query = wx.createSelectorQuery().in(this);
    query
      .select(".canvas")
      .boundingClientRect((rect) => {
        if (!rect) return;
        this.canvasW = rect.width;
        this.canvasH = rect.height;
      })
      .exec();
  },

  start() {
    if (!this.orderId) {
      this.setData({ loading: false, error: "缺少订单号，请到订单详情重试" });
      return Promise.resolve();
    }
    const app = getApp();
    return app
      .ensureReady()
      .then((shop) => {
        if (!shop || !shop.shopCode) {
          this.setData({
            loading: false,
            notReady: true,
            readyReason: app.globalData.bootstrapError || "店铺尚未开通，请联系店铺方",
          });
          return null;
        }
        return auth.ensureLogin().then(() => this.load());
      })
      .catch((error) => {
        this.setData({
          loading: false,
          notReady: false,
          error: (error && error.message) || "登录失败，请重新进入小程序",
        });
      });
  },

  load() {
    if (!this.orderId) {
      this.setData({ loading: false, error: "缺少订单号，请到订单详情重试" });
      return Promise.resolve();
    }
    this.setData({ loading: true, error: "", notReady: false });
    return api
      .orderDetail(this.orderId)
      .then((row) => {
        const signature = row.signature && row.signature.image ? row.signature.image : "";
        const canSign = (row.actions || []).indexOf("sign") >= 0;
        this.setData({
          loading: false,
          error: canSign || signature ? "" : "当前订单不需要签字（仅已完成订单可签字确认）",
          orderNo: row.orderNo || "",
          amountText: format.yuan(row.payAmountCents),
          signed: !!signature,
          signImage: signature,
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "订单加载失败，请稍后重试",
        });
      });
  },

  context() {
    if (!this.ctx) this.ctx = wx.createCanvasContext("signCanvas", this);
    return this.ctx;
  },

  onTouchStart(event) {
    if (this.data.signed) return;
    const touch = (event.touches && event.touches[0]) || null;
    if (!touch) return;
    this.lastX = touch.x;
    this.lastY = touch.y;
    const ctx = this.context();
    ctx.setStrokeStyle("#1f2329");
    ctx.setLineWidth(4);
    ctx.setLineCap("round");
    ctx.setLineJoin("round");
  },

  onTouchMove(event) {
    if (this.data.signed || this.lastX === undefined) return;
    const touch = (event.touches && event.touches[0]) || null;
    if (!touch) return;
    const ctx = this.context();
    ctx.beginPath();
    ctx.moveTo(this.lastX, this.lastY);
    ctx.lineTo(touch.x, touch.y);
    ctx.stroke();
    ctx.draw(true);
    this.lastX = touch.x;
    this.lastY = touch.y;
    if (!this.data.hasStroke) this.setData({ hasStroke: true });
  },

  onTouchEnd() {
    this.lastX = undefined;
    this.lastY = undefined;
  },

  clear() {
    if (this.data.signed) return;
    const ctx = this.context();
    ctx.clearRect(0, 0, this.canvasW || 750, this.canvasH || 360);
    ctx.draw();
    this.setData({ hasStroke: false });
  },

  submit() {
    if (this.data.submitting) return;
    if (this.data.signed) {
      wx.navigateBack();
      return;
    }
    if (!this.data.hasStroke) {
      wx.showToast({ title: "请先在框内手写签名", icon: "none" });
      return;
    }
    const self = this;
    this.setData({ submitting: true });
    wx.canvasToTempFilePath({
      canvasId: "signCanvas",
      destWidth: (this.canvasW || 750) * 2,
      destHeight: (this.canvasH || 360) * 2,
      success(res) {
        self.upload(res.tempFilePath);
      },
      fail() {
        self.setData({ submitting: false });
        wx.showToast({ title: "签名图生成失败，请重试", icon: "none" });
      },
    });
  },

  upload(filePath) {
    const self = this;
    api
      .upload(filePath, "sign")
      .then((data) => {
        const url = data && data.url;
        if (!url) throw new Error("签名图上传返回为空，请重试");
        return api.signOrder(this.orderId, url);
      })
      .then(() => {
        self.setData({ submitting: false, signed: true });
        wx.showToast({ title: "签字完成", icon: "success" });
        setTimeout(() => wx.navigateBack(), 800);
      })
      .catch((error) => {
        self.setData({ submitting: false });
        wx.showModal({
          title: "签字未完成",
          content: (error && error.message) || "请稍后重试",
          showCancel: false,
        });
      });
  },
});
