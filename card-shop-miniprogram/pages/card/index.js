const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const session = require("../../utils/session");

/**
 * 取卡结果页：支付成功后逐条展示卡号卡密，支持单条/全部复制。
 * 数据仍来自查单接口（三要素校验），本页只是「一进来就查好」的展示层。
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
    expireText: "",
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
      takeCardPassword: String(query.password || ""),
    });
    app.ensureReady().then(() => {
      this.setData({ themeStyle: app.globalData.themeStyle });
      if (orderNo) this.load();
      else this.setData({ loading: false, error: "缺少订单号，请从订单或查单页进入" });
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
          result: {
            payState: data.payState,
            payStateLabel: data.payStateLabel,
            goodsName: data.goodsName,
            quantity: data.quantity,
            totalText: format.money(data.totalAmount),
            createdText: format.dateTime(data.createdAt),
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

  onPasswordInput(event) {
    this.setData({ takeCardPassword: event.detail.value });
  },

  unlock() {
    if (!String(this.data.takeCardPassword || "").trim()) {
      wx.showToast({ title: "请输入取卡密码", icon: "none" });
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
    wx.redirectTo({
      url:
        "/pages/order/pay?orderNo=" +
        encodeURIComponent(this.data.orderNo) +
        "&contact=" +
        encodeURIComponent(this.data.contact || ""),
    });
  },

  goQuery() {
    wx.redirectTo({
      url:
        "/pages/query/query?orderNo=" +
        encodeURIComponent(this.data.orderNo) +
        "&contact=" +
        encodeURIComponent(this.data.contact || ""),
    });
  },

  goMyOrders() {
    wx.switchTab({ url: "/pages/order/list" });
  },

  goService() {
    wx.navigateTo({
      url:
        "/pages/service/index?orderNo=" +
        encodeURIComponent(this.data.orderNo),
    });
  },

  onShareAppMessage() {
    return {
      title: getApp().globalData.siteName || "卡密商城",
      path: "/pages/index/index",
    };
  },
});
