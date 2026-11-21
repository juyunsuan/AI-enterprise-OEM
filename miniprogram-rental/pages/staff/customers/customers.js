const api = require("../../../utils/api");
const staff = require("../../../utils/staff");
const format = require("../../../utils/format");

Page({
  data: {
    loading: true,
    error: "",
    keyword: "",
    rows: [],
  },

  onShow() {
    if (!staff.requireStaff()) return;
    this.load();
  },

  onKeyword(event) {
    this.setData({ keyword: event.detail.value });
  },

  load() {
    this.setData({ loading: true, error: "" });
    api
      .staffCustomers({ page: 1, pageSize: 50, keyword: this.data.keyword.trim() })
      .then((res) => {
        this.setData({
          loading: false,
          rows: ((res && res.list) || []).map((row) => ({
            ...row,
            lastLoginText: row.lastLoginAt ? format.dateTime(row.lastLoginAt) : "未登录",
            statusLabel: row.status === 'ACTIVE' ? '正常' : '已限制',
          })),
        });
      })
      .catch((error) =>
        this.setData({ loading: false, error: (error && error.message) || "顾客加载失败" }),
      );
  },

  callCustomer(event) {
    const phone = event.currentTarget.dataset.phone;
    if (phone) wx.makePhoneCall({ phoneNumber: phone });
  },
});