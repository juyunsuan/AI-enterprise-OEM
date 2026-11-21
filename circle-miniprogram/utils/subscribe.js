/**
 * 订阅消息授权：模板 ID 由社区管理员在小程序凭据里配置，未配置时静默跳过。
 * 必须在用户点击事件里调用（微信要求手势触发）；失败不阻断业务。
 */
function templates() {
  var app = getApp();
  var bootstrap = (app && app.globalData && app.globalData.bootstrap) || {};
  return bootstrap.subscribeTemplates || {};
}

function request(keys) {
  var map = templates();
  var ids = (keys || [])
    .map(function (key) {
      return map[key] || "";
    })
    .filter(Boolean);
  if (!ids.length || typeof wx.requestSubscribeMessage !== "function") {
    return Promise.resolve({});
  }
  return new Promise(function (resolve) {
    wx.requestSubscribeMessage({
      tmplIds: ids,
      success: resolve,
      fail: function () {
        resolve({});
      }
    });
  });
}

module.exports = { request: request, templates: templates };