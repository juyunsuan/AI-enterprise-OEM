<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->

# 业务域：AI邮箱服务（`mail`）

> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。

| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |
|---|---|---|---|---|---|---|---|---|---|
| `Mail_accounts` | GET | `/enterprise/mail/accounts` | 邮箱账号列表 | 读 | session(会话) |  |  |  | data |
| `Mail_saveAccount` | POST | `/enterprise/mail/accounts` | 新建邮箱账号 | 写 | session(会话) |  |  |  | data |
| `Mail_removeAccount` | DELETE | `/enterprise/mail/accounts/:id` | 删除邮箱账号 | 写 | session(会话) | id |  |  | data |
| `Mail_updateAccount` | PUT | `/enterprise/mail/accounts/:id` | 修改邮箱账号 | 写 | session(会话) | id |  |  | data |
| `Mail_drafts` | GET | `/enterprise/mail/accounts/:id/drafts` | 草稿箱列表 | 读 | session(会话) | id | limit |  | data |
| `Mail_saveDraft` | POST | `/enterprise/mail/accounts/:id/drafts` | 生成回复草稿 | 写 | session(会话) | id |  |  | data |
| `Mail_messages` | GET | `/enterprise/mail/accounts/:id/messages` | 收件箱邮件列表 | 读 | session(会话) | id | folder, limit, offset, unreadOnly |  | data |
| `Mail_message` | GET | `/enterprise/mail/accounts/:id/messages/:key` | 查看邮件详情 | 读 | session(会话) | id, key | folder |  | data |
| `Mail_sendReply` | POST | `/enterprise/mail/accounts/:id/replies` | 发送邮件回复 | 写 | session(会话) | id |  |  | data |
| `Mail_testAccount` | POST | `/enterprise/mail/accounts/:id/test` | 测试邮箱连接 | 写 | session(会话) | id |  |  | data |
| `Mail_ledger` | GET | `/enterprise/mail/ledger` | 邮件处理台账 | 读 | session(会话) |  | mailboxId, limit |  | data |
| `Mail_scripts` | GET | `/enterprise/mail/scripts` | 话术列表 | 读 | session(会话) |  | mailboxId |  | data |
| `Mail_saveScript` | POST | `/enterprise/mail/scripts` | 新建话术 | 写 | session(会话) |  |  |  | data |
| `Mail_removeScript` | DELETE | `/enterprise/mail/scripts/:scriptId` | 删除话术 | 写 | session(会话) | scriptId |  |  | data |
| `Mail_updateScript` | PUT | `/enterprise/mail/scripts/:scriptId` | 修改话术 | 写 | session(会话) | scriptId |  |  | data |
| `MailTpl_templates` | GET | `/enterprise/mail/templates` | 模板 | 读 | session(会话) |  | q |  | data |
| `MailTpl_saveTemplate` | POST | `/enterprise/mail/templates` | 保存模板 | 写 | session(会话) |  |  | id, code, name, locale, subject, html, text, variables, enabled | data |
| `MailTpl_template` | GET | `/enterprise/mail/templates/:id` | 模板 | 读 | session(会话) | id |  |  | data |
| `MailTpl_previewTemplate` | POST | `/enterprise/mail/templates/preview` | 预览模板 | 写 | session(会话) |  |  | id, subject, html, text, variables | data |
| `MailTpl_removeTemplate` | POST | `/enterprise/mail/templates/remove` | 删除模板 | 写 | session(会话) |  |  | id | data |
| `MailTpl_sendTest` | POST | `/enterprise/mail/templates/send` | 测试发送 | 写 | session(会话) |  |  | id, mailboxId, to, variables | data |

返回 `INDEX.md`。

