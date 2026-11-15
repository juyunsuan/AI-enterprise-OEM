const api = require("../../utils/api");
const session = require("../../utils/session");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

const IDENTITY_LABELS = {
  ENTERPRISE_USER: "企业用户",
  SERVICE_PROVIDER: "服务商",
  PROVIDER_STAFF: "职员 / 代理人",
  PLATFORM_ADMIN: "平台管理员",
};

function identityLabel(key) {
  return IDENTITY_LABELS[key] || key || "身份确认中";
}

Page({
  data: {
    loggedIn: false,
    me: {},
    identities: [],
    currentIdentityLabel: "",
    status: { bound: false, openIdMasked: "", boundAtText: "" },
    apiBase: "",
  },

  onShow() {
    const loggedIn = getApp().hasToken();
    this.setData({ loggedIn: loggedIn, apiBase: session.getApiBase() });
    if (!loggedIn) return;
    this.load();
  },

  load() {
    api
      .me()
      .then((me) => {
        const profile = me || {};
        const current = profile.currentIdentity || "";
        this.setData({
          me: profile,
          currentIdentityLabel: identityLabel(current),
          identities: (profile.identities || []).map((key) => ({
            key: key,
            label: identityLabel(key),
            on: key === current,
          })),
        });
      })
      .catch((error) => auth.showError(error));

    api
      .miniStatus()
      .then((status) =>
        this.setData({
          status: Object.assign({}, status, {
            boundAtText: status.boundAt ? format.dateTime(status.boundAt) : "",
          }),
        }),
      )
      .catch(() => {});
  },

  onSwitchIdentity(event) {
    const key = event.currentTarget.dataset.key;
    if (key === (this.data.me && this.data.me.currentIdentity)) return;
    wx.showLoading({ title: "切换中", mask: true });
    api
      .switchIdentity(key)
      .then(() => {
        wx.hideLoading();
        this.load();
      })
      .catch((error) => {
        wx.hideLoading();
        auth.showError(error);
      });
  },

  onBind() {
    wx.login({
      success: (res) => {
        if (!res || !res.code) {
          wx.showToast({ title: "微信登录失败", icon: "none" });
          return;
        }
        api
          .bindMiniProgram(res.code)
          .then((status) => {
            wx.showToast({ title: "绑定成功", icon: "success" });
            this.setData({
              status: Object.assign({}, status, {
                boundAtText: status.boundAt
                  ? format.dateTime(status.boundAt)
                  : "",
              }),
            });
          })
          .catch((error) => auth.showError(error));
      },
      fail() {
        wx.showToast({ title: "微信登录失败", icon: "none" });
      },
    });
  },

  onApiBase(event) {
    this.setData({ apiBase: event.detail.value });
  },

  onSaveApiBase() {
    const value = String(this.data.apiBase || "").trim();
    if (!value) {
      wx.showToast({ title: "请填写服务器地址", icon: "none" });
      return;
    }
    session.setApiBase(value);
    wx.showToast({ title: "已保存", icon: "success" });
  },

  onLogout() {
    wx.showModal({
      title: "退出登录",
      content: "退出后需重新登录才能查看待办。",
      success: (res) => {
        if (!res.confirm) return;
        session.clearToken();
        this.setData({ loggedIn: false, me: {}, identities: [], status: {} });
        wx.showToast({ title: "已退出", icon: "success" });
      },
    });
  },

  goLogin() {
    wx.navigateTo({ url: "/pages/login/login" });
  },
});
