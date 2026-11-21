const api = require("./api");
const session = require("./session");
const core = require("./core");

/**
 * 静默登录：wx.login 拿 code → POST /login {shopCode, code} 换顾客令牌（状态机在 utils/core.js）。
 * 不传 nickname/avatar：新版基础库已废弃 getUserProfile 之外的授权入口，
 * 昵称头像由后端按微信默认值落库，顾客在「我的」里能看到即可。
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

/** 需要顾客身份的动作（加购、下单、领券）先走这里；已有令牌就直接返回缓存。 */
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
        // 令牌已失效（request 里清过 token）就当作首次登录再走一次。
        if (error && error.code === 401) return login();
        throw error;
      });
  }
  return login();
}

/** 启动时的静默登录：失败不打扰顾客，页面用到身份时再重试。 */
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

/** 接口错误统一 toast：后端 message 已是中文可读文案，直接展示。 */
function showError(error) {
  wx.showToast({ title: core.errorText(error, "操作失败，请稍后重试"), icon: "none", duration: 2500 });
}

/** 401 且静默重登也失败时的兜底：跳兜底登录页，让顾客手动重试一次。 */
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
