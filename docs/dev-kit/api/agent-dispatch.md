<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：agent-dispatch（`agent-dispatch`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `AgentDispatch_devices` | GET | `/enterprise/agent-dispatch/devices` | DEVICES | 读 | session(会话) |  | kind |  | data |
| `AgentDispatch_scheduleStatus` | PATCH | `/enterprise/agent-dispatch/schedules/:id` | 定时任务状态 | 写 | session(会话) | id |  | status, kind | data |
| `AgentDispatch_tasks` | GET | `/enterprise/agent-dispatch/tasks` | 任务 | 读 | session(会话) |  | type, source, status, page, pageSize |  | data |
| `AgentDispatch_taskDetail` | GET | `/enterprise/agent-dispatch/tasks/:id` | 任务详情 | 读 | session(会话) | id | type, kind |  | data |

返回 `INDEX.md`。

