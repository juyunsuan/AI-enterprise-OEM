const api = require("./api");
const session = require("./session");
const core = require("./core");

/**
 * 顾客静默登录（状态机在 utils/core.js）：没有登录页，令牌由 wx.login 的 code 换取。
 * 骑手登录也走同一套状态机，但落在独立的存储键与独立 issuer 上。
 */
const runLogin = core.loginWithCode({
  codeMissingMessage: "获取微信登录凭证失败，请重试",
  api: (code) => api.login(code),
  onState: (result) => {
    session.setLogin(result);
    return result;
  },
});

const runRiderLogin = core.loginWithCode({
  codeMissingMessage: "获取微信登录凭证失败，请重试",
  api: (code) => api.riderLogin(code),
  onState: (result) => {
    session.setRiderLogin(result);
    return result;
  },
});

function ensureLogin(force) {
  if (!force && session.getToken()) return Promise.resolve(session.getCustomer());
  return runLogin();
}

function ensureRiderLogin(force) {
  if (!force && session.getRiderToken()) return Promise.resolve(session.getRider());
  return runRiderLogin();
}

module.exports = { ensureLogin, ensureRiderLogin };
