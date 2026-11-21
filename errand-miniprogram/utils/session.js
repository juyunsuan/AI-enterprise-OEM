/**
 * 会话与站点配置的本地持久化（扁平 storage 键）。
 *
 * 顾客与骑手是两套令牌：顾客令牌在 errand_token，骑手令牌在 errand_rider_token；
 * 两者都由服务端按独立 issuer 签发，互不串用。
 */
const CONFIG = require("../config");

const TOKEN_KEY = "errand_token";
const CUSTOMER_KEY = "errand_customer";
const SITE_KEY = "errand_site";
const CITY_KEY = "errand_city";
const RIDER_TOKEN_KEY = "errand_rider_token";
const RIDER_KEY = "errand_rider";

function getApiBase() {
  return String(CONFIG.apiBase || "").replace(/\/+$/, "");
}

function getSite() {
  const injected = String(CONFIG.siteCode || "");
  if (injected) return injected;
  return String(wx.getStorageSync(SITE_KEY) || "");
}

function setSite(code) {
  wx.setStorageSync(SITE_KEY, String(code || "").toUpperCase());
}

function getCityId() {
  return Number(wx.getStorageSync(CITY_KEY) || 0) || 0;
}

function setCityId(id) {
  wx.setStorageSync(CITY_KEY, Number(id) || 0);
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
    })
  );
}

function getCustomer() {
  try {
    return JSON.parse(wx.getStorageSync(CUSTOMER_KEY) || "{}");
  } catch (error) {
    return {};
  }
}

function clear() {
  wx.removeStorageSync(TOKEN_KEY);
  wx.removeStorageSync(CUSTOMER_KEY);
}

function getRiderToken() {
  return wx.getStorageSync(RIDER_TOKEN_KEY) || "";
}

function setRiderLogin(result) {
  const value = result || {};
  wx.setStorageSync(RIDER_TOKEN_KEY, value.token || "");
  wx.setStorageSync(RIDER_KEY, JSON.stringify(value.rider || {}));
}

function getRider() {
  try {
    return JSON.parse(wx.getStorageSync(RIDER_KEY) || "{}");
  } catch (error) {
    return {};
  }
}

function clearRider() {
  wx.removeStorageSync(RIDER_TOKEN_KEY);
  wx.removeStorageSync(RIDER_KEY);
}

module.exports = {
  getApiBase,
  getSite,
  setSite,
  getCityId,
  setCityId,
  getToken,
  setLogin,
  getCustomer,
  clear,
  getRiderToken,
  setRiderLogin,
  getRider,
  clearRider,
  appName: CONFIG.appName || "",
  themeColor: CONFIG.themeColor || "",
  deskSiteKey: CONFIG.deskSiteKey || "",
};
