"use client";

import { dashboardBigscreenSchema, type DashboardBigscreen } from "@enterprise/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { contractsApi } from "@/api/contracts";
import { dashboardApi, type DashboardStatistic } from "@/api/dashboard";
import { growthApi } from "@/api/growth";
import { taskCenterApi } from "@/api/task-center";
import { uiPreferencesApi } from "@/api/ui-preferences";
import {
  BIGSCREEN_WIDGET_MAP,
  DEFAULT_BIGSCREEN_CONFIG,
  bigscreenWidgetAvailable,
  type BigscreenWidget,
} from "@/config/bigscreen-widgets";
import { dashboardScope } from "@/lib/dashboard-scope";
import { useSession } from "@/lib/session";
import { resolveStatus } from "@/lib/status";
import { useBusinessQueries, useBusinessQuery } from "@/query/business";
import { ScreenChart } from "../_components/screen-chart";
import "../bigscreen.css";

const PREFERENCE_KEY = "dashboard.bigscreen";
const REFRESH_MS = 60_000;
const DONUT_COLORS = [
  "#22d3ee",
  "#38bdf8",
  "#818cf8",
  "#a78bfa",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#94a3b8",
];
const FUNNEL_COLORS = ["#22d3ee", "#38bdf8", "#60a5fa", "#818cf8", "#a78bfa"];

type BizWidget = BigscreenWidget & { statistic: DashboardStatistic };

const money = (value: string | number | undefined) => {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "—";
  if (Math.abs(num) >= 1e8) return `¥${(num / 1e8).toFixed(2)}亿`;
  if (Math.abs(num) >= 1e4) return `¥${(num / 1e4).toFixed(1)}万`;
  return `¥${num.toFixed(0)}`;
};

function donutOption(rows: { name: string; value: number }[], total: number) {
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      backgroundColor: "rgba(5,20,36,.94)",
      borderColor: "rgba(56,189,248,.35)",
      textStyle: { color: "#d9f4ff", fontSize: 12 },
    },
    legend: {
      type: "scroll",
      orient: "vertical",
      right: 2,
      top: "middle",
      itemWidth: 8,
      itemHeight: 8,
      itemGap: 9,
      textStyle: { color: "#7fb6d6", fontSize: 11, width: 88, overflow: "truncate" },
    },
    title: {
      text: `${total}`,
      subtext: "总量",
      left: "33%",
      top: "41%",
      textAlign: "center",
      textStyle: { color: "#e8fbff", fontSize: 26, fontWeight: 700 },
      subtextStyle: { color: "#5f8fb3", fontSize: 11 },
    },
    series: [
      {
        type: "pie",
        radius: ["56%", "80%"],
        center: ["33%", "52%"],
        minAngle: 4,
        avoidLabelOverlap: true,
        itemStyle: { borderColor: "rgba(3,10,20,.92)", borderWidth: 2, borderRadius: 3 },
        label: { show: false },
        labelLine: { show: false },
        emphasis: {
          scaleSize: 6,
          itemStyle: { shadowBlur: 18, shadowColor: "rgba(34,211,238,.5)" },
        },
        data: rows.map((row, index) => ({
          ...row,
          itemStyle: { color: DONUT_COLORS[index % DONUT_COLORS.length] },
        })),
      },
    ],
  };
}

function funnelOption(funnel: { label: string; value: number }[]) {
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      backgroundColor: "rgba(5,20,36,.94)",
      borderColor: "rgba(56,189,248,.35)",
      textStyle: { color: "#d9f4ff", fontSize: 12 },
    },
    series: [
      {
        type: "funnel",
        left: "4%",
        right: "4%",
        top: 6,
        bottom: 6,
        minSize: "16%",
        gap: 6,
        label: {
          show: true,
          position: "inside",
          color: "#04121f",
          fontSize: 11.5,
          fontWeight: 600,
        },
        itemStyle: { borderWidth: 0, opacity: 0.92 },
        data: funnel.map((item, index) => ({
          name: item.label,
          value: item.value,
          itemStyle: { color: FUNNEL_COLORS[index % FUNNEL_COLORS.length] },
        })),
      },
    ],
  };
}

function trendOption(trend: { month: string; paidAmount: string }[]) {
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(5,20,36,.94)",
      borderColor: "rgba(56,189,248,.35)",
      textStyle: { color: "#d9f4ff", fontSize: 12 },
    },
    grid: { left: 46, right: 16, top: 22, bottom: 28 },
    xAxis: {
      type: "category",
      data: trend.map((item) => `${item.month.slice(5)}月`),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "rgba(56,189,248,.3)" } },
      axisLabel: { color: "#6f9ab8", fontSize: 10 },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: "rgba(56,189,248,.12)" } },
      axisLabel: {
        color: "#6f9ab8",
        fontSize: 10,
        formatter: (value: number) =>
          value >= 10000 ? `${(value / 10000).toFixed(0)}万` : String(value),
      },
    },
    series: [
      {
        type: "line",
        smooth: true,
        symbol: "circle",
        symbolSize: 5,
        data: trend.map((item) => Number(item.paidAmount || 0)),
        lineStyle: {
          width: 2.4,
          color: "#22d3ee",
          shadowBlur: 16,
          shadowColor: "rgba(34,211,238,.7)",
        },
        itemStyle: { color: "#22d3ee", borderColor: "#06101f", borderWidth: 1 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(34,211,238,.42)" },
              { offset: 1, color: "rgba(34,211,238,0)" },
            ],
          },
        },
      },
    ],
  };
}

/** 时钟单独成组件：把每秒一次的刷新限制在局部，避免整屏图表重绘。 */
function ScreenClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (!now) return <div className="bs-clock" />;
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    <div className="bs-clock">
      <strong>{`${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`}</strong>
      <span>{`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} · 前台大屏`}</span>
    </div>
  );
}

/** 经营看板（数据大屏）：深色全屏、60 秒自动刷新，按设置页勾选的内容渲染。 */
export default function BigscreenViewPage() {
  const router = useRouter();
  const client = useQueryClient();
  const { me } = useSession();
  const scope = useMemo(() => dashboardScope(me), [me]);
  const identity = me?.currentIdentity || "ENTERPRISE_USER";
  const isEnterprise = identity === "ENTERPRISE_USER";

  const [config, setConfig] = useState<DashboardBigscreen>(DEFAULT_BIGSCREEN_CONFIG);
  const [ready, setReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const row = await uiPreferencesApi.get({ params: { key: PREFERENCE_KEY } });
        const parsed = dashboardBigscreenSchema.safeParse(row?.value);
        if (alive && parsed.success) {
          setConfig({ ...DEFAULT_BIGSCREEN_CONFIG, ...parsed.data });
        }
      } catch {
        // 读不到偏好就按默认大屏展示
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [me?.userId]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const activeWidgets = useMemo(
    () =>
      config.widgets
        .map((key) => BIGSCREEN_WIDGET_MAP[key])
        .filter((widget): widget is BigscreenWidget => Boolean(widget))
        .filter((widget) => bigscreenWidgetAvailable(widget, identity, scope.domains)),
    [config.widgets, identity, scope.domains],
  );
  const bizWidgets = useMemo(
    () =>
      activeWidgets.filter(
        (widget): widget is BizWidget => widget.group === "business" && Boolean(widget.statistic),
      ),
    [activeWidgets],
  );
  const kpiWidgets = activeWidgets.filter((widget) => widget.group === "kpi");
  const growthWidgets = activeWidgets.filter((widget) => widget.group === "growth");
  const riskWidgets = activeWidgets.filter((widget) => widget.group === "risk");

  const wantsTasks = kpiWidgets.some((widget) => ["kpi.pending", "kpi.todo"].includes(widget.key));
  const wantsContracts = kpiWidgets.some((widget) => widget.key === "kpi.contracts");
  const wantsGrowth = activeWidgets.some((widget) => widget.enterpriseOnly);

  const tasksQuery = useBusinessQuery(
    "bigscreen",
    "tasks",
    {},
    (signal) => taskCenterApi.summary({}, { signal }),
    "all",
    Boolean(me) && wantsTasks,
    { refetchInterval: REFRESH_MS },
  );
  const contractsQuery = useBusinessQuery(
    "bigscreen",
    "contracts",
    {},
    (signal) => contractsApi.stats({}, { signal }),
    "all",
    Boolean(me) && wantsContracts,
    { refetchInterval: REFRESH_MS },
  );
  const growthQuery = useBusinessQuery(
    "bigscreen",
    "growth",
    {},
    (signal) => growthApi.cockpit({ query: { days: 90 } }, { signal }),
    "all",
    Boolean(me) && isEnterprise && wantsGrowth,
    { refetchInterval: REFRESH_MS },
  );
  const statisticQueries = useBusinessQueries(
    "bigscreen",
    bizWidgets.map((widget) => ({
      resource: `stat.${widget.statistic}`,
      params: {},
      load: (signal: AbortSignal) => dashboardApi.statistic(widget.statistic, signal),
    })),
    { refetchInterval: REFRESH_MS },
  );

  const growth = growthQuery.data;
  const queryErrors = [
    tasksQuery.error,
    contractsQuery.error,
    growthQuery.error,
    ...statisticQueries.map((query) => query.error),
  ].filter((error): error is Error => Boolean(error));

  const kpiOf = (key: string): { value: string | number; hint: string } => {
    switch (key) {
      case "kpi.pending":
        return { value: tasksQuery.data?.pending ?? "—", hint: "任务中心待办与处理中" };
      case "kpi.todo":
        return {
          value: tasksQuery.data
            ? tasksQuery.data.bySource.reduce((sum, item) => sum + item.count, 0)
            : "—",
          hint: "各业务来源未办件数",
        };
      case "kpi.contracts":
        return {
          value: contractsQuery.data?.active ?? "—",
          hint: contractsQuery.data ? `待确认 ${contractsQuery.data.pending}` : "已生效的服务签约",
        };
      case "kpi.goal":
        return growth
          ? {
              value: `${Number(growth.goals.avgProgress).toFixed(1)}%`,
              hint: `${growth.goals.objectives} 个目标 · ${growth.goals.atRisk} 个滞后`,
            }
          : { value: "—", hint: "OKR 平均完成度" };
      case "kpi.collection":
        return growth
          ? {
              value: money(growth.sales.paidAmount),
              hint: `合同 ${money(growth.sales.contractAmount)}`,
            }
          : { value: "—", hint: "窗口内累计回款" };
      case "kpi.projects":
        return growth
          ? {
              value: growth.delivery.activeProjects,
              hint: `${growth.delivery.openTasks} 个任务在办`,
            }
          : { value: "—", hint: "交付中项目" };
      case "kpi.leads":
        return growth
          ? {
              value: growth.acquisition.converted,
              hint: `${growth.acquisition.leads} 条线索 · 已触达 ${growth.acquisition.contacted}`,
            }
          : { value: "—", hint: "线索转客户" };
      default:
        return { value: "—", hint: "" };
    }
  };

  const refresh = () => {
    void client.invalidateQueries({
      predicate: (query) => query.queryKey[4] === "bigscreen",
    });
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen().catch(() => {
        // 浏览器拒绝时不做处理（部分环境禁用全屏 API）
      });
    }
  };

  return (
    <div className="bs-screen">
      <header className="bs-head">
        <div className="bs-head-meta">
          <span className="bs-live-dot" />
          <span>实时经营数据</span>
        </div>
        <div className="bs-title">
          <h1>{config.title.trim() || "企业经营数据大屏"}</h1>
          <p>{config.subtitle.trim() || "实时经营概览 · 数据每 60 秒自动刷新"}</p>
        </div>
        <div className="bs-head-right">
          <ScreenClock />
          <div className="bs-actions">
            <button type="button" className="bs-btn" onClick={refresh}>
              刷新
            </button>
            <button type="button" className="bs-btn" onClick={toggleFullscreen}>
              {isFullscreen ? "退出全屏" : "全屏"}
            </button>
            <button
              type="button"
              className="bs-btn bs-btn-primary"
              onClick={() => router.push("/dashboard/bigscreen")}
            >
              返回设置
            </button>
          </div>
        </div>
      </header>

      {!ready ? (
        <div className="bs-empty" style={{ minHeight: 320 }}>
          正在读取大屏设置…
        </div>
      ) : (
        <>
          {queryErrors.length ? (
            <div className="bs-banner">
              {`部分数据加载失败：${queryErrors[0].message}（已展示可用部分，页面每 60 秒自动重试）`}
            </div>
          ) : null}

          {activeWidgets.length === 0 ? (
            <div className="bs-banner">
              还没有选择要展示的内容：请先在「经营看板设置」里勾选核心指标与业务图表。
            </div>
          ) : null}

          {kpiWidgets.length ? (
            <div className="bs-kpis">
              {kpiWidgets.map((widget) => {
                const kpi = kpiOf(widget.key);
                return (
                  <div key={widget.key} className="bs-kpi">
                    <div className="bs-kpi-label">{widget.label}</div>
                    <div className="bs-kpi-value">{kpi.value}</div>
                    <div className="bs-kpi-hint">{kpi.hint}</div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {bizWidgets.length ? (
            <div className="bs-grid">
              {bizWidgets.map((widget, index) => {
                const data = statisticQueries[index]?.data;
                const rows = Object.entries(data?.byStatus || {})
                  .filter(([, count]) => count > 0)
                  .sort((left, right) => right[1] - left[1])
                  .map(([status, count]) => ({
                    name: resolveStatus(widget.domain, status).label,
                    value: count,
                  }));
                const total = rows.reduce((sum, row) => sum + row.value, 0);
                return (
                  <div key={widget.key} className="bs-panel">
                    <div className="bs-panel-head">
                      <span className="bs-panel-title">{widget.label}</span>
                      <span className="bs-panel-extra">按状态分布</span>
                    </div>
                    {rows.length ? (
                      <ScreenChart
                        className="bs-chart"
                        option={donutOption(rows, total)}
                      />
                    ) : (
                      <div className="bs-empty">暂无数据</div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}

          {growthWidgets.length || riskWidgets.length ? (
            <div className="bs-grid-growth">
              {growthWidgets.map((widget) => {
                if (widget.key === "growth.funnel") {
                  return (
                    <div key={widget.key} className="bs-panel">
                      <div className="bs-panel-head">
                        <span className="bs-panel-title">{widget.label}</span>
                        <span className="bs-panel-extra">近 90 天</span>
                      </div>
                      {growth?.funnel.length ? (
                        <ScreenChart
                          className="bs-chart-lg"
                          option={funnelOption(growth.funnel)}
                        />
                      ) : (
                        <div className="bs-empty">
                          {growthQuery.error ? "数据暂不可用" : "暂无漏斗数据"}
                        </div>
                      )}
                    </div>
                  );
                }
                return (
                  <div key={widget.key} className="bs-panel">
                    <div className="bs-panel-head">
                      <span className="bs-panel-title">{widget.label}</span>
                      <span className="bs-panel-extra">
                        {growth?.trend.length ? `近 ${growth.trend.length} 个月` : "近 12 个月"}
                      </span>
                    </div>
                    {growth?.trend.length ? (
                      <ScreenChart
                        className="bs-chart-lg"
                        option={trendOption(growth.trend)}
                      />
                    ) : (
                      <div className="bs-empty">
                        {growthQuery.error ? "数据暂不可用" : "暂无回款数据"}
                      </div>
                    )}
                  </div>
                );
              })}
              {riskWidgets.map((widget) => (
                <div key={widget.key} className="bs-panel">
                  <div className="bs-panel-head">
                    <span className="bs-panel-title">{widget.label}</span>
                    <span className="bs-panel-extra">
                      {growth?.alerts.length ? `共 ${growth.alerts.length} 条` : "当前无风险"}
                    </span>
                  </div>
                  {growth?.alerts.length ? (
                    <div className="bs-risk-list">
                      {growth.alerts.slice(0, 8).map((alert, index) => (
                        <div
                          key={`${alert.title}-${index}`}
                          className={`bs-risk-item${alert.level === "WARNING" ? " warn" : ""}`}
                        >
                          <div>
                            <b>{alert.title}</b>
                            <span>{alert.detail}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bs-empty">
                      {growthQuery.error ? "数据暂不可用" : "当前没有需要处理的风险"}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}

      <footer className="bs-foot">
        <span>经营看板 · 数据每 60 秒自动刷新</span>
        <span>按「经营看板设置」展示 · 全屏适合前台大屏循环播放</span>
      </footer>
    </div>
  );
}
