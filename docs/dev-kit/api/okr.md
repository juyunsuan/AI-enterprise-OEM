<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：OKR计划（`okr`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Okr_assessmentPreview` | GET | `/enterprise/okr/assessment-preview` | 预览评估 | 读 | session(会话) |  | cycleId, memberUserId |  | data |
| `Okr_briefList` | GET | `/enterprise/okr/briefs` | 目标书列表 | 读 | session(会话) |  | cycleId, status |  | data |
| `Okr_briefSave` | POST | `/enterprise/okr/briefs` | 保存目标书 | 写 | session(会话) |  |  | id, cycleId, title, businessGoal, scopeWhat, scopeTarget, deliverables, startDate, endDate, budgetAmount, budgetHours, currency, labor, materials, equipment, externalServices, constraints, status | data |
| `Okr_briefGet` | GET | `/enterprise/okr/briefs/:id` | 获取目标书 | 读 | session(会话) | id |  |  | data |
| `Okr_decompositionList` | GET | `/enterprise/okr/briefs/:id/decompositions` | 拆解列表 | 读 | session(会话) | id |  |  | data |
| `Okr_decompositionGenerate` | POST | `/enterprise/okr/briefs/:id/decompositions` | 生成拆解 | 写 | session(会话) | id |  | optionKey, forceRule | data |
| `Okr_dialogList` | GET | `/enterprise/okr/briefs/:id/dialog` | 对话列表 | 读 | session(会话) | id |  |  | data |
| `Okr_dialogSend` | POST | `/enterprise/okr/briefs/:id/dialog` | 对话发送 | 写 | session(会话) | id |  | message, answers | data |
| `Okr_briefRemove` | POST | `/enterprise/okr/briefs/:id/remove` | 删除目标书 | 写 | session(会话) | id |  |  | data |
| `Okr_context` | GET | `/enterprise/okr/context` | 查看OKR身份与权限 | 读 | session(会话) |  | cycleId |  | data |
| `Okr_cycleList` | GET | `/enterprise/okr/cycles` | 查看考核周期 | 读 | session(会话) |  |  |  | data |
| `Okr_cycleSave` | POST | `/enterprise/okr/cycles` | 新建或修改考核周期 | 写 | session(会话) |  |  | id, kind, year, period, title, startDate, endDate, status | data |
| `Okr_cycleClose` | POST | `/enterprise/okr/cycles/:id/close` | 关闭考核周期 | 写 | session(会话) | id |  |  | data |
| `Okr_decompositionCommit` | POST | `/enterprise/okr/decompositions/:id/commit` | 落地 AI 拆解 | 写 | session(会话) | id |  | confirmed, createProject, projectId, projectName | data |
| `Okr_decompositionSimulate` | POST | `/enterprise/okr/decompositions/:id/simulate` | 拆解模拟 | 写 | session(会话) | id |  |  | data |
| `Okr_decomposeSuggest` | POST | `/enterprise/okr/drafts/decompose` | AI拆解建议 | 写 | session(会话) |  |  | objectiveId, memberUserIds | data |
| `Okr_draftObjective` | POST | `/enterprise/okr/drafts/objective` | AI起草目标 | 写 | session(会话) |  |  | cycleId, direction, level, memberUserId, krCount | data |
| `Okr_planGenerate` | POST | `/enterprise/okr/drafts/plans` | AI生成工作计划 | 写 | session(会话) |  |  | kind, memberUserId, cycleId | data |
| `Okr_export` | GET | `/enterprise/okr/export` | 导出OKR数据 | 读 | session(会话) |  | cycleId |  | data |
| `Okr_krSave` | POST | `/enterprise/okr/key-results` | 新建或修改关键结果 | 写 | session(会话) |  |  | id, objectiveId, title, metricType, targetValue, currentValue, startValue, unit, direction, weight, ownerMemberUserId, metricSource | data |
| `Okr_krDelete` | DELETE | `/enterprise/okr/key-results/:id` | 删除关键结果 | 写 | session(会话) | id |  |  | data |
| `Okr_krProgress` | POST | `/enterprise/okr/key-results/:id/progress` | 更新关键结果进度 | 写 | session(会话) | id |  | currentValue, note | data |
| `Okr_metricPreview` | POST | `/enterprise/okr/metrics/preview` | 预览自动指标 | 写 | session(会话) |  |  | cycleId, metricSource | data |
| `Okr_metricRefresh` | POST | `/enterprise/okr/metrics/refresh` | 刷新自动指标 | 写 | session(会话) |  |  | krId, cycleId | data |
| `Okr_objectiveList` | GET | `/enterprise/okr/objectives` | 查看目标列表 | 读 | session(会话) |  | cycleId, memberUserId, parentId |  | data |
| `Okr_objectiveSave` | POST | `/enterprise/okr/objectives` | 新建或修改目标 | 写 | session(会话) |  |  | id, cycleId, parentId, level, title, description, ownerMemberUserId, weight, visibility, status, source, krs | data |
| `Okr_objectiveDelete` | DELETE | `/enterprise/okr/objectives/:id` | 删除目标 | 写 | session(会话) | id |  |  | data |
| `Okr_objectiveDetail` | GET | `/enterprise/okr/objectives/:id` | 查看目标详情 | 读 | session(会话) | id |  |  | data |
| `Okr_objectiveAssign` | POST | `/enterprise/okr/objectives/:id/assign` | 指派目标 | 写 | session(会话) | id |  | memberUserIds, generatePlan, krTitles, source | data |
| `Okr_overview` | GET | `/enterprise/okr/overview` | 查看OKR概览 | 读 | session(会话) |  | cycleId |  | data |
| `Okr_planList` | GET | `/enterprise/okr/plans` | 查看工作计划 | 读 | session(会话) |  | kind, periodKey, memberUserId, status, cycleId |  | data |
| `Okr_planSave` | POST | `/enterprise/okr/plans` | 新建工作计划 | 写 | session(会话) |  |  | id, memberUserId, objectiveId, krId, title, detail, kind, periodKey, startDate, dueDate, priority, source | data |
| `Okr_planDelete` | DELETE | `/enterprise/okr/plans/:id` | 删除工作计划 | 写 | session(会话) | id |  |  | data |
| `Okr_planUpdate` | POST | `/enterprise/okr/plans/:id` | 修改工作计划 | 写 | session(会话) | id |  | title, detail, status, progress, dueDate, priority | data |
| `Okr_planLinkSchedule` | POST | `/enterprise/okr/plans/:id/schedule` | 关联定时任务 | 写 | session(会话) | id |  | scheduleId | data |
| `Okr_progressList` | GET | `/enterprise/okr/progress` | 查看进度记录 | 读 | session(会话) |  | krId, objectiveId |  | data |
| `Okr_reportList` | GET | `/enterprise/okr/reports` | 查看汇报列表 | 读 | session(会话) |  | kind, periodKey, memberUserId, scope |  | data |
| `Okr_reportGet` | GET | `/enterprise/okr/reports/:id` | 查看汇报详情 | 读 | session(会话) | id |  |  | data |
| `Okr_reportComment` | POST | `/enterprise/okr/reports/:id/comment` | 汇报批注 | 写 | session(会话) | id |  | comment | data |
| `Okr_reportSubmit` | POST | `/enterprise/okr/reports/:id/submit` | 提交汇报 | 写 | session(会话) | id |  |  | data |
| `Okr_reportWithdraw` | POST | `/enterprise/okr/reports/:id/withdraw` | 撤回汇报 | 写 | session(会话) | id |  |  | data |
| `Okr_reportSaveDraft` | POST | `/enterprise/okr/reports/draft` | 保存汇报草稿 | 写 | session(会话) |  |  | kind, periodKey, memberUserId, content, source, scheduleId | data |
| `Okr_reportGenerate` | POST | `/enterprise/okr/reports/generate` | AI生成汇报 | 写 | session(会话) |  |  | kind, periodKey, memberUserId, overwrite | data |
| `Okr_scoreList` | GET | `/enterprise/okr/scores` | 查看目标评分 | 读 | session(会话) |  | cycleId, scope |  | data |
| `Okr_scoreSave` | POST | `/enterprise/okr/scores` | 保存目标评分 | 写 | session(会话) |  |  | cycleId, memberUserId, scores, comment, submit | data |
| `Okr_scoreWithdraw` | POST | `/enterprise/okr/scores/:id/withdraw` | 撤回目标评分 | 写 | session(会话) | id |  |  | data |
| `Okr_settingsGet` | GET | `/enterprise/okr/settings` | 查看OKR设置 | 读 | session(会话) |  |  |  | data |
| `Okr_settingsSave` | POST | `/enterprise/okr/settings` | 保存OKR设置 | 写 | session(会话) |  |  | managers, defaultVisibility, weekStart, autoDraftEnabled, reportTemplates, reportSchedules, scoreDimensions, metricRefreshHour | data |
| `Okr_stats` | GET | `/enterprise/okr/stats` | 查看OKR统计 | 读 | session(会话) |  | cycleId |  | data |
| `Okr_taskLinkList` | GET | `/enterprise/okr/task-links` | 短链任务列表 | 读 | session(会话) |  | objectiveId, krId, taskId |  | data |
| `Okr_taskLinkSave` | POST | `/enterprise/okr/task-links` | 短链任务保存 | 写 | session(会话) |  |  | id, objectiveId, krId, taskId, weight, targetValue, acceptance, ownerMemberUserId | data |
| `Okr_taskLinkRemove` | POST | `/enterprise/okr/task-links/:id/remove` | 短链任务删除 | 写 | session(会话) | id |  |  | data |

返回 `INDEX.md`。

