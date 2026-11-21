const session = require("./session");
const core = require("./core");

/**
 * C 端请求唯一出口（骨架在 utils/core.js）。
 *
 * 本端差异三条：会话是扁平 storage 键，401 一次交给 session.clear() 清干净；
 * 公开通道既可能回统一信封也可能直接回业务 JSON，rawWhenNoCode 让两种都吃得下；
 * 域名没配是出包后最常见的错误，文案换成店主能照做的说法。
 */
module.exports = core.createRequest({
  getApiBase: () => session.getApiBase(),
  getToken: () => session.getToken(),
  clearSession: () => session.clear(),
  rawWhenNoCode: true,
  missingBaseMessage: "未配置服务器地址：请在微信开发者工具里打开 config.js 填写 apiBase 后重新编译",
  unauthorizedMessage: "登录已过期，请重新进入小程序",
  domainMessage: "服务器地址未配置为小程序的合法域名，请联系店方在微信后台添加",
});
