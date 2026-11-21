/**
 * 会话与站点配置的本地持久化。
 *
 * 本端刻意不走 utils/core.js 的会话工厂：token / customer / site 各占一个**扁平字符串键**
 * （customer 还是 JSON 串），换成「一个键存一个对象」会让已发布版本的顾客登录态与
 * 已选寄件点全部失效。骨架统一的是请求出口与登录状态机，存储布局属于端上的历史包袱。
 */
const CONFIG = require("../config");

const TOKEN_KEY = "kuaidi_token";
const CUSTOMER_KEY = "kuaidi_customer";
const SITE_KEY = "kuaidi_site";

/** apiBase 带不带尾斜杠都能用；未注入时返回空串，由 request 给出可读提示。 */
function getApiBase() {
  return String(CONFIG.apiBase || "").replace(/\/+$/, "");
}

/**
 * 当前寄件点码：一个账号一部小程序，包内不再写死站点，
 * 顾客首次进入时选点后存本地；扫码带 site 时优先用码里的。
 */
function getSite() {
  const injected = String(CONFIG.siteCode || "");
  if (injected) return injected;
  return String(wx.getStorageSync(SITE_KEY) || "");
}

function setSite(code) {
  wx.setStorageSync(SITE_KEY, String(code || "").toUpperCase());
}

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || "";
}

function setLogin(result) {
  const value = result || {};
  wx.setStorageSync(TOKEN_KEY, value.token || "");
  wx.setStorageSync(
    CUSTOMER_KEY,
    JSON.stringify({
      customerId: value.customerId || 0,
      nickname: value.nickname || "",
      avatar: value.avatar || "",
    }),
  );
}

function getCustomer() {
  try {
    return JSON.parse(wx.getStorageSync(CUSTOMER_KEY) || "{}");
  } catch (error) {
    return {};
  }
}

/** 令牌按「场景 + 寄件点」签发，换点后旧令牌必须丢弃。 */
function clear() {
  wx.removeStorageSync(TOKEN_KEY);
  wx.removeStorageSync(CUSTOMER_KEY);
}

module.exports = {
  getApiBase,
  getSite,
  setSite,
  getToken,
  setLogin,
  getCustomer,
  clear,
  appName: CONFIG.appName || "",
  themeColor: CONFIG.themeColor || "",
  deskSiteKey: CONFIG.deskSiteKey || "",
};
