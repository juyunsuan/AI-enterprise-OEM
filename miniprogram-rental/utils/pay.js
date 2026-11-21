const api = require("./api");

function requestPay(params) {
  return new Promise((resolve, reject) => {
    wx.requestPayment({
      timeStamp: params.timeStamp,
      nonceStr: params.nonceStr,
      package: params.package,
      signType: params.signType,
      paySign: params.paySign,
      success: resolve,
      fail: reject,
    });
  });
}

function payOrder(orderId) {
  return api
    .payParams(orderId)
    .then((res) => {
      if (!res || !res.payable || !res.params) {
        return { paid: false, reason: (res && res.reason) || "当前订单不可支付" };
      }
      return requestPay(res.params).then(
        () => ({ paid: true, reason: "" }),
        (error) => {
          const message = (error && error.errMsg) || "";
          return {
            paid: false,
            reason: message.indexOf("cancel") >= 0 ? "已取消支付" : "支付未完成，请稍后重试",
          };
        },
      );
    })
    .catch((error) => ({
      paid: false,
      reason: (error && error.message) || "支付参数获取失败",
    }));
}

module.exports = { payOrder };