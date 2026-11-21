const request = require("./request");

/**
 * 接口薄封装：全部走 /api/public/takeout。
 * 门店、菜单、顾客、购物车、地址、优惠券、积分、订单都属于独立外卖数据域，
 * 端上不直接访问商城接口；服务端复用登录/支付/SCRM/算价等公共服务。
 */
module.exports = {
  // ---------- 外卖专属 ----------
  bootstrap() {
    return request({ path: "/bootstrap" });
  },
  menu() {
    return request({ path: "/menu" });
  },
  previewOrder(payload) {
    return request({ path: "/order/preview", method: "POST", data: payload });
  },
  createOrder(payload) {
    return request({ path: "/order/create", method: "POST", data: payload });
  },
  orders(status, page, pageSize) {
    return request({
      path: "/orders",
      query: { status: status || "ALL", page: page || 1, pageSize: pageSize || 10 },
    });
  },
  order(id) {
    return request({ path: "/order", query: { id: id } });
  },
  cancelOrder(id) {
    return request({ path: "/order/cancel", method: "POST", data: { id: id } });
  },
  receiveOrder(id) {
    return request({ path: "/order/receive", method: "POST", data: { id: id } });
  },
  payParams(id) {
    return request({ path: "/order/pay-params", query: { id: id } });
  },

  // ---------- 顾客身份与门店内数据 ----------
  login(payload) {
    return request({ path: "/login", method: "POST", data: payload });
  },
  profile() {
    return request({ path: "/profile" });
  },
  points() {
    return request({ path: "/points" });
  },
  addresses() {
    return request({ path: "/addresses" });
  },
  saveAddress(payload) {
    return request({ path: "/address/save", method: "POST", data: payload });
  },
  removeAddress(id) {
    return request({ path: "/address/remove", method: "POST", data: { id: id } });
  },
  cart() {
    return request({ path: "/cart" });
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
      path: "/cart/update",
      method: "POST",
      data: { id: id, quantity: quantity },
    });
  },
  removeCart(ids) {
    return request({ path: "/cart/remove", method: "POST", data: { ids: ids || [] } });
  },
  myCoupons() {
    return request({ path: "/coupons" });
  },
  receiveCoupon(couponId) {
    return request({
      path: "/coupon/receive",
      method: "POST",
      data: { couponId: couponId },
    });
  },
  shopCoupons() {
    return request({ path: "/coupon/shop" });
  },
};