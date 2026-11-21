<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：SEO 工作台（`seo`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Seo_listAudits` | GET | `/enterprise/seo/audits` | 列表审核 | 读 | session(会话) |  | page, pageSize, projectId |  | data |
| `Seo_getAudit` | GET | `/enterprise/seo/audits/:id` | 获取审核 | 读 | session(会话) | id |  |  | data |
| `Seo_explainAudit` | POST | `/enterprise/seo/audits/explain` | 审核解读 | 写 | session(会话) |  |  | id | data |
| `Seo_startAudit` | POST | `/enterprise/seo/audits/start` | 启动审核 | 写 | session(会话) |  |  | projectId, startUrl, maxPages, includeSubdomains, runLighthouse | data |
| `Seo_backlinksHistory` | GET | `/enterprise/seo/backlinks/history` | 外链历史 | 读 | session(会话) |  | projectId |  | data |
| `Seo_backlinksOverview` | GET | `/enterprise/seo/backlinks/overview` | 外链概览 | 读 | session(会话) |  | projectId, domain |  | data |
| `Seo_backlinksProfile` | GET | `/enterprise/seo/backlinks/profile` | 外链档案 | 读 | session(会话) |  | page, pageSize, projectId, domain |  | data |
| `Seo_baiduCredential` | GET | `/enterprise/seo/baidu/credential` | 百度凭据 | 读 | session(会话) |  | projectId |  | data |
| `Seo_saveBaiduCredential` | POST | `/enterprise/seo/baidu/credential` | 保存百度凭据 | 写 | session(会话) |  |  | projectId, site, token | data |
| `Seo_baiduHistory` | GET | `/enterprise/seo/baidu/history` | 百度历史 | 读 | session(会话) |  | projectId |  | data |
| `Seo_submitBaidu` | POST | `/enterprise/seo/baidu/submit` | 提交百度 | 写 | session(会话) |  |  | projectId, urls | data |
| `Seo_competitorOverview` | GET | `/enterprise/seo/competitors/overview` | 竞品概览 | 读 | session(会话) |  | projectId, domain |  | data |
| `Seo_competitorPages` | POST | `/enterprise/seo/competitors/pages` | 竞品页面 | 写 | session(会话) |  |  | projectId, domain | data |
| `Seo_googleAuthUrl` | GET | `/enterprise/seo/google/auth-url` | Google授权链接 | 读 | session(会话) |  | service |  | data |
| `Seo_googleCallback` | GET | `/enterprise/seo/google/callback` | Google回调 | 读 | session(会话) |  | code, state, error |  | data |
| `Seo_saveGoogleClient` | POST | `/enterprise/seo/google/client` | 保存 Google 授权配置 | 写 | session(会话) |  |  | clientId, clientSecret | data |
| `Seo_connectGoogle` | POST | `/enterprise/seo/google/connect` | 连接Google | 写 | session(会话) |  |  | service, propertyId, propertyName, refreshToken | data |
| `Seo_disconnectGoogle` | POST | `/enterprise/seo/google/disconnect` | 断开Google | 写 | session(会话) |  |  | service | data |
| `Seo_ga4Rows` | GET | `/enterprise/seo/google/ga4` | 查看 GA4 数据 | 读 | session(会话) |  | projectId |  | data |
| `Seo_googleSettings` | GET | `/enterprise/seo/google/settings` | Google设置 | 读 | session(会话) |  |  |  | data |
| `Seo_syncGoogle` | POST | `/enterprise/seo/google/sync` | 同步Google | 写 | session(会话) |  |  | service | data |
| `Seo_gscAnalysis` | GET | `/enterprise/seo/gsc/analysis` | Search Console分析 | 读 | session(会话) |  | projectId, importId |  | data |
| `Seo_importGsc` | POST | `/enterprise/seo/gsc/import` | 导入Search Console | 写 | session(会话) |  |  | projectId, fileName, csv | data |
| `Seo_listGscImports` | GET | `/enterprise/seo/gsc/imports` | 列表Search Console导入 | 读 | session(会话) |  | projectId |  | data |
| `Seo_indexnowHistory` | GET | `/enterprise/seo/indexnow/history` | 查看 IndexNow 提交记录 | 读 | session(会话) |  | projectId |  | data |
| `Seo_setupIndexnow` | POST | `/enterprise/seo/indexnow/setup` | 配置 IndexNow | 写 | session(会话) |  |  | projectId | data |
| `Seo_submitIndexnow` | POST | `/enterprise/seo/indexnow/submit` | 提交 IndexNow | 写 | session(会话) |  |  | projectId, urls | data |
| `Seo_verifyIndexnow` | POST | `/enterprise/seo/indexnow/verify` | 校验 IndexNow | 写 | session(会话) |  |  | projectId | data |
| `Seo_listKeywords` | GET | `/enterprise/seo/keywords` | 列表关键词 | 读 | session(会话) |  | page, pageSize, projectId, q, tag |  | data |
| `Seo_clusterKeywords` | POST | `/enterprise/seo/keywords/cluster` | 词簇关键词 | 写 | session(会话) |  |  | projectId | data |
| `Seo_listClusters` | GET | `/enterprise/seo/keywords/clusters` | 列表词簇 | 读 | session(会话) |  | projectId |  | data |
| `Seo_removeKeyword` | POST | `/enterprise/seo/keywords/remove` | 删除关键词 | 写 | session(会话) |  |  | id | data |
| `Seo_researchKeywords` | POST | `/enterprise/seo/keywords/research` | 研究关键词 | 写 | session(会话) |  |  | projectId, seed, competitorDomain, locationCode, languageCode, limit | data |
| `Seo_saveKeywords` | POST | `/enterprise/seo/keywords/save` | 保存关键词 | 写 | session(会话) |  |  | projectId, keywords | data |
| `Seo_estimateLocalCost` | GET | `/enterprise/seo/local/estimate` | 预估本地成本 | 读 | session(会话) |  | trackerId |  | data |
| `Seo_localGrid` | GET | `/enterprise/seo/local/grid` | 本地网格 | 读 | session(会话) |  | trackerId, runId |  | data |
| `Seo_runLocalCheck` | POST | `/enterprise/seo/local/run` | 运行本地检查 | 写 | session(会话) |  |  | trackerId | data |
| `Seo_listLocalTrackers` | GET | `/enterprise/seo/local/trackers` | 列表本地跟踪 | 读 | session(会话) |  | projectId |  | data |
| `Seo_createLocalTracker` | POST | `/enterprise/seo/local/trackers/create` | 新建本地跟踪 | 写 | session(会话) |  |  | id, projectId, businessName, keyword, centerLat, centerLng, gridSize, radiusKm | data |
| `Seo_removeLocalTracker` | POST | `/enterprise/seo/local/trackers/remove` | 删除本地跟踪 | 写 | session(会话) |  |  | id | data |
| `Seo_overview` | GET | `/enterprise/seo/overview` | 概览 | 读 | session(会话) |  | projectId |  | data |
| `Seo_programmaticExport` | GET | `/enterprise/seo/programmatic/export` | 程序化导出 | 读 | session(会话) |  | runId |  | data |
| `Seo_programmaticGenerate` | POST | `/enterprise/seo/programmatic/generate` | 生成程序化 | 写 | session(会话) |  |  | projectId, tableId, keywordPattern, template, maxRows | data |
| `Seo_programmaticPages` | GET | `/enterprise/seo/programmatic/pages` | 程序化页面 | 读 | session(会话) |  | runId |  | data |
| `Seo_programmaticPreview` | POST | `/enterprise/seo/programmatic/preview` | 预览程序化 | 写 | session(会话) |  |  | projectId, tableId, keywordPattern, template, sampleRows | data |
| `Seo_programmaticRuns` | GET | `/enterprise/seo/programmatic/runs` | 程序化运行记录 | 读 | session(会话) |  | projectId |  | data |
| `Seo_listProjects` | GET | `/enterprise/seo/projects` | 列表项目 | 读 | session(会话) |  |  |  | data |
| `Seo_createProject` | POST | `/enterprise/seo/projects/create` | 新建项目 | 写 | session(会话) |  |  | id, domain, brandName, locationCode, languageCode, competitors, keyPages, note | data |
| `Seo_removeProject` | POST | `/enterprise/seo/projects/remove` | 删除项目 | 写 | session(会话) |  |  | id | data |
| `Seo_updateProject` | POST | `/enterprise/seo/projects/update` | 修改项目 | 写 | session(会话) |  |  | id, domain, brandName, locationCode, languageCode, competitors, keyPages, note | data |
| `Seo_listProspects` | GET | `/enterprise/seo/prospects` | 列表潜客 | 读 | session(会话) |  | page, pageSize, projectId, status |  | data |
| `Seo_addProspect` | POST | `/enterprise/seo/prospects/add` | 添加潜客 | 写 | session(会话) |  |  | projectId, domain, url, sourceQuery, note | data |
| `Seo_discoverProspects` | POST | `/enterprise/seo/prospects/discover` | 发现潜客 | 写 | session(会话) |  |  | projectId, query, locationCode, languageCode, limit | data |
| `Seo_draftOutreach` | POST | `/enterprise/seo/prospects/draft` | 草稿触达 | 写 | session(会话) |  |  | id | data |
| `Seo_extractContact` | POST | `/enterprise/seo/prospects/extract-contact` | 提取联系人 | 写 | session(会话) |  |  | id | data |
| `Seo_pushProspectsToMail` | POST | `/enterprise/seo/prospects/push-mail` | 推送潜客到邮箱 | 写 | session(会话) |  |  | projectId, ids, receiverId | data |
| `Seo_removeProspect` | POST | `/enterprise/seo/prospects/remove` | 删除潜客 | 写 | session(会话) |  |  | id | data |
| `Seo_updateProspect` | POST | `/enterprise/seo/prospects/update` | 修改潜客 | 写 | session(会话) |  |  | id, status, contactEmail, contactUrl, outreachAngle, note | data |
| `Seo_estimateRankCost` | GET | `/enterprise/seo/rank/estimate` | 预估排名成本 | 读 | session(会话) |  | trackerId |  | data |
| `Seo_rankHistory` | GET | `/enterprise/seo/rank/history` | 排名历史 | 读 | session(会话) |  | trackerId |  | data |
| `Seo_listRankKeywords` | GET | `/enterprise/seo/rank/keywords` | 列表排名关键词 | 读 | session(会话) |  | trackerId |  | data |
| `Seo_addRankKeywords` | POST | `/enterprise/seo/rank/keywords/add` | 添加排名关键词 | 写 | session(会话) |  |  | trackerId, keywords | data |
| `Seo_removeRankKeyword` | POST | `/enterprise/seo/rank/keywords/remove` | 删除排名关键词 | 写 | session(会话) |  |  | id | data |
| `Seo_runRankCheck` | POST | `/enterprise/seo/rank/run` | 运行排名检查 | 写 | session(会话) |  |  | trackerId | data |
| `Seo_listTrackers` | GET | `/enterprise/seo/rank/trackers` | 列表跟踪 | 读 | session(会话) |  | projectId |  | data |
| `Seo_createTracker` | POST | `/enterprise/seo/rank/trackers/create` | 新建跟踪 | 写 | session(会话) |  |  | id, projectId, domain, locationCode, languageCode, device, depth, frequency, reads, enabled | data |
| `Seo_removeTracker` | POST | `/enterprise/seo/rank/trackers/remove` | 删除跟踪 | 写 | session(会话) |  |  | id | data |
| `Seo_updateTracker` | POST | `/enterprise/seo/rank/trackers/update` | 修改跟踪 | 写 | session(会话) |  |  | id, projectId, domain, locationCode, languageCode, device, depth, frequency, reads, enabled | data |
| `Seo_listReports` | GET | `/enterprise/seo/reports` | 列表报告 | 读 | session(会话) |  | projectId |  | data |
| `Seo_generateReport` | POST | `/enterprise/seo/reports/generate` | 生成报告 | 写 | session(会话) |  |  | projectId, periodLabel | data |
| `Seo_shareReport` | POST | `/enterprise/seo/reports/share` | 分享报告 | 写 | session(会话) |  |  | id | data |
| `Seo_researchLog` | GET | `/enterprise/seo/research-log` | 研究日志 | 读 | session(会话) |  | page, pageSize, projectId |  | data |
| `Seo_generateSchema` | POST | `/enterprise/seo/schema/generate` | 生成结构 | 写 | session(会话) |  |  | projectId, type, pageUrl, fields | data |
| `Seo_validateSchema` | POST | `/enterprise/seo/schema/validate` | 校验结构 | 写 | session(会话) |  |  | jsonLd, pageUrl | data |
| `Seo_settings` | GET | `/enterprise/seo/settings` | 设置 | 读 | session(会话) |  |  |  | data |
| `Seo_saveProvider` | POST | `/enterprise/seo/settings/provider` | 保存服务商 | 写 | session(会话) |  |  | code, accountName, login, password | data |
| `Seo_clearProvider` | POST | `/enterprise/seo/settings/provider/clear` | 清空服务商 | 写 | session(会话) |  |  | code | data |
| `Seo_testProvider` | POST | `/enterprise/seo/settings/provider/test` | 测试服务商 | 写 | session(会话) |  |  | code | data |

返回 `INDEX.md`。

