<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：站内通知（`notifications`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Notifications_list` | GET | `/enterprise/notifications` | 查看系统消息 | 读 | session(会话) |  | page, pageSize, category, unreadOnly |  | data |
| `Notifications_get` | GET | `/enterprise/notifications/:id` | 获取 | 读 | session(会话) | id |  |  | data |
| `Notifications_read` | POST | `/enterprise/notifications/:id/read` | 标记消息已读 | 写 | session(会话) | id |  |  | data |
| `Notifications_readAll` | POST | `/enterprise/notifications/read-all` | 全部标为已读 | 写 | session(会话) |  |  | category | data |
| `Notifications_readSns` | POST | `/enterprise/notifications/sns/:id/read` | 读取SNS | 写 | session(会话) | id |  |  | data |
| `Notifications_unread` | GET | `/enterprise/notifications/unread` | 查看未读消息 | 读 | session(会话) |  |  |  | data |

返回 `INDEX.md`。

