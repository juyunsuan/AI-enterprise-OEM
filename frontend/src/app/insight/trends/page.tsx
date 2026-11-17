"use client";

import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  BgColorsOutlined,
  DeploymentUnitOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { App, Button, ConfigProvider, Space, Switch, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  EmptyState,
  Notice,
  PageHero,
  Panel,
  StatCard,
  StatGrid,
  TabStrip,
} from "@/components/ui/panel";
import {
  insightApi,
  type InsightMetricRow,
  type InsightTrendsOverview,
} from "@/api/insight";
import {
  CollectionRunsTab,
  CollectionSchedulesTab,
  CollectionSourcesTab,
} from "../_components/collection-tabs";

type TrendsView =
  | "elements"
  | "colors"
  | "quadrant"
  | "sources"
  | "schedules"
  | "runs";

const VIEWS = [
  { key: "elements", label: "元素趋势" },
  { key: "colors", label: "色彩趋势" },
  { key: "quadrant", label: "四象限联动" },
  { key: "sources", label: "采集数据源" },
  { key: "schedules", label: "采集排班" },
  { key: "runs", label: "采集批次" },
];

/** 分析页签才看数据概览；三个采集页签各自成面板，不与分析面板混排。 */
const ANALYSIS_VIEWS = new Set<TrendsView>(["elements", "colors", "quadrant"]);

function quadrantHint(interaction: number, commercial: number): string {
  const hiI = interaction >= 50;
  const hiC = commercial >= 50;
  if (hiI && hiC) return "已在爆发且卖得动：立即跟进";
  if (hiI && !hiC) return "讨论热但难转化：先做内容营销，谨慎备货";
  if (!hiI && hiC) return "闷声卖货：稳供应链，不必追热点";
  return "未起量：暂不投入";
}

export default function InsightTrendsPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const search = useSearchParams();
  const [view, setView] = useState<TrendsView>("elements");
  const [data, setData] = useState<InsightTrendsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [tagging, setTagging] = useState(false);
  const [linkageBusy, setLinkageBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData((await insightApi.trendsOverview()) as InsightTrendsOverview);
      setError("");
    } catch (e) {
      setError((e as Error)?.message || "趋势数据加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const requested = search.get("view");
    if (requested && VIEWS.some((item) => item.key === requested)) {
      setView(requested as TrendsView);
    }
    void load();
  }, [load, search]);

  const goView = (key: string) => {
    setView(key as TrendsView);
    router.replace(`/insight/trends?view=${key}`);
  };

  const tag = async () => {
    setTagging(true);
    try {
      const result = (await insightApi.tagAssets({
        body: { limit: 20 },
      })) as { scanned: number; tagged: number; mode: string; reason: string };
      message.success(
        `扫描 ${result.scanned}、打标 ${result.tagged}${
          result.reason ? `（${result.reason}）` : ""
        }`,
      );
      void load();
    } catch (e) {
      message.error((e as Error)?.message || "打标失败");
    } finally {
      setTagging(false);
    }
  };

  const toggleLinkage = async (checked: boolean) => {
    setLinkageBusy(true);
    try {
      await insightApi.saveSettings({ body: { linkageEnabled: checked } });
      message.success(checked ? "已开启双板块联动" : "已关闭双板块联动");
      void load();
    } catch (e) {
      message.error((e as Error)?.message || "设置保存失败");
    } finally {
      setLinkageBusy(false);
    }
  };

  const metricColumns: ColumnsType<InsightMetricRow> = [
    { title: "元素 / 关键词", dataIndex: "metricKey" },
    {
      title: "热度",
      dataIndex: "value",
      render: (value: number) => value.toFixed(1),
      sorter: (a, b) => a.value - b.value,
    },
    {
      title: "增速",
      dataIndex: "growthRate",
      render: (value: number) => `${value.toFixed(1)}%`,
    },
    { title: "周期", dataIndex: "period" },
  ];

  return (
    <ConfigProvider button={{ autoInsertSpace: false }}>
      <PageHero
        title="流行趋势分析"
        desc="采集与热点分析同一套模式、两份配置：本页的「采集数据源 / 采集排班 / 采集批次」只管趋势类采集目的（元素 / 色彩 / 商业选品），采集行落「电商选品观测」表；分析侧只做元素 / 色彩时序、价格带与爆款打分，以及社媒互动 × 电商商业的四象限。"
        extra={
          <Button
            icon={<ArrowLeftOutlined aria-hidden />}
            onClick={() => router.push("/insight")}
          >
            返回工具总览
          </Button>
        }
      />
      {error ? <Notice variant="error">{error}</Notice> : null}

      <TabStrip items={VIEWS} value={view} onChange={goView} style={{ marginBottom: 16 }} />

      <Space orientation="vertical" size={16} style={{ width: "100%" }}>
        {ANALYSIS_VIEWS.has(view) ? (
          <Panel
            title={
              <>
                <AppstoreOutlined aria-hidden /> 数据概览
              </>
            }
          >
            <StatGrid>
              <StatCard label="数字资产总数" value={data?.assetCount ?? 0} />
              <StatCard
                label="已打标资产"
                value={data?.taggedCount ?? 0}
                hint={
                  data && data.assetCount > 0 ? "可继续批量 VLM 打标" : "先上传素材"
                }
              />
              <StatCard
                label="双板块联动"
                value={data?.linkageEnabled ? "已开启" : "已关闭"}
                hint="关闭后四象限不出数据"
              />
              <StatCard
                label="采集数据源"
                value={data?.sourceCount ?? 0}
                hint={`启用 ${data?.enabledSourceCount ?? 0}·到「采集数据源」配置`}
              />
            </StatGrid>
          </Panel>
        ) : null}

        {view === "elements" ? (
          <Panel
            title={
              <>
                <ThunderboltOutlined aria-hidden /> 元素趋势（视觉热度时序）
              </>
            }
            extra={
              <Button type="primary" loading={tagging} onClick={() => void tag()}>
                批量 VLM 打标
              </Button>
            }
          >
            {data?.elementTrends.length ? (
              <Table
                rowKey={(r) => `${r.metricKey}-${r.period}`}
                loading={loading}
                dataSource={data.elementTrends}
                columns={metricColumns}
                pagination={{ pageSize: 20 }}
              />
            ) : (
              <EmptyState
                text="暂无元素时序数据：批量 VLM 打标后（点右上角按钮），元素热度曲线会自动生成。"
              />
            )}
          </Panel>
        ) : view === "colors" ? (
          <Panel
            title={
              <>
                <BgColorsOutlined aria-hidden /> 色彩趋势
              </>
            }
          >
            {data?.colorTrends.length ? (
              <Table
                rowKey={(r) => `${r.metricKey}-${r.period}`}
                loading={loading}
                dataSource={data.colorTrends}
                columns={metricColumns}
                pagination={{ pageSize: 20 }}
              />
            ) : (
              <EmptyState text="色彩提取（主色 / 辅色聚合与色卡）在后续批次接入。" />
            )}
          </Panel>
        ) : view === "quadrant" ? (
          <Panel
            title={
              <>
                <DeploymentUnitOutlined aria-hidden /> 概念商业化潜力四象限
              </>
            }
            extra={
              <Space wrap>
                <span className="muted text-12">双板块联动</span>
                <Switch
                  checked={Boolean(data?.linkageEnabled)}
                  loading={linkageBusy}
                  onChange={(checked) => void toggleLinkage(checked)}
                />
              </Space>
            }
          >
            {!data?.linkageEnabled ? (
              <Notice variant="info">
                联动已关闭，四象限不可用。用右上角开关开启后，社媒互动热度（热点）与电商商业热度（选品）会合并成潜力四象限。
              </Notice>
            ) : data?.quadrant.length ? (
              <Table
                rowKey="concept"
                loading={loading}
                dataSource={data.quadrant}
                pagination={false}
                columns={[
                  { title: "概念", dataIndex: "concept" },
                  {
                    title: "社媒互动热度",
                    dataIndex: "interaction",
                    render: (value: number) => value.toFixed(1),
                  },
                  {
                    title: "电商商业热度",
                    dataIndex: "commercial",
                    render: (value: number) => value.toFixed(1),
                  },
                  {
                    title: "建议动作",
                    render: (_v, record) => (
                      <Tag>{quadrantHint(record.interaction, record.commercial)}</Tag>
                    ),
                  },
                ]}
              />
            ) : (
              <EmptyState text="四象限需要既有热点（互动）又有商业观测（选品）数据的概念，采集后生成。" />
            )}
          </Panel>
        ) : view === "sources" ? (
          <CollectionSourcesTab scope="trend" onGoRuns={() => goView("runs")} />
        ) : view === "schedules" ? (
          <CollectionSchedulesTab
            scope="trend"
            onCollected={(result) => {
              message.success(result.dispatched ? "已派发采集" : result.reason);
              void load();
            }}
          />
        ) : (
          <CollectionRunsTab scope="trend" health={data} />
        )}
      </Space>
    </ConfigProvider>
  );
}
