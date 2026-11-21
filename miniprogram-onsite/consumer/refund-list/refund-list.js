const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

/**
 * 退款状态只有这五种（见 onsite_refunds.status 注释）；文案在这里映射，
 * 筛选交给服务端（`status` 参数），切页签即重新取数，不会出现「当前页没有就空列表」。
 */
const STATUS_TEXT = {
  PENDING: "待处理",
  AGREED: "已同意",
  REFUNDED: "已退款",
  REJECTED: "已驳回",
  CANCELLED: "已撤销",
};

function toRow(row) {
  return {
    id: row.id,
    refundNo: row.refundNo || "",
    orderNo: row.orderNo || "",
    status: row.status || "",
    statusText: row.statusText || STATUS_TEXT[row.status] || row.status || "",
    applyAmountText: format.yuan(row.applyAmountCents),
    timeText: format.shortTime(row.createdAt),
  };
}

Page({
  data: {
    loading: true,
    loadingMore: false,
    error: "",
    notReady: false,
    readyReason: "",
    tabs: [
      { key: "all", label: "全部" },
      { key: "PENDING", label: "待处理" },
      { key: "REFUNDED", label: "已退款" },
      { key: "REJECTED", label: "已驳回" },
      { key: "CANCELLED", label: "已撤销" },
    ],
    activeStatus: "all",
    list: [],
    page: 1,
    pageSize: 10,
    total: 0,
    loadedCount: 0,
    loadedAll: false,
  },

  onLoad() {
    this.rows = [];
    this.start();
  },

  onPullDownRefresh() {
    const stop = () => wx.stopPullDownRefresh();
    this.reload().then(stop).catch(stop);
  },

  onReachBottom() {
    this.loadMore();
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
        return auth.ensureLogin().then(() => this.reload());
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "登录失败，请重新进入小程序",
        });
      });
  },

  statusParam() {
    const status = this.data.activeStatus;
    return status && status !== "all" ? status : "";
  },

  reload() {
    this.setData({ loading: true, error: "" });
    return api
      .refunds({ page: 1, pageSize: this.data.pageSize, status: this.statusParam() })
      .then((res) => {
        const total = Number(res && res.total) || 0;
        this.rows = ((res && res.list) || []).map(toRow);
        this.setData({
          loading: false,
          page: 1,
          total: total,
          list: this.rows,
          loadedCount: this.rows.length,
          loadedAll: this.rows.length >= total,
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "退款记录加载失败",
        });
      });
  },

  loadMore() {
    if (this.data.loading || this.data.loadingMore || this.data.loadedAll) return;
    const next = this.data.page + 1;
    const self = this;
    this.setData({ loadingMore: true });
    api
      .refunds({ page: next, pageSize: this.data.pageSize, status: this.statusParam() })
      .then((res) => {
        const rows = ((res && res.list) || []).map(toRow);
        const total = Number(res && res.total) || self.data.total;
        self.rows = self.rows.concat(rows);
        self.setData({
          loadingMore: false,
          page: next,
          total: total,
          list: self.rows,
          loadedCount: self.rows.length,
          loadedAll: rows.length === 0 || self.rows.length >= total,
        });
      })
      .catch((error) => {
        self.setData({ loadingMore: false });
        wx.showToast({
          title: (error && error.message) || "加载失败",
          icon: "none",
        });
      });
  },

  switchTab(event) {
    const key = event.currentTarget.dataset.key || "all";
    if (key === this.data.activeStatus) return;
    this.rows = [];
    this.setData({
      activeStatus: key,
      list: [],
      total: 0,
      loadedCount: 0,
      loadedAll: false,
      page: 1,
    });
    this.reload();
  },

  openDetail(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: "/consumer/refund-detail/refund-detail?refundId=" + id,
    });
  },
});
