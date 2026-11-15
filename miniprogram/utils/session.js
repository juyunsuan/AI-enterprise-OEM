const { apiBase } = require("../config");

const KEY = "aiworkin:miniprogram:session";

function state() {
  try {
    const raw = wx.getStorageSync(KEY);
    return raw && typeof raw === "object" ? raw : {};
  } catch (e) {
    return {};
  }
}

function save(patch) {
  const next = Object.assign({}, state(), patch);
  try {
    wx.setStorageSync(KEY, next);
  } catch (e) {
    // 存储写入失败时不影响本次会话（token 仍在内存态下一次请求前会被重取）。
  }
  return next;
}

module.exports = {
  getToken() {
    return state().token || "";
  },
  setToken(token) {
    save({ token: token || "" });
  },
  getProfile() {
    return state().profile || null;
  },
  setProfile(profile) {
    save({ profile: profile || null });
  },
  /** 服务器地址：本地保存值优先，其次打包时注入的 config.apiBase。 */
  getApiBase() {
    const value = state().apiBase || apiBase || "";
    return String(value).trim().replace(/\/+$/, "");
  },
  setApiBase(value) {
    save({ apiBase: String(value || "").trim() });
  },
  clearToken() {
    const next = state();
    delete next.token;
    delete next.profile;
    try {
      wx.setStorageSync(KEY, next);
    } catch (e) {
      /* 忽略 */
    }
  },
};
