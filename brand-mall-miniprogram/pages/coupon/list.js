const api = require("../../utils/api");
const auth = require("../../utils/auth");
const diy = require("../../utils/diy-render");
const format = require("../../utils/format");

/**
 * 领券中心 / 我的券包。
 * 可领取的券来自 /coupon/shop（匿名），我的券来自 /coupons（顾客态，回包里带 coupon 明细）。
 */
Page({
  data: {
    tab: "shop",
    themeColor: "#fa3534",
    shopList: [],
    myList: [],
    loading: true,
    error: "",
  },

  onLoad(query) {
    const app = getApp();
    app.ensureReady().then(() => {
      this.setData({ themeColor: diy.buildCtx(app.bootstrap(), "COUPON").themeColor });
    });
    if (query && query.tab === "mine") this.setData({ tab: "mine" });
    this.loadShop();
  },

  onPullDownRefresh() {
    Promise.all([this.loadShop(), this.data.tab === "mine" ? this.loadMine() : Promise.resolve()]).then(
      () => wx.stopPullDownRefresh(),
    );
  },

  switchTab(event) {
    const tab = event.currentTarget.dataset.tab;
    this.setData({ tab: tab });
    if (tab === "mine") this.loadMine();
  },

  loadShop() {
    return api
      .shopCoupons()
      .then((rows) => {
        this.setData({
          loading: false,
          error: "",
          shopList: (rows || []).map((row) => this.decorateShop(row)),
        });
      })
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "优惠券加载失败" });
      });
  },

  decorateShop(row) {
    return {
      id: row.id,
      name: row.name,
      valueText: format.couponValueText(row),
      ruleText: format.couponRuleText(row),
      scopeText: format.COUPON_SCOPE_LABELS[row.scope] || "全场通用",
      validText: this.validText(row),
      received: false,
      sold: Number(row.receivedCount || 0) >= Number(row.totalCount || 0),
    };
  },

  validText(row) {
    if (row.validType === "DAYS") return "领取后 " + Number(row.validDays || 0) + " 天内有效";
    return format.dateOnly(row.startAt) + " 至 " + format.dateOnly(row.endAt);
  },

  loadMine() {
    this.setData({ loading: true });
    return auth
      .ensureLogin()
      .then(() => api.myCoupons())
      .then((rows) => {
        this.setData({
          loading: false,
          error: "",
          myList: (rows || []).map((row) => {
            const coupon = row.coupon || {};
            return {
              ticketId: row.ticketId,
              status: row.status,
              statusLabel: format.TICKET_STATUS_LABELS[row.status] || row.status,
              name: coupon.name || "优惠券已下架",
              valueText: format.couponValueText(coupon),
              ruleText: format.couponRuleText(coupon),
              expireText: row.expireAt ? format.dateTime(row.expireAt) : "长期有效",
              receivedText: format.dateTime(row.receivedAt),
              orderId: row.orderId,
            };
          }),
        });
      })
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "券包加载失败" });
      });
  },

  receive(event) {
    const index = Number(event.currentTarget.dataset.index || 0);
    const item = this.data.shopList[index];
    if (!item || item.received || item.sold) return;
    auth
      .ensureLogin()
      .then(() => api.receiveCoupon(item.id))
      .then(() => {
        const patch = {};
        patch["shopList[" + index + "].received"] = true;
        this.setData(patch);
        wx.showToast({ title: "领取成功", icon: "none" });
      })
      .catch((error) => auth.showError(error));
  },

  useCoupon() {
    wx.switchTab({ url: "/pages/index/index" });
  },

  goOrders() {
    wx.navigateTo({ url: "/pages/order/list" });
  },
});
