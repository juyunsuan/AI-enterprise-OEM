const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const pay = require("../../utils/pay");

function addressText(row) {
  if (!row) return "";
  const parts = [row.province, row.city, row.district, row.detail].filter(Boolean);
  return parts.join("");
}

function toAddressView(row) {
  if (!row) return null;
  return {
    id: row.id,
    contactName: row.contactName || "未填写联系人",
    phone: row.phone || "",
    text: addressText(row),
  };
}

Page({
  data: {
    loading: true,
    error: "",
    notReady: false,
    readyReason: "",
    address: null,
    addressEmpty: false,
    quantity: 1,
    quantityText: "1",
    remark: "",
    preview: null,
    previewRows: [],
    amountRows: [],
    previewing: false,
    previewError: "",
    submitting: false,
  },

  onLoad(options) {
    const params = options || {};
    this.serviceId = Number(params.serviceId || 0);
    this.staffId = Number(params.staffId || 0);
    this.startAt = params.startAt ? decodeURIComponent(params.startAt) : "";
    this.start();
  },

  onShow() {
    if (!this.ready) return;
    const app = getApp();
    const picked = app.globalData && app.globalData.selectedAddress;
    if (picked) {
      app.globalData.selectedAddress = null;
      this.applyAddress(picked);
      return;
    }
    // 从「新增地址」返回时列表可能已变，重新取一次并回落到默认地址
    if (!this.data.address && !this.addressesBusy) this.loadAddresses();
  },

  start() {
    if (!this.serviceId || !this.startAt) {
      this.setData({ loading: false, error: "缺少服务或时间，请重新选择" });
      return;
    }
    const app = getApp();
    app
      .ensureReady()
      .then((shop) => {
        if (!shop || !shop.shopCode) {
          this.setData({
            loading: false,
            notReady: true,
            readyReason: app.globalData.bootstrapError || "店铺尚未开通，请联系店铺方",
          });
          return null;
        }
        if (!app.featureEnabled("booking")) {
          this.setData({ loading: false, error: "店铺暂未开放预约" });
          return null;
        }
        this.ready = true;
        return auth
          .ensureLogin()
          .then(() => {
            this.setData({ loading: false, error: "" });
            return this.loadAddresses();
          });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "登录失败，请重新进入小程序",
        });
      });
  },

  loadAddresses() {
    this.addressesBusy = true;
    return api
      .addresses()
      .then((res) => {
        const list = (res && res.list) || [];
        this.addressesBusy = false;
        if (!list.length) {
          this.setData({ address: null, addressEmpty: true });
          return null;
        }
        const preferred =
          list.filter((row) => row.isDefault)[0] || list[0];
        return this.applyAddress(preferred);
      })
      .catch((error) => {
        this.addressesBusy = false;
        this.setData({
          addressEmpty: true,
          previewError: (error && error.message) || "地址加载失败，请重新选择",
        });
        return null;
      });
  },

  applyAddress(row) {
    const address = toAddressView(row);
    this.setData({ address: address, addressEmpty: !address });
    if (!address) return Promise.resolve();
    return this.loadPreview();
  },

  chooseAddress() {
    wx.navigateTo({ url: "/consumer/address-list/address-list?select=1" });
  },

  addAddress() {
    wx.navigateTo({ url: "/consumer/address-edit/address-edit" });
  },

  changeQuantity(event) {
    if (!this.data.preview) return;
    const delta = Number(event.currentTarget.dataset.delta) || 0;
    let quantity = this.data.quantity + delta;
    if (quantity < 1) quantity = 1;
    if (quantity > 20) {
      wx.showToast({ title: "单项最多 20 份", icon: "none" });
      quantity = 20;
    }
    if (quantity === this.data.quantity) return;
    this.setData({ quantity: quantity, quantityText: String(quantity) });
    this.loadPreview();
  },

  onRemarkInput(event) {
    this.setData({ remark: event.detail.value });
  },

  /** 金额与车费一律取预览接口的结果，端上不拼价。 */
  loadPreview() {
    if (!this.data.address) return Promise.resolve();
    this.setData({ previewing: true, previewError: "" });
    return api
      .previewOrder({
        staffId: this.staffId,
        addressId: this.data.address.id,
        startAt: this.startAt,
        items: [{ serviceId: this.serviceId, quantity: this.data.quantity }],
      })
      .then((data) => {
        const row = data || {};
        const items = (row.items || []).map((item) => ({
          serviceId: item.serviceId,
          title: item.title || "服务项目",
          quantityText: "x" + item.quantity,
          priceText: format.yuan(item.unitPriceCents),
          durationText: format.duration(item.durationMinutes),
          materialText: item.materialFeeCents ? "材料费 " + format.yuan(item.materialFeeCents) : "",
        }));
        const amounts = [
          { label: "服务费", value: format.yuan(row.serviceFeeCents) },
          { label: "材料费", value: format.yuan(row.materialFeeCents) },
          { label: "车费", value: format.yuan(row.travelFeeCents) },
        ];
        if (row.discountCents) {
          amounts.push({ label: "优惠", value: "-" + format.yuan(row.discountCents) });
        }
        this.setData({
          previewing: false,
          previewError: "",
          previewRows: items,
          amountRows: amounts,
          preview: {
            payText: format.yuan(row.payAmountCents),
            startText: format.dateTime(row.startAt),
            endText: format.dateTime(row.endAt),
            durationText: format.duration(row.durationMinutes),
            staffName: row.staffName || "由店铺派单",
            distanceText: format.distance(row.distanceMeters),
            travelNote: row.travelFeeNote || "",
          },
        });
      })
      .catch((error) => {
        this.setData({
          previewing: false,
          preview: null,
          previewRows: [],
          amountRows: [],
          previewError: (error && error.message) || "试算失败，请稍后重试",
        });
      });
  },

  onRetryPreview() {
    this.loadPreview();
  },

  repickTime() {
    wx.navigateBack();
  },

  submit() {
    if (this.data.submitting) return;
    if (!this.data.address) {
      wx.showToast({ title: "请先选择上门地址", icon: "none" });
      return;
    }
    if (!this.data.preview) {
      wx.showToast({ title: "请等待金额试算完成", icon: "none" });
      return;
    }
    const self = this;
    this.setData({ submitting: true });
    api
      .createOrder({
        staffId: this.staffId,
        addressId: this.data.address.id,
        startAt: this.startAt,
        items: [{ serviceId: this.serviceId, quantity: this.data.quantity }],
        customerRemark: this.data.remark,
      })
      .then((order) => {
        const orderId = Number(order && order.id) || 0;
        if (!orderId) throw new Error("下单返回异常，请到「订单」里确认");
        wx.showToast({ title: "下单成功，正在唤起支付", icon: "none" });
        return pay.payOrder(orderId).then((result) => {
          wx.redirectTo({
            url:
              "/consumer/pay-result/pay-result?orderId=" +
              orderId +
              "&status=" +
              (result.paid ? "paid" : "unpaid") +
              (result.reason ? "&reason=" + encodeURIComponent(result.reason) : ""),
          });
        });
      })
      .catch((error) => {
        self.setData({ submitting: false });
        const message = (error && error.message) || "下单失败，请稍后重试";
        wx.showModal({
          title: "下单未完成",
          content: message,
          confirmText: "重新选时间",
          cancelText: "留在本页",
          success(res) {
            if (res.confirm) wx.navigateBack();
          },
        });
      });
  },
});
