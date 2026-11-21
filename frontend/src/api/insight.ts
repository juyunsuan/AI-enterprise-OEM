import { endpoints } from "@enterprise/contracts";
import type {
  InsightCollectionScope,
  InsightSubscriptionRow,
  InsightCollectionSourceRow,
  InsightCollectionRunRow,
  InsightCollectionSkillRow,
  InsightHotspotRow,
  InsightHotspotContentRow,
  InsightMetricRow,
  InsightFdeAnalysis,
  InsightFdeAnalysisSummary,
  InsightConsultingAnalysis,
  InsightConsultingAnalysisSummary,
} from "@enterprise/contracts";
import { endpoint } from "./endpoint";

export type {
  InsightCollectionScope,
  InsightSubscriptionRow,
  InsightCollectionSourceRow,
  InsightCollectionRunRow,
  InsightCollectionSkillRow,
  InsightHotspotRow,
  InsightHotspotContentRow,
  InsightMetricRow,
  InsightFdeAnalysis,
  InsightFdeAnalysisSummary,
  InsightConsultingAnalysis,
  InsightConsultingAnalysisSummary,
};

/** 采集健康度：两侧总览同一组字段，各数自己那组采集目的下的源头与批次。 */
export type InsightCollectionHealth = {
  sourceCount: number;
  enabledSourceCount: number;
  runCount24h: number;
  failedRunCount24h: number;
  lastRunAt: string;
};

export type InsightOverview = InsightCollectionHealth & {
  subscriptionCount: number;
  activeSubscriptionCount: number;
  contentCount: number;
  hotspotCount: number;
  stageCounts: Record<string, number>;
  topTrends: InsightMetricRow[];
  deviceChannels: { kind: string; label: string; online: boolean }[];
  presetTables: {
    key: string;
    tableName: string;
    dataTableId: number;
    exists: boolean;
    fieldCount: number;
  }[];
  ready: boolean;
};

export type InsightCollectResult = {
  dispatched: boolean;
  reason: string;
  goal: string;
  entryPath: string;
};

export type InsightReportRow = {
  id: number;
  kind: string;
  status: string;
  assetId: string;
  content: string;
  error: string;
  window: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

export type InsightTagResult = {
  scanned: number;
  tagged: number;
  model: string;
  mode: string;
  reason: string;
};

export type InsightLedgerSyncResult = {
  synced: number;
  tableId: number;
  url: string;
  reason: string;
};

export type InsightTrendsOverview = InsightCollectionHealth & {
  assetCount: number;
  taggedCount: number;
  elementTrends: InsightMetricRow[];
  colorTrends: InsightMetricRow[];
  quadrant: { concept: string; interaction: number; commercial: number }[];
  linkageEnabled: boolean;
};

export type InsightHotspotPage = {
  list: InsightHotspotRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type InsightTrendPoint = { period: string; value: number; growthRate: number };
export type InsightTrendSeries = {
  dimension: string;
  value: string;
  label: string;
  hex: string;
  share: number;
  growthRate: number;
  points: InsightTrendPoint[];
};
export type InsightTrendAnalysis = InsightCollectionHealth & {
  window: { from: string; to: string; days: number };
  assetCount: number;
  taggedCount: number;
  commercialCount: number;
  series: InsightTrendSeries[];
  colorTrends: InsightTrendSeries[];
  priceBands: {
    key: string;
    label: string;
    count: number;
    share: number;
    avgPrice: number;
    salesIndex: number;
    growthRate: number;
  }[];
  quadrant: {
    concept: string;
    interaction: number;
    commercial: number;
    growth: number;
    share: number;
    hint: string;
  }[];
  competitors: {
    shop: string;
    count: number;
    avgPrice: number;
    salesIndex: number;
    hotScore: number;
  }[];
  predictions: {
    dimension: string;
    value: string;
    label: string;
    trend: string;
    nextShare: number;
    confidence: number;
    note: string;
  }[];
  linkageEnabled: boolean;
};
export type InsightDeckResult = {
  id: number;
  status: string;
  format: string;
  assetId: string;
  downloadUrl: string;
  slideCount: number;
  error: string;
  outline: { heading: string; body: string }[];
  createdAt: string;
};
export type InsightDeriveResult = {
  anchor: string;
  category: string;
  directions: {
    key: string;
    title: string;
    angle: string;
    commentary: string;
    evidence: string[];
  }[];
  derivedImages: string[];
  note: string;
};
export type InsightExportResult = {
  format: string;
  assetId: string;
  downloadUrl: string;
  sheets: string[];
  rowCount: number;
  error: string;
};
export type InsightSettings = {
  linkageEnabled: boolean;
  autoTagEnabled: boolean;
  contentTableId: number;
  ledgerTableId: number;
  ecomTableId: number;
  wearTableId: number;
  reportWindowDays: number;
  deckTemplate: string;
  deckBrand: Record<string, unknown>;
  scoreConfig: Record<string, unknown>;
};

export const insightApi = {
  overview: endpoint(endpoints.Insight_overview),
  subscriptions: endpoint(endpoints.Insight_listSubscriptions),
  saveSubscription: endpoint(endpoints.Insight_saveSubscription),
  removeSubscription: endpoint(endpoints.Insight_removeSubscription),
  toggleSubscription: endpoint(endpoints.Insight_toggleSubscription),
  collectNow: endpoint(endpoints.Insight_collectNow),
  sources: endpoint(endpoints.Insight_listSources),
  saveSource: endpoint(endpoints.Insight_saveSource),
  removeSource: endpoint(endpoints.Insight_removeSource),
  runs: endpoint(endpoints.Insight_listRuns),
  collectionSkills: endpoint(endpoints.Insight_listSkills),
  hotspots: endpoint(endpoints.Insight_listHotspots),
  hotspotDetail: endpoint(endpoints.Insight_hotspotDetail),
  metrics: endpoint(endpoints.Insight_listMetrics),
  trendsOverview: endpoint(endpoints.Insight_trendsOverview),
  trendAnalysis: endpoint(endpoints.Insight_trendAnalysis),
  generateDeck: endpoint(endpoints.Insight_generateDeck, { timeoutMs: 180000 }),
  deriveStyle: endpoint(endpoints.Insight_deriveStyle, { timeoutMs: 120000 }),
  trendExport: endpoint(endpoints.Insight_trendExport, { timeoutMs: 60000 }),
  generateReport: endpoint(endpoints.Insight_generateReport, {
    timeoutMs: 120000,
  }),
  listReports: endpoint(endpoints.Insight_listReports),
  // ---------- AI-FDE 实施分析 ----------
  fdeAnalyze: endpoint(endpoints.Insight_fdeAnalyze, { timeoutMs: 240000 }),
  listFdeAnalyses: endpoint(endpoints.Insight_listFdeAnalyses),
  fdeAnalysisDetail: endpoint(endpoints.Insight_fdeAnalysisDetail),
  removeFdeAnalysis: endpoint(endpoints.Insight_removeFdeAnalysis),
  // ---------- 企业咨询（多模型战略分析）----------
  consultingAnalyze: endpoint(endpoints.Insight_consultingAnalyze, {
    timeoutMs: 300000,
  }),
  listConsultingAnalyses: endpoint(endpoints.Insight_listConsultingAnalyses),
  consultingAnalysisDetail: endpoint(
    endpoints.Insight_consultingAnalysisDetail,
  ),
  removeConsultingAnalysis: endpoint(endpoints.Insight_removeConsultingAnalysis),
  tagAssets: endpoint(endpoints.Insight_tagAssets, { timeoutMs: 180000 }),
  syncLedger: endpoint(endpoints.Insight_syncLedger, { timeoutMs: 60000 }),
  reviewHotspot: endpoint(endpoints.Insight_reviewHotspot),
  getSettings: endpoint(endpoints.Insight_getSettings),
  saveSettings: endpoint(endpoints.Insight_saveSettings),
  // ---------- 趋势侧采集配置（与热点侧同一模式，端点族按采集目的分开）----------
  trendSources: endpoint(endpoints.Insight_listTrendSources),
  saveTrendSource: endpoint(endpoints.Insight_saveTrendSource),
  removeTrendSource: endpoint(endpoints.Insight_removeTrendSource),
  trendRuns: endpoint(endpoints.Insight_listTrendRuns),
  trendSubscriptions: endpoint(endpoints.Insight_listTrendSubscriptions),
  saveTrendSubscription: endpoint(endpoints.Insight_saveTrendSubscription),
  removeTrendSubscription: endpoint(endpoints.Insight_removeTrendSubscription),
  toggleTrendSubscription: endpoint(endpoints.Insight_toggleTrendSubscription),
  collectTrendNow: endpoint(endpoints.Insight_collectTrendNow),
};

/** 采集配置按目的分治：一个 scope 对应一侧的端点族，组件只认 scope、不认端点名。 */
const HOTSPOT_COLLECTION = {
  listSources: insightApi.sources,
  saveSource: insightApi.saveSource,
  removeSource: insightApi.removeSource,
  listRuns: insightApi.runs,
  listSubscriptions: insightApi.subscriptions,
  saveSubscription: insightApi.saveSubscription,
  removeSubscription: insightApi.removeSubscription,
  toggleSubscription: insightApi.toggleSubscription,
  collectNow: insightApi.collectNow,
};

const TREND_COLLECTION = {
  listSources: insightApi.trendSources,
  saveSource: insightApi.saveTrendSource,
  removeSource: insightApi.removeTrendSource,
  listRuns: insightApi.trendRuns,
  listSubscriptions: insightApi.trendSubscriptions,
  saveSubscription: insightApi.saveTrendSubscription,
  removeSubscription: insightApi.removeTrendSubscription,
  toggleSubscription: insightApi.toggleTrendSubscription,
  collectNow: insightApi.collectTrendNow,
};

/** 返回模块级常量对象：引用稳定，可安全进 useEffect / useCallback 依赖。 */
export function insightCollectionApi(scope: InsightCollectionScope) {
  return scope === "trend" ? TREND_COLLECTION : HOTSPOT_COLLECTION;
}
