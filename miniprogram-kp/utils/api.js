/**
 * 知识付费后端接口清单（薄封装，方法名对齐后端契约）。
 *
 * 前缀 /api/public/knowledge-pay 与 site 寻址码由 utils/request.js 统一注入，
 * 所以这里只声明路径、方法与业务参数；新增接口也只需在本文件加一个方法。
 */
const request = require("./request");

module.exports = {
  // ---------- 匿名（站点内容与配置） ----------
  /** 站点配置：开关 toggles、主题、轮播外的文案、VIP 套餐与签到奖励等。 */
  config() {
    return request({ path: "/config" });
  },
  /** 首页轮播位（后端已按 status 过滤）。 */
  banners() {
    return request({ path: "/banners" });
  },
  categories() {
    return request({ path: "/categories" });
  },
  /** 资源分页列表：kind = new|hot|vip|all，可叠 categoryId / keyword。 */
  resources(query) {
    return request({ path: "/resources", query: query });
  },
  /** 资源详情：带令牌时后端返回 unlocked / url（未解锁 url 为空串）。 */
  resource(query) {
    return request({ path: "/resource", query: query });
  },
  notices(query) {
    return request({ path: "/notices", query: query });
  },
  notice(query) {
    return request({ path: "/notice", query: query });
  },
  /** 精选推荐/外链位，link 协议见 utils/link.js。 */
  links() {
    return request({ path: "/links" });
  },
  /** 讲师列表与讲师主页。 */
  teachers() {
    return request({ path: "/teachers" });
  },
  teacher(query) {
    return request({ path: "/teacher", query: query });
  },
  /** 「发现」页导航与自定义单页。 */
  navs() {
    return request({ path: "/navs" });
  },
  pageDetail(query) {
    return request({ path: "/page", query: query });
  },

  // ---------- 会员（需令牌） ----------
  login(payload) {
    return request({
      path: "/login",
      method: "POST",
      data: payload || {},
    });
  },
  member() {
    return request({ path: "/member" });
  },
  signIn() {
    return request({ path: "/sign-in", method: "POST", data: {} });
  },
  /** 解锁资源：free 一键获取 / points 扣积分 / vip 会员有效期内免费。 */
  unlock(resourceId) {
    return request({
      path: "/unlock",
      method: "POST",
      data: { resourceId: resourceId },
    });
  },
  favorite(resourceId) {
    return request({
      path: "/favorite",
      method: "POST",
      data: { resourceId: resourceId },
    });
  },
  favorites(query) {
    return request({ path: "/favorites", query: query });
  },
  /** 我的学习：课程级最近进度，用于「继续学习」。 */
  myLearning(query) {
    return request({ path: "/my-learning", query: query });
  },
  /** 学习进度上报：播放器节流调用（试看课时未解锁也可上报）。 */
  progress(payload) {
    return request({
      path: "/progress",
      method: "POST",
      data: payload || {},
    });
  },
  /** 课程评价：需已解锁，同一课程再次提交即更新。 */
  saveReview(payload) {
    return request({
      path: "/review",
      method: "POST",
      data: payload || {},
    });
  },
  orders(query) {
    return request({ path: "/orders", query: query });
  },
  redeemCode(code) {
    return request({
      path: "/card/redeem",
      method: "POST",
      data: { code: code },
    });
  },
  /** plan 取 1 / 6 / 12（月、半年、年），价格为积分价，由 /config 的 vipPlans 给出。 */
  buyVip(plan) {
    return request({
      path: "/vip/buy",
      method: "POST",
      data: { plan: plan },
    });
  },

  // ---------- 微信支付（站点自有商户号） ----------
  /** kind=course + resourceId，或 kind=vip + plan；返回 wx.requestPayment 参数。 */
  prepay(payload) {
    return request({
      path: "/pay/prepay",
      method: "POST",
      data: payload || {},
    });
  },
  payQuery(orderNo) {
    return request({ path: "/pay/query", query: { orderNo: orderNo } });
  },
  cashOrders(query) {
    return request({ path: "/cash-orders", query: query });
  },
};
