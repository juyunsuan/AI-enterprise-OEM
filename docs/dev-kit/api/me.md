<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：当前身份（`me`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Identity_me` | GET | `/enterprise/me` | 查看当前身份 | 读 | session(会话) |  |  |  | data |
| `Identity_switchIdentity` | POST | `/enterprise/me/identity` | 切换身份 | 写 | session(会话) |  |  | identity | data |

返回 `INDEX.md`。

