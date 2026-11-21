<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：组织上下文（`org`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `OrgCtx_contexts` | GET | `/enterprise/org/contexts` | 上下文 | 读 | session(会话) |  |  |  | data |
| `OrgCtx_switch` | POST | `/enterprise/org/contexts/switch` | 切换 | 写 | session(会话) |  |  | orgType, orgUserId | data |

返回 `INDEX.md`。

