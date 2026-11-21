/**
 * 会员身份辅助：静默登录、按需重试登录、统一错误提示。
 *
 * 知识付费小程序是「匿名可浏览、动作才登录」的形态：启动时静默登录一次即可，
 * 失败不打扰用户；直到用户真的要点解锁/签到/收藏时再通过 ensureMember() 重试，
 * 这样后台未开启会员体系时普通浏览也不会看到报错弹窗。
 */
const api = require("./api");
const session = require("./session");
const core = require("./core");

/** wx.login 拿 code → 换会员令牌 → 落 token/member；状态机在 utils/core.js，本端只给适配器。 */
const runLogin = core.loginWithCode({
  storageKey: session.storageKey,
  api: (code) => api.login({ code: code }),
  codeMissingMessage: "微信登录失败",
  loginFailMessage: "微信登录失败",
  onState(payload) {
    session.setMember(payload.member || null);
    const app = getApp();
    if (app && app.globalData) app.globalData.member = payload.member || null;
    return payload.member || null;
  },
});

function login() {
  return runLogin();
}

/**
 * 保证拿到会员身份：已有令牌直接返回缓存的 member；否则重试登录。
 * 并发调用复用同一个 promise，防止连点触发多次 wx.login。
 */
function ensureMember() {
  const app = getApp();
  if (session.getToken()) {
    const cached = session.getMember();
    if (cached) return Promise.resolve(cached);
    return api
      .member()
      .then((member) => {
        session.setMember(member || null);
        if (app && app.globalData) app.globalData.member = member || null;
        return member;
      })
      .catch((error) => {
        // 令牌过期（request 已清 token）就当作首次登录再走一次。
        if (error && error.code === 401) return login();
        throw error;
      });
  }
  if (app && app.globalData.loginPromise) return app.globalData.loginPromise;
  // 用 then(ok, fail) 而不是 finally：低版本基础库没有 Promise.prototype.finally。
  const settle = () => {
    if (app && app.globalData) app.globalData.loginPromise = null;
  };
  const promise = login().then(
    (member) => {
      settle();
      return member;
    },
    (error) => {
      settle();
      throw error;
    },
  );
  app.globalData.loginPromise = promise;
  return promise;
}

/** 接口错误统一 toast：后端 message 已是中文，直接展示即可。 */
function showError(error) {
  wx.showToast({ title: core.errorText(error, "操作失败，请稍后重试"), icon: "none", duration: 2500 });
}

module.exports = {
  login: login,
  ensureMember: ensureMember,
  showError: showError,
};
