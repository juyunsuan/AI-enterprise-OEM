/**
 * 统一请求出口（骨架在 utils/core.js）：本站差异只有前缀与 `?site=` 站点码。
 *
 * 后端公开接口固定挂在 `/api/public/card-shop` 下，且都靠 `site`（站点码）做租户寻址，
 * 这两件事在这里一次做完，页面层不再关心前缀和寻址码。
 */
var config = require("../config");
var session = require("./session");
var core = require("./core");

var send = core.createRequest({
  rawWhenNoCode: true,
  getSessionKey: session.storageKey,
  getApiBase: function () {
    return String(config.apiBase || "").trim().replace(/\/+$/, "");
  },
  apiPrefix: "/api/public/card-shop",
  clearKeys: ["token"],
  missingBaseMessage: "未配置站点接口地址，请用后端打包生成小程序包",
  unauthorizedMessage: "登录已过期，请重新进入小程序",
  domainMessage: "站点域名未加入小程序 request 合法域名名单",
});

module.exports = function request(options) {
  var opts = options || {};
  var query = Object.assign({ site: config.siteCode }, opts.query || {});
  return send(Object.assign({}, opts, { query: query }));
};
