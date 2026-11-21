const session = require("./session");
const core = require("./core");

/**
 * C 端请求统一走这里（骨架在 utils/core.js）。
 *
 * 本端差异是「一个 options 决定用哪条身份的令牌」：`options.staff` 带技师令牌、
 * `options.agent` 带代理令牌，其余带顾客令牌；401 也只清对应槽位。
 * 骨架不认身份，身份只从参数进来，所以这里必须把取令牌/清会话两件事交出来。
 */
module.exports = core.createRequest({
  rawWhenNoCode: true,
  getSessionKey: session.storageKey,
  getApiBase: () => session.getApiBase(),
  getToken: (options) =>
    options.agent ? session.getAgentToken() : options.staff ? session.getStaffToken() : session.getToken(),
  clearSession: (options) => {
    if (options.agent) session.clearAgentToken();
    else if (options.staff) session.clearStaffToken();
    else session.clearToken();
  },
  missingBaseMessage: "未配置服务器地址",
  unauthorizedMessage: "登录已过期，请重新进入小程序",
  domainMessage: "服务器地址未在该小程序后台配置为合法域名",
});
