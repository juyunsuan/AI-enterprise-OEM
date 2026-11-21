const request = require("./request");
const session = require("./session");

/**
 * 快递寄件小程序的接口封装。
 *
 * path 与参数名必须和 backend/src/kuaidi/kuaidi.public.ts 逐字一致；
 * 一个账号一部小程序：进店先按 AppID 拉寄件点列表，选点后所有接口都带 `site`。
 */

function siteQuery(query) {
  return Object.assign({ site: session.getSite() }, query || {});
}

function siteBody(body) {
  return Object.assign({ site: session.getSite() }, body || {});
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
  /** 当前账号下营业中的寄件点：按本小程序的 AppID 反查，无需先选点。 */
  sites() {
    return request({
      path: "/api/public/kuaidi/sites",
      query: { appId: ownAppId() },
    });
  },

  bootstrap() {
    return request({
      path: "/api/public/kuaidi/bootstrap",
      query: siteQuery(),
    });
  },

  quote(input) {
    return request({
      path: "/api/public/kuaidi/quote",
      query: siteQuery({
        companyId: input.companyId || 0,
        weightKg: input.weightKg,
        length: input.length || 0,
        width: input.width || 0,
        height: input.height || 0,
        insuredValue: input.insuredValue || 0,
        province: input.province || "",
      }),
    });
  },

  /** wx.login 的 code 换顾客令牌：首次进入即建档，无注册步骤。 */
  login(code) {
    return request({
      path: "/api/public/kuaidi/login",
      method: "POST",
      data: siteBody({ code: code }),
    });
  },

  createOrder(body) {
    return request({
      path: "/api/public/kuaidi/order/create",
      method: "POST",
      data: siteBody(body),
    });
  },

  repay(orderNo, mobile) {
    return request({
      path: "/api/public/kuaidi/order/repay",
      method: "POST",
      data: siteBody({ orderNo: orderNo, mobile: mobile || "" }),
    });
  },

  queryOrder(orderNo, mobile) {
    return request({
      path: "/api/public/kuaidi/order/query",
      query: siteQuery({ orderNo: orderNo, mobile: mobile || "" }),
    });
  },

  cancelOrder(orderNo, mobile) {
    return request({
      path: "/api/public/kuaidi/order/cancel",
      method: "POST",
      data: siteBody({ orderNo: orderNo, mobile: mobile || "" }),
    });
  },

  myOrders(query) {
    return request({
      path: "/api/public/kuaidi/orders",
      query: siteQuery(query || {}),
    });
  },

  addresses() {
    return request({
      path: "/api/public/kuaidi/address/list",
      query: siteQuery(),
    });
  },

  saveAddress(body) {
    return request({
      path: "/api/public/kuaidi/address/save",
      method: "POST",
      data: siteBody(body),
    });
  },

  removeAddress(id) {
    return request({
      path: "/api/public/kuaidi/address/remove",
      method: "POST",
      data: siteBody({ id: id }),
    });
  },
};
