const request = require("./request");
const session = require("./session");

/**
 * 买家通道薄封装：一个方法对应 backend/src/marketplace/mp.buyer.routes.ts 的一条路由，
 * 路径、参数名与请求体形状都以该文件为准（`/api/public/market/**`）。
 * 浏览接口每次都显式带 marketCode：令牌按市场签发，换市场后浏览也不能串。
 */
function code() {
  return session.getMarketCode();
}

module.exports = {
  // ---------- 公开浏览 ----------
  bootstrap() {
    return request({ path: "/bootstrap", query: { marketCode: code() } });
  },
  products(query) {
    return request({
      path: "/product/list",
      query: Object.assign({ marketCode: code() }, query || {}),
    });
  },
  product(id) {
    return request({ path: "/product/detail", query: { marketCode: code(), id: id } });
  },
  /** 店铺首页装修：未发布过返回 null，端上回落默认店铺页。 */
  shopDiy(shopId) {
    return request({
      path: "/diy/shop",
      query: { marketCode: code(), shopId: shopId },
    });
  },

  // ---------- 优惠券 / 关注 ----------
  coupons(shopId) {
    return request({
      path: "/coupon/list",
      query: { marketCode: code(), shopId: shopId || 0 },
    });
  },
  claimCoupon(couponId) {
    return request({
      path: "/coupon/claim",
      method: "POST",
      data: { couponId: couponId },
    });
  },
  tickets(status) {
    return request({
      path: "/coupon/tickets",
      query: { status: status || "" },
    });
  },
  follows() {
    return request({ path: "/follow/list" });
  },
  follow(shopId) {
    return request({ path: "/follow", method: "POST", data: { shopId: shopId } });
  },
  unfollow(shopId) {
    return request({
      path: "/follow/cancel",
      method: "POST",
      data: { shopId: shopId },
    });
  },

  // ---------- 顾客会话 ----------
  login(payload) {
    return request({
      path: "/login",
      method: "POST",
      data: Object.assign({ marketCode: code() }, payload),
    });
  },
  profile() {
    return request({ path: "/profile" });
  },

  // ---------- 地址簿 ----------
  addresses() {
    return request({ path: "/address/list" });
  },
  saveAddress(payload) {
    return request({ path: "/address/save", method: "POST", data: payload });
  },
  removeAddress(id) {
    return request({ path: "/address/remove", method: "POST", data: { id: id } });
  },

  // ---------- 购物车 ----------
  cart() {
    return request({ path: "/cart/list" });
  },
  addCart(productId, skuId, quantity) {
    return request({
      path: "/cart/add",
      method: "POST",
      data: { productId: productId, skuId: skuId || 0, quantity: quantity || 1 },
    });
  },
  updateCart(id, quantity) {
    return request({
      path: "/cart/quantity",
      method: "POST",
      data: { id: id, quantity: quantity },
    });
  },
  selectCart(id, selected) {
    return request({
      path: "/cart/select",
      method: "POST",
      data: { id: id || 0, selected: selected !== false },
    });
  },
  removeCart(ids) {
    return request({ path: "/cart/remove", method: "POST", data: { ids: ids } });
  },

  // ---------- 结算与订单 ----------
  settle(cartIds) {
    return request({ path: "/order/settle", method: "POST", data: { cartIds: cartIds } });
  },
  createOrder(payload) {
    return request({ path: "/order/create", method: "POST", data: payload });
  },
  repay(id) {
    return request({ path: "/order/repay", method: "POST", data: { id: id } });
  },
  orders(status, page, pageSize) {
    return request({
      path: "/order/list",
      query: { status: status || "", page: page || 1, pageSize: pageSize || 10 },
    });
  },
  order(id) {
    return request({ path: "/order/detail", query: { id: id } });
  },
  cancelOrder(id) {
    return request({ path: "/order/cancel", method: "POST", data: { id: id } });
  },
  confirmOrder(id) {
    return request({ path: "/order/confirm", method: "POST", data: { id: id } });
  },

  // ---------- 售后 ----------
  afterSales(status, page, pageSize) {
    return request({
      path: "/aftersale/list",
      query: { status: status || "", page: page || 1, pageSize: pageSize || 10 },
    });
  },
  afterSale(id) {
    return request({ path: "/aftersale/detail", query: { id: id } });
  },
  applyAfterSale(payload) {
    return request({ path: "/aftersale/apply", method: "POST", data: payload });
  },
  cancelAfterSale(id) {
    return request({ path: "/aftersale/cancel", method: "POST", data: { id: id } });
  },
  returnAfterSale(payload) {
    return request({ path: "/aftersale/return", method: "POST", data: payload });
  },
};
