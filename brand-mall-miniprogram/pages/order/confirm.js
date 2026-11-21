const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

/**
 * 确认订单：金额、券、运费、积分抵扣全部由 order/preview 算，端上只回填与展示。
 * blockReason 非空时提交按钮必须禁用——那是后端唯一的「不给下单」通道
 * （库存不足、低于起送金额、券不适用都走这里），端上自己判断会算歪。
 */
Page({
  data: {
    items: [],
    fromCart: false,
    addressId: 0,
    couponTicketId: 0,
    usePoints: 0,
    buyerRemark: "",
    preview: null,
    lines: [],
    addresses: [],
    address: null,
    goodsAmountText: "0.00",
    freightText: "0.00",
    discountText: "0.00",
    pointsAmountText: "0.00",
    payAmountText: "0.00",
    maxUsablePoints: 0,
    coupons: [],
    couponText: "不使用优惠券",
    blockReason: "",
    showCoupon: false,
    showAddress: false,
    remarkEnabled: true,
    payEnabled: true,
    pointsEnabled: false,
    submitting: false,
    loading: true,
    error: "",
  },

  onLoad(query) {
    this.setData({
      items: this.parseItems(query.items),
      fromCart: String(query.fromCart || "") === "1",
      payEnabled: !!(getApp().bootstrap() || {}).payEnabled,
    });
    const trade = ((getApp().bootstrap() || {}).trade) || {};
    this.setData({
      remarkEnabled: trade.buyerMessageEnabled !== false,
      pointsEnabled: trade.pointsEnabled === true,
    });
    this.prepare();
  },

  /**
   * 行项目是上一个页面 encodeURIComponent(JSON) 传过来的，
   * 基础库对 query 的解码时机不一致，所以先按原文试、再按解码后的试。
   */
  parseItems(raw) {
    if (!raw) return [];
    const text = String(raw);
    const candidates = [text];
    try {
      candidates.push(decodeURIComponent(text));
    } catch (e) {
      /* 已经解过码的串再解会抛错，忽略 */
    }
    for (let index = 0; index < candidates.length; index += 1) {
      try {
        const parsed = JSON.parse(candidates[index]);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        /* 换下一个候选 */
      }
    }
    return [];
  },

  onShow() {
    // 从地址编辑页返回时要重取一次地址（新增/修改后默认地址可能变化）。
    if (!this.data.loading) this.loadAddresses().then(() => this.loadPreview());
  },

  prepare() {
    auth
      .ensureLogin()
      .then(() => this.loadSelectedFromCart())
      .then(() => this.loadAddresses())
      .then(() => this.loadPreview())
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "登录失败，请重试" });
      });
  },

  /**
   * 购物车结算时后端按购物车勾选行算价，但请求体的 items 仍有 min(1) 校验，
   * 所以这里先把勾选行取回来原样带上，保证契约过得去。
   */
  loadSelectedFromCart() {
    if (!this.data.fromCart || this.data.items.length) return Promise.resolve();
    return api.cart().then((data) => {
      const items = ((data && data.items) || [])
        .filter((row) => row.selected && row.valid)
        .map((row) => ({
          productId: row.productId,
          skuId: row.skuId,
          quantity: row.quantity,
        }));
      this.setData({ items: items });
    });
  },

  loadAddresses() {
    return api
      .addresses()
      .then((rows) => {
        const addresses = rows || [];
        const current =
          addresses.find((item) => item.id === this.data.addressId) ||
          addresses.find((item) => item.isDefault) ||
          addresses[0] ||
          null;
        this.setData({
          addresses: addresses,
          address: current,
          addressId: current ? current.id : 0,
          showAddress: addresses.length === 0,
        });
      })
      .catch(() => this.setData({ addresses: [], address: null }));
  },

  loadPreview() {
    const body = {
      items: this.data.items,
      fromCart: this.data.fromCart,
      addressId: this.data.addressId,
      couponTicketId: this.data.couponTicketId,
      usePoints: this.data.usePoints,
    };
    this.setData({ loading: true });
    return api
      .previewOrder(body)
      .then((data) => {
        const preview = data || {};
        const picked = (preview.coupons || []).find(
          (item) => item.ticketId === this.data.couponTicketId,
        );
        this.setData({
          preview: preview,
          loading: false,
          error: "",
          lines: (preview.lines || []).map((line) => ({
            productId: line.productId,
            skuId: line.skuId,
            title: line.title,
            skuName: line.skuName,
            image: line.image,
            quantity: line.quantity,
            priceText: format.money(line.price),
            totalText: format.money(line.totalPrice),
            valid: line.valid,
            invalidReason: line.invalidReason,
          })),
          goodsAmountText: format.money(preview.goodsAmount),
          freightText: format.money(preview.freightAmount),
          discountText: format.money(preview.discountAmount),
          pointsAmountText: format.money(preview.pointsDeductAmount),
          payAmountText: format.money(preview.payAmount),
          maxUsablePoints: Number(preview.maxUsablePoints || 0),
          coupons: (preview.coupons || []).map((item) => ({
            ticketId: item.ticketId,
            name: item.name,
            valueText: format.couponValueText(item),
            thresholdText: format.money(item.threshold),
            usable: item.usable,
            reason: item.reason,
          })),
          couponText: picked
            ? picked.name + "（" + format.couponValueText(picked) + "）"
            : this.data.couponTicketId
              ? "优惠券已不可用"
              : "不使用优惠券",
          blockReason: preview.blockReason || "",
          // 后端可能按默认地址试算，回包的 receiver 才是最终口径。
          address: preview.receiver
            ? {
                realName: preview.receiver.name,
                phone: preview.receiver.phone,
                detail: preview.receiver.detail,
                province: preview.receiver.province,
                city: preview.receiver.city,
                district: preview.receiver.district,
                id: this.data.addressId,
              }
            : this.data.address,
        });
        if (preview.receiver && !this.data.addressId) this.autoFillAddressId(preview);
      })
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "结算失败" });
      });
  },

  /** 没选地址但后端用默认地址试算成功时，把默认地址 id 记下来，下单必填项才过得去。 */
  autoFillAddressId(preview) {
    const hit = (this.data.addresses || []).find((item) => item.isDefault) || {};
    if (hit.id) this.setData({ addressId: hit.id, address: hit });
  },

  selectAddress(event) {
    const index = Number(event.currentTarget.dataset.index || 0);
    const address = this.data.addresses[index];
    if (!address) return;
    this.setData({ addressId: address.id, address: address, showAddress: false });
    this.loadPreview();
  },

  openAddress() {
    if (!this.data.addresses.length) {
      wx.navigateTo({ url: "/pages/address/edit" });
      return;
    }
    this.setData({ showAddress: true });
  },

  addAddress() {
    this.setData({ showAddress: false });
    wx.navigateTo({ url: "/pages/address/edit" });
  },

  closeAddress() {
    if (!this.data.addresses.length) return;
    this.setData({ showAddress: false });
  },

  openCoupon() {
    this.setData({ showCoupon: true });
  },

  closeCoupon() {
    this.setData({ showCoupon: false });
  },

  pickCoupon(event) {
    const ticketId = Number(event.currentTarget.dataset.ticket || 0);
    const hit = this.data.coupons.find((item) => item.ticketId === ticketId);
    if (ticketId !== 0 && hit && !hit.usable) {
      wx.showToast({ title: hit.reason || "该券本单不可用", icon: "none" });
      return;
    }
    this.setData({ couponTicketId: ticketId, showCoupon: false });
    this.loadPreview();
  },

  onRemark(event) {
    this.setData({ buyerRemark: String(event.detail.value || "").slice(0, 200) });
  },

  /** 积分输入用 number 而非 slider：上限来自后端 maxUsablePoints，超了当场收回。 */
  onPoints(event) {
    const raw = Number(event.detail.value || 0);
    const max = this.data.maxUsablePoints;
    let value = Math.floor(Number.isFinite(raw) ? raw : 0);
    if (value < 0) value = 0;
    if (value > max) {
      value = max;
      wx.showToast({ title: "本单最多可用 " + max + " 积分", icon: "none" });
    }
    this.setData({ usePoints: value });
    this.loadPreview();
  },

  clearError() {
    this.setData({ error: "" });
  },

  noop() {
    /* 弹层内部点击不冒泡到遮罩 */
  },

  submit() {
    if (this.data.blockReason) {
      wx.showToast({ title: this.data.blockReason, icon: "none" });
      return;
    }
    if (!this.data.addressId) {
      wx.showToast({ title: "请先选择收货地址", icon: "none" });
      return;
    }
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    api
      .createOrder({
        items: this.data.items,
        fromCart: this.data.fromCart,
        addressId: this.data.addressId,
        couponTicketId: this.data.couponTicketId,
        usePoints: this.data.usePoints,
        buyerRemark: this.data.buyerRemark,
        // 店铺没开通在线收款时按线下支付下单，避免后端直接拒绝。
        payType: this.data.payEnabled ? "WECHAT" : "OFFLINE",
      })
      .then((created) => {
        getApp().globalData.tradeDraft = created || null;
        getApp().refreshCartBadge();
        this.setData({ submitting: false });
        wx.redirectTo({ url: "/pages/order/pay?id=" + (created && created.orderId) });
      })
      .catch((error) => {
        this.setData({ submitting: false });
        auth.showError(error);
      });
  },
});
