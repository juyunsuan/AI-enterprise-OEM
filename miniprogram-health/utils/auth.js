const api = require("./api");
const session = require("./session");
const core = require("./core");

/**
 * 顾客登录状态机在 utils/core.js：wx.login → 换令牌 → 落 token/profile，并发调用共用同一个 promise。
 *
 * 推广码是 health 特有的：它从启动参数带入、只在首次建档时生效，而 core 的 api 适配器只管收
 * (code, extra)，所以这一位参数在本端适配器里补齐，不往骨架里塞业务概念。
 */
const runLogin = core.loginWithCode({
  storageKey: session.storageKey,
  tenantKey: "shopCode",
  tenantValue: () => session.getShopCode(),
  requireToken: true,
  api: (code, extra) => api.login(extra.shopCode, code, promoterCode()),
  onState(data) {
    session.setProfile(data.profile || null);
    return data.profile || null;
  },
});

function promoterCode() {
  try {
    const launch = wx.getLaunchOptionsSync ? wx.getLaunchOptionsSync() : null;
    return (launch && launch.query && launch.query.promoter) || "";
  } catch (e) {
    return "";
  }
}

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

/** 页面统一入口：要求登录才继续，失败时给出可读提示并回首页。 */
function requireLogin(options) {
  const opts = options || {};
  return ensureLogin().catch((error) => {
    wx.showToast({ title: core.errorText(error, "登录失败"), icon: "none" });
    if (opts.redirect !== false) {
      setTimeout(() => wx.switchTab({ url: "/pages/home/home" }), 800);
    }
    throw error;
  });
}

function logout() {
  session.clearToken();
}

module.exports = { ensureLogin, requireLogin, logout };
