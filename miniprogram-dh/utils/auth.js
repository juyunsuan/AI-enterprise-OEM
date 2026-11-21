const api = require("./api");
const session = require("./session");
const core = require("./core");

/**
 * 会员身份辅助：静默登录、按需重试登录、统一错误提示。
 *
 * 小程序是「匿名可浏览、动作才登录」：启动静默登录一次，失败不打扰；
 * 直到点合成/购买/收藏这类动作时再通过 ensureMember() 重试。
 * wx.login → 换令牌 → 落会话的状态机在 utils/core.js，本端只给适配器。
 */
const TUID_KEY = "digital-human:tuid";

/** 邀请人会员 id：从分享路径的 tuid 参数带进来，只在本机暂存一次。 */
function pendingTuid() {
  try {
    return Number(wx.getStorageSync(TUID_KEY) || 0) || 0;
  } catch (e) {
    return 0;
  }
}

const runLogin = core.loginWithCode({
  storageKey: session.storageKey,
  codeMissingMessage: "微信登录失败",
  loginFailMessage: "微信登录失败",
  // tuid 只在登录成功时才消费掉：登录失败要留着，下一次静默登录继续带上邀请人。
  api: (code) => {
    const payload = { code: code };
    const tuid = pendingTuid();
    if (tuid > 0) payload.tuid = tuid;
    return api.login(payload);
  },
  onState(payload) {
    session.setMember(payload.member || null);
    try {
      wx.removeStorageSync(TUID_KEY);
    } catch (e) {
      /* 忽略 */
    }
    const app = getApp();
    if (app && app.globalData) app.globalData.member = payload.member || null;
    return payload.member || null;
  },
});

function login() {
  return runLogin();
}

/**
 * 保证拿到会员身份：已有令牌返回缓存；否则登录。
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

function refreshMember() {
  return api.member().then((member) => {
    session.setMember(member || null);
    const app = getApp();
    if (app && app.globalData) app.globalData.member = member || null;
    return member;
  });
}

/** 接口错误统一 toast：后端 message 已是中文，直接展示。 */
function showError(error) {
  wx.showToast({ title: core.errorText(error, "操作失败，请稍后重试"), icon: "none", duration: 2500 });
}

module.exports = {
  login: login,
  ensureMember: ensureMember,
  refreshMember: refreshMember,
  showError: showError,
};
