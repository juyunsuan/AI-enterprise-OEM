const api = require("./api");
const session = require("./session");
const core = require("./core");

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

function ensureLogin() {
  if (session.getToken()) return Promise.resolve(session.getProfile());
  if (!session.getShopCode()) {
    return Promise.reject(new Error("小程序缺少门店码，请让店长重新分发并填写 config.js"));
  }
  if (!session.getApiBase()) {
    return Promise.reject(
      new Error("未配置服务器地址，请在「我的 → 服务器地址」临时填写或让店长重新分发"),
    );
  }
  return runLogin();
}

function logout() {
  session.clearToken();
}

module.exports = { ensureLogin, logout };