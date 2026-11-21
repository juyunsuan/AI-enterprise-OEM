var CONFIG = require("../config");

var PROFILE_KEY = "quiz_profile";
var API_BASE_KEY = "quiz_api_base";
var SITE_CODE_KEY = "quiz_site_code";
var LAST_RESULT_KEY = "quiz_last_result";
var LAST_BANK_KEY = "quiz_last_bank";

var ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function newParticipantId() {
  var out = "";
  for (var i = 0; i < 32; i += 1) {
    out += ID_CHARS.charAt(Math.floor(Math.random() * ID_CHARS.length));
  }
  return out;
}

function readJson(key, fallback) {
  try {
    var raw = wx.getStorageSync(key);
    if (!raw) return fallback;
    var value = typeof raw === "string" ? JSON.parse(raw) : raw;
    return value && typeof value === "object" ? value : fallback;
  } catch (error) {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    wx.setStorageSync(key, JSON.stringify(value));
  } catch (error) {
    /* 本地存储失败不打断答题 */
  }
}

function getApiBase() {
  var saved = String(wx.getStorageSync(API_BASE_KEY) || "").trim();
  var base = saved || String(CONFIG.apiBase || "");
  return base.replace(/\/+$/, "");
}

function setApiBase(value) {
  wx.setStorageSync(API_BASE_KEY, String(value || "").trim());
}

function getSiteCode() {
  var saved = String(wx.getStorageSync(SITE_CODE_KEY) || "").trim();
  return saved || String(CONFIG.siteCode || "").trim();
}

function setSiteCode(value) {
  wx.setStorageSync(SITE_CODE_KEY, String(value || "").trim().toUpperCase());
}

function getProfile() {
  var profile = readJson(PROFILE_KEY, {});
  if (!profile.participantId) {
    profile.participantId = newParticipantId();
    writeJson(PROFILE_KEY, profile);
  }
  return {
    participantId: profile.participantId,
    nickname: profile.nickname || "",
    company: profile.company || "",
    department: profile.department || "",
  };
}

function saveProfile(patch) {
  var profile = getProfile();
  var next = {
    participantId: profile.participantId,
    nickname: patch && patch.nickname !== undefined ? patch.nickname : profile.nickname,
    company: patch && patch.company !== undefined ? patch.company : profile.company,
    department: patch && patch.department !== undefined ? patch.department : profile.department,
  };
  writeJson(PROFILE_KEY, next);
  return next;
}

function setLastResult(value) {
  writeJson(LAST_RESULT_KEY, value || {});
}

function getLastResult() {
  return readJson(LAST_RESULT_KEY, {});
}

function setLastBank(code) {
  wx.setStorageSync(LAST_BANK_KEY, String(code || ""));
}

function getLastBank() {
  return String(wx.getStorageSync(LAST_BANK_KEY) || "");
}

module.exports = {
  getApiBase: getApiBase,
  setApiBase: setApiBase,
  getSiteCode: getSiteCode,
  setSiteCode: setSiteCode,
  getProfile: getProfile,
  saveProfile: saveProfile,
  setLastResult: setLastResult,
  getLastResult: getLastResult,
  setLastBank: setLastBank,
  getLastBank: getLastBank,
  themeColor: CONFIG.themeColor || "",
  siteName: CONFIG.siteName || "",
};