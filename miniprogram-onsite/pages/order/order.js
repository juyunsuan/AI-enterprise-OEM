const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

/** 「我的 → 订单四宫格」用 storage 传初始页签：switchTab 不能带参数。 */
const TAB_KEY = "onsite:order:tab";

/** 状态取值与后端 ORDER_STATUS_LABELS 逐字一致，端上只做文案映射。 */
const STATUS_TEXT = {
  PENDING_PAYMENT: "待付款",
  PAID: "待接单",
  ACCEPTED: "已接单",
  EN_ROUTE: "服务出发",
  ON_SITE: "已到达",
  SERVING: "服务中",
  COMPLETED: "已完成",
  SIGNED: "已签收",
  REVIEWED: "已评价",
  CANCELLED: "已取消",
  EXPIRED: "超时关闭",
  REJECTED: "技师拒单",
  REFUND_PENDING: "退款中",
  REFUNDED: "已退款",
};

/**
 * 订单列表接口只按 page/pageSize 取本人订单，没有 status 参数，
 * 所以页签在已加载的订单上做筛选；换页签会重新拉第一页。
 */
const TABS = [
  { key: "ALL", label: "全部", statuses: [] },
  { key: "PENDING_PAYMENT", label: "待付款", statuses: ["PENDING_PAYMENT"] },
  { key: "PAID", label: "待接单", statuses: ["PAID"] },
  {
    key: "SERVING",
    label: "服务中",
    statuses: ["ACCEPTED", "EN_ROUTE", "ON_SITE", "SERVING"],
  },
  { key: "TO_REVIEW", label: "待评价", statuses: ["COMPLETED", "SIGNED"] },
];

function toCard(row) {
  const items = Array.isArray(row.items) ? row.items : [];
  const first = items[0];
  const title = first && first.title ? first.title : "上门服务订单";
  const buttons = [];
  if (row.status === "PENDING_PAYMENT")
    buttons.push({ key: "pay", text: "去支付", className: "action-primary" });
  if (row.status === "COMPLETED" || row.status === "SIGNED")
    buttons.push({ key: "review", text: "去评价", className: "action-primary" });
  buttons.push({ key: "detail", text: "查看详情", className: "" });
  return {
    id: row.id,
    orderNo: row.orderNo || "",
    statusText: STATUS_TEXT[row.status] || "处理中",
    serviceTitle: items.length > 1 ? title + " 等 " + items.length + " 项" : title,
    timeText: format.dateTime(row.startAt),
    amountText: format.yuan(row.payAmountCents),
    buttons: buttons,
  };
}

function tabsOf(activeKey) {
  return TABS.map((tab) => ({
    key: tab.key,
    label: tab.label,
    activeClass: tab.key === activeKey ? "tab-active" : "",
  }));
}

Page({
  data: {
    tabs: tabsOf("ALL"),
    tabKey: "ALL",
    tabLabel: "全部",
    emptyText: "还没有订单，去服务页挑一项上门服务吧",
    list: [],
    total: 0,
    page: 1,
    pageSize: 10,
    hasMore: false,
    loading: true,
    loadingMore: false,
    error: "",
    needLogin: false,
  },

  onShow() {
    this.all = this.all || [];
    let tabKey = this.data.tabKey;
    const pending = wx.getStorageSync(TAB_KEY);
    if (pending) {
      wx.removeStorageSync(TAB_KEY);
      if (this.tabOf(pending)) tabKey = pending;
    }
    this.applyTab(tabKey);

    if (!getApp().hasToken()) {
      this.all = [];
      this.setData({
        needLogin: true,
        loading: false,
        error: "",
        list: [],
        total: 0,
        hasMore: false,
      });
      return;
    }
    this.setData({ needLogin: false });
    this.load(true);
  },

  onPullDownRefresh() {
    if (!getApp().hasToken()) {
      wx.stopPullDownRefresh();
      return;
    }
    this.load(true).then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.loadingMore || this.data.loading) return;
    this.load(false);
  },

  tabOf(key) {
    for (let i = 0; i < TABS.length; i += 1) {
      if (TABS[i].key === key) return TABS[i];
    }
    return null;
  },

  applyTab(key) {
    const tab = this.tabOf(key) || TABS[0];
    this.setData({
      tabKey: tab.key,
      tabLabel: tab.label,
      tabs: tabsOf(tab.key),
      emptyText:
        tab.key === "ALL"
          ? "还没有订单，去服务页挑一项上门服务吧"
          : "暂无「" + tab.label + "」的订单",
    });
  },

  filterOf(rows) {
    const tab = this.tabOf(this.data.tabKey);
    if (!tab || !tab.statuses.length) return rows;
    return rows.filter((row) => tab.statuses.indexOf(row.status) >= 0);
  },

  load(reset) {
    if (this.busy) return Promise.resolve();
    this.busy = true;
    const page = reset ? 1 : this.data.page + 1;
    this.setData(reset ? { loading: true, error: "" } : { loadingMore: true });
    return api
      .orders({ page: page, pageSize: this.data.pageSize })
      .then((res) => {
        const rows = ((res && res.list) || []).map(toCard);
        const total = Number(res && res.total) || 0;
        this.all = reset ? rows : (this.all || []).concat(rows);
        this.setData({
          list: this.filterOf(this.all),
          total: total,
          page: page,
          hasMore: this.all.length < total,
          loading: false,
          loadingMore: false,
          error: "",
          needLogin: false,
        });
      })
      .catch((error) => {
        if (error && error.code === 401) {
          this.all = [];
          this.setData({
            needLogin: true,
            loading: false,
            loadingMore: false,
            list: [],
            total: 0,
            hasMore: false,
            error: "",
          });
          return;
        }
        this.setData({
          loading: false,
          loadingMore: false,
          error: (error && error.message) || "订单加载失败，请稍后重试",
        });
      })
      .then(() => {
        this.busy = false;
      });
  },

  onTabTap(event) {
    const key = event.currentTarget.dataset.key;
    if (!key || key === this.data.tabKey) return;
    this.all = [];
    this.applyTab(key);
    this.setData({ page: 1, list: [], total: 0, hasMore: false, error: "" });
    this.load(true);
  },

  onRetry() {
    this.load(true);
  },

  login() {
    if (this.logging) return;
    this.logging = true;
    this.setData({ error: "" });
    auth
      .ensureLogin()
      .then(() => {
        this.logging = false;
        this.setData({ needLogin: false });
        this.load(true);
      })
      .catch((error) => {
        this.logging = false;
        this.setData({ error: (error && error.message) || "登录失败，请重试" });
      });
  },

  onCardTap(event) {
    this.openDetail(event.currentTarget.dataset.id);
  },

  onAction(event) {
    const dataset = event.currentTarget.dataset;
    if (dataset.key === "pay") this.pay(dataset.id);
    else if (dataset.key === "review") this.review(dataset.id);
    else this.openDetail(dataset.id);
  },

  openDetail(orderId) {
    if (!orderId) return;
    wx.navigateTo({
      url: "/consumer/order-detail/order-detail?orderId=" + orderId,
    });
  },

  review(orderId) {
    if (!orderId) return;
    wx.navigateTo({
      url: "/consumer/review-submit/review-submit?orderId=" + orderId,
    });
  },

  /** 支付参数由后端签名；端上只把 payable/reason 原样反馈给顾客。 */
  pay(orderId) {
    if (!orderId || this.paying) return;
    this.paying = true;
    api
      .payParams(orderId)
      .then((res) => {
        if (!res || !res.payable || !res.params) {
          wx.showToast({ title: (res && res.reason) || "当前订单不可支付", icon: "none" });
          return null;
        }
        return new Promise((resolve, reject) => {
          wx.requestPayment({
            timeStamp: res.params.timeStamp,
            nonceStr: res.params.nonceStr,
            package: res.params.package,
            signType: res.params.signType,
            paySign: res.params.paySign,
            success: resolve,
            fail: reject,
          });
        })
          .then(() => {
            wx.showToast({ title: "支付成功", icon: "success" });
            this.load(true);
          })
          .catch((error) => {
            const message = (error && error.errMsg) || "";
            wx.showToast({
              title: message.indexOf("cancel") >= 0 ? "已取消支付" : "支付未完成，请稍后重试",
              icon: "none",
            });
          });
      })
      .catch((error) => {
        wx.showToast({
          title: (error && error.message) || "支付参数获取失败",
          icon: "none",
        });
      })
      .then(() => {
        this.paying = false;
      });
  },
});
