const api = require("../../utils/api");
const format = require("../../utils/format");
const session = require("../../utils/session");
const staff = require("../../utils/staff");

const NAV = [
  { key: "consults", label: "问诊接单", desc: "接诊、拒诊与填写结论", url: "/practitioner/consult/list" },
  { key: "ai", label: "AI 医护", desc: "问 AI 客服，查资料与话术", url: "/practitioner/ai/index" },
  { key: "patients", label: "我的就诊人", desc: "档案、指标与随访记录", url: "/practitioner/patient/list" },
  { key: "followups", label: "随访任务", desc: "执行随访与补录指标", url: "/practitioner/followup/list" },
  { key: "prescriptions", label: "处方复核", desc: "药师/店长审核处方", url: "/practitioner/prescription/list" },
  { key: "schedule", label: "排班与号源", desc: "查看班次、停诊单个号源", url: "/practitioner/schedule/index" },
  { key: "verify", label: "核销", desc: "输入核销码完成到店服务", url: "/practitioner/verify/index" },
  { key: "income", label: "收益与提现", desc: "分成明细、银行卡与提现", url: "/practitioner/income/index" },
  { key: "articles", label: "科普投稿", desc: "撰写文章，等待店主审核", url: "/practitioner/article/list" },
];

Page({
  data: {
    loading: true,
    profile: null,
    stats: [],
    shifts: [],
    slots: [],
    nav: NAV,
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  async load() {
    try {
      await staff.requireStaff();
      const [data, ai] = await Promise.all([
        api.staffWorkbench(),
        // AI 状态只用于决定入口显示；取不到就保留入口，进页面仍能说明原因。
        api.staffAiStatus().catch(() => null),
      ]);
      const profile = (data && data.practitioner) || null;
      if (profile) session.setStaffToken(session.getStaffToken(), profile);
      const stats = (data && data.stats) || {};
      this.setData({
        loading: false,
        profile,
        nav: NAV.filter((item) => item.key !== "ai" || staff.aiEntryVisible(ai)),
        stats: [
          { key: "consults", label: "待接诊", value: stats.activeConsults || 0, tone: "orange" },
          { key: "pending", label: "待随访", value: stats.pendingFollowups || 0, tone: "orange" },
          { key: "overdue", label: "已逾期", value: stats.overdueFollowups || 0, tone: "red" },
          { key: "patients", label: "就诊人", value: stats.patients || 0, tone: "" },
          { key: "rx", label: "待复核", value: stats.pendingPrescriptions || 0, tone: "orange" },
          { key: "alerts", label: "预警", value: stats.openAlerts || 0, tone: "red" },
          { key: "slots", label: "今日号源", value: stats.todaySlotCount || 0, tone: "blue" },
          { key: "income", label: "可提现", value: format.yuan(stats.settleableCents || 0), tone: "blue" },
        ],
        shifts: ((data && data.todayShifts) || []).map((row) => ({
          ...row,
          text: row.startText + "-" + row.endText + " · " + row.totalQuota + " 个号",
        })),
        slots: ((data && data.todaySlots) || []).map((row) => ({
          ...row,
          text: row.startTime + "-" + row.endTime,
          statusLabel: staff.pick(staff.SLOT_STATUS_LABELS, row.status),
        })),
      });
    } catch (error) {
      this.setData({ loading: false });
      staff.handleError(error, "工作台加载失败");
    }
  },

  onNav(e) {
    const url = e.currentTarget.dataset.url;
    if (url) wx.navigateTo({ url });
  },

  onLogout() {
    wx.showModal({
      title: "退出医护登录",
      content: "退出后需重新输入手机号与执业证号绑定。",
      success: (res) => {
        if (!res.confirm) return;
        session.clearStaffToken();
        wx.redirectTo({ url: "/practitioner/bind/index" });
      },
    });
  },
});
