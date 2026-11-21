const session = require("./session");
const core = require("./core");

/**
 * 园区小程序请求唯一出口（骨架在 utils/core.js）。
 * 顾客请求带 Authorization；员工请求带 x-park-staff-token，两类令牌由服务端分属不同 issuer。
 */
module.exports = core.createRequest({
  getApiBase: () => session.getApiBase(),
  getToken: (options) =>
    options && options.staff ? session.getStaffToken() : session.getToken(),
  clearSession: (options) => {
    if (options && options.staff) session.clearStaff();
    else session.clear();
  },
  authHeader: (token, options) => {
    if (!token) return {};
    if (options && options.staff) return { "x-park-staff-token": token };
    return { Authorization: "Bearer " + token };
  },
  rawWhenNoCode: true,
  missingBaseMessage:
    "未配置服务器地址：请在微信开发者工具里打开 config.js 填写 apiBase 后重新编译",
  unauthorizedMessage: "登录已过期，请重新进入小程序",
  domainMessage:
    "服务器地址未配置为小程序的合法域名，请在微信公众平台「开发管理 → 服务器域名」添加",
});
