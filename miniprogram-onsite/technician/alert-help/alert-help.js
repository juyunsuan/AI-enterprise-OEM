const api = require("../../utils/api");
const staff = require("../../utils/staff");
const format = require("../../utils/format");

const ALERT_STATUS_LABELS = {
  PENDING: "待处理",
  PROCESSING: "处理中",
  RESOLVED: "已处理",
  MISFIRE: "误报",
};

const ACTIVE_STATUSES = ["PAID", "ACCEPTED", "EN_ROUTE", "ON_SITE", "SERVING"];

Page({
  data: {
    loading: true,
    alertEnabled: false,
    shopPhone: "",
    orderOptions: ["不关联订单"],
    orderPickIndex: 0,
    orderId: 0,
    remark: "",
    sending: false,
    errorText: "",
    reportedAt: "",
    statusText: "",
    duplicated: false,
  },

  onLoad(query) {
    this.presetOrderId = Number((query && query.orderId) || 0);
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
    this.setData({
      loading: false,
      alertEnabled: profile.alertEnabled !== false,
    });
    this.loadShopPhone();
    await this.loadOrders();
  },

  /** 店主电话取 bootstrap 下发的 servicePhone：没配就如实显示没配，不拿别的号替代。 */
  loadShopPhone() {
    const app = getApp();
    const boot = app.bootstrap ? app.bootstrap() : null;
    if (boot && boot.servicePhone) {
      this.setData({ shopPhone: boot.servicePhone });
      return;
    }
    if (app.ensureReady) {
      app.ensureReady().then((data) => {
        if (data && data.servicePhone) this.setData({ shopPhone: data.servicePhone });
      });
    }
  },

  async loadOrders() {
    try {
      const result = await api.staffOrders({ page: 1, pageSize: 50 });
      const rows = (result && result.list) || [];
      const options = ["不关联订单"];
      const ids = [0];
      for (let i = 0; i < rows.length; i += 1) {
        if (ACTIVE_STATUSES.indexOf(rows[i].status) < 0) continue;
        const titles = rows[i].serviceTitles || [];
        options.push(rows[i].orderNo + " · " + (titles.length ? titles.join("、") : "服务明细"));
        ids.push(rows[i].id);
      }
      this.orderIds = ids;
      let index = 0;
      if (this.presetOrderId) {
        for (let i = 0; i < ids.length; i += 1) {
          if (ids[i] === this.presetOrderId) index = i;
        }
        this.presetOrderId = 0;
      }
      this.setData({ orderOptions: options, orderPickIndex: index, orderId: ids[index] || 0 });
    } catch (error) {
      this.orderIds = [0];
      this.setData({ orderOptions: ["不关联订单"], orderPickIndex: 0, orderId: 0 });
    }
  },

  onOrderChange(event) {
    const index = Number(event.detail.value) || 0;
    const ids = this.orderIds || [0];
    this.setData({ orderPickIndex: index, orderId: ids[index] || 0 });
  },

  onRemarkInput(event) {
    this.setData({ remark: event.detail.value, errorText: "" });
  },

  getPoint() {
    return new Promise((resolve) => {
      wx.getLocation({
        type: "gcj02",
        success: (res) => resolve({ lng: res.longitude, lat: res.latitude }),
        // 取不到定位也允许上报：schema 里 lng/lat 有默认值，店主仍能收到求救与联系方式
        fail: () => resolve(null),
      });
    });
  },

  send() {
    if (this.data.sending) return;
    if (!this.data.alertEnabled) {
      wx.showModal({
        title: "无法提交求救",
        content: "店主还没有在「安全管理」里开启一键报警。紧急情况请直接拨打店主电话或 110。",
        showCancel: false,
      });
      return;
    }
    wx.showModal({
      title: "确认求救",
      content: "将把你的当前定位与联系方式立即上报给店主与平台。仅真实紧急情况使用，误报会打扰店主。",
      confirmText: "立即上报",
      confirmColor: "#c62828",
      success: (res) => {
        if (res.confirm) this.submit();
      },
    });
  },

  async submit() {
    if (this.data.sending) return;
    this.setData({ sending: true, errorText: "" });
    wx.showLoading({ title: "上报中", mask: true });
    try {
      const point = await this.getPoint();
      const data = await api.staffAlert({
        orderId: this.data.orderId || 0,
        lng: point ? point.lng : 0,
        lat: point ? point.lat : 0,
        address: "",
        remark: String(this.data.remark || "").trim(),
      });
      wx.hideLoading();
      this.setData({
        sending: false,
        reportedAt: format.dateTime(new Date()),
        duplicated: !!(data && data.duplicated),
        statusText: ALERT_STATUS_LABELS[data && data.status] || (data && data.status) || "待处理",
      });
      wx.showToast({ title: "已上报", icon: "success" });
    } catch (error) {
      wx.hideLoading();
      this.setData({
        sending: false,
        errorText: (error && error.message) || "上报失败，请直接拨打店主电话",
      });
    }
  },

  callShop() {
    if (!this.data.shopPhone) {
      wx.showModal({
        title: "没有店主电话",
        content: "店铺配置里没有下发客服电话，请联系店主在店铺后台补充。",
        showCancel: false,
      });
      return;
    }
    wx.makePhoneCall({ phoneNumber: this.data.shopPhone });
  },

  callPolice() {
    wx.showModal({
      title: "拨打 110",
      content: "报警电话需要你自行拨打，本页不会代拨，也不会记录通话。",
      confirmText: "去拨打",
      success: (res) => {
        if (res.confirm) wx.makePhoneCall({ phoneNumber: "110" });
      },
    });
  },
});
