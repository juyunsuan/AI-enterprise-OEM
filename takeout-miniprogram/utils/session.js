const config = require("../config");
const core = require("./core");

const KEY = "takeout:miniprogram:session";
const store = core.createSession(KEY);

module.exports = {
  storageKey: KEY,
  getToken() {
    return store.get("token") || "";
  },
  setToken(token) {
    store.set({ token: token || "" });
  },
  getCustomer() {
    const value = store.get("customer");
    return value && typeof value === "object" ? value : null;
  },
  setCustomer(customer) {
    store.set({ customer: customer || null });
  },
  getApiBase() {
    const value = store.get("apiBase") || config.apiBase || "";
    return String(value).trim().replace(/\/+$/, "");
  },
  setApiBase(value) {
    store.set({ apiBase: String(value || "").trim() });
  },
  getShopCode() {
    return String(config.shopCode || "").trim();
  },
  getAppName() {
    return String(config.appName || "").trim();
  },
  getThemeColor() {
    return String(config.themeColor || "").trim();
  },
  clearToken() {
    store.clear(["token", "customer"]);
  },
};