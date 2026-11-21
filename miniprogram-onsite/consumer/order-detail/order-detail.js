const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const pay = require("../../utils/pay");

const STATUS_TEXT = {
  PENDING_PAYMENT: "待付款",
  PAID: "待接单",
  ACCEPTED: "已接单",
  EN_ROUTE: "服务出发",
  ON_SITE: "已到达",
  SERVING: "服务中",
  COMPLETED: "已完成",
  SIGNED: "已签收",
  REVIEWED: "已评价",
  CANCELLED: "已取消",
  EXPIRED: "超时关闭",
  REJECTED: "技师拒单",
  REFUND_PENDING: "退款中",
  REFUNDED: "已退款",
};

const STATUS_HINT = {
  PENDING_PAYMENT: "完成支付后店铺才会接单，超时未付会自动关闭",
  PAID: "已付款，等待店铺接单",
  ACCEPTED: "服务人员已接单，会按约定时间上门",
  EN_ROUTE: "服务人员正在前往，请保持电话畅通",
  ON_SITE: "服务人员已到达",
  SERVING: "服务进行中",
  COMPLETED: "服务已完成，可签字确认或发起评价",
  SIGNED: "已完成签字确认",
  REVIEWED: "已完成评价",
  REFUND_PENDING: "退款申请处理中，可在退款列表查看进度",
  REFUNDED: "款项已退回",
  CANCELLED: "订单已取消",
  EXPIRED: "订单因超时未支付已关闭",
  REJECTED: "服务人员无法接单，请重新预约或联系店铺",
};

/** 履约轨迹的拍照阶段（与后端 staff-api advance 的 action 同名）。 */
const STAGE_TEXT = {
  depart: "出发",
  arrive: "到达",
  start: "开始服务",
  complete: "服务完成",
};

function tracksOf(row) {
  return (row.tracks || [])
    .filter((track) => track && STAGE_TEXT[track.stage])
    .map((track) => ({
      stage: track.stage,
      label: STAGE_TEXT[track.stage],
      address: track.address || "",
      image: track.image || "",
      hasGeo: !!(track.lng && track.lat),
      lng: track.lng,
      lat: track.lat,
      timeText: track.recordedAt ? format.dateTime(track.recordedAt) : "",
    }));
}

function timelineOf(row) {
  const rows = [
    { label: "下单", at: row.createdAt },
    { label: "支付完成", at: row.paidAt },
    { label: "接单", at: row.acceptedAt },
    { label: "出发", at: row.departedAt },
    { label: "到达", at: row.arrivedAt },
    { label: "开始服务", at: row.serviceStartedAt },
    { label: "服务完成", at: row.completedAt },
    { label: "签字确认", at: row.signedAt },
  ];
  return rows
    .filter((item) => item.at)
    .map((item) => ({ label: item.label, timeText: format.dateTime(item.at) }));
}

Page({
  data: {
    loading: true,
    error: "",
    notReady: false,
    readyReason: "",
    order: null,
    items: [],
    amountRows: [],
    timeline: [],
    tracks: [],
    address: null,
    signature: "",
    addons: [],
    actions: {},
    paying: false,
    payingAddon: false,
  },

  onLoad(options) {
    this.orderId = Number((options && options.orderId) || 0);
    this.start();
  },

  onShow() {
    if (this.loaded) this.load();
  },

  start() {
    if (!this.orderId) {
      this.setData({ loading: false, error: "缺少订单号，请到「订单」里进入" });
      return Promise.resolve();
    }
    const app = getApp();
    return app
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
        return auth.ensureLogin().then(() => this.load());
      })
      .catch((error) => {
        this.setData({
          loading: false,
          notReady: false,
          error: (error && error.message) || "登录失败，请重新进入小程序",
        });
      });
  },

  load() {
    if (!this.orderId) {
      this.setData({ loading: false, error: "缺少订单号，请到「订单」里进入" });
      return Promise.resolve();
    }
    this.setData({ loading: true, error: "", notReady: false });
    return api
      .orderDetail(this.orderId)
      .then((row) => {
        this.loaded = true;
        const list = row.actions || [];
        const address = row.address
          ? {
              contactName: row.address.contactName || "未填写联系人",
              phone: row.address.phone || "",
              text: [row.address.province, row.address.city, row.address.district, row.address.detail]
                .filter(Boolean)
                .join(""),
              hasGeo: !!(row.address.lng && row.address.lat),
              lng: row.address.lng,
              lat: row.address.lat,
            }
          : null;
        const amountRows = [
          { label: "服务费", value: format.yuan(row.serviceFeeCents) },
          { label: "车费", value: format.yuan(row.travelFeeCents) },
          { label: "材料费", value: format.yuan(row.materialFeeCents) },
        ];
        if (row.discountCents) {
          amountRows.push({ label: "优惠", value: "-" + format.yuan(row.discountCents) });
        }
        this.setData({
          loading: false,
          error: "",
          notReady: false,
          order: {
            id: row.id,
            orderNo: row.orderNo || "",
            statusText: STATUS_TEXT[row.status] || row.status || "",
            statusHint: STATUS_HINT[row.status] || "",
            startText: format.dateTime(row.startAt),
            endText: format.dateTime(row.endAt),
            durationText: format.duration(row.durationMinutes),
            expireText: row.status === "PENDING_PAYMENT" ? format.dateTime(row.expireAt) : "",
            staffName: row.staffName || "由店铺派单",
            staffPhone: row.staffPhone || "",
            distanceText: format.distance(row.distanceMeters),
            remark: row.customerRemark || "",
            payText: format.yuan(row.payAmountCents),
            isAddon: row.isAddon === true,
            addonCount: Number(row.addonCount) || 0,
          },
          items: (row.items || []).map((item) => ({
            id: item.id,
            title: item.title || "服务项目",
            quantityText: "x" + item.quantity,
            durationText: format.duration(item.durationMinutes),
            priceText: format.yuan(item.unitPriceCents),
            materialText: item.materialFeeCents ? "材料费 " + format.yuan(item.materialFeeCents) : "",
            refundedText:
              item.refundedQuantity > 0 ? "已退 " + item.refundedQuantity + " 份" : "",
          })),
          amountRows: amountRows,
          timeline: timelineOf(row),
          tracks: tracksOf(row),
          address: address,
          addons: (row.addons || []).map((addon) => ({
            id: addon.id,
            detailText: format.duration(addon.durationMinutes) + " × " + addon.quantity,
            amountText: format.yuan(addon.amountCents),
            paid: addon.payStatus === "PAID",
            payable: addon.payStatus !== "PAID" && addon.status === "PENDING_PAYMENT",
            statusText:
              addon.payStatus === "PAID"
                ? "已支付"
                : addon.status === "PENDING_PAYMENT"
                  ? "待支付"
                  : "已关闭",
            timeText: format.dateTime(addon.paidAt || addon.createdAt),
          })),
          signature: (row.signature && row.signature.image) || "",
          actions: {
            pay: list.indexOf("pay") >= 0,
            cancel: list.indexOf("cancel") >= 0,
            addon: list.indexOf("addon") >= 0,
            sign: list.indexOf("sign") >= 0,
            review: list.indexOf("review") >= 0,
            refund: list.indexOf("refund") >= 0,
            refundDetail: list.indexOf("refundDetail") >= 0,
          },
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "订单加载失败，请稍后重试",
        });
      });
  },

  onRetry() {
    this.start();
  },

  copyOrderNo() {
    if (!this.data.order) return;
    wx.setClipboardData({ data: this.data.order.orderNo });
  },

  callStaff() {
    if (!this.data.order || !this.data.order.staffPhone) return;
    wx.makePhoneCall({ phoneNumber: this.data.order.staffPhone });
  },

  copyAddress() {
    if (!this.data.address) return;
    wx.setClipboardData({ data: this.data.address.text });
  },

  openMap() {
    const address = this.data.address;
    if (!address || !address.hasGeo) return;
    wx.openLocation({
      latitude: Number(address.lat),
      longitude: Number(address.lng),
      name: address.contactName,
      address: address.text,
    });
  },

  previewSignature() {
    if (!this.data.signature) return;
    wx.previewImage({ current: this.data.signature, urls: [this.data.signature] });
  },

  previewTrack(event) {
    const src = event.currentTarget.dataset.src;
    if (!src) return;
    const urls = this.data.tracks
      .map((track) => track.image)
      .filter(Boolean);
    wx.previewImage({ current: src, urls: urls.length ? urls : [src] });
  },

  openTrackMap(event) {
    const track = this.data.tracks[Number(event.currentTarget.dataset.index)];
    if (!track || !track.hasGeo) return;
    wx.openLocation({
      latitude: Number(track.lat),
      longitude: Number(track.lng),
      name: track.label,
      address: track.address,
    });
  },

  payNow() {
    if (this.data.paying) return;
    const self = this;
    this.setData({ paying: true });
    pay.payOrder(this.orderId).then((result) => {
      self.setData({ paying: false });
      if (result.paid) {
        wx.showToast({ title: "支付成功", icon: "success" });
        self.load();
        return;
      }
      wx.showModal({
        title: "支付未完成",
        content: result.reason || "请稍后重试",
        showCancel: false,
      });
    });
  },

  /** 加钟支付：成功即时刷新，失败把后端原因（未开通收款/已超时）原样展示。 */
  payAddonById(addonId, endAt) {
    const self = this;
    this.setData({ payingAddon: true });
    return pay.payAddon(addonId).then((result) => {
      self.setData({ payingAddon: false });
      if (result.paid) {
        wx.showToast({ title: "加钟已支付", icon: "success" });
      } else {
        wx.showModal({
          title: "加钟已登记，支付未完成",
          content:
            (endAt ? "服务结束时间调整为 " + endAt + "。" : "") +
            (result.reason || "请稍后重试"),
          showCancel: false,
        });
      }
      self.load();
    });
  },

  retryAddonPay(event) {
    const addonId = Number(event.currentTarget.dataset.id) || 0;
    if (!addonId || this.data.payingAddon) return;
    this.payAddonById(addonId, "");
  },

  cancelOrder() {
    const self = this;
    wx.showModal({
      title: "取消订单",
      editable: true,
      placeholderText: "取消原因（选填）",
      confirmText: "确认取消",
      success(res) {
        if (!res.confirm) return;
        const reason = String(res.content || "").slice(0, 200);
        api
          .cancelOrder(self.orderId, reason)
          .then(() => {
            wx.showToast({ title: "订单已取消", icon: "success" });
            self.load();
          })
          .catch((error) => {
            wx.showModal({
              title: "取消失败",
              content: (error && error.message) || "请稍后重试",
              showCancel: false,
            });
          });
      },
    });
  },

  addon() {
    const items = this.data.items.slice(0, 6);
    if (!items.length) return;
    const self = this;
    wx.showActionSheet({
      itemList: items.map((item) => item.title + " " + item.quantityText),
      success(res) {
        const item = items[res.tapIndex];
        if (!item) return;
        wx.showModal({
          title: "加钟",
          editable: true,
          placeholderText: "追加份数（1-10）",
          success(modal) {
            if (!modal.confirm) return;
            const quantity = Math.round(Number(modal.content));
            if (!Number.isFinite(quantity) || quantity < 1) {
              wx.showToast({ title: "请输入 1-10 的份数", icon: "none" });
              return;
            }
            api
              .addonOrder(self.orderId, item.id, Math.min(10, quantity))
              .then((res) => {
                const endAt = res && res.endAt ? format.dateTime(res.endAt) : "";
                const addonId = Number(res && res.addonId) || 0;
                if (!addonId) {
                  wx.showModal({
                    title: "加钟记录已生成",
                    content:
                      (endAt ? "服务结束时间调整为 " + endAt + "。" : "") +
                      "加钟费用请按店铺指引另行支付。",
                    showCancel: false,
                  });
                  self.load();
                  return null;
                }
                // 加钟是独立待付单，生成后立即唤起支付；取消也能在订单里「去支付」重试
                return self.payAddonById(addonId, endAt);
              })
              .catch((error) => {
                wx.showModal({
                  title: "加钟失败",
                  content: (error && error.message) || "请稍后重试",
                  showCancel: false,
                });
              });
          },
        });
      },
    });
  },

  goSign() {
    wx.navigateTo({
      url: "/consumer/order-sign/order-sign?orderId=" + this.orderId,
    });
  },

  goReview() {
    wx.navigateTo({
      url: "/consumer/review-submit/review-submit?orderId=" + this.orderId,
    });
  },

  goRefund() {
    wx.navigateTo({
      url: "/consumer/refund-apply/refund-apply?orderId=" + this.orderId,
    });
  },

  goRefundList() {
    wx.navigateTo({ url: "/consumer/refund-list/refund-list" });
  },

  goHome() {
    wx.switchTab({ url: "/pages/index/index" });
  },
});
