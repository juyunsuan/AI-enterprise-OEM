<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：HRM 人力（`hrm`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Hrm_calibration` | GET | `/enterprise/hrm/ai/calibration` | 校准 | 读 | session(会话) |  |  |  | data |
| `Hrm_listApplications` | GET | `/enterprise/hrm/applications` | 列表申请 | 读 | session(会话) |  | page, pageSize, jobId, status |  | data |
| `Hrm_createApplication` | POST | `/enterprise/hrm/applications/create` | 新建申请 | 写 | session(会话) |  |  | jobId, candidateId, channel | data |
| `Hrm_decideApplication` | POST | `/enterprise/hrm/applications/decide` | 处理申请 | 写 | session(会话) |  |  | id, decision, note | data |
| `Hrm_evaluateApplication` | POST | `/enterprise/hrm/applications/evaluate` | 评估申请 | 写 | session(会话) |  |  | id | data |
| `Hrm_listAttendance` | GET | `/enterprise/hrm/attendance` | 列表考勤 | 读 | session(会话) |  | page, pageSize, staffUserId, startDate, endDate |  | data |
| `Hrm_clock` | POST | `/enterprise/hrm/attendance/clock` | 打卡 | 写 | session(会话) |  |  | note | data |
| `Hrm_remedyClock` | POST | `/enterprise/hrm/attendance/remedy` | 补卡打卡 | 写 | session(会话) |  |  | logDate, checkType, at, reason | data |
| `Hrm_listBalances` | GET | `/enterprise/hrm/balances` | 列表余额 | 读 | session(会话) |  | year, staffUserId |  | data |
| `Hrm_listCandidates` | GET | `/enterprise/hrm/candidates` | 列表候选人 | 读 | session(会话) |  | page, pageSize, q |  | data |
| `Hrm_upsertCandidate` | POST | `/enterprise/hrm/candidates/upsert` | 保存候选人 | 写 | session(会话) |  |  | id, name, phone, email, source, resumeText, items, skills, tier, note | data |
| `Hrm_handoverChecklist` | GET | `/enterprise/hrm/handover` | HANDOVERCHECKLIST | 读 | session(会话) |  | memberUserId |  | data |
| `Hrm_transferHandover` | POST | `/enterprise/hrm/handover/transfer` | 转接HANDOVER | 写 | session(会话) |  |  | memberUserId, toUserId, assets, note | data |
| `Hrm_listHiringRequests` | GET | `/enterprise/hrm/hiring-requests` | 列表招聘申请 | 读 | session(会话) |  | page, pageSize, status |  | data |
| `Hrm_createHiringRequest` | POST | `/enterprise/hrm/hiring-requests/create` | 新建招聘申请 | 写 | session(会话) |  |  | department, position, headCount, expectedTier, budgetMonthly, reason | data |
| `Hrm_decideHiringRequest` | POST | `/enterprise/hrm/hiring-requests/decide` | 处理招聘申请 | 写 | session(会话) |  |  | id, decision, note | data |
| `Hrm_listHolidays` | GET | `/enterprise/hrm/holidays` | 列表节假日 | 读 | session(会话) |  | year |  | data |
| `Hrm_addHoliday` | POST | `/enterprise/hrm/holidays/add` | 添加节假日 | 写 | session(会话) |  |  | holidayDate, name, days | data |
| `Hrm_listInterviews` | GET | `/enterprise/hrm/interviews` | 列表面试 | 读 | session(会话) |  | page, pageSize, applicationId, status |  | data |
| `Hrm_rateInterview` | POST | `/enterprise/hrm/interviews/rate` | 费率面试 | 写 | session(会话) |  |  | interviewId, ratings | data |
| `Hrm_scheduleInterview` | POST | `/enterprise/hrm/interviews/schedule` | 定时任务面试 | 写 | session(会话) |  |  | applicationId, interviewerUserId, mode, scheduledAt, durationMin | data |
| `Hrm_listJobs` | GET | `/enterprise/hrm/jobs` | 列表生成任务 | 读 | session(会话) |  | page, pageSize, status, q |  | data |
| `Hrm_getJob` | GET | `/enterprise/hrm/jobs/:id` | 获取生成任务 | 读 | session(会话) | id |  |  | data |
| `Hrm_createJob` | POST | `/enterprise/hrm/jobs/create` | 新建生成任务 | 写 | session(会话) |  |  | title, department, headCount, tier, jd, minScore, hiringRequestId | data |
| `Hrm_generateJd` | POST | `/enterprise/hrm/jobs/generate-jd` | 生成职位描述 | 写 | session(会话) |  |  | title, tier, points | data |
| `Hrm_updateJob` | POST | `/enterprise/hrm/jobs/update` | 修改生成任务 | 写 | session(会话) |  |  | id, title, department, headCount, tier, jd, status, minScore | data |
| `Hrm_listOffers` | GET | `/enterprise/hrm/offers` | 列表录用 | 读 | session(会话) |  | page, pageSize, status |  | data |
| `Hrm_createOffer` | POST | `/enterprise/hrm/offers/create` | 新建录用 | 写 | session(会话) |  |  | applicationId, salaryMonthly, startAt, note | data |
| `Hrm_decideOffer` | POST | `/enterprise/hrm/offers/decide` | 处理录用 | 写 | session(会话) |  |  | id, decision, memberUserId | data |
| `Onboard_runs` | GET | `/enterprise/hrm/onboarding/runs` | 运行记录 | 读 | session(会话) |  | page, pageSize, status |  | data |
| `Onboard_startRun` | POST | `/enterprise/hrm/onboarding/runs` | 启动运行 | 写 | session(会话) |  |  | templateId, staffUserId, memberUserId, offerId, positionName | data |
| `Onboard_run` | GET | `/enterprise/hrm/onboarding/runs/:id` | 运行 | 读 | session(会话) | id |  |  | data |
| `Onboard_completeTask` | POST | `/enterprise/hrm/onboarding/tasks/:taskId/complete` | 完成任务 | 写 | session(会话) | taskId |  | status, note | data |
| `Onboard_templates` | GET | `/enterprise/hrm/onboarding/templates` | 模板 | 读 | session(会话) |  |  |  | data |
| `Onboard_saveTemplate` | POST | `/enterprise/hrm/onboarding/templates` | 保存模板 | 写 | session(会话) |  |  | id, name, kind, description, active, items | data |
| `Onboard_removeTemplate` | POST | `/enterprise/hrm/onboarding/templates/remove` | 删除模板 | 写 | session(会话) |  |  | id | data |
| `Hrm_listPolicies` | GET | `/enterprise/hrm/policies` | 列表策略 | 读 | session(会话) |  | year |  | data |
| `Hrm_savePolicy` | POST | `/enterprise/hrm/policies/save` | 保存策略 | 写 | session(会话) |  |  | year, name, quotas, isDefault | data |
| `Hrm_listProfiles` | GET | `/enterprise/hrm/profiles` | 列表档案 | 读 | session(会话) |  | page, pageSize, department, status, q |  | data |
| `Hrm_updateProfileStatus` | POST | `/enterprise/hrm/profiles/status` | 修改档案状态 | 写 | session(会话) |  |  | memberUserId, status, leftAt | data |
| `Hrm_upsertProfile` | POST | `/enterprise/hrm/profiles/upsert` | 保存档案 | 写 | session(会话) |  |  | memberUserId, employeeNo, employmentType, hourlyRate, supervisorUserId, department, skills, joinedAt, note | data |
| `Hrm_listReviews` | GET | `/enterprise/hrm/reviews` | 列表审核 | 读 | session(会话) |  | page, pageSize, staffUserId, period |  | data |
| `Hrm_upsertReview` | POST | `/enterprise/hrm/reviews/upsert` | 保存审核 | 写 | session(会话) |  |  | staffUserId, period, kind, performanceScore, potentialScore, summary, status | data |
| `Hrm_getRubric` | GET | `/enterprise/hrm/rubric` | 获取评估标准 | 读 | session(会话) |  | code |  | data |
| `Hrm_saveRubric` | POST | `/enterprise/hrm/rubric/save` | 保存评估标准 | 写 | session(会话) |  |  | code, dimensions, weights, thresholds, tierLexicon, promptDigest | data |
| `Hrm_listTimeOff` | GET | `/enterprise/hrm/timeoff` | 查看休假申请 | 读 | session(会话) |  | page, pageSize, staffUserId, status |  | data |
| `Hrm_createTimeOff` | POST | `/enterprise/hrm/timeoff/create` | 提交休假申请 | 写 | session(会话) |  |  | type, startDate, endDate, reason | data |
| `Hrm_decideTimeOff` | POST | `/enterprise/hrm/timeoff/decide` | 审批休假申请 | 写 | session(会话) |  |  | id, decision, note | data |

返回 `INDEX.md`。

