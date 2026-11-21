/** 会员与充值：资产概览 + 四类套餐购买 + 卡密兑换。 */
const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const pay = require("../../utils/pay").pay;

const TYPE_ORDER = ["vip", "point", "body", "voice"];

Page({
  data: {
    themeStyle: "",
    member: null,
    vipText: "尚未开通会员",
    tab: "vip",
    tabs: [],
    groups: [],
    cardEnabled: true,
    cardCode: "",
    buying: 0,
    loading: true,
    giftText: "",
  },

  onLoad(options) {
    if (options && options.tab === "card") this.setData({ tab: "card" });
  },

  onShow() {
    const app = getApp();
    const gift = app.globalData.gift || {};
    const parts = [];
    if (gift.vipDays > 0) parts.push("会员 " + gift.vipDays + " 天");
    if (gift.point > 0) parts.push("算力 " + gift.point);
    if (gift.body > 0) parts.push("形象点 " + gift.body);
    if (gift.voice > 0) parts.push("声音点 " + gift.voice);
    this.setData({
      themeStyle: app.globalData.themeStyle,
      cardEnabled: app.toggle("card"),
      giftText: parts.length ? "新用户可领：" + parts.join(" · ") : "",
    });
    app.ensureReady().then(() => this.load());
  },

  applyMember(member) {
    this.setData({
      member: member,
      vipText: member
        ? member.isVip
          ? "会员有效期至 " + format.day(member.vipExpireAt)
          : "尚未开通会员"
        : "尚未开通会员",
    });
  },

  load() {
    return auth
      .ensureMember()
      .then((member) => {
        this.applyMember(member);
        return api.packages();
      })
      .then((rows) => {
        const byType = {};
        (rows || []).forEach((row) => {
          if (!byType[row.type]) byType[row.type] = [];
          byType[row.type].push({
            id: row.id,
            name: row.name,
            priceText: format.money(row.priceCents),
            originalText: row.originalCents > row.priceCents ? format.money(row.originalCents) : "",
            recommended: row.recommended,
            sales: row.sales,
            vipDays: row.vipDays,
            point: row.point,
            bodyQuota: row.bodyQuota,
            voiceQuota: row.voiceQuota,
            limitNum: row.limitNum,
          });
        });
        const groups = TYPE_ORDER.filter((type) => byType[type] && byType[type].length).map(
          (type) => ({
            type: type,
            label: format.packageType(type),
            list: byType[type],
          }),
        );
        const tabs = groups.map((group) => ({ key: group.type, label: group.label }));
        const preferred = this.data.tab;
        let tab = "card";
        if (preferred === "card" && this.data.cardEnabled) {
          tab = "card";
        } else if (tabs.some((item) => item.key === preferred)) {
          tab = preferred;
        } else if (tabs.length) {
          tab = tabs[0].key;
        }
        this.setData({ groups: groups, tabs: tabs, tab: tab, loading: false });
      })
      .catch((error) => {
        this.setData({ loading: false });
        auth.showError(error);
      });
  },

  switchTab(event) {
    this.setData({ tab: event.currentTarget.dataset.key });
  },

  buy(event) {
    if (this.data.buying) return;
    const packageId = Number(event.currentTarget.dataset.id);
    this.setData({ buying: packageId });
    api
      .createOrder(packageId)
      .then((order) => {
        if (!order || !order.payParams) {
          throw new Error("订单已创建，请稍后到「我的订单」完成支付");
        }
        return pay(order.payParams).then(() => order);
      })
      .then(() => {
        this.setData({ buying: 0 });
        wx.showToast({ title: "支付成功" });
        return auth.refreshMember().then((member) => {
          this.applyMember(member);
          this.load();
        });
      })
      .catch((error) => {
        this.setData({ buying: 0 });
        auth.showError(error);
      });
  },

  onCardInput(event) {
    this.setData({ cardCode: String(event.detail.value || "").trim().toUpperCase() });
  },

  redeem() {
    if (!this.data.cardCode) {
      wx.showToast({ title: "请输入卡密", icon: "none" });
      return;
    }
    api
      .redeem(this.data.cardCode)
      .then((result) => {
        this.setData({ cardCode: "" });
        this.applyMember((result && result.member) || this.data.member);
        wx.showToast({ title: "兑换成功" });
      })
      .catch(auth.showError);
  },

  goOrders() {
    wx.navigateTo({ url: "/pages/orders/orders" });
  },

  goPromoter() {
    wx.navigateTo({ url: "/pages/promoter/promoter" });
  },
});
