/**
 * 顾客态本地持久化：令牌、bootstrap 快照、下单时填的联系方式。
 *
 * 小程序没有 Cookie；令牌要自己存。联系方式按订单号记住，
 * 「我的订单 → 查看卡密」时查单接口需要它，避免再让顾客手输一遍。
 * 本端整体保持 ES5 回调风格（与 utils/auth.js 一致），只把读写口径交给 utils/core.js。
 */
var core = require("./core");

var KEY = "card-shop:miniprogram:session";
var CONTACT_KEY = "card-shop:miniprogram:contacts";
var store = core.createSession(KEY);
var contactStore = core.createSession(CONTACT_KEY);

module.exports = {
  /** utils/request.js 与 utils/auth.js 共用同一个槽位。 */
  storageKey: KEY,
  getToken: function () {
    return store.get("token") || "";
  },
  setToken: function (token) {
    store.set({ token: token || "" });
  },
  /** 令牌失效只清身份：bootstrap / customer 快照留给页面显示上次数据。 */
  clearToken: function () {
    store.clear(["token"]);
  },

  getBootstrap: function () {
    return store.get("bootstrap") || null;
  },
  setBootstrap: function (data) {
    store.set({ bootstrap: data || null });
  },

  getCustomer: function () {
    return store.get("customer") || null;
  },
  setCustomer: function (customer) {
    store.set({ customer: customer || null });
  },

  /** 按订单号记住下单联系方式（查单/取卡都要它）。 */
  setContact: function (orderNo, contact) {
    if (!orderNo || !contact) return;
    var map = Object.assign({}, contactStore.all());
    map[orderNo] = contact;
    contactStore.set(map);
  },
  getContact: function (orderNo) {
    return contactStore.get(orderNo) || "";
  },
};
