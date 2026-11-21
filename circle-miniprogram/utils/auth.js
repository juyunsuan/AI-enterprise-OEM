var api = require("./api");
var session = require("./session");
var core = require("./core");

/** 静默登录：wx.login 的 code 换社区成员令牌；状态机在 utils/core.js。 */
var runLogin = core.loginWithCode({
  codeMissingMessage: "获取微信登录凭证失败，请重试",
  api: function (code) {
    return api.login(code);
  },
  onState: function (result) {
    session.setLogin(result);
    var app = getApp();
    if (app && app.globalData) app.globalData.viewer = result.user || null;
    return result;
  }
});

function ensureLogin(force) {
  if (!force && session.getToken()) return Promise.resolve(session.getCustomer());
  return runLogin();
}

module.exports = { ensureLogin: ensureLogin };