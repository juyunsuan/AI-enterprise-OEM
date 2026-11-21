<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：AI 能力（`ai`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Ai_ask` | POST | `/enterprise/ai/ask` | 提问 | 写 | session(会话) |  |  | question, sources, spaceIds, consumerType, consumerId, libraryIds, topK, maxChars | data |
| `Ai_classify` | POST | `/enterprise/ai/classify` | AI 分类 | 写 | session(会话) |  |  | text, labels, multi, instruction | data |
| `Ai_crmLeadScore` | POST | `/enterprise/ai/crm/lead-score` | CRM线索评分 | 写 | session(会话) |  |  | leadId | data |
| `Ai_distributionRewrite` | POST | `/enterprise/ai/distribution/rewrite` | AI 改写分发内容 | 写 | session(会话) |  |  | contentId, title, text, platformCodes | data |
| `Ai_extract` | POST | `/enterprise/ai/extract` | 提取 | 写 | session(会话) |  |  | text, fields, instruction | data |
| `Ai_hrmAttrition` | POST | `/enterprise/ai/hrm/attrition` | 人力人员流失 | 写 | session(会话) |  |  | memberUserId, note | data |
| `Ai_invoiceExtract` | POST | `/enterprise/ai/invoice/extract` | 开票提取 | 写 | session(会话) |  |  | text | data |
| `Ai_legalReview` | POST | `/enterprise/ai/legal/review` | 法律审核 | 写 | session(会话) |  |  | text, role | data |
| `Ai_mailboxAnalyze` | POST | `/enterprise/ai/mailbox/analyze` | AI 分析邮箱 | 写 | session(会话) |  |  | subject, from, body | data |
| `Ai_oaDraftApplication` | POST | `/enterprise/ai/oa/draft` | AI 起草 OA 申请 | 写 | session(会话) |  |  | text, orgType, orgUserId, templateId | data |
| `Ai_okrCheckKr` | POST | `/enterprise/ai/okr/check-kr` | OKR检查关键结果 | 写 | session(会话) |  |  | krId | data |
| `Ai_okrProgressSummary` | POST | `/enterprise/ai/okr/progress-summary` | OKR进展摘要 | 写 | session(会话) |  |  | cycleId | data |
| `Ai_overseasCheck` | POST | `/enterprise/ai/overseas/check` | 海外检查 | 写 | session(会话) |  |  | country, question, text | data |
| `Ai_projectSplitTask` | POST | `/enterprise/ai/project/split-task` | AI 拆分子任务 | 写 | session(会话) |  |  | taskId, max | data |
| `Ai_projectStandup` | POST | `/enterprise/ai/project/standup` | 项目站会 | 写 | session(会话) |  |  | projectId, days | data |
| `Ai_score` | POST | `/enterprise/ai/score` | 评分 | 写 | session(会话) |  |  | text, dimensions, guide, module | data |
| `Ai_socialCompose` | POST | `/enterprise/ai/social/compose` | 社交媒体撰写 | 写 | session(会话) |  |  | topic, platform, tone, intentText | data |
| `Ai_summarize` | POST | `/enterprise/ai/summarize` | 总结 | 写 | session(会话) |  |  | text, maxChars, instruction | data |
| `Ai_surveyReport` | POST | `/enterprise/ai/survey/report` | 问卷报告 | 写 | session(会话) |  |  | surveyId | data |
| `Ai_taxCheck` | POST | `/enterprise/ai/tax/check` | 财税检查 | 写 | session(会话) |  |  | text, region | data |
| `Transcribe_transcripts` | GET | `/enterprise/ai/transcripts` | 转写 | 读 | session(会话) |  | page, pageSize, targetType, targetId |  | data |
| `Transcribe_create` | POST | `/enterprise/ai/transcripts` | 新建 | 写 | session(会话) |  |  | title, targetType, targetId, mediaUrl, audioName, durationSec, language | data |
| `Transcribe_transcript` | GET | `/enterprise/ai/transcripts/:id` | 转写 | 读 | session(会话) | id |  |  | data |
| `Transcribe_applyInterviewDraft` | POST | `/enterprise/ai/transcripts/:id/apply-interview` | 申请面试草稿 | 写 | session(会话) | id |  | interviewId, interviewerUserId | data |
| `Transcribe_remove` | POST | `/enterprise/ai/transcripts/:id/remove` | 删除 | 写 | session(会话) | id |  |  | data |
| `Transcribe_summarize` | POST | `/enterprise/ai/transcripts/:id/summarize` | 总结 | 写 | session(会话) | id |  | prompt | data |

返回 `INDEX.md`。

