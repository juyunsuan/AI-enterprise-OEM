const request = require("./request");
const session = require("./session");

/**
 * 后端契约的薄封装：一个方法对应 `backend/src/brand-mall/brand.public.ts` 里的一条路由，
 * 路径、参数名、请求体形状都不自行发明（该文件是 C 端接口的唯一真源）。
 * 前缀 `/api/public/brand-mall` 与 `?shopCode=` 都由 utils/request.js 统一带上。
 */
module.exports = {
  // ---------- 匿名可读 ----------
  bootstrap() {
    return request({ path: "/bootstrap" });
  },
  diyPage(id) {
    return request({ path: "/diy/page", query: { id: id } });
  },
  categories() {
    return request({ path: "/categories" });
  },
  products(query) {
    return request({ path: "/products", query: query });
  },
  product(id) {
    return request({ path: "/product", query: { id: id } });
  },
  reviews(productId, page) {
    return request({
      path: "/reviews",
      query: { productId: productId, page: page || 1, pageSize: 20 },
    });
  },

  // ---------- 顾客登录态 ----------
  login(payload) {
    return request({ path: "/login", method: "POST", data: payload });
  },
  profile() {
    return request({ path: "/profile" });
  },
  points(page) {
    return request({ path: "/points", query: { page: page || 1 } });
  },

  // ---------- 地址簿 ----------
  addresses() {
    return request({ path: "/addresses" });
  },
  saveAddress(payload) {
    return request({ path: "/address/save", method: "POST", data: payload });
  },
  removeAddress(id) {
    return request({ path: "/address/remove", method: "POST", data: { id: id } });
  },

  // ---------- 购物车 ----------
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
  selectCart(ids, selected) {
    return request({
      path: "/cart/select",
      method: "POST",
      data: { ids: ids || [], selected: selected !== false },
    });
  },
  removeCart(ids) {
    return request({ path: "/cart/remove", method: "POST", data: { ids: ids } });
  },

  // ---------- 优惠券 ----------
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

  // ---------- 下单与订单 ----------
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

  // ---------- 售后 ----------
  createRefund(payload) {
    return request({ path: "/refund/create", method: "POST", data: payload });
  },
  refunds() {
    return request({ path: "/refunds" });
  },

  /** 售后凭证图片：上传到本店公开通道，返回可直接提交的 URL。 */
  upload(filePath) {
    return new Promise((resolve, reject) => {
      const base = session.getApiBase();
      if (!base) {
        reject(new Error("未配置服务器地址，请先在 config.js 填写 apiBase"));
        return;
      }
      wx.uploadFile({
        url: base + "/api/public/brand-mall/upload?shopCode=" + encodeURIComponent(session.getShopCode()),
        filePath: filePath,
        name: "file",
        header: { Authorization: "Bearer " + session.getToken() },
        success(res) {
          let data = {};
          try {
            data = JSON.parse(res.data || "{}");
          } catch (error) {
            data = {};
          }
          if (res.statusCode >= 400 || (typeof data.code === "number" && data.code !== 0)) {
            reject(new Error(data.message || "图片上传失败"));
            return;
          }
          resolve(data.data || data);
        },
        fail(err) {
          reject(new Error((err && err.errMsg) || "图片上传失败"));
        },
      });
    });
  },
};
