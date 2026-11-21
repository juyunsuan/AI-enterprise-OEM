<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：公开分享（`shares`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Share_list` | GET | `/enterprise/shares` | 列表 | 读 | session(会话) |  | page, pageSize, kind |  | data |
| `Share_create` | POST | `/enterprise/shares/create` | 新建 | 写 | session(会话) |  |  | kind, targetId, title, projection, password, expiresDays | data |
| `Share_remove` | POST | `/enterprise/shares/remove` | 删除 | 写 | session(会话) |  |  | id | data |
| `Share_update` | POST | `/enterprise/shares/update` | 修改 | 写 | session(会话) |  |  | id, enabled, password, expiresDays | data |

返回 `INDEX.md`。

