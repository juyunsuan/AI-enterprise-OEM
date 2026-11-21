<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：rbac（`rbac`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Rbac_context` | GET | `/enterprise/rbac/context` | 上下文 | 读 | session(会话) |  |  |  | data |
| `Rbac_members` | GET | `/enterprise/rbac/members` | 会员 | 读 | session(会话) |  |  |  | data |
| `Rbac_saveMember` | POST | `/enterprise/rbac/members` | 保存会员 | 写 | session(会话) |  |  | id, name, username, password, roleCode, scopes | data |
| `Rbac_removeMember` | DELETE | `/enterprise/rbac/members/:id` | 删除会员 | 写 | session(会话) | id |  |  | data |
| `Rbac_member` | GET | `/enterprise/rbac/members/:id` | 会员 | 读 | session(会话) | id |  |  | data |
| `Rbac_setMemberStatus` | POST | `/enterprise/rbac/members/:id/status` | 设置会员状态 | 写 | session(会话) | id |  | status | data |
| `Rbac_operationLogs` | GET | `/enterprise/rbac/operation-logs` | OPERATION日志 | 读 | session(会话) |  | module, actorUserId, status, page, pageSize |  | data |

返回 `INDEX.md`。

