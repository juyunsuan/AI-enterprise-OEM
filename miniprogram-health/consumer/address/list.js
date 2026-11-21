const api = require("../../utils/api");
const auth = require("../../utils/auth");

Page({
  data: {
    loading: true,
    addresses: [],
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  async load() {
    try {
      await auth.requireLogin();
      const rows = (await api.addresses()) || [];
      this.setData({
        loading: false,
        addresses: rows.map((row) => ({
          ...row,
          regionText: [row.province, row.city, row.district].filter(Boolean).join(" "),
        })),
      });
    } catch (error) {
      this.setData({ loading: false });
      if (error && error.code !== 401) {
        wx.showToast({ title: error.message || "地址加载失败", icon: "none" });
      }
    }
  },

  onAdd() {
    wx.navigateTo({ url: "/consumer/address/edit" });
  },

  onEdit(e) {
    wx.navigateTo({ url: "/consumer/address/edit?id=" + e.currentTarget.dataset.id });
  },

  onRemove(e) {
    const id = Number(e.currentTarget.dataset.id) || 0;
    wx.showModal({
      title: "删除地址",
      content: "删除后该地址不再用于下单收货，确定删除吗？",
      confirmColor: "#f5413d",
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.removeAddress(id);
          wx.showToast({ title: "已删除" });
          this.load();
        } catch (error) {
          wx.showToast({ title: error.message || "删除失败", icon: "none" });
        }
      },
    });
  },
});
