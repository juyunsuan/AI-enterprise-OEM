const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

const TABS = [
  { value: "", label: "全部" },
  { value: "PENDING", label: "待审核" },
  { value: "AGREED", label: "待退货" },
  { value: "REFUNDED", label: "已退款" },
];

Page({
  data: {
    tabs: TABS,
    status: "",
    loading: true,
    error: "",
    list: [],
    page: 1,
    hasMore: true,
  },

  onShow() {
    this.load(true);
  },

  load(reset) {
    const page = reset ? 1 : this.data.page + 1;
    this.setData({ loading: reset, error: "" });
    auth
      .ensureLogin()
      .then(() => api.afterSales(this.data.status, page, 10))
      .then((result) => {
        const mapped = ((result && result.list) || []).map(function (row) {
          return Object.assign({}, row, {
            typeText: format.afterSaleTypeText(row.type),
            statusText: format.afterSaleStatusText(row.status),
            amountText: format.money(row.amount),
            timeText: format.time(row.createdAt),
            items: (row.items || []).map(function (item) {
              return Object.assign({}, item, {
                priceText: (Number(item.price) || 0).toFixed(2),
              });
            }),
          });
        });
        const list = reset ? mapped : this.data.list.concat(mapped);
        this.setData({
          loading: false,
          list: list,
          page: page,
          hasMore: list.length < ((result && result.total) || 0),
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "售后记录读取失败",
        });
      });
  },

  onReachBottom() {
    if (this.data.hasMore) this.load(false);
  },

  reload() {
    this.load(true);
  },

  pickTab(event) {
    const status = event.currentTarget.dataset.status;
    if (status === this.data.status) return;
    this.setData({ status: status, list: [], hasMore: true });
    this.load(true);
  },

  cancel(event) {
    const id = Number(event.currentTarget.dataset.id);
    wx.showModal({
      title: "撤销申请",
      content: "撤销后需要重新申请，确定撤销吗？",
      success: (res) => {
        if (!res.confirm) return;
        api
          .cancelAfterSale(id)
          .then(() => {
            wx.showToast({ title: "已撤销", icon: "success" });
            this.load(true);
          })
          .catch((error) => wx.showToast({ title: (error && error.message) || "撤销失败", icon: "none" }));
      },
    });
  },
});
