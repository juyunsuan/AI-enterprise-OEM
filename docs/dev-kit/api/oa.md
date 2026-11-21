<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：OA审批（`oa`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Oa_applications` | GET | `/enterprise/oa/applications` | 申请 | 读 | session(会话) |  | orgType, orgUserId, page, pageSize, scope, status, templateId, department, keyword, from, to |  | data |
| `Oa_deleteDraft` | DELETE | `/enterprise/oa/applications/:id` | 删除草稿 | 写 | session(会话) | id |  |  | data |
| `Oa_applicationDetail` | GET | `/enterprise/oa/applications/:id` | 申请详情 | 读 | session(会话) | id | orgType, orgUserId |  | data |
| `Oa_comment` | POST | `/enterprise/oa/applications/:id/comment` | 评论 | 写 | session(会话) | id |  | comment, attachments | data |
| `Oa_retryLink` | POST | `/enterprise/oa/applications/:id/links/:linkId/retry` | 重试短链 | 写 | session(会话) | id, linkId |  |  | data |
| `Oa_preReview` | POST | `/enterprise/oa/applications/:id/pre-review` | 预审核 | 写 | session(会话) | id |  |  | data |
| `Oa_records` | GET | `/enterprise/oa/applications/:id/records` | 记录 | 读 | session(会话) | id | orgType, orgUserId |  | data |
| `Oa_submit` | POST | `/enterprise/oa/applications/:id/submit` | 提交 | 写 | session(会话) | id |  |  | data |
| `Oa_withdraw` | POST | `/enterprise/oa/applications/:id/withdraw` | 撤回 | 写 | session(会话) | id |  | comment | data |
| `Oa_saveDraft` | POST | `/enterprise/oa/applications/draft` | 保存草稿 | 写 | session(会话) |  |  | orgType, orgUserId, id, templateId, title, formData, ccUserIds, attachments, linkTargets | data |
| `Oa_approvalInbox` | GET | `/enterprise/oa/approval-inbox` | 审批收件箱 | 读 | session(会话) |  | orgType, orgUserId |  | data |
| `Oa_cc` | GET | `/enterprise/oa/cc` | 抄送 | 读 | session(会话) |  | orgType, orgUserId, page, pageSize, keyword |  | data |
| `Oa_readCc` | POST | `/enterprise/oa/cc/:id/read` | 读取抄送 | 写 | session(会话) | id |  |  | data |
| `Oa_export` | GET | `/enterprise/oa/export` | 导出 | 读 | session(会话) |  | orgType, orgUserId, status, templateId, department, keyword, from, to |  | data |
| `Oa_linkSearch` | GET | `/enterprise/oa/link-search` | 短链搜索 | 读 | session(会话) |  | orgType, orgUserId, targetType, keyword, targetId |  | data |
| `Oa_linkTargets` | GET | `/enterprise/oa/link-targets` | 短链目标 | 读 | session(会话) |  |  |  | data |
| `Oa_overview` | GET | `/enterprise/oa/overview` | 概览 | 读 | session(会话) |  | orgType, orgUserId |  | data |
| `Oa_settings` | GET | `/enterprise/oa/settings` | 设置 | 读 | session(会话) |  | orgType, orgUserId |  | data |
| `Oa_saveSettings` | POST | `/enterprise/oa/settings` | 保存设置 | 写 | session(会话) |  |  | orgType, orgUserId, adminUserIds, deptHeads, remindAfterHours, allowWithdraw | data |
| `Oa_tasks` | GET | `/enterprise/oa/tasks` | 任务 | 读 | session(会话) |  | orgType, orgUserId, page, pageSize, keyword, templateId |  | data |
| `Oa_addSign` | POST | `/enterprise/oa/tasks/:id/add-sign` | 添加签约 | 写 | session(会话) | id |  | userIds, comment | data |
| `Oa_approve` | POST | `/enterprise/oa/tasks/:id/approve` | 通过 | 写 | session(会话) | id |  | comment | data |
| `Oa_reject` | POST | `/enterprise/oa/tasks/:id/reject` | 驳回 | 写 | session(会话) | id |  | comment | data |
| `Oa_return` | POST | `/enterprise/oa/tasks/:id/return` | 退回 | 写 | session(会话) | id |  | comment | data |
| `Oa_transfer` | POST | `/enterprise/oa/tasks/:id/transfer` | 转接 | 写 | session(会话) | id |  | targetUserId, comment | data |
| `Oa_done` | GET | `/enterprise/oa/tasks/done` | 完成 | 读 | session(会话) |  | orgType, orgUserId, page, pageSize, keyword |  | data |
| `Oa_templates` | GET | `/enterprise/oa/templates` | 模板 | 读 | session(会话) |  | orgType, orgUserId, category, enabledOnly |  | data |
| `Oa_saveTemplate` | POST | `/enterprise/oa/templates` | 保存模板 | 写 | session(会话) |  |  | orgType, orgUserId, id, key, name, category, description, icon, numberPrefix, fields, flow, linkage, enabled, sortOrder | data |
| `Oa_deleteTemplate` | DELETE | `/enterprise/oa/templates/:id` | 删除模板 | 写 | session(会话) | id |  |  | data |
| `Oa_templateDetail` | GET | `/enterprise/oa/templates/:id` | 模板详情 | 读 | session(会话) | id | orgType, orgUserId |  | data |
| `Oa_copyTemplate` | POST | `/enterprise/oa/templates/:id/copy` | 模板复制 | 写 | session(会话) | id |  | key, name | data |
| `Oa_toggleTemplate` | POST | `/enterprise/oa/templates/:id/toggle` | 启停模板 | 写 | session(会话) | id |  | enabled | data |
| `Oa_workspace` | GET | `/enterprise/oa/workspace` | 工作台 | 读 | session(会话) |  | orgType, orgUserId |  | data |

返回 `INDEX.md`。

