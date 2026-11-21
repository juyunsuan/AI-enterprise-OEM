const api = require("../../utils/api");
const format = require("../../utils/format");
const labels = require("../../utils/labels");

Page({
  data: {
    loading: true,
    service: null,
    bizLabel: "",
    priceText: "",
    originText: "",
    practitioners: [],
    practitionerId: 0,
    isConsult: false,
    actionText: "立即预约",
  },

  onLoad(options) {
    this.serviceId = Number(options.id) || 0;
    this.fromPractitionerId = Number(options.practitionerId) || 0;
    this.load();
  },

  async load() {
    try {
      const row = await api.serviceDetail(this.serviceId);
      const practitioners = ((row && row.practitioners) || []).map((item) => ({
        ...item,
        roleLabel: labels.pick(
          { DOCTOR: "医生", MANAGER: "健管师", PHARMACIST: "药师", GUIDE: "导诊师" },
          item.role,
        ),
        scoreText: item.score > 0 ? item.score.toFixed(1) : "",
        priceText: format.yuan(item.priceCents),
      }));
      let practitionerId = this.fromPractitionerId;
      if (!practitionerId && practitioners.length) practitionerId = practitioners[0].id;
      const selected = practitioners.find((item) => item.id === practitionerId);
      const isConsult = String(row.bizType || "").indexOf("CONSULT_") === 0;
      this.setData({
        loading: false,
        service: row,
        bizLabel: labels.pick(labels.BIZ_LABELS, row.bizType),
        priceText: format.yuan(selected ? selected.priceCents : row.priceCents),
        originText:
          row.originPriceCents > row.priceCents ? format.yuan(row.originPriceCents) : "",
        practitioners,
        practitionerId,
        isConsult,
        actionText: isConsult ? "立即问诊" : "立即预约",
      });
      wx.setNavigationBarTitle({ title: (row && row.name) || "服务详情" });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: (error && error.message) || "加载失败", icon: "none" });
    }
  },

  onPickPractitioner(e) {
    const practitionerId = Number(e.currentTarget.dataset.id) || 0;
    const selected = this.data.practitioners.find((item) => item.id === practitionerId);
    this.setData({
      practitionerId,
      priceText: format.yuan(selected ? selected.priceCents : this.data.service.priceCents),
    });
  },

  onAction() {
    wx.navigateTo({
      url:
        "/consumer/service/booking?serviceId=" +
        this.serviceId +
        "&practitionerId=" +
        this.data.practitionerId,
    });
  },

  onPractitioner(e) {
    wx.navigateTo({ url: "/consumer/doctor/detail?id=" + e.currentTarget.dataset.id });
  },
});
