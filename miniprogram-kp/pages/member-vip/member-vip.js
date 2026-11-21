/**
 * 会员中心：会员状态、积分套餐购买、卡密兑换。
 */
const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const session = require("../../utils/session");

Page({
  data: {
    themeStyle: "",
    themeColor: "#3370ff",
    member: {},
    vipText: "",
    pointsText: "0",
    plans: [],
    payReady: false,
    paying: false,
    showBuy: true,
    showKami: true,
    cardCode: "",
    loading: true,
    submitting: false,
  },

  onShow() {
    const app = getApp();
    this.setData({
      themeStyle: app.globalData.themeStyle,
      themeColor: app.globalData.themeColor,
    });
    app.ensureReady().then(() => {
      this.syncRuntime(app);
      this.loadMember();
    });
  },

  syncRuntime(app) {
    const config = app.globalData.config || {};
    this.setData({
      showBuy: app.toggle("buyVip"),
      showKami: app.toggle("kami"),
      payReady: !!config.payReady,
      plans: (config.vipPlans || []).map((item) => ({
        plan: item.plan,
        label: format.planLabel(item.plan),
        price: item.price || 0,
        cashPrice: item.cashPrice || 0,
        cashText: item.cashPrice ? "¥" + (item.cashPrice / 100).toFixed(2) : "",
      })),
    });
  },

  loadMember() {
    return auth
      .ensureMember()
      .then(() => api.member())
      .then((member) => {
        session.setMember(member || null);
        this.setData({ loading: false, member: member || {} });
        this.renderMember(member || {});
      })
      .catch((error) => {
        this.setData({ loading: false });
        auth.showError(error);
      });
  },

  renderMember(member) {
    this.setData({
      pointsText: String(member.points || 0),
      vipText: member.vipActive
        ? "会员有效期至 " + format.dateTime(member.vipUntil)
        : member.vipUntil
          ? "会员已于 " + format.dateTime(member.vipUntil) + " 到期"
          : "当前不是会员",
    });
  },

  /** 套餐是积分价：扣积分由后端在 /vip/buy 里完成，余额不足直接返回中文错误。 */
  onBuy(event) {
    if (this.data.submitting) return;
    const plan = Number(event.currentTarget.dataset.plan);
    const price = event.currentTarget.dataset.price;
    wx.showModal({
      title: "确认开通",
      content: "将使用 " + price + " 积分开通「" + format.planLabel(plan) + "」，确认继续？",
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ submitting: true });
        auth
          .ensureMember()
          .then(() => api.buyVip(plan))
          .then((data) => {
            const member = (data && data.member) || null;
            if (member) session.setMember(member);
            this.setData({ submitting: false });
            wx.showToast({ title: "开通成功", icon: "success" });
            this.loadMember();
          })
          .catch((error) => {
            this.setData({ submitting: false });
            auth.showError(error);
          });
      },
    });
  },

  onCodeInput(event) {
    this.setData({ cardCode: event.detail.value });
  },

  /** 微信支付开通会员：下单 → 调起支付 → 查单 → 刷新会员状态。 */
  onCashBuy(event) {
    if (this.data.paying) return;
    const plan = Number(event.currentTarget.dataset.plan);
    this.setData({ paying: true });
    auth
      .ensureMember()
      .then(() => api.prepay({ kind: "vip", plan }))
      .then(
        (res) =>
          new Promise((resolve, reject) => {
            wx.requestPayment(
              Object.assign({}, res.payParams, {
                success: () => resolve(res.orderNo),
                fail: reject,
              }),
            );
          }),
      )
      .then((orderNo) => this.pollPay(orderNo))
      .then((paid) => {
        this.setData({ paying: false });
        wx.showToast({
          title: paid ? "开通成功" : "支付结果确认中",
          icon: paid ? "success" : "none",
        });
        if (paid) this.loadMember();
      })
      .catch((error) => {
        this.setData({ paying: false });
        const message = String((error && error.errMsg) || "");
        if (message.indexOf("cancel") >= 0) {
          wx.showToast({ title: "已取消支付", icon: "none" });
          return;
        }
        auth.showError(error);
      });
  },

  pollPay(orderNo, tries) {
    const attempt = Number(tries) || 0;
    return api
      .payQuery(orderNo)
      .then((data) => {
        if (data && data.status === "paid") return true;
        if (attempt >= 5) return false;
        return new Promise((resolve) => setTimeout(resolve, 1500)).then(() =>
          this.pollPay(orderNo, attempt + 1),
        );
      })
      .catch(() => false);
  },

  onRedeem() {
    const code = String(this.data.cardCode || "").trim();
    if (!code) {
      wx.showToast({ title: "请输入卡密", icon: "none" });
      return;
    }
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    auth
      .ensureMember()
      .then(() => api.redeemCode(code))
      .then((data) => {
        this.setData({ submitting: false, cardCode: "" });
        if (data && data.member) session.setMember(data.member);
        wx.showToast({ title: (data && data.message) || "兑换成功", icon: "none", duration: 2500 });
        this.loadMember();
      })
      .catch((error) => {
        this.setData({ submitting: false });
        auth.showError(error);
      });
  },

  goFavorites() {
    wx.navigateTo({ url: "/pages/my-favorites/my-favorites" });
  },
});
