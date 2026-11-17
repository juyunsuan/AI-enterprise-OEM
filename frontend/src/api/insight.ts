import { endpoints } from "@enterprise/contracts";
import type {
  InsightSubscriptionRow,
  InsightHotspotRow,
  InsightHotspotContentRow,
  InsightMetricRow,
} from "@enterprise/contracts";
import { endpoint } from "./endpoint";

export type {
  InsightSubscriptionRow,
  InsightHotspotRow,
  InsightHotspotContentRow,
  InsightMetricRow,
};

export type InsightOverview = {
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

export type InsightTrendsOverview = {
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

export const insightApi = {
  overview: endpoint(endpoints.Insight_overview),
  subscriptions: endpoint(endpoints.Insight_listSubscriptions),
  saveSubscription: endpoint(endpoints.Insight_saveSubscription),
  removeSubscription: endpoint(endpoints.Insight_removeSubscription),
  toggleSubscription: endpoint(endpoints.Insight_toggleSubscription),
  collectNow: endpoint(endpoints.Insight_collectNow),
  hotspots: endpoint(endpoints.Insight_listHotspots),
  hotspotDetail: endpoint(endpoints.Insight_hotspotDetail),
  metrics: endpoint(endpoints.Insight_listMetrics),
  trendsOverview: endpoint(endpoints.Insight_trendsOverview),
  generateReport: endpoint(endpoints.Insight_generateReport, {
    timeoutMs: 120000,
  }),
  listReports: endpoint(endpoints.Insight_listReports),
  tagAssets: endpoint(endpoints.Insight_tagAssets, { timeoutMs: 180000 }),
  syncLedger: endpoint(endpoints.Insight_syncLedger, { timeoutMs: 60000 }),
  reviewHotspot: endpoint(endpoints.Insight_reviewHotspot),
  getSettings: endpoint(endpoints.Insight_getSettings),
  saveSettings: endpoint(endpoints.Insight_saveSettings),
};
