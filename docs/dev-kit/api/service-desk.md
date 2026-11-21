<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：客服工单（`service-desk`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `AfterSales_tickets` | GET | `/enterprise/service-desk/after-sales` | 工单 | 读 | session(会话) |  | page, pageSize, status |  | data |
| `AfterSales_saveTicket` | POST | `/enterprise/service-desk/after-sales` | 保存工单 | 写 | session(会话) |  |  | id, conversationId, orderNo, kind, reason, amount, contact, note, assigneeUserId | data |
| `AfterSales_ticket` | GET | `/enterprise/service-desk/after-sales/:id` | 工单 | 读 | session(会话) | id |  |  | data |
| `AfterSales_advance` | POST | `/enterprise/service-desk/after-sales/:id/advance` | 推进 | 写 | session(会话) | id |  | toStatus, note | data |
| `ServiceDesk_agents` | GET | `/enterprise/service-desk/agents` | 查看客服成员 | 读 | session(会话) |  |  |  | data |
| `ServiceDesk_saveAgent` | POST | `/enterprise/service-desk/agents` | 配置客服成员 | 写 | session(会话) |  |  | memberUserId, role, groupId, status, maxConcurrent | data |
| `ServiceDesk_removeAgent` | DELETE | `/enterprise/service-desk/agents/:id` | 移除客服成员 | 写 | session(会话) | id |  |  | data |
| `ServiceDesk_aiAgents` | GET | `/enterprise/service-desk/ai-agents` | AI代理人 | 读 | session(会话) |  |  |  | data |
| `ServiceDesk_saveAiAgent` | POST | `/enterprise/service-desk/ai-agents` | 保存AI代理人 | 写 | session(会话) |  |  | id, name, avatar, intro, groupId, mode, persona, aiChannelId, aiModel, kbSpaceIds, handoffKeywords, handoffGroupId, maxConcurrent, workingHours, greetingText | data |
| `ServiceDesk_removeAiAgent` | DELETE | `/enterprise/service-desk/ai-agents/:id` | 删除AI代理人 | 写 | session(会话) | id |  |  | data |
| `ServiceDesk_setAiAgentStatus` | POST | `/enterprise/service-desk/ai-agents/:id/status` | 设置AI代理人状态 | 写 | session(会话) | id |  | status | data |
| `ServiceDesk_askAiAgent` | POST | `/enterprise/service-desk/ai-agents/ask` | 提问AI代理人 | 写 | session(会话) |  |  | agentId, question, history | data |
| `ServiceDesk_canned` | GET | `/enterprise/service-desk/canned` | 查看常用语 | 读 | session(会话) |  |  |  | data |
| `ServiceDesk_saveCanned` | POST | `/enterprise/service-desk/canned` | 新建或修改常用语 | 写 | session(会话) |  |  | id, scope, title, content, category, sort | data |
| `ServiceDesk_removeCanned` | DELETE | `/enterprise/service-desk/canned/:id` | 删除常用语 | 写 | session(会话) | id |  |  | data |
| `ServiceDesk_channels` | GET | `/enterprise/service-desk/channels` | 渠道 | 读 | session(会话) |  |  |  | data |
| `ServiceDesk_saveChannel` | POST | `/enterprise/service-desk/channels` | 保存渠道 | 写 | session(会话) |  |  | id, kind, name, config, enabled | data |
| `ServiceDesk_removeChannel` | DELETE | `/enterprise/service-desk/channels/:id` | 删除渠道 | 写 | session(会话) | id |  |  | data |
| `ServiceDesk_testChannel` | POST | `/enterprise/service-desk/channels/:id/test` | 测试渠道 | 写 | session(会话) | id |  |  | data |
| `ServiceDesk_conversations` | GET | `/enterprise/service-desk/conversations` | 查看客服会话 | 读 | session(会话) |  | page, pageSize, status, mine |  | data |
| `ServiceDesk_conversation` | GET | `/enterprise/service-desk/conversations/:id` | 查看会话详情 | 读 | session(会话) | id |  |  | data |
| `ServiceDesk_aiSuggest` | POST | `/enterprise/service-desk/conversations/:id/ai-suggest` | 生成AI回复建议 | 写 | session(会话) | id |  | instruction | data |
| `ServiceDesk_claim` | POST | `/enterprise/service-desk/conversations/:id/claim` | 接入客服会话 | 写 | session(会话) | id |  |  | data |
| `ServiceDesk_close` | POST | `/enterprise/service-desk/conversations/:id/close` | 结束客服会话 | 写 | session(会话) | id |  | inviteRating | data |
| `ServiceDesk_convertToCrm` | POST | `/enterprise/service-desk/conversations/:id/convert-to-crm` | 转化为CRM | 写 | session(会话) | id |  | name, phone, email | data |
| `ServiceDesk_createTask` | POST | `/enterprise/service-desk/conversations/:id/create-task` | 新建任务 | 写 | session(会话) | id |  | title, assigneeUserId, priority, note | data |
| `ServiceDesk_send` | POST | `/enterprise/service-desk/conversations/:id/messages` | 回复客服会话 | 写 | session(会话) | id |  | content, contentType, attachmentUrl, attachmentName, attachmentSize, clientMsgId | data |
| `ServiceDesk_draftSolution` | POST | `/enterprise/service-desk/conversations/:id/solution-draft` | 草稿SOLUTION | 写 | session(会话) | id |  | question, answer, spaceId | data |
| `ServiceDesk_transfer` | POST | `/enterprise/service-desk/conversations/:id/transfer` | 转接客服会话 | 写 | session(会话) | id |  | toUserId, note | data |
| `ServiceDesk_faqs` | GET | `/enterprise/service-desk/faqs` | 查看固定问答 | 读 | session(会话) |  |  |  | data |
| `ServiceDesk_saveFaq` | POST | `/enterprise/service-desk/faqs` | 新建或修改固定问答 | 写 | session(会话) |  |  | id, question, keywords, answer, enabled | data |
| `ServiceDesk_removeFaq` | DELETE | `/enterprise/service-desk/faqs/:id` | 删除固定问答 | 写 | session(会话) | id |  |  | data |
| `ServiceDesk_groups` | GET | `/enterprise/service-desk/groups` | 查看客服组 | 读 | session(会话) |  |  |  | data |
| `ServiceDesk_saveGroup` | POST | `/enterprise/service-desk/groups` | 新建或修改客服组 | 写 | session(会话) |  |  | id, name, categories, enabled | data |
| `ServiceDesk_removeGroup` | DELETE | `/enterprise/service-desk/groups/:id` | 删除客服组 | 写 | session(会话) | id |  |  | data |
| `ServiceDesk_overview` | GET | `/enterprise/service-desk/overview` | 查看客服概览 | 读 | session(会话) |  |  |  | data |
| `ServiceDesk_settings` | GET | `/enterprise/service-desk/settings` | 查看接待设置 | 读 | session(会话) |  |  |  | data |
| `ServiceDesk_saveSettings` | POST | `/enterprise/service-desk/settings` | 保存接待设置 | 写 | session(会话) |  |  | businessHours, welcomeText, queueText, offlineText, autoAssign, maxConcurrent, ratingEnabled, aiMode, aiChannelId, aiModel, aiHandoffKeywords, libraryIds, requireContact, retentionDays | data |
| `ServiceDesk_sites` | GET | `/enterprise/service-desk/sites` | 查看客服站点 | 读 | session(会话) |  |  |  | data |
| `ServiceDesk_saveSite` | POST | `/enterprise/service-desk/sites` | 新建或修改客服站点 | 写 | session(会话) |  |  | id, name, allowedOrigins, appearance, enabled | data |
| `ServiceDesk_removeSite` | DELETE | `/enterprise/service-desk/sites/:id` | 删除客服站点 | 写 | session(会话) | id |  |  | data |
| `ServiceDesk_rotateSiteKey` | POST | `/enterprise/service-desk/sites/:id/rotate` | 重置站点接入码 | 写 | session(会话) | id |  |  | data |
| `ServiceDesk_uploadIcon` | POST | `/enterprise/service-desk/sites/icon` | 上传图标 | 写 | session(会话) |  |  | name, contentType, contentBase64 | data |
| `ServiceDesk_stats` | GET | `/enterprise/service-desk/stats` | 查看客服统计 | 读 | session(会话) |  | days |  | data |
| `ServiceDesk_setStatus` | POST | `/enterprise/service-desk/status` | 切换客服在线状态 | 写 | session(会话) |  |  | status | data |

返回 `INDEX.md`。

