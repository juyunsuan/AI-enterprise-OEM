const staff = require("../../utils/staff");

Page({
  data: {
    loading: true,
    errorText: "",
    card: null,
    statusLabel: "",
    windowText: "",
    ratingText: "",
    countsText: "",
    pendingProfile: false,
    online: false,
    locationEnabled: false,
    unbinding: false,
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
    if (!profile) return;
    this.apply(profile);
  },

  apply(profile) {
    const card = profile.staff || {};
    const startAt = card.serviceStartAt || "";
    const endAt = card.serviceEndAt || "";
    const windowText = startAt && endAt ? startAt + " - " + endAt + (card.crossDay ? "（跨零点）" : "") : "未设置";
    const rating = Number(card.rating || 0);
    this.setData({
      loading: false,
      card: {
        id: card.id,
        name: card.name || "",
        avatar: card.avatar || "",
        levelName: card.levelName || "",
        shopName: card.shopName || "",
        orderCountTrue: card.orderCountTrue || 0,
        reviewCount: card.reviewCount || 0,
      },
      statusLabel:
        card.status === "ONLINE" ? "在岗" : card.status === "OFF_DUTY" ? "休息中（不接单）" : card.status || "—",
      online: card.status === "ONLINE",
      locationEnabled: !!card.locationEnabled,
      windowText: windowText,
      ratingText: card.reviewCount ? rating.toFixed(1) + " 分" : "暂无评价",
      countsText: "累计完成 " + (card.orderCountTrue || 0) + " 单",
      pendingProfile: !!profile.pendingProfile,
    });
  },

  goEdit() {
    wx.navigateTo({ url: "/technician/profile-edit/profile-edit" });
  },

  goFeedback() {
    wx.navigateTo({ url: "/technician/feedback/feedback" });
  },

  goAppeal() {
    wx.navigateTo({ url: "/technician/appeal/appeal" });
  },

  goSchedule() {
    wx.navigateTo({ url: "/technician/schedule/schedule" });
  },

  unbind() {
    wx.showModal({
      title: "解绑身份",
      content: "解绑后需要重新用手机号与工号绑定才能接单，确定解绑？",
      success: (res) => {
        if (!res.confirm || this.data.unbinding) return;
        this.setData({ unbinding: true });
        staff.unbind().catch(() => {
          this.setData({ unbinding: false });
          wx.showToast({ title: "解绑失败，请稍后重试", icon: "none" });
        });
      },
    });
  },
});
