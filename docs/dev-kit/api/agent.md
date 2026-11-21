<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：智能体记忆（`agent`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Agent_events` | GET | `/enterprise/agent/events` | 事件 | 读 | session(会话) |  | page, pageSize, domain, outcome, channel |  | data |
| `Agent_grants` | GET | `/enterprise/agent/grants` | 授权 | 读 | session(会话) |  |  |  | data |
| `Agent_saveGrants` | POST | `/enterprise/agent/grants` | 保存授权 | 写 | session(会话) |  |  | actions, connectorIds | data |
| `Agent_clear` | POST | `/enterprise/agent/memory/clear` | 清空 | 写 | session(会话) |  |  |  | data |
| `Agent_overview` | GET | `/enterprise/agent/overview` | 概览 | 读 | session(会话) |  |  |  | data |

返回 `INDEX.md`。

