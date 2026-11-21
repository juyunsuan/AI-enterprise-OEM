const api = require("./api");
const session = require("./session");
const core = require("./core");

/**
 * 静默登录（状态机在 utils/core.js）：本小程序没有登录页，令牌由 wx.login 的 code 换取。
 * 落盘走本端的 session.setLogin（扁平 storage 键，见 utils/session.js 的说明），
 * 寄件点码由 utils/api.js 在请求体里带上，所以这里不注入租户键。
 */
const runLogin = core.loginWithCode({
  codeMissingMessage: "获取微信登录凭证失败，请重试",
  api: (code) => api.login(code),
  onState: (result) => {
    session.setLogin(result);
    return result;
  },
});

/** 并发的调用共用同一个 Promise，避免首屏多个请求各换一次 code。 */
function ensureLogin(force) {
  if (!force && session.getToken()) return Promise.resolve(session.getCustomer());
  return runLogin();
}

module.exports = { ensureLogin };
