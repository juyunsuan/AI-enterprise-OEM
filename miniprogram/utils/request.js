const session = require("./session");
const core = require("./core");

/**
 * 站内接口统一走这里：URL 组装、`{code,message,data}` 解包、401 清会话都在 utils/core.js，
 * 本文件只声明本站的差异（基址来源、提示文案、要清掉的槽位）。
 */
module.exports = core.createRequest({
  rawWhenNoCode: true,
  getSessionKey: session.storageKey,
  getApiBase: () => session.getApiBase(),
  clearKeys: ["token", "profile"],
  missingBaseMessage: "未配置服务器地址",
  unauthorizedMessage: "登录已过期，请重新登录",
  domainMessage: "服务器地址未在微信后台配置为合法域名",
});
