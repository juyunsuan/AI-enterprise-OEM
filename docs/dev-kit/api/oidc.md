<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：OIDC 身份源（`oidc`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Oidc_listProviders` | GET | `/enterprise/oidc/providers` | 列表服务商 | 读 | session(会话) |  |  |  | data |
| `Oidc_removeProvider` | POST | `/enterprise/oidc/providers/remove` | 删除服务商 | 写 | session(会话) |  |  | id | data |
| `Oidc_saveProvider` | POST | `/enterprise/oidc/providers/save` | 保存服务商 | 写 | session(会话) |  |  | id, code, name, issuer, clientId, clientSecret, scopes, enabled, autoProvision, defaultRole | data |
| `Oidc_testProvider` | POST | `/enterprise/oidc/providers/test` | 测试服务商 | 写 | session(会话) |  |  | id | data |

返回 `INDEX.md`。

