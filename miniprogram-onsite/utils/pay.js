const api = require("./api");

/** 微信支付调起：参数与签名都由后端给出，端上只负责把结果翻译成「成功/未完成」。 */
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

/**
 * 支付一单：payable=false 时把后端原因原样带出（未开通收款、已过期等），
 * 不在这里把「拿不到参数」说成「支付失败」。
 */
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

/** 支付加钟单：加钟是独立待付记录，参数从 addons/pay-params 取。 */
function payAddon(addonId) {
  return api
    .addonPayParams(addonId)
    .then((res) => {
      if (!res || !res.payable || !res.params) {
        return { paid: false, reason: (res && res.reason) || "当前加钟单不可支付" };
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

module.exports = { payOrder, payAddon };
