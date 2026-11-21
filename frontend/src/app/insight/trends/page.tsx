"use client";

import Image from "next/image";

import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  BgColorsOutlined,
  DeploymentUnitOutlined,
  FilePptOutlined,
  ThunderboltOutlined,
  LineChartOutlined,
  ShopOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  ConfigProvider,
  Empty,
  Input,
  Segmented,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  INSIGHT_TAG_DIMENSIONS,
  INSIGHT_TAG_DIMENSION_LABELS,
} from "@enterprise/contracts";
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
  type InsightDeckResult,
  type InsightDeriveResult,
  type InsightExportResult,
  type InsightSettings,
  type InsightTrendAnalysis,
} from "@/api/insight";
import EChart, { type EChartHandle } from "./_components/echart";
import {
  CollectionRunsTab,
  CollectionSchedulesTab,
  CollectionSourcesTab,
} from "../_components/collection-tabs";

type TrendsView =
  | "board"
  | "colors"
  | "commercial"
  | "quadrant"
  | "derive"
  | "report"
  | "sources"
  | "schedules"
  | "runs";

const VIEWS = [
  { key: "board", label: "趋势总览" },
  { key: "colors", label: "色彩趋势" },
  { key: "commercial", label: "商业·价格带" },
  { key: "quadrant", label: "红蓝海四象限" },
  { key: "derive", label: "款式衍生" },
  { key: "report", label: "AI 报告 / PPT" },
  { key: "sources", label: "采集数据源" },
  { key: "schedules", label: "采集排班" },
  { key: "runs", label: "采集批次" },
];

const ANALYSIS_VIEWS = new Set<TrendsView>([
  "board",
  "colors",
  "commercial",
  "quadrant",
  "derive",
  "report",
]);

const WINDOWS = [
  { label: "近30天", value: 30 },
  { label: "近60天", value: 60 },
  { label: "近90天", value: 90 },
  { label: "近180天", value: 180 },
];

const DIMENSION_OPTIONS = [
  { label: "全部维度", value: "" },
  ...INSIGHT_TAG_DIMENSIONS.map((dim) => ({
    label: INSIGHT_TAG_DIMENSION_LABELS[dim],
    value: dim,
  })),
];

const PALETTE = ["#0B7285", "#1F4FA3", "#E8863B", "#B9A5D0", "#6B7A3A", "#D4AF37"];

export default function InsightTrendsPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const search = useSearchParams();
  const [view, setView] = useState<TrendsView>("board");
  const [data, setData] = useState<InsightTrendAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [windowDays, setWindowDays] = useState(90);
  const [dimension, setDimension] = useState("");
  const [tagging, setTagging] = useState(false);
  const [deckBusy, setDeckBusy] = useState(false);
  const [deck, setDeck] = useState<InsightDeckResult | null>(null);
  const [deriveAnchor, setDeriveAnchor] = useState("");
  const [deriveBusy, setDeriveBusy] = useState(false);
  const [derive, setDerive] = useState<InsightDeriveResult | null>(null);
  const [withImages, setWithImages] = useState(false);
  const [refImageUrl, setRefImageUrl] = useState("");
  const [deckFormat, setDeckFormat] = useState<"pptx" | "pdf">("pptx");
  const [deckTemplate, setDeckTemplate] = useState("trend-board");
  const [autoTag, setAutoTag] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exported, setExported] = useState<InsightExportResult | null>(null);
  const [error, setError] = useState("");
  // 报告用：登记各图实例，点「生成 PPT」时回收 PNG。
  const chartHandles = useRef<Map<string, EChartHandle>>(new Map());

  const registerChart = useCallback(
    (name: string) => (handle: EChartHandle | null) => {
      if (handle) chartHandles.current.set(name, handle);
      else chartHandles.current.delete(name);
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = (await insightApi.trendAnalysis({
        query: { windowDays, ...(dimension ? { dimension } : {}) },
      })) as InsightTrendAnalysis;
      setData(result);
      setError("");
    } catch (e) {
      setError((e as Error)?.message || "趋势数据加载失败");
    } finally {
      setLoading(false);
    }
  }, [windowDays, dimension]);

  const loadSettings = useCallback(async () => {
    try {
      const s = (await insightApi.getSettings()) as InsightSettings;
      setAutoTag(Boolean(s.autoTagEnabled));
      setDeckTemplate(s.deckTemplate || "trend-board");
    } catch {
      // 设置读取失败保持默认，不打断看板
    }
  }, []);

  useEffect(() => {
    const requested = search.get("view");
    if (requested && VIEWS.some((item) => item.key === requested)) {
      setView(requested as TrendsView);
    }
    void load();
    void loadSettings();
  }, [load, loadSettings, search]);

  const toggleAutoTag = async (checked: boolean) => {
    try {
      await insightApi.saveSettings({ body: { autoTagEnabled: checked } });
      setAutoTag(checked);
      message.success(
        checked
          ? "已开启自动打标（每小时对最新素材跑一小批，会调用视觉模型）"
          : "已关闭自动打标",
      );
    } catch (e) {
      message.error((e as Error)?.message || "设置保存失败");
    }
  };

  const goView = (key: string) => {
    setView(key as TrendsView);
    router.replace(`/insight/trends?view=${key}`);
  };

  const tag = async () => {
    setTagging(true);
    try {
      const result = (await insightApi.tagAssets({
        body: { limit: 30 },
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

  const genDeck = async () => {
    setDeckBusy(true);
    try {
      const charts: { title: string; dataUrl: string }[] = [];
      for (const [title, handle] of chartHandles.current) {
        try {
          charts.push({ title, dataUrl: handle.getDataURL() });
        } catch {
          // 单图导出失败不阻断整份报告
        }
      }
      const result = (await insightApi.generateDeck({
        body: {
          windowDays,
          brandName: "流行趋势分析",
          format: deckFormat,
          template: deckTemplate,
          chartImages: charts,
        },
      })) as InsightDeckResult;
      setDeck(result);
      if (result.format === "pptx" || result.format === "pdf") {
        message.success(
          result.format === "pptx"
            ? `PPTX 已生成（${result.slideCount} 页）`
            : "PDF 打印版报告已生成，打开下载链接后「另存为 PDF」",
        );
      } else {
        message.warning(result.error || "已生成结构化大纲，渲染未就绪");
      }
    } catch (e) {
      message.error((e as Error)?.message || "报告生成失败");
    } finally {
      setDeckBusy(false);
    }
  };

  const runDerive = async () => {
    if (!deriveAnchor.trim()) {
      message.warning("请先输入衍生锚点（关键词或单品名）");
      return;
    }
    setDeriveBusy(true);
    try {
      const result = (await insightApi.deriveStyle({
        body: {
          anchor: deriveAnchor.trim(),
          windowDays,
          withImages,
          ...(refImageUrl.trim() ? { imageUrl: refImageUrl.trim() } : {}),
        },
      })) as InsightDeriveResult;
      setDerive(result);
      message.success("已生成四向衍生建议");
    } catch (e) {
      message.error((e as Error)?.message || "衍生建议生成失败");
    } finally {
      setDeriveBusy(false);
    }
  };

  const runExport = async () => {
    setExportBusy(true);
    try {
      const result = (await insightApi.trendExport({
        body: { windowDays, ...(dimension ? { dimension } : {}) },
      })) as InsightExportResult;
      setExported(result);
      if (result.downloadUrl) {
        message.success(`已导出 ${result.sheets.length} 个工作表 / ${result.rowCount} 行`);
      } else {
        message.warning(result.error || "导出未就绪");
      }
    } catch (e) {
      message.error((e as Error)?.message || "导出失败");
    } finally {
      setExportBusy(false);
    }
  };

  // ---------- 图表 option（useMemo 稳定引用，避免 echarts 反复全量重绘）----------

  const curveOption = useMemo(() => {
    const withPoints = (data?.series ?? [])
      .filter((s) => s.points.length > 1)
      .slice(0, 6);
    const periods = [
      ...new Set(withPoints.flatMap((s) => s.points.map((p) => p.period))),
    ].sort();
    return {
      tooltip: { trigger: "axis" },
      legend: { type: "scroll", top: 0 },
      grid: { left: 48, right: 24, top: 40, bottom: 48 },
      xAxis: { type: "category", data: periods },
      yAxis: { type: "value", name: "占比%" },
      dataZoom: [{ type: "inside" }, { type: "slider", bottom: 8, height: 16 }],
      series: withPoints.map((s, idx) => ({
        name: s.label,
        type: "line",
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2 },
        itemStyle: { color: s.hex || PALETTE[idx % PALETTE.length] },
        data: periods.map(
          (p) => s.points.find((pt) => pt.period === p)?.value ?? null,
        ),
      })),
    };
  }, [data]);

  const elementBarOption = useMemo(() => {
    const items = (data?.series ?? [])
      .filter((s) => s.dimension !== "color")
      .slice(0, 14);
    return {
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: 120, right: 24, top: 16, bottom: 24 },
      xAxis: { type: "value", name: "占比%" },
      yAxis: {
        type: "category",
        data: items.map((s) => s.label).reverse(),
        axisLabel: { width: 110, overflow: "truncate" },
      },
      series: [
        {
          type: "bar",
          data: items
            .map((s, idx) => ({
              value: Number(s.share.toFixed(1)),
              itemStyle: { color: PALETTE[idx % PALETTE.length] },
            }))
            .reverse(),
          label: { show: true, position: "right", formatter: "{c}%" },
        },
      ],
    };
  }, [data]);

  const colorBarOption = useMemo(() => {
    const items = (data?.colorTrends ?? []).slice(0, 16);
    return {
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: 48, right: 24, top: 16, bottom: 40 },
      xAxis: {
        type: "category",
        data: items.map((s) => s.value),
        axisLabel: { rotate: 40 },
      },
      yAxis: { type: "value", name: "占比%" },
      series: [
        {
          type: "bar",
          data: items.map((s) => ({
            value: Number(s.share.toFixed(1)),
            itemStyle: { color: s.hex || PALETTE[0] },
          })),
        },
      ],
    };
  }, [data]);

  const priceBandOption = useMemo(() => {
    const bands = data?.priceBands ?? [];
    return {
      tooltip: { trigger: "axis" },
      legend: { top: 0 },
      grid: { left: 48, right: 48, top: 40, bottom: 32 },
      xAxis: { type: "category", data: bands.map((b) => b.label) },
      yAxis: [
        { type: "value", name: "占比%", position: "left" },
        { type: "value", name: "均价", position: "right" },
      ],
      series: [
        {
          name: "占比",
          type: "bar",
          data: bands.map((b) => Number(b.share.toFixed(1))),
          itemStyle: { color: PALETTE[1] },
        },
        {
          name: "均价",
          type: "line",
          yAxisIndex: 1,
          smooth: true,
          data: bands.map((b) => Math.round(b.avgPrice)),
          itemStyle: { color: PALETTE[2] },
        },
      ],
    };
  }, [data]);

  const competitorOption = useMemo(() => {
    const rows = (data?.competitors ?? []).slice(0, 12);
    return {
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: 120, right: 24, top: 16, bottom: 24 },
      xAxis: { type: "value", name: "销量指数" },
      yAxis: {
        type: "category",
        data: rows.map((c) => c.shop).reverse(),
        axisLabel: { width: 110, overflow: "truncate" },
      },
      series: [
        {
          type: "bar",
          data: rows
            .map((c, idx) => ({
              value: Math.round(c.salesIndex),
              itemStyle: { color: PALETTE[idx % PALETTE.length] },
            }))
            .reverse(),
          label: { show: true, position: "right" },
        },
      ],
    };
  }, [data]);

  const quadrantOption = useMemo(() => {
    const pts = (data?.quadrant ?? []).map((q) => ({
      name: q.concept,
      value: [Number(q.share.toFixed(1)), Number(q.growth.toFixed(1))],
    }));
    return {
      tooltip: {
        trigger: "item",
        formatter: (p: { name?: string; value?: number[] }) =>
          `${p.name}<br/>占比 ${p.value?.[0]}% · 增速 ${p.value?.[1]}%`,
      },
      grid: { left: 56, right: 24, top: 24, bottom: 48 },
      xAxis: { type: "value", name: "销量占比%", splitLine: { show: true } },
      yAxis: { type: "value", name: "环比增速%" },
      series: [
        {
          type: "scatter",
          symbolSize: 14,
          data: pts,
          itemStyle: { color: PALETTE[0], opacity: 0.8 },
          label: {
            show: true,
            formatter: (p: { name?: string }) => p.name ?? "",
            position: "right",
            fontSize: 11,
          },
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { type: "dashed", color: "#bbb" },
            data: [{ xAxis: 50 }, { yAxis: 20 }],
          },
        },
      ],
    };
  }, [data]);

  return (
    <ConfigProvider button={{ autoInsertSpace: false }}>
      <PageHero
        title="流行趋势分析"
        desc="采集先行 → 结构化打标（色彩/廓形/长度/图案/细节/材质）→ 商业选品指标 → 多维趋势看板与 AI 报告。曲线、色卡、价格带、红蓝海四象限、竞品与方向性预测都来自你采集与打标的真实数据。"
        extra={
          <Space wrap>
            <Button
              icon={<ArrowLeftOutlined aria-hidden />}
              onClick={() => router.push("/insight")}
            >
              返回工具总览
            </Button>
          </Space>
        }
      />
      {error ? <Notice variant="error">{error}</Notice> : null}

      <TabStrip items={VIEWS} value={view} onChange={goView} style={{ marginBottom: 16 }} />

      <Space orientation="vertical" size={16} style={{ width: "100%" }}>
        {ANALYSIS_VIEWS.has(view) ? (
          <Panel title="筛选与概览">
            <Space wrap style={{ marginBottom: 12 }}>
              <Segmented
                options={WINDOWS}
                value={windowDays}
                onChange={(v) => setWindowDays(Number(v))}
              />
              <Select
                value={dimension}
                options={DIMENSION_OPTIONS}
                style={{ width: 160 }}
                onChange={(v) => setDimension(v)}
                placeholder="标签维度"
              />
              <Button
                icon={<ThunderboltOutlined aria-hidden />}
                loading={tagging}
                onClick={() => void tag()}
              >
                批量结构化打标
              </Button>
              <Space size={6}>
                <span className="muted text-12">自动打标</span>
                <Switch
                  checked={autoTag}
                  onChange={(checked) => void toggleAutoTag(checked)}
                />
              </Space>
            </Space>
            <StatGrid>
              <StatCard label="数字资产总数" value={data?.assetCount ?? 0} />
              <StatCard
                label="已打标款式"
                value={data?.taggedCount ?? 0}
                hint={data && data.assetCount > 0 ? "可继续结构化打标" : "先上传/采集素材"}
              />
              <StatCard label="商业观测聚合项" value={data?.commercialCount ?? 0} hint="价格带/关键词/店铺" />
              <StatCard label="趋势曲线数" value={data?.series.length ?? 0} />
            </StatGrid>
          </Panel>
        ) : null}

        {view === "board" ? (
          <>
            <Panel title={<><LineChartOutlined aria-hidden /> 元素趋势曲线（占比时序）</>}>
              {data && data.series.some((s) => s.points.length > 1) ? (
                <EChart option={curveOption} height={380} onReady={registerChart("元素趋势曲线")} />
              ) : (
                <EmptyState text="暂无足够周期的曲线：多次采集/打标积累周期后自动生成。" />
              )}
            </Panel>
            <Panel title={<><AppstoreOutlined aria-hidden /> 元素 / 款式标签占比</>}>
              {data?.series.length ? (
                <EChart option={elementBarOption} height={360} onReady={registerChart("元素标签占比")} />
              ) : (
                <EmptyState text="暂无标签数据：点上方「批量结构化打标」后生成。" />
              )}
            </Panel>
            <Panel title="方向性预测（基于历史占比外推）">
              {data?.predictions.length ? (
                <Table
                  rowKey={(r) => `${r.dimension}:${r.value}`}
                  size="small"
                  loading={loading}
                  dataSource={data.predictions}
                  pagination={false}
                  columns={[
                    { title: "标签", dataIndex: "label" },
                    {
                      title: "趋势",
                      dataIndex: "trend",
                      render: (v: string) => (
                        <Tag color={v === "rising" ? "green" : v === "declining" ? "red" : "default"}>
                          {v === "rising" ? "上行" : v === "declining" ? "回落" : v === "stable" ? "平稳" : "样本不足"}
                        </Tag>
                      ),
                    },
                    { title: "下期占比", dataIndex: "nextShare", render: (v: number) => `${v}%` },
                    { title: "置信", dataIndex: "confidence", render: (v: number) => `${v}%` },
                    { title: "说明", dataIndex: "note" },
                  ]}
                />
              ) : (
                <EmptyState text="打标数据积累周期后自动生成方向性预测。" />
              )}
            </Panel>
          </>
        ) : view === "colors" ? (
          <>
            <Panel title={<><BgColorsOutlined aria-hidden /> 色彩趋势（占比与时序）</>}>
              {data?.colorTrends.length ? (
                <EChart option={colorBarOption} height={340} onReady={registerChart("色彩趋势")} />
              ) : (
                <EmptyState text="暂无色彩数据：结构化打标会抽取主/辅色并聚合到色卡。" />
              )}
            </Panel>
            {data?.colorTrends.length ? (
              <Panel title="色卡墙（点击看占比与增速）">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                  {data.colorTrends.map((c) => (
                    <div
                      key={c.value}
                      style={{
                        width: 120,
                        borderRadius: 8,
                        overflow: "hidden",
                        border: "1px solid #eee",
                      }}
                    >
                      <div style={{ height: 64, background: c.hex || "#ddd" }} />
                      <div style={{ padding: "6px 8px", fontSize: 12 }}>
                        <div>{c.value}</div>
                        <div className="muted">{c.share.toFixed(1)}% · {c.growthRate.toFixed(0)}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            ) : null}
          </>
        ) : view === "commercial" ? (
          <>
            <Panel title={<><ShopOutlined aria-hidden /> 价格带分布（占比 / 均价）</>}>
              {data?.priceBands.length ? (
                <EChart option={priceBandOption} height={340} onReady={registerChart("价格带分布")} />
              ) : (
                <EmptyState text="暂无电商数据：先配置电商采集数据源并采集。" />
              )}
            </Panel>
            <Panel title="竞品店铺对比（销量指数）">
              {data?.competitors.length ? (
                <EChart option={competitorOption} height={360} onReady={registerChart("竞品店铺对比")} />
              ) : (
                <EmptyState text="暂无店铺维度数据。" />
              )}
            </Panel>
          </>
        ) : view === "quadrant" ? (
          <Panel title={<><DeploymentUnitOutlined aria-hidden /> 红蓝海四象限（销量占比 × 环比增速）</>}>
            {data?.quadrant.length ? (
              <>
                <EChart option={quadrantOption} height={420} onReady={registerChart("红蓝海四象限")} />
                <Table
                  rowKey="concept"
                  size="small"
                  style={{ marginTop: 12 }}
                  loading={loading}
                  dataSource={data.quadrant}
                  pagination={{ pageSize: 10 }}
                  columns={[
                    { title: "关键词", dataIndex: "concept" },
                    { title: "销量占比", dataIndex: "share", render: (v: number) => `${v.toFixed(1)}%` },
                    { title: "环比增速", dataIndex: "growth", render: (v: number) => `${v.toFixed(1)}%` },
                    { title: "建议", dataIndex: "hint" },
                  ]}
                />
              </>
            ) : (
              <EmptyState text="四象限需要电商关键词维度的销量与增速：采集电商数据并运行趋势重算后生成。" />
            )}
          </Panel>
        ) : view === "derive" ? (
          <Panel title="款式衍生（对标爆款衍生）">
            <Space wrap style={{ marginBottom: 12 }}>
              <Input
                placeholder="输入衍生锚点：关键词 / 单品名，如「针织连衣裙」"
                value={deriveAnchor}
                style={{ width: 320 }}
                onChange={(e) => setDeriveAnchor(e.target.value)}
                onPressEnter={() => void runDerive()}
              />
              <Button type="primary" loading={deriveBusy} onClick={() => void runDerive()}>
                生成四向衍生
              </Button>
            </Space>
            <Space wrap style={{ marginBottom: 12 }}>
              <Space size={6}>
                <span className="muted text-12">生成衍生款图（图生图，需图像模型+参考图）</span>
                <Switch checked={withImages} onChange={(v) => setWithImages(v)} />
              </Space>
              <Input
                placeholder="参考款图 URL（可选，开图生图时必填）"
                value={refImageUrl}
                style={{ width: 320 }}
                onChange={(e) => setRefImageUrl(e.target.value)}
              />
            </Space>
            {derive ? (
              <Space orientation="vertical" size={12} style={{ width: "100%" }}>
                {derive.note ? <Notice variant="info">{derive.note}</Notice> : null}
                {derive.derivedImages.length ? (
                  <Panel title="衍生款图">
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                      {derive.derivedImages.map((url, i) => (
                        <Image
                          key={i}
                          src={url}
                          alt={`衍生款${i + 1}`}
                          width={180}
                          height={180}
                          unoptimized
                          style={{ objectFit: "cover", borderRadius: 8, border: "1px solid #eee" }}
                        />
                      ))}
                    </div>
                  </Panel>
                ) : null}
                {derive.directions.map((d) => (
                  <Panel key={d.key} title={`${d.title}｜${d.angle}`}>
                    <div style={{ lineHeight: 1.8, marginBottom: 8 }}>{d.commentary}</div>
                    <Space wrap size={4}>
                      {d.evidence.length ? (
                        d.evidence.map((ev, i) => (
                          <Tag key={i} color="blue">{ev}</Tag>
                        ))
                      ) : (
                        <span className="muted text-12">（该维度暂无采集样本作证据）</span>
                      )}
                    </Space>
                  </Panel>
                ))}
              </Space>
            ) : (
              <Empty description="输入锚点后生成，四向建议依据当前采集/打标的真实占比与增速。" />
            )}
          </Panel>
        ) : view === "report" ? (
          <Panel
            title={<><FilePptOutlined aria-hidden /> AI 多页趋势报告 / PPTX</>}
            extra={
              <Space wrap>
                <Button loading={exportBusy} onClick={() => void runExport()}>
                  导出 XLSX 数据
                </Button>
                <Button type="primary" loading={deckBusy} onClick={() => void genDeck()}>
                  生成 {deckFormat === "pdf" ? "PDF" : "PPTX"} 报告
                </Button>
              </Space>
            }
          >
            <Space wrap style={{ marginBottom: 12 }}>
              <Segmented
                options={[
                  { label: "PPTX 可编辑", value: "pptx" },
                  { label: "PDF 打印版", value: "pdf" },
                ]}
                value={deckFormat}
                onChange={(v) => setDeckFormat(v as "pptx" | "pdf")}
              />
              <Select
                value={deckTemplate}
                style={{ width: 200 }}
                onChange={(v) => setDeckTemplate(v)}
                options={[
                  { label: "内置·数据看板", value: "trend-board" },
                  { label: "内置·趋势企划", value: "trend-planning" },
                  { label: "内置·品牌提案", value: "brand" },
                ]}
              />
            </Space>
            {exported?.downloadUrl ? (
              <Notice variant="success">
                数据表已导出（{exported.sheets.join(" / ")}，共 {exported.rowCount} 行）：{" "}
                <Button type="link" href={exported.downloadUrl} target="_blank">
                  下载 XLSX
                </Button>
              </Notice>
            ) : exported?.error ? (
              <Notice variant="warn">{exported.error}</Notice>
            ) : null}
            <Notice variant="info">
              报告由平台后端调用 AI 直接生成（非采集端），并把当前看板各图导出为高清 PNG 一并拼入
              PPTX。生成后可在数字资产中下载。先切到其它页签累积图表后再回来生成，配图更全。
            </Notice>
            {deck ? (
              <Space orientation="vertical" size={12} style={{ width: "100%", marginTop: 12 }}>
                <Space wrap>
                  <Tag color={deck.format === "pptx" || deck.format === "pdf" ? "green" : "orange"}>
                    {deck.format === "pptx"
                      ? `已生成 PPTX · ${deck.slideCount} 页`
                      : deck.format === "pdf"
                        ? "已生成 PDF 打印版（打开后另存为 PDF）"
                        : `结构化大纲 · ${deck.outline.length} 节`}
                  </Tag>
                  {deck.downloadUrl ? (
                    <Button type="link" href={deck.downloadUrl} target="_blank">
                      下载
                    </Button>
                  ) : null}
                </Space>
                {deck.error ? <Notice variant="warn">{deck.error}</Notice> : null}
                {deck.outline.map((section, idx) => (
                  <Panel key={idx} title={`${idx + 1}. ${section.heading}`}>
                    <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>
                      {section.body}
                    </div>
                  </Panel>
                ))}
              </Space>
            ) : (
              <Empty description="尚未生成报告，点右上「生成 PPT 报告」。" />
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
