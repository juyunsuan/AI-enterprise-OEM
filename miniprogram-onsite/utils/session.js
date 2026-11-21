const config = require("../config");
const core = require("./core");

const KEY = "onsite:miniprogram:session";
const store = core.createSession(KEY);

/**
 * 顾客 / 技师 / 代理三类身份分三组槽位存，卸载其一不影响其余；
 * 读写口径全部走 utils/core.js 的会话工厂，这里只声明字段名。
 */
module.exports = {
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
  /** 服务器地址：本地填写值优先，其次 config.js 里填的 apiBase。 */
  getApiBase() {
    const value = store.get("apiBase") || config.apiBase || "";
    return String(value).trim().replace(/\/+$/, "");
  },
  setApiBase(value) {
    store.set({ apiBase: String(value || "").trim() });
  },
  /** 店铺码只认 config.js 里填的值：一部小程序只属于一个店铺，端上不允许改。 */
  getShopCode() {
    return String(config.shopCode || "").trim().toUpperCase();
  },
  clearToken() {
    store.clear(["token", "profile"]);
  },
  getStaffToken() {
    return store.get("staffToken") || "";
  },
  setStaffToken(token) {
    store.set({ staffToken: token || "" });
  },
  getStaff() {
    return store.get("staff") || null;
  },
  setStaff(staff) {
    store.set({ staff: staff || null });
  },
  /** 解绑只清技师态，顾客身份照常可用。 */
  clearStaffToken() {
    store.clear(["staffToken", "staff"]);
  },
  getAgentToken() {
    return store.get("agentToken") || "";
  },
  setAgentToken(token) {
    store.set({ agentToken: token || "" });
  },
  getAgent() {
    return store.get("agent") || null;
  },
  setAgent(agent) {
    store.set({ agent: agent || null });
  },
  clearAgentToken() {
    store.clear(["agentToken", "agent"]);
  },
};
