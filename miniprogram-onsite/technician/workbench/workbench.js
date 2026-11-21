const api = require("../../utils/api");
const staff = require("../../utils/staff");
const format = require("../../utils/format");

const STATUS_LABELS = {
  PAID: "待接单",
  ACCEPTED: "已接单",
  EN_ROUTE: "服务出发",
  ON_SITE: "已到达",
  SERVING: "服务中",
  COMPLETED: "已完成",
};
/** 还在履约里的单：工作台「今日下一单」只从这些状态里挑 */
const ACTIVE_STATUSES = ["PAID", "ACCEPTED", "EN_ROUTE", "ON_SITE", "SERVING"];

Page({
  data: {
    loading: true,
    staffName: "",
    staffAvatar: "",
    levelName: "",
    statusLabel: "",
    ratingText: "",
    stats: [
      { key: "todayOrders", label: "今日单量", value: 0 },
      { key: "awaitingAccept", label: "待接单", value: 0 },
      { key: "serving", label: "服务中", value: 0 },
      { key: "completedToday", label: "今日已完成", value: 0 },
    ],
    pendingProfile: false,
    alertEnabled: true,
    nextOrder: null,
    nextOrderError: "",
    shortcuts: [
      { key: "orders", label: "接单列表", url: "/technician/order-list/order-list" },
      { key: "schedule", label: "我的排期", url: "/technician/schedule/schedule" },
      { key: "rest", label: "休息设置", url: "/technician/rest-set/rest-set" },
      { key: "income", label: "我的收入", url: "/technician/income/income" },
      { key: "profile", label: "资料与审核", url: "/technician/profile/profile" },
      { key: "feedback", label: "意见反馈", url: "/technician/feedback/feedback" },
      { key: "appeal", label: "差评申诉", url: "/technician/appeal/appeal" },
      { key: "alert", label: "一键求救", url: "/technician/alert-help/alert-help" },
      { key: "location", label: "定位上报", url: "/technician/location/location" },
    ],
  },

  onLoad() {
    this.gate = staff.ensureStaff();
  },

  async onShow() {
    const gate = this.gate || staff.ensureStaff();
    this.gate = null;
    let profile = null;
    try {
      profile = await gate;
    } catch (error) {
      wx.showToast({ title: (error && error.message) || "登录失败，请稍后重试", icon: "none" });
      return;
    }
    // 闸门已跳转绑定页（没绑定 / 令牌失效），本页不再取数
    if (!profile) return;
    this.applyProfile(profile);
    await this.loadNextOrder();
  },

  onPullDownRefresh() {
    staff
      .ensureStaff()
      .then((profile) => {
        if (!profile) return undefined;
        this.applyProfile(profile);
        return this.loadNextOrder();
      })
      .catch(() => undefined)
      .then(() => wx.stopPullDownRefresh());
  },

  applyProfile(profile) {
    const card = profile.staff || {};
    const stats = profile.stats || {};
    const statusLabel =
      card.status === "ONLINE" ? "在岗" : card.status === "OFF_DUTY" ? "休息中" : card.status || "—";
    this.setData({
      loading: false,
      staffName: card.name || "",
      staffAvatar: card.avatar || "",
      levelName: card.levelName || "",
      statusLabel: statusLabel,
      ratingText: card.reviewCount ? Number(card.rating || 0).toFixed(1) + " 分 / " + card.reviewCount + " 条评价" : "",
      stats: [
        { key: "todayOrders", label: "今日单量", value: stats.todayOrders || 0 },
        { key: "awaitingAccept", label: "待接单", value: stats.awaitingAccept || 0 },
        { key: "serving", label: "服务中", value: stats.serving || 0 },
        { key: "completedToday", label: "今日已完成", value: stats.completedToday || 0 },
      ],
      pendingProfile: !!profile.pendingProfile,
      alertEnabled: profile.alertEnabled !== false,
    });
  },

  /**
   * 今日下一单：接口没有「下一单」字段，按自己的订单列表算最近一张未履约完的单。
   * 列表按 startAt 倒序下发，未来单排在前面，所以首页足够覆盖待服务的单。
   */
  async loadNextOrder() {
    try {
      const result = await api.staffOrders({ page: 1, pageSize: 50 });
      const active = [];
      const rows = (result && result.list) || [];
      for (let i = 0; i < rows.length; i += 1) {
        if (ACTIVE_STATUSES.indexOf(rows[i].status) >= 0) active.push(rows[i]);
      }
      active.sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime());
      const now = Date.now();
      let picked = null;
      for (let i = 0; i < active.length; i += 1) {
        if (new Date(active[i].startAt).getTime() >= now) {
          picked = active[i];
          break;
        }
      }
      // 全是已过时间的在途单时，取最近的一张，提醒技师尽快处理
      if (!picked && active.length) picked = active[active.length - 1];
      if (!picked) {
        this.setData({ nextOrder: null, nextOrderError: "" });
        return;
      }
      const titles = picked.serviceTitles || [];
      this.setData({
        nextOrderError: "",
        nextOrder: {
          id: picked.id,
          orderNo: picked.orderNo,
          timeText: format.dateTime(picked.startAt),
          serviceText: titles.length ? titles.join("、") : "服务明细见详情",
          statusLabel: STATUS_LABELS[picked.status] || picked.status,
          customerText: picked.customerName || "",
        },
      });
    } catch (error) {
      this.setData({
        nextOrder: null,
        nextOrderError: (error && error.message) || "订单加载失败",
      });
    }
  },

  openNextOrder() {
    const order = this.data.nextOrder;
    if (!order) return;
    wx.navigateTo({ url: "/technician/order-detail/order-detail?orderId=" + order.id });
  },

  openShortcut(event) {
    const url = event.currentTarget.dataset.url;
    if (!url) return;
    wx.navigateTo({ url: url });
  },

  openPending() {
    wx.navigateTo({ url: "/technician/order-list/order-list?status=PAID" });
  },

  openServing() {
    wx.navigateTo({ url: "/technician/order-list/order-list?status=SERVING" });
  },
});
