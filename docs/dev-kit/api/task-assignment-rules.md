<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：task-assignment-rules（`task-assignment-rules`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `TaskRule_list` | GET | `/enterprise/task-assignment-rules` | 列表 | 读 | session(会话) |  | orgUserId |  | data |
| `TaskRule_create` | POST | `/enterprise/task-assignment-rules` | 新建 | 写 | session(会话) |  |  | orgType, orgUserId, source, category, region, strategy, targets, priority, enabled | data |
| `TaskRule_update` | POST | `/enterprise/task-assignment-rules/:id` | 修改 | 写 | session(会话) | id |  | orgType, orgUserId, source, category, region, strategy, targets, priority, enabled | data |
| `TaskRule_remove` | POST | `/enterprise/task-assignment-rules/:id/delete` | 删除 | 写 | session(会话) | id |  |  | data |
| `TaskRule_audit` | GET | `/enterprise/task-assignment-rules/audit` | 审核 | 读 | session(会话) |  | page, pageSize, orgUserId, keyword |  | data |

返回 `INDEX.md`。

