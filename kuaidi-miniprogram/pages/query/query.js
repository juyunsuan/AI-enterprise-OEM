const fmt = require("../../utils/format");

const HISTORY_KEY = "kuaidi_query_history";

Page({
  data: {
    orderNo: "",
    mobile: "",
    history: [],
  },

  onShow() {
    this.setData({ history: wx.getStorageSync(HISTORY_KEY) || [] });
  },

  onOrderNo(event) {
    this.setData({ orderNo: event.detail.value.trim() });
  },

  onMobile(event) {
    this.setData({ mobile: event.detail.value.trim() });
  },

  search() {
    const orderNo = this.data.orderNo;
    const mobile = this.data.mobile;
    if (!orderNo) {
      wx.showToast({ title: "请输入订单号", icon: "none" });
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(mobile)) {
      wx.showToast({ title: "请输入下单时填写的 11 位手机号", icon: "none" });
      return;
    }
    this.remember(orderNo, mobile);
    wx.navigateTo({
      url:
        "/pages/order-detail/order-detail?orderNo=" +
        encodeURIComponent(orderNo) +
        "&mobile=" +
        encodeURIComponent(mobile),
    });
  },

  remember(orderNo, mobile) {
    const rows = (wx.getStorageSync(HISTORY_KEY) || []).filter(
      (row) => !(row.orderNo === orderNo && row.mobile === mobile),
    );
    rows.unshift({ orderNo: orderNo, mobile: mobile, at: fmt.time(new Date().toISOString()) });
    wx.setStorageSync(HISTORY_KEY, rows.slice(0, 8));
    this.setData({ history: rows.slice(0, 8) });
  },

  useHistory(event) {
    const index = Number(event.currentTarget.dataset.index);
    const row = this.data.history[index];
    if (!row) return;
    this.setData({ orderNo: row.orderNo, mobile: row.mobile });
  },

  copyOrderNo(event) {
    const orderNo = event.currentTarget.dataset.order;
    if (orderNo) wx.setClipboardData({ data: orderNo });
  },

  clearHistory() {
    wx.removeStorageSync(HISTORY_KEY);
    this.setData({ history: [] });
  },
});
