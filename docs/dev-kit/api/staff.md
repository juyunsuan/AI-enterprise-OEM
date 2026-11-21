<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：职员与代理人（`staff`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Identity_staff` | GET | `/enterprise/staff` | 职员 | 读 | session(会话) |  |  |  | data |
| `Identity_bind` | POST | `/enterprise/staff` | 绑定 | 写 | session(会话) |  |  | staffUserId, roles | data |
| `Identity_unbind` | POST | `/enterprise/staff/:staffUserId/unbind` | 解绑 | 写 | session(会话) | staffUserId |  |  | data |
| `Identity_inbox` | GET | `/enterprise/staff/affiliations` | 收件箱 | 读 | session(会话) |  |  |  | data |
| `Identity_apply` | POST | `/enterprise/staff/affiliations` | 申请 | 写 | session(会话) |  |  | providerUserId, category | data |
| `Identity_cancelAffiliation` | DELETE | `/enterprise/staff/affiliations/:id` | 取消挂靠 | 写 | session(会话) | id |  |  | data |
| `Identity_auditAff` | POST | `/enterprise/staff/affiliations/:id/audit` | 审核挂靠 | 写 | session(会话) | id |  | action, note | data |
| `Identity_myAffiliations` | GET | `/enterprise/staff/affiliations/mine` | 我的挂靠 | 读 | session(会话) |  |  |  | data |
| `Identity_assign` | POST | `/enterprise/staff/assignments` | 指派 | 写 | session(会话) |  |  | enterpriseId, staffUserId | data |
| `Identity_cancelInvitation` | POST | `/enterprise/staff/invitations/:id/cancel` | 取消邀请 | 写 | session(会话) | id |  |  | data |
| `Identity_respondInvitation` | POST | `/enterprise/staff/invitations/:id/respond` | 响应邀请 | 写 | session(会话) | id |  | action | data |
| `Identity_myInvitations` | GET | `/enterprise/staff/invitations/mine` | 我的邀请 | 读 | session(会话) |  |  |  | data |
| `Identity_inviteStaff` | POST | `/enterprise/staff/invite` | 邀请职员 | 写 | session(会话) |  |  | staffUserId, categories | data |
| `Identity_joinable` | GET | `/enterprise/staff/joinable` | 可申请加入 | 读 | session(会话) |  |  |  | data |
| `Identity_myWork` | GET | `/enterprise/staff/my-work` | 我的工作 | 读 | session(会话) |  |  |  | data |
| `Identity_roles` | GET | `/enterprise/staff/roles` | 身份 | 读 | session(会话) |  |  |  | data |
| `Identity_search` | GET | `/enterprise/staff/search` | 搜索 | 读 | session(会话) |  | q |  | data |
| `Identity_selfUnbind` | POST | `/enterprise/staff/self-unbind/:providerUserId` | 解绑本人 | 写 | session(会话) | providerUserId |  |  | data |

返回 `INDEX.md`。

