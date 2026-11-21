const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const pay = require("../../utils/pay");

Page({
  data: {
    loading: true,
    submitting: false,
    items: [],
    addresses: [],
    addressIndex: -1,
    addressId: 0,
    addressText: "",
    quote: null,
    payText: "¥0.00",
    flowTexts: [],
    remark: "",
  },

  onLoad() {
    let items = [];
    try {
      items = wx.getStorageSync("health:checkout") || [];
    } catch (e) {
      items = [];
    }
    if (!items.length) {
      wx.showToast({ title: "没有待结算的商品", icon: "none" });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }
    this.setData({
      items: items.map((item) => ({ ...item, priceText: format.yuan(item.priceCents) })),
    });
    this.load();
  },

  onShow() {
    if (this.loaded) this.loadAddresses();
  },

  async load() {
    try {
      await auth.requireLogin();
      this.loaded = true;
      await this.loadAddresses();
      this.refreshPreview();
    } catch (error) {
      wx.showToast({ title: (error && error.message) || "加载失败", icon: "none" });
      this.setData({ loading: false });
    }
  },

  async loadAddresses() {
    try {
      const rows = (await api.addresses()) || [];
      let index = rows.findIndex((row) => row.id === this.data.addressId);
      if (index < 0) index = rows.findIndex((row) => row.isDefault);
      if (index < 0 && rows.length) index = 0;
      const current = rows[index];
      this.setData({
        loading: false,
        addresses: rows,
        addressIndex: index,
        addressId: current ? current.id : 0,
        addressText: current
          ? current.receiver + " " + current.phone + " " + current.province + current.city + current.district + current.detail
          : "",
      });
      this.refreshPreview();
    } catch (error) {
      this.setData({ loading: false });
    }
  },

  onAddress(e) {
    const index = Number(e.detail.value);
    const row = this.data.addresses[index];
    if (!row) return;
    this.setData({
      addressIndex: index,
      addressId: row.id,
      addressText:
        row.receiver + " " + row.phone + " " + row.province + row.city + row.district + row.detail,
    });
    this.refreshPreview();
  },

  onAddAddress() {
    wx.navigateTo({ url: "/consumer/address/edit" });
  },

  onManageAddress() {
    wx.navigateTo({ url: "/consumer/address/list" });
  },

  onRemark(e) {
    this.setData({ remark: e.detail.value });
  },

  buildInput() {
    return {
      orderType: "GOODS",
      items: this.data.items.map((item) => ({
        itemType: "GOODS",
        refId: item.goodsId,
        quantity: item.quantity,
        skuId: item.skuId || 0,
        patientId: 0,
        practitionerId: 0,
      })),
      slotId: 0,
      addressId: this.data.addressId || 0,
      couponTicketId: 0,
      usePoints: 0,
      remark: this.data.remark,
      receiver: { name: "", phone: "", address: "" },
      consult: null,
      green: null,
    };
  },

  async refreshPreview() {
    if (!this.data.items.length) return;
    try {
      const res = await api.previewOrder(this.buildInput());
      const quote = (res && res.quote) || null;
      this.setData({
        quote,
        payText: quote ? format.yuan(quote.payCents) : "¥0.00",
        flowTexts: quote
          ? quote.flows.map((flow) => ({
              label: flow.label,
              amount: (flow.amountCents < 0 ? "-" : "") + format.money(Math.abs(flow.amountCents)),
            }))
          : [],
      });
    } catch (error) {
      wx.showToast({ title: error.message || "价格试算失败", icon: "none" });
    }
  },

  async onSubmit() {
    if (this.data.submitting) return;
    if (!this.data.addressId) {
      wx.showToast({ title: "请先选择收货地址", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    try {
      const created = await api.createOrder(this.buildInput());
      const orderId = (created && created.id) || 0;
      try {
        wx.removeStorageSync("health:checkout");
      } catch (e) {
        /* 忽略 */
      }
      const result = await pay.payOrder(orderId);
      if (!result.paid && result.reason && result.reason !== "已取消支付") {
        wx.showToast({ title: result.reason, icon: "none", duration: 2500 });
      }
      this.setData({ submitting: false });
      wx.redirectTo({ url: "/consumer/order/detail?id=" + orderId });
    } catch (error) {
      wx.showToast({ title: (error && error.message) || "下单失败", icon: "none" });
      this.setData({ submitting: false });
    }
  },
});
