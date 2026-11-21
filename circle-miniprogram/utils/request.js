var session = require("./session");
var core = require("./core");

/** C 端请求唯一出口（骨架在 utils/core.js）。 */
module.exports = core.createRequest({
  getApiBase: function () {
    return session.getApiBase();
  },
  getToken: function () {
    return session.getToken();
  },
  clearSession: function () {
    session.clear();
  },
  rawWhenNoCode: true,
  missingBaseMessage: "未配置服务器地址，请按「小程序发布说明」填写 config.js 的 apiBase",
  unauthorizedMessage: "登录已过期，请重新进入小程序",
  domainMessage: "服务器地址未配置为小程序的合法域名，请联系社区管理员在微信后台添加"
});