/** 我的订单：充值/开通记录，状态口径与后端一致。 */
const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

Page({
  data: {
    themeStyle: "",
    list: [],
    page: 1,
    hasMore: true,
    loading: false,
    error: "",
  },

  onShow() {
    const app = getApp();
    this.setData({ themeStyle: app.globalData.themeStyle });
    this.load(1);
  },

  onPullDownRefresh() {
    this.load(1).then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) this.load(this.data.page + 1);
  },

  load(page) {
    if (this.data.loading) return Promise.resolve();
    this.setData({ loading: true });
    return auth
      .ensureMember()
      .then(() => api.orders({ page: page, pageSize: 10 }))
      .then((result) => {
        const rows = (result && result.list ? result.list : []).map((row) => ({
          id: row.id,
          orderNo: row.orderNo,
          packageName: row.packageName,
          amountText: format.money(row.amountCents),
          statusText: format.orderStatus(row.status),
          paid: row.status === 1,
          createdAt: format.dateTime(row.createdAt),
        }));
        const total = (result && result.total) || 0;
        const merged = page === 1 ? rows : this.data.list.concat(rows);
        this.setData({
          list: merged,
          page: page,
          hasMore: rows.length > 0 && merged.length < total,
          loading: false,
          error: "",
        });
      })
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "加载失败" });
      });
  },
});
