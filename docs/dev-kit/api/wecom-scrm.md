<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：企微 SCRM（`wecom-scrm`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Scrm_chats` | GET | `/enterprise/wecom-scrm/chats` | 对话 | 读 | session(会话) |  | page, pageSize, keyword, ownerStaffId, groupName, status |  | data |
| `Scrm_chat` | GET | `/enterprise/wecom-scrm/chats/detail` | 对话 | 读 | session(会话) |  | id |  | data |
| `Scrm_chatGroups` | GET | `/enterprise/wecom-scrm/chats/groups` | 对话群 | 读 | session(会话) |  |  |  | data |
| `Scrm_moveChats` | POST | `/enterprise/wecom-scrm/chats/groups/move` | 出入库对话 | 写 | session(会话) |  |  | chatIds, groupId | data |
| `Scrm_saveChatGroup` | POST | `/enterprise/wecom-scrm/chats/groups/save` | 保存对话群 | 写 | session(会话) |  |  | id, name, sort | data |
| `Scrm_roomPulls` | GET | `/enterprise/wecom-scrm/chats/pulls` | 客户群拉群 | 读 | session(会话) |  |  |  | data |
| `Scrm_runRoomPull` | POST | `/enterprise/wecom-scrm/chats/pulls/run` | 运行客户群拉群 | 写 | session(会话) |  |  | id | data |
| `Scrm_saveRoomPull` | POST | `/enterprise/wecom-scrm/chats/pulls/save` | 保存客户群拉群 | 写 | session(会话) |  |  | id, name, chatIds, welcomeId, tagIds | data |
| `Scrm_codes` | GET | `/enterprise/wecom-scrm/codes` | 活码 | 读 | session(会话) |  | page, pageSize, keyword |  | data |
| `Scrm_removeCode` | POST | `/enterprise/wecom-scrm/codes/remove` | 删除活码 | 写 | session(会话) |  |  | id | data |
| `Scrm_saveCode` | POST | `/enterprise/wecom-scrm/codes/save` | 保存活码 | 写 | session(会话) |  |  | id, name, groupName, scene, tagIds, welcomeId, staffStrategy, dailyLimit, staff | data |
| `Scrm_codeStats` | GET | `/enterprise/wecom-scrm/codes/stats` | 活码统计 | 读 | session(会话) |  | days |  | data |
| `Scrm_checkText` | POST | `/enterprise/wecom-scrm/compliance/check` | 检查文本 | 写 | session(会话) |  |  | text, direction | data |
| `Scrm_sensitiveHits` | GET | `/enterprise/wecom-scrm/compliance/hits` | 敏感词命中 | 读 | session(会话) |  | page, pageSize, direction |  | data |
| `Scrm_qc` | POST | `/enterprise/wecom-scrm/compliance/qc` | 质检 | 写 | session(会话) |  |  | contactId, conversationId, text | data |
| `Scrm_sensitiveWords` | GET | `/enterprise/wecom-scrm/compliance/words` | 敏感词词 | 读 | session(会话) |  |  |  | data |
| `Scrm_removeSensitiveWord` | POST | `/enterprise/wecom-scrm/compliance/words/remove` | 删除敏感词词 | 写 | session(会话) |  |  | id | data |
| `Scrm_saveSensitiveWord` | POST | `/enterprise/wecom-scrm/compliance/words/save` | 保存敏感词词 | 写 | session(会话) |  |  | id, group, word, action, direction, replacement, enabled | data |
| `Scrm_contacts` | GET | `/enterprise/wecom-scrm/contacts` | 联系方式 | 读 | session(会话) |  | page, pageSize, keyword, status, staffUserId, tagId, codeId, crmCustomerId, from, to |  | data |
| `Scrm_assignContact` | POST | `/enterprise/wecom-scrm/contacts/assign` | 指派联系人 | 写 | session(会话) |  |  | id, staffUserId | data |
| `Scrm_contact` | GET | `/enterprise/wecom-scrm/contacts/detail` | 联系人 | 读 | session(会话) |  | id |  | data |
| `Scrm_saveContactFields` | POST | `/enterprise/wecom-scrm/contacts/fields` | 保存联系人字段 | 写 | session(会话) |  |  | contactId, values | data |
| `Scrm_promoteContact` | POST | `/enterprise/wecom-scrm/contacts/promote` | 转化联系人 | 写 | session(会话) |  |  | id | data |
| `Scrm_batchTag` | POST | `/enterprise/wecom-scrm/contacts/tags` | 标记批次 | 写 | session(会话) |  |  | contactIds, addTagIds, removeTagIds | data |
| `Scrm_batchTagByFilter` | POST | `/enterprise/wecom-scrm/contacts/tags/batch` | 按条件批量打标 | 写 | session(会话) |  |  | keyword, status, staffUserId, tagId, addTagIds, removeTagIds | data |
| `Scrm_updateContact` | POST | `/enterprise/wecom-scrm/contacts/update` | 修改联系人 | 写 | session(会话) |  |  | id, remark, description | data |
| `Scrm_fields` | GET | `/enterprise/wecom-scrm/fields` | 字段 | 读 | session(会话) |  |  |  | data |
| `Scrm_removeField` | POST | `/enterprise/wecom-scrm/fields/remove` | 删除字段 | 写 | session(会话) |  |  | id | data |
| `Scrm_saveField` | POST | `/enterprise/wecom-scrm/fields/save` | 保存字段 | 写 | session(会话) |  |  | id, key, label, type, options, required, sort, description | data |
| `Scrm_massTasks` | GET | `/enterprise/wecom-scrm/mass` | 查看群发任务 | 读 | session(会话) |  | page, pageSize, type, status |  | data |
| `Scrm_requestMassReview` | POST | `/enterprise/wecom-scrm/mass/request-review` | 提交群发审核 | 写 | session(会话) |  |  | id | data |
| `Scrm_reviewMassTask` | POST | `/enterprise/wecom-scrm/mass/review` | 审核群发任务 | 写 | session(会话) |  |  | id, approve, note | data |
| `Scrm_saveMassTask` | POST | `/enterprise/wecom-scrm/mass/save` | 保存群发任务 | 写 | session(会话) |  |  | id, type, name, targetFilter, content, scheduledAt | data |
| `Scrm_submitMassTask` | POST | `/enterprise/wecom-scrm/mass/submit` | 提交群发任务 | 写 | session(会话) |  |  | id | data |
| `Scrm_massTargets` | GET | `/enterprise/wecom-scrm/mass/targets` | 查看群发对象 | 读 | session(会话) |  | page, pageSize, taskId, status |  | data |
| `Scrm_materials` | GET | `/enterprise/wecom-scrm/materials` | 材料 | 读 | session(会话) |  |  |  | data |
| `Scrm_removeMaterial` | POST | `/enterprise/wecom-scrm/materials/remove` | 删除材料 | 写 | session(会话) |  |  | id | data |
| `Scrm_saveMaterial` | POST | `/enterprise/wecom-scrm/materials/save` | 保存材料 | 写 | session(会话) |  |  | id, type, title, content, assetId, link, miniProgram | data |
| `Scrm_overview` | GET | `/enterprise/wecom-scrm/overview` | 概览 | 读 | session(会话) |  |  |  | data |
| `Scrm_settings` | GET | `/enterprise/wecom-scrm/settings` | 设置 | 读 | session(会话) |  |  |  | data |
| `Scrm_saveSettings` | POST | `/enterprise/wecom-scrm/settings/save` | 保存设置 | 写 | session(会话) |  |  | corpId, corpName, agentId, contactSecret, appSecret, callbackToken, aesKey, archiveSecret, archivePrivateKey, enabled | data |
| `Scrm_testConnection` | POST | `/enterprise/wecom-scrm/settings/test` | 测试连接 | 写 | session(会话) |  |  |  | data |
| `Scrm_sidebar` | GET | `/enterprise/wecom-scrm/sidebar` | 侧边栏 | 读 | session(会话) |  | contactId |  | data |
| `Scrm_sidebarTicket` | POST | `/enterprise/wecom-scrm/sidebar/ticket` | 侧边栏工单 | 写 | session(会话) |  |  | contactId | data |
| `Scrm_sops` | GET | `/enterprise/wecom-scrm/sop` | 标准流程 | 读 | session(会话) |  |  |  | data |
| `Scrm_removeSop` | POST | `/enterprise/wecom-scrm/sop/remove` | 删除标准流程 | 写 | session(会话) |  |  | id | data |
| `Scrm_runSop` | POST | `/enterprise/wecom-scrm/sop/run` | 运行标准流程 | 写 | session(会话) |  |  | id | data |
| `Scrm_saveSop` | POST | `/enterprise/wecom-scrm/sop/save` | 保存标准流程 | 写 | session(会话) |  |  | id, name, trigger, triggerConfig, actions, enabled | data |
| `Scrm_sopTasks` | GET | `/enterprise/wecom-scrm/sop/tasks` | 任务标准流程 | 读 | session(会话) |  | page, pageSize, status, staffUserId, contactId |  | data |
| `Scrm_completeSopTask` | POST | `/enterprise/wecom-scrm/sop/tasks/complete` | 完成标准流程任务 | 写 | session(会话) |  |  | id, status, result | data |
| `Scrm_exportStats` | POST | `/enterprise/wecom-scrm/stats/export` | 导出统计 | 写 | session(会话) |  |  | days | data |
| `Scrm_statsStaff` | GET | `/enterprise/wecom-scrm/stats/staff` | 统计职员 | 读 | session(会话) |  | days |  | data |
| `Scrm_statsTrend` | GET | `/enterprise/wecom-scrm/stats/trend` | 统计趋势 | 读 | session(会话) |  | days |  | data |
| `Scrm_sync` | POST | `/enterprise/wecom-scrm/sync` | 同步 | 写 | session(会话) |  |  | scope | data |
| `Scrm_tagGroups` | GET | `/enterprise/wecom-scrm/tags` | 标记群 | 读 | session(会话) |  |  |  | data |
| `Scrm_autoTagRules` | GET | `/enterprise/wecom-scrm/tags/rules` | 标记自动规则 | 读 | session(会话) |  |  |  | data |
| `Scrm_removeAutoTagRule` | POST | `/enterprise/wecom-scrm/tags/rules/remove` | 删除自动标记规则 | 写 | session(会话) |  |  | id | data |
| `Scrm_saveAutoTagRule` | POST | `/enterprise/wecom-scrm/tags/rules/save` | 保存自动标记规则 | 写 | session(会话) |  |  | id, name, event, conditions, tagIds, codeIds, enabled | data |
| `Scrm_syncTags` | POST | `/enterprise/wecom-scrm/tags/sync` | 同步标签 | 写 | session(会话) |  |  |  | data |
| `Scrm_terminalSettings` | GET | `/enterprise/wecom-scrm/terminals` | TERMINAL设置 | 读 | session(会话) |  |  |  | data |
| `Scrm_terminalToggle` | POST | `/enterprise/wecom-scrm/terminals/toggle` | 启停TERMINAL | 写 | session(会话) |  |  | scene, sourceId, enabled | data |
| `Scrm_transfers` | GET | `/enterprise/wecom-scrm/transfers` | 转接 | 读 | session(会话) |  | page, pageSize, type |  | data |
| `Scrm_createTransfer` | POST | `/enterprise/wecom-scrm/transfers/create` | 新建转接 | 写 | session(会话) |  |  | type, targets, toStaffId | data |
| `Scrm_refreshTransfer` | POST | `/enterprise/wecom-scrm/transfers/refresh` | 刷新转接 | 写 | session(会话) |  |  | id | data |
| `Scrm_unassigned` | GET | `/enterprise/wecom-scrm/transfers/unassigned` | 未分配 | 读 | session(会话) |  |  |  | data |
| `Scrm_welcomes` | GET | `/enterprise/wecom-scrm/welcomes` | 欢迎语 | 读 | session(会话) |  |  |  | data |
| `Scrm_removeWelcome` | POST | `/enterprise/wecom-scrm/welcomes/remove` | 删除欢迎语 | 写 | session(会话) |  |  | id | data |
| `Scrm_saveWelcome` | POST | `/enterprise/wecom-scrm/welcomes/save` | 保存欢迎语 | 写 | session(会话) |  |  | id, name, scope, staffUserId, content, materialIds, enabled | data |

返回 `INDEX.md`。

