const config = require("../config");
const core = require("./core");

const KEY = "health:miniprogram:session";
const STAFF_KEY = "health:miniprogram:staff";
const store = core.createSession(KEY);
// 医护令牌与顾客令牌分两份存：退出顾客登录不影响医护工作台。
const staffStore = core.createSession(STAFF_KEY);

/** 槽位表给 utils/request.js：它按 options.staff 决定带哪格令牌、401 清哪一格。 */
const SLOTS = { customer: KEY, staff: STAFF_KEY };

module.exports = {
  /** utils/auth.js 落顾客令牌用同一格；utils/request.js 按槽位取令牌、清会话。 */
  storageKey: KEY,
  slots: SLOTS,
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
  /** 仅本地填写值；用于设置页判断是否覆盖了出包地址。 */
  getApiBaseOverride() {
    return String(store.get("apiBase") || "").trim();
  },
  setApiBase(value) {
    store.set({ apiBase: String(value || "").trim() });
  },
  /** 店铺码只认 config.js 里填的值：一部小程序只属于一家店，端上不允许改。 */
  getShopCode() {
    return String(config.shopCode || "").trim().toUpperCase();
  },
  /** 最近选择的就诊人，跨页复用（建档/下单/指标）。 */
  getPatientId() {
    return Number(store.get("patientId")) || 0;
  },
  setPatientId(patientId) {
    store.set({ patientId: Number(patientId) || 0 });
  },
  clearToken() {
    store.clear(["token", "profile", "patientId"]);
  },

  getStaffToken() {
    return staffStore.get("token") || "";
  },
  setStaffToken(token, practitioner) {
    staffStore.set({ token: token || "", practitioner: practitioner || null });
  },
  getStaffProfile() {
    return staffStore.get("practitioner") || null;
  },
  clearStaffToken() {
    staffStore.clear(["token", "practitioner"]);
  },
};
