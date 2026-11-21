<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：使用埋点（`usage`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Usage_events` | GET | `/enterprise/usage/events` | 事件 | 读 | session(会话) |  | page, pageSize, event, userId |  | data |
| `Usage_settings` | GET | `/enterprise/usage/settings` | 设置 | 读 | session(会话) |  |  |  | data |
| `Usage_saveSettings` | POST | `/enterprise/usage/settings` | 保存设置 | 写 | session(会话) |  |  | enabled, retentionDays | data |
| `Usage_summary` | GET | `/enterprise/usage/summary` | 摘要 | 读 | session(会话) |  | days |  | data |
| `Usage_track` | POST | `/enterprise/usage/track` | 跟踪 | 写 | session(会话) |  |  | event, route, targetType, targetId, metadata | data |

返回 `INDEX.md`。

