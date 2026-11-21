<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：内容创作与 Agent（`content`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Content_assistantChannels` | GET | `/enterprise/content/agent/assistant/channels` | 助理渠道 | 读 | session(会话) |  |  |  | data |
| `Content_saveAssistantChannel` | POST | `/enterprise/content/agent/assistant/channels` | 保存助理渠道 | 写 | session(会话) |  |  |  | data |
| `Content_removeAssistantChannel` | DELETE | `/enterprise/content/agent/assistant/channels/:id` | 删除助理渠道 | 写 | session(会话) | id |  |  | data |
| `Content_updateAssistantChannel` | PUT | `/enterprise/content/agent/assistant/channels/:id` | 修改助理渠道 | 写 | session(会话) | id |  |  | data |
| `Content_assistantMessages` | GET | `/enterprise/content/agent/assistant/channels/:id/messages` | 助理消息 | 读 | session(会话) | id |  |  | data |
| `Content_testAssistantChannel` | POST | `/enterprise/content/agent/assistant/channels/:id/test` | 测试助理渠道 | 写 | session(会话) | id |  |  | data |
| `Content_connectors` | GET | `/enterprise/content/agent/connectors` | 连接器 | 读 | session(会话) |  |  |  | data |
| `Content_createConnector` | POST | `/enterprise/content/agent/connectors` | 新建连接器 | 写 | session(会话) |  |  |  | data |
| `Content_removeConnector` | DELETE | `/enterprise/content/agent/connectors/:id` | 删除连接器 | 写 | session(会话) | id |  |  | data |
| `Content_updateConnector` | PUT | `/enterprise/content/agent/connectors/:id` | 修改连接器 | 写 | session(会话) | id |  |  | data |
| `Content_testConnector` | POST | `/enterprise/content/agent/connectors/test` | 测试连接器 | 写 | session(会话) |  |  |  | data |
| `Content_conversations` | GET | `/enterprise/content/agent/conversations` | 会话 | 读 | session(会话) |  |  |  | data |
| `Content_createConversation` | POST | `/enterprise/content/agent/conversations` | 新建会话 | 写 | session(会话) |  |  |  | data |
| `Content_removeConversation` | DELETE | `/enterprise/content/agent/conversations/:id` | 删除会话 | 写 | session(会话) | id |  |  | data |
| `Content_updateConversation` | PUT | `/enterprise/content/agent/conversations/:id` | 修改会话 | 写 | session(会话) | id |  |  | data |
| `Content_messages` | GET | `/enterprise/content/agent/conversations/:id/messages` | 留言 | 读 | session(会话) | id |  |  | data |
| `Content_experts` | GET | `/enterprise/content/agent/experts` | 专家 | 读 | session(会话) |  |  |  | data |
| `Content_createExpert` | POST | `/enterprise/content/agent/experts` | 新建专家 | 写 | session(会话) |  |  |  | data |
| `Content_removeExpert` | DELETE | `/enterprise/content/agent/experts/:id` | 删除专家 | 写 | session(会话) | id |  |  | data |
| `Content_library` | GET | `/enterprise/content/agent/library` | 资料库 | 读 | session(会话) |  |  |  | data |
| `Content_libraryAdd` | POST | `/enterprise/content/agent/library` | 添加资料库 | 写 | session(会话) |  |  |  | data |
| `Content_libraryRemove` | DELETE | `/enterprise/content/agent/library/:id` | 删除资料库 | 写 | session(会话) | id |  |  | data |
| `Content_libraryNodes` | GET | `/enterprise/content/agent/library/:id/nodes` | 资料库节点 | 读 | session(会话) | id |  |  | data |
| `Content_libraryDrafts` | GET | `/enterprise/content/agent/library/drafts` | 资料库改写 | 读 | session(会话) |  |  |  | data |
| `Content_libraryDraftDecide` | POST | `/enterprise/content/agent/library/drafts/:id` | 处理资料库改写 | 写 | session(会话) | id |  |  | data |
| `Content_libraryPublish` | POST | `/enterprise/content/agent/library/publish` | 发布资料库 | 写 | session(会话) |  |  |  | data |
| `Content_librarySearch` | POST | `/enterprise/content/agent/library/search` | 搜索资料库 | 写 | session(会话) |  |  |  | data |
| `Content_memories` | GET | `/enterprise/content/agent/memories` | 记忆 | 读 | session(会话) |  | personaId |  | data |
| `Content_saveMemories` | PUT | `/enterprise/content/agent/memories` | 保存记忆 | 写 | session(会话) |  |  | content, personaId | data |
| `Content_personas` | GET | `/enterprise/content/agent/personas` | 分身列表 | 读 | session(会话) |  |  |  | data |
| `Content_createPersona` | POST | `/enterprise/content/agent/personas` | 新建数字分身 | 写 | session(会话) |  |  | name, style, persona, spaceId, libraryIds, channelId, model | data |
| `Content_deletePersona` | DELETE | `/enterprise/content/agent/personas/:id` | 删除数字分身 | 写 | session(会话) | id |  |  | data |
| `Content_updatePersona` | PUT | `/enterprise/content/agent/personas/:id` | 修改数字分身 | 写 | session(会话) | id |  | name, style, persona, spaceId, libraryIds, channelId, model | data |
| `Content_schedules` | GET | `/enterprise/content/agent/schedules` | 定时任务 | 读 | session(会话) |  |  |  | data |
| `Content_saveSchedule` | POST | `/enterprise/content/agent/schedules` | 保存定时任务 | 写 | session(会话) |  |  |  | data |
| `Content_removeSchedule` | DELETE | `/enterprise/content/agent/schedules/:id` | 删除定时任务 | 写 | session(会话) | id |  |  | data |
| `Content_updateSchedule` | PUT | `/enterprise/content/agent/schedules/:id` | 修改定时任务 | 写 | session(会话) | id |  |  | data |
| `Content_runScheduleNow` | POST | `/enterprise/content/agent/schedules/:id/run` | 立即执行定时任务 | 写 | session(会话) | id |  |  | data |
| `Content_scheduleRuns` | GET | `/enterprise/content/agent/schedules/:id/runs` | 定时任务执行 | 读 | session(会话) | id |  |  | data |
| `Content_skills` | GET | `/enterprise/content/agent/skills` | 技能 | 读 | session(会话) |  |  |  | data |
| `Content_removeSkill` | DELETE | `/enterprise/content/agent/skills/:id` | 删除技能 | 写 | session(会话) | id |  |  | data |
| `Content_toggleSkill` | PUT | `/enterprise/content/agent/skills/:id` | 启停技能 | 写 | session(会话) | id |  |  | data |
| `Content_restoreSkill` | POST | `/enterprise/content/agent/skills/:id/restore` | 恢复技能 | 写 | session(会话) | id |  |  | data |
| `Content_skillRevisions` | GET | `/enterprise/content/agent/skills/:id/revisions` | 技能版本 | 读 | session(会话) | id |  |  | data |
| `Content_agentTools` | GET | `/enterprise/content/agent/tools` | 代理人工具 | 读 | session(会话) |  |  |  | data |
| `Content_assets` | GET | `/enterprise/content/assets` | 资产 | 读 | session(会话) |  | page, pageSize |  | data |
| `Content_registerAsset` | POST | `/enterprise/content/assets/:id/register` | 登记数字资产 | 写 | session(会话) | id |  |  | data |
| `Content_canvases` | GET | `/enterprise/content/canvas` | CANVASES | 读 | session(会话) |  | page, pageSize, keyword, status |  | data |
| `Content_createCanvas` | POST | `/enterprise/content/canvas` | 新建CANVAS | 写 | session(会话) |  |  |  | data |
| `Content_deleteCanvas` | DELETE | `/enterprise/content/canvas/:id` | 删除CANVAS | 写 | session(会话) | id |  |  | data |
| `Content_canvas` | GET | `/enterprise/content/canvas/:id` | CANVAS | 读 | session(会话) | id |  |  | data |
| `Content_renameCanvas` | PATCH | `/enterprise/content/canvas/:id` | RENAMECANVAS | 写 | session(会话) | id |  |  | data |
| `Content_saveCanvas` | POST | `/enterprise/content/canvas/:id` | 保存CANVAS | 写 | session(会话) | id |  |  | data |
| `Content_copyCanvasNode` | POST | `/enterprise/content/canvas/:id/nodes/:nodeId/copy` | 复制CANVAS节点 | 写 | session(会话) | id, nodeId |  |  | data |
| `Content_runCanvasNode` | POST | `/enterprise/content/canvas/:id/nodes/:nodeId/run` | 运行CANVAS节点 | 写 | session(会话) | id, nodeId |  |  | data |
| `Content_saveChannel` | POST | `/enterprise/content/channels` | 保存渠道 | 写 | session(会话) |  |  |  | data |
| `Content_removeChannel` | DELETE | `/enterprise/content/channels/:id` | 删除渠道 | 写 | session(会话) | id |  |  | data |
| `Content_testChannel` | POST | `/enterprise/content/channels/test` | 测试渠道 | 写 | session(会话) |  |  |  | data |
| `Content_digitalAssets` | GET | `/enterprise/content/digital-assets` | 数字资产 | 读 | session(会话) |  | page, pageSize, type, keyword, label |  | data |
| `Content_deleteDigitalAsset` | DELETE | `/enterprise/content/digital-assets/:id` | 删除数字资产 | 写 | session(会话) | id |  |  | data |
| `Content_tagDigitalAsset` | PUT | `/enterprise/content/digital-assets/:id` | 标记数字资产 | 写 | session(会话) | id |  |  | data |
| `Content_autoTagDigitalAsset` | POST | `/enterprise/content/digital-assets/:id/auto-tag` | 标记自动数字资产 | 写 | session(会话) | id |  | persist | data |
| `Content_extractDigitalAsset` | POST | `/enterprise/content/digital-assets/:id/extract` | 提取数字资产 | 写 | session(会话) | id |  | persist | data |
| `Content_moderateDigitalAsset` | POST | `/enterprise/content/digital-assets/:id/moderate` | 审核数字资产 | 写 | session(会话) | id |  |  | data |
| `Content_similarDigitalAssets` | GET | `/enterprise/content/digital-assets/:id/similar` | 相似数字资产 | 读 | session(会话) | id | limit |  | data |
| `Content_digitalAssetLabels` | GET | `/enterprise/content/digital-assets/labels` | 数字资产标签 | 读 | session(会话) |  |  |  | data |
| `Content_presignDigitalAsset` | POST | `/enterprise/content/digital-assets/presign` | 直传签名数字资产 | 写 | session(会话) |  |  | filename, type, size, name, labels | data |
| `Content_registerDigitalAsset` | POST | `/enterprise/content/digital-assets/register` | 登记数字资产 | 写 | session(会话) |  |  | key, filename, name, type, labels | data |
| `Content_jobs` | GET | `/enterprise/content/jobs` | 生成任务 | 读 | session(会话) |  | page, pageSize, tool, source, media, status, canvasId, nodeId |  | data |
| `Content_createJob` | POST | `/enterprise/content/jobs` | 新建生成任务 | 写 | session(会话) |  |  |  | data |
| `Content_job` | GET | `/enterprise/content/jobs/:id` | 生成任务 | 读 | session(会话) | id |  |  | data |
| `Content_cancelJob` | POST | `/enterprise/content/jobs/:id/cancel` | 取消生成任务 | 写 | session(会话) | id |  |  | data |
| `Content_retryJob` | POST | `/enterprise/content/jobs/:id/retry` | 重试生成任务 | 写 | session(会话) | id |  |  | data |
| `Content_models` | GET | `/enterprise/content/models` | 模型 | 读 | session(会话) |  | channelId |  | data |
| `Content_settings` | GET | `/enterprise/content/settings` | 设置 | 读 | session(会话) |  |  |  | data |
| `Content_saveSettings` | PUT | `/enterprise/content/settings` | 保存设置 | 写 | session(会话) |  |  |  | data |
| `Content_sharedAssets` | GET | `/enterprise/content/shared-assets` | 共享资产 | 读 | session(会话) |  |  |  | data |
| `Content_shareAsset` | POST | `/enterprise/content/shared-assets` | 分享资产 | 写 | session(会话) |  |  | asset, targetUserIds | data |
| `Content_unshareAsset` | DELETE | `/enterprise/content/shared-assets/:id` | 取消分享资产 | 写 | session(会话) | id |  |  | data |
| `Content_shareTargets` | GET | `/enterprise/content/shared-assets/targets` | 分享目标 | 读 | session(会话) |  |  |  | data |
| `VideoTemplate_list` | GET | `/enterprise/content/video-templates` | 列表 | 读 | session(会话) |  | page, pageSize, keyword, type, sort, mine, favorite |  | data |
| `VideoTemplate_publish` | POST | `/enterprise/content/video-templates` | 发布 | 写 | session(会话) |  |  | title, description, videoType, sampleUrl, coverUrl, referenceImages, prompt, modelChannelName, modelName, viewCost | data |
| `VideoTemplate_remove` | DELETE | `/enterprise/content/video-templates/:id` | 删除 | 写 | session(会话) | id |  |  | data |
| `VideoTemplate_detail` | GET | `/enterprise/content/video-templates/:id` | 详情 | 读 | session(会话) | id |  |  | data |
| `VideoTemplate_unfavorite` | DELETE | `/enterprise/content/video-templates/:id/favorite` | UNFAVORITE | 写 | session(会话) | id |  |  | data |
| `VideoTemplate_favorite` | POST | `/enterprise/content/video-templates/:id/favorite` | 收藏 | 写 | session(会话) | id |  |  | data |
| `VideoTemplate_generate` | POST | `/enterprise/content/video-templates/:id/generate` | 生成 | 写 | session(会话) | id |  | prompt, referenceImages, duration, ratio, resolution, models | data |
| `VideoTemplate_rate` | PUT | `/enterprise/content/video-templates/:id/rating` | 费率 | 写 | session(会话) | id |  | score | data |
| `VideoTemplate_view` | POST | `/enterprise/content/video-templates/:id/view` | 查看 | 写 | session(会话) | id |  |  | data |

返回 `INDEX.md`。

