<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：界面偏好（`ui-preferences`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `UiPrefs_get` | GET | `/enterprise/ui-preferences/:key` | 获取 | 读 | session(会话) | key |  |  | data |
| `UiPrefs_save` | PUT | `/enterprise/ui-preferences/:key` | 保存 | 写 | session(会话) | key |  | value | data |

返回 `INDEX.md`。

