const api = require("./api");
const session = require("./session");
const core = require("./core");

const runLogin = core.loginWithCode({
  codeMissingMessage: "获取微信登录凭证失败，请重试",
  api: (code) => api.login(code),
  onState: (result) => {
    session.setLogin(result);
    return result;
  },
});

function ensureLogin(force) {
  if (!force && session.getToken()) return Promise.resolve(session.getCustomer());
  return runLogin();
}

module.exports = { ensureLogin };
