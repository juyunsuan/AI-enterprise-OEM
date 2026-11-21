const api = require("../../utils/api");
const auth = require("../../utils/auth");

/** 地址簿：结算页也从这里选地址时用 select=1 回传（走上一页的方法调用，不写全局）。 */
Page({
  data: {
    items: [],
    selectMode: false,
    loading: true,
    error: "",
  },

  onLoad(query) {
    this.setData({ selectMode: String(query.select || "") === "1" });
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    this.setData({ loading: true });
    return auth
      .ensureLogin()
      .then(() => api.addresses())
      .then((rows) => {
        this.setData({
          loading: false,
          error: "",
          items: rows || [],
        });
      })
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "地址加载失败" });
      });
  },

  pick(event) {
    if (!this.data.selectMode) return;
    const index = Number(event.currentTarget.dataset.index || 0);
    const address = this.data.items[index];
    if (!address) return;
    const pages = getCurrentPages();
    const prev = pages[pages.length - 2];
    if (prev && typeof prev.onAddressPicked === "function") {
      prev.onAddressPicked(address);
      wx.navigateBack({ fail() {} });
      return;
    }
    wx.navigateBack({ fail() {} });
  },

  edit(event) {
    const id = event.currentTarget.dataset.id;
    wx.navigateTo({ url: "/pages/address/edit?id=" + id });
  },

  create() {
    wx.navigateTo({ url: "/pages/address/edit" });
  },

  /** 后端没有「设为默认」的独立接口，用 address/save 原样提交并把 isDefault 置真。 */
  setDefault(event) {
    const index = Number(event.currentTarget.dataset.index || 0);
    const address = this.data.items[index];
    if (!address || address.isDefault) return;
    api
      .saveAddress(Object.assign({}, address, { id: address.id, isDefault: true }))
      .then(() => this.load())
      .catch((error) => auth.showError(error));
  },

  remove(event) {
    const id = Number(event.currentTarget.dataset.id);
    wx.showModal({
      title: "删除地址",
      content: "删除后不可恢复，确定吗？",
      success: (res) => {
        if (!res.confirm) return;
        api
          .removeAddress(id)
          .then(() => this.load())
          .catch((error) => auth.showError(error));
      },
    });
  },
});
