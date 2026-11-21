const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

/** 售后单列表：接口一次给全（后端封顶 50 条），所以不做分页。 */
Page({
  data: {
    rows: [],
    loading: true,
    error: "",
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    this.setData({ loading: true });
    return auth
      .ensureLogin()
      .then(() => api.refunds())
      .then((rows) => {
        this.setData({
          loading: false,
          error: "",
          rows: (rows || []).map((row) => ({
            id: row.id,
            refundNo: row.refundNo,
            orderId: row.orderId,
            itemId: row.orderItemId,
            typeLabel: format.RETURN_TYPE_LABELS[row.type] || row.type,
            status: row.status,
            statusLabel: format.REFUND_TICKET_STATUS_LABELS[row.status] || row.status,
            amountText: format.money(row.amount),
            reason: row.reason,
            rejectReason: row.rejectReason || "",
            adminRemark: row.adminRemark || "",
            title: row.title,
            image: row.image,
            quantity: row.quantity,
            createdAtText: format.dateTime(row.createdAt),
            refundedAtText: format.dateTime(row.refundedAt),
          })),
        });
      })
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "售后记录加载失败" });
      });
  },

  openOrder(event) {
    wx.navigateTo({ url: "/pages/order/detail?id=" + event.currentTarget.dataset.id });
  },

  /** 被驳回或取消后可以按同一行项目再次申请。 */
  applyAgain(event) {
    const dataset = event.currentTarget.dataset;
    wx.navigateTo({
      url: "/pages/refund/apply?orderId=" + dataset.order + "&itemId=" + dataset.item,
    });
  },

  goOrders() {
    wx.navigateTo({ url: "/pages/order/list" });
  },
});
