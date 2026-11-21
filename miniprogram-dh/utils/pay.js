/** 微信支付：把后端 prepay 返回的 JSAPI 参数交给 wx.requestPayment。 */
function pay(params) {
  return new Promise((resolve, reject) => {
    if (!params || !params.paySign) {
      reject(new Error("支付参数缺失，请稍后重试或使用卡密兑换"));
      return;
    }
    wx.requestPayment({
      timeStamp: String(params.timeStamp),
      nonceStr: params.nonceStr,
      package: params.package,
      signType: params.signType || "RSA",
      paySign: params.paySign,
      success() {
        resolve(true);
      },
      fail(err) {
        const message = err && err.errMsg ? err.errMsg : "";
        reject(new Error(message.indexOf("cancel") >= 0 ? "已取消支付" : "支付失败，请重试"));
      },
    });
  });
}

module.exports = { pay: pay };
