<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：我的任务（`my-tasks`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `MyTask_list` | GET | `/enterprise/my-tasks` | 列表 | 读 | session(会话) |  | page, pageSize, status, category, source, keyword, includeClosed |  | data |
| `MyTask_get` | GET | `/enterprise/my-tasks/:id` | 获取 | 读 | session(会话) | id |  |  | data |
| `MyTask_assign` | POST | `/enterprise/my-tasks/:id/assign` | 指派 | 写 | session(会话) | id |  | toUserId, strategy, note | data |
| `MyTask_assignmentLog` | GET | `/enterprise/my-tasks/:id/assignments` | ASSIGNMENT日志 | 读 | session(会话) | id |  |  | data |
| `MyTask_claim` | POST | `/enterprise/my-tasks/:id/claim` | 认领 | 写 | session(会话) | id |  |  | data |
| `MyTask_close` | POST | `/enterprise/my-tasks/:id/close` | 关闭 | 写 | session(会话) | id |  | note | data |
| `MyTask_submitForm` | POST | `/enterprise/my-tasks/:id/form` | 提交表单 | 写 | session(会话) | id |  | values, note | data |
| `MyTask_reopen` | POST | `/enterprise/my-tasks/:id/reopen` | 重开任务 | 写 | session(会话) | id |  |  | data |
| `MyTask_orgList` | GET | `/enterprise/my-tasks/org` | 组织列表 | 读 | session(会话) |  | page, pageSize, includeClosed, keyword |  | data |
| `MyTask_summary` | GET | `/enterprise/my-tasks/summary` | 摘要 | 读 | session(会话) |  |  |  | data |

返回 `INDEX.md`。

