const app = getApp();
const api = require("../../utils/api");
const auth = require("../../utils/auth");
const fmt = require("../../utils/format");

const TYPE_LABEL = { SENDER: "寄件地址", RECEIVER: "收件地址" };

function viewModel(row) {
  return {
    id: row.id,
    type: row.type,
    typeLabel: TYPE_LABEL[row.type] || row.type,
    name: row.name,
    mobile: row.mobile,
    regionText: fmt.partyText(
      Object.assign({}, row, { address: "" }),
    ),
    address: row.address,
    isDefault: row.isDefault,
    fullText: fmt.partyText(row),
  };
}

Page({
  data: {
    mode: "",
    type: "",
    loading: true,
    error: "",
    loginError: "",
    needSite: false,
    list: [],
  },

  onLoad(options) {
    const mode = options.mode || "";
    const type = options.type || "";
    this.setData({ mode: mode, type: type });
    wx.setNavigationBarTitle({
      title:
        mode === "select"
          ? type === "SENDER"
            ? "选择寄件地址"
            : "选择收件地址"
          : "地址簿",
    });
  },

  onShow() {
    this.load();
  },

  load() {
    this.setData({ loading: !this.data.list.length, error: "", loginError: "", needSite: false });
    return app
      .ensureReady()
      .then(() => {
        if (app.globalData.needSite) {
          this.setData({ loading: false, needSite: true });
          return;
        }
        return auth
          .ensureLogin()
          .then(() => api.addresses())
          .then((rows) => {
            const list = (rows || []).map(viewModel);
            this.setData({
              loading: false,
              list: this.data.type ? list.filter((row) => row.type === this.data.type) : list,
            });
          });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          loginError: error.message || "读取地址失败，请重新进入小程序",
        });
      });
  },

  pick(event) {
    if (this.data.mode !== "select") return;
    const row = this.data.list[Number(event.currentTarget.dataset.index)];
    if (!row) return;
    app.globalData.pickedAddress = {
      type: this.data.type || row.type,
      party: {
        name: row.name,
        mobile: row.mobile,
        province: row.province,
        city: row.city,
        district: row.district,
        address: row.address,
      },
    };
    wx.navigateBack();
  },

  add() {
    wx.navigateTo({
      url: "/pages/address/edit?type=" + (this.data.type || "SENDER"),
    });
  },

  edit(event) {
    wx.navigateTo({
      url:
        "/pages/address/edit?type=" +
        event.currentTarget.dataset.type +
        "&id=" +
        event.currentTarget.dataset.id,
    });
  },

  remove(event) {
    const id = Number(event.currentTarget.dataset.id);
    wx.showModal({
      title: "删除地址",
      content: "删除后不可恢复，确定删除这条地址吗？",
      confirmText: "删除",
      confirmColor: "#e5484d",
      success: (res) => {
        if (!res.confirm) return;
        api
          .removeAddress(id)
          .then(() => {
            wx.showToast({ title: "已删除", icon: "success" });
            this.load();
          })
          .catch((error) => {
            wx.showToast({ title: error.message || "删除失败", icon: "none" });
          });
      },
    });
  },

  retry() {
    this.load();
  },

  goPickSite() {
    app.goPickSite();
  },
});
