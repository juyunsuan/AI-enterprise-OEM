const api = require("./api");
const session = require("./session");
const core = require("./core");

/**
 * 静默登录：wx.login 换 code → 商城顾客令牌（同一门店同一顾客，与商城小程序共身份）。
 * 外卖端不另建顾客体系，SCRM、积分、优惠券都绑在这条身份上。
 */
const runLogin = core.loginWithCode({
  storageKey: session.storageKey,
  tenantKey: "shopCode",
  tenantValue: () => session.getShopCode(),
  api: (code, extra) => api.login({ shopCode: extra.shopCode, code: code }),
  onState(payload) {
    session.setCustomer(payload);
    const app = getApp();
    if (app && app.globalData) app.globalData.customer = payload;
    return payload;
  },
});

function login() {
  return runLogin();
}

function ensureLogin() {
  if (session.getToken()) {
    const cached = session.getCustomer();
    if (cached && cached.customerId) return Promise.resolve(cached);
    return api
      .profile()
      .then((data) => {
        session.setCustomer(data || null);
        return data;
      })
      .catch((error) => {
        if (error && error.code === 401) return login();
        throw error;
      });
  }
  return login();
}

function silentLogin() {
  return login().catch(() => null);
}

function isLogged() {
  return !!session.getToken();
}

function logout() {
  session.clearToken();
  const app = getApp();
  if (app && app.globalData) app.globalData.customer = null;
}

function showError(error) {
  wx.showToast({
    title: core.errorText(error, "操作失败，请稍后重试"),
    icon: "none",
    duration: 2500,
  });
}

function requireLogin(redirect) {
  const target = redirect ? "?redirect=" + encodeURIComponent(redirect) : "";
  wx.navigateTo({ url: "/pages/login/login" + target });
}

module.exports = {
  login: login,
  ensureLogin: ensureLogin,
  silentLogin: silentLogin,
  isLogged: isLogged,
  logout: logout,
  showError: showError,
  requireLogin: requireLogin,
};