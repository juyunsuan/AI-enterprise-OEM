const session = require("./session");
const core = require("./core");

const PREFIX = "/api/public/takeout";

/**
 * 顾客端请求出口（骨架在 utils/core.js）。
 *
 * 外卖的登录、菜单、购物车、地址、优惠券、积分、订单全部走自己的公开通道，
 * 不读商城接口；复用的只是服务端登录/支付/SCRM/算价等公共服务。
 * 401 静默重登一次：顾客令牌是 wx.login 换来的，过期属于正常生命周期。
 */
const send = core.createRequest({
  rawWhenNoCode: true,
  getSessionKey: session.storageKey,
  getApiBase: () => session.getApiBase(),
  autoReloginOnce: true,
  relogin: () => require("./auth").login(),
  clearKeys: ["token", "customer"],
  missingBaseMessage: "未配置接口地址：请在 config.js 填写 apiBase（见平台「小程序发布说明」）",
  unauthorizedMessage: "登录已失效",
  domainMessage: "服务器地址未在该小程序后台配置为合法域名",
});

module.exports = function request(options) {
  const opts = options || {};
  const path = opts.path || "";
  const query = Object.assign({ shopCode: session.getShopCode() }, opts.query || {});
  return send(Object.assign({}, opts, { path: PREFIX + path, query: query }));
};