const request = require("./request");
const session = require("./session");

function withShop(query) {
  return Object.assign({ shopCode: session.getShopCode() }, query || {});
}

module.exports = {
  bootstrap(query) {
    return request({ path: "/api/public/rental/bootstrap", query });
  },
  login(shopCode, code) {
    return request({
      path: "/api/public/rental/login",
      method: "POST",
      data: { shopCode: shopCode, code: code },
    });
  },

  items(query) {
    return request({ path: "/api/public/rental/items", query: withShop(query) });
  },
  itemDetail(itemId) {
    return request({
      path: "/api/public/rental/items/detail",
      query: withShop({ itemId: itemId }),
    });
  },

  createOrder(data) {
    return request({
      path: "/api/public/rental/orders",
      method: "POST",
      data: Object.assign(withShop({}), data),
    });
  },
  orders(query) {
    return request({ path: "/api/public/rental/orders", query: withShop(query) });
  },
  orderDetail(orderId) {
    return request({
      path: "/api/public/rental/orders/detail",
      query: withShop({ orderId: orderId }),
    });
  },
  cancelOrder(orderId) {
    return request({
      path: "/api/public/rental/orders/cancel",
      method: "POST",
      data: withShop({ orderId: orderId }),
    });
  },
  payParams(orderId) {
    return request({
      path: "/api/public/rental/orders/pay-params",
      method: "POST",
      data: withShop({ orderId: orderId }),
    });
  },

  staffBind(data) {
    return request({
      path: "/api/public/rental/staff/bind",
      method: "POST",
      data: Object.assign(withShop({}), data),
    });
  },
  staffWorkbench() {
    return request({ path: "/api/public/rental/staff/workbench", staff: true });
  },
  staffOrders(query) {
    return request({
      path: "/api/public/rental/staff/orders",
      query: query || {},
      staff: true,
    });
  },
  staffOrderDetail(orderId) {
    return request({
      path: "/api/public/rental/staff/orders/detail",
      query: { orderId: orderId },
      staff: true,
    });
  },
  staffAction(data) {
    return request({
      path: "/api/public/rental/staff/orders/action",
      method: "POST",
      data: data,
      staff: true,
    });
  },
  staffInspection(data) {
    return request({
      path: "/api/public/rental/staff/orders/inspection",
      method: "POST",
      data: data,
      staff: true,
    });
  },
  staffCustomers(query) {
    return request({
      path: "/api/public/rental/staff/customers",
      query: query || {},
      staff: true,
    });
  },
  staffItems(query) {
    return request({
      path: "/api/public/rental/staff/items",
      query: query || {},
      staff: true,
    });
  },

  upload(filePath, kind, staff) {
    const base = session.getApiBase();
    const token = staff ? session.getStaffToken() : session.getToken();
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: base + "/api/public/rental/upload?kind=" + (kind || "inspection"),
        filePath: filePath,
        name: "file",
        header: { Authorization: "Bearer " + token },
        success(res) {
          let body = null;
          try {
            body = JSON.parse(res.data || "{}");
          } catch (error) {
            body = null;
          }
          if (res.statusCode >= 200 && res.statusCode < 300 && body && body.code === 0) {
            resolve(body.data || {});
            return;
          }
          reject(new Error((body && body.message) || "上传失败，请重试"));
        },
        fail(error) {
          reject(new Error((error && error.errMsg) || "上传失败，请检查网络"));
        },
      });
    });
  },
};