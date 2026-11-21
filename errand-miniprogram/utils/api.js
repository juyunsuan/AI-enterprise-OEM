const request = require("./request");
const session = require("./session");

/**
 * 跑腿小程序接口封装。
 *
 * path 与参数名必须和 backend/src/errand/errand.public.ts 逐字一致；
 * 一部小程序一个站点：进店先按 AppID 反查站点码，之后所有接口都带 `site`。
 */

function siteQuery(query) {
  return Object.assign(
    { site: session.getSite(), cityId: session.getCityId() },
    query || {}
  );
}

function siteBody(body) {
  return Object.assign(
    { site: session.getSite(), cityId: session.getCityId() },
    body || {}
  );
}

function ownAppId() {
  try {
    const info = typeof wx.getAccountInfoSync === "function" ? wx.getAccountInfoSync() : null;
    return String((info && info.miniProgram && info.miniProgram.appId) || "");
  } catch (error) {
    return "";
  }
}

module.exports = {
  sites() {
    return request({ path: "/api/public/errand/sites", query: { appId: ownAppId() } });
  },

  bootstrap(cityId) {
    return request({
      path: "/api/public/errand/bootstrap",
      query: siteQuery(cityId ? { cityId: cityId } : {}),
    });
  },

  quote(input) {
    return request({
      path: "/api/public/errand/quote",
      method: "POST",
      data: siteBody(input || {}),
    });
  },

  login(code) {
    return request({
      path: "/api/public/errand/login",
      method: "POST",
      data: siteBody({ code: code }),
    });
  },

  createOrder(body) {
    return request({
      path: "/api/public/errand/order/create",
      method: "POST",
      data: siteBody(body || {}),
    });
  },

  repay(orderNo) {
    return request({
      path: "/api/public/errand/order/repay",
      method: "POST",
      data: siteBody({ orderNo: orderNo, mobile: "" }),
    });
  },

  payExtra(orderNo) {
    return request({
      path: "/api/public/errand/order/extra/pay",
      method: "POST",
      data: siteBody({ orderNo: orderNo }),
    });
  },

  queryOrder(orderNo, mobile) {
    return request({
      path: "/api/public/errand/order/query",
      query: siteQuery({ orderNo: orderNo, mobile: mobile || "" }),
    });
  },

  cancelOrder(orderNo, mobile, reason) {
    return request({
      path: "/api/public/errand/order/cancel",
      method: "POST",
      data: siteBody({ orderNo: orderNo, mobile: mobile || "", reason: reason || "" }),
    });
  },

  myOrders() {
    return request({ path: "/api/public/errand/order/my" });
  },

  rateOrder(orderNo, rating, comment) {
    return request({
      path: "/api/public/errand/order/rate",
      method: "POST",
      data: siteBody({ orderNo: orderNo, rating: rating, comment: comment || "" }),
    });
  },

  addresses() {
    return request({ path: "/api/public/errand/address/list" });
  },

  saveAddress(body) {
    return request({
      path: "/api/public/errand/address/save",
      method: "POST",
      data: body || {},
    });
  },

  removeAddress(id) {
    return request({
      path: "/api/public/errand/address/remove",
      method: "POST",
      data: { id: id },
    });
  },

  saveProfile(nickname, avatar) {
    return request({
      path: "/api/public/errand/profile/save",
      method: "POST",
      data: { nickname: nickname || "", avatar: avatar || "" },
    });
  },

  myCoupons() {
    return request({ path: "/api/public/errand/coupon/my" });
  },

  claimCoupon(couponId) {
    return request({
      path: "/api/public/errand/coupon/claim",
      method: "POST",
      data: siteBody({ couponId: couponId }),
    });
  },

  /** 骑手证件照上传：走顾客令牌（报名前已静默登录），服务端登记进数字资产。 */
  upload(filePath) {
    const base = session.getApiBase();
    if (!base) return Promise.reject(new Error("未配置服务器地址"));
    const token = session.getToken();
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: base + "/api/public/errand/upload",
        filePath: filePath,
        name: "file",
        header: token ? { Authorization: "Bearer " + token } : {},
        success(res) {
          let body = {};
          try {
            body = JSON.parse(res.data || "{}");
          } catch (error) {
            body = {};
          }
          if (res.statusCode >= 200 && res.statusCode < 300 && body.url) {
            resolve(body);
            return;
          }
          reject(new Error(body.message || "上传失败"));
        },
        fail() {
          reject(new Error("上传失败，请检查网络"));
        },
      });
    });
  },

  // ---------------------------------------------------------------- 骑手端

  riderRegister(body) {
    return request({
      path: "/api/public/errand/rider/register",
      method: "POST",
      data: siteBody(body || {}),
    });
  },

  riderLogin(code) {
    return request({
      path: "/api/public/errand/rider/login",
      method: "POST",
      data: siteBody({ code: code }),
    });
  },

  riderProfile() {
    return request({ path: "/api/public/errand/rider/profile", rider: true });
  },

  riderWorkbench() {
    return request({ path: "/api/public/errand/rider/workbench", rider: true });
  },

  riderOnline(online, serviceTypes) {
    return request({
      path: "/api/public/errand/rider/online",
      method: "POST",
      rider: true,
      data: { online: !!online, serviceTypes: serviceTypes || ["SEND", "BUY"] },
    });
  },

  riderLocation(lng, lat) {
    return request({
      path: "/api/public/errand/rider/location",
      method: "POST",
      rider: true,
      data: { lng: lng, lat: lat },
    });
  },

  riderAccept(orderId) {
    return request({
      path: "/api/public/errand/rider/accept",
      method: "POST",
      rider: true,
      data: { orderId: orderId },
    });
  },

  riderAction(orderId, action, note) {
    return request({
      path: "/api/public/errand/rider/action",
      method: "POST",
      rider: true,
      data: { orderId: orderId, action: action, note: note || "" },
    });
  },

  riderBankCards() {
    return request({ path: "/api/public/errand/rider/bank-cards", rider: true });
  },

  riderSaveBankCard(body) {
    return request({
      path: "/api/public/errand/rider/bank-card/save",
      method: "POST",
      rider: true,
      data: body || {},
    });
  },

  riderRemoveBankCard(id) {
    return request({
      path: "/api/public/errand/rider/bank-card/remove",
      method: "POST",
      rider: true,
      data: { id: id },
    });
  },

  riderIncomes() {
    return request({ path: "/api/public/errand/rider/incomes", rider: true });
  },

  riderWithdrawals() {
    return request({ path: "/api/public/errand/rider/withdrawals", rider: true });
  },

  riderWithdraw(amount, bankCardId, bankInfo) {
    return request({
      path: "/api/public/errand/rider/withdraw",
      method: "POST",
      rider: true,
      data: {
        amount: amount,
        bankCardId: bankCardId || 0,
        bankInfo: bankInfo || "",
      },
    });
  },
};
