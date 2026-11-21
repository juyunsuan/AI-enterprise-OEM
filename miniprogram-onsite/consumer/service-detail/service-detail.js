const api = require("../../utils/api");
const format = require("../../utils/format");

/** 详情只渲染接口给到的字段；车费模式只做文案说明，价格一律由后端计算。 */
function travelText(data) {
  if (data.travelFeeMode === "CUSTOM") {
    return "本服务固定车费 " + format.yuan(data.customTravelFeeCents);
  }
  return "车费按距离与所选地址计算，确认页会给出明细";
}

function toStaffCard(row) {
  const rating = Number(row.rating);
  return {
    id: row.id,
    name: row.name || "服务技师",
    avatar: row.avatar || "",
    ratingText: Number.isFinite(rating) ? rating.toFixed(1) : "",
    priceText: format.yuan(row.priceCents),
  };
}

Page({
  data: {
    loading: true,
    error: "",
    notReady: false,
    readyReason: "",
    service: null,
    images: [],
    staff: [],
    bookingEnabled: false,
  },

  onLoad(options) {
    this.serviceId = Number((options && options.serviceId) || 0);
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
        const features = shop.features || {};
        this.setData({ bookingEnabled: !!features.booking });
        return this.load();
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "服务加载失败，请稍后重试",
        });
      });
  },

  load() {
    if (!this.serviceId) {
      this.setData({ loading: false, error: "缺少服务编号，请从服务列表进入" });
      return Promise.resolve();
    }
    this.setData({ loading: true, error: "" });
    return api
      .serviceDetail(this.serviceId)
      .then((data) => {
        const row = data || {};
        const images = ((row.images && row.images.length ? row.images : [row.coverImage]) || []).filter(
          Boolean,
        );
        const rating = Number(row.rating);
        this.setData({
          loading: false,
          images: images,
          staff: ((row.staff || []) || []).map(toStaffCard),
          service: {
            id: row.id,
            title: row.title || "未命名服务",
            subtitle: row.subtitle || "",
            detail: row.detail || "",
            priceText: format.yuan(row.priceCents),
            marketText: row.marketPriceCents ? format.yuan(row.marketPriceCents) : "",
            durationText: format.duration(row.durationMinutes),
            materialText: row.materialFeeCents ? "材料费 " + format.yuan(row.materialFeeCents) : "",
            ratingText: Number.isFinite(rating) ? rating.toFixed(1) : "",
            reviewText: row.reviewCount ? row.reviewCount + " 条评价" : "",
            salesText: row.sales ? "已售 " + row.sales : "",
            highlights: (row.highlights || []).slice(0, 8),
            addonText: row.addonEnabled
              ? "支持加钟：每加 " + (row.addonUnitMinutes || 0) + " 分钟按 " + (row.addonRate || 100) + "% 计价"
              : "",
            travelText: travelText(row),
          },
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "服务加载失败，请稍后重试",
        });
      });
  },

  previewImage(event) {
    const urls = this.data.images;
    if (!urls.length) return;
    wx.previewImage({ current: event.currentTarget.dataset.src || urls[0], urls: urls });
  },

  book() {
    if (!this.data.bookingEnabled) {
      wx.showToast({ title: "店铺暂未开放预约", icon: "none" });
      return;
    }
    wx.navigateTo({
      url: "/consumer/choose-time/choose-time?serviceId=" + this.serviceId,
    });
  },

  bookStaff(event) {
    if (!this.data.bookingEnabled) {
      wx.showToast({ title: "店铺暂未开放预约", icon: "none" });
      return;
    }
    const staffId = Number(event.currentTarget.dataset.id) || 0;
    wx.navigateTo({
      url:
        "/consumer/choose-time/choose-time?serviceId=" +
        this.serviceId +
        "&staffId=" +
        staffId,
    });
  },

  openStaff(event) {
    const id = Number(event.currentTarget.dataset.id) || 0;
    if (!id) return;
    wx.navigateTo({ url: "/consumer/staff-detail/staff-detail?staffId=" + id });
  },
});
