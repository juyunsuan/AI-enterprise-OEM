const config = require("../config");
const core = require("./core");

const KEY = "brand:miniprogram:session";
const store = core.createSession(KEY);

module.exports = {
  /** utils/request.js 与 utils/auth.js 共用同一个槽位。 */
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
  /**
   * 接口基址：本地填写值优先（真机调试临时切环境用），其次 config.js 里填的 apiBase。
   * 源码里不存在任何写死的站点，config.js 是唯一的基址来源。
   */
  getApiBase() {
    const value = store.get("apiBase") || config.apiBase || "";
    return String(value).trim().replace(/\/+$/, "");
  },
  setApiBase(value) {
    store.set({ apiBase: String(value || "").trim() });
  },
  /** 店铺码只认 config.js 里填的值：一部小程序只属于一个店铺，端上不允许改。 */
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
