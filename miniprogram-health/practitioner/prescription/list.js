const api = require("../../utils/api");
const format = require("../../utils/format");
const staff = require("../../utils/staff");
const session = require("../../utils/session");

const TABS = [
  { key: "SUBMITTED", label: "待复核" },
  { key: "all", label: "全部" },
];

Page({
  data: {
    loading: true,
    status: "SUBMITTED",
    tabs: TABS,
    list: [],
    canReview: false,
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  onTab(e) {
    this.setData({ status: e.currentTarget.dataset.key, loading: true, list: [] });
    this.load();
  },

  async load() {
    try {
      await staff.requireStaff();
      const profile = session.getStaffProfile() || {};
      const data = await api.staffPrescriptions({ status: this.data.status, pageSize: 50 });
      this.setData({
        loading: false,
        canReview: ["PHARMACIST", "MANAGER"].indexOf(profile.role) >= 0,
        list: ((data && data.list) || []).map((row) => ({
          ...row,
          statusLabel: staff.pick(staff.RX_STATUS_LABELS, row.status),
          amountText: format.yuan(row.totalCents),
          timeText: format.dateTime(row.createdAt),
          itemsText: (row.items || [])
            .map((item) => item.name + " ×" + item.quantity + (item.spec ? "（" + item.spec + "）" : ""))
            .join("；"),
        })),
      });
    } catch (error) {
      this.setData({ loading: false });
      staff.handleError(error, "处方加载失败");
    }
  },

  review(id, approved, reason) {
    api
      .staffReviewPrescription({ id, approved, reason: reason || "" })
      .then(() => {
        wx.showToast({ title: approved ? "已通过" : "已驳回" });
        this.load();
      })
      .catch((error) => staff.handleError(error, "复核失败"));
  },

  onApprove(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: "通过处方",
      content: "确认药品与用法用量无误，通过后进入待取药/配送环节。",
      success: (res) => {
        if (res.confirm) this.review(id, true, "");
      },
    });
  },

  onReject(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: "驳回处方",
      editable: true,
      placeholderText: "填写驳回原因（必填）",
      success: (res) => {
        if (!res.confirm) return;
        const reason = String(res.content || "").trim();
        if (!reason) {
          wx.showToast({ title: "请填写驳回原因", icon: "none" });
          return;
        }
        this.review(id, false, reason);
      },
    });
  },
});
