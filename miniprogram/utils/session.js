const { apiBase } = require("../config");
const core = require("./core");

const KEY = "aiworkin:miniprogram:session";
const store = core.createSession(KEY);

module.exports = {
  /** utils/request.js 用同一个槽位取令牌、清会话，避免两处各写一遍 key。 */
  storageKey: KEY,
  getToken() {
    return store.get("token") || "";
  },
  setToken(token) {
    store.set({ token: token || "" });
  },
  getProfile() {
    return store.get("profile") || null;
  },
  setProfile(profile) {
    store.set({ profile: profile || null });
  },
  /** 服务器地址：本地保存值优先，其次打包时注入的 config.apiBase。 */
  getApiBase() {
    const value = store.get("apiBase") || apiBase || "";
    return String(value).trim().replace(/\/+$/, "");
  },
  setApiBase(value) {
    store.set({ apiBase: String(value || "").trim() });
  },
  clearToken() {
    store.clear(["token", "profile"]);
  },
};
