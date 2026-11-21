const api = require("../../utils/api");
const format = require("../../utils/format");

Page({
  data: {
    loading: true,
    error: "",
    item: null,
    startAt: "",
    endAt: "",
    days: 1,
    rentText: "0.00",
    depositText: "0.00",
    dailyRateText: "0.00",
    totalText: "0.00",
    attributes: [],
    today: "",
  },

  onLoad(options) {
    const today = format.today();
    const id = Number(options.id || 0);
    this.setData({
      today: today,
      startAt: today,
      endAt: this.addDays(today, 1),
    });
    if (!id) {
      this.setData({ loading: false, error: "缺少租品标识" });
      return;
    }
    api
      .itemDetail(id)
      .then((item) => {
        const attributes = item.attributes || {};
        this.setData({
          loading: false,
          item: item,
          dailyRateText: format.money(item.dailyRateCents),
          attributes: Object.keys(attributes).map((key) => ({
            key: key,
            value: attributes[key],
          })),
        });
        this.recalc();
      })
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "租品加载失败" });
      });
  },

  addDays(dateText, days) {
    const date = format.toDate(dateText);
    if (!date) return dateText;
    date.setDate(date.getDate() + days);
    return (
      date.getFullYear() +
      "-" +
      String(date.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(date.getDate()).padStart(2, "0")
    );
  },

  recalc() {
    const item = this.data.item;
    if (!item) return;
    const days = format.daysBetween(this.data.startAt, this.data.endAt);
    const rentCents = Number(item.dailyRateCents) * days;
    const totalCents = rentCents + Number(item.depositCents);
    this.setData({
      days: days,
      rentText: format.money(rentCents),
      depositText: format.money(item.depositCents),
      totalText: format.money(totalCents),
    });
  },

  changeStart(event) {
    const startAt = event.detail.value;
    const endAt = this.data.endAt <= startAt ? this.addDays(startAt, 1) : this.data.endAt;
    this.setData({ startAt: startAt, endAt: endAt });
    this.recalc();
  },

  changeEnd(event) {
    const endAt = event.detail.value;
    if (endAt <= this.data.startAt) {
      wx.showToast({ title: "结束日期需晚于开始日期", icon: "none" });
      return;
    }
    this.setData({ endAt: endAt });
    this.recalc();
  },

  goConfirm() {
    const item = this.data.item;
    if (!item) return;
    wx.navigateTo({
      url:
        "/pages/order-confirm/order-confirm?itemId=" +
        item.id +
        "&startAt=" +
        this.data.startAt +
        "&endAt=" +
        this.data.endAt,
    });
  },
});