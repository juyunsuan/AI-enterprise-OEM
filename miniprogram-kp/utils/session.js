/**
 * 会话与站点配置的本地持久化。
 *
 * 小程序没有 Cookie，会员令牌只能自己存；这里把 token / member / 上次成功拉到的
 * /config 快照放进同一个 storage key，冷启动时可先渲染缓存再静默刷新，避免白屏。
 */
const core = require("./core");

const KEY = "knowledge-pay:miniprogram:session";
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

  /** 上一次成功拿到的站点配置，用于弱网/后台改配置前的兜底渲染。 */
  getSiteConfig() {
    return store.get("siteConfig") || null;
  },
  setSiteConfig(siteConfig) {
    store.set({ siteConfig: siteConfig || null });
  },

  /** 令牌失效时只清身份，保留 member 快照，页面还能显示上一次的数据。 */
  clearToken() {
    store.clear(["token"]);
  },
};
