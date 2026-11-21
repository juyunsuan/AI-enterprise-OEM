<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：智慧分析（`insight`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Insight_listConsultingAnalyses` | GET | `/enterprise/insight/consulting/analyses` | 列表CONSULTINGANALYSES | 读 | session(会话) |  |  |  | data |
| `Insight_removeConsultingAnalysis` | DELETE | `/enterprise/insight/consulting/analyses/:id` | 删除CONSULTING分析 | 写 | session(会话) | id |  |  | data |
| `Insight_consultingAnalysisDetail` | GET | `/enterprise/insight/consulting/analyses/:id` | CONSULTING分析详情 | 读 | session(会话) | id |  |  | data |
| `Insight_consultingAnalyze` | POST | `/enterprise/insight/consulting/analyze` | CONSULTINGANALYZE | 写 | session(会话) |  |  | companyName, industry, frameworks | data |
| `Insight_listFdeAnalyses` | GET | `/enterprise/insight/fde/analyses` | 列表FDEANALYSES | 读 | session(会话) |  |  |  | data |
| `Insight_removeFdeAnalysis` | DELETE | `/enterprise/insight/fde/analyses/:id` | 删除FDE分析 | 写 | session(会话) | id |  |  | data |
| `Insight_fdeAnalysisDetail` | GET | `/enterprise/insight/fde/analyses/:id` | FDE分析详情 | 读 | session(会话) | id |  |  | data |
| `Insight_fdeAnalyze` | POST | `/enterprise/insight/fde/analyze` | FDEANALYZE | 写 | session(会话) |  |  | companyName, industry | data |
| `Insight_hotspotDetail` | GET | `/enterprise/insight/hotspot/:id` | HOTSPOT详情 | 读 | session(会话) | id |  |  | data |
| `Insight_reviewHotspot` | POST | `/enterprise/insight/hotspot/:id/review` | 审核HOTSPOT | 写 | session(会话) | id |  | action, targetId, rowIds, name | data |
| `Insight_syncLedger` | POST | `/enterprise/insight/hotspot/ledger/sync` | 同步热点台账 | 写 | session(会话) |  |  |  | data |
| `Insight_listHotspots` | GET | `/enterprise/insight/hotspot/list` | 列表HOTSPOTS | 读 | session(会话) |  | subscriptionId, platform, stage, window, page, pageSize |  | data |
| `Insight_overview` | GET | `/enterprise/insight/hotspot/overview` | 概览 | 读 | session(会话) |  |  |  | data |
| `Insight_listMetrics` | GET | `/enterprise/insight/metrics` | 列表METRICS | 读 | session(会话) |  | metricType, metricKey |  | data |
| `Insight_listReports` | GET | `/enterprise/insight/reports` | 列表报告 | 读 | session(会话) |  | kind |  | data |
| `Insight_generateReport` | POST | `/enterprise/insight/reports` | 生成热点/趋势快报 | 写 | session(会话) |  |  | kind, windowDays | data |
| `Insight_listRuns` | GET | `/enterprise/insight/runs` | 列表运行记录 | 读 | session(会话) |  | subscriptionId, sourceId, page, pageSize |  | data |
| `Insight_getSettings` | GET | `/enterprise/insight/settings` | 获取设置 | 读 | session(会话) |  |  |  | data |
| `Insight_saveSettings` | POST | `/enterprise/insight/settings` | 保存设置 | 写 | session(会话) |  |  |  | data |
| `Insight_listSkills` | GET | `/enterprise/insight/skills` | 列表技能 | 读 | session(会话) |  |  |  | data |
| `Insight_listSources` | GET | `/enterprise/insight/sources` | 列表数据源 | 读 | session(会话) |  | purpose |  | data |
| `Insight_saveSource` | POST | `/enterprise/insight/sources` | 保存数据源 | 写 | session(会话) |  |  |  | data |
| `Insight_removeSource` | DELETE | `/enterprise/insight/sources/:id` | 删除数据源 | 写 | session(会话) | id |  |  | data |
| `Insight_listSubscriptions` | GET | `/enterprise/insight/subscriptions` | 列表SUBSCRIPTIONS | 读 | session(会话) |  |  |  | data |
| `Insight_saveSubscription` | POST | `/enterprise/insight/subscriptions` | 保存SUBSCRIPTION | 写 | session(会话) |  |  |  | data |
| `Insight_removeSubscription` | DELETE | `/enterprise/insight/subscriptions/:id` | 删除SUBSCRIPTION | 写 | session(会话) | id |  |  | data |
| `Insight_collectNow` | POST | `/enterprise/insight/subscriptions/:id/collect` | 立即采集订阅内容 | 写 | session(会话) | id |  |  | data |
| `Insight_toggleSubscription` | POST | `/enterprise/insight/subscriptions/:id/toggle` | 启停SUBSCRIPTION | 写 | session(会话) | id |  | status | data |
| `Insight_trendAnalysis` | GET | `/enterprise/insight/trends/analysis` | 趋势分析 | 读 | session(会话) |  | windowDays, dimension, platform, keyword |  | data |
| `Insight_generateDeck` | POST | `/enterprise/insight/trends/deck` | 生成DECK | 写 | session(会话) |  |  | windowDays, format, template, brandName | data |
| `Insight_deriveStyle` | POST | `/enterprise/insight/trends/derive` | DERIVESTYLE | 写 | session(会话) |  |  | anchor, category, imageUrl, windowDays, withImages | data |
| `Insight_trendExport` | POST | `/enterprise/insight/trends/export` | 趋势导出 | 写 | session(会话) |  |  | windowDays, dimension | data |
| `Insight_trendsOverview` | GET | `/enterprise/insight/trends/overview` | 趋势概览 | 读 | session(会话) |  |  |  | data |
| `Insight_listTrendRuns` | GET | `/enterprise/insight/trends/runs` | 列表趋势运行记录 | 读 | session(会话) |  | subscriptionId, sourceId, page, pageSize |  | data |
| `Insight_listTrendSources` | GET | `/enterprise/insight/trends/sources` | 列表趋势数据源 | 读 | session(会话) |  | purpose |  | data |
| `Insight_saveTrendSource` | POST | `/enterprise/insight/trends/sources` | 保存趋势数据源 | 写 | session(会话) |  |  |  | data |
| `Insight_removeTrendSource` | DELETE | `/enterprise/insight/trends/sources/:id` | 删除趋势数据源 | 写 | session(会话) | id |  |  | data |
| `Insight_listTrendSubscriptions` | GET | `/enterprise/insight/trends/subscriptions` | 列表趋势SUBSCRIPTIONS | 读 | session(会话) |  |  |  | data |
| `Insight_saveTrendSubscription` | POST | `/enterprise/insight/trends/subscriptions` | 保存趋势SUBSCRIPTION | 写 | session(会话) |  |  |  | data |
| `Insight_removeTrendSubscription` | DELETE | `/enterprise/insight/trends/subscriptions/:id` | 删除趋势SUBSCRIPTION | 写 | session(会话) | id |  |  | data |
| `Insight_collectTrendNow` | POST | `/enterprise/insight/trends/subscriptions/:id/collect` | 采集趋势立即 | 写 | session(会话) | id |  |  | data |
| `Insight_toggleTrendSubscription` | POST | `/enterprise/insight/trends/subscriptions/:id/toggle` | 启停趋势SUBSCRIPTION | 写 | session(会话) | id |  | status | data |
| `Insight_tagAssets` | POST | `/enterprise/insight/trends/tag-assets` | 批量视觉打标资产 | 写 | session(会话) |  |  | limit | data |

返回 `INDEX.md`。

