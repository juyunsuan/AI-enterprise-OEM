/**
 * 微信支付统一封装：支付参数只由后端 prepay 下发，端上不拼参数、不改金额。
 * 用户主动取消不算失败，页面按「已取消支付」提示并允许原单重付。
 */
function requestPayment(payParams) {
  return new Promise(function (resolve, reject) {
    wx.requestPayment({
      timeStamp: payParams.timeStamp,
      nonceStr: payParams.nonceStr,
      package: payParams.package,
      signType: payParams.signType || "RSA",
      paySign: payParams.paySign,
      success: function () {
        resolve(true);
      },
      fail: function (err) {
        const raw = (err && err.errMsg) || "";
        const error = new Error(
          raw.indexOf("cancel") >= 0 ? "已取消支付" : "支付未完成，请重试",
        );
        error.cancelled = raw.indexOf("cancel") >= 0;
        reject(error);
      },
    });
  });
}

module.exports = { requestPayment };
