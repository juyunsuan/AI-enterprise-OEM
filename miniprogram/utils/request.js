const session = require("./session");

function toQuery(query) {
  if (!query) return "";
  const parts = [];
  Object.keys(query).forEach((key) => {
    const value = query[key];
    if (value === undefined || value === null || value === "") return;
    parts.push(
      encodeURIComponent(key) + "=" + encodeURIComponent(String(value)),
    );
  });
  return parts.length ? "?" + parts.join("&") : "";
}

function bizError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * 站内接口统一走这里：拼 apiBase、带 Authorization 头（小程序无 Cookie）、
 * 解包 `{code,message,data}`，非 0 一律 reject；401 清会话并抛「请重新登录」。
 */
function request(options) {
  const base = session.getApiBase();
  if (!base) {
    return Promise.reject(bizError("未配置服务器地址"));
  }
  const method = String(options.method || "GET").toUpperCase();
  const header = { "content-type": "application/json" };
  const token = session.getToken();
  if (token) header.Authorization = "Bearer " + token;

  return new Promise((resolve, reject) => {
    wx.request({
      url: base + options.path + toQuery(options.query),
      method,
      data: options.data,
      header,
      timeout: options.timeout || 20000,
      success(res) {
        const body = res.data && typeof res.data === "object" ? res.data : {};
        const code = typeof body.code === "number" ? body.code : 0;
        if (res.statusCode === 401 || code === 401) {
          session.clearToken();
          reject(bizError(body.message || "登录已过期，请重新登录", 401));
          return;
        }
        if (res.statusCode >= 400) {
          reject(
            bizError(
              body.message || "请求失败（" + res.statusCode + "）",
              code || res.statusCode,
            ),
          );
          return;
        }
        if (code !== 0) {
          reject(bizError(body.message || "请求失败", code));
          return;
        }
        resolve(body.data);
      },
      fail(err) {
        const message =
          err && err.errMsg && err.errMsg.indexOf("domain") >= 0
            ? "服务器地址未在微信后台配置为合法域名"
            : (err && err.errMsg) || "网络异常，请稍后重试";
        reject(bizError(message));
      },
    });
  });
}

module.exports = request;
