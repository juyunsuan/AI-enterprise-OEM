<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：AI 调用账号（`ai-call`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `OpenApi_aiCallAccounts` | GET | `/api/v1/ai-call/accounts` | 查看 AI 调用账号 | 读 | key(API Key) |  | kind, agentId, platform |  | data |
| `OpenApi_aiCallCredentials` | GET | `/api/v1/ai-call/accounts/:id/credentials` | 查看 AI 调用凭据 | 读 | key(API Key) | id | kind, agentId |  | data |
| `AiCall_accounts` | GET | `/enterprise/ai-call/accounts` | 凭据 | 读 | session(会话) |  | keyword |  | data |
| `AiCall_createAccount` | POST | `/enterprise/ai-call/accounts` | 新建账号 | 写 | session(会话) |  |  |  | data |
| `AiCall_removeAccount` | DELETE | `/enterprise/ai-call/accounts/:id` | 删除账号 | 写 | session(会话) | id |  |  | data |
| `AiCall_account` | GET | `/enterprise/ai-call/accounts/:id` | 账号 | 读 | session(会话) | id |  |  | data |
| `AiCall_updateAccount` | PATCH | `/enterprise/ai-call/accounts/:id` | 修改账号 | 写 | session(会话) | id |  |  | data |
| `AiCall_saveAccountAgents` | PUT | `/enterprise/ai-call/accounts/:id/agents` | 保存账号代理人 | 写 | session(会话) | id |  | bindings | data |
| `AiCall_bindings` | GET | `/enterprise/ai-call/bindings` | 绑定 | 读 | session(会话) |  | kind, principalId |  | data |
| `AiCall_saveBindings` | PUT | `/enterprise/ai-call/bindings` | 保存绑定 | 写 | session(会话) |  |  | kind, principalId, accountIds | data |

返回 `INDEX.md`。

