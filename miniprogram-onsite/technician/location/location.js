const api = require("../../utils/api");
const staff = require("../../utils/staff");
const format = require("../../utils/format");

Page({
  data: {
    loading: true,
    locationEnabled: false,
    address: "",
    reporting: false,
    errorText: "",
    lastReportedAt: "",
    lastPointText: "",
  },

  onLoad() {
    this.gate = staff.ensureStaff();
  },

  async onShow() {
    const gate = this.gate || staff.ensureStaff();
    this.gate = null;
    let profile = null;
    try {
      profile = await gate;
    } catch (error) {
      wx.showToast({ title: (error && error.message) || "登录失败，请稍后重试", icon: "none" });
      return;
    }
    if (!profile) return;
    const card = profile.staff || {};
    this.setData({
      loading: false,
      locationEnabled: !!card.locationEnabled,
    });
  },

  onAddressInput(event) {
    this.setData({ address: event.detail.value, errorText: "" });
  },

  /** 定位授权被拒时只能引导去设置：接口的 lng/lat 是必填的数字，没有坐标上报不了。 */
  openSetting() {
    wx.openSetting({
      success: (res) => {
        if (res.authSetting && res.authSetting["scope.userLocation"]) {
          wx.showToast({ title: "已开启定位权限，请再次上报", icon: "none" });
        }
      },
    });
  },

  async report() {
    if (this.data.reporting) return;
    if (!this.data.locationEnabled) {
      wx.showModal({
        title: "定位上报未开启",
        content: "店主还没有在店铺后台开启技师定位上报，请联系店主开启后再试。",
        showCancel: false,
      });
      return;
    }
    this.setData({ reporting: true, errorText: "" });
    wx.showLoading({ title: "获取定位", mask: true });
    try {
      const point = await this.getPoint();
      if (!point) {
        wx.hideLoading();
        this.setData({ reporting: false });
        wx.showModal({
          title: "没有取到定位",
          content: "请在微信设置里允许获取位置信息后重试。坐标是上报的必要信息，没有定位时无法上报。",
          confirmText: "去设置",
          cancelText: "知道了",
          success: (res) => {
            if (res.confirm) this.openSetting();
          },
        });
        return;
      }
      const data = await api.staffLocation({
        lng: point.lng,
        lat: point.lat,
        address: String(this.data.address || "").trim(),
      });
      wx.hideLoading();
      this.setData({
        reporting: false,
        lastReportedAt: format.dateTime(data.at),
        lastPointText: Number(data.lng).toFixed(5) + ", " + Number(data.lat).toFixed(5),
      });
      wx.showToast({ title: "位置已上报", icon: "success" });
    } catch (error) {
      wx.hideLoading();
      this.setData({
        reporting: false,
        errorText: (error && error.message) || "上报失败，请稍后重试",
      });
    }
  },

  getPoint() {
    return new Promise((resolve) => {
      wx.getLocation({
        type: "gcj02",
        success: (res) => resolve({ lng: res.longitude, lat: res.latitude }),
        fail: () => resolve(null),
      });
    });
  },
});
