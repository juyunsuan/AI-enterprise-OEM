/**
 * 微信登录与错误提示。
 *
 * 顾客态动作（我的订单）需要令牌；匿名看店、下单、查单都不需要。
 * 登录失败不打断浏览，真正需要身份时再提示。
 * wx.login → 换令牌 → 落会话的状态机在 utils/core.js，本端保持 ES5 回调风格，
 * 只把「用哪个接口换令牌、拿到结果怎么写 customer」两处差异交出去。
 */
var api = require("./api");
var session = require("./session");
var core = require("./core");

var runLogin = core.loginWithCode({
  storageKey: session.storageKey,
  requireToken: true,
  tokenMissingMessage: "登录信息不完整，请稍后重试",
  codeMissingMessage: "微信登录失败，请重试",
  loginFailMessage: "微信登录失败，请重试",
  api: function (code) {
    return api.login(code);
  },
  onState: function (data) {
    session.setCustomer({
      nickname: data.nickname || "",
      avatar: data.avatar || "",
      customerId: data.customerId,
    });
    return session.getCustomer();
  },
});

function login() {
  if (session.getToken()) return Promise.resolve(session.getCustomer());
  return runLogin();
}

function showError(error, fallback) {
  wx.showToast({ title: core.errorText(error, fallback || "操作失败"), icon: "none", duration: 2500 });
}

module.exports = {
  login: login,
  showError: showError,
};
