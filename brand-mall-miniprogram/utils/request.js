const session = require("./session");
const core = require("./core");

const API_PREFIX = "/api/public/brand-mall";

/**
 * C 端请求统一出口（骨架在 utils/core.js）。
 *
 * 本端开 401 静默重登：小程序没有登录按钮，顾客令牌是 wx.login 静默换来的，
 * 令牌过期只有「过期」或「首次进入没赶上登录」两种可能，两者都能靠一次新的
 * wx.login 无感恢复；core 只重发一次，重登仍失败才把 401 抛给页面。
 * auth.js 反过来要用本文件发请求，所以 require 放在函数里避开循环依赖。
 */
const send = core.createRequest({
  rawWhenNoCode: true,
  getSessionKey: session.storageKey,
  getApiBase: () => session.getApiBase(),
  apiPrefix: API_PREFIX,
  autoReloginOnce: true,
  relogin: () => require("./auth").login(),
  clearKeys: ["token", "customer"],
  missingBaseMessage: "未配置接口地址：请在 config.js 填写 apiBase（见平台「小程序发布说明」）",
  unauthorizedMessage: "登录已失效",
  domainMessage: "服务器地址未在该小程序后台配置为合法域名",
});

module.exports = function request(options) {
  const opts = options || {};
  // 公开路由都靠 ?shopCode= 认店，页面层不再传。
  const query = Object.assign({ shopCode: session.getShopCode() }, opts.query || {});
  return send(Object.assign({}, opts, { query: query }));
};
