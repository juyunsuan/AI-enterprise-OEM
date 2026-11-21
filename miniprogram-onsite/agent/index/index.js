const agent = require("../../utils/agent");
const format = require("../../utils/format");

/**
 * 代理工作台：先看「我这层拿到的钱」，再进台账与订单。
 * 统计口径全部来自后端（`agent-api/profile`）：累计/待生效/本月佣金，
 * 绑定顾客数按当前有效绑定关系计；待打款只对区域代理有（提现单落在代理账上）。
 */
const SHORTCUTS = [
  { key: "commission", label: "佣金台账", desc: "逐单可核", url: "/agent/commission/commission" },
  { key: "orders", label: "我的订单", desc: "名下有佣金的单", url: "/agent/order-list/order-list" },
  { key: "refunds", label: "退款记录", desc: "退款同步冲销佣金", url: "/agent/refund-list/refund-list" },
  { key: "technicians", label: "服务人员", desc: "本店在岗技师", url: "/agent/technician-list/technician-list" },
  { key: "change", label: "更换服务人员", desc: "待接单订单可改派", url: "/agent/change-staff/change-staff" },
  { key: "apply", label: "招募技师", desc: "提交后由店主审核", url: "/agent/technician-apply/technician-apply" },
  { key: "poster", label: "分享海报", desc: "带店铺码的推广图", url: "/agent/poster/poster" },
];

Page({
  data: {
    loading: true,
    identity: null,
    stats: [],
    shortcuts: SHORTCUTS,
    errorText: "",
  },

  onLoad() {
    this.gate = agent.ensureAgent();
  },

  async onShow() {
    const gate = this.gate || agent.ensureAgent();
    this.gate = null;
    let profile = null;
    try {
      profile = await gate;
    } catch (error) {
      wx.showToast({ title: (error && error.message) || "登录失败，请稍后重试", icon: "none" });
      return;
    }
    if (!profile) return;
    this.applyProfile(profile);
  },

  onPullDownRefresh() {
    agent
      .ensureAgent()
      .then((profile) => {
        if (profile) this.applyProfile(profile);
      })
      .catch(() => undefined)
      .then(() => wx.stopPullDownRefresh());
  },

  applyProfile(profile) {
    const identity = profile.identity || {};
    const stats = profile.stats || {};
    const cards = [
      { key: "commission", label: "累计佣金", value: format.yuan(stats.commissionCents), hint: stats.orderCount + " 单" },
      { key: "pending", label: "待生效", value: format.yuan(stats.pendingCommissionCents), hint: "订单付款后生效" },
      { key: "month", label: "本月佣金", value: format.yuan(stats.monthCommissionCents) },
      { key: "customers", label: "绑定顾客", value: String(stats.customerCount || 0), hint: "有效绑定" },
    ];
    if (identity.role === "AGENT") {
      cards.push({
        key: "withdraw",
        label: "待打款提现",
        value: format.yuan(stats.pendingWithdrawCents),
        hint: "由店主审核打款",
      });
    }
    this.setData({ loading: false, identity: identity, stats: cards });
  },

  openShortcut(event) {
    const url = event.currentTarget.dataset.url;
    if (url) wx.navigateTo({ url: url });
  },

  unbind() {
    wx.showModal({
      title: "解绑代理身份",
      content: "解绑后需要重新用手机号绑定才能查看佣金。",
      success(res) {
        if (res.confirm) agent.unbind();
      },
    });
  },
});
