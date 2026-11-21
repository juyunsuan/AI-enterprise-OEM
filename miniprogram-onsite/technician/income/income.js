const api = require("../../utils/api");
const staff = require("../../utils/staff");
const format = require("../../utils/format");

/**
 * 技师收入：四本账分开看，不能把「应发」当「已发」。
 *   1. 服务毛收入：已完成/已签收/已评价订单的实付金额；
 *   2. 承担佣金：这单按分账规则从我收入里扣出去的部分；
 *   3. 合伙人佣金：我作为技师合伙人从其他订单里分到的钱；
 *   4. 结算：店主按周期生成，净额待打款/已打款。
 */
const TABS = [
  { key: "commission", label: "合伙人佣金" },
  { key: "borne", label: "承担扣减" },
  { key: "settlement", label: "结算记录" },
];

const COMMISSION_STATUS = {
  PENDING: "未生效",
  ACTIVE: "已生效",
  REVERSED: "已冲销",
};
const SETTLEMENT_STATUS = {
  PENDING: "待打款",
  PAID: "已打款",
  REVERSED: "已回滚",
};

const PAGE_SIZE = 20;

Page({
  data: {
    loading: true,
    staffName: "",
    levelName: "",
    monthLabel: "",
    cards: [],
    tabs: TABS,
    activeKey: "commission",
    list: [],
    page: 1,
    total: 0,
    finished: false,
    errorText: "",
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
    await this.refresh();
  },

  onPullDownRefresh() {
    this.refresh().then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.finished || this.data.loading) return;
    this.fetchList(this.data.page + 1);
  },

  switchTab(event) {
    const key = event.currentTarget.dataset.key;
    if (!key || key === this.data.activeKey) return;
    this.setData({ activeKey: key, list: [], page: 1, finished: false });
    this.fetchList(1);
  },

  async refresh() {
    this.setData({ loading: true, errorText: "" });
    try {
      const overview = await api.staffIncomeOverview();
      const staffCard = overview.staff || {};
      this.setData({
        loading: false,
        staffName: staffCard.name || "",
        levelName: staffCard.levelName || "",
        monthLabel: overview.monthLabel || "",
        cards: [
          { key: "pending", label: "待打款净额", value: format.yuan(overview.pendingSettleCents), hint: "店主生成结算单后打款" },
          { key: "paid", label: "已打款", value: format.yuan(overview.paidSettleCents), hint: "累计已结算" },
          { key: "monthGross", label: "本月毛收入", value: format.yuan(overview.monthGrossCents), hint: overview.monthOrderCount + " 单" },
          { key: "gross", label: "累计毛收入", value: format.yuan(overview.grossCents), hint: overview.orderCount + " 单" },
          { key: "borne", label: "累计承担佣金", value: format.yuan(overview.borneCents), hint: "从技师收入扣除" },
          { key: "partner", label: "合伙人佣金", value: format.yuan(overview.partnerCommissionCents), hint: "作为合伙人分得" },
        ],
      });
    } catch (error) {
      this.setData({
        loading: false,
        errorText: (error && error.message) || "收入加载失败",
      });
      return;
    }
    await this.fetchList(1);
  },

  async fetchList(page) {
    this.setData({ loading: true, errorText: "" });
    try {
      const key = this.data.activeKey;
      const result =
        key === "commission"
          ? await api.staffIncomeCommissions({ page: page, pageSize: PAGE_SIZE })
          : key === "borne"
            ? await api.staffIncomeBorne({ page: page, pageSize: PAGE_SIZE })
            : await api.staffIncomeSettlements({ page: page, pageSize: PAGE_SIZE });
      const rows = (result && result.list) || [];
      const list =
        key === "settlement"
          ? rows.map((row) => ({
              id: row.id,
              title: format.shortTime(row.periodStart) + " ~ " + format.shortTime(row.periodEnd),
              meta: row.orderCount + " 单 · 毛收入 " + format.yuan(row.grossCents),
              amountText: format.yuan(row.netCents),
              statusText: SETTLEMENT_STATUS[row.status] || row.status,
              tone:
                row.status === "PAID"
                  ? "tag-green"
                  : row.status === "REVERSED"
                    ? "tag-red"
                    : "tag-orange",
              hint: row.status === "PENDING" ? "净额 = 毛收入 − 承担佣金" : "",
            }))
          : rows.map((row) => ({
              id: row.id,
              title: row.orderNo || "订单 " + row.orderId,
              meta: format.shortTime(row.createdAt) + (row.totalRate ? " · 费率 " + row.totalRate + "%" : ""),
              amountText: format.yuan(row.amountCents),
              statusText: COMMISSION_STATUS[row.status] || row.status,
              tone:
                row.status === "ACTIVE"
                  ? "tag-green"
                  : row.status === "REVERSED"
                    ? "tag-red"
                    : "tag-orange",
              hint: Number(row.reversedCents) ? "已冲销 " + format.yuan(row.reversedCents) : "",
            }));
      const merged = page > 1 ? this.data.list.concat(list) : list;
      const total = (result && result.total) || 0;
      this.setData({
        loading: false,
        list: merged,
        total: total,
        page: page,
        finished: merged.length >= total,
      });
    } catch (error) {
      this.setData({
        loading: false,
        errorText: (error && error.message) || "明细加载失败",
      });
    }
  },
});
