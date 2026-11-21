<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：知识库（`kb`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Kb_ask` | POST | `/enterprise/kb/ask` | 提问 | 写 | session(会话) |  |  | spaceId, question, topK, saveAsPage | data |
| `Kb_assist` | POST | `/enterprise/kb/assist` | 知识库写作辅助 | 写 | session(会话) |  |  | question, spaceIds, consumerType, consumerId, topK | data |
| `Kb_consolidate` | POST | `/enterprise/kb/consolidate` | 归并 | 写 | session(会话) |  |  | spaceId, userId, limit | data |
| `Kb_listConsumers` | GET | `/enterprise/kb/consumers` | 列表消费方 | 读 | session(会话) |  | spaceId |  | data |
| `Kb_bindConsumer` | POST | `/enterprise/kb/consumers/bind` | 绑定消费方 | 写 | session(会话) |  |  | spaceId, consumerType, consumerId, role, priority | data |
| `Kb_unbindConsumer` | POST | `/enterprise/kb/consumers/delete` | 解绑消费方 | 写 | session(会话) |  |  | id | data |
| `Kb_getCurrentSpace` | GET | `/enterprise/kb/current` | 获取当前空间 | 读 | session(会话) |  |  |  | data |
| `Kb_graph` | GET | `/enterprise/kb/graph` | 图谱 | 读 | session(会话) |  | spaceId, entityId, depth |  | data |
| `Kb_graphInsights` | GET | `/enterprise/kb/graph-insights` | 图谱洞察 | 读 | session(会话) |  | spaceId |  | data |
| `Kb_indexStats` | GET | `/enterprise/kb/index` | 查看索引统计 | 读 | session(会话) |  | spaceId |  | data |
| `Kb_ingest` | POST | `/enterprise/kb/ingest` | 摄取 | 写 | session(会话) |  |  | spaceId, sourceId | data |
| `Kb_ingestJobs` | GET | `/enterprise/kb/ingest-jobs` | 摄取生成任务 | 读 | session(会话) |  | page, pageSize, spaceId |  | data |
| `Kb_lint` | POST | `/enterprise/kb/lint` | 体检 | 写 | session(会话) |  |  | spaceId | data |
| `Kb_lintRuns` | GET | `/enterprise/kb/lint-runs` | 体检运行记录 | 读 | session(会话) |  | page, pageSize, spaceId |  | data |
| `Kb_logs` | GET | `/enterprise/kb/logs` | 日志 | 读 | session(会话) |  | page, pageSize, spaceId |  | data |
| `Kb_listPages` | GET | `/enterprise/kb/pages` | 列表页面 | 读 | session(会话) |  | page, pageSize, spaceId, type, status, q |  | data |
| `Kb_readPage` | GET | `/enterprise/kb/pages/:id` | 读取页面 | 读 | session(会话) | id |  |  | data |
| `Kb_deletePage` | POST | `/enterprise/kb/pages/delete` | 删除页面 | 写 | session(会话) |  |  | id | data |
| `Kb_reviewPage` | POST | `/enterprise/kb/pages/review` | 审核页面 | 写 | session(会话) |  |  | id, decision, note | data |
| `Kb_writePage` | POST | `/enterprise/kb/pages/write` | 写入页面 | 写 | session(会话) |  |  | spaceId, slug, type, title, body, frontmatter, status, sourceIds | data |
| `Kb_recall` | POST | `/enterprise/kb/recall` | 召回 | 写 | session(会话) |  |  | spaceId, query, topK, maxChars | data |
| `Kb_reembed` | POST | `/enterprise/kb/reembed` | 重建向量 | 写 | session(会话) |  |  | spaceId | data |
| `Kb_retrieve` | POST | `/enterprise/kb/retrieve` | 检索 | 写 | session(会话) |  |  | query, sources, spaceIds, consumerType, consumerId, libraryIds, types, tags, from, to, topK, maxChars | data |
| `Kb_getSchema` | GET | `/enterprise/kb/schema` | 获取结构 | 读 | session(会话) |  | spaceId |  | data |
| `Kb_saveSchema` | POST | `/enterprise/kb/schema/save` | 保存结构 | 写 | session(会话) |  |  | spaceId, pageTypes, workflowPrompt | data |
| `Kb_search` | GET | `/enterprise/kb/search` | 搜索 | 读 | session(会话) |  | spaceId, q, topK |  | data |
| `Kb_listSources` | GET | `/enterprise/kb/sources` | 列表数据源 | 读 | session(会话) |  | page, pageSize, spaceId, status |  | data |
| `Kb_addSource` | POST | `/enterprise/kb/sources/add` | 添加数据源 | 写 | session(会话) |  |  | spaceId, kind, title, text, assetId, type, url | data |
| `Kb_addSourceFeishu` | POST | `/enterprise/kb/sources/add-feishu` | 添加数据源飞书 | 写 | session(会话) |  |  | spaceId, url, token, title, kind | data |
| `Kb_addSourceUrl` | POST | `/enterprise/kb/sources/add-url` | 添加数据源链接 | 写 | session(会话) |  |  | spaceId, url, title, kind | data |
| `Kb_setSpace` | POST | `/enterprise/kb/space/select` | 设置空间 | 写 | session(会话) |  |  | spaceId | data |
| `Kb_listSpaces` | GET | `/enterprise/kb/spaces` | 列表空间 | 读 | session(会话) |  |  |  | data |
| `Kb_getSpace` | GET | `/enterprise/kb/spaces/:id` | 获取空间 | 读 | session(会话) | id |  |  | data |
| `Kb_createSpace` | POST | `/enterprise/kb/spaces/create` | 新建空间 | 写 | session(会话) |  |  | name, description, scopeType, orgType, orgUserId, visibility | data |
| `Kb_updateSpace` | POST | `/enterprise/kb/spaces/update` | 修改空间 | 写 | session(会话) |  |  | id, name, description, visibility, status | data |

返回 `INDEX.md`。

