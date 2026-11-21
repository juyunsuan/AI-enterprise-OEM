<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：页面副驾（`assistant`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Assistant_ask` | POST | `/enterprise/assistant/ask` | 提问 | 写 | session(会话) |  |  | route, entityType, entityId, question, model, channelId | data |
| `Assistant_extractActions` | POST | `/enterprise/assistant/extract-actions` | 提取ACTIONS | 写 | session(会话) |  |  | sourceType, sourceRef, text, assigneeUserId, model, channelId | data |
| `Assistant_history` | GET | `/enterprise/assistant/history` | 历史 | 读 | session(会话) |  | page, pageSize |  | data |
| `Assistant_registry` | GET | `/enterprise/assistant/registry` | 注册表 | 读 | session(会话) |  |  |  | data |

返回 `INDEX.md`。

