const app = getApp();
const api = require("../../utils/api");
const auth = require("../../utils/auth");
const fmt = require("../../utils/format");
const pay = require("../../utils/pay");

function partyText(party) {
  return party
    ? party.name + " " + party.mobile + "\n" + fmt.partyText(party)
    : "";
}

Page({
  data: {
    loading: true,
    error: "",
    needSite: false,
    orderNo: "",
    mobile: "",
    detail: null,
    events: [],
    paying: false,
    cancelling: false,
  },

  onLoad(options) {
    this.setData({
      orderNo: options.orderNo || "",
      mobile: options.mobile || "",
    });
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    if (!this.data.orderNo) {
      this.setData({ loading: false, error: "缺少订单号" });
      return Promise.resolve();
    }
    this.setData({ loading: !this.data.detail, error: "", needSite: false });
    return app.ensureReady().then(() => {
      if (app.globalData.needSite) {
        this.setData({
          loading: false,
          needSite: true,
          error: "请先在首页选择一个寄件点",
        });
        return null;
      }
      return api
        .queryOrder(this.data.orderNo, this.data.mobile)
        .then((order) => {
          this.setData({
            loading: false,
            detail: {
              orderNo: order.orderNo,
              companyName: order.companyName,
              stateText: fmt.orderStateText(order),
              stateColor: fmt.stateColor(order),
              feeText: fmt.money(order.totalAmount),
              createdAtText: fmt.time(order.createdAt),
              paidAtText: order.paidAt ? fmt.time(order.paidAt) : "",
              expireAtText: order.expireAt ? fmt.time(order.expireAt) : "",
              senderText: partyText(order.sender),
              receiverText: partyText(order.receiver),
              itemLine:
                order.itemName +
                " × " +
                order.itemCount +
                " · " +
                order.itemWeightKg +
                "kg",
              dimsText:
                order.length > 0 && order.width > 0 && order.height > 0
                  ? order.length + " × " + order.width + " × " + order.height + " cm"
                  : "",
              chargeWeightText:
                order.chargeWeightKg > 0
                  ? "计费重量 " + order.chargeWeightKg + "kg"
                  : "",
              baseFeeText: fmt.money(order.baseFee),
              extraFeeText: fmt.money(order.extraFee),
              remoteFeeText: fmt.money(order.remoteFee),
              insuranceFeeText: fmt.money(order.insuranceFee),
              insuredValueText: order.insuredValue > 0 ? fmt.money(order.insuredValue) : "",
              payModeText: fmt.PAY_MODE[order.payMode] || order.payMode,
              payStateText: fmt.PAY_STATE[order.payState] || order.payState,
              pickupSlot: order.pickupSlot,
              remark: order.remark,
              trackingNo: order.trackingNo,
              cancelReason: order.cancelReason,
              payable: order.payState === "PENDING" && order.payMode === "ONLINE",
              cancellable: order.payState === "PENDING",
            },
            events: (order.events || []).map((event) => ({
              id: event.id,
              label: event.statusLabel,
              note: event.note,
              at: fmt.time(event.at),
            })),
          });
        })
        .catch((error) => {
          this.setData({ loading: false, error: error.message || "订单读取失败" });
        });
    });
  },

  pay() {
    if (this.data.paying) return;
    this.setData({ paying: true });
    auth
      .ensureLogin()
      .then(() =>
        api.repay(this.data.orderNo, this.data.mobile).then((created) => {
          if (!created.payParams) {
            throw new Error(created.message || "店铺暂不支持在线支付");
          }
          return pay.requestPayment(created.payParams);
        }),
      )
      .then(() => {
        wx.showToast({ title: "支付成功", icon: "success" });
        setTimeout(() => this.load(), 800);
        this.setData({ paying: false });
      })
      .catch((error) => {
        this.setData({ paying: false });
        wx.showToast({ title: error.message || "支付失败", icon: "none" });
      });
  },

  cancelOrder() {
    if (this.data.cancelling) return;
    wx.showModal({
      title: "取消订单",
      content: "取消后该单不可恢复；已支付订单请直接联系店方处理。",
      confirmText: "确认取消",
      confirmColor: "#e5484d",
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ cancelling: true });
        api
          .cancelOrder(this.data.orderNo, this.data.mobile)
          .then(() => {
            wx.showToast({ title: "订单已取消", icon: "success" });
            this.setData({ cancelling: false });
            this.load();
          })
          .catch((error) => {
            this.setData({ cancelling: false });
            wx.showToast({ title: error.message || "取消失败", icon: "none" });
          });
      },
    });
  },

  copyTracking() {
    if (!this.data.detail || !this.data.detail.trackingNo) return;
    wx.setClipboardData({ data: this.data.detail.trackingNo });
  },

  goService() {
    const app = getApp();
    const url = app.bootstrap().deskEmbedUrl || "";
    if (!url) {
      wx.showToast({ title: "请通过首页联系方式联系店方", icon: "none" });
      return;
    }
    wx.navigateTo({ url: "/pages/service/service?url=" + encodeURIComponent(url) });
  },

  retry() {
    this.load();
  },

  goPickSite() {
    app.goPickSite();
  },
});
