const app = getApp();
const api = require("../../utils/api");
const auth = require("../../utils/auth");
const session = require("../../utils/session");

Page({
  data: {
    loading: true,
    profile: null,
    staff: null,
    bindCode: "",
    hasToken: false,
    editing: false,
    editName: "",
    editPhone: "",
  },

  onShow() {
    this.setData({
      hasToken: Boolean(session.getToken()),
      staff: session.getStaff(),
    });
    if (!session.getToken()) {
      this.setData({ loading: false, profile: null });
      return;
    }
    this.load();
  },

  load() {
    this.setData({ loading: true });
    auth
      .ensureLogin()
      .then(() => api.profile())
      .then((profile) => {
        this.setData({ loading: false, profile });
      })
      .catch((error) => {
        this.setData({ loading: false });
        wx.showToast({
          title: (error && error.message) || "读取失败",
          icon: "none",
        });
      });
  },

  onBindInput(event) {
    this.setData({ bindCode: event.detail.value });
  },

  startEdit() {
    const profile = this.data.profile || {};
    this.setData({
      editing: true,
      editName: profile.nickname || "",
      editPhone: profile.phone || "",
    });
  },

  cancelEdit() {
    this.setData({ editing: false });
  },

  onFieldInput(event) {
    const field = event.currentTarget.dataset.field;
    const patch = {};
    patch[field] = event.detail.value;
    this.setData(patch);
  },

  saveProfile() {
    const nickname = String(this.data.editName || "").trim();
    if (!nickname) {
      wx.showToast({ title: "请填写昵称", icon: "none" });
      return;
    }
    api
      .updateProfile({ nickname, phone: String(this.data.editPhone || "").trim() })
      .then(() => {
        wx.showToast({ title: "资料已更新", icon: "success" });
        this.setData({ editing: false });
        this.load();
      })
      .catch((error) =>
        wx.showToast({
          title: (error && error.message) || "保存失败",
          icon: "none",
        }),
      );
  },

  bindTenant() {
    const code = String(this.data.bindCode || "").trim();
    if (!code) {
      wx.showToast({ title: "请填写企业加入码", icon: "none" });
      return;
    }
    api
      .bindTenant(code)
      .then(() => {
        wx.showToast({ title: "已绑定企业", icon: "success" });
        this.setData({ bindCode: "" });
        this.load();
      })
      .catch((error) =>
        wx.showToast({
          title: (error && error.message) || "绑定失败",
          icon: "none",
        }),
      );
  },

  subscribe() {
    const templates = (app.bootstrap() && app.bootstrap().templates) || {};
    const ids = Object.keys(templates)
      .map((key) => templates[key])
      .filter(Boolean);
    if (!ids.length) {
      wx.showToast({ title: "园区尚未配置通知模板", icon: "none" });
      return;
    }
    wx.requestSubscribeMessage({
      tmplIds: ids,
      success: () => wx.showToast({ title: "已开启提醒", icon: "success" }),
      fail: () => wx.showToast({ title: "未开启提醒", icon: "none" }),
    });
  },

  go(event) {
    const path = event.currentTarget.dataset.path;
    if (path) wx.navigateTo({ url: path });
  },

  logout() {
    session.clear();
    session.clearStaff();
    this.setData({ profile: null, staff: null, hasToken: false });
    wx.showToast({ title: "已退出", icon: "success" });
  },
});
