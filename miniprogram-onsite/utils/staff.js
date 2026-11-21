const api = require("./api");
const session = require("./session");

const BIND_PAGE = "/technician/bind/bind";

/**
 * 技师侧进入任意页面前先过这道闸：
 * 1. 顾客令牌（wx.login 静默换）——技师首先是这台小程序的用户；
 * 2. 技师令牌（手机号 + 工号绑定后换取）——绑定了哪家店的哪个技师。
 * 缺哪一步就跳到对应入口，页面只关心自己的数据，不各自拼登录逻辑。
 */
function ensureLogin() {
  return require("./auth").ensureLogin();
}

function ensureStaff() {
  if (!session.getStaffToken() || !session.getStaff()) {
    wx.redirectTo({ url: BIND_PAGE });
    return Promise.resolve(null);
  }
  return ensureLogin().then(() =>
    api
      .staffProfile()
      .then((profile) => {
        session.setStaff(profile.staff || null);
        return profile;
      })
      .catch((error) => {
        // 店主停用/离场时后端拒发：清掉本地技师态，回到绑定页说明原因
        session.clearStaffToken();
        wx.showToast({
          title: (error && error.message) || "技师身份已失效，请重新绑定",
          icon: "none",
        });
        wx.redirectTo({ url: BIND_PAGE });
        return null;
      }),
  );
}

function unbind() {
  return api.staffUnbind().catch(() => undefined).then(() => {
    session.clearStaffToken();
    wx.redirectTo({ url: BIND_PAGE });
  });
}

module.exports = { ensureLogin, ensureStaff, unbind, BIND_PAGE };
