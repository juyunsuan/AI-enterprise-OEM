const session = require("./session");
const core = require("./core");

/**
 * 跑腿小程序请求唯一出口（骨架在 utils/core.js）。
 *
 * 顾客与骑手共用同一个请求函数：`rider: true` 的请求带骑手令牌，
 * 其余带顾客令牌；服务端按路径分别验签，两个 token 互不越权。
 */
module.exports = core.createRequest({
  getApiBase: () => session.getApiBase(),
  getToken: (options) =>
    options && options.rider ? session.getRiderToken() : session.getToken(),
  clearSession: (options) => {
    if (options && options.rider) session.clearRider();
    else session.clear();
  },
  rawWhenNoCode: true,
  missingBaseMessage:
    "未配置服务器地址：请在微信开发者工具里打开 config.js 填写 apiBase 后重新编译",
  unauthorizedMessage: "登录已过期，请重新进入小程序",
  domainMessage:
    "服务器地址未配置为小程序的合法域名，请在微信公众平台「开发管理 → 服务器域名」添加",
});
