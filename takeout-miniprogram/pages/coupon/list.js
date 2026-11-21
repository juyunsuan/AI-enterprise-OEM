const api = require("../../utils/api");
const auth = require("../../utils/auth");
const fmt = require("../../utils/format");

function decorate(coupon) {
  if (!coupon) return null;
  return Object.assign({}, coupon, {
    valueText:
      coupon.type === "DISCOUNT"
        ? (Number(coupon.value) / 10).toFixed(1) + "折"
        : "¥" + fmt.money(coupon.value),
    thresholdText:
      coupon.threshold > 0 ? "满 ¥" + fmt.money(coupon.threshold) + " 可用" : "无门槛",
    scopeText:
      coupon.scope === "ALL"
        ? "全场通用"
        : coupon.scope === "CATEGORY"
          ? "指定分类可用"
          : "指定商品可用",
    validText:
      coupon.validType === "FIXED"
        ? fmt.dateTime(coupon.startAt).slice(0, 10) +
          " 至 " +
          fmt.dateTime(coupon.endAt).slice(0, 10)
        : "领取后 " + coupon.validDays + " 天有效",
  });
}

const TICKET_STATUS = { UNUSED: "可使用", USED: "已使用", EXPIRED: "已过期" };

Page({
  data: {
    tab: "mine",
    mine: [],
    shop: [],
    loading: true,
    error: "",
  },

  onShow() {
    this.load();
  },

  pickTab(event) {
    this.setData({ tab: event.currentTarget.dataset.tab });
  },

  load() {
    this.setData({ loading: true, error: "" });
    return auth
      .ensureLogin()
      .then(() => Promise.all([api.myCoupons(), api.shopCoupons()]))
      .then((results) => {
        const mine = (results[0] || [])
          .map((ticket) => {
            const coupon = decorate(ticket.coupon);
            return coupon
              ? Object.assign({}, coupon, {
                  ticketId: ticket.ticketId,
                  ticketStatus: ticket.status,
                  ticketStatusText: TICKET_STATUS[ticket.status] || ticket.status,
                  expireText: ticket.expireAt ? fmt.dateTime(ticket.expireAt) : coupon.validText,
                  usable: ticket.status === "UNUSED",
                })
              : null;
          })
          .filter(Boolean);
        const shop = (results[1] || []).map(decorate);
        this.setData({ mine: mine, shop: shop, loading: false });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "优惠券加载失败",
        });
      });
  },

  receive(event) {
    const id = Number(event.currentTarget.dataset.id);
    api
      .receiveCoupon(id)
      .then(() => {
        wx.showToast({ title: "领取成功", icon: "success" });
        this.load();
      })
      .catch((error) => auth.showError(error));
  },

  goMenu() {
    wx.switchTab({ url: "/pages/menu/menu" });
  },
});