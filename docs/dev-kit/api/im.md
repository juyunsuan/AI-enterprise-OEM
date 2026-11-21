<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：IM 连接（`im`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Im_connectors` | GET | `/enterprise/im/connectors` | 连接器 | 读 | session(会话) |  |  |  | data |
| `Im_saveConnector` | POST | `/enterprise/im/connectors` | 保存连接器 | 写 | session(会话) |  |  | id, provider, name, corpId, appId, appSecret, agentId, contactSecret, verificationToken, encryptKey, status, scopes | data |
| `Im_deleteConnector` | DELETE | `/enterprise/im/connectors/:id` | 删除连接器 | 写 | session(会话) | id |  |  | data |
| `Im_approvalTemplates` | GET | `/enterprise/im/connectors/:id/approval-templates` | 审批模板 | 读 | session(会话) | id |  |  | data |
| `Im_bindings` | GET | `/enterprise/im/connectors/:id/bindings` | 绑定 | 读 | session(会话) | id |  |  | data |
| `Im_saveBinding` | POST | `/enterprise/im/connectors/:id/bindings` | 保存绑定 | 写 | session(会话) | id |  | id, module, objectKey, direction, config, fieldMap, enabled | data |
| `Im_deleteBinding` | DELETE | `/enterprise/im/connectors/:id/bindings/:bindingId` | 删除绑定 | 写 | session(会话) | id, bindingId |  |  | data |
| `Im_bindingTest` | POST | `/enterprise/im/connectors/:id/bindings/test` | 测试绑定 | 写 | session(会话) | id |  | module, config | data |
| `Im_departments` | GET | `/enterprise/im/connectors/:id/departments` | 部门 | 读 | session(会话) | id |  |  | data |
| `Im_saveDeptLink` | POST | `/enterprise/im/connectors/:id/departments` | 保存部门短链 | 写 | session(会话) | id |  | department, externalDeptId, name, parentExternalId | data |
| `Im_retryEvent` | POST | `/enterprise/im/connectors/:id/events/:eventId/retry` | 重试事件 | 写 | session(会话) | id, eventId |  |  | data |
| `Im_syncLogs` | GET | `/enterprise/im/connectors/:id/logs` | 同步日志 | 读 | session(会话) | id | page, pageSize |  | data |
| `Im_members` | GET | `/enterprise/im/connectors/:id/members` | 会员 | 读 | session(会话) | id |  |  | data |
| `Im_importMembers` | POST | `/enterprise/im/connectors/:id/members/import` | 导入会员 | 写 | session(会话) | id |  |  | data |
| `Im_inviteUnlinked` | POST | `/enterprise/im/connectors/:id/members/invite` | 邀请未绑定 | 写 | session(会话) | id |  | externalUserId, memberUserId | data |
| `Im_linkMember` | POST | `/enterprise/im/connectors/:id/members/link` | 短链会员 | 写 | session(会话) | id |  | memberUserId, externalUserId | data |
| `Im_unlinkMember` | POST | `/enterprise/im/connectors/:id/members/unlink` | 会员解绑 | 写 | session(会话) | id |  | linkId | data |
| `Im_notifyRules` | GET | `/enterprise/im/connectors/:id/notify` | 通知规则 | 读 | session(会话) | id |  |  | data |
| `Im_saveNotifyRules` | PUT | `/enterprise/im/connectors/:id/notify` | 保存通知规则 | 写 | session(会话) | id |  | rules, quietHours | data |
| `Im_testNotify` | POST | `/enterprise/im/connectors/:id/notify/test` | 测试通知 | 写 | session(会话) | id |  | target, chatId, memberUserId | data |
| `Im_publishApproval` | POST | `/enterprise/im/connectors/:id/publish-approval` | 发布审批 | 写 | session(会话) | id |  | templateKey, externalTemplateId | data |
| `Im_syncNow` | POST | `/enterprise/im/connectors/:id/sync` | 同步立即 | 写 | session(会话) | id |  | module | data |
| `Im_taskPublish` | POST | `/enterprise/im/connectors/:id/task-publish` | 发布任务 | 写 | session(会话) | id |  | planIds, tasklistId | data |
| `Im_testConnector` | POST | `/enterprise/im/connectors/:id/test` | 测试连接器 | 写 | session(会话) | id |  |  | data |
| `Im_overview` | GET | `/enterprise/im/overview` | 概览 | 读 | session(会话) |  |  |  | data |
| `Im_staffDirectory` | GET | `/enterprise/im/staff-directory` | 职员通讯录 | 读 | session(会话) |  | connectorId |  | data |

返回 `INDEX.md`。

