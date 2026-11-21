const session = require("./session");
const core = require("./core");

/**
 * C 端请求唯一出口（骨架在 utils/core.js）。
 *
 * 本端差异四条：市场接口整体挂在 `/api/public/market` 前缀下（api.js 只写前缀后的短路径）；
 * 令牌走 `x-customer-token` 头而不是 Authorization；会话是扁平键，
 * 401 交给 session.clear() 一次清干净；公开通道偶尔不带信封直接回业务 JSON，
 * 这种应答要原样交给页面（rawWhenNoCode），否则页面拿到 undefined。
 * 域名没配是出包后最常见的错误，文案换成运营方能照做的说法。
 */
module.exports = core.createRequest({
  getApiBase: () => session.getApiBase(),
  apiPrefix: "/api/public/market",
  getToken: () => session.getToken(),
  authHeader: (token) => (token ? { "x-customer-token": token } : null),
  clearSession: () => session.clear(),
  rawWhenNoCode: true,
  missingBaseMessage: "未配置服务器地址：请在微信开发者工具里打开 config.js 填写 apiBase 后重新编译",
  unauthorizedMessage: "登录已过期，请重新进入小程序",
  domainMessage: "服务器地址未配置为小程序的合法域名，请联系市场运营方在微信后台添加",
});
