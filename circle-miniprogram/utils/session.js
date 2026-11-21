var CONFIG = require("../config");

var TOKEN_KEY = "circle_token";
var CUSTOMER_KEY = "circle_customer";
var CODE_KEY = "circle_community_code";

function getApiBase() {
  return String(CONFIG.apiBase || "").replace(/\/+$/, "");
}

function getCommunityCode() {
  return String(CONFIG.communityCode || wx.getStorageSync(CODE_KEY) || "").toUpperCase();
}

function setCommunityCode(code) {
  wx.setStorageSync(CODE_KEY, String(code || "").toUpperCase());
}

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || "";
}

function setLogin(result) {
  var value = result || {};
  wx.setStorageSync(TOKEN_KEY, value.token || "");
  wx.setStorageSync(
    CUSTOMER_KEY,
    JSON.stringify({
      id: (value.user && value.user.id) || 0,
      nickname: (value.user && value.user.nickname) || "",
      avatar: (value.user && value.user.avatar) || ""
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

module.exports = {
  getApiBase: getApiBase,
  getCommunityCode: getCommunityCode,
  setCommunityCode: setCommunityCode,
  getToken: getToken,
  setLogin: setLogin,
  getCustomer: getCustomer,
  clear: clear,
  appName: CONFIG.appName || "",
  themeColor: CONFIG.themeColor || "",
  deskSiteKey: CONFIG.deskSiteKey || ""
};