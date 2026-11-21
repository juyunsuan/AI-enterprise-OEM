const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const session = require("../../utils/session");

/**
 * 查单取卡：点单号 + 联系方式（+ 取卡密码）三要素，匿名可用。
 * 从支付/取卡页跳进来时自动带上单号与联系方式直接查，不再让顾客重输。
 */
Page({
  data: {
    themeStyle: "",
    orderNo: "",
    contact: "",
    takeCardPassword: "",
    loading: false,
    searched: false,
    result: null,
    cards: [],
    needPassword: false,
    canPay: false,
    showMyOrders: false,
  },

  onLoad(query) {
    const app = getApp();
    const orderNo = String(query.orderNo || "");
    const contact = String(query.contact || session.getContact(orderNo) || "");
    this.setData({
      themeStyle: app.globalData.themeStyle,
      orderNo: orderNo,
      contact: contact,
      takeCardPassword: String(query.password || ""),
    });
    app.ensureReady().then(() => {
      this.setData({
        themeStyle: app.globalData.themeStyle,
        showMyOrders: app.toggle("myOrders") && app.hasToken(),
      });
      if (orderNo) this.submit();
    });
  },

  onOrderNoInput(event) {
    this.setData({ orderNo: event.detail.value });
  },

  onContactInput(event) {
    this.setData({ contact: event.detail.value });
  },

  onPasswordInput(event) {
    this.setData({ takeCardPassword: event.detail.value });
  },

  submit() {
    if (this.data.loading) return;
    const orderNo = String(this.data.orderNo || "").trim().toUpperCase();
    if (!orderNo) {
      wx.showToast({ title: "请输入订单号", icon: "none" });
      return;
    }
    this.setData({ loading: true });
    api
      .orderQuery(
        orderNo,
        String(this.data.contact || "").trim(),
        String(this.data.takeCardPassword || ""),
      )
      .then((data) => {
        const cards = (data.cards || []).map((card, index) => ({
          id: card.id,
          index: index + 1,
          number: card.number,
          secret: card.secret,
        }));
        this.setData({
          loading: false,
          searched: true,
          orderNo: data.orderNo || orderNo,
          result: {
            found: !!data.found,
            payState: data.payState,
            payStateLabel: data.payStateLabel,
            orderNo: data.orderNo,
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
          canPay: !!data.found && data.payState === "PENDING",
        });
        if (data.found) {
          session.setContact(
            data.orderNo,
            String(this.data.contact || "").trim(),
          );
        }
      })
      .catch((error) => {
        this.setData({ loading: false, searched: true });
        auth.showError(error, "查询失败");
      });
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

  goMyOrders() {
    wx.switchTab({ url: "/pages/order/list" });
  },
});
