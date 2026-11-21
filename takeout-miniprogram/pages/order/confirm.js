const api = require("../../utils/api");
const auth = require("../../utils/auth");
const fmt = require("../../utils/format");

const MODE_LABELS = {
  DELIVERY: "外卖配送",
  PICKUP: "到店自取",
  DINEIN: "堂食",
};

function couponText(item) {
  if (!item) return "不使用优惠券";
  const threshold = item.threshold > 0 ? "满" + fmt.money(item.threshold) + "可用" : "无门槛";
  if (item.type === "DISCOUNT") {
    return "折扣券 " + (Number(item.value) / 10).toFixed(1) + "折 · " + threshold;
  }
  return "满减券 减¥" + fmt.money(item.value) + " · " + threshold;
}

Page({
  data: {
    loading: true,
    error: "",
    shop: null,
    modes: [],
    mode: "DELIVERY",
    items: [],
    addresses: [],
    address: null,
    expectedAt: "",
    expectedLabel: "尽快送达",
    tableNo: "",
    remark: "",
    remarkEnabled: true,
    pointsEnabled: false,
    usePoints: false,
    maxUsablePoints: 0,
    coupons: [],
    couponTicketId: 0,
    couponLabel: "不使用优惠券",
    showCoupon: false,
    preview: null,
    lines: [],
    amounts: null,
    blockReason: "",
    payEnabled: false,
    payType: "WECHAT",
    submitting: false,
  },

  onLoad() {
    this.prepare();
  },

  onShow() {
    const app = getApp();
    const selected = Number(app.globalData.selectedAddressId || 0);
    if (selected && this.data.address && this.data.address.id !== selected) {
      app.globalData.selectedAddressId = 0;
      const found = this.data.addresses.filter((item) => item.id === selected)[0];
      if (found) {
        this.setData({ address: found });
        this.preview();
      }
    }
  },

  prepare() {
    const app = getApp();
    this.setData({ loading: true, error: "" });
    app
      .ensureReady()
      .then((bootstrap) => {
        const shop = bootstrap || app.bootstrap();
        if (!shop || !shop.shopId) throw new Error(app.globalData.bootstrapError || "门店暂不可用");
        const modes = (shop.modes || ["DELIVERY"]).map((key) => ({
          key: key,
          label: MODE_LABELS[key] || key,
        }));
        this.setData({
          shop: shop,
          modes: modes,
          mode: modes[0] ? modes[0].key : "DELIVERY",
          remarkEnabled: shop.remarkEnabled !== false,
          pointsEnabled: shop.pointsEnabled === true,
          payEnabled: shop.payEnabled === true,
          payType: "WECHAT",
        });
        return auth.ensureLogin();
      })
      .then(() => Promise.all([api.cart(), api.addresses()]))
      .then((results) => {
        const cart = results[0] || { items: [] };
        const items = (cart.items || [])
          .filter((item) => item.selected && item.valid)
          .map((item) => ({
            productId: item.productId,
            skuId: item.skuId,
            quantity: item.quantity,
          }));
        if (!items.length) {
          throw new Error("购物车没有可结算的菜品，请先点餐");
        }
        const addresses = results[1] || [];
        const fallback = addresses.filter((item) => item.isDefault)[0] || addresses[0] || null;
        this.setData({
          items: items,
          addresses: addresses,
          address: fallback,
          loading: false,
        });
        return this.preview();
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "结算信息加载失败",
        });
      });
  },

  payload() {
    const mode = this.data.mode;
    return {
      items: this.data.items,
      fromCart: true,
      addressId: mode === "DELIVERY" && this.data.address ? this.data.address.id : 0,
      couponTicketId: this.data.couponTicketId,
      usePoints: this.data.usePoints ? this.data.maxUsablePoints : 0,
      orderMode: mode,
      tableNo: this.data.tableNo,
      expectedAt: this.data.expectedAt,
    };
  },

  preview() {
    if (!this.data.items.length) return Promise.resolve();
    return api
      .previewOrder(this.payload())
      .then((preview) => {
        const lines = (preview.lines || []).map((line, index) =>
          Object.assign({}, line, {
            key: line.productId + "-" + line.skuId + "-" + index,
            priceText: fmt.money(line.price),
            totalText: fmt.money(line.totalPrice),
          }),
        );
        const coupons = (preview.coupons || []).map((item) =>
          Object.assign({}, item, {
            title: couponText(item),
          }),
        );
        const selected = coupons.filter((item) => item.ticketId === this.data.couponTicketId)[0];
        this.setData({
          preview: preview,
          lines: lines,
          coupons: coupons,
          maxUsablePoints: preview.maxUsablePoints || 0,
          couponLabel: selected ? selected.name : "不使用优惠券",
          blockReason: preview.blockReason || "",
          amounts: {
            goods: fmt.money(preview.goodsAmount),
            delivery: fmt.money(preview.freightAmount),
            discount: fmt.money(preview.discountAmount),
            points: fmt.money(preview.pointsDeductAmount),
            pay: fmt.money(preview.payAmount),
          },
        });
      })
      .catch((error) => {
        this.setData({ blockReason: (error && error.message) || "算价失败" });
      });
  },

  setMode(event) {
    const mode = event.currentTarget.dataset.mode;
    if (mode === this.data.mode) return;
    this.setData({ mode: mode });
    this.preview();
  },

  chooseAddress() {
    wx.navigateTo({
      url: "/pages/address/list?select=1",
      events: {
        select: (address) => {
          this.setData({ address: address });
          this.preview();
        },
      },
    });
  },

  pickTime(event) {
    const value = event.detail.value;
    const parts = value.split(":");
    const now = new Date();
    const date = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      Number(parts[0]),
      Number(parts[1]),
      0,
    );
    if (date.getTime() <= now.getTime()) date.setDate(date.getDate() + 1);
    const label =
      (date.getDate() === now.getDate() ? "今天 " : "明天 ") + value;
    this.setData({ expectedAt: date.toISOString(), expectedLabel: label });
    this.preview();
  },

  clearTime() {
    this.setData({ expectedAt: "", expectedLabel: "尽快送达" });
    this.preview();
  },

  showCoupons() {
    this.setData({ showCoupon: true });
  },

  closeCoupons() {
    this.setData({ showCoupon: false });
  },

  chooseCoupon(event) {
    const id = Number(event.currentTarget.dataset.id || 0);
    const usable = this.data.coupons.filter((item) => item.ticketId === id)[0];
    if (id && usable && usable.usable === false) {
      wx.showToast({ title: usable.reason || "该券不可用", icon: "none" });
      return;
    }
    this.setData({ couponTicketId: id, showCoupon: false });
    this.preview();
  },

  togglePoints() {
    if (!this.data.maxUsablePoints) {
      wx.showToast({ title: "本单暂无可抵扣积分", icon: "none" });
      return;
    }
    this.setData({ usePoints: !this.data.usePoints });
    this.preview();
  },

  onTableInput(event) {
    this.setData({ tableNo: event.detail.value });
  },

  onRemarkInput(event) {
    this.setData({ remark: event.detail.value });
  },

  noop() {},

  submit() {
    if (this.data.submitting) return;
    if (!this.data.preview) {
      wx.showToast({ title: "正在计算金额，请稍候", icon: "none" });
      return;
    }
    if (this.data.shop && this.data.shop.open !== true) {
      wx.showToast({ title: "门店休息中，暂不接单", icon: "none" });
      return;
    }
    if (!this.data.payEnabled) {
      wx.showToast({ title: "门店未开通在线收款，请联系门店", icon: "none" });
      return;
    }
    if (this.data.blockReason) {
      wx.showToast({ title: this.data.blockReason, icon: "none" });
      return;
    }
    if (this.data.mode === "DELIVERY" && !this.data.address) {
      wx.showToast({ title: "请选择收货地址", icon: "none" });
      return;
    }
    if (this.data.mode === "DINEIN" && !this.data.tableNo) {
      wx.showToast({ title: "请填写桌号", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    api
      .createOrder(
        Object.assign({}, this.payload(), {
          buyerRemark: this.data.remark,
          payType: this.data.payType,
        }),
      )
      .then((created) => {
        getApp().refreshCartBadge();
        if (created.payParams) {
          return new Promise((resolve) => {
            wx.requestPayment(
              Object.assign({}, created.payParams, {
                success: () => resolve(created),
                fail: () => {
                  wx.showToast({ title: "支付未完成，可在订单中继续", icon: "none" });
                  resolve(created);
                },
              }),
            );
          });
        }
        return created;
      })
      .then((created) => {
        wx.redirectTo({ url: "/pages/order/detail?id=" + created.orderId });
      })
      .catch((error) => {
        this.setData({ submitting: false });
        auth.showError(error);
      });
  },
});