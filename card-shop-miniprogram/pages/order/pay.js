const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const session = require("../../utils/session");

Page({
  data: {
    themeStyle: "",
    orderNo: "",
    contact: "",
    goodsName: "",
    totalText: "0.00",
    quantity: 0,
    payEnabled: false,
    payParams: null,
    message: "",
    paying: false,
    checking: false,
    error: "",
  },

  onLoad(query) {
    const app = getApp();
    const orderNo = String(query.orderNo || "");
    const draft = app.globalData.payDraft;
    const contact = String(
      query.contact || (draft && draft.contact) || session.getContact(orderNo) || "",
    );
    this.setData({
      themeStyle: app.globalData.themeStyle,
      orderNo: orderNo,
      contact: contact,
    });
    if (draft && draft.orderNo === orderNo) {
      this.applyDraft(draft);
      app.globalData.payDraft = null;
    } else {
      this.repay();
    }
  },

  applyDraft(draft) {
    this.setData({
      goodsName: draft.goodsName || "",
      totalText: format.money(draft.totalAmount),
      quantity: draft.quantity || 0,
      payEnabled: !!draft.payEnabled,
      payParams: draft.payParams || null,
      message: draft.message || "",
    });
    if (!draft.payEnabled || !draft.payParams) {
      this.offlineHint();
    }
  },

  repay() {
    if (!this.data.contact) {
      this.setData({ error: "缺少联系方式，请从订单重新进入支付" });
      return;
    }
    api
      .repay(this.data.orderNo, this.data.contact)
      .then((data) => {
        this.setData({
          goodsName: this.data.goodsName,
          totalText: format.money(data.totalAmount),
          quantity: data.quantity,
          payEnabled: !!data.payEnabled,
          payParams: data.payParams,
          message: data.message || "",
        });
        if (!data.payEnabled) this.offlineHint();
      })
      .catch((error) => {
        this.setData({ error: (error && error.message) || "支付信息获取失败" });
      });
  },

  offlineHint() {
    wx.showModal({
      title: "暂未开通在线收款",
      content:
        this.data.message ||
        "请把订单号 " +
          this.data.orderNo +
          "（¥" +
          this.data.totalText +
          "）发给店主完成付款。",
      showCancel: false,
      confirmText: "我知道了",
    });
  },

  pay() {
    if (this.data.paying) return;
    if (!this.data.payEnabled || !this.data.payParams) {
      this.offlineHint();
      return;
    }
    const params = this.data.payParams;
    this.setData({ paying: true });
    wx.requestPayment({
      timeStamp: params.timeStamp,
      nonceStr: params.nonceStr,
      package: params.package,
      signType: params.signType || "RSA",
      paySign: params.paySign,
      success: () => {
        this.setData({ paying: false, checking: true });
        this.pollPaid();
      },
      fail: (err) => {
        this.setData({ paying: false });
        const message = (err && err.errMsg) || "支付未完成";
        if (message.indexOf("cancel") >= 0) {
          wx.showToast({ title: "已取消支付", icon: "none" });
          return;
        }
        auth.showError(err, "支付失败");
      },
    });
  },

  /** 支付回调是异步的：短轮询订单状态，出卡后跳到取卡页。 */
  pollPaid() {
    let attempts = 0;
    const tick = () => {
      attempts += 1;
      api
        .orderQuery(this.data.orderNo, this.data.contact, "")
        .then((result) => {
          if (result && result.payState === "PAID") {
            wx.showToast({ title: "支付成功", icon: "success" });
            setTimeout(() => this.goCard(), 600);
            return;
          }
          if (attempts >= 5) {
            this.setData({ checking: false });
            wx.showModal({
              title: "支付结果确认中",
              content: "微信已扣款，卡密通常几秒内生成。可稍后在「我的订单」或查单页查看。",
              confirmText: "去查单",
              cancelText: "稍后",
              success: (res) => {
                if (res.confirm) this.goCard();
              },
            });
            return;
          }
          setTimeout(tick, 2000);
        })
        .catch(() => {
          if (attempts >= 5) {
            this.setData({ checking: false });
            return;
          }
          setTimeout(tick, 2000);
        });
    };
    setTimeout(tick, 1200);
  },

  goCard() {
    wx.redirectTo({
      url:
        "/pages/card/index?orderNo=" +
        this.data.orderNo +
        "&contact=" +
        encodeURIComponent(this.data.contact),
    });
  },

  goQuery() {
    wx.redirectTo({
      url:
        "/pages/query/query?orderNo=" +
        this.data.orderNo +
        "&contact=" +
        encodeURIComponent(this.data.contact),
    });
  },
});
