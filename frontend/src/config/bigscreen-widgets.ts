import type { DashboardBigscreen } from "@enterprise/contracts";
import type { DashboardStatistic } from "@/api/dashboard";

/**
 * 经营看板（数据大屏）可选内容清单：设置页与全屏大屏共用这一份，
 * 增删图表只改这里；页面按 key 渲染，偏好里存的就是这些 key。
 */

export type BigscreenWidgetGroup = "kpi" | "business" | "growth" | "risk";

export type BigscreenWidget = {
  key: string;
  label: string;
  hint: string;
  group: BigscreenWidgetGroup;
  /** 业务类型图表：取数来源（与驾驶舱统计同口径）。 */
  statistic?: DashboardStatistic;
  /** 状态文案域（见 lib/status.ts）与类目可见性域（见 dashboard-scope）。 */
  domain?: string;
  /** 只有企业身份能取到增长链路数据。 */
  enterpriseOnly?: boolean;
  /** 签约数据只有企业 / 服务商身份可取。 */
  contractScope?: boolean;
};

export const BIGSCREEN_GROUPS: {
  key: BigscreenWidgetGroup;
  label: string;
  hint: string;
}[] = [
  {
    key: "kpi",
    label: "核心指标",
    hint: "屏幕顶部的数字卡：任务、签约、目标、回款等最常用的一眼数字。",
  },
  {
    key: "business",
    label: "业务类型图表",
    hint: "按每一项业务的单据状态做环图：选了哪一项，大屏就展示哪一项的状态分布。",
  },
  {
    key: "growth",
    label: "增长分析",
    hint: "增长漏斗与回款趋势，只有企业身份能取到这些数据。",
  },
  {
    key: "risk",
    label: "风险提示",
    hint: "当前需要关注的风险与提醒，适合放在前台大屏提示团队。",
  },
];

export const BIGSCREEN_WIDGETS: BigscreenWidget[] = [
  { key: "kpi.pending", label: "未办任务", hint: "任务中心待办与处理中", group: "kpi" },
  { key: "kpi.todo", label: "待办来源合计", hint: "各业务来源未办件数合计", group: "kpi" },
  { key: "kpi.contracts", label: "生效签约", hint: "已生效的服务签约", group: "kpi", contractScope: true },
  { key: "kpi.goal", label: "目标进度", hint: "OKR 平均完成度", group: "kpi", enterpriseOnly: true },
  { key: "kpi.collection", label: "回款金额", hint: "窗口内累计回款", group: "kpi", enterpriseOnly: true },
  { key: "kpi.projects", label: "交付中项目", hint: "进行中的项目数", group: "kpi", enterpriseOnly: true },
  { key: "kpi.leads", label: "获客转化", hint: "线索转客户数", group: "kpi", enterpriseOnly: true },

  { key: "biz.tax", label: "财税申报", hint: "按申报状态分布", group: "business", statistic: "declarations", domain: "tax" },
  { key: "biz.overseas", label: "跨境出海", hint: "按出海服务单状态分布", group: "business", statistic: "overseas", domain: "overseas" },
  { key: "biz.logistics", label: "物流工单", hint: "按物流工单状态分布", group: "business", statistic: "logistics", domain: "logistics" },
  { key: "biz.smart", label: "IT 服务", hint: "按 IT 服务单状态分布", group: "business", statistic: "smart", domain: "smart" },
  { key: "biz.legal", label: "法律需求", hint: "按法律需求状态分布", group: "business", statistic: "legal", domain: "legal" },
  { key: "biz.ip", label: "知识产权", hint: "按知产需求状态分布", group: "business", statistic: "ip", domain: "ip" },
  { key: "biz.flex", label: "灵活用工", hint: "按用工需求状态分布", group: "business", statistic: "flexWo", domain: "flex" },
  { key: "biz.onboarding", label: "用工进件", hint: "按进件审核状态分布", group: "business", statistic: "onboardings", domain: "flex" },
  { key: "biz.marketing", label: "营销需求", hint: "按营销需求状态分布", group: "business", statistic: "marketing", domain: "marketing" },
  { key: "biz.supplyOrders", label: "供销订货", hint: "按订货单状态分布", group: "business", statistic: "supplyOrders", domain: "supply" },
  { key: "biz.supplyBookings", label: "供销预约", hint: "按预约单状态分布", group: "business", statistic: "supplyBookings", domain: "supply" },
  { key: "biz.asset", label: "资产交易", hint: "按资产需求状态分布", group: "business", statistic: "asset", domain: "asset" },

  { key: "growth.funnel", label: "增长漏斗", hint: "线索 → 客户 → 机会 → 签约 → 回款", group: "growth", enterpriseOnly: true },
  { key: "growth.trend", label: "回款趋势", hint: "近 12 个月回款走势", group: "growth", enterpriseOnly: true },

  { key: "risk.alerts", label: "风险提醒", hint: "目标、交付、回款等风险条目", group: "risk", enterpriseOnly: true },
];

export const BIGSCREEN_WIDGET_MAP: Record<string, BigscreenWidget> = Object.fromEntries(
  BIGSCREEN_WIDGETS.map((widget) => [widget.key, widget]),
);

/** 默认展示：核心数字 + 六类主业务 + 增长与风险，企业身份打开即可用。 */
export const DEFAULT_BIGSCREEN_CONFIG: DashboardBigscreen = {
  title: "企业经营数据大屏",
  subtitle: "实时经营概览 · 数据每 60 秒自动刷新",
  widgets: [
    "kpi.pending",
    "kpi.contracts",
    "kpi.goal",
    "kpi.collection",
    "biz.tax",
    "biz.overseas",
    "biz.logistics",
    "biz.smart",
    "biz.marketing",
    "biz.supplyOrders",
    "growth.funnel",
    "growth.trend",
    "risk.alerts",
  ],
};

/** 当前身份能不能用这一项（类目未开通 / 非企业身份的增长数据不出现）。 */
export function bigscreenWidgetAvailable(
  widget: BigscreenWidget,
  identity: string,
  domains: string[],
): boolean {
  if (widget.enterpriseOnly) return identity === "ENTERPRISE_USER";
  if (widget.contractScope) {
    return identity === "ENTERPRISE_USER" || identity === "SERVICE_PROVIDER";
  }
  if (widget.group === "business") {
    return Boolean(widget.domain) && domains.includes(widget.domain!);
  }
  return true;
}
