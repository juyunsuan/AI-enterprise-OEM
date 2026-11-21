const api = require("./api");
const session = require("./session");
const core = require("./core");

/**
 * 静默登录（状态机在 utils/core.js）：本小程序没有登录页，令牌由 wx.login 的 code 换取。
 * 落盘仍走本端的 session.setLogin（扁平 storage 键，见 utils/session.js 的说明），
 * 所以这里不传 storageKey，只把「拿到结果之后怎么写」交给 onState。
 */
const runLogin = core.loginWithCode({
  api: (code) => api.login({ code: code }),
  codeMissingMessage: "获取微信登录凭证失败，请重试",
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
