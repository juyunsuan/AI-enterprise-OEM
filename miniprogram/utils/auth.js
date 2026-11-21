const session = require("./session");
const core = require("./core");

/** 页面加载前的登录门禁：未登录时跳登录页并返回 false。 */
function ensureLogin() {
  if (session.getToken()) return true;
  wx.navigateTo({ url: "/pages/login/login" });
  return false;
}

/** 展示接口错误：401 统一引导回登录页。 */
function showError(error) {
  wx.showToast({ title: core.errorText(error, "操作失败"), icon: "none", duration: 2500 });
  if (error && error.code === 401) {
    setTimeout(() => {
      wx.navigateTo({ url: "/pages/login/login" });
    }, 800);
  }
}

module.exports = { ensureLogin: ensureLogin, showError: showError };
