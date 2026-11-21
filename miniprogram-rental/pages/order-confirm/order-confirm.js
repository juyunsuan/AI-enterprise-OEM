const api = require("../../utils/api");
const auth = require("../../utils/auth");
const session = require("../../utils/session");
const format = require("../../utils/format");
const pay = require("../../utils/pay");

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
    totalText: "0.00",
    name: "",
    phone: "",
    remark: "",
    submitting: false,
  },

  onLoad(options) {
    const profile = session.getProfile() || {};
    this.setData({
      startAt: options.startAt || format.today(),
      endAt: options.endAt || "",
      name: profile.nickname || "",
      phone: profile.phone || "",
    });
    const id = Number(options.itemId || 0);
    if (!id) {
      this.setData({ loading: false, error: "缺少租品标识" });
      return;
    }
    api
      .itemDetail(id)
      .then((item) => {
        this.setData({ loading: false, item: item });
        this.recalc();
      })
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "租品加载失败" });
      });
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

  onName(event) {
    this.setData({ name: event.detail.value });
  },
  onPhone(event) {
    this.setData({ phone: event.detail.value });
  },
  onRemark(event) {
    this.setData({ remark: event.detail.value });
  },

  submit() {
    if (this.data.submitting) return;
    const item = this.data.item;
    if (!item) return;
    if (!this.data.name.trim()) {
      wx.showToast({ title: "请填写取车人姓名", icon: "none" });
      return;
    }
    if (!this.data.phone.trim()) {
      wx.showToast({ title: "请填写联系电话", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    wx.showLoading({ title: "提交订单…", mask: true });
    auth
      .ensureLogin()
      .then(() =>
        api.createOrder({
          itemId: item.id,
          startAt: this.data.startAt,
          endAt: this.data.endAt,
          name: this.data.name.trim(),
          phone: this.data.phone.trim(),
          remark: this.data.remark.trim(),
        }),
      )
      .then((order) => {
        wx.hideLoading();
        return pay.payOrder(order.id).then((result) => {
          if (result.paid) {
            wx.showModal({
              title: "支付成功",
              content: "请按约定时间到店取车，取车时与店员共同验车。",
              showCancel: false,
              success: () => {
                wx.redirectTo({
                  url: "/pages/order-detail/order-detail?id=" + order.id,
                });
              },
            });
            return;
          }
          wx.showModal({
            title: "订单已创建",
            content: result.reason || "支付未完成，可在租单详情里继续支付。",
            showCancel: false,
            success: () => {
              wx.redirectTo({
                url: "/pages/order-detail/order-detail?id=" + order.id,
              });
            },
          });
        });
      })
      .catch((error) => {
        wx.hideLoading();
        wx.showToast({
          title: (error && error.message) || "下单失败，请稍后重试",
          icon: "none",
        });
      })
      .finally(() => this.setData({ submitting: false }));
  },
});