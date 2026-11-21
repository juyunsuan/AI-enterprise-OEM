<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：平台密钥（`api-keys`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `OpenApi_keys` | GET | `/api/v1/api-keys` | 密钥 | 读 | key(API Key) |  |  |  | data |
| `OpenApi_keyUsage` | GET | `/api/v1/api-keys/:keyId/usage` | 密钥用量 | 读 | key(API Key) | keyId |  |  | data |
| `OpenApi_syncKey` | POST | `/api/v1/api-keys/sync` | 同步密钥 | 写 | key(API Key) |  |  |  | data |
| `Identity_apiKeys` | GET | `/enterprise/api-keys` | API 密钥 | 读 | session(会话) |  |  |  | data |
| `Identity_createKey` | POST | `/enterprise/api-keys` | 新建密钥 | 写 | session(会话) |  |  |  | data |
| `Identity_updateKeyQuota` | POST | `/enterprise/api-keys/:id/quota` | 修改密钥积分额度 | 写 | session(会话) | id |  | pointsQuota | data |
| `Identity_resetKey` | POST | `/enterprise/api-keys/:id/reset` | 重置密钥 | 写 | session(会话) | id |  |  | data |
| `Identity_revealKey` | POST | `/enterprise/api-keys/:id/reveal` | 查看密钥 | 写 | session(会话) | id |  |  | data |
| `Identity_revokeKey` | POST | `/enterprise/api-keys/:id/revoke` | 吊销密钥 | 写 | session(会话) | id |  |  | data |
| `Identity_keyUsage` | GET | `/enterprise/api-keys/:id/usage` | 密钥用量 | 读 | session(会话) | id |  |  | data |

返回 `INDEX.md`。

