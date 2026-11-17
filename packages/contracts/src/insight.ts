import { z } from "zod";

const envelope = <T extends z.ZodType>(data: T) =>
  z.object({ code: z.number(), message: z.string(), data: data.nullable() });
const emptyQuery = z.object({});
const passthroughBody = z.object({}).passthrough();
const idParam = z.object({ id: z.string() });

/**
 * 智慧分析板块契约（全域内容热点分析 + 流行趋势分析）。
 *
 * 设计口径见 `docs/智慧分析板块设计方案.md`：
 * - 采集不新建爬虫服务，行数据全程走既有 `DataTable_landRows`（预置多维表格「热点内容」）；
 * - 热点是聚合产物而非采集产物，可删可重算；
 * - 一切行/资产/订阅按账号（ownerUserId）归属，与 bigdata / bi / data-table 同口径。
 */

// ---------- 枚举 ----------

export const INSIGHT_PLATFORMS = [
  "xiaohongshu",
  "toutiao",
  "douyin",
  "shipinhao",
] as const;
export type InsightPlatform = (typeof INSIGHT_PLATFORMS)[number];
export const INSIGHT_PLATFORM_LABELS: Record<string, string> = {
  xiaohongshu: "小红书",
  toutiao: "头条",
  douyin: "抖音",
  shipinhao: "视频号",
};

export const INSIGHT_STAGES = [
  "emerging",
  "rising",
  "peak",
  "declining",
] as const;
export type InsightStage = (typeof INSIGHT_STAGES)[number];
export const INSIGHT_STAGE_LABELS: Record<string, string> = {
  emerging: "萌芽",
  rising: "上升",
  peak: "峰值",
  declining: "衰退",
};

export const INSIGHT_METRIC_TYPES = [
  "interaction",
  "visual",
  "commercial",
] as const;
export type InsightMetricType = (typeof INSIGHT_METRIC_TYPES)[number];

export const INSIGHT_FREQUENCIES = ["hourly", "daily", "weekly"] as const;
export type InsightFrequency = (typeof INSIGHT_FREQUENCIES)[number];
export const INSIGHT_FREQUENCY_LABELS: Record<string, string> = {
  hourly: "小时级",
  daily: "每日",
  weekly: "每周",
};

// ---------- 预置多维表格列模板（单一实现点，后端建表 / 前端渲染共用，仿 BIGDATA_DATASETS）----------

export type InsightColumn = {
  fieldKey: string;
  name: string;
  fieldType: "text" | "number" | "date" | "url" | "select" | "json";
  /** select 列的可选项。 */
  choices?: string[];
  /** 是否作为 landRows 幂等锚（去重键）。 */
  dedup?: boolean;
};

export const INSIGHT_PRESET_TABLES = {
  /** 采集回来的原始内容行（一条内容一行），采集通道只管往里投，热点引擎从这里读。 */
  content: {
    key: "content",
    tableName: "热点内容",
    tableDescription:
      "「全域内容热点分析」的原始内容承载表：每行一条公开可访问内容（笔记/文章），字段来自订阅采集与手动导入，内容链接列用于跨任务去重。",
    columns: [
      { fieldKey: "title", name: "标题", fieldType: "text" },
      { fieldKey: "text", name: "正文摘要", fieldType: "text" },
      { fieldKey: "url", name: "内容链接", fieldType: "url", dedup: true },
      { fieldKey: "platform", name: "平台", fieldType: "text" },
      { fieldKey: "author", name: "作者", fieldType: "text" },
      { fieldKey: "topic", name: "话题标签", fieldType: "text" },
      { fieldKey: "keywords", name: "关键词", fieldType: "text" },
      { fieldKey: "publish_at", name: "发布时间", fieldType: "text" },
      { fieldKey: "likes", name: "点赞", fieldType: "number" },
      { fieldKey: "comments", name: "评论", fieldType: "number" },
      { fieldKey: "collects", name: "收藏", fieldType: "number" },
      { fieldKey: "shares", name: "转发", fieldType: "number" },
      { fieldKey: "emotion", name: "情感", fieldType: "text" },
      { fieldKey: "subscription_id", name: "来源订阅", fieldType: "number" },
    ],
  } satisfies {
    key: string;
    tableName: string;
    tableDescription: string;
    columns: InsightColumn[];
  },
  /** 热点引擎产出的热点事件台账（系统列 upsert，用户自定义列永不覆盖）。 */
  hotspotLedger: {
    key: "hotspotLedger",
    tableName: "热点追踪台账",
    tableDescription:
      "「全域内容热点分析」的选题跟进台账：热点引擎按当期结果 upsert 系统列，用户可自由加「选题优先级 / 负责人 / 跟进状态」等业务列，同步不会覆盖。",
    columns: [
      { fieldKey: "hotspot_name", name: "热点名称", fieldType: "text" },
      { fieldKey: "subscription", name: "所属订阅", fieldType: "text" },
      { fieldKey: "platforms", name: "覆盖平台", fieldType: "text" },
      { fieldKey: "stage", name: "阶段", fieldType: "text" },
      { fieldKey: "hot_score", name: "热点得分", fieldType: "number" },
      { fieldKey: "growth_rate", name: "增速", fieldType: "number" },
      { fieldKey: "content_count", name: "内容数", fieldType: "number" },
      { fieldKey: "sentiment", name: "情感分布", fieldType: "text" },
      { fieldKey: "keywords", name: "关联关键词", fieldType: "text" },
      { fieldKey: "synced_at", name: "同步时间", fieldType: "text" },
    ],
  },
} as const;

export type InsightPresetTableKey = keyof typeof INSIGHT_PRESET_TABLES;

/** 幂等锚列（landRows 去重键）。 */
export function insightDedupKeys(table: InsightPresetTableKey): string[] {
  return INSIGHT_PRESET_TABLES[table].columns
    .filter((column) => "dedup" in column && column.dedup)
    .map((column) => column.fieldKey);
}

// ---------- 采集配方（每平台 goal 模板，仿 BIGDATA_DATASETS 前后端共用）----------

export type InsightHarvestRecipe = {
  platform: InsightPlatform;
  /** 交给浏览器代理 / BotBuddy 主机的自然语言目标模板，`{keyword}` 由订阅项替换。 */
  goalTemplate: string;
  /** 结果落「热点内容」表：抽取字段 → 列键映射。 */
  fieldMapping: Record<string, string>;
  /** 幂等锚列键。 */
  dedupBy: string[];
};

/**
 * 首发小红书 + 头条（D3=A，页面结构简单、抗改版、配方命中率高）；
 * 抖音 / 视频号作占位，配方待命中率验证后补。
 */
export const INSIGHT_HARVEST_RECIPES: Partial<
  Record<InsightPlatform, InsightHarvestRecipe>
> = {
  xiaohongshu: {
    platform: "xiaohongshu",
    goalTemplate:
      "在小红书搜索「{keyword}」，按最新打开结果页，把每条笔记的标题、正文摘要、点赞/评论/收藏数、作者、话题标签采集进「热点内容」表（内容链接去重），取前 30 条。",
    fieldMapping: {
      标题: "title",
      正文摘要: "text",
      链接: "url",
      作者: "author",
      话题: "topic",
      点赞: "likes",
      评论: "comments",
      收藏: "collects",
    },
    dedupBy: ["url"],
  },
  toutiao: {
    platform: "toutiao",
    goalTemplate:
      "在头条搜索「{keyword}」，按最新打开结果页，把每篇文章的标题、摘要、阅读/评论数、作者、发布时间采集进「热点内容」表（内容链接去重），取前 30 条。",
    fieldMapping: {
      标题: "title",
      摘要: "text",
      链接: "url",
      作者: "author",
      评论: "comments",
      发布时间: "publish_at",
    },
    dedupBy: ["url"],
  },
};

// ---------- 打分默认权重与阈值（contracts 声明、后台可配）----------

export const INSIGHT_SCORE_DEFAULTS = {
  weights: { interaction: 0.4, growth: 0.3, diffusion: 0.2, volume: 0.1 },
  // 阶段判定阈值（增速百分比 & 分位）
  thresholds: {
    emergingGrowthPct: 80,
    emergingBasePercentile: 30,
    risingGrowthMinPct: 20,
    risingGrowthMaxPct: 80,
    peakPercentile: 90,
    decliningGrowthPct: -20,
  },
  timeWindowDays: 90,
} as const;

// ---------- DTO ----------

const subscriptionSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    platforms: z.array(z.string()),
    keywords: z.array(z.string()),
    topics: z.array(z.string()),
    creators: z.array(z.string()),
    frequency: z.string(),
    excludeWords: z.array(z.string()),
    minEngagement: z.number(),
    alertGrowthPct: z.number(),
    status: z.string(),
    scheduleIds: z.array(z.number()),
    lastRunAt: z.string(),
    contentCount: z.number(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();

const hotspotSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    subscriptionId: z.number(),
    subscriptionName: z.string(),
    platforms: z.array(z.string()),
    stage: z.string(),
    hotScore: z.number(),
    growthRate: z.number(),
    contentCount: z.number(),
    sentiment: z.record(z.string(), z.number()),
    keywords: z.array(z.string()),
    firstPlatform: z.string(),
    firstPublishAt: z.string(),
    windowStart: z.string(),
    windowEnd: z.string(),
    updatedAt: z.string(),
    reviewNote: z.string(),
  })
  .passthrough();

const hotspotContentSchema = z
  .object({
    rowId: z.number(),
    tableId: z.number(),
    title: z.string(),
    url: z.string(),
    platform: z.string(),
    author: z.string(),
    likes: z.number(),
    comments: z.number(),
    collects: z.number(),
    publishAt: z.string(),
    representative: z.boolean(),
  })
  .passthrough();

const metricSchema = z
  .object({
    metricKey: z.string(),
    metricType: z.string(),
    period: z.string(),
    value: z.number(),
    growthRate: z.number(),
  })
  .passthrough();

const reportSchema = z
  .object({
    id: z.number(),
    kind: z.string(),
    status: z.string(),
    assetId: z.string(),
    content: z.string(),
    error: z.string(),
    window: z.record(z.string(), z.string()),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();
export type InsightReportRow = z.infer<typeof reportSchema>;

const settingsSchema = z
  .object({
    linkageEnabled: z.boolean(),
    contentTableId: z.number(),
    ledgerTableId: z.number(),
    reportWindowDays: z.number(),
    scoreConfig: z.record(z.string(), z.unknown()),
  })
  .passthrough();
export type InsightSettingsRow = z.infer<typeof settingsSchema>;

const overviewSchema = z
  .object({
    subscriptionCount: z.number(),
    activeSubscriptionCount: z.number(),
    contentCount: z.number(),
    hotspotCount: z.number(),
    stageCounts: z.record(z.string(), z.number()),
    topTrends: z.array(metricSchema),
    deviceChannels: z
      .array(
        z
          .object({
            kind: z.string(),
            label: z.string(),
            online: z.boolean(),
          })
          .passthrough(),
      ),
    presetTables: z
      .array(
        z
          .object({
            key: z.string(),
            tableName: z.string(),
            dataTableId: z.number(),
            exists: z.boolean(),
            fieldCount: z.number(),
          })
          .passthrough(),
      ),
    ready: z.boolean(),
  })
  .passthrough();

const pageBody = <T extends z.ZodType>(item: T) =>
  envelope(
    z
      .object({
        list: z.array(item),
        total: z.number(),
        page: z.number(),
        pageSize: z.number(),
      })
      .passthrough(),
  );

// ---------- 端点 ----------

export const insightEndpoints = {
  Insight_overview: {
    method: "get" as const,
    path: "/enterprise/insight/hotspot/overview",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(overviewSchema),
  },
  Insight_listSubscriptions: {
    method: "get" as const,
    path: "/enterprise/insight/subscriptions",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.array(subscriptionSchema)),
  },
  Insight_saveSubscription: {
    method: "post" as const,
    path: "/enterprise/insight/subscriptions",
    params: z.object({}),
    query: emptyQuery,
    body: passthroughBody,
    response: envelope(subscriptionSchema),
  },
  Insight_removeSubscription: {
    method: "delete" as const,
    path: "/enterprise/insight/subscriptions/:id",
    params: idParam,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ id: z.number(), deleted: z.boolean() })),
  },
  Insight_toggleSubscription: {
    method: "post" as const,
    path: "/enterprise/insight/subscriptions/:id/toggle",
    params: idParam,
    query: emptyQuery,
    body: z.object({ status: z.string() }).passthrough(),
    response: envelope(subscriptionSchema),
  },
  Insight_collectNow: {
    method: "post" as const,
    path: "/enterprise/insight/subscriptions/:id/collect",
    params: idParam,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(
      z
        .object({
          dispatched: z.boolean(),
          reason: z.string(),
          goal: z.string(),
          entryPath: z.string(),
        })
        .passthrough(),
    ),
  },
  Insight_listHotspots: {
    method: "get" as const,
    path: "/enterprise/insight/hotspot/list",
    params: z.object({}),
    query: z
      .object({
        subscriptionId: z.coerce.number().int().nonnegative().optional(),
        platform: z.string().optional(),
        stage: z.string().optional(),
        window: z.string().optional(),
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(100).default(30),
      })
      .passthrough(),
    body: z.undefined(),
    response: pageBody(hotspotSchema),
  },
  Insight_hotspotDetail: {
    method: "get" as const,
    path: "/enterprise/insight/hotspot/:id",
    params: idParam,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(
      z
        .object({
          hotspot: hotspotSchema,
          contents: z.array(hotspotContentSchema),
        })
        .passthrough(),
    ),
  },
  Insight_listMetrics: {
    method: "get" as const,
    path: "/enterprise/insight/metrics",
    params: z.object({}),
    query: z
      .object({
        metricType: z.string().optional(),
        metricKey: z.string().optional(),
      })
      .passthrough(),
    body: z.undefined(),
    response: envelope(z.array(metricSchema)),
  },
  // 趋势（S7 前只回既有资产/指标的只读视图，未绑模型时降级为空列表不报错）
  Insight_trendsOverview: {
    method: "get" as const,
    path: "/enterprise/insight/trends/overview",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(
      z
        .object({
          assetCount: z.number(),
          taggedCount: z.number(),
          elementTrends: z.array(metricSchema),
          colorTrends: z.array(metricSchema),
          quadrant: z
            .array(
              z
                .object({
                  concept: z.string(),
                  interaction: z.number(),
                  commercial: z.number(),
                })
                .passthrough(),
            )
            .default([]),
          linkageEnabled: z.boolean(),
        })
        .passthrough(),
    ),
  },
  // ---------- S5 快报 / S7 资产打标 / S2 采集派发 ----------
  Insight_generateReport: {
    method: "post" as const,
    path: "/enterprise/insight/reports",
    params: z.object({}),
    query: emptyQuery,
    body: z.object({ kind: z.string(), windowDays: z.number().optional() }).passthrough(),
    response: envelope(reportSchema),
  },
  Insight_listReports: {
    method: "get" as const,
    path: "/enterprise/insight/reports",
    params: z.object({}),
    query: z.object({ kind: z.string().optional() }).passthrough(),
    body: z.undefined(),
    response: envelope(z.array(reportSchema)),
  },
  Insight_tagAssets: {
    method: "post" as const,
    path: "/enterprise/insight/trends/tag-assets",
    params: z.object({}),
    query: emptyQuery,
    body: z.object({ limit: z.number().optional() }).passthrough(),
    response: envelope(
      z
        .object({
          scanned: z.number(),
          tagged: z.number(),
          model: z.string(),
          mode: z.string(),
          reason: z.string(),
        })
        .passthrough(),
    ),
  },
  Insight_syncLedger: {
    method: "post" as const,
    path: "/enterprise/insight/hotspot/ledger/sync",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(
      z
        .object({
          synced: z.number(),
          tableId: z.number(),
          url: z.string(),
          reason: z.string(),
        })
        .passthrough(),
    ),
  },
  Insight_reviewHotspot: {
    method: "post" as const,
    path: "/enterprise/insight/hotspot/:id/review",
    params: idParam,
    query: emptyQuery,
    body: z
      .object({
        action: z.string(),
        targetId: z.number().optional(),
        rowIds: z.array(z.number()).optional(),
        name: z.string().optional(),
      })
      .passthrough(),
    response: envelope(
      z
        .object({
          ok: z.boolean(),
          hotspotId: z.number(),
          reviewNote: z.string(),
          contentCount: z.number(),
        })
        .passthrough(),
    ),
  },
  Insight_getSettings: {
    method: "get" as const,
    path: "/enterprise/insight/settings",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(settingsSchema),
  },
  Insight_saveSettings: {
    method: "post" as const,
    path: "/enterprise/insight/settings",
    params: z.object({}),
    query: emptyQuery,
    body: passthroughBody,
    response: envelope(settingsSchema),
  },
};

export type InsightOverview = z.infer<typeof overviewSchema> extends {
  data: infer D;
}
  ? D
  : never;
export type InsightSubscriptionRow = z.infer<typeof subscriptionSchema>;
export type InsightHotspotRow = z.infer<typeof hotspotSchema>;
export type InsightHotspotContentRow = z.infer<typeof hotspotContentSchema>;
export type InsightMetricRow = z.infer<typeof metricSchema>;
