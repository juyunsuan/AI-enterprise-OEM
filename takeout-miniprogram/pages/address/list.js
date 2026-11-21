const api = require("../../utils/api");
const auth = require("../../utils/auth");

function decorate(item) {
  return Object.assign({}, item, {
    regionText: [item.province, item.city, item.district].filter(Boolean).join(" "),
  });
}

Page({
  data: {
    addresses: [],
    loading: true,
    error: "",
    selectMode: false,
  },

  onLoad(query) {
    this.setData({ selectMode: String(query.select || "") === "1" });
  },

  onShow() {
    this.load();
  },

  load() {
    this.setData({ loading: true, error: "" });
    return auth
      .ensureLogin()
      .then(() => api.addresses())
      .then((rows) => {
        this.setData({
          addresses: (rows || []).map(decorate),
          loading: false,
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "地址加载失败",
        });
      });
  },

  choose(event) {
    if (!this.data.selectMode) {
      this.edit(event);
      return;
    }
    const id = Number(event.currentTarget.dataset.id);
    const address = this.data.addresses.filter((item) => item.id === id)[0];
    if (!address) return;
    const channel = this.getOpenerEventChannel();
    if (channel && channel.emit) channel.emit("select", address);
    wx.navigateBack();
  },

  edit(event) {
    const id = Number(event.currentTarget.dataset.id);
    wx.navigateTo({ url: "/pages/address/edit?id=" + id });
  },

  add() {
    wx.navigateTo({ url: "/pages/address/edit" });
  },

  setDefault(event) {
    const id = Number(event.currentTarget.dataset.id);
    const address = this.data.addresses.filter((item) => item.id === id)[0];
    if (!address || address.isDefault) return;
    api
      .saveAddress({
        id: address.id,
        realName: address.realName,
        phone: address.phone,
        province: address.province,
        city: address.city,
        district: address.district,
        detail: address.detail,
        postalCode: address.postalCode || "",
        isDefault: true,
        tag: address.tag || "",
      })
      .then(() => this.load())
      .catch((error) => auth.showError(error));
  },

  remove(event) {
    const id = Number(event.currentTarget.dataset.id);
    wx.showModal({
      title: "删除地址",
      content: "删除后不可恢复，确定删除吗？",
      success: (result) => {
        if (!result.confirm) return;
        api
          .removeAddress(id)
          .then(() => this.load())
          .catch((error) => auth.showError(error));
      },
    });
  },
});