/**
 * 会话与站点配置的本地持久化。
 *
 * 小程序没有 Cookie，会员令牌只能自己存；token / member / 上次拉到的 /config
 * 快照放同一个 storage key，冷启动先渲染缓存再静默刷新，避免白屏。
 */
const core = require("./core");

const KEY = "digital-human:miniprogram:session";
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

  getMember() {
    return store.get("member") || null;
  },
  setMember(member) {
    store.set({ member: member || null });
  },

  getSiteConfig() {
    return store.get("siteConfig") || null;
  },
  setSiteConfig(siteConfig) {
    store.set({ siteConfig: siteConfig || null });
  },

  /** 令牌失效时只清身份，保留 member 快照供页面展示上次数据。 */
  clearToken() {
    store.clear(["token"]);
  },
};
