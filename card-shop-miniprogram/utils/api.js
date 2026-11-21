const request = require("./request");
const session = require("./session");
const config = require("../config");

/**
 * 后端公开通道的薄封装：一个方法对应 `backend/src/card-shop/card-shop.public.ts`
 * 里的一条路由，路径与参数名不自行发明。前缀 `/api/public/card-shop` 与 `?site=`
 * 由 utils/request.js 统一带上。
 */
module.exports = {
  bootstrap() {
    return request({ path: "/bootstrap" });
  },
  categories() {
    return request({ path: "/categories" });
  },
  goods(query) {
    return request({ path: "/goods", query: query });
  },
  goodsDetail(id, visitPassword) {
    return request({
      path: "/goods/detail",
      query: { id: id, visitPassword: visitPassword || "" },
    });
  },
  quote(goodsId, quantity, code) {
    return request({
      path: "/coupon/check",
      query: { goodsId: goodsId, quantity: quantity, code: code || "" },
    });
  },
  contents(kind, page) {
    return request({
      path: "/content",
      query: { kind: kind || "ARTICLE", page: page || 1, pageSize: 20 },
    });
  },
  content(id) {
    return request({ path: "/content/detail", query: { id: id } });
  },
  login(code) {
    return request({
      path: "/login",
      method: "POST",
      data: { site: config.siteCode, code: code },
    });
  },
  orderCreate(payload) {
    return request({ path: "/order/create", method: "POST", data: payload });
  },
  repay(orderNo, contact) {
    return request({
      path: "/order/repay",
      method: "POST",
      data: { site: config.siteCode, orderNo: orderNo, contact: contact || "" },
    });
  },
  orderQuery(orderNo, contact, takeCardPassword) {
    return request({
      path: "/order/query",
      query: {
        orderNo: orderNo,
        contact: contact || "",
        takeCardPassword: takeCardPassword || "",
      },
    });
  },
  myOrders(payState, page) {
    return request({
      path: "/orders",
      query: { payState: payState || "", page: page || 1, pageSize: 10 },
    });
  },
  /** 会话辅助：当前是否存有顾客令牌。 */
  hasToken: session.getToken,
};
