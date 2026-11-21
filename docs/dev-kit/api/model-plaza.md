<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：模型广场（`model-plaza`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Mp_catalog` | GET | `/enterprise/model-plaza/catalog` | 目录 | 读 | session(会话) |  |  |  | data |
| `Mp_connection` | GET | `/enterprise/model-plaza/connection` | 连接 | 读 | session(会话) |  |  |  | data |
| `Mp_detail` | GET | `/enterprise/model-plaza/models/:id` | 详情 | 读 | session(会话) | id |  |  | data |
| `Mp_platformStatus` | GET | `/enterprise/model-plaza/platform-status` | PLATFORM状态 | 读 | session(会话) |  |  |  | data |
| `Mp_trial` | POST | `/enterprise/model-plaza/trial` | 试算 | 写 | session(会话) |  |  | modelId, prompt, system, temperature, maxTokens | data |
| `Mp_usage` | GET | `/enterprise/model-plaza/usage` | 用量 | 读 | session(会话) |  | page, pageSize, source, modelKey, from, to |  | data |
| `Mp_usageSummary` | GET | `/enterprise/model-plaza/usage/summary` | 用量摘要 | 读 | session(会话) |  | days |  | data |

返回 `INDEX.md`。

