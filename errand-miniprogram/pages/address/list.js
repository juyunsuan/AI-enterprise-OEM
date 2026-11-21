const api = require("../../utils/api");
const auth = require("../../utils/auth");

const app = getApp();

Page({
  data: { type: "FROM", loading: true, error: "", rows: [] },

  onLoad(options) {
    this.setData({ type: options.type === "TO" ? "TO" : "FROM" });
  },

  onShow() {
    this.load();
  },

  load() {
    this.setData({ loading: true, error: "" });
    auth
      .ensureLogin()
      .then(() => api.addresses())
      .then((rows) => {
        const type = this.data.type;
        this.setData({
          loading: false,
          rows: (rows || []).filter((row) => row.type === type),
        });
      })
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "地址读取失败" });
      });
  },

  select(event) {
    const id = Number(event.currentTarget.dataset.id);
    const row = this.data.rows.find((item) => item.id === id);
    if (!row) return;
    app.globalData.pickedAddress = {
      type: this.data.type,
      party: {
        name: row.name,
        mobile: row.mobile,
        province: row.province,
        city: row.city,
        district: row.district,
        address: row.address,
        lng: row.lng,
        lat: row.lat,
      },
    };
    wx.navigateBack();
  },

  edit(event) {
    const id = Number(event.currentTarget.dataset.id) || 0;
    wx.navigateTo({ url: "/pages/address/edit?type=" + this.data.type + "&id=" + id });
  },

  add() {
    wx.navigateTo({ url: "/pages/address/edit?type=" + this.data.type });
  },

  remove(event) {
    const id = Number(event.currentTarget.dataset.id);
    wx.showModal({
      title: "删除地址",
      content: "确定删除这条地址吗？",
      success: (result) => {
        if (!result.confirm) return;
        api
          .removeAddress(id)
          .then(() => this.load())
          .catch((error) => wx.showToast({ title: (error && error.message) || "删除失败", icon: "none" }));
      },
    });
  },
});