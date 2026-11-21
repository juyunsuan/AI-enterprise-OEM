/**
 * 数字人后端接口清单（薄封装，路径对齐 dh.public.ts）。
 *
 * 前缀与站点寻址码由 utils/request.js 统一注入，这里只声明路径/方法/参数。
 */
const request = require("./request");

module.exports = {
  // ---------- 匿名读 ----------
  config() {
    return request({ path: "/config" });
  },
  swipers() {
    return request({ path: "/swipers" });
  },
  posters() {
    return request({ path: "/posters" });
  },
  qrcode() {
    return request({ path: "/qrcode" });
  },
  articles(type) {
    return request({ path: "/articles", query: { type: type } });
  },
  article(id) {
    return request({ path: "/article", query: { id: id } });
  },
  feed(query) {
    return request({ path: "/feed", query: query });
  },
  work(id) {
    return request({ path: "/work", query: { id: id } });
  },
  shareWork(id) {
    return request({ path: "/work/share", method: "POST", data: { id: id } });
  },
  presetVoices() {
    return request({ path: "/voices" });
  },
  bgms() {
    return request({ path: "/bgms" });
  },
  packages() {
    return request({ path: "/packages" });
  },
  writeTopics(kind) {
    return request({
      path: "/write-topics",
      query: { kind: kind || "write_topic" },
    });
  },

  // ---------- 会员 ----------
  login(payload) {
    return request({ path: "/login", method: "POST", data: payload || {} });
  },
  member() {
    return request({ path: "/member" });
  },

  // ---------- 形象 / 声音 ----------
  bodies() {
    return request({ path: "/bodies" });
  },
  createBody(payload) {
    return request({ path: "/bodies/create", method: "POST", data: payload });
  },
  myVoices() {
    return request({ path: "/voices/mine" });
  },
  createVoice(payload) {
    return request({ path: "/voices/create", method: "POST", data: payload });
  },

  // ---------- 作品 ----------
  myWorks() {
    return request({ path: "/works/mine" });
  },
  createWork(payload) {
    return request({ path: "/works/create", method: "POST", data: payload });
  },
  workStatus(id) {
    return request({ path: "/work/status", query: { id: id } });
  },
  removeWork(id) {
    return request({ path: "/work/remove", method: "POST", data: { id: id } });
  },

  // ---------- AI 写作 / 反馈 ----------
  aiWrite(payload) {
    return request({ path: "/ai/write", method: "POST", data: payload });
  },
  feedback(payload) {
    return request({ path: "/feedback", method: "POST", data: payload });
  },

  // ---------- 商城 / 卡密 / 分销 ----------
  orders(query) {
    return request({ path: "/orders", query: query });
  },
  createOrder(packageId) {
    return request({
      path: "/orders/create",
      method: "POST",
      data: { packageId: packageId },
    });
  },
  redeem(code) {
    return request({ path: "/card/redeem", method: "POST", data: { code: code } });
  },
  promoterCenter() {
    return request({ path: "/promoter/center" });
  },
  promoterApply() {
    return request({ path: "/promoter/apply", method: "POST", data: {} });
  },
  commissions(query) {
    return request({ path: "/commissions", query: query });
  },
  withdraws(query) {
    return request({ path: "/withdraws", query: query });
  },
  withdrawApply(payload) {
    return request({ path: "/withdraw/apply", method: "POST", data: payload });
  },
};
