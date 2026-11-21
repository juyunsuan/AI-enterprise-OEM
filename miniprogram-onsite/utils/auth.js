const api = require("./api");
const session = require("./session");
const core = require("./core");

/**
 * 顾客登录：wx.login 拿 code → 后端 code2Session 建档发令牌 → 落 token/profile。
 * 状态机在 utils/core.js；本端只交出适配器与店铺码键名（api.login 是位置参数，
 * core 把寻址码备在 extra 里，不猜参数形状），并发调用共用同一个 promise。
 */
const runLogin = core.loginWithCode({
  storageKey: session.storageKey,
  tenantKey: "shopCode",
  tenantValue: () => session.getShopCode(),
  requireToken: true,
  api: (code, extra) => api.login(extra.shopCode, code),
  onState(data) {
    session.setProfile(data.profile || null);
    return data.profile || null;
  },
});

/**
 * 顾客没有“注册”这一步——首次进入即由后端建档；缺店铺码/缺基址是出包问题，
 * 先把可读原因抛给页面，别让它变成一次注定失败的 wx.login。
 */
function ensureLogin() {
  if (session.getToken()) return Promise.resolve(session.getProfile());
  if (!session.getShopCode()) {
    return Promise.reject(new Error("小程序缺少店铺码，请让店主重新出包后再试"));
  }
  if (!session.getApiBase()) {
    return Promise.reject(
      new Error("未配置服务器地址，请让店主重新出包，或在「我的 → 服务器地址」临时填写"),
    );
  }
  return runLogin();
}

function logout() {
  session.clearToken();
}

module.exports = { ensureLogin, logout };
