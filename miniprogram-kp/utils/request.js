/**
 * 统一请求出口：本站只声明差异，URL 组装 / 信封解包 / 401 策略都在 utils/core.js。
 *
 * 后端知识付费公共接口固定挂在 `/api/public/knowledge-pay` 下，且所有接口都靠
 * `?site=` 做租户寻址（后端统一从 query 读，避免 body 字段遗漏），所以在包装层一次带上。
 */
const config = require("../config");
const session = require("./session");
const core = require("./core");

const API_PREFIX = "/api/public/knowledge-pay";

const send = core.createRequest({
  rawWhenNoCode: true,
  getSessionKey: session.storageKey,
  getApiBase: () => String(config.apiBase || "").trim().replace(/\/+$/, ""),
  apiPrefix: API_PREFIX,
  // 令牌失效只清身份，member 快照留着给页面显示上次数据。
  clearKeys: ["token"],
  missingBaseMessage: "未配置站点接口地址，请用后端打包生成小程序包",
  unauthorizedMessage: "登录已过期，请重新进入小程序",
  domainMessage: "站点域名未加入小程序 request 合法域名名单",
});

module.exports = function request(options) {
  const opts = options || {};
  return send(Object.assign({}, opts, { query: Object.assign({ site: config.site }, opts.query || {}) }));
};
