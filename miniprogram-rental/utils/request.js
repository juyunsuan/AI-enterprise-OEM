const session = require("./session");
const core = require("./core");

module.exports = core.createRequest({
  rawWhenNoCode: true,
  getSessionKey: session.storageKey,
  getApiBase: () => session.getApiBase(),
  getToken: (options) =>
    options && options.staff ? session.getStaffToken() : session.getToken(),
  clearSession: (options) => {
    if (options && options.staff) session.clearStaffToken();
    else session.clearToken();
  },
  missingBaseMessage: "未配置服务器地址",
  unauthorizedMessage: "登录已过期，请重新进入小程序",
  domainMessage: "服务器地址未在该小程序后台配置为合法域名",
});