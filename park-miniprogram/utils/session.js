const CONFIG = require("../config");

const TOKEN_KEY = "park_token";
const CUSTOMER_KEY = "park_customer";
const PARK_KEY = "park_code";
const STAFF_TOKEN_KEY = "park_staff_token";
const STAFF_KEY = "park_staff";

function getApiBase() {
  return String(CONFIG.apiBase || "").replace(/\/+$/, "");
}

function getParkCode() {
  const injected = String(CONFIG.parkCode || "").trim().toUpperCase();
  if (injected) return injected;
  return String(wx.getStorageSync(PARK_KEY) || "").trim().toUpperCase();
}

function setParkCode(code) {
  wx.setStorageSync(PARK_KEY, String(code || "").trim().toUpperCase());
}

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || "";
}

function setLogin(result) {
  const value = result || {};
  wx.setStorageSync(TOKEN_KEY, value.token || "");
  wx.setStorageSync(CUSTOMER_KEY, JSON.stringify(value.profile || {}));
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

function getStaffToken() {
  return wx.getStorageSync(STAFF_TOKEN_KEY) || "";
}

function setStaffLogin(result) {
  const value = result || {};
  wx.setStorageSync(STAFF_TOKEN_KEY, value.token || "");
  wx.setStorageSync(STAFF_KEY, JSON.stringify(value.staff || {}));
}

function getStaff() {
  try {
    return JSON.parse(wx.getStorageSync(STAFF_KEY) || "{}");
  } catch (error) {
    return {};
  }
}

function clearStaff() {
  wx.removeStorageSync(STAFF_TOKEN_KEY);
  wx.removeStorageSync(STAFF_KEY);
}

module.exports = {
  getApiBase,
  getParkCode,
  setParkCode,
  getToken,
  setLogin,
  getCustomer,
  clear,
  getStaffToken,
  setStaffLogin,
  getStaff,
  clearStaff,
  appName: CONFIG.appName || "",
  themeColor: CONFIG.themeColor || "",
  deskSiteKey: CONFIG.deskSiteKey || "",
};
