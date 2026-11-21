const api = require("../../../utils/api");
const staff = require("../../../utils/staff");
const format = require("../../../utils/format");

const FILTERS = [
  { key: "all", label: "全部" },
  { key: "PAID", label: "待取车" },
  { key: "PICKED_UP", label: "租用中" },
  { key: "RETURNED", label: "待结算" },
  { key: "COMPLETED", label: "已完成" },
  { key: "PENDING_PAYMENT", label: "待付款" },
];

function toRow(row) {
  return {
    id: row.id,
    orderNo: row.orderNo,
    itemName: row.itemName,
    customerName: row.customerName || "未留姓名",
    customerPhone: row.customerPhone || "",
    statusLabel: row.statusLabel,
    payText: format.yuan(Math.round(Number(row.payAmount) * 100)),
    periodText: row.startAt.slice(0, 10) + " 至 " + row.endAt.slice(0, 10),
    days: row.days,
  };
}

Page({
  data: {
    loading: true,
    error: "",
    filters: FILTERS,
    status: "all",
    rows: [],
  },

  onLoad(options) {
    const status = options.status || "all";
    this.setData({ status: status });
  },

  onShow() {
    if (!staff.requireStaff()) return;
    this.load();
  },

  load() {
    this.setData({ loading: true, error: "" });
    api
      .staffOrders({ page: 1, pageSize: 50, status: this.data.status })
      .then((res) => {
        this.setData({
          loading: false,
          rows: ((res && res.list) || []).map(toRow),
        });
      })
      .catch((error) =>
        this.setData({ loading: false, error: (error && error.message) || "租单加载失败" }),
      );
  },

  changeFilter(event) {
    this.setData({ status: event.currentTarget.dataset.key });
    this.load();
  },

  openDetail(event) {
    wx.navigateTo({
      url: "/pages/staff/order-detail/order-detail?id=" + event.currentTarget.dataset.id,
    });
  },

  callCustomer(event) {
    const phone = event.currentTarget.dataset.phone;
    if (phone) wx.makePhoneCall({ phoneNumber: phone });
  },
});