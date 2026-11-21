/**
 * 会话与站点配置的本地持久化。
 *
 * 本端刻意不走 utils/core.js 的会话工厂：token / customer / market 各占一个**扁平字符串键**
 * （customer 还是 JSON 串），换成「一个键存一个对象」会让已发布版本的顾客登录态与已选市场全部失效。
 * 骨架统一的是请求出口与登录状态机，存储布局属于端上的历史包袱，改动要单独评估。
 */
const CONFIG = require("../config");

const TOKEN_KEY = "mp_token";
const CUSTOMER_KEY = "mp_customer";
const MARKET_KEY = "mp_market_code";

/** apiBase 带不带尾斜杠都能用；没填时返回空串，由 request 给出可读提示。 */
function getApiBase() {
  return String(CONFIG.apiBase || "").replace(/\/+$/, "");
}

/**
 * 市场编号：config.js 里填的是主来源；扫码带 scene 时以码里的为准并存下来，
 * 用于同一主体下临时切换到另一个市场预览。
 */
function getMarketCode() {
  const code = String(wx.getStorageSync(MARKET_KEY) || "");
  return code || String(CONFIG.marketCode || "");
}

function setMarketCode(code) {
  const value = String(code || "").trim();
  if (!value) return;
  wx.setStorageSync(MARKET_KEY, value);
}

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || "";
}

function customerFields(customer) {
  const value = customer || {};
  return {
    id: value.id || 0,
    nickname: value.nickname || "",
    avatar: value.avatar || "",
    phone: value.phone || "",
    points: value.points || 0,
    balance: value.balance || 0,
  };
}

function setLogin(result) {
  wx.setStorageSync(TOKEN_KEY, (result && result.token) || "");
  wx.setStorageSync(CUSTOMER_KEY, JSON.stringify(customerFields(result && result.customer)));
}

function setCustomer(customer) {
  if (!customer) return;
  wx.setStorageSync(CUSTOMER_KEY, JSON.stringify(customerFields(customer)));
}

function getCustomer() {
  try {
    return JSON.parse(wx.getStorageSync(CUSTOMER_KEY) || "{}");
  } catch (error) {
    return {};
  }
}

/** 令牌按「市场 + 顾客」签发，换市场后旧令牌必须丢弃。 */
function clear() {
  wx.removeStorageSync(TOKEN_KEY);
  wx.removeStorageSync(CUSTOMER_KEY);
}

module.exports = {
  getApiBase,
  getMarketCode,
  setMarketCode,
  getToken,
  setLogin,
  setCustomer,
  getCustomer,
  clear,
  appName: CONFIG.appName || "",
  themeColor: CONFIG.themeColor || "",
};
