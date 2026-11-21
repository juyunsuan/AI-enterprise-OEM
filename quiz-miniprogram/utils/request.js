var session = require("./session");
var core = require("./core");

/** 公开答题通道唯一出口：免登录，骨架在 utils/core.js。 */
module.exports = core.createRequest({
  rawWhenNoCode: true,
  getApiBase: function () {
    return session.getApiBase();
  },
  getToken: function () {
    return "";
  },
  clearSession: function () {},
  missingBaseMessage: "未配置服务器地址，请在小程序首页「连接设置」填写，或按发布说明改 config.js",
  unauthorizedMessage: "会话已失效，请重新进入小程序",
  domainMessage: "服务器地址未登记为小程序合法域名，请在微信后台加入 request 合法域名",
});