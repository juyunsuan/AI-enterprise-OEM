<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：低代码应用（`lowcode`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `LowCode_projects` | GET | `/enterprise/lowcode/projects` | 项目 | 读 | session(会话) |  | scope, type, keyword |  | data |
| `LowCode_projectCreate` | POST | `/enterprise/lowcode/projects` | 新建项目 | 写 | session(会话) |  |  | name, templateKey, description, orgType, orgUserId, icon | data |
| `LowCode_projectDelete` | DELETE | `/enterprise/lowcode/projects/:id` | 删除项目 | 写 | session(会话) | id |  |  | data |
| `LowCode_projectDetail` | GET | `/enterprise/lowcode/projects/:id` | 项目详情 | 读 | session(会话) | id |  |  | data |
| `LowCode_projectUpdate` | POST | `/enterprise/lowcode/projects/:id` | 修改项目 | 写 | session(会话) | id |  | name, description, icon, status, settings | data |
| `LowCode_aiAsk` | POST | `/enterprise/lowcode/projects/:id/ai/ask` | 提问AI | 写 | session(会话) | id |  | entityId, question | data |
| `LowCode_aiChannels` | GET | `/enterprise/lowcode/projects/:id/ai/channels` | AI渠道 | 读 | session(会话) | id |  |  | data |
| `LowCode_aiFill` | POST | `/enterprise/lowcode/projects/:id/ai/fill` | AI填充 | 写 | session(会话) | id |  | entityId, text | data |
| `LowCode_aiModels` | GET | `/enterprise/lowcode/projects/:id/ai/models` | AI模型 | 读 | session(会话) | id | channelId |  | data |
| `LowCode_aiSettings` | GET | `/enterprise/lowcode/projects/:id/ai/settings` | AI设置 | 读 | session(会话) | id |  |  | data |
| `LowCode_aiSaveSettings` | POST | `/enterprise/lowcode/projects/:id/ai/settings` | 保存AI设置 | 写 | session(会话) | id |  | channelId, model | data |
| `LowCode_approvalAct` | POST | `/enterprise/lowcode/projects/:id/approval-act` | 处理审批 | 写 | session(会话) | id |  | taskId, action, comment | data |
| `LowCode_approvalFlows` | GET | `/enterprise/lowcode/projects/:id/approval-flows` | 查看审批流程 | 读 | session(会话) | id | entityId |  | data |
| `LowCode_approvalFlowSave` | POST | `/enterprise/lowcode/projects/:id/approval-flows` | 保存审批流程 | 写 | session(会话) | id |  | id, entityId, name, status, nodes | data |
| `LowCode_approvalFlowDelete` | DELETE | `/enterprise/lowcode/projects/:id/approval-flows/:flowId` | 删除审批流程 | 写 | session(会话) | id, flowId |  |  | data |
| `LowCode_approvalSubmit` | POST | `/enterprise/lowcode/projects/:id/approval-submit` | 提交审批 | 写 | session(会话) | id |  | entityId, rowId, flowId, comment | data |
| `LowCode_approvalTasks` | GET | `/enterprise/lowcode/projects/:id/approval-tasks` | 查看审批待办 | 读 | session(会话) | id | page, pageSize, status |  | data |
| `LowCode_assets` | GET | `/enterprise/lowcode/projects/:id/assets` | 资产 | 读 | session(会话) | id | page, pageSize, keyword |  | data |
| `LowCode_uploadAsset` | POST | `/enterprise/lowcode/projects/:id/assets/upload` | 上传资产 | 写 | session(会话) | id |  | name, contentType, contentBase64, fieldKey | data |
| `LowCode_availableTables` | GET | `/enterprise/lowcode/projects/:id/available-tables` | 查看可用数据表 | 读 | session(会话) | id |  |  | data |
| `LowCode_dataRules` | GET | `/enterprise/lowcode/projects/:id/data-rules` | 数据规则 | 读 | session(会话) | id | entityId |  | data |
| `LowCode_dataRuleSave` | POST | `/enterprise/lowcode/projects/:id/data-rules` | 保存数据规则 | 写 | session(会话) | id |  | id, entityId, roleId, field, op, value | data |
| `LowCode_dataRuleDelete` | DELETE | `/enterprise/lowcode/projects/:id/data-rules/:ruleId` | 删除数据规则 | 写 | session(会话) | id, ruleId |  |  | data |
| `LowCode_entities` | GET | `/enterprise/lowcode/projects/:id/entities` | 业务对象 | 读 | session(会话) | id |  |  | data |
| `LowCode_entitySave` | POST | `/enterprise/lowcode/projects/:id/entities` | 保存业务对象 | 写 | session(会话) | id |  | id, name, icon, dataTableId, newTableName, formLayout, listLayout, kanbanField, sort, fields | data |
| `LowCode_entityDelete` | DELETE | `/enterprise/lowcode/projects/:id/entities/:entityId` | 删除业务对象 | 写 | session(会话) | id, entityId |  |  | data |
| `LowCode_entityRowExport` | POST | `/enterprise/lowcode/projects/:id/entities/:entityId/export` | 业务对象行导出 | 写 | session(会话) | id, entityId |  | keyword, sort, sortDir, filter | data |
| `LowCode_entityFields` | GET | `/enterprise/lowcode/projects/:id/entities/:entityId/fields` | 业务对象字段 | 读 | session(会话) | id, entityId |  |  | data |
| `LowCode_entityFieldSave` | POST | `/enterprise/lowcode/projects/:id/entities/:entityId/fields` | 保存业务对象字段 | 写 | session(会话) | id, entityId |  | fieldKey, name, fieldType, required, options | data |
| `LowCode_entityFieldDelete` | DELETE | `/enterprise/lowcode/projects/:id/entities/:entityId/fields/:fieldKey` | 删除业务对象字段 | 写 | session(会话) | id, entityId, fieldKey |  |  | data |
| `LowCode_entityRows` | GET | `/enterprise/lowcode/projects/:id/entities/:entityId/rows` | 业务对象行 | 读 | session(会话) | id, entityId | page, pageSize, keyword, sort, sortDir, filter |  | data |
| `LowCode_entityRowCreate` | POST | `/enterprise/lowcode/projects/:id/entities/:entityId/rows` | 新建业务对象行 | 写 | session(会话) | id, entityId |  | data | data |
| `LowCode_entityRowDelete` | DELETE | `/enterprise/lowcode/projects/:id/entities/:entityId/rows/:rowId` | 删除业务对象行 | 写 | session(会话) | id, entityId, rowId |  |  | data |
| `LowCode_entityRow` | GET | `/enterprise/lowcode/projects/:id/entities/:entityId/rows/:rowId` | 业务对象行 | 读 | session(会话) | id, entityId, rowId |  |  | data |
| `LowCode_entityRowUpdate` | POST | `/enterprise/lowcode/projects/:id/entities/:entityId/rows/:rowId` | 修改业务对象行 | 写 | session(会话) | id, entityId, rowId |  | data | data |
| `LowCode_recordApproval` | GET | `/enterprise/lowcode/projects/:id/entities/:entityId/rows/:rowId/approval` | 记录审批结果 | 读 | session(会话) | id, entityId, rowId |  |  | data |
| `LowCode_memberCandidates` | GET | `/enterprise/lowcode/projects/:id/member-candidates` | 会员候选人 | 读 | session(会话) | id | keyword |  | data |
| `LowCode_members` | GET | `/enterprise/lowcode/projects/:id/members` | 会员 | 读 | session(会话) | id |  |  | data |
| `LowCode_memberAdd` | POST | `/enterprise/lowcode/projects/:id/members` | 会员添加 | 写 | session(会话) | id |  | userIds, roleId | data |
| `LowCode_memberRemove` | DELETE | `/enterprise/lowcode/projects/:id/members/:memberId` | 会员删除 | 写 | session(会话) | id, memberId |  |  | data |
| `LowCode_memberUpdate` | POST | `/enterprise/lowcode/projects/:id/members/:memberId` | 会员修改 | 写 | session(会话) | id, memberId |  | roleId | data |
| `LowCode_pages` | GET | `/enterprise/lowcode/projects/:id/pages` | 页面 | 读 | session(会话) | id |  |  | data |
| `LowCode_pageSave` | POST | `/enterprise/lowcode/projects/:id/pages` | 保存页面 | 写 | session(会话) | id |  | id, parentId, type, name, entityId, config, sort, visible | data |
| `LowCode_pageDelete` | DELETE | `/enterprise/lowcode/projects/:id/pages/:pageId` | 删除页面 | 写 | session(会话) | id, pageId |  |  | data |
| `LowCode_pageReorder` | POST | `/enterprise/lowcode/projects/:id/pages/reorder` | 重排页面 | 写 | session(会话) | id |  | ids | data |
| `LowCode_roles` | GET | `/enterprise/lowcode/projects/:id/roles` | 身份 | 读 | session(会话) | id |  |  | data |
| `LowCode_roleSave` | POST | `/enterprise/lowcode/projects/:id/roles` | 保存身份 | 写 | session(会话) | id |  | id, key, name, description | data |
| `LowCode_roleDelete` | DELETE | `/enterprise/lowcode/projects/:id/roles/:roleId` | 删除身份 | 写 | session(会话) | id, roleId |  |  | data |
| `LowCode_rolePermissions` | GET | `/enterprise/lowcode/projects/:id/roles/:roleId/permissions` | 身份权限 | 读 | session(会话) | id, roleId |  |  | data |
| `LowCode_rolePermissionSave` | POST | `/enterprise/lowcode/projects/:id/roles/:roleId/permissions` | 保存身份权限 | 写 | session(会话) | id, roleId |  | permissions | data |
| `LowCode_projectTemplates` | GET | `/enterprise/lowcode/templates` | 模板项目 | 读 | session(会话) |  |  |  | data |

返回 `INDEX.md`。

