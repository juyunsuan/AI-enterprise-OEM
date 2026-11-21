<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：Webhook 订阅（`webhooks`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Webhook_list` | GET | `/enterprise/webhooks` | 列表 | 读 | session(会话) |  |  |  | data |
| `Webhook_deliveries` | GET | `/enterprise/webhooks/deliveries` | 投递记录 | 读 | session(会话) |  | page, pageSize, subscriptionId, status |  | data |
| `Webhook_remove` | POST | `/enterprise/webhooks/remove` | 删除 | 写 | session(会话) |  |  | id | data |
| `Webhook_replay` | POST | `/enterprise/webhooks/replay` | 重投 | 写 | session(会话) |  |  | id | data |
| `Webhook_save` | POST | `/enterprise/webhooks/save` | 保存 | 写 | session(会话) |  |  | id, name, url, secret, events, enabled | data |
| `Webhook_test` | POST | `/enterprise/webhooks/test` | 测试 | 写 | session(会话) |  |  | id | data |

返回 `INDEX.md`。

