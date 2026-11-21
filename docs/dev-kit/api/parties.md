<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：主体管理（`parties`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Party_list` | GET | `/enterprise/parties` | 列表 | 读 | session(会话) |  | page, pageSize, kind, status, q |  | data |
| `Party_save` | POST | `/enterprise/parties` | 保存 | 写 | session(会话) |  |  | id, kind, name, contactName, phone, email, taxNo, address, roles, capabilities, rateCard, availability, compliance, rating, status, source, note | data |
| `Party_remove` | POST | `/enterprise/parties/:id/remove` | 删除 | 写 | session(会话) | id |  |  | data |

返回 `INDEX.md`。

