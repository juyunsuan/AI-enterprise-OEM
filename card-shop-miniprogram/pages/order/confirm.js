const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const session = require("../../utils/session");

Page({
  data: {
    themeStyle: "",
    id: 0,
    goods: null,
    quantity: 1,
    contact: "",
    email: "",
    takeCardPassword: "",
    couponCode: "",
    couponApplied: false,
    quote: null,
    contactLabel: "",
    needProtocol: false,
    protocolText: "",
    agreed: false,
    loading: true,
    submitting: false,
    error: "",
    payState: "",
  },

  onLoad(query) {
    const app = getApp();
    this.setData({
      themeStyle: app.globalData.themeStyle,
      id: Number(query.id || 0),
      quantity: Math.max(1, Number(query.quantity || 1)),
    });
    app.ensureReady().then(() => this.load());
  },

  load() {
    this.setData({ loading: true, error: "" });
    return api
      .goodsDetail(this.data.id, "")
      .then((data) => {
        const goods = data && data.goods;
        if (!goods) {
          this.setData({
            loading: false,
            error: (data && data.message) || "商品不存在或已下架",
          });
          return;
        }
        const app = getApp();
        const bootstrap = app.bootstrap() || {};
        const needProtocol =
          !!bootstrap.protocolEnabled &&
          app.toggle("protocol") &&
          !!bootstrap.protocolText;
        const min = Math.max(1, Number(goods.limitQuantity || 0));
        this.setData({
          goods: goods,
          quantity: Math.max(min, this.data.quantity),
          contactLabel: this.contactHint(goods.contactMode || "ANY"),
          needProtocol: needProtocol,
          protocolText: needProtocol ? bootstrap.protocolText : "",
          loading: false,
        });
        this.refreshQuote();
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "商品加载失败",
        });
      });
  },

  refreshQuote() {
    const goods = this.data.goods;
    if (!goods) return;
    api
      .quote(goods.id, this.data.quantity, this.data.couponCode)
      .then((data) => {
        this.setData({ quote: data, couponApplied: !!data.couponApplied });
      })
      .catch(() => {
        // 报价失败不阻断下单，提交时后端会再校验一次
      });
  },

  changeQuantity(event) {
    const delta = Number(event.currentTarget.dataset.delta || 0);
    const goods = this.data.goods;
    if (!goods) return;
    const min = Math.max(1, Number(goods.limitQuantity || 0));
    const max = Number(goods.maxQuantity || 0);
    let next = this.data.quantity + delta;
    if (next < min) next = min;
    if (max > 0 && next > max) next = max;
    this.setData({ quantity: next });
    this.refreshQuote();
  },

  onContactInput(event) {
    this.setData({ contact: event.detail.value });
  },

  onEmailInput(event) {
    this.setData({ email: event.detail.value });
  },

  onPasswordInput(event) {
    this.setData({ takeCardPassword: event.detail.value });
  },

  onCouponInput(event) {
    this.setData({ couponCode: event.detail.value });
  },

  applyCoupon() {
    this.refreshQuote();
  },

  toggleAgree() {
    this.setData({ agreed: !this.data.agreed });
  },

  showProtocol() {
    wx.showModal({
      title: "购卡协议",
      content: this.data.protocolText || "店主未填写协议正文",
      showCancel: false,
      confirmText: "我知道了",
    });
  },

  contactHint(mode) {
    if (mode === "MOBILE") return "手机号";
    if (mode === "EMAIL") return "邮箱";
    if (mode === "QQ") return "QQ 号";
    if (mode === "NONE") return "店主不要求留联系方式（仍建议填写便于查单）";
    return "手机号 / 邮箱 / QQ 任一";
  },

  validate() {
    const goods = this.data.goods;
    const mode = goods.contactMode || "ANY";
    const contact = String(this.data.contact || "").trim();
    if (mode !== "NONE" && !contact) {
      wx.showToast({ title: "请填写" + this.contactHint(mode), icon: "none" });
      return false;
    }
    if (mode === "MOBILE" && !/^1\d{10}$/.test(contact)) {
      wx.showToast({ title: "手机号格式不对", icon: "none" });
      return false;
    }
    if (mode === "EMAIL" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact)) {
      wx.showToast({ title: "邮箱格式不对", icon: "none" });
      return false;
    }
    if (mode === "QQ" && !/^\d{5,12}$/.test(contact)) {
      wx.showToast({ title: "QQ 号格式不对", icon: "none" });
      return false;
    }
    if (
      goods.takeCardMode === "REQUIRED" &&
      !String(this.data.takeCardPassword || "").trim()
    ) {
      wx.showToast({ title: "该商品必须设置取卡密码", icon: "none" });
      return false;
    }
    if (this.data.needProtocol && !this.data.agreed) {
      wx.showToast({ title: "请先阅读并同意购卡协议", icon: "none" });
      return false;
    }
    return true;
  },

  submit() {
    if (this.data.submitting || !this.data.goods) return;
    if (!this.validate()) return;
    const goods = this.data.goods;
    this.setData({ submitting: true });
    api
      .orderCreate({
        site: getApp().bootstrap().siteCode || "",
        goodsId: goods.id,
        quantity: this.data.quantity,
        contact: String(this.data.contact || "").trim(),
        email: String(this.data.email || "").trim(),
        takeCardPassword: String(this.data.takeCardPassword || ""),
        couponCode: String(this.data.couponCode || "").trim(),
        agreed: this.data.agreed,
      })
      .then((data) => {
        this.setData({ submitting: false });
        const contact = String(this.data.contact || "").trim();
        session.setContact(data.orderNo, contact);
        getApp().globalData.payDraft = {
          orderNo: data.orderNo,
          totalAmount: data.totalAmount,
          quantity: data.quantity,
          contact: contact,
          goodsName: goods.name,
          payEnabled: data.payEnabled,
          payParams: data.payParams,
          message: data.message,
        };
        if (data.payEnabled && data.payParams) {
          wx.navigateTo({
            url: "/pages/order/pay?orderNo=" + data.orderNo,
          });
          return;
        }
        this.showOffline(data, contact);
      })
      .catch((error) => {
        this.setData({ submitting: false });
        auth.showError(error, "下单失败");
      });
  },

  showOffline(data, contact) {
    wx.showModal({
      title: "订单已提交",
      content:
        "店主暂未开通在线收款。请把订单号 " +
        data.orderNo +
        "（¥" +
        format.money(data.totalAmount) +
        "）发给店主完成付款，付款后可凭单号与联系方式查卡。",
      confirmText: "去查单",
      cancelText: "稍后",
      success: (res) => {
        if (res.confirm) {
          wx.redirectTo({
            url:
              "/pages/query/query?orderNo=" +
              data.orderNo +
              "&contact=" +
              encodeURIComponent(contact),
          });
        } else {
          wx.switchTab({ url: "/pages/order/list" });
        }
      },
    });
  },
});
