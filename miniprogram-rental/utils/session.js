const config = require("../config");
const core = require("./core");

const KEY = "rental:miniprogram:session";
const store = core.createSession(KEY);

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
  getApiBase() {
    const value = store.get("apiBase") || config.apiBase || "";
    return String(value).trim().replace(/\/+$/, "");
  },
  setApiBase(value) {
    store.set({ apiBase: String(value || "").trim() });
  },
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
  clearStaffToken() {
    store.clear(["staffToken", "staff"]);
  },
};