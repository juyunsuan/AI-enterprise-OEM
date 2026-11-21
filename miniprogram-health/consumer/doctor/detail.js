const api = require("../../utils/api");
const format = require("../../utils/format");
const labels = require("../../utils/labels");

const WAY_SERVICES = [
  { key: "TEXT", label: "图文问诊", bizType: "CONSULT_TEXT" },
  { key: "PHONE", label: "电话问诊", bizType: "CONSULT_PHONE" },
  { key: "VIDEO", label: "视频问诊", bizType: "CONSULT_VIDEO" },
];

Page({
  data: {
    loading: true,
    doctor: null,
    services: [],
    reviews: [],
    wayServices: WAY_SERVICES,
    way: "TEXT",
  },

  onLoad(options) {
    this.doctorId = Number(options.id) || 0;
    let way = (options && options.way) || "";
    if (!way) {
      try {
        way = wx.getStorageSync("health:consultWay") || "TEXT";
      } catch (e) {
        way = "TEXT";
      }
    }
    this.setData({ way: WAY_SERVICES.some((item) => item.key === way) ? way : "TEXT" });
    this.load();
  },

  async load() {
    try {
      const row = await api.practitionerDetail(this.doctorId);
      this.setData({
        loading: false,
        doctor: {
          ...row,
          roleLabel: labels.pick(
            { DOCTOR: "医生", MANAGER: "健管师", PHARMACIST: "药师", GUIDE: "导诊师" },
            row.role,
          ),
        },
        services: ((row && row.services) || []).map((item) => ({
          ...item,
          bizLabel: labels.pick(labels.BIZ_LABELS, item.bizType),
          priceText: format.yuan(item.priceCents),
        })),
        reviews: ((row && row.reviews) || []).map((item) => ({
          ...item,
          timeText: format.dateOnly(item.createdAt),
          stars: "★★★★★".slice(0, Math.max(0, Math.min(5, item.score))),
        })),
      });
      wx.setNavigationBarTitle({ title: (row && row.name) || "医护详情" });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: (error && error.message) || "加载失败", icon: "none" });
    }
  },

  onService(e) {
    const serviceId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: "/consumer/service/detail?id=" + serviceId + "&practitionerId=" + this.doctorId,
    });
  },

  onBook(e) {
    const { serviceId, practitionerId } = e.currentTarget.dataset;
    wx.navigateTo({
      url:
        "/consumer/service/booking?serviceId=" +
        serviceId +
        "&practitionerId=" +
        (practitionerId || this.doctorId),
    });
  },

  onQuickWay(e) {
    const bizType = e.currentTarget.dataset.biz;
    const matched = this.data.services.filter((item) => item.bizType === bizType);
    if (!matched.length) {
      wx.showToast({ title: "该医护暂未开通此问诊方式", icon: "none" });
      return;
    }
    wx.navigateTo({
      url:
        "/consumer/service/booking?serviceId=" +
        matched[0].serviceId +
        "&practitionerId=" +
        this.doctorId,
    });
  },
});
