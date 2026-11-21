<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：工作流（`workflows`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Workflow_list` | GET | `/enterprise/workflows` | 列表 | 读 | session(会话) |  | page, pageSize, group, orgUserId, status, keyword |  | data |
| `Workflow_create` | POST | `/enterprise/workflows` | 新建 | 写 | session(会话) |  |  | name, description, businessKey, scope, orgUserId, graph, budgets | data |
| `Workflow_remove` | DELETE | `/enterprise/workflows/:id` | 删除 | 写 | session(会话) | id |  |  | data |
| `Workflow_detail` | GET | `/enterprise/workflows/:id` | 详情 | 读 | session(会话) | id |  |  | data |
| `Workflow_save` | PATCH | `/enterprise/workflows/:id` | 保存 | 写 | session(会话) | id |  | name, description, businessKey, scope, orgUserId, graph, inputSchema, outputSchema, budgets | data |
| `Workflow_duplicate` | POST | `/enterprise/workflows/:id/duplicate` | 复制工作流 | 写 | session(会话) | id |  |  | data |
| `Workflow_publish` | POST | `/enterprise/workflows/:id/publish` | 发布 | 写 | session(会话) | id |  |  | data |
| `Workflow_run` | POST | `/enterprise/workflows/:id/run` | 运行 | 写 | session(会话) | id |  | input | data |
| `Workflow_aiBuild` | POST | `/enterprise/workflows/ai-build` | AIBUILD | 写 | session(会话) |  |  | messages, graph | data |
| `Workflow_catalog` | GET | `/enterprise/workflows/catalog` | 目录 | 读 | session(会话) |  |  |  | data |
| `Workflow_invoke` | POST | `/enterprise/workflows/invoke` | INVOKE | 写 | session(会话) |  |  | workflowId, businessKey, trigger, input, sourceType, sourceId, dedupeKey | data |
| `Workflow_runList` | GET | `/enterprise/workflows/runs` | 运行列表 | 读 | session(会话) |  | page, pageSize, workflowId, status, sourceType, sourceId |  | data |
| `Workflow_runDetail` | GET | `/enterprise/workflows/runs/:runId` | 运行详情 | 读 | session(会话) | runId |  |  | data |
| `Workflow_runCancel` | POST | `/enterprise/workflows/runs/:runId/cancel` | 运行取消 | 写 | session(会话) | runId |  |  | data |

返回 `INDEX.md`。

