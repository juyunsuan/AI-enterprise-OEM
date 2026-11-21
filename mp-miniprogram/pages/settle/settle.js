const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const pay = require("../../utils/pay");

Page({
  data: {
    loading: true,
    error: "",
    cartIds: [],
    shops: [],
    address: null,
    addressText: "",
    goodsText: "0.00",
    freightText: "0.00",
    payText: "0.00",
    remark: "",
    submitting: false,
  },

  onLoad(options) {
    const cartIds = String((options && options.cartIds) || "")
      .split(",")
      .map(function (value) {
        return Number(value);
      })
      .filter(function (value) {
        return Number.isInteger(value) && value > 0;
      });
    if (!cartIds.length) {
      this.setData({ loading: false, error: "没有要结算的商品，请回购物车重新勾选" });
      return;
    }
    this.setData({ cartIds: cartIds });
    this.load();
  },

  onShow() {
    const picked = getApp().globalData.pickedAddress;
    if (picked && picked.id) {
      getApp().globalData.pickedAddress = null;
      this.applyAddress(picked);
    }
  },

  load() {
    this.setData({ loading: true, error: "" });
    auth
      .ensureLogin()
      .then(() => api.settle(this.data.cartIds))
      .then((preview) => {
        const shops = (preview.shops || []).map(function (shop) {
          return Object.assign({}, shop, {
            goodsText: format.money(shop.goodsAmount),
            freightText: shop.freightAmount > 0 ? "含运费 " + format.money(shop.freightAmount) : "免运费",
            payText: format.money(shop.payAmount),
            items: (shop.items || []).map(function (item) {
              return Object.assign({}, item, {
                priceText: (Number(item.price) || 0).toFixed(2),
              });
            }),
          });
        });
        this.setData({
          loading: false,
          shops: shops,
          goodsText: format.money(preview.goodsAmount),
          freightText: format.money(preview.freightAmount),
          payText: format.money(preview.payAmount),
        });
        this.applyAddress(preview.address);
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "结算信息读取失败",
        });
      });
  },

  applyAddress(address) {
    if (!address) {
      this.setData({ address: null, addressText: "" });
      return;
    }
    this.setData({
      address: address,
      addressText:
        (address.realName || "") +
        " " +
        (address.phone || "") +
        " " +
        format.addressText(address),
    });
  },

  pickAddress() {
    wx.navigateTo({ url: "/pages/address/list?pick=1" });
  },

  onRemark(event) {
    this.setData({ remark: event.detail.value });
  },

  submit() {
    if (this.data.submitting) return;
    const address = this.data.address;
    if (!address || !address.id) {
      wx.showToast({ title: "请先选择收货地址", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    api
      .createOrder({
        cartIds: this.data.cartIds,
        addressId: address.id,
        buyerRemark: this.data.remark,
      })
      .then((result) => {
        const order = result.order || {};
        if (result.payParams) {
          return pay
            .requestPayment(result.payParams)
            .then(() => {
              wx.showToast({ title: "支付成功", icon: "success" });
            })
            .catch((error) => {
              if (!error || !error.cancelled) {
                wx.showToast({ title: (error && error.message) || "支付未完成", icon: "none" });
              }
            })
            .then(() => {
              wx.redirectTo({ url: "/pages/order-detail/order-detail?id=" + order.id });
            });
        }
        wx.showModal({
          title: "订单已提交",
          content: result.payHint || "该订单由商家线下收款，请与商家确认付款方式",
          showCancel: false,
          success() {
            wx.redirectTo({ url: "/pages/order-detail/order-detail?id=" + order.id });
          },
        });
        return null;
      })
      .catch((error) => {
        wx.showToast({ title: (error && error.message) || "下单失败", icon: "none" });
      })
      .then(() => this.setData({ submitting: false }));
  },
});
