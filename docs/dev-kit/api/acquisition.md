<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：AI 获客（`acquisition`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Acquisition_dashboard` | GET | `/enterprise/acquisition/dashboard` | 看板 | 读 | session(会话) |  | from, to, platform, sourceId, playbookId, agentUserId |  | data |
| `Acquisition_dashboardExport` | POST | `/enterprise/acquisition/dashboard/export` | 看板导出 | 写 | session(会话) |  |  | from, to, platform, sourceId, playbookId, agentUserId, format | data |
| `Acquisition_dashboardShare` | POST | `/enterprise/acquisition/dashboard/share` | 看板分享 | 写 | session(会话) |  |  | from, to, platform, sourceId, playbookId, agentUserId, expiresInDays, password | data |
| `Acquisition_followUps` | GET | `/enterprise/acquisition/follow-ups` | 跟进 | 读 | session(会话) |  | page, pageSize, profileId, status, due |  | data |
| `Acquisition_createFollowUp` | POST | `/enterprise/acquisition/follow-ups` | 新建跟进 | 写 | session(会话) |  |  | profileId, channel, accountId, timeRule, followUpAt, reason, contextSummary, playbookId | data |
| `Acquisition_cancelFollowUp` | POST | `/enterprise/acquisition/follow-ups/:id/cancel` | 取消跟进 | 写 | session(会话) | id |  | reason | data |
| `Acquisition_completeFollowUp` | POST | `/enterprise/acquisition/follow-ups/:id/complete` | 跟进完成 | 写 | session(会话) | id |  | reason | data |
| `Acquisition_leads` | GET | `/enterprise/acquisition/leads` | 线索 | 读 | session(会话) |  | page, pageSize, platform, status, intentLevel, minScore, tag, q, from, to |  | data |
| `Acquisition_leadDetail` | GET | `/enterprise/acquisition/leads/:id` | 线索详情 | 读 | session(会话) | id |  |  | data |
| `Acquisition_updateLead` | PATCH | `/enterprise/acquisition/leads/:id` | 修改线索 | 写 | session(会话) | id |  | status, blockReason, ownerUserId, tags, note | data |
| `Acquisition_promoteLead` | POST | `/enterprise/acquisition/leads/:id/promote` | 转化线索 | 写 | session(会话) | id |  | name, contactName, phone, email, source, ownerId, poolId, remark | data |
| `Acquisition_scoreLead` | POST | `/enterprise/acquisition/leads/:id/score` | 评分线索 | 写 | session(会话) | id |  | force | data |
| `Acquisition_exportLeads` | POST | `/enterprise/acquisition/leads/export` | 导出线索 | 写 | session(会话) |  |  | leadIds, platform, status, intentLevel, format | data |
| `Acquisition_leadsToTable` | POST | `/enterprise/acquisition/leads/to-table` | 线索为表 | 写 | session(会话) |  |  | leadIds, tableId, fieldMap | data |
| `Acquisition_meta` | GET | `/enterprise/acquisition/meta` | 元数据 | 读 | session(会话) |  |  |  | data |
| `Acquisition_outreach` | GET | `/enterprise/acquisition/outreach` | 触达 | 读 | session(会话) |  | page, pageSize, leadId, channel, status, receiptStatus |  | data |
| `Acquisition_createOutreach` | POST | `/enterprise/acquisition/outreach` | 新建触达 | 写 | session(会话) |  |  | leadId, channel, action, targetUrl, externalUserId, playbookId, text, generate, scheduledAt, autoApprove | data |
| `Acquisition_approveOutreach` | POST | `/enterprise/acquisition/outreach/:id/approve` | 通过触达 | 写 | session(会话) | id |  | finalText, scheduledAt, payload, confirmCost | data |
| `Acquisition_cancelOutreach` | POST | `/enterprise/acquisition/outreach/:id/cancel` | 取消触达 | 写 | session(会话) | id |  | reason | data |
| `Acquisition_outreachLogs` | GET | `/enterprise/acquisition/outreach/:id/logs` | 触达日志 | 读 | session(会话) | id |  |  | data |
| `Acquisition_playbooks` | GET | `/enterprise/acquisition/playbooks` | 剧本 | 读 | session(会话) |  | page, pageSize, status, q |  | data |
| `Acquisition_savePlaybook` | POST | `/enterprise/acquisition/playbooks` | 保存剧本 | 写 | session(会话) |  |  | id, name, goal, persona, boundaries, escalation, openers, objections, kbIds, faqIds, status | data |
| `Acquisition_playbookPreview` | POST | `/enterprise/acquisition/playbooks/:id/preview` | 预览剧本 | 写 | session(会话) | id |  | leadId, profileId, customerMessage, version | data |
| `Acquisition_publishPlaybook` | POST | `/enterprise/acquisition/playbooks/:id/publish` | 发布剧本 | 写 | session(会话) | id |  |  | data |
| `Acquisition_playbookVersions` | GET | `/enterprise/acquisition/playbooks/:id/versions` | 剧本版本 | 读 | session(会话) | id | page, pageSize |  | data |
| `Acquisition_pluginPull` | POST | `/enterprise/acquisition/plugin/pull` | 插件拉群 | 写 | session(会话) |  |  | token, type | data |
| `Acquisition_pluginReceipt` | POST | `/enterprise/acquisition/plugin/receipt` | 登记回执插件 | 写 | session(会话) |  |  |  | data |
| `Acquisition_pluginReport` | POST | `/enterprise/acquisition/plugin/report` | 插件报告 | 写 | session(会话) |  |  | token, jobId, type, runId, outreachId, status, items, stats, receiptStatus, receiptRef, stopReason, error | data |
| `Acquisition_pluginToken` | POST | `/enterprise/acquisition/plugin/token` | 插件令牌 | 写 | session(会话) |  |  | type, pluginVersion | data |
| `Acquisition_profiles` | GET | `/enterprise/acquisition/profiles` | 档案 | 读 | session(会话) |  | page, pageSize, businessStatus, ownerUserId, q |  | data |
| `Acquisition_profileDetail` | GET | `/enterprise/acquisition/profiles/:id` | 档案详情 | 读 | session(会话) | id |  |  | data |
| `Acquisition_updateProfile` | PATCH | `/enterprise/acquisition/profiles/:id` | 修改档案 | 写 | session(会话) | id |  | displayName, businessStatus, purpose, source, budget, timeline, decisionRole, objections, tags, ownerUserId, note | data |
| `Acquisition_profileEvents` | GET | `/enterprise/acquisition/profiles/:id/events` | 档案事件 | 读 | session(会话) | id | page, pageSize, kind |  | data |
| `Acquisition_qcReviews` | GET | `/enterprise/acquisition/qc` | 质检审核 | 读 | session(会话) |  | page, pageSize, conversationId, agentUserId, playbookId, maxScore |  | data |
| `Acquisition_qcDetail` | GET | `/enterprise/acquisition/qc/:id` | 质检详情 | 读 | session(会话) | id |  |  | data |
| `Acquisition_runQc` | POST | `/enterprise/acquisition/qc/run` | 运行质检 | 写 | session(会话) |  |  | conversationId, playbookId | data |
| `Acquisition_runs` | GET | `/enterprise/acquisition/runs` | 运行记录 | 读 | session(会话) |  | page, pageSize, sourceId, status |  | data |
| `Acquisition_runDetail` | GET | `/enterprise/acquisition/runs/:id` | 运行详情 | 读 | session(会话) | id |  |  | data |
| `Acquisition_settings` | GET | `/enterprise/acquisition/settings` | 设置 | 读 | session(会话) |  |  |  | data |
| `Acquisition_saveSettings` | POST | `/enterprise/acquisition/settings` | 保存设置 | 写 | session(会话) |  |  | enabled, collectEnabled, qcEnabled, outreachAutoSend, humanConfirm, dailyComments, dailyDm, cooldownDays, intervalMinSeconds, intervalMaxSeconds, activeHoursStart, activeHoursEnd, evidenceRetentionDays, followUpMaxRounds, defaultPlaybookId, aiModel, aiChannelId | data |
| `Acquisition_sources` | GET | `/enterprise/acquisition/sources` | 数据源 | 读 | session(会话) |  | page, pageSize, platform, status, q |  | data |
| `Acquisition_saveSource` | POST | `/enterprise/acquisition/sources` | 保存数据源 | 写 | session(会话) |  |  | id, name, platform, mode, query, filters, cron, dailyLimit, status | data |
| `Acquisition_removeSource` | DELETE | `/enterprise/acquisition/sources/:id` | 删除数据源 | 写 | session(会话) | id |  |  | data |
| `Acquisition_runSource` | POST | `/enterprise/acquisition/sources/:id/run` | 运行数据源 | 写 | session(会话) | id |  |  | data |

返回 `INDEX.md`。

