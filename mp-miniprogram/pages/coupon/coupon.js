const api = require("../../utils/api");
const auth = require("../../utils/auth");

const TICKET_STATUS = {
  UNUSED: "可使用",
  USED: "已使用",
  EXPIRED: "已过期",
};

function valueText(item) {
  return item.type === "DISCOUNT" ? item.value + " 折" : "减 " + item.value + " 元";
}

function thresholdText(item) {
  return item.threshold > 0 ? "满 " + item.threshold + " 元可用" : "无门槛";
}

function expireText(value) {
  return value ? String(value).slice(0, 10) + " 前有效" : "长期有效";
}

Page({
  data: {
    shopId: 0,
    tab: "claim",
    loading: true,
    error: "",
    coupons: [],
    tickets: [],
    ticketStatus: "",
    claimingId: 0,
  },

  onLoad(options) {
    this.setData({ shopId: Number((options && options.shopId) || 0) });
  },

  onShow() {
    this.refresh();
  },

  onPullDownRefresh() {
    this.refresh().then(function () {
      wx.stopPullDownRefresh();
    });
  },

  refresh() {
    if (this.data.tab === "mine") return this.loadTickets();
    return this.loadCoupons();
  },

  loadCoupons() {
    this.setData({ loading: !this.data.coupons.length, error: "" });
    return api
      .coupons(this.data.shopId)
      .then((rows) => {
        const list = (Array.isArray(rows) ? rows : []).map(function (item) {
          let hint = "领取";
          if (!item.claimable) {
            if (item.remaining === 0) hint = "已领完";
            else if (item.claimed > 0) hint = "已领取";
            else hint = "不可领";
          } else if (item.claimed > 0) {
            hint = "再领一张";
          }
          return Object.assign({}, item, {
            valueText: valueText(item),
            thresholdText: thresholdText(item),
            expireText: expireText(item.expireAt),
            hintText: hint,
          });
        });
        this.setData({ loading: false, coupons: list });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "优惠券读取失败",
        });
      });
  },

  loadTickets() {
    this.setData({ loading: !this.data.tickets.length, error: "" });
    return auth
      .ensureLogin()
      .then(() => api.tickets(this.data.ticketStatus))
      .then((rows) => {
        const list = (Array.isArray(rows) ? rows : []).map(function (item) {
          return Object.assign({}, item, {
            valueText: valueText(item),
            thresholdText: thresholdText(item),
            expireText: expireText(item.expireAt),
            statusText: TICKET_STATUS[item.status] || item.status,
          });
        });
        this.setData({ loading: false, tickets: list });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "我的优惠券读取失败",
        });
      });
  },

  switchTab(event) {
    const tab = event.currentTarget.dataset.tab;
    if (tab === this.data.tab) return;
    this.setData({ tab: tab, error: "" });
    this.refresh();
  },

  pickTicketStatus(event) {
    this.setData({ ticketStatus: event.currentTarget.dataset.status || "" });
    this.loadTickets();
  },

  claim(event) {
    const id = Number(event.currentTarget.dataset.id) || 0;
    if (!id || this.data.claimingId) return;
    if (!event.currentTarget.dataset.claimable) {
      wx.showToast({ title: "这张券暂时不能领取", icon: "none" });
      return;
    }
    this.setData({ claimingId: id });
    auth
      .ensureLogin()
      .then(() => api.claimCoupon(id))
      .then(() => {
        this.setData({ claimingId: 0 });
        wx.showToast({ title: "领取成功，可在「我的券」查看", icon: "none" });
        this.loadCoupons();
      })
      .catch((error) => {
        this.setData({ claimingId: 0 });
        wx.showToast({
          title: (error && error.message) || "领取失败",
          icon: "none",
        });
      });
  },

  goShop(event) {
    const id = Number(event.currentTarget.dataset.id) || 0;
    if (id) wx.navigateTo({ url: "/pages/shop/shop?id=" + id });
  },

  goShopping() {
    wx.switchTab({ url: "/pages/index/index" });
  },
});
