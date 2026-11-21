const api = require("../../utils/api");
const format = require("../../utils/format");
const staff = require("../../utils/staff");

const TABS = [
  { key: "WAIT_ACCEPT", label: "待接诊" },
  { key: "ACTIVE", label: "问诊中" },
  { key: "all", label: "全部" },
];

Page({
  data: {
    loading: true,
    status: "WAIT_ACCEPT",
    tabs: TABS,
    list: [],
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
      const data = await api.staffConsults({ status: this.data.status, pageSize: 50 });
      this.setData({
        loading: false,
        list: ((data && data.list) || []).map((row) => ({
          ...row,
          statusLabel: staff.pick(staff.CONSULT_STATUS_LABELS, row.status),
          typeLabel: staff.pick(staff.CONSULT_TYPE_LABELS, row.bizType),
          timeText: format.dateTime(row.appointAt || row.createdAt),
          canAccept: row.status === "WAIT_ACCEPT",
          canFinish: ["IN_SESSION", "PRACTITIONER_REPLIED", "CUSTOMER_DONE"].indexOf(row.status) >= 0,
          canReject:
            ["WAIT_ACCEPT", "IN_SESSION", "PRACTITIONER_REPLIED", "CUSTOMER_DONE"].indexOf(row.status) >= 0,
          attachCount: (row.attachments || []).length,
        })),
      });
    } catch (error) {
      this.setData({ loading: false });
      staff.handleError(error, "问诊单加载失败");
    }
  },

  act(id, action, reason) {
    api
      .staffConsultAction({ id, action, reason: reason || "" })
      .then(() => {
        wx.showToast({ title: action === "ACCEPT" ? "已接诊" : "已处理" });
        this.load();
      })
      .catch((error) => staff.handleError(error, "操作失败"));
  },

  onPreview(e) {
    const id = e.currentTarget.dataset.id;
    const row = (this.data.list || []).filter((item) => item.id === id)[0];
    const urls = ((row && row.attachments) || [])
      .map((item) => (typeof item === "string" ? item : (item && item.url) || ""))
      .filter(Boolean);
    if (!urls.length) {
      wx.showToast({ title: "附件暂不可预览", icon: "none" });
      return;
    }
    wx.previewImage({ urls, current: urls[0] });
  },

  onAccept(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: "接诊",
      content: "接诊后请及时联系顾客，图文问诊有效期 48 小时。",
      success: (res) => {
        if (res.confirm) this.act(id, "ACCEPT");
      },
    });
  },

  onFinish(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: "完成问诊",
      editable: true,
      placeholderText: "填写问诊结论（必填）",
      success: (res) => {
        if (!res.confirm) return;
        const reason = String(res.content || "").trim();
        if (!reason) {
          wx.showToast({ title: "请填写问诊结论", icon: "none" });
          return;
        }
        this.act(id, "FINISH", reason);
      },
    });
  },

  onReject(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: "拒诊 / 取消",
      editable: true,
      placeholderText: "填写拒诊原因（必填）",
      success: (res) => {
        if (!res.confirm) return;
        const reason = String(res.content || "").trim();
        if (!reason) {
          wx.showToast({ title: "请填写拒诊原因", icon: "none" });
          return;
        }
        this.act(id, "REJECT", reason);
      },
    });
  },
});
