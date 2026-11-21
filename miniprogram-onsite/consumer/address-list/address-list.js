const api = require("../../utils/api");
const auth = require("../../utils/auth");

/** 省市区与详细地址拼成一行；重复的层级（如「北京市 北京市」）只留一次。 */
function joinAddress(row) {
  const parts = [row.province, row.city, row.district, row.detail];
  const seen = {};
  const list = [];
  parts.forEach((part) => {
    const text = String(part || "").trim();
    if (!text || seen[text]) return;
    seen[text] = true;
    list.push(text);
  });
  return list.join("");
}

function toItem(row) {
  return {
    id: row.id,
    contactName: row.contactName || "",
    phone: row.phone || "",
    province: row.province || "",
    city: row.city || "",
    district: row.district || "",
    detail: row.detail || "",
    lng: Number(row.lng) || 0,
    lat: Number(row.lat) || 0,
    cityId: Number(row.cityId) || 0,
    tag: row.tag || "",
    isDefault: row.isDefault === true,
    addressText: joinAddress(row) || "未填写详细地址",
  };
}

Page({
  data: {
    loading: true,
    error: "",
    notReady: false,
    readyReason: "",
    selectMode: false,
    list: [],
    acting: 0,
  },

  onLoad(options) {
    this.setData({ selectMode: (options && options.select) === "1" });
  },

  onShow() {
    this.start();
  },

  start() {
    const app = getApp();
    app
      .ensureReady()
      .then((shop) => {
        if (!shop || !shop.shopCode) {
          this.setData({
            loading: false,
            notReady: true,
            readyReason: app.globalData.bootstrapError || "店铺尚未开通，请联系店铺方",
          });
          return null;
        }
        return auth.ensureLogin().then(() => this.load());
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "登录失败，请重新进入小程序",
        });
      });
  },

  load() {
    this.setData({ loading: true, error: "" });
    return api
      .addresses()
      .then((data) => {
        const list = (data && data.list) || [];
        this.setData({ loading: false, list: list.map(toItem) });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "地址加载失败",
        });
      });
  },

  /** 卡片点击：选择模式下回传地址，否则进编辑页。 */
  cardTap(event) {
    if (this.data.selectMode) this.choose(event);
    else this.openEdit(event);
  },

  /** 选择模式：先写 globalData，再尝试 eventChannel，两条路上一页都能读到。 */
  choose(event) {
    const index = Number(event.currentTarget.dataset.index);
    const item = this.data.list[index];
    if (!item) return;
    const app = getApp();
    app.globalData.selectedAddress = item;
    try {
      const channel = this.getOpenerEventChannel && this.getOpenerEventChannel();
      if (channel && typeof channel.emit === "function") {
        channel.emit("chooseAddress", { address: item });
      }
    } catch (error) {
      // 上一页没开 eventChannel 时走 globalData，不打断选择
    }
    wx.navigateBack({
      delta: 1,
      fail() {
        wx.switchTab({ url: "/pages/me/me" });
      },
    });
  },

  openEdit(event) {
    const id = Number(event.currentTarget.dataset.id) || 0;
    if (!id) return;
    wx.navigateTo({ url: "/consumer/address-edit/address-edit?id=" + id });
  },

  addAddress() {
    wx.navigateTo({ url: "/consumer/address-edit/address-edit" });
  },

  setDefault(event) {
    const index = Number(event.currentTarget.dataset.index);
    const item = this.data.list[index];
    if (!item || item.isDefault) return;
    const self = this;
    this.setData({ acting: item.id });
    api
      .saveAddress({
        id: item.id,
        contactName: item.contactName,
        phone: item.phone,
        province: item.province,
        city: item.city,
        district: item.district,
        detail: item.detail,
        lng: item.lng,
        lat: item.lat,
        cityId: item.cityId,
        tag: item.tag,
        isDefault: true,
      })
      .then(() => self.load())
      .catch((error) => {
        self.setData({ acting: 0 });
        wx.showToast({
          title: (error && error.message) || "设置失败",
          icon: "none",
        });
      });
  },

  remove(event) {
    const index = Number(event.currentTarget.dataset.index);
    const item = this.data.list[index];
    if (!item) return;
    const self = this;
    wx.showModal({
      title: "删除地址",
      content: "确认删除「" + (item.contactName || "该地址") + "」这条地址？",
      success(res) {
        if (!res.confirm) return;
        self.setData({ acting: item.id });
        api
          .removeAddress(item.id)
          .then(() => {
            wx.showToast({ title: "已删除", icon: "success" });
            self.load();
          })
          .catch((error) => {
            self.setData({ acting: 0 });
            wx.showToast({
              title: (error && error.message) || "删除失败",
              icon: "none",
            });
          });
      },
    });
  },
});
