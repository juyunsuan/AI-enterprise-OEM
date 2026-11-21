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
  SIGNED: "已签收",
  REVIEWED: "已评价",
};

/** 与后端 ONSITE_SLOT_REASON_LABELS 同一口径，页面只读展示。 */
const SLOT_REASON_LABELS = {
  AVAILABLE: "可约",
  OCCUPIED: "已被预约",
  REST: "休息中",
  EXPIRED: "已过时间",
  OUT_OF_SERVICE: "超出服务时段",
  DAILY_LIMIT: "当日接单已满",
  LEAD_TIME: "未满足提前预约时长",
};

function pad(value) {
  return value < 10 ? "0" + value : String(value);
}

function dayKeyOf(date) {
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

function clockOf(value) {
  const date = format.toDate(value);
  if (!date) return "—";
  return pad(date.getHours()) + ":" + pad(date.getMinutes());
}

function parseDayKey(text) {
  const parts = String(text || "").split("-");
  if (parts.length !== 3) return new Date();
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

Page({
  data: {
    day: dayKeyOf(new Date()),
    dayText: "今天",
    loading: true,
    errorText: "",
    note: "",
    inTimeline: false,
    windowText: "",
    summaryText: "",
    slots: [],
    rests: [],
    orders: [],
  },

  onLoad(query) {
    if (query && query.day) {
      this.setData({ day: query.day, dayText: format.dayLabel(parseDayKey(query.day)) });
    }
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
    if (!profile) return;
    this.staffId = (profile.staff && profile.staff.id) || 0;
    await this.loadOrderMap();
    await this.load();
  },

  onPullDownRefresh() {
    this.loadOrderMap()
      .then(() => this.load())
      .then(() => wx.stopPullDownRefresh());
  },

  /** 已排订单的订单号与服务名只在订单列表里：档期片段只带 orderId，这里取一页做对照。 */
  async loadOrderMap() {
    this.orderMap = {};
    try {
      const result = await api.staffOrders({ page: 1, pageSize: 100 });
      const rows = (result && result.list) || [];
      for (let i = 0; i < rows.length; i += 1) {
        this.orderMap[rows[i].id] = rows[i];
      }
    } catch (error) {
      this.orderMap = {};
    }
  },

  async load() {
    this.setData({ loading: true, errorText: "" });
    try {
      const timeline = await api.staffSchedule({ day: this.data.day });
      let mine = null;
      const rows = (timeline && timeline.timelines) || [];
      for (let i = 0; i < rows.length; i += 1) {
        if (rows[i].staffId === this.staffId) mine = rows[i];
      }
      if (!mine) {
        // 后端只把在岗（ONLINE）技师排进时间轴：休息中/未在岗时看不到自己的档
        this.setData({
          loading: false,
          inTimeline: false,
          note: (timeline && timeline.note) || "当前不在岗，本日没有生成档期；设为在岗后才有可约时段。",
          windowText: "",
          summaryText: "",
          slots: [],
          rests: [],
          orders: [],
        });
        return;
      }
      const rawSlots = mine.slots || [];
      const slots = rawSlots.map((slot) => ({
        key: String(slot.startAt),
        label: slot.label,
        available: !!slot.available,
        slotClass: slot.available ? "slot-free" : "slot-busy",
        reasonLabel: SLOT_REASON_LABELS[slot.reason] || slot.reason,
        orderId: slot.orderId || 0,
      }));
      const seen = {};
      const orders = [];
      for (let i = 0; i < rawSlots.length; i += 1) {
        const slot = rawSlots[i];
        if (!slot.orderId || seen[slot.orderId]) continue;
        seen[slot.orderId] = true;
        const row = this.orderMap ? this.orderMap[slot.orderId] : null;
        const titles = row && row.serviceTitles ? row.serviceTitles : [];
        orders.push({
          id: slot.orderId,
          orderNo: row ? row.orderNo : "订单 #" + slot.orderId,
          timeText: row ? format.dateTime(row.startAt) : slot.label,
          serviceText: titles.length ? titles.join("、") : "服务明细见详情",
          statusLabel: row ? STATUS_LABELS[row.status] || row.status : "",
        });
      }
      const rests = await this.loadRests();
      const availableCount = slots.filter((slot) => slot.available).length;
      this.setData({
        loading: false,
        inTimeline: true,
        note: (timeline && timeline.note) || "",
        windowText: mine.serviceStartAt + " - " + mine.serviceEndAt,
        summaryText: "可约 " + availableCount + " 段 · 已排 " + orders.length + " 单 · 休息 " + rests.length + " 段",
        slots: slots,
        rests: rests,
        orders: orders,
      });
    } catch (error) {
      this.setData({
        loading: false,
        errorText: (error && error.message) || "档期加载失败",
        slots: [],
        rests: [],
        orders: [],
        summaryText: "",
      });
    }
  },

  /** 休息段按天过滤：接口的 day 过滤只有下界，会把之后的休息段也带回来。 */
  async loadRests() {
    try {
      const result = await api.staffRestList({ day: this.data.day });
      const rows = (result && result.list) || [];
      const rests = [];
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const startAt = format.toDate(row.startAt);
        if (!startAt || dayKeyOf(startAt) !== this.data.day) continue;
        rests.push({
          id: row.id,
          rangeText: row.allDay ? "整天" : clockOf(row.startAt) + " - " + clockOf(row.endAt),
          reason: row.reason || "",
        });
      }
      return rests;
    } catch (error) {
      return [];
    }
  },

  shiftDay(event) {
    const delta = Number(event.currentTarget.dataset.delta) || 0;
    const date = parseDayKey(this.data.day);
    date.setDate(date.getDate() + delta);
    this.setData({ day: dayKeyOf(date), dayText: format.dayLabel(date) });
    this.load();
  },

  pickDay(event) {
    const day = event.detail.value;
    if (!day) return;
    this.setData({ day: day, dayText: format.dayLabel(parseDayKey(day)) });
    this.load();
  },

  openOrder(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: "/technician/order-detail/order-detail?orderId=" + id });
  },

  goRest() {
    wx.navigateTo({ url: "/technician/rest-set/rest-set" });
  },
});
