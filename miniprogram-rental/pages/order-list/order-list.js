const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

const FILTERS = [
  { key: "all", label: "全部" },
  { key: "PENDING_PAYMENT", label: "待付款" },
  { key: "PAID", label: "待取车" },
  { key: "PICKED_UP", label: "租用中" },
  { key: "RETURNED", label: "待结算" },
  { key: "COMPLETED", label: "已完成" },
];

function toRow(row) {
  return {
    id: row.id,
    orderNo: row.orderNo,
    itemName: row.itemName,
    status: row.status,
    statusLabel: row.statusLabel,
    payText: format.yuan(row.payCents),
    periodText: format.monthDay(format.toDate(row.startAt)) + " 至 " + format.monthDay(format.toDate(row.endAt)),
    days: row.days,
    createdAt: format.dateTime(row.createdAt),
  };
}

Page({
  data: {
    loading: true,
    error: "",
    filters: FILTERS,
    status: "all",
    rows: [],
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: true,
  },

  onShow() {
    this.load(true);
  },

  load(reset) {
    const page = reset ? 1 : this.data.page;
    this.setData({ loading: true, error: "" });
    auth
      .ensureLogin()
      .then(() => api.orders({ page: page, pageSize: this.data.pageSize, status: this.data.status }))
      .then((res) => {
        const list = (res && res.list) || [];
        const rows = list.map(toRow);
        this.setData({
          loading: false,
          rows: reset ? rows : this.data.rows.concat(rows),
          page: page,
          total: (res && res.total) || 0,
          hasMore: rows.length >= this.data.pageSize && (reset ? rows.length : this.data.rows.length + rows.length) < ((res && res.total) || 0),
        });
      })
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "租单加载失败" });
      });
  },

  changeFilter(event) {
    this.setData({ status: event.currentTarget.dataset.key });
    this.load(true);
  },

  openDetail(event) {
    wx.navigateTo({
      url: "/pages/order-detail/order-detail?id=" + event.currentTarget.dataset.id,
    });
  },

  loadMore() {
    if (!this.data.hasMore || this.data.loading) return;
    this.setData({ page: this.data.page + 1 });
    this.load(false);
  },
});