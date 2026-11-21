"use client";

import {
  AimOutlined,
  ArrowLeftOutlined,
  FileTextOutlined,
  FundOutlined,
  ProfileOutlined,
  TableOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  ConfigProvider,
  Drawer,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  INSIGHT_PLATFORMS,
  INSIGHT_PLATFORM_LABELS,
  INSIGHT_STAGE_LABELS,
  INSIGHT_STAGES,
} from "@enterprise/contracts";
import {
  EmptyState,
  Notice,
  PageHero,
  Panel,
  PillTabs,
  StatCard,
  StatGrid,
  TabStrip,
} from "@/components/ui/panel";
import {
  insightApi,
  type InsightHotspotRow,
  type InsightHotspotContentRow,
  type InsightOverview,
  type InsightReportRow,
} from "@/api/insight";
import {
  CollectionRunsTab,
  CollectionSchedulesTab,
  CollectionSourcesTab,
} from "../_components/collection-tabs";

type HotspotTab =
  | "board"
  | "sources"
  | "subscriptions"
  | "runs"
  | "list"
  | "ledger"
  | "report";

const TABS = [
  { key: "board", label: "热点大盘" },
  { key: "sources", label: "采集数据源" },
  { key: "subscriptions", label: "垂类订阅" },
  { key: "runs", label: "采集批次" },
  { key: "list", label: "热点榜单" },
  { key: "ledger", label: "热点台账" },
  { key: "report", label: "热点快报" },
];

const STAGE_COLOR: Record<string, string> = {
  emerging: "gold",
  rising: "green",
  peak: "red",
  declining: "default",
};

function platformLabel(key: string): string {
  return INSIGHT_PLATFORM_LABELS[key] ?? key;
}

export default function InsightHotspotPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const [tab, setTab] = useState<HotspotTab>("board");
  const [overview, setOverview] = useState<InsightOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      setOverview((await insightApi.overview()) as InsightOverview);
      setLoadError("");
    } catch (error) {
      setLoadError((error as Error)?.message || "智慧分析初始化失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested && TABS.some((item) => item.key === requested)) {
      setTab(requested as HotspotTab);
    }
    void loadOverview();
  }, [loadOverview]);

  const goTab = (key: string) => {
    setTab(key as HotspotTab);
    router.replace(`/insight/hotspot?tab=${key}`);
  };

  const ledgerTableId = overview?.presetTables.find(
    (item) => item.key === "hotspotLedger",
  )?.dataTableId;
  const contentTableId = overview?.presetTables.find(
    (item) => item.key === "content",
  )?.dataTableId;

  return (
    <ConfigProvider button={{ autoInsertSpace: false }}>
      <PageHero
        title="全域内容热点分析"
        desc="先配「采集数据源」与采集 SKILL 包 → 定时 / 手动采集进「热点内容」表 → 再做大盘 / 榜单 / 台账 / 快报分析。采集优先走 AWBotDSH 主机托管窗口，本机浏览器代理作备用。"
        extra={
          <Button
            icon={<ArrowLeftOutlined aria-hidden />}
            onClick={() => router.push("/insight")}
          >
            返回工具总览
          </Button>
        }
      />

      {loadError ? <Notice variant="error">{loadError}</Notice> : null}

      <TabStrip items={TABS} value={tab} onChange={goTab} style={{ marginBottom: 16 }} />

      {tab === "board" ? (
        <BoardTab
          overview={overview}
          loading={loading}
          onGoSubscriptions={() => goTab("subscriptions")}
          onGoSources={() => goTab("sources")}
        />
      ) : tab === "sources" ? (
        <CollectionSourcesTab scope="hotspot" onGoRuns={() => goTab("runs")} />
      ) : tab === "list" ? (
        <HotspotListTab />
      ) : tab === "subscriptions" ? (
        <CollectionSchedulesTab
          scope="hotspot"
          onCollected={(result) => {
            message.success(result.dispatched ? "已派发采集" : result.reason);
            void loadOverview();
          }}
        />
      ) : tab === "runs" ? (
        <CollectionRunsTab scope="hotspot" health={overview} />
      ) : tab === "ledger" ? (
        <LedgerTab
          ledgerTableId={ledgerTableId}
          contentTableId={contentTableId}
        />
      ) : (
        <ReportTab />
      )}
    </ConfigProvider>
  );
}

// ---------- 大盘 ----------

function BoardTab({
  overview,
  loading,
  onGoSubscriptions,
  onGoSources,
}: {
  overview: InsightOverview | null;
  loading: boolean;
  onGoSubscriptions: () => void;
  onGoSources: () => void;
}) {
  const channels = overview?.deviceChannels ?? [];
  const allOffline = channels.length > 0 && channels.every((c) => !c.online);
  const stageTotal = overview
    ? Object.values(overview.stageCounts).reduce((a, b) => a + b, 0)
    : 0;
  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      {allOffline ? (
        <Notice variant="warn">
          主备采集通道当前都离线：请到「Agent-Bot」打开 AWBotDSH 主机托管窗口，或在本机「RPA」安装浏览器代理后再采集。
        </Notice>
      ) : null}

      <Panel
        title={
          <>
            <FundOutlined aria-hidden /> 数据概览
          </>
        }
      >
        <StatGrid>
          <StatCard
            label="采集数据源"
            value={overview?.sourceCount ?? 0}
            hint={`启用 ${overview?.enabledSourceCount ?? 0}·无数据源不采集`}
          />
          <StatCard
            label="近 24h 采集批次"
            value={overview?.runCount24h ?? 0}
            hint={
              (overview?.failedRunCount24h ?? 0) > 0
                ? `失败 ${overview?.failedRunCount24h} 轮`
                : overview?.lastRunAt
                  ? `最近一轮 ${new Date(overview.lastRunAt).toLocaleString()}`
                  : "还没跑过采集"
            }
          />
          <StatCard
            label="订阅总数"
            value={overview?.subscriptionCount ?? 0}
            hint={`启用 ${overview?.activeSubscriptionCount ?? 0}`}
          />
          <StatCard
            label="内容条数"
            value={overview?.contentCount ?? 0}
            hint="「热点内容」表内本账号行"
          />
          <StatCard
            label="热点数"
            value={overview?.hotspotCount ?? 0}
            hint="按话题 / 关键词聚合"
          />
          <StatCard
            label="在线采集通道"
            value={channels.filter((c) => c.online).length}
            hint={channels.map((c) => `${c.label}${c.online ? "·在线" : "·离线"}`).join(" / ")}
          />
        </StatGrid>
      </Panel>

      <Panel
        title={
          <>
            <ProfileOutlined aria-hidden /> 热点阶段分布
          </>
        }
        extra={<span className="muted text-12">共 {stageTotal} 个热点</span>}
      >
        {stageTotal ? (
          <Space wrap size={8}>
            {INSIGHT_STAGES.map((stage) => (
              <Tag key={stage} color={STAGE_COLOR[stage]}>
                {INSIGHT_STAGE_LABELS[stage]}：{overview?.stageCounts[stage] ?? 0}
              </Tag>
            ))}
          </Space>
        ) : (
          <EmptyState
            text={
              loading
                ? "加载中…"
                : (overview?.sourceCount ?? 0) === 0
                  ? "还没有采集数据源：先配数据源与采集包，采集回来的内容才会进「热点内容」表"
                  : "暂无热点，请先在「垂类订阅」挂载数据源并采集"
            }
            action={
              (overview?.sourceCount ?? 0) === 0 ? (
                <Button type="primary" onClick={onGoSources}>
                  去配数据源
                </Button>
              ) : (
                <Button type="primary" onClick={onGoSubscriptions}>
                  去配置订阅
                </Button>
              )
            }
          />
        )}
      </Panel>

      <Panel
        title={
          <>
            <AimOutlined aria-hidden /> 近期互动热度 Top 5
          </>
        }
      >
        {overview?.topTrends.length ? (
          <Table
            pagination={false}
            rowKey={(row) => `${row.metricKey}-${row.period}`}
            dataSource={overview.topTrends}
            columns={[
              { title: "关键词 / 话题", dataIndex: "metricKey" },
              { title: "周期", dataIndex: "period" },
              {
                title: "热度",
                dataIndex: "value",
                render: (value: number) => value.toFixed(1),
              },
              {
                title: "增速",
                dataIndex: "growthRate",
                render: (value: number) => `${value.toFixed(1)}%`,
              },
            ]}
          />
        ) : (
          <EmptyState text="暂无时序数据，聚合调度按小时刷新" />
        )}
      </Panel>
    </Space>
  );
}

// ---------- 榜单 ----------

const STAGE_FILTERS = [
  { key: "all", label: "全部" },
  ...INSIGHT_STAGES.map((s) => ({ key: s, label: INSIGHT_STAGE_LABELS[s] })),
];

function HotspotListTab() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<InsightHotspotRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [stage, setStage] = useState<string>();
  const [platform, setPlatform] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<{
    hotspot: InsightHotspotRow;
    contents: InsightHotspotContentRow[];
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<number[]>([]);
  const [mergeTarget, setMergeTarget] = useState<number>();
  const [hotspotOptions, setHotspotOptions] = useState<InsightHotspotRow[]>([]);
  const [reviewing, setReviewing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = (await insightApi.hotspots({
        query: { page, pageSize, stage, platform },
      })) as { list: InsightHotspotRow[]; total: number };
      setRows(data.list);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, stage, platform]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (id: number) => {
    setDetailLoading(true);
    setSelectedRowIds([]);
    setMergeTarget(undefined);
    try {
      setDetail(
        (await insightApi.hotspotDetail({
          params: { id: String(id) },
        })) as {
          hotspot: InsightHotspotRow;
          contents: InsightHotspotContentRow[];
        },
      );
      const all = (await insightApi.hotspots({
        query: { page: 1, pageSize: 100 },
      })) as { list: InsightHotspotRow[] };
      setHotspotOptions(all.list.filter((item) => item.id !== id));
    } finally {
      setDetailLoading(false);
    }
  };

  const doReview = async (
    action: "ignore" | "restore" | "merge" | "split",
    extra: Record<string, unknown> = {},
  ) => {
    if (!detail) return;
    setReviewing(true);
    try {
      await insightApi.reviewHotspot({
        params: { id: String(detail.hotspot.id) },
        body: { action, ...extra },
      });
      message.success(
        action === "ignore"
          ? "已标记非热点"
          : action === "restore"
            ? "已恢复为有效热点"
            : action === "merge"
              ? "已并入目标热点"
              : "已拆分为新热点",
      );
      void load();
      if (action === "merge" || action === "split") setDetail(null);
      else void openDetail(detail.hotspot.id);
    } catch (error) {
      message.error((error as Error)?.message || "纠偏失败");
    } finally {
      setReviewing(false);
    }
  };

  const columns: ColumnsType<InsightHotspotRow> = useMemo(
    () => [
      { title: "热点名称", dataIndex: "name", ellipsis: true },
      {
        title: "覆盖平台",
        dataIndex: "platforms",
        render: (value: string[]) => value.map(platformLabel).join("/"),
      },
      {
        title: "阶段",
        dataIndex: "stage",
        render: (value: string) => (
          <Tag color={STAGE_COLOR[value]}>{INSIGHT_STAGE_LABELS[value] ?? value}</Tag>
        ),
      },
      {
        title: "得分",
        dataIndex: "hotScore",
        render: (value: number) => value.toFixed(1),
        sorter: (a, b) => a.hotScore - b.hotScore,
      },
      {
        title: "增速",
        dataIndex: "growthRate",
        render: (value: number) => `${value.toFixed(1)}%`,
      },
      { title: "内容数", dataIndex: "contentCount" },
      {
        title: "操作",
        render: (_v, record) => (
          <Button type="link" onClick={() => void openDetail(record.id)}>
            详情
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <Panel
      title={
        <>
          <TableOutlined aria-hidden /> 热点榜单
        </>
      }
      extra={<span className="muted text-12">共 {total} 条</span>}
    >
      <Space orientation="vertical" size={12} style={{ width: "100%" }}>
        <PillTabs
          variant="soft"
          items={STAGE_FILTERS}
          value={stage ?? "all"}
          onChange={(key) => {
            setStage(key === "all" ? undefined : key);
            setPage(1);
          }}
        />
        <Space wrap>
          <Select
            allowClear
            placeholder="平台"
            style={{ width: 140 }}
            value={platform}
            onChange={(value) => {
              setPlatform(value);
              setPage(1);
            }}
            options={INSIGHT_PLATFORMS.map((p) => ({
              value: p,
              label: INSIGHT_PLATFORM_LABELS[p],
            }))}
          />
        </Space>

        <Table
          rowKey="id"
          loading={loading}
          dataSource={rows}
          columns={columns}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (next, nextSize) => {
              setPage(next);
              setPageSize(nextSize);
            },
          }}
        />
      </Space>

      <Drawer
        open={Boolean(detail) || detailLoading}
        onClose={() => setDetail(null)}
        title={detail?.hotspot.name ?? "热点详情"}
        size="large"
        loading={detailLoading}
      >
        {detail ? (
          <Space orientation="vertical" size={16} style={{ width: "100%" }}>
            <Space wrap size={8}>
              <Tag color={STAGE_COLOR[detail.hotspot.stage]}>
                {INSIGHT_STAGE_LABELS[detail.hotspot.stage] ?? detail.hotspot.stage}
              </Tag>
              <span className="muted text-12">
                所属订阅：{detail.hotspot.subscriptionName || "自动聚合"} · 首发平台：
                {platformLabel(detail.hotspot.firstPlatform)} · 内容数：
                {detail.hotspot.contentCount}
              </span>
              {detail.hotspot.reviewNote ? <Tag>已标记非热点</Tag> : null}
            </Space>
            <p className="muted text-12">
              关联关键词：{detail.hotspot.keywords.join("、") || "—"}
            </p>

            <Panel
              title="聚类纠偏"
              titleExtra="只改聚合结果，不动「热点内容」原始采集行；纠偏过的热点在重算时受保护"
            >
              <Space wrap>
                {detail.hotspot.reviewNote ? (
                  <Button
                    loading={reviewing}
                    onClick={() => void doReview("restore")}
                  >
                    恢复为有效热点
                  </Button>
                ) : (
                  <Button
                    danger
                    loading={reviewing}
                    onClick={() => void doReview("ignore")}
                  >
                    标记非热点
                  </Button>
                )}
                <Button
                  disabled={!selectedRowIds.length}
                  loading={reviewing}
                  onClick={() => void doReview("split", { rowIds: selectedRowIds })}
                >
                  拆分所选为新热点
                </Button>
                <Select
                  placeholder="并入到…"
                  style={{ width: 200 }}
                  value={mergeTarget}
                  onChange={setMergeTarget}
                  options={hotspotOptions.map((item) => ({
                    value: item.id,
                    label: item.name,
                  }))}
                />
                <Button
                  disabled={!mergeTarget}
                  loading={reviewing}
                  onClick={() => void doReview("merge", { targetId: mergeTarget })}
                >
                  合并
                </Button>
              </Space>
            </Panel>

            <Table
              rowKey="rowId"
              dataSource={detail.contents}
              pagination={false}
              rowSelection={{
                selectedRowKeys: selectedRowIds,
                onChange: (keys) => setSelectedRowIds(keys.map(Number)),
              }}
              columns={[
                {
                  title: "标题",
                  dataIndex: "title",
                  ellipsis: true,
                  render: (value: string, record) =>
                    record.url ? (
                      <a href={record.url} target="_blank" rel="noreferrer">
                        {value || "（无标题）"}
                      </a>
                    ) : (
                      value || "（无标题）"
                    ),
                },
                { title: "作者", dataIndex: "author", width: 120 },
                { title: "点赞", dataIndex: "likes", width: 80 },
              ]}
            />
          </Space>
        ) : null}
      </Drawer>
    </Panel>
  );
}

// ---------- 台账 ----------

function LedgerTab({
  ledgerTableId,
  contentTableId,
}: {
  ledgerTableId?: number;
  contentTableId?: number;
}) {
  const { message } = App.useApp();
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const sync = async () => {
    setSyncing(true);
    try {
      const result = (await insightApi.syncLedger()) as {
        synced: number;
        url: string;
        reason: string;
      };
      message.success(
        result.synced
          ? `已同步 ${result.synced} 条热点到台账`
          : result.reason || "暂无热点可同步",
      );
      if (result.url) router.push(result.url);
    } catch (error) {
      message.error((error as Error)?.message || "同步失败");
    } finally {
      setSyncing(false);
    }
  };
  return (
    <Panel
      title={
        <>
          <FileTextOutlined aria-hidden /> 热点台账
        </>
      }
      titleExtra="系统列按当期 upsert，你自定义的业务列不会被覆盖"
    >
      <Space wrap>
        <Button type="primary" loading={syncing} onClick={() => void sync()}>
          同步当前热点到台账
        </Button>
        <Button
          disabled={!ledgerTableId}
          onClick={() => router.push(`/data-table?table=${ledgerTableId ?? ""}`)}
        >
          打开「热点追踪台账」
        </Button>
        <Button
          disabled={!contentTableId}
          onClick={() => router.push(`/data-table?table=${contentTableId ?? ""}`)}
        >
          打开「热点内容」表
        </Button>
      </Space>
      {!ledgerTableId ? (
        <Notice variant="info">
          台账表将在你首次进入大盘 / 订阅时自动创建。
        </Notice>
      ) : null}
    </Panel>
  );
}

// ---------- 快报 ----------

function ReportTab() {
  const { message } = App.useApp();
  const router = useRouter();
  const [rows, setRows] = useState<InsightReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [windowDays, setWindowDays] = useState(7);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await insightApi.listReports()) as InsightReportRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = async () => {
    setGenerating(true);
    try {
      const report = (await insightApi.generateReport({
        body: { kind: "hotspot", windowDays },
      })) as InsightReportRow;
      message.success(
        report.error ? `已生成（${report.error}）` : "快报已生成并归档数字资产",
      );
      void load();
    } catch (error) {
      message.error((error as Error)?.message || "生成失败");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Panel
      title={
        <>
          <FileTextOutlined aria-hidden /> 热点快报
        </>
      }
      extra={
        <Space wrap>
          <Select
            value={windowDays}
            style={{ width: 120 }}
            onChange={setWindowDays}
            options={[
              { value: 1, label: "日报" },
              { value: 7, label: "周报" },
              { value: 30, label: "月报" },
            ]}
          />
          <Button type="primary" loading={generating} onClick={() => void generate()}>
            生成快报
          </Button>
        </Space>
      }
    >
      <Table
        rowKey="id"
        loading={loading}
        dataSource={rows}
        pagination={{ pageSize: 10 }}
        columns={[
          {
            title: "生成时间",
            dataIndex: "createdAt",
            render: (value: string) => new Date(value).toLocaleString(),
          },
          {
            title: "窗口",
            dataIndex: "window",
            render: (value: Record<string, string>) =>
              `${(value.from || "").slice(0, 10)} ~ ${(value.to || "").slice(0, 10)}`,
          },
          {
            title: "状态",
            dataIndex: "status",
            render: (value: string) => <Tag>{value}</Tag>,
          },
          {
            title: "操作",
            render: (_v, record) => (
              <Space wrap>
                {record.assetId ? (
                  <Button
                    type="link"
                    onClick={() => router.push(`/assets?asset=${record.assetId}`)}
                  >
                    查看归档
                  </Button>
                ) : null}
                <Button
                  type="link"
                  onClick={() =>
                    Modal.info({
                      title: "快报正文",
                      width: 720,
                      content: (
                        <pre
                          style={{
                            whiteSpace: "pre-wrap",
                            maxHeight: 480,
                            overflow: "auto",
                          }}
                        >
                          {record.content}
                        </pre>
                      ),
                    })
                  }
                >
                  预览
                </Button>
              </Space>
            ),
          },
        ]}
      />
      <Notice variant="info">
        快报经统一模型网关生成（未绑定 Key 时按数据摘要生成规则式快报），产物自动登记进数字资产。
      </Notice>
    </Panel>
  );
}
