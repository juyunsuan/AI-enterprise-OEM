const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const session = require("../../utils/session");

/**
 * 订单详情：状态与金额来自查单接口（顾客态没有单条订单接口）。
 * 已支付才展示卡密；待支付给「继续支付」；联系方式从列表带过来，缺失时让顾客补填。
 */
Page({
  data: {
    themeStyle: "",
    orderNo: "",
    contact: "",
    takeCardPassword: "",
    loading: true,
    error: "",
    result: null,
    cards: [],
    needPassword: false,
    canPay: false,
    needContact: false,
  },

  onLoad(query) {
    const app = getApp();
    const orderNo = String(query.orderNo || "");
    const contact = String(
      query.contact || session.getContact(orderNo) || "",
    );
    this.setData({
      themeStyle: app.globalData.themeStyle,
      orderNo: orderNo,
      contact: contact,
    });
    app.ensureReady().then(() => {
      this.setData({ themeStyle: app.globalData.themeStyle });
      if (orderNo) this.load();
      else this.setData({ loading: false, error: "缺少订单号" });
    });
  },

  load() {
    this.setData({ loading: true, error: "" });
    return api
      .orderQuery(
        this.data.orderNo,
        this.data.contact,
        this.data.takeCardPassword,
      )
      .then((data) => {
        if (!data || !data.found) {
          this.setData({
            loading: false,
            error: (data && data.message) || "没有查到这笔订单",
            needContact: !String(this.data.contact || "").trim(),
          });
          return;
        }
        const cards = (data.cards || []).map((card, index) => ({
          id: card.id,
          index: index + 1,
          number: card.number,
          secret: card.secret,
        }));
        this.setData({
          loading: false,
          needContact: false,
          result: {
            payState: data.payState,
            payStateLabel: data.payStateLabel,
            goodsName: data.goodsName,
            quantity: data.quantity,
            totalText: format.money(data.totalAmount),
            createdText: format.dateTime(data.createdAt),
            paidText: format.dateTime(data.paidAt),
            message: data.message,
            remark: data.remark,
          },
          cards: cards,
          needPassword: !!data.needTakeCardPassword,
          canPay: data.payState === "PENDING",
        });
        session.setContact(data.orderNo || this.data.orderNo, this.data.contact);
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "订单加载失败",
        });
      });
  },

  onContactInput(event) {
    this.setData({ contact: event.detail.value });
  },

  onPasswordInput(event) {
    this.setData({ takeCardPassword: event.detail.value });
  },

  retry() {
    if (!String(this.data.contact || "").trim()) {
      wx.showToast({ title: "请填写下单用联系方式", icon: "none" });
      return;
    }
    this.load();
  },

  copyCard(event) {
    const index = Number(event.currentTarget.dataset.index || 0);
    const field = event.currentTarget.dataset.field;
    const card = this.data.cards[index];
    if (!card) return;
    const text = field === "secret" ? card.secret : card.number;
    if (!text) return;
    wx.setClipboardData({ data: String(text) });
  },

  copyAll() {
    const cards = this.data.cards;
    if (!cards.length) return;
    const text = cards
      .map((card) => {
        const lines = [];
        if (card.number) lines.push("卡号：" + card.number);
        if (card.secret) lines.push("卡密：" + card.secret);
        return lines.join("\n");
      })
      .join("\n\n");
    wx.setClipboardData({ data: text });
  },

  goPay() {
    wx.navigateTo({
      url:
        "/pages/order/pay?orderNo=" +
        encodeURIComponent(this.data.orderNo) +
        "&contact=" +
        encodeURIComponent(this.data.contact || ""),
    });
  },

  goService() {
    wx.navigateTo({
      url:
        "/pages/service/index?orderNo=" +
        encodeURIComponent(this.data.orderNo),
    });
  },
});
