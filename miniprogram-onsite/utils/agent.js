const api = require("./api");
const session = require("./session");

const BIND_PAGE = "/agent/bind/bind";

/**
 * 代理侧进入任意页面前先过这道闸：代理身份只来自「店铺码 + 手机号」绑定的令牌，
 * 与顾客令牌、技师令牌互不回退——没绑定就去绑定页，不要顺手拿顾客身份兜底。
 * 令牌在页内被 401 清掉时同样回绑定页，后端文案直接透出（停用/换号都能看懂）。
 */
function ensureAgent() {
  if (!session.getAgentToken() || !session.getAgent()) {
    wx.redirectTo({ url: BIND_PAGE });
    return Promise.resolve(null);
  }
  return api
    .agentProfile()
    .then((profile) => {
      session.setAgent(profile.identity || null);
      return profile;
    })
    .catch((error) => {
      session.clearAgentToken();
      wx.showToast({
        title: (error && error.message) || "代理身份已失效，请重新绑定",
        icon: "none",
      });
      wx.redirectTo({ url: BIND_PAGE });
      return null;
    });
}

function unbind() {
  return api.agentUnbind().catch(() => undefined).then(() => {
    session.clearAgentToken();
    wx.redirectTo({ url: BIND_PAGE });
  });
}

module.exports = { ensureAgent, unbind, BIND_PAGE };
