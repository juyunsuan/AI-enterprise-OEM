<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：项目与任务（`project`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Pj_projectInsight` | POST | `/enterprise/project/ai/insight` | 项目洞察 | 写 | session(会话) |  |  | projectId | data |
| `Pj_wbsSuggest` | POST | `/enterprise/project/ai/wbs` | 工作分解建议 | 写 | session(会话) |  |  | projectId, requirement, maxTasks | data |
| `Pj_listCostItems` | GET | `/enterprise/project/cost-items` | 列表成本明细 | 读 | session(会话) |  | page, pageSize, projectId, kind |  | data |
| `Pj_removeCostItem` | POST | `/enterprise/project/cost-items/remove` | 删除成本明细 | 写 | session(会话) |  |  | id | data |
| `Pj_saveCostItem` | POST | `/enterprise/project/cost-items/save` | 保存成本明细 | 写 | session(会话) |  |  | id, projectId, kind, title, qty, unit, unitCost, currency, occurredAt, note | data |
| `Pj_listCostRates` | GET | `/enterprise/project/cost-rates` | 列表成本费率 | 读 | session(会话) |  | page, pageSize, principalType, q |  | data |
| `Pj_removeCostRate` | POST | `/enterprise/project/cost-rates/remove` | 删除成本费率 | 写 | session(会话) |  |  | id | data |
| `Pj_saveCostRate` | POST | `/enterprise/project/cost-rates/save` | 保存成本费率 | 写 | session(会话) |  |  | id, principalType, principalId, role, hourlyRate, dailyRate, currency, effectiveFrom, effectiveTo | data |
| `Pj_listEngagements` | GET | `/enterprise/project/engagements` | 列表外部合作 | 读 | session(会话) |  | page, pageSize, projectId, partyId, status |  | data |
| `Pj_decideEngagement` | POST | `/enterprise/project/engagements/:id/decide` | 处理外部合作 | 写 | session(会话) | id |  | decision, note | data |
| `Pj_removeEngagement` | POST | `/enterprise/project/engagements/remove` | 删除外部合作 | 写 | session(会话) |  |  | id | data |
| `Pj_saveEngagement` | POST | `/enterprise/project/engagements/save` | 保存外部合作 | 写 | session(会话) |  |  | id, projectId, partyId, scope, contractId, amount, currency, paymentTerms, acceptance, startDate, endDate | data |
| `Pj_removeMember` | POST | `/enterprise/project/members/remove` | 删除会员 | 写 | session(会话) |  |  | id | data |
| `Pj_saveMember` | POST | `/enterprise/project/members/save` | 保存会员 | 写 | session(会话) |  |  | id, projectId, principalType, principalId, role, allocationPct | data |
| `Pj_listMilestones` | GET | `/enterprise/project/milestones` | 列表里程碑 | 读 | session(会话) |  | projectId |  | data |
| `Pj_removeMilestone` | POST | `/enterprise/project/milestones/remove` | 删除里程碑 | 写 | session(会话) |  |  | id | data |
| `Pj_saveMilestone` | POST | `/enterprise/project/milestones/save` | 保存里程碑 | 写 | session(会话) |  |  | id, projectId, name, dueDate, status, deliverable, acceptanceNote | data |
| `Pj_overview` | GET | `/enterprise/project/overview` | 概览 | 读 | session(会话) |  |  |  | data |
| `Pj_listProjects` | GET | `/enterprise/project/projects` | 列表项目 | 读 | session(会话) |  | page, pageSize, status, q |  | data |
| `Pj_getProject` | GET | `/enterprise/project/projects/:id` | 获取项目 | 读 | session(会话) | id |  |  | data |
| `Pj_projectCost` | GET | `/enterprise/project/projects/:id/cost` | 项目成本 | 读 | session(会话) | id |  |  | data |
| `Pj_createProjectFromContract` | POST | `/enterprise/project/projects/from-contract` | 新建项目由合同 | 写 | session(会话) |  |  | contractId, ownerId, targetOutcome | data |
| `Pj_removeProject` | POST | `/enterprise/project/projects/remove` | 删除项目 | 写 | session(会话) |  |  | id | data |
| `Pj_saveProject` | POST | `/enterprise/project/projects/save` | 保存项目 | 写 | session(会话) |  |  | id, code, name, description, source, sourceRef, customerName, contractId, ownerId, status, startDate, endDate, budgetAmount, budgetHours, currency | data |
| `Pj_purchaseReconciliation` | GET | `/enterprise/project/purchase-reconciliation` | 采购RECONCILIATION | 读 | session(会话) |  | onlyIssues |  | data |
| `Pj_riskList` | GET | `/enterprise/project/risks` | 风险列表 | 读 | session(会话) |  |  |  | data |
| `Pj_settingsGet` | GET | `/enterprise/project/settings` | 获取设置 | 读 | session(会话) |  |  |  | data |
| `Pj_settingsSave` | POST | `/enterprise/project/settings/save` | 保存设置 | 写 | session(会话) |  |  | statuses, taskTypes, currency, standardHoursPerDay | data |
| `Pj_listSprints` | GET | `/enterprise/project/sprints` | 列表迭代 | 读 | session(会话) |  | projectId |  | data |
| `Pj_removeSprint` | POST | `/enterprise/project/sprints/remove` | 删除迭代 | 写 | session(会话) |  |  | id | data |
| `Pj_saveSprint` | POST | `/enterprise/project/sprints/save` | 保存迭代 | 写 | session(会话) |  |  | id, projectId, name, goal, startDate, endDate, capacityHours, status | data |
| `TaskSync_bindings` | GET | `/enterprise/project/task-sync` | 绑定 | 读 | session(会话) |  | projectId |  | data |
| `TaskSync_saveBinding` | POST | `/enterprise/project/task-sync` | 保存绑定 | 写 | session(会话) |  |  | id, projectId, provider, baseUrl, projectKey, username, token, enabled | data |
| `TaskSync_links` | GET | `/enterprise/project/task-sync/:id/links` | 短链 | 读 | session(会话) | id | page, pageSize |  | data |
| `TaskSync_run` | POST | `/enterprise/project/task-sync/:id/run` | 运行 | 写 | session(会话) | id |  | direction | data |
| `TaskSync_runs` | GET | `/enterprise/project/task-sync/:id/runs` | 运行记录 | 读 | session(会话) | id | page, pageSize |  | data |
| `TaskSync_removeBinding` | POST | `/enterprise/project/task-sync/remove` | 删除绑定 | 写 | session(会话) |  |  | id | data |
| `Pj_listTasks` | GET | `/enterprise/project/tasks` | 任务列表 | 读 | session(会话) |  | page, pageSize, projectId, sprintId, status, assigneeId, q |  | data |
| `Pj_getDemand` | GET | `/enterprise/project/tasks/:id/demand` | 获取需求 | 读 | session(会话) | id |  |  | data |
| `Pj_acceptDemand` | POST | `/enterprise/project/tasks/demand/accept` | 承接需求 | 写 | session(会话) |  |  | demandId, responseId, note | data |
| `Pj_closeDemand` | POST | `/enterprise/project/tasks/demand/close` | 关闭需求 | 写 | session(会话) |  |  | demandId | data |
| `Pj_respondDemand` | POST | `/enterprise/project/tasks/demand/respond` | 响应需求 | 写 | session(会话) |  |  | demandId, partyId, partyName, contact, quoteAmount, currency, durationDays, note | data |
| `Pj_saveDemand` | POST | `/enterprise/project/tasks/demand/save` | 保存需求 | 写 | session(会话) |  |  | taskId, title, scope, deliverables, acceptance, budgetAmount, currency, startDate, dueDate, publish | data |
| `Pj_moveTask` | POST | `/enterprise/project/tasks/move` | 出入库任务 | 写 | session(会话) |  |  | id, status, sortOrder | data |
| `Pj_addRelation` | POST | `/enterprise/project/tasks/relations/add` | 添加关联 | 写 | session(会话) |  |  | taskId, relatedTaskId, kind | data |
| `Pj_removeRelation` | POST | `/enterprise/project/tasks/relations/remove` | 删除关联 | 写 | session(会话) |  |  | id | data |
| `Pj_removeTask` | POST | `/enterprise/project/tasks/remove` | 删除任务 | 写 | session(会话) |  |  | id | data |
| `Pj_saveTask` | POST | `/enterprise/project/tasks/save` | 保存任务 | 写 | session(会话) |  |  | id, projectId, sprintId, milestoneId, parentId, title, description, sourceType, sourceId, acceptanceCriteria, qualityRubric, assessmentWeight, type, priority, status, assigneeType, assigneeId, estimateHours, estimatePoints, startDate, dueDate, sortOrder | data |
| `TimeAudit_edits` | GET | `/enterprise/project/time-audit/edits` | 修改记录 | 读 | session(会话) |  | page, pageSize, action, timeLogId |  | data |
| `TimeAudit_summary` | GET | `/enterprise/project/time-audit/summary` | 摘要 | 读 | session(会话) |  | days |  | data |
| `Pj_listTimeLogs` | GET | `/enterprise/project/time-logs` | 列表工时日志 | 读 | session(会话) |  | page, pageSize, projectId, taskId, principalId, startDate, endDate, status |  | data |
| `Pj_decideTimeLog` | POST | `/enterprise/project/time-logs/decide` | 处理工时日志 | 写 | session(会话) |  |  | id, decision, note | data |
| `Pj_removeTimeLog` | POST | `/enterprise/project/time-logs/remove` | 删除工时日志 | 写 | session(会话) |  |  | id | data |
| `Pj_addTimeLog` | POST | `/enterprise/project/time-logs/save` | 添加工时日志 | 写 | session(会话) |  |  | projectId, taskId, workDate, startAt, endAt, durationMinutes, note, source | data |
| `Pj_startTimer` | POST | `/enterprise/project/time-logs/start` | 启动计时 | 写 | session(会话) |  |  | projectId, taskId, note | data |
| `Pj_stopTimer` | POST | `/enterprise/project/time-logs/stop` | 停止计时 | 写 | session(会话) |  |  | id, durationMinutes, note | data |
| `Pj_listTimesheets` | GET | `/enterprise/project/timesheets` | 列表工时表 | 读 | session(会话) |  | page, pageSize, principalId, status, periodStart |  | data |
| `Pj_decideTimesheet` | POST | `/enterprise/project/timesheets/decide` | 处理工时表 | 写 | session(会话) |  |  | id, decision, note | data |
| `Pj_generateTimesheet` | POST | `/enterprise/project/timesheets/generate` | 生成工时表 | 写 | session(会话) |  |  | principalType, principalId, periodStart, periodEnd | data |

返回 `INDEX.md`。

