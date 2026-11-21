const config = require("../config");
const session = require("./session");
const core = require("./core");

/**
 * 统一请求出口（骨架在 utils/core.js）：数字人公共接口固定挂在 `/api/public/digital-human`，
 * 且所有接口都靠 `?site=` 做租户寻址，这两件事在这里一次做完，页面层不再关心前缀和寻址码。
 * upload.js 走 wx.uploadFile 用不上 request，所以基址/前缀/查询串三件工具一并转出。
 */
const API_PREFIX = "/api/public/digital-human";

function baseUrl() {
  return String(config.apiBase || "").trim().replace(/\/+$/, "");
}

const send = core.createRequest({
  rawWhenNoCode: true,
  getSessionKey: session.storageKey,
  getApiBase: baseUrl,
  apiPrefix: API_PREFIX,
  clearKeys: ["token"],
  missingBaseMessage: "未配置站点接口地址，请用后端打包生成小程序包",
  unauthorizedMessage: "登录已过期，请重新进入小程序",
  domainMessage: "站点域名未加入小程序 request 合法域名名单",
});

module.exports = function request(options) {
  const opts = options || {};
  return send(Object.assign({}, opts, { query: Object.assign({ site: config.siteCode }, opts.query || {}) }));
};
module.exports.baseUrl = baseUrl;
module.exports.API_PREFIX = API_PREFIX;
module.exports.toQuery = core.toQuery;
