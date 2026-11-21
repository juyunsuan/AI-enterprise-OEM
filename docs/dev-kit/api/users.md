<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：账号（`users`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `OpenApi_me` | GET | `/api/v1/users/me` | 查看当前身份 | 读 | key(API Key) |  |  |  | data |
| `OpenApi_switchRole` | POST | `/api/v1/users/me/role/switch` | 切换身份 | 写 | key(API Key) |  |  | identity, role | data |
| `OpenApi_roles` | GET | `/api/v1/users/me/roles` | 身份 | 读 | key(API Key) |  |  |  | data |

返回 `INDEX.md`。

