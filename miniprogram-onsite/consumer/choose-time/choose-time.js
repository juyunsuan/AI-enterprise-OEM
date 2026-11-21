const api = require("../../utils/api");
const format = require("../../utils/format");

/** 与后端 ONSITE_SLOT_REASON_LABELS 同口径，只做文案展示。 */
const REASON_TEXT = {
  AVAILABLE: "可预约",
  OCCUPIED: "已被预约",
  REST: "休息中",
  EXPIRED: "已过时间",
  OUT_OF_SERVICE: "超出服务时段",
  DAILY_LIMIT: "当日接单已满",
  LEAD_TIME: "距开始太近",
};

/**
 * 时间片能否点只看后端给的 available（已含「连续占片能否放下所选时长」），
 * 端上不再自己推算，避免与排期引擎出现两套口径。
 */
function toSlot(slot) {
  const available = slot.available === true;
  const reason = slot.reason || "AVAILABLE";
  let reasonText = "";
  if (!available) {
    reasonText = reason === "AVAILABLE" ? "放不下所选时长" : REASON_TEXT[reason] || "不可预约";
  }
  return {
    startAt: slot.startAt,
    label: slot.label || "",
    available: available,
    reasonText: reasonText,
    disabledClass: available ? "" : "slot-disabled",
    activeClass: "",
  };
}

function toTimelineRow(row) {
  const rating = Number(row.rating);
  return {
    staffId: row.staffId,
    staffName: row.staffName || "服务技师",
    avatar: row.avatar || "",
    levelName: row.levelName || "",
    ratingText: Number.isFinite(rating) ? rating.toFixed(1) : "",
    windowText:
      row.serviceStartAt && row.serviceEndAt
        ? row.serviceStartAt + " - " + row.serviceEndAt
        : "",
    availableCount: Number(row.availableCount) || 0,
    slots: ((row.slots || [])).map(toSlot),
  };
}

Page({
  data: {
    loading: true,
    error: "",
    notReady: false,
    readyReason: "",
    needService: false,
    services: [],
    serviceId: 0,
    serviceTitle: "",
    serviceDurationText: "",
    days: [],
    day: "",
    timelines: [],
    emptyText: "",
    timeUnitText: "",
    note: "",
    selected: null,
    canNext: false,
  },

  onLoad(options) {
    const params = options || {};
    this.serviceId = Number(params.serviceId || 0);
    this.staffId = Number(params.staffId || 0);
    this.start();
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
        if (!app.featureEnabled("booking")) {
          this.setData({ loading: false, error: "店铺暂未开放预约" });
          return null;
        }
        if (this.serviceId) {
          this.loadDays();
          return null;
        }
        // 从技师详情进来时没有服务项目：先让顾客挑一项，再用它的时长排档
        this.setData({ needService: true });
        return this.loadServices();
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "档期加载失败，请稍后重试",
        });
      });
  },

  loadServices() {
    this.setData({ loading: true, error: "" });
    return api
      .services({ page: 1, pageSize: 50 })
      .then((res) => {
        const list = ((res && res.list) || []).map((row) => ({
          id: row.id,
          title: row.title || "未命名服务",
          priceText: format.yuan(row.priceCents),
          durationText: format.duration(row.durationMinutes),
          activeClass: "",
        }));
        if (!list.length) {
          this.setData({ loading: false, error: "店铺还没有上架可预约的服务" });
          return;
        }
        this.setData({ services: list });
        this.pickService(list[0].id);
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "服务项目加载失败，请稍后重试",
        });
      });
  },

  onServiceTap(event) {
    const id = Number(event.currentTarget.dataset.id) || 0;
    if (!id || id === this.serviceId) return;
    this.pickService(id);
  },

  pickService(serviceId) {
    const services = this.data.services.map((item) => ({
      id: item.id,
      title: item.title,
      priceText: item.priceText,
      durationText: item.durationText,
      activeClass: item.id === serviceId ? "pill-active" : "",
    }));
    const hit = services.filter((item) => item.id === serviceId)[0] || null;
    this.serviceId = serviceId;
    this.setData({
      services: services,
      serviceId: serviceId,
      serviceTitle: hit ? hit.title : "",
      serviceDurationText: hit ? hit.durationText : "",
      selected: null,
      canNext: false,
      timelines: [],
    });
    this.loadDays();
  },

  loadDays() {
    this.setData({ loading: true, error: "" });
    return api
      .scheduleDays({ serviceId: this.serviceId, staffId: this.staffId })
      .then((res) => {
        const days = ((res && res.days) || []).map((item) => ({
          day: item.day,
          availableCount: Number(item.availableCount) || 0,
          label: format.dayLabel(item.day),
          countText: item.availableCount ? item.availableCount + " 个可约" : "约满",
          activeClass: "",
        }));
        if (!days.length) {
          this.setData({ loading: false, error: "店铺还没有配置可预约的日期" });
          return null;
        }
        const firstOpen = days.filter((item) => item.availableCount > 0)[0];
        const day = (firstOpen || days[0]).day;
        this.setData({
          days: this.withActiveDay(days, day),
          day: day,
          timeUnitText: res && res.timeUnitMinutes ? "每格 " + res.timeUnitMinutes + " 分钟" : "",
        });
        return this.loadTimeline(day);
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "可约日期加载失败，请稍后重试",
        });
      });
  },

  withActiveDay(days, day) {
    return days.map((item) => ({
      day: item.day,
      availableCount: item.availableCount,
      label: item.label,
      countText: item.countText,
      activeClass: item.day === day ? "pill-active" : "",
    }));
  },

  onDayTap(event) {
    const day = event.currentTarget.dataset.day;
    if (!day || day === this.data.day) return;
    this.setData({
      day: day,
      days: this.withActiveDay(this.data.days, day),
      timelines: [],
      selected: null,
      canNext: false,
    });
    this.activePath = "";
    this.loadTimeline(day);
  },

  loadTimeline(day) {
    if (!day) return Promise.resolve();
    this.activePath = "";
    this.setData({ loading: true, error: "" });
    return api
      .scheduleTimeline({ day: day, serviceId: this.serviceId, staffId: this.staffId })
      .then((res) => {
        const timelines = ((res && res.timelines) || []).map(toTimelineRow);
        let emptyText = "";
        if (!timelines.length) emptyText = "这天没有在岗的服务人员";
        else if (!timelines.some((row) => row.slots.some((slot) => slot.available))) {
          emptyText = "这天的时段都不可约，换一天试试";
        }
        this.setData({
          loading: false,
          timelines: timelines,
          emptyText: emptyText,
          note: (res && res.note) || "",
          timeUnitText:
            res && res.timeUnitMinutes ? "每格 " + res.timeUnitMinutes + " 分钟" : "",
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "时段加载失败，请稍后重试",
        });
      });
  },

  onSlotTap(event) {
    const dataset = event.currentTarget.dataset;
    const staffIndex = Number(dataset.staff);
    const slotIndex = Number(dataset.slot);
    const row = this.data.timelines[staffIndex];
    if (!row) return;
    const slot = row.slots[slotIndex];
    if (!slot) return;
    if (!slot.available) {
      wx.showToast({ title: slot.reasonText || "该时段不可预约", icon: "none" });
      return;
    }
    this.setData({
      selected: {
        startAt: slot.startAt,
        label: slot.label,
        staffId: row.staffId,
        staffName: row.staffName,
      },
      canNext: true,
    });
    const path = "timelines[" + staffIndex + "].slots[" + slotIndex + "].activeClass";
    const patch = {};
    if (this.activePath) patch[this.activePath] = "";
    patch[path] = "slot-active";
    this.activePath = path;
    this.setData(patch);
  },

  next() {
    const selected = this.data.selected;
    if (!selected) {
      wx.showToast({ title: "请先选择上门时间", icon: "none" });
      return;
    }
    if (!this.serviceId) {
      wx.showToast({ title: "请先选择服务项目", icon: "none" });
      return;
    }
    const startAt = new Date(selected.startAt).toISOString();
    wx.navigateTo({
      url:
        "/consumer/confirm-order/confirm-order?serviceId=" +
        this.serviceId +
        "&staffId=" +
        (selected.staffId || 0) +
        "&startAt=" +
        encodeURIComponent(startAt),
    });
  },
});
