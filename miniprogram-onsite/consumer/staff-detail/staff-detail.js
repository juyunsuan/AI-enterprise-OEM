const api = require("../../utils/api");

/** 详情接口只放行在岗技师：不在岗返回 404，页面如实提示「已下线」。 */
function toView(row) {
  const rating = Number(row.rating);
  return {
    id: row.id,
    name: row.name || "服务技师",
    avatar: row.avatar || "",
    levelName: row.levelName || "",
    serviceCity: row.serviceCity || "",
    intro: row.intro || "",
    workYearsText: row.workYears ? "从业 " + row.workYears + " 年" : "",
    ratingText: Number.isFinite(rating) ? rating.toFixed(1) : "",
    reviewText: row.reviewCount ? row.reviewCount + " 条评价" : "",
    orderText: row.orderCount ? "已服务 " + row.orderCount + " 单" : "",
    windowText:
      row.serviceStartAt && row.serviceEndAt
        ? row.serviceStartAt + " - " + row.serviceEndAt
        : "",
    images: (row.images || []).filter(Boolean).slice(0, 9),
  };
}

Page({
  data: {
    loading: true,
    error: "",
    notReady: false,
    readyReason: "",
    staff: null,
    images: [],
  },

  onLoad(options) {
    this.staffId = Number((options && options.staffId) || 0);
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
        return this.load();
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "服务人员加载失败，请稍后重试",
        });
      });
  },

  load() {
    if (!this.staffId) {
      this.setData({ loading: false, error: "缺少服务人员编号，请从服务人员列表进入" });
      return Promise.resolve();
    }
    this.setData({ loading: true, error: "" });
    return api
      .staffDetail(this.staffId)
      .then((row) => {
        if (!row) {
          this.setData({ loading: false, error: "这位服务人员当前不在岗或已下线" });
          return;
        }
        const staff = toView(row);
        this.setData({
          loading: false,
          error: "",
          staff: staff,
          images: staff.images,
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "服务人员加载失败，请稍后重试",
        });
      });
  },

  onRetry() {
    this.load();
  },

  previewImage(event) {
    const urls = this.data.images;
    if (!urls.length) return;
    wx.previewImage({ current: event.currentTarget.dataset.src || urls[0], urls: urls });
  },

  book() {
    if (!this.data.staff) return;
    wx.navigateTo({
      url: "/consumer/choose-time/choose-time?staffId=" + this.staffId,
    });
  },

  openServices() {
    wx.switchTab({ url: "/pages/service/service" });
  },
});
