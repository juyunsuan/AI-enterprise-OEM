const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

/**
 * 收银台：支付参数优先取下单回包（globalData.tradeDraft），
 * 从订单列表/详情进来时再用 order/pay-params 补一次 prepay。
 * payEnabled=false 的店没开通在线收款，这里只给线下付款说明，绝不拉 wx.requestPayment。
 */
Page({
  data: {
    id: 0,
    orderNo: "",
    payAmountText: "0.00",
    expireText: "",
    payEnabled: true,
    servicePhone: "",
    shopName: "",
    hasParams: false,
    paying: false,
    loading: true,
    message: "",
  },

  onLoad(query) {
    const bootstrap = getApp().bootstrap();
    this.setData({
      id: Number(query.id || 0),
      payEnabled: bootstrap.payEnabled !== false,
      servicePhone: bootstrap.servicePhone || "",
      shopName: bootstrap.name || "商家",
    });
    this.load();
  },

  onUnload() {
    this.stopCountdown();
  },

  load() {
    const draft = getApp().globalData.tradeDraft;
    if (draft && Number(draft.orderId) === this.data.id) {
      this.apply(draft);
      return;
    }
    api
      .payParams(this.data.id)
      .then((data) => this.apply(data))
      .catch((error) => {
        this.setData({ loading: false, message: (error && error.message) || "支付信息获取失败" });
      });
  },

  apply(data) {
    const params = data && data.payParams;
    this.setData({
      loading: false,
      orderNo: (data && data.orderNo) || "",
      payAmountText: format.money(data && data.payAmount),
      hasParams: !!(params && params.paySign),
      expireAt: (data && data.expireAt) || "",
    });
    this.startCountdown();
  },

  startCountdown() {
    this.stopCountdown();
    if (!this.data.expireAt) return;
    this.timer = setInterval(() => {
      const text = format.countdown(this.data.expireAt);
      this.setData({ expireText: text });
      if (text === "00:00") this.stopCountdown();
    }, 1000);
    this.setData({ expireText: format.countdown(this.data.expireAt) });
  },

  stopCountdown() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  },

  payNow() {
    if (this.data.paying) return;
    if (!this.data.payEnabled) {
      this.offlineTip();
      return;
    }
    const ready = this.data.hasParams
      ? Promise.resolve(getApp().globalData.tradeDraft)
      : api.payParams(this.data.id);
    this.setData({ paying: true });
    ready
      .then((data) => {
        const params = data && data.payParams;
        if (!params || !params.paySign) {
          throw { message: "商家还未完成微信支付配置，请改用线下支付" };
        }
        return new Promise((resolve, reject) => {
          wx.requestPayment({
            timeStamp: params.timeStamp,
            nonceStr: params.nonceStr,
            package: params.package,
            signType: params.signType || "RSA",
            paySign: params.paySign,
            success: resolve,
            // 用户主动取消不算失败：留在收银台，让他可以改线下或稍后再付。
            fail(err) {
              reject(err);
            },
          });
        });
      })
      .then(() => {
        this.setData({ paying: false });
        getApp().globalData.tradeDraft = null;
        wx.showToast({ title: "支付成功", icon: "success" });
        setTimeout(() => this.goDetail(), 800);
      })
      .catch((error) => {
        this.setData({ paying: false });
        const message = (error && error.errMsg) || (error && error.message) || "支付未完成";
        if (message.indexOf("cancel") >= 0 || message.indexOf("取消") >= 0) {
          wx.showToast({ title: "已取消支付", icon: "none" });
          return;
        }
        auth.showError({ message: message });
      });
  },

  offlineTip() {
    wx.showModal({
      title: "线下支付",
      content:
        "本店暂未开通在线收款。请把订单号「" +
        this.data.orderNo +
        "（¥" +
        this.data.payAmountText +
        "）" +
        "」发给" +
        this.data.shopName +
        "付款，商家确认后会在后台把订单标记为已付款。",
      confirmText: "复制订单号",
      cancelText: "拨打客服",
      success: (res) => {
        if (res.confirm) this.copyOrderNo();
        else this.callService();
      },
    });
  },

  copyOrderNo() {
    wx.setClipboardData({ data: String(this.data.orderNo || ""), fail() {} });
  },

  callService() {
    if (!this.data.servicePhone) {
      wx.showToast({ title: "商家未填写客服电话", icon: "none" });
      return;
    }
    wx.makePhoneCall({ phoneNumber: this.data.servicePhone, fail() {} });
  },

  goDetail() {
    wx.redirectTo({ url: "/pages/order/detail?id=" + this.data.id });
  },

  goOrders() {
    wx.redirectTo({ url: "/pages/order/list?status=ALL" });
  },
});
