const session = require("./session");
const core = require("./core");

/**
 * 顾客端请求统一走这里（骨架在 utils/core.js）。
 *
 * 本端差异：医护通道（`options.staff === true`）的令牌单独存一格，
 * 所以取令牌/清会话/401 文案都按槽位走，医护掉线不会把顾客一起踢出。
 */
module.exports = core.createRequest({
  rawWhenNoCode: true,
  slots: session.slots,
  slotOf: (options) => (options.staff ? "staff" : "customer"),
  clearKeys: (options) =>
    options.staff ? ["token", "practitioner"] : ["token", "profile", "patientId"],
  getApiBase: () => session.getApiBase(),
  missingBaseMessage: "未配置服务器地址",
  unauthorizedMessage: (options) =>
    options.staff ? "医护登录已过期，请重新绑定" : "登录已过期，请重新进入小程序",
  domainMessage: "服务器地址未在该小程序后台配置为合法域名",
});
