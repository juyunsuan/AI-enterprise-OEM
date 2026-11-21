const api = require("../../utils/api");
const staff = require("../../utils/staff");

Page({
  data: {
    loading: true,
    keyword: "",
    list: [],
    total: 0,
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  onKeyword(e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearch() {
    this.load();
  },

  async load() {
    try {
      await staff.requireStaff();
      const data = await api.staffPatients({ keyword: this.data.keyword, pageSize: 50 });
      this.setData({
        loading: false,
        list: (data && data.list) || [],
        total: (data && data.total) || 0,
      });
    } catch (error) {
      this.setData({ loading: false });
      staff.handleError(error, "就诊人加载失败");
    }
  },

  onPatient(e) {
    wx.navigateTo({ url: "/practitioner/patient/detail?id=" + e.currentTarget.dataset.id });
  },
});
