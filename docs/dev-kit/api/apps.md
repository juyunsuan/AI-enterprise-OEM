<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：apps（`apps`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Apps_list` | GET | `/enterprise/apps` | 列表 | 读 | session(会话) |  | category, q, page, pageSize |  | data |
| `Apps_detail` | GET | `/enterprise/apps/:clientId` | 详情 | 读 | session(会话) | clientId |  |  | data |
| `Apps_reviews` | GET | `/enterprise/apps/:clientId/reviews` | 审核 | 读 | session(会话) | clientId | page, pageSize |  | data |

返回 `INDEX.md`。

