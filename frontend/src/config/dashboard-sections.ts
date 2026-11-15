/**
 * 驾驶舱「首页板块」清单：key 必须是稳定标识（不随文案变动）。
 * 面板渲染处与「个性化设置 → 首页板块」页签共用这一份，避免出现两处口径。
 */
export const DASHBOARD_SECTION_KEYS = [
  "statistics",
  "shortcuts",
  "overview",
  "growth",
  "todos",
  "tasks",
  "attention",
  "applications",
] as const;

export type DashboardSectionKey = (typeof DASHBOARD_SECTION_KEYS)[number];

/** 板块在面板上的标题文案。 */
export const DASHBOARD_SECTION_LABELS: Record<DashboardSectionKey, string> = {
  statistics: "统计卡",
  shortcuts: "快捷导航",
  overview: "平台总览",
  growth: "增长驾驶舱",
  todos: "我的待办",
  tasks: "我的任务",
  attention: "消息与待处理",
  applications: "相关申请",
};

/** 板块说明：抽屉里给一句用途，便于判断关掉后的影响。 */
export const DASHBOARD_SECTION_HINTS: Record<DashboardSectionKey, string> = {
  statistics: "各身份最常用的数字一屏直达",
  shortcuts: "自己挑的常用入口，可增删排序",
  overview: "平台管理员的数据总览、待审与服务分布",
  growth: "近 90 天增长趋势（企业身份）",
  todos: "各板块未完结件数，点卡片去办理",
  tasks: "统一任务中心未办事项",
  attention: "与我相关的消息、待处理与申请",
  applications: "身份资质、签约与申请进度",
};

/** 与身份无关、任何身份都会渲染的板块，用于抽屉里提示「关掉后这里只剩…」。 */
export const DASHBOARD_STATIC_SECTIONS: DashboardSectionKey[] = [
  "statistics",
  "shortcuts",
  "todos",
  "tasks",
  "attention",
];
